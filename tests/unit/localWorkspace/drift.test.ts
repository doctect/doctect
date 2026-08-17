// @vitest-environment node
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import {
  IDBFactory,
  IDBVersionChangeEvent as FakeIDBVersionChangeEvent,
} from 'fake-indexeddb';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createLocalWorkspaceStore,
  type LocalWorkspaceEnvironment,
} from '../../../services/localWorkspace';
import type {
  LocalWorkspaceStore,
  WorkspaceBootstrapResult,
  WorkspaceProject,
} from '../../../services/localWorkspace/contracts';
import {
  createIndexedDbAdapter,
  type IndexedDbInspection,
} from '../../../services/localWorkspace/indexedDbAdapter';
import { captureLegacySnapshot } from '../../../services/localWorkspace/legacy';
import { digestLegacySnapshot } from '../../../services/localWorkspace/canonical';
import {
  WORKSPACE_DB_NAME,
} from '../../../services/localWorkspace/schema';
import { inheritInstalledProjectAuthority } from '../../../services/localWorkspace/projectAuthority';
import {
  LEGACY_DOCUMENT_KEYS,
  LEGACY_KEYS,
  MemoryStorage,
  currentState,
  legacyProject,
  memoryStorage,
  secondProject,
  type LegacyDocumentKey,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const TEST_NOW = '2026-08-14T18:00:00.000Z';

beforeAll(() => Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
}));

afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });

interface HarnessOptions {
  indexedDB?: IDBFactory;
  storage?: MemoryStorage;
  values?: Record<string, string>;
  crypto?: Crypto;
  onMonitorInstalled?: (listener: (event: StorageEvent) => void) => void;
  fault?: LocalWorkspaceEnvironment['fault'];
}

interface Harness {
  indexedDB: IDBFactory;
  storage: MemoryStorage;
  environment: LocalWorkspaceEnvironment;
  dispatch(key: string | null): void;
  replace(values: Partial<Record<LegacyDocumentKey, string>>): void;
}

const createHarness = (options: HarnessOptions = {}): Harness => {
  const indexedDB = options.indexedDB ?? new IDBFactory();
  const storage = options.storage ?? memoryStorage(options.values ?? validLegacyValues());
  const listeners = new Set<(event: StorageEvent) => void>();
  const environment: LocalWorkspaceEnvironment = {
    indexedDB,
    legacyStorage: storage,
    addStorageListener(listener) {
      listeners.add(listener);
      options.onMonitorInstalled?.(listener);
      return () => listeners.delete(listener);
    },
    crypto: options.crypto ?? webcrypto as unknown as Crypto,
    now: () => TEST_NOW,
    randomUUID: () => 'fixture-uuid',
    createBlankProject: currentState,
    fault: options.fault,
  };
  return {
    indexedDB,
    storage,
    environment,
    dispatch(key) {
      for (const listener of listeners) listener({ key } as StorageEvent);
    },
    replace(values) {
      for (const key of LEGACY_DOCUMENT_KEYS) {
        storage.seed(key, Object.hasOwn(values, key) ? values[key] ?? null : null);
      }
    },
  };
};

const inspect = async (harness: Harness): Promise<IndexedDbInspection> => {
  const adapter = createIndexedDbAdapter({
    indexedDB: harness.indexedDB,
    now: () => TEST_NOW,
  });
  try {
    await adapter.open();
    return await adapter.inspect();
  } finally {
    adapter.close();
  }
};

const readyStore = async (
  harness = createHarness(),
  onAuthorityLost = vi.fn(),
): Promise<{
  store: LocalWorkspaceStore;
  onAuthorityLost: ReturnType<typeof vi.fn>;
  project: WorkspaceProject;
}> => {
  const store = createLocalWorkspaceStore(harness.environment);
  const result = await store.bootstrap({ onAuthorityLost });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(`Expected ready, got ${result.status}.`);
  return { store, onAuthorityLost, project: result.snapshot.projects[0] };
};

const projectNamed = (name: string): WorkspaceProject =>
  legacyProject('project-a', 11, { name }) as WorkspaceProject;

const trustedProjectNamed = (source: WorkspaceProject, name: string): WorkspaceProject => {
  const project = { ...source, name };
  inheritInstalledProjectAuthority(project, source);
  return project;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
};

