// @vitest-environment node
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { LocalWorkspaceEnvironment } from '../../../services/localWorkspace';
import {
  createLocalWorkspaceStoreForTesting as createLocalWorkspaceStore,
} from '../../../services/localWorkspace/LocalWorkspaceStore';
import type {
  LocalWorkspaceStore,
  WorkspaceBootstrapResult,
  WorkspaceSnapshot,
} from '../../../services/localWorkspace/contracts';
import {
  createIndexedDbAdapter,
  type IndexedDbInspection,
} from '../../../services/localWorkspace/indexedDbAdapter';
import { captureLegacySnapshot } from '../../../services/localWorkspace/legacy';
import { digestLegacySnapshot } from '../../../services/localWorkspace/canonical';
import {
  reconstructWorkspace,
  reconstructWorkspaceRecords,
} from '../../../services/localWorkspace/migration';
import {
  decodeLegacyRecoveryBundle,
  prepareLegacyRecovery,
} from '../../../services/localWorkspace/recovery';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_DB_VERSION,
  storedProjectLineage,
  type StoredProject,
} from '../../../services/localWorkspace/schema';
import {
  LEGACY_DOCUMENT_KEYS,
  LEGACY_KEYS,
  MemoryStorage,
  currentState,
  legacyCustomPreset,
  legacyPendingImport,
  legacyProject,
  legacySnapshot,
  memoryStorage,
  secondProject,
  type LegacyDocumentKey,
  type LegacySnapshot,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const TEST_NOW = '2026-08-14T19:00:00.000Z';
const MIME = 'application/json;charset=utf-8';

beforeAll(() => Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
}));

afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

afterEach(() => vi.restoreAllMocks());

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new DOMException('Transaction aborted.', 'AbortError')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new DOMException('Transaction failed.', 'UnknownError')),
      { once: true },
    );
  });

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
};

interface TransactionRecord {
  stores: string[];
  mode: IDBTransactionMode;
}

type TransactionHook = (stores: string[], mode: IDBTransactionMode) => void;

const instrumentFactory = (
  indexedDB: IDBFactory,
  records: TransactionRecord[],
  hook?: TransactionHook,
): void => {
  const originalOpen = indexedDB.open.bind(indexedDB);
  const patched = new WeakSet<IDBDatabase>();
  indexedDB.open = ((name: string, version?: number) => {
    const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
    request.addEventListener('success', () => {
      const database = request.result;
      if (patched.has(database)) return;
      patched.add(database);
      const originalTransaction = database.transaction.bind(database);
      database.transaction = ((
        storeNames: string | string[],
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) => {
        const transaction = originalTransaction(storeNames, mode, options);
        const stores = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
        const effectiveMode = mode ?? 'readonly';
        records.push({ stores, mode: effectiveMode });
        hook?.(stores, effectiveMode);
        return transaction;
      }) as IDBDatabase['transaction'];
    });
    return request;
  }) as IDBFactory['open'];
};

interface HarnessOptions {
  indexedDB?: IDBFactory;
  storage?: MemoryStorage;
  values?: Record<string, string>;
  crypto?: Crypto;
  now?: () => string;
  randomUUID?: () => string;
  hook?: TransactionHook;
}

interface Harness {
  indexedDB: IDBFactory;
  storage: MemoryStorage;
  environment: LocalWorkspaceEnvironment;
  records: TransactionRecord[];
  dispatch(key: string | null): void;
  replace(values: Partial<Record<LegacyDocumentKey, string>>): void;
  setRecoveryFault(error?: unknown): void;
}

const NO_FAULT = Symbol('no-fault');

const createHarness = (options: HarnessOptions = {}): Harness => {
  const indexedDB = options.indexedDB ?? new IDBFactory();
  const records: TransactionRecord[] = [];
  instrumentFactory(indexedDB, records, options.hook);
  const storage = options.storage ?? memoryStorage(options.values ?? validLegacyValues());
  const listeners = new Set<(event: StorageEvent) => void>();
  let recoveryFault: unknown | typeof NO_FAULT = NO_FAULT;
  const environment: LocalWorkspaceEnvironment = {
    indexedDB,
    legacyStorage: storage,
    addStorageListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    crypto: options.crypto ?? webcrypto as unknown as Crypto,
    now: options.now ?? (() => TEST_NOW),
    randomUUID: options.randomUUID ?? (() => 'fixture-uuid'),
    createBlankProject: currentState,
    fault(point) {
      if (point === 'recovery.before-complete' && recoveryFault !== NO_FAULT) {
        throw recoveryFault;
      }
    },
  };
  return {
    indexedDB,
    storage,
    environment,
    records,
    dispatch(key) {
      for (const listener of listeners) listener({ key } as StorageEvent);
    },
    replace(values) {
      for (const key of LEGACY_DOCUMENT_KEYS) {
        storage.seed(key, Object.hasOwn(values, key) ? values[key] ?? null : null);
      }
    },
    setRecoveryFault(error = NO_FAULT) {
      recoveryFault = error;
    },
  };
};

type CurrentIndexedDbInspection = Omit<IndexedDbInspection, 'projects'> & {
  projects: StoredProject[];
};

const currentInspection = (inspection: IndexedDbInspection): CurrentIndexedDbInspection => {
  const { records } = reconstructWorkspaceRecords({
    projects: inspection.projects,
    workspace: inspection.workspace[0],
    presets: inspection.presets,
    pendingImports: inspection.pendingImports,
  });
  return { ...inspection, projects: records.projects };
};

const inspect = async (harness: Harness): Promise<CurrentIndexedDbInspection> => {
  const adapter = createIndexedDbAdapter({
    indexedDB: harness.indexedDB,
    now: () => TEST_NOW,
  });
  try {
    await adapter.open();
    return currentInspection(await adapter.inspect());
  } finally {
    adapter.close();
  }
};