const instrumentTransactionCompletion = (
  indexedDB: IDBFactory,
  onComplete: (
    database: IDBDatabase,
    stores: string[],
    mode: IDBTransactionMode,
  ) => void,
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
        transaction.addEventListener('complete', () => {
          onComplete(database, stores, mode ?? 'readonly');
        }, { once: true });
        return transaction;
      }) as IDBDatabase['transaction'];
    });
    return request;
  }) as IDBFactory['open'];
};

const recoveryResult = (
  result: WorkspaceBootstrapResult,
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  expect(result.status).toBe('recovery');
  if (result.status !== 'recovery') throw new Error(`Expected recovery, got ${result.status}.`);
  return result;
};

describe('old-tab drift lifecycle', () => {
  it('drains accepted saves before persisting drift, rejects new work, and reports split brain', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const harness = createHarness();
    const { store, onAuthorityLost, project } = await readyStore(harness);
    const accepted = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(project, 'Latest durable'),
    });
    const changedValues = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Old tab edit' }),
      ]),
    });
    harness.replace(changedValues);

    harness.dispatch(LEGACY_KEYS.projects);

    await expect(store.commit({
      type: 'save-project',
      project: trustedProjectNamed(project, 'Must be rejected'),
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(onAuthorityLost).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(accepted).resolves.toMatchObject({
      projects: expect.arrayContaining([expect.objectContaining({ name: 'Latest durable' })]),
    });
    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalledOnce());

    expect(onAuthorityLost).toHaveBeenCalledWith({
      status: 'recovery',
      recovery: expect.objectContaining({
        kind: 'split-brain',
        category: 'legacy-drift',
        recoveryId: expect.any(String),
        availableExports: [
          'legacy-current',
          'legacy-original',
          'indexeddb-workspace',
        ],
        canRecoverLegacyAsCopies: true,
      }),
    });
    const stored = await inspect(harness);
    const observedDigest = await digestLegacySnapshot(
      captureLegacySnapshot(harness.storage),
      harness.environment.crypto.subtle,
    );
    expect(stored.projects.find(record => record.id === 'project-a')).toMatchObject({
      project: { name: 'Latest durable' },
      storageRevision: 1,
    });
    expect(stored.migrationLedger[0]).toMatchObject({
      ledgerRevision: 2,
      unresolvedRecovery: {
        id: expect.any(String),
        kind: 'legacy-drift',
        detectedAt: TEST_NOW,
        observedLegacyDigest: observedDigest,
      },
    });
    expect(harness.storage.mutations).toEqual([]);
  });

  it.each([
    ['matching key', LEGACY_KEYS.projects],
    ['storage clear notification', null],
  ] as const)('restores ready authority after a byte-identical %s event', async (_label, key) => {
    const harness = createHarness();
    const { store, onAuthorityLost } = await readyStore(harness);

    harness.dispatch(key);

    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    expect(onAuthorityLost).not.toHaveBeenCalled();
    expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
      ledgerRevision: 1,
      unresolvedRecovery: null,
    });
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).resolves.toMatchObject({ activeProjectId: 'project-a' });
  });

  it('revalidates a byte-identical event that arrives during the final ready hash', async () => {
    const hashStarted = deferred();
    const releaseHash = deferred();
    let armed = false;
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (armed && text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 6) {
              hashStarted.resolve();
              await releaseHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const harness = createHarness({ crypto });
    const { store, onAuthorityLost } = await readyStore(harness);
    armed = true;

    harness.dispatch(LEGACY_KEYS.projects);
    await hashStarted.promise;
    harness.dispatch(LEGACY_KEYS.projects);
    releaseHash.resolve();

    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    expect(legacyDigestCalls).toBeGreaterThan(6);
    expect(onAuthorityLost).not.toHaveBeenCalled();
  });

  it('rehashes live legacy before publishing a drift marker', async () => {
    const hashStarted = deferred();
    const releaseHash = deferred();
    let armed = false;
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (armed && text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 6) {
              hashStarted.resolve();
              await releaseHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const harness = createHarness({ crypto });
    const { onAuthorityLost } = await readyStore(harness);
    const first = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'First observed drift' }),
      ]),
    });
    const latest = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Latest observed drift' }),
      ]),
    });
    armed = true;
    harness.replace(first);
    harness.dispatch(LEGACY_KEYS.projects);
    await hashStarted.promise;

    harness.replace(latest);
    harness.dispatch(LEGACY_KEYS.projects);
    releaseHash.resolve();

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalled());
    const latestDigest = await digestLegacySnapshot(
      captureLegacySnapshot(harness.storage),
      webcrypto.subtle as unknown as SubtleCrypto,
    );
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery)
      .toMatchObject({ observedLegacyDigest: latestDigest });
  });

  it('ignores unrelated storage events without freezing authority', async () => {
    const harness = createHarness();
    const { store, onAuthorityLost } = await readyStore(harness);

    harness.dispatch(`${LEGACY_KEYS.projects}_backup`);

    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).resolves.toMatchObject({ activeProjectId: 'project-a' });
    expect(onAuthorityLost).not.toHaveBeenCalled();
  });

  it('persists drift missed by storage events during the next bootstrap', async () => {
    const harness = createHarness();
    await readyStore(harness);
    harness.replace(validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));

    const reloaded = createLocalWorkspaceStore(harness.environment);
    const result = recoveryResult(await reloaded.bootstrap());

    expect(result.recovery).toMatchObject({
      kind: 'split-brain',
      category: 'legacy-drift',
      recoveryId: expect.any(String),
      availableExports: [
        'legacy-current',
        'legacy-original',
        'indexeddb-workspace',
      ],
    });
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery).toMatchObject({
      id: result.recovery.recoveryId,
      kind: 'legacy-drift',
    });
  });

  it('uses one persisted recovery marker when concurrent stores detect the same drift', async () => {
    const harness = createHarness();
    const leftLost = vi.fn();
    const rightLost = vi.fn();
    const left = createLocalWorkspaceStore(harness.environment);
    const right = createLocalWorkspaceStore(harness.environment);
    await expect(left.bootstrap({ onAuthorityLost: leftLost }))
      .resolves.toMatchObject({ status: 'ready' });
    await expect(right.bootstrap({ onAuthorityLost: rightLost }))
      .resolves.toMatchObject({ status: 'ready' });
    harness.replace(validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));

    harness.dispatch(LEGACY_KEYS.projects);

    await vi.waitFor(() => {
      expect(leftLost).toHaveBeenCalledOnce();
      expect(rightLost).toHaveBeenCalledOnce();
    });
    const marker = (await inspect(harness)).migrationLedger[0].unresolvedRecovery;
    expect(marker).not.toBeNull();
    expect(leftLost.mock.calls[0][0]).toMatchObject({
      recovery: { recoveryId: marker?.id },
    });
    expect(rightLost.mock.calls[0][0]).toMatchObject({
      recovery: { recoveryId: marker?.id },
    });
  });

  it('recaptures live legacy after a differing concurrent marker wins CAS', async () => {
    const indexedDB = new IDBFactory();
    const storage = memoryStorage(validLegacyValues());
    const concurrentValues = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Concurrent latest drift' }),
      ]),
    });
    let armed = false;
    let injected = false;
    let concurrentLedger: IndexedDbInspection['migrationLedger'][number] | undefined;
    instrumentTransactionCompletion(indexedDB, (database, stores, mode) => {
      if (!armed
        || injected
        || mode !== 'readonly'
        || stores.length !== 1
        || stores[0] !== 'migrationLedger'
        || !concurrentLedger) {
        return;
      }
      injected = true;
      for (const key of LEGACY_DOCUMENT_KEYS) {
        storage.seed(key, concurrentValues[key]);
      }
      const transaction = database.transaction('migrationLedger', 'readwrite');
      transaction.objectStore('migrationLedger').put(concurrentLedger);
    });
    const harness = createHarness({ indexedDB, storage });
    const { onAuthorityLost } = await readyStore(harness);
    const stored = await inspect(harness);
    const concurrentDigest = await digestLegacySnapshot(
      captureLegacySnapshot(memoryStorage(concurrentValues)),
      webcrypto.subtle as unknown as SubtleCrypto,
    );
    concurrentLedger = {
      ...stored.migrationLedger[0],
      ledgerRevision: stored.migrationLedger[0].ledgerRevision + 1,
      unresolvedRecovery: {
        id: 'concurrent-latest-marker',
        kind: 'legacy-drift',
        detectedAt: TEST_NOW,
        observedLegacyDigest: concurrentDigest,
      },
    };
    harness.replace(validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('project-a', 11, { name: 'Older sampled drift' }),
      ]),
    }));
    armed = true;

    harness.dispatch(LEGACY_KEYS.projects);

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalled());
    expect(injected).toBe(true);
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery).toMatchObject({
      id: 'concurrent-latest-marker',
      observedLegacyDigest: concurrentDigest,
    });
  });
});