const putRaw = async (
  harness: Harness,
  storeName: 'workspace' | 'migrationLedger' | 'presets' | 'pendingImports',
  value: unknown,
): Promise<void> => {
  const database = await requestResult(harness.indexedDB.open(WORKSPACE_DB_NAME));
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  database.close();
};

const readyStore = async (
  harness = createHarness(),
  onAuthorityLost = vi.fn(),
): Promise<{ store: LocalWorkspaceStore; snapshot: WorkspaceSnapshot }> => {
  const store = createLocalWorkspaceStore(harness.environment);
  const result = await store.bootstrap({ onAuthorityLost });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(`Expected ready, got ${result.status}.`);
  harness.records.length = 0;
  return { store, snapshot: result.snapshot };
};

const recoveryResult = (
  result: WorkspaceBootstrapResult,
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  expect(result.status).toBe('recovery');
  if (result.status !== 'recovery') throw new Error(`Expected recovery, got ${result.status}.`);
  return result;
};

const observeDrift = async (
  harness: Harness,
  store: LocalWorkspaceStore,
  values: Partial<Record<LegacyDocumentKey, string>>,
): Promise<Extract<WorkspaceBootstrapResult, { status: 'recovery' }>['recovery']> => {
  const onAuthorityLost = vi.fn();
  await store.bootstrap({ onAuthorityLost });
  harness.replace(values);
  harness.dispatch(LEGACY_KEYS.projects);
  await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalled());
  const result = onAuthorityLost.mock.calls.at(-1)?.[0] as WorkspaceBootstrapResult;
  return recoveryResult(result).recovery;
};

const bundleJson = async (blob: Blob): Promise<Record<string, unknown>> => {
  expect(blob.type).toBe(MIME);
  return JSON.parse(await blob.text()) as Record<string, unknown>;
};

const snapshotFromValues = (values: Partial<Record<LegacyDocumentKey, string>>): LegacySnapshot =>
  legacySnapshot(values);

const RECOVERED_CLONE_NAME = 'Recovered — Guarded recovery source';

const isRecoveredWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot =>
  value !== null
  && typeof value === 'object'
  && Array.isArray((value as WorkspaceSnapshot).projects)
  && Array.isArray((value as WorkspaceSnapshot).customPresets)
  && Array.isArray((value as WorkspaceSnapshot).pendingImports)
  && (value as WorkspaceSnapshot).projects.some(project => project.name === RECOVERED_CLONE_NAME);

describe('recovery bundle exports', () => {
  it('exports legacy-current without opening IndexedDB and preserves every raw byte and presence bit', async () => {
    const indexedDB = new IDBFactory();
    const open = vi.spyOn(indexedDB, 'open');
    const values = {
      [LEGACY_KEYS.projects]: ' [ { "name": "Café ☕ 😀" } ]\r\n',
      [LEGACY_KEYS.activeProject]: '',
      [LEGACY_KEYS.pendingImport]: 'null\n',
    };
    const harness = createHarness({ indexedDB, values });
    const store = createLocalWorkspaceStore(harness.environment);

    const blob = await store.exportRecoveryBundle('legacy-current');
    const bundle = await bundleJson(blob);

    expect(bundle).toMatchObject({
      format: 'doctect.legacy-workspace-recovery',
      version: 1,
      capturedAt: TEST_NOW,
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(decodeLegacyRecoveryBundle(bundle)).toEqual(captureLegacySnapshot(harness.storage));
    expect(decodeLegacyRecoveryBundle(bundle)).toEqual(snapshotFromValues(values));
    expect(open).not.toHaveBeenCalled();
    expect(harness.storage.mutations).toEqual([]);
  });

  it('rejects a changing legacy-current capture instead of exporting mixed reads', async () => {
    let changed = false;
    const storage = new MemoryStorage(validLegacyValues(), (readCount, current) => {
      if (!changed && readCount === LEGACY_DOCUMENT_KEYS.length) {
        changed = true;
        current.seed(LEGACY_KEYS.activeProject, 'changed-between-captures');
      }
    });
    const store = createLocalWorkspaceStore(createHarness({ storage }).environment);

    await expect(store.exportRecoveryBundle('legacy-current')).rejects.toMatchObject({
      category: 'legacy-changing',
      canRetry: true,
    });
  });

  it('rejects unavailable durable sources rather than returning empty bundles', async () => {
    const harness = createHarness({ values: {} });
    const store = createLocalWorkspaceStore(harness.environment);

    await expect(store.exportRecoveryBundle('legacy-original'))
      .rejects.toMatchObject({ code: 'unavailable' });
    await expect(store.exportRecoveryBundle('indexeddb-workspace'))
      .rejects.toMatchObject({ code: 'unavailable' });
    await expect(store.exportRecoveryBundle('legacy-current')).resolves.toBeInstanceOf(Blob);
  });

  it('exports exact current/original raw sources and an independently validated target', async () => {
    const original = validLegacyValues();
    const current = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Changed current source' }),
      ]),
      [LEGACY_KEYS.activeProject]: '',
    });
    const harness = createHarness({ values: original });
    const { store, snapshot } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, current);

    expect(recovery.availableExports).toEqual([
      'legacy-current',
      'legacy-original',
      'indexeddb-workspace',
    ]);
    const currentBundle = await bundleJson(await store.exportRecoveryBundle('legacy-current'));
    const originalBundle = await bundleJson(await store.exportRecoveryBundle('legacy-original'));
    const indexedBundle = await bundleJson(await store.exportRecoveryBundle('indexeddb-workspace'));

    expect(decodeLegacyRecoveryBundle(currentBundle)).toEqual(snapshotFromValues(current));
    expect(decodeLegacyRecoveryBundle(originalBundle)).toEqual(snapshotFromValues(original));
    expect(indexedBundle).toEqual({
      format: 'doctect.indexeddb-workspace-recovery',
      version: 1,
      capturedAt: TEST_NOW,
      workspace: snapshot,
    });
  });

  it('uses the original backup capture time instead of the export clock', async () => {
    const migratedAt = '2026-08-14T19:10:00.000Z';
    const exportedAt = '2026-08-14T20:20:00.000Z';
    let now = migratedAt;
    const harness = createHarness({ now: () => now });
    const { store } = await readyStore(harness);
    now = exportedAt;

    const original = await bundleJson(await store.exportRecoveryBundle('legacy-original'));
    const current = await bundleJson(await store.exportRecoveryBundle('legacy-current'));

    expect(original.capturedAt).toBe(migratedAt);
    expect(current.capturedAt).toBe(exportedAt);
  });

  it('does not advertise or export a malformed IndexedDB workspace', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const stored = await inspect(harness);
    await putRaw(harness, 'workspace', {
      ...stored.workspace[0],
      activeProjectId: 'missing-project',
    });

    await expect(store.exportRecoveryBundle('indexeddb-workspace'))
      .rejects.toMatchObject({ code: 'unavailable' });
    await expect(store.exportRecoveryBundle('legacy-original')).resolves.toBeInstanceOf(Blob);
    await expect(store.exportRecoveryBundle('legacy-current')).resolves.toBeInstanceOf(Blob);
  });
});