describe('cutover timing', () => {
  it('accepts a byte-identical event delivered before the first source snapshot', async () => {
    const harness = createHarness({
      onMonitorInstalled(listener) {
        listener({ key: LEGACY_KEYS.projects } as StorageEvent);
      },
    });

    await expect(createLocalWorkspaceStore(harness.environment).bootstrap())
      .resolves.toMatchObject({ status: 'ready' });
  });

  it('does not choose a source that changes during migration preparation', async () => {
    const storage = new MemoryStorage(validLegacyValues(), (readCount, current) => {
      if (readCount === LEGACY_DOCUMENT_KEYS.length) {
        current.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
      }
    });
    const harness = createHarness({ storage });

    const result = recoveryResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.recovery).toMatchObject({ kind: 'legacy-changing', canRetry: true });
    expect((await inspect(harness)).migrationLedger).toEqual([]);
  });

  it('refuses ready when legacy changes after copy but before verification', async () => {
    const storage = memoryStorage(validLegacyValues());
    let harness!: Harness;
    let changed = false;
    harness = createHarness({
      storage,
      fault(point) {
        if (point !== 'copy.before-complete' || changed) return;
        changed = true;
        storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
        harness.dispatch(LEGACY_KEYS.projects);
      },
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(result.status).not.toBe('ready');
    expect((await inspect(harness)).migrationLedger).toHaveLength(1);
    expect(harness.storage.mutations).toEqual([]);
  });
});

describe('connection version changes', () => {
  it('lets versionchange dominate an in-progress drift hash without duplicate recovery', async () => {
    const hashStarted = deferred();
    const releaseHash = deferred();
    let armed = false;
    let held = false;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (armed && !held && text.includes('doctect-legacy-source')) {
            held = true;
            hashStarted.resolve();
            await releaseHash.promise;
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const harness = createHarness({ crypto });
    const onAuthorityLost = vi.fn();
    const { store } = await readyStore(harness, onAuthorityLost);
    armed = true;
    harness.replace(validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    }));
    harness.dispatch(LEGACY_KEYS.projects);
    await hashStarted.promise;

    const upgraded = await requestResult(harness.indexedDB.open(WORKSPACE_DB_NAME, 2));
    releaseHash.resolve();

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalled());
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'unavailable' });
    expect(onAuthorityLost).toHaveBeenCalledOnce();
    expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    );
    upgraded.close();
  });

  it('freezes writes, reports unavailable, and never touches either legacy authority', async () => {
    const harness = createHarness();
    const onAuthorityLost = vi.fn();
    const { store } = await readyStore(harness, onAuthorityLost);

    const upgrade = harness.indexedDB.open(WORKSPACE_DB_NAME, 2);
    upgrade.addEventListener('upgradeneeded', () => {});
    const upgraded = await requestResult(upgrade);

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    ));
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(harness.storage.mutations).toEqual([]);
    upgraded.close();
  });

  it('maps a synthetic versionchange event without writing legacy data', async () => {
    const indexedDB = new IDBFactory();
    const originalOpen = indexedDB.open.bind(indexedDB);
    let opened: IDBDatabase | undefined;
    indexedDB.open = ((name: string, version?: number) => {
      const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
      request.addEventListener('success', () => { opened ??= request.result; });
      return request;
    }) as IDBFactory['open'];
    const harness = createHarness({ indexedDB });
    const onAuthorityLost = vi.fn();
    await readyStore(harness, onAuthorityLost);

    opened?.dispatchEvent(new FakeIDBVersionChangeEvent('versionchange', {
      oldVersion: 1,
      newVersion: 2,
    }));

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalled());
    expect(harness.storage.mutations).toEqual([]);
  });
});