describe('explicit recover legacy as copies', () => {
  const prepareCloneGuardRecovery = async () => {
    const original = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
      [LEGACY_KEYS.activeProject]: 'project-a',
    });
    const current = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Guarded recovery source' }),
        secondProject(),
      ]),
      [LEGACY_KEYS.activeProject]: 'project-a',
    });
    const harness = createHarness({ values: original });
    const onAuthorityLost = vi.fn();
    const { store } = await readyStore(harness, onAuthorityLost);
    const recovery = await observeDrift(harness, store, current);
    onAuthorityLost.mockClear();
    return { harness, onAuthorityLost, recovery, store };
  };

  it('publishes successful recovery only after exactly three snapshot clones', async () => {
    const { onAuthorityLost, recovery, store } = await prepareCloneGuardRecovery();
    const originalStructuredClone = globalThis.structuredClone;
    let snapshotCloneOrdinal = 0;
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
      if (isRecoveredWorkspaceSnapshot(value)) snapshotCloneOrdinal += 1;
      return originalStructuredClone(value, options);
    });

    const recovered = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    expect(snapshotCloneOrdinal).toBe(3);
    expect(recovered.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: RECOVERED_CLONE_NAME }),
    ]));
    expect(onAuthorityLost).not.toHaveBeenCalled();
    cloneSpy.mockRestore();
    await expect(store.commit({
      type: 'close-project',
      projectId: 'project-b',
    })).resolves.toMatchObject({
      projects: expect.not.arrayContaining([expect.objectContaining({ id: 'project-b' })]),
    });
  });

  it.each([1, 2, 3])(
    'terminally loses authority at explicit recovery snapshot clone %i',
    async cloneToFail => {
      const { harness, onAuthorityLost, recovery, store } = await prepareCloneGuardRecovery();
      const originalStructuredClone = globalThis.structuredClone;
      let snapshotCloneOrdinal = 0;
      let injectedCloneOrdinal: number | undefined;
      const cloneSpy = vi.spyOn(globalThis, 'structuredClone')
        .mockImplementation((value, options) => {
          if (isRecoveredWorkspaceSnapshot(value)) {
            snapshotCloneOrdinal += 1;
            if (snapshotCloneOrdinal === cloneToFail) {
              injectedCloneOrdinal = snapshotCloneOrdinal;
              throw new DOMException(
                `Injected explicit recovery clone ${cloneToFail} failure.`,
                'DataCloneError',
              );
            }
          }
          return originalStructuredClone(value, options);
        });

      const failure = await store.commit({
        type: 'recover-legacy-as-copies',
        recoveryId: recovery.recoveryId,
      }).then(() => undefined, error => error);

      expect(injectedCloneOrdinal).toBe(cloneToFail);
      expect(snapshotCloneOrdinal).toBe(cloneToFail);
      expect(failure).toMatchObject({
        code: 'authority-lost',
        message: expect.stringMatching(/recovered durable state could not be (installed|published)/i),
      });
      expect(failure).not.toBeInstanceOf(DOMException);
      expect(onAuthorityLost).toHaveBeenCalledOnce();
      expect(onAuthorityLost).toHaveBeenCalledWith(expect.objectContaining({
        status: 'unavailable',
        availableExports: ['indexeddb-workspace'],
      }));
      cloneSpy.mockRestore();

      const committed = await inspect(harness);
      expect(committed.migrationLedger[0].unresolvedRecovery).toBeNull();
      const expectedRecoveredSnapshot = reconstructWorkspace({
        projects: committed.projects,
        workspace: committed.workspace[0],
        presets: committed.presets,
        pendingImports: committed.pendingImports,
      });
      const protectedBeforeForeignWrite = await (
        await store.exportRecoveryBundle('indexeddb-workspace')
      ).text();
      expect(JSON.parse(protectedBeforeForeignWrite)).toEqual({
        format: 'doctect.indexeddb-workspace-recovery',
        version: 1,
        capturedAt: TEST_NOW,
        workspace: expectedRecoveredSnapshot,
      });

      const writesBeforeRejectedClose = harness.records.filter(record =>
        record.mode === 'readwrite').length;
      await expect(store.commit({
        type: 'close-project',
        projectId: 'project-b',
      })).rejects.toMatchObject({ code: 'authority-lost' });
      expect(harness.records.filter(record => record.mode === 'readwrite'))
        .toHaveLength(writesBeforeRejectedClose);

      const foreign = createIndexedDbAdapter({
        indexedDB: harness.indexedDB,
        now: () => TEST_NOW,
      });
      const foreignProject = committed.projects.find(record => record.id === 'project-a')!;
      await foreign.saveProject({
        ...foreignProject.project,
        name: 'Foreign write after recovery clone failure',
      }, storedProjectLineage(foreignProject));
      foreign.close();
      const protectedAfterForeignWrite = await (
        await store.exportRecoveryBundle('indexeddb-workspace')
      ).text();
      expect(protectedAfterForeignWrite).toBe(protectedBeforeForeignWrite);

      await expect(store.bootstrap()).resolves.toMatchObject({
        status: 'ready',
        snapshot: {
          projects: expect.arrayContaining([
            expect.objectContaining({ name: 'Foreign write after recovery clone failure' }),
          ]),
        },
      });
      expect(onAuthorityLost).toHaveBeenCalledOnce();
      await expect(store.commit({
        type: 'close-project',
        projectId: 'project-b',
      })).resolves.toMatchObject({
        projects: expect.not.arrayContaining([expect.objectContaining({ id: 'project-b' })]),
      });
    },
  );

  it('copies only changed and new records, ignores deletions, strips cloud, and preserves target authority', async () => {
    const originalProjects = [
      legacyProject('project-a', 11, { name: 'Original A' }),
      legacyProject('deleted-by-old-tab', 11, { name: 'Must remain durable' }),
      legacyProject('unchanged', 11, { name: 'Unchanged' }),
    ];
    const originalPresets = [
      legacyCustomPreset('preset-a'),
      legacyCustomPreset('preset-deleted', 11, { title: 'Must remain' }),
    ];
    const original = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify(originalProjects),
      [LEGACY_KEYS.activeProject]: 'project-a',
      [LEGACY_KEYS.customPresets]: JSON.stringify(originalPresets),
    });
    const changedProject = legacyProject('project-a', 11, {
      name: 'Changed A',
      revision: 19,
      retainedWrapperField: { source: 'changed-old-tab' },
    });
    const newProject = legacyProject('new-from-old-tab', 11, { name: 'New C' });
    const current = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        changedProject,
        originalProjects[2],
        newProject,
      ]),
      [LEGACY_KEYS.activeProject]: 'new-from-old-tab',
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        originalPresets[0],
        legacyCustomPreset('preset-new', 11, { title: 'New preset' }),
      ]),
      [LEGACY_KEYS.pendingImport]: JSON.stringify(legacyPendingImport(11, {
        name: 'Changed pending import',
      })),
    });
    const harness = createHarness({ values: original });
    const { store } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, current);

    const snapshot = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    const recovered = snapshot.projects.filter(project => project.name.startsWith('Recovered — '));
    expect(recovered.map(project => project.name).sort()).toEqual([
      'Recovered — Changed A',
      'Recovered — New C',
    ]);
    expect(recovered).toEqual(expect.arrayContaining([
      expect.objectContaining({
        revision: 19,
        retainedWrapperField: { source: 'changed-old-tab' },
      }),
    ]));
    expect(recovered.every(project => project.cloud === undefined)).toBe(true);
    expect(recovered.every(project => !Object.hasOwn(project, 'consumedImportId'))).toBe(true);
    expect(snapshot.projects.find(project => project.id === 'deleted-by-old-tab')).toBeDefined();
    expect(snapshot.projects.filter(project => project.name === 'Recovered — Unchanged')).toEqual([]);
    expect(snapshot.activeProjectId).toBe('project-a');
    expect(snapshot.customPresets.map(preset => preset.title)).toEqual([
      'Résumé',
      'Must remain',
      'New preset',
    ]);
    expect(snapshot.pendingImports.at(-1)).toMatchObject({ name: 'Changed pending import' });
    expect(Object.hasOwn(snapshot.pendingImports.at(-1)!, 'cloud')).toBe(false);

    const stored = await inspect(harness);
    const recoveredIds = new Set(recovered.map(project => project.id));
    expect(stored.projects.filter(record => recoveredIds.has(record.id))
      .every(record => record.incarnation.length > 0)).toBe(true);
    expect(recovered.every(project => !Object.hasOwn(project, 'incarnation'))).toBe(true);
    expect(stored.workspace[0]).toMatchObject({
      activeProjectId: 'project-a',
      projectOrder: snapshot.projects.map(project => project.id),
      revision: 1,
    });
    expect(stored.migrationLedger[0]).toMatchObject({
      ledgerRevision: 3,
      acceptedLegacyDigest: stored.legacyBackup.find(backup => backup.kind === 'conflict')?.digest,
      acceptedLegacyBackupId: stored.legacyBackup.find(backup => backup.kind === 'conflict')?.id,
      unresolvedRecovery: null,
    });
    const conflict = stored.legacyBackup.find(backup => backup.kind === 'conflict');
    expect(conflict?.snapshot).toEqual(snapshotFromValues(current));
    expect(harness.storage.mutations).toEqual([]);
    expect(harness.records.some(record => record.mode === 'readwrite'
      && LEGACY_DOCUMENT_KEYS.every(() => record.stores.includes('migrationLedger')))).toBe(true);
    expect(harness.records.some(record => record.mode === 'readonly'
      && record.stores.includes('projects')
      && record.stores.includes('workspace'))).toBe(true);
  });

  it('appends recovered presets and imports after gapped persisted positions', async () => {
    const original = validLegacyValues({
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('preset-a', 11, { title: 'Original A' }),
        legacyCustomPreset('preset-b', 11, { title: 'Original B' }),
      ]),
    });
    const current = validLegacyValues({
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('preset-a', 11, { title: 'Original A' }),
        legacyCustomPreset('preset-b', 11, { title: 'Changed B' }),
        legacyCustomPreset('preset-c', 11, { title: 'New C' }),
      ]),
      [LEGACY_KEYS.pendingImport]: JSON.stringify(legacyPendingImport(11, {
        name: 'Changed pending import',
      })),
    });
    const harness = createHarness({ values: original });
    const { store } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, current);
    const storedBefore = await inspect(harness);
    const presetPositions = new Map([
      ['preset-a', 4],
      ['preset-b', 9],
    ]);
    for (const preset of storedBefore.presets) {
      await putRaw(harness, 'presets', {
        ...preset,
        position: presetPositions.get(preset.id),
      });
    }
    await putRaw(harness, 'pendingImports', {
      ...storedBefore.pendingImports[0],
      position: 7,
    });

    const snapshot = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    expect(snapshot.customPresets.map(preset => preset.title)).toEqual([
      'Original A',
      'Original B',
      'Changed B',
      'New C',
    ]);
    expect(snapshot.pendingImports.map(item => item.name)).toEqual([
      'Imported 😀',
      'Changed pending import',
    ]);
    const storedAfter = await inspect(harness);
    expect([...storedAfter.presets]
      .sort((left, right) => left.position - right.position)
      .map(record => [record.preset.title, record.position])).toEqual([
      ['Original A', 4],
      ['Original B', 9],
      ['Changed B', 10],
      ['New C', 11],
    ]);
    expect([...storedAfter.pendingImports]
      .sort((left, right) => left.position - right.position)
      .map(record => [record.pendingImport.name, record.position])).toEqual([
      ['Imported 😀', 7],
      ['Changed pending import', 8],
    ]);
  });

  it('generates collision-safe project, preset, import, and import-target IDs', async () => {
    const original = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a'),
        legacyProject('project-b'),
        legacyProject('proj_recovered_same-uuid', 11, { name: 'Project ID collision' }),
      ]),
      [LEGACY_KEYS.activeProject]: 'project-a',
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('preset-a'),
        legacyCustomPreset('preset-b'),
        legacyCustomPreset('preset_recovered_same-uuid', 11, {
          title: 'Preset ID collision',
        }),
      ]),
    });
    const current = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Changed A' }),
        legacyProject('project-b', 11, { name: 'Changed B' }),
        legacyProject('proj_recovered_same-uuid', 11, { name: 'Project ID collision' }),
      ]),
      [LEGACY_KEYS.activeProject]: 'project-a',
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('preset-a', 11, { title: 'Changed A' }),
        legacyCustomPreset('preset-b', 11, { title: 'Changed B' }),
        legacyCustomPreset('preset_recovered_same-uuid', 11, {
          title: 'Preset ID collision',
        }),
      ]),
      [LEGACY_KEYS.pendingImport]: JSON.stringify(legacyPendingImport(11, {
        name: 'Changed import',
      })),
    });
    const harness = createHarness({ values: original, randomUUID: () => 'same-uuid' });
    const { store } = await readyStore(harness);
    await store.commit({
      type: 'stage-import',
      pendingImport: {
        id: 'import_recovered_same-uuid',
        targetProjectId: 'proj_recovered_import_same-uuid',
        name: 'Import ID collision',
        state: currentState(),
        createdAt: TEST_NOW,
      },
    });
    const recovery = await observeDrift(harness, store, current);

    const snapshot = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    expect(new Set(snapshot.projects.map(project => project.id)).size).toBe(snapshot.projects.length);
    expect(new Set(snapshot.customPresets.map(preset => preset.id)).size)
      .toBe(snapshot.customPresets.length);
    expect(new Set(snapshot.pendingImports.map(item => item.id)).size)
      .toBe(snapshot.pendingImports.length);
    expect(new Set(snapshot.pendingImports.map(item => item.targetProjectId)).size)
      .toBe(snapshot.pendingImports.length);
  });

  it('reserves current and accepted legacy source-only IDs before generating copies', async () => {
    const acceptedProjectId = 'proj_recovered_accepted-project-token';
    const acceptedTargetId = 'proj_recovered_import_target-token';
    const acceptedImportId = 'import_recovered_import-token';
    const currentProjectId = 'proj_recovered_project-token';
    const acceptedPresetId = 'preset_recovered_accepted-preset-token';
    const currentPresetId = 'preset_recovered_preset-token';
    const original = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a'),
        legacyProject(acceptedProjectId),
        legacyProject(acceptedTargetId),
        legacyProject(acceptedImportId),
      ]),
      [LEGACY_KEYS.activeProject]: 'project-a',
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('preset-a'),
        legacyCustomPreset(acceptedPresetId),
      ]),
    });
    let recoveryIds: string[] | undefined;
    const harness = createHarness({
      values: original,
      randomUUID: () => recoveryIds?.shift() ?? 'marker-uuid',
    });
    const { store } = await readyStore(harness);
    await store.commit({ type: 'close-project', projectId: acceptedProjectId });
    await store.commit({ type: 'close-project', projectId: acceptedTargetId });
    await store.commit({ type: 'close-project', projectId: acceptedImportId });
    await store.commit({ type: 'delete-custom-preset', presetId: acceptedPresetId });
    await store.commit({
      type: 'stage-import',
      pendingImport: {
        id: 'durable-existing-import',
        targetProjectId: 'durable-import-target',
        name: 'Durable collision',
        state: currentState(),
        createdAt: TEST_NOW,
      },
    });
    const current = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Changed A' }),
        legacyProject(currentProjectId, 11, { name: 'Current source-only project' }),
      ]),
      [LEGACY_KEYS.activeProject]: 'project-a',
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('preset-a', 11, { title: 'Changed A' }),
        legacyCustomPreset(currentPresetId, 11, { title: 'Current source-only preset' }),
      ]),
      [LEGACY_KEYS.pendingImport]: JSON.stringify(legacyPendingImport(11, {
        name: 'Changed pending import',
      })),
    });
    const recovery = await observeDrift(harness, store, current);
    recoveryIds = [
      'project-token',
      'accepted-project-token',
      'preset-token',
      'accepted-preset-token',
      'import-token',
      'target-token',
    ];

    const snapshot = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    const sourceProjectIds = new Set([
      'project-a',
      acceptedProjectId,
      acceptedTargetId,
      acceptedImportId,
      currentProjectId,
    ]);
    const recoveredProjects = snapshot.projects.filter(project =>
      project.name.startsWith('Recovered — '));
    expect(recoveredProjects).toHaveLength(2);
    expect(recoveredProjects.every(project => !sourceProjectIds.has(project.id))).toBe(true);
    const sourcePresetIds = new Set(['preset-a', acceptedPresetId, currentPresetId]);
    const recoveredPresets = snapshot.customPresets.filter(preset =>
      preset.title === 'Changed A' || preset.title === 'Current source-only preset');
    expect(recoveredPresets.every(preset => !sourcePresetIds.has(preset.id))).toBe(true);
    const recoveredImport = snapshot.pendingImports.at(-1)!;
    expect(sourceProjectIds.has(recoveredImport.id)).toBe(false);
    expect(sourceProjectIds.has(recoveredImport.targetProjectId)).toBe(false);
  });

  it('requires explicit confirmation for active-only drift without creating copies', async () => {
    const values = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
      [LEGACY_KEYS.activeProject]: 'project-a',
    });
    const current = { ...values, [LEGACY_KEYS.activeProject]: 'project-b' };
    const harness = createHarness({ values });
    const { store, snapshot: before } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, current);

    const after = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    expect(after.projects).toEqual(before.projects);
    expect(after.customPresets).toEqual(before.customPresets);
    expect(after.pendingImports).toEqual(before.pendingImports);
    expect(after.activeProjectId).toBe(before.activeProjectId);
    expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
      ledgerRevision: 3,
      unresolvedRecovery: null,
    });
  });

  it('rejects malformed changed source without salvaging records or clearing recovery', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const malformed = validLegacyValues({ [LEGACY_KEYS.projects]: '{' });
    const recovery = await observeDrift(harness, store, malformed);
    expect(recovery).toMatchObject({
      availableExports: [
        'legacy-current',
        'legacy-original',
        'indexeddb-workspace',
      ],
      canRecoverLegacyAsCopies: false,
    });
    const before = await inspect(harness);

    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    })).rejects.toMatchObject({ code: 'validation' });

    const after = await inspect(harness);
    expect(after).toEqual(before);
    const raw = await bundleJson(await store.exportRecoveryBundle('legacy-current'));
    expect(decodeLegacyRecoveryBundle(raw)[LEGACY_KEYS.projects]).toEqual({
      present: true,
      raw: '{',
    });
  });

  it('rejects inherited-root recovery input before opening a recovery write', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const inheritedRoot = legacyProject('project-a', 11, {
      initialState: { ...currentState(), nodes: {}, rootId: 'toString' },
    });
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([inheritedRoot]),
    }));
    const before = await inspect(harness);
    const writesBefore = harness.records.filter(record => record.mode === 'readwrite').length;

    expect(recovery.canRecoverLegacyAsCopies).toBe(false);
    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    })).rejects.toMatchObject({ code: 'validation' });

    expect(harness.records.filter(record => record.mode === 'readwrite')).toHaveLength(writesBefore);
    expect(await inspect(harness)).toEqual(before);
  });

  it('does not advertise copy recovery after legacy changes behind the persisted marker', async () => {
    const changedAgain = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Changed again' }),
      ]),
    });
    let changeAfterMarker = false;
    const storage = new MemoryStorage(validLegacyValues(), (readCount, source) => {
      if (changeAfterMarker && readCount === LEGACY_DOCUMENT_KEYS.length * 4) {
        source.seed(LEGACY_KEYS.projects, changedAgain[LEGACY_KEYS.projects] ?? null);
      }
    });
    const harness = createHarness({ storage });
    const { store } = await readyStore(harness);
    storage.reads.length = 0;
    changeAfterMarker = true;

    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));

    expect(recovery.canRecoverLegacyAsCopies).toBe(false);
    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('checks recovery ID and observed source digest before writing', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const firstDrift = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    });
    const recovery = await observeDrift(harness, store, firstDrift);
    const before = await inspect(harness);

    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: `${recovery.recoveryId}-stale`,
    })).rejects.toMatchObject({ code: 'conflict' });

    harness.replace(validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Changed again' }),
      ]),
    }));
    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    })).rejects.toMatchObject({ code: 'conflict' });
    expect((await inspect(harness)).migrationLedger[0].ledgerRevision)
      .toBe(before.migrationLedger[0].ledgerRevision);
  });

  it('aborts the complete recovery transaction without partial copies', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));
    const before = await inspect(harness);
    harness.setRecoveryFault(new DOMException('No space.', 'QuotaExceededError'));

    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    })).rejects.toMatchObject({ code: 'quota' });

    expect(await inspect(harness)).toEqual(before);
    expect(harness.storage.mutations).toEqual([]);
  });

  it('independently validates the target after recovery transaction commit', async () => {
    const allStores = [
      'projects',
      'workspace',
      'presets',
      'pendingImports',
      'migrationLedger',
      'legacyBackup',
    ];
    const workspaceStores = ['projects', 'workspace', 'presets', 'pendingImports'];
    let armed = false;
    let recoveryWriteStarted = false;
    let failPostRecoveryRead = true;
    const harness = createHarness({
      hook(stores, mode) {
        if (armed
          && mode === 'readwrite'
          && allStores.every(store => stores.includes(store))) {
          recoveryWriteStarted = true;
        }
        if (recoveryWriteStarted
          && failPostRecoveryRead
          && mode === 'readonly'
          && workspaceStores.every(store => stores.includes(store))) {
          failPostRecoveryRead = false;
          throw new Error('Injected post-recovery read failure.');
        }
      },
    });
    const onAuthorityLost = vi.fn();
    const { store } = await readyStore(harness, onAuthorityLost);
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));
    onAuthorityLost.mockClear();
    armed = true;

    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    })).rejects.toMatchObject({
      code: 'authority-lost',
      cause: expect.objectContaining({ code: 'io' }),
    });
    expect(onAuthorityLost).toHaveBeenCalledOnce();
    expect(onAuthorityLost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable',
      availableExports: [],
    }));

    const committed = await inspect(harness);
    expect(committed.migrationLedger[0].unresolvedRecovery).toBeNull();
    expect(committed.projects.some(record => record.project.name.startsWith('Recovered — ')))
      .toBe(true);
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
  });

  it('retains a concurrent post-commit marker when legacy bytes ABA-revert', async () => {
    const hashStarted = deferred();
    const releaseHash = deferred();
    let armed = false;
    let armOnRecoveryWrite = false;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (armed && text.includes('doctect-legacy-source')) {
            armed = false;
            hashStarted.resolve();
            await releaseHash.promise;
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const allStores = [
      'projects',
      'workspace',
      'presets',
      'pendingImports',
      'migrationLedger',
      'legacyBackup',
    ];
    const harness = createHarness({
      crypto,
      hook(stores, mode) {
        if (armOnRecoveryWrite
          && mode === 'readwrite'
          && allStores.every(store => stores.includes(store))) {
          armed = true;
        }
      },
    });
    const onAuthorityLost = vi.fn();
    const { store } = await readyStore(harness, onAuthorityLost);
    const accepted = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Accepted recovery source' }),
      ]),
    });
    const recovery = await observeDrift(harness, store, accepted);
    onAuthorityLost.mockClear();
    armOnRecoveryWrite = true;
    const commit = store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });
    await hashStarted.promise;
    const intermediate = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Concurrent intermediate source' }),
      ]),
    });
    harness.replace(intermediate);
    harness.dispatch(LEGACY_KEYS.projects);
    const intermediateDigest = await digestLegacySnapshot(
      captureLegacySnapshot(harness.storage),
      webcrypto.subtle as unknown as SubtleCrypto,
    );
    const concurrentMarker = {
      id: 'concurrent-post-commit-marker',
      kind: 'legacy-drift' as const,
      detectedAt: TEST_NOW,
      observedLegacyDigest: intermediateDigest,
    };
    const adapter = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => TEST_NOW,
    });
    await adapter.open();
    const resolvedLedger = (await adapter.inspect()).migrationLedger[0];
    if (!resolvedLedger) throw new Error('Expected resolved recovery ledger.');
    await adapter.markLegacyDrift({
      expectedLedgerRevision: resolvedLedger.ledgerRevision,
      expectedAcceptedLegacyDigest: resolvedLedger.acceptedLegacyDigest,
      expectedRecoveryId: null,
      marker: concurrentMarker,
    });
    adapter.close();
    harness.replace(accepted);
    harness.dispatch(LEGACY_KEYS.projects);
    releaseHash.resolve();
    await commit;

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalled());
    const result = recoveryResult(
      onAuthorityLost.mock.calls.at(-1)?.[0] as WorkspaceBootstrapResult,
    );
    expect(result.recovery).toMatchObject({
      recoveryId: concurrentMarker.id,
      kind: 'split-brain',
    });
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery)
      .toEqual(concurrentMarker);
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
  });

  it('keeps recovery open when late drift reverts during capability hashing', async () => {
    const hashStarted = deferred();
    const releaseHash = deferred();
    const capabilityHashStarted = deferred();
    const releaseCapabilityHash = deferred();
    let armed = false;
    let armOnRecoveryWrite = false;
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (armed && text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 3) {
              hashStarted.resolve();
              await releaseHash.promise;
            }
            if (legacyDigestCalls === 12) {
              capabilityHashStarted.resolve();
              await releaseCapabilityHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const allStores = [
      'projects',
      'workspace',
      'presets',
      'pendingImports',
      'migrationLedger',
      'legacyBackup',
    ];
    const harness = createHarness({
      crypto,
      hook(stores, mode) {
        if (armOnRecoveryWrite
          && mode === 'readwrite'
          && allStores.every(store => stores.includes(store))) {
          armed = true;
        }
      },
    });
    const { store } = await readyStore(harness);
    const accepted = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'First recovery source' }),
      ]),
    });
    const firstRecovery = await observeDrift(harness, store, accepted);
    armOnRecoveryWrite = true;
    const commit = store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: firstRecovery.recoveryId,
    });
    await hashStarted.promise;
    const latest = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Late recovery source' }),
      ]),
    });

    harness.replace(latest);
    harness.dispatch(LEGACY_KEYS.projects);
    releaseHash.resolve();
    await capabilityHashStarted.promise;
    harness.replace(accepted);
    harness.dispatch(LEGACY_KEYS.projects);
    releaseCapabilityHash.resolve();
    await commit;

    const result = recoveryResult(await store.bootstrap());
    expect(result.recovery.kind).toBe('split-brain');
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery).not.toBeNull();
  });

  it('keeps lifecycle unavailable when versionchange occurs during post-recovery hash', async () => {
    const hashStarted = deferred();
    const releaseHash = deferred();
    let armed = false;
    let armOnRecoveryWrite = false;
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (armed && text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 3) {
              hashStarted.resolve();
              await releaseHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const allStores = [
      'projects',
      'workspace',
      'presets',
      'pendingImports',
      'migrationLedger',
      'legacyBackup',
    ];
    const harness = createHarness({
      crypto,
      hook(stores, mode) {
        if (armOnRecoveryWrite
          && mode === 'readwrite'
          && allStores.every(store => stores.includes(store))) {
          armed = true;
        }
      },
    });
    const { store } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));
    armOnRecoveryWrite = true;
    const commit = store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });
    const settledCommit = commit.then(() => undefined, () => undefined);
    await hashStarted.promise;

    const upgraded = await requestResult(harness.indexedDB.open(
      WORKSPACE_DB_NAME,
      WORKSPACE_DB_VERSION + 1,
    ));
    releaseHash.resolve();
    await settledCommit;

    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'unavailable' });
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    upgraded.close();
  });

  it('preserves existing private consume provenance without exposing or inventing it', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const staged = await store.commit({
      type: 'stage-import',
      pendingImport: {
        id: 'private-import',
        targetProjectId: 'private-target',
        name: 'Private target',
        state: currentState(),
        createdAt: TEST_NOW,
      },
    });
    expect(staged.pendingImports.some(item => item.id === 'private-import')).toBe(true);
    await store.commit({ type: 'consume-import', importId: 'private-import' });
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));

    const recovered = await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: recovery.recoveryId,
    });

    const records = (await inspect(harness)).projects;
    const privateTarget = records.find(record => record.id === 'private-target');
    expect(privateTarget?.consumedImportId).toBe('private-import');
    expect(privateTarget?.consumedImportCreatedAt).toBe(TEST_NOW);
    expect(privateTarget?.consumedImportDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(records.filter(record => record.id !== 'private-target')
      .every(record => record.consumedImportId === undefined
        && record.consumedImportCreatedAt === undefined
        && record.consumedImportDigest === undefined)).toBe(true);
    expect(recovered.projects.every(project => !Object.hasOwn(project, 'consumedImportId')))
      .toBe(true);
    expect(recovered.projects.every(project => !Object.hasOwn(project, 'consumedImportDigest')))
      .toBe(true);
  });

  it('reopens recovery when legacy drifts again immediately after resolution', async () => {
    const harness = createHarness();
    const recurrentLost = vi.fn();
    const { store } = await readyStore(harness, recurrentLost);
    const first = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'First drift' }),
      ]),
    });
    const firstRecovery = await observeDrift(harness, store, first);
    recurrentLost.mockClear();
    await store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: firstRecovery.recoveryId,
    });
    const second = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Second drift' }),
      ]),
    });
    harness.replace(second);

    harness.dispatch(LEGACY_KEYS.projects);

    await vi.waitFor(() => expect(recurrentLost).toHaveBeenCalled());
    const secondRecovery = recoveryResult(
      recurrentLost.mock.calls.at(-1)?.[0] as WorkspaceBootstrapResult,
    ).recovery;
    expect(secondRecovery.recoveryId).not.toBe(firstRecovery.recoveryId);
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery).toMatchObject({
      id: secondRecovery.recoveryId,
      kind: 'legacy-drift',
    });
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
  });

  it('rejects an invalid generated target before opening the recovery transaction', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));
    const stored = await inspect(harness);
    const currentSource = captureLegacySnapshot(harness.storage);
    const currentDigest = await digestLegacySnapshot(
      currentSource,
      harness.environment.crypto.subtle,
    );
    const accepted = stored.legacyBackup.find(backup =>
      backup.id === stored.migrationLedger[0].acceptedLegacyBackupId)!;
    const prepared = await prepareLegacyRecovery(
      currentSource,
      currentDigest,
      accepted.snapshot,
      stored.migrationLedger[0],
      {
        projects: stored.projects,
        workspace: stored.workspace[0],
        presets: stored.presets,
        pendingImports: stored.pendingImports,
      },
      recovery.recoveryId,
      {
        crypto: harness.environment.crypto,
        now: () => TEST_NOW,
        randomUUID: () => 'invalid-target-uuid',
      },
    );
    prepared.projects[0].project.id = 'mismatched-generated-id';
    const writesBefore = harness.records.filter(record => record.mode === 'readwrite').length;
    const adapter = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => TEST_NOW,
    });

    await expect(adapter.recoverLegacyAsCopies(prepared)).rejects.toBeDefined();
    adapter.close();

    expect(harness.records.filter(record => record.mode === 'readwrite')).toHaveLength(writesBefore);
    expect(await inspect(harness)).toEqual(stored);
  });

  it('rejects recovery after ledger revision changes behind the command', async () => {
    const harness = createHarness();
    const { store } = await readyStore(harness);
    const recovery = await observeDrift(harness, store, validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));
    const stored = await inspect(harness);
    const currentSource = captureLegacySnapshot(harness.storage);
    const currentDigest = await digestLegacySnapshot(
      currentSource,
      harness.environment.crypto.subtle,
    );
    const accepted = stored.legacyBackup.find(backup =>
      backup.id === stored.migrationLedger[0].acceptedLegacyBackupId)!;
    const prepared = await prepareLegacyRecovery(
      currentSource,
      currentDigest,
      accepted.snapshot,
      stored.migrationLedger[0],
      {
        projects: stored.projects,
        workspace: stored.workspace[0],
        presets: stored.presets,
        pendingImports: stored.pendingImports,
      },
      recovery.recoveryId,
      {
        crypto: harness.environment.crypto,
        now: () => TEST_NOW,
        randomUUID: () => 'stale-revision-uuid',
      },
    );
    await putRaw(harness, 'migrationLedger', {
      ...stored.migrationLedger[0],
      ledgerRevision: stored.migrationLedger[0].ledgerRevision + 1,
    });
    const adapter = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => TEST_NOW,
    });

    await expect(adapter.recoverLegacyAsCopies(prepared))
      .rejects.toMatchObject({ code: 'conflict' });
    adapter.close();
  });
});
