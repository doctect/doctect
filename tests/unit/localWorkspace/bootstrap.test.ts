// @vitest-environment node
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import {
  IDBFactory,
  IDBVersionChangeEvent as FakeIDBVersionChangeEvent,
  forceCloseDatabase,
} from 'fake-indexeddb';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createLocalWorkspaceStore,
  localWorkspaceStore,
  type LocalWorkspaceEnvironment,
} from '../../../services/localWorkspace';
import type {
  WorkspaceBootstrapObserver,
  WorkspaceBootstrapResult,
} from '../../../services/localWorkspace/contracts';
import type { WorkspaceFaultPoint } from '../../../services/localWorkspace/faults';
import {
  createIndexedDbAdapter,
  type IndexedDbInspection,
} from '../../../services/localWorkspace/indexedDbAdapter';
import {
  canonicalStringify,
  digestLegacySnapshot,
} from '../../../services/localWorkspace/canonical';
import { captureLegacySnapshot } from '../../../services/localWorkspace/legacy';
import {
  prepareInitialCopy,
  type PreparedInitialCopy,
} from '../../../services/localWorkspace/migration';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_MIGRATION_ID,
  type MigrationLedger,
} from '../../../services/localWorkspace/schema';
import {
  LEGACY_DOCUMENT_KEYS,
  LEGACY_KEYS,
  MemoryStorage,
  currentState,
  legacyCustomPreset,
  legacyProject,
  legacySnapshot,
  memoryStorage,
  secondProject,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const TEST_NOW = '2026-08-14T15:00:00.000Z';
const VERIFIED_NOW = '2026-08-14T16:00:00.000Z';
const STORE_NAMES = [
  'projects',
  'workspace',
  'presets',
  'pendingImports',
  'migrationLedger',
  'legacyBackup',
] as const;
type StoreName = typeof STORE_NAMES[number];

const COPY_TRANSACTION_FAULTS = [
  'copy.before-transaction',
  'copy.after-projects',
  'copy.after-workspace',
  'copy.after-presets',
  'copy.after-pending-imports',
  'copy.after-backup',
  'copy.after-ledger',
  'copy.before-complete',
] as const satisfies readonly WorkspaceFaultPoint[];

beforeAll(() => Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
}));

afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
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

const openRaw = (
  indexedDB: IDBFactory,
  version?: number,
): Promise<IDBDatabase> => requestResult(
  version === undefined
    ? indexedDB.open(WORKSPACE_DB_NAME)
    : indexedDB.open(WORKSPACE_DB_NAME, version),
);

const putRaw = async (
  indexedDB: IDBFactory,
  storeName: StoreName,
  value: unknown,
): Promise<void> => {
  const database = await openRaw(indexedDB);
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  database.close();
};

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

interface TestHarnessOptions {
  indexedDB?: IDBFactory;
  storage?: MemoryStorage | Pick<Storage, 'getItem'>;
  values?: Record<string, string>;
  crypto?: Crypto;
  now?: () => string;
  randomUUID?: () => string;
  createBlankProject?: () => ReturnType<typeof currentState>;
  fault?: (point: WorkspaceFaultPoint) => void;
}

interface TestHarness {
  environment: LocalWorkspaceEnvironment;
  indexedDB: IDBFactory;
  storage: MemoryStorage | Pick<Storage, 'getItem'>;
  listeners: Set<(event: StorageEvent) => void>;
  addStorageListener: ReturnType<typeof vi.fn>;
  unsubscribe: () => void;
  createBlankProject: ReturnType<typeof vi.fn>;
  setFault(point?: WorkspaceFaultPoint): void;
  dispatchStorage(key: string | null): void;
}

const createHarness = (options: TestHarnessOptions = {}): TestHarness => {
  const indexedDB = options.indexedDB ?? new IDBFactory();
  const storage = options.storage ?? memoryStorage(options.values ?? validLegacyValues());
  const listeners = new Set<(event: StorageEvent) => void>();
  const unsubscribe = vi.fn(() => {});
  const addStorageListener = vi.fn((listener: (event: StorageEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      unsubscribe();
    };
  });
  const createBlankProject = vi.fn(options.createBlankProject ?? currentState);
  let faultPoint: WorkspaceFaultPoint | undefined;
  const environment: LocalWorkspaceEnvironment = {
    indexedDB,
    legacyStorage: storage,
    addStorageListener,
    crypto: options.crypto ?? webcrypto as unknown as Crypto,
    now: options.now ?? (() => TEST_NOW),
    randomUUID: options.randomUUID ?? (() => 'fixture-uuid'),
    createBlankProject,
    fault: options.fault ?? (point => {
      if (point === faultPoint) throw new Error(`Injected fault at ${point}.`);
    }),
  };

  return {
    environment,
    indexedDB,
    storage,
    listeners,
    addStorageListener,
    unsubscribe,
    createBlankProject,
    setFault(point) {
      faultPoint = point;
    },
    dispatchStorage(key) {
      const event = { key } as StorageEvent;
      for (const listener of listeners) listener(event);
    },
  };
};

const migrationEnvironment = (environment: LocalWorkspaceEnvironment) => ({
  crypto: environment.crypto,
  now: environment.now,
  randomUUID: environment.randomUUID,
  createBlankProject: environment.createBlankProject,
});

const sourceFrom = (values: Record<string, string> = validLegacyValues()) =>
  legacySnapshot(values as Partial<Record<keyof ReturnType<typeof legacySnapshot>, string>>);

const prepareFor = (
  harness: TestHarness,
  source = sourceFrom(),
): Promise<PreparedInitialCopy> => prepareInitialCopy(
  source,
  migrationEnvironment(harness.environment),
);

const verificationExpectation = (copy: PreparedInitialCopy) => ({
  ledgerRevision: copy.ledger.ledgerRevision,
  sourceDigest: copy.ledger.sourceDigest,
  expectedTargetDigest: copy.ledger.expectedTargetDigest,
});

const seedCopy = async (
  harness: TestHarness,
  options: {
    source?: ReturnType<typeof legacySnapshot>;
    state?: 'copied' | 'verified';
  } = {},
): Promise<PreparedInitialCopy> => {
  const copy = await prepareFor(harness, options.source);
  const adapter = createIndexedDbAdapter({
    indexedDB: harness.indexedDB,
    now: () => VERIFIED_NOW,
  });
  await adapter.open();
  await adapter.writeInitialCopy(copy);
  if (options.state === 'verified') {
    await adapter.markVerified(verificationExpectation(copy));
  }
  adapter.close();
  return copy;
};

const inspect = async (harness: TestHarness): Promise<IndexedDbInspection> => {
  const adapter = createIndexedDbAdapter({
    indexedDB: harness.indexedDB,
    now: () => VERIFIED_NOW,
  });
  try {
    await adapter.open();
    return await adapter.inspect();
  } finally {
    adapter.close();
  }
};

const ensureSchema = async (harness: TestHarness): Promise<void> => {
  const adapter = createIndexedDbAdapter({
    indexedDB: harness.indexedDB,
    now: () => VERIFIED_NOW,
  });
  await adapter.open();
  adapter.close();
};

const readyResult = (
  result: WorkspaceBootstrapResult,
): Extract<WorkspaceBootstrapResult, { status: 'ready' }> => {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(`Expected ready, got ${result.status}.`);
  return result;
};

const recoveryResult = (
  result: WorkspaceBootstrapResult,
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  expect(result.status).toBe('recovery');
  if (result.status !== 'recovery') throw new Error(`Expected recovery, got ${result.status}.`);
  return result;
};

interface DatabaseHooks {
  onOpen?(database: IDBDatabase): void;
  onTransactionStart?(
    database: IDBDatabase,
    storeNames: string[],
    mode: IDBTransactionMode,
    transaction: IDBTransaction,
  ): void;
}

const instrumentFactory = (indexedDB: IDBFactory, hooks: DatabaseHooks): void => {
  const originalOpen = indexedDB.open.bind(indexedDB);
  const patched = new WeakSet<IDBDatabase>();
  indexedDB.open = ((name: string, version?: number) => {
    const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
    request.addEventListener('success', () => {
      const database = request.result;
      hooks.onOpen?.(database);
      if (patched.has(database)) return;
      patched.add(database);
      const originalTransaction = database.transaction.bind(database);
      database.transaction = ((
        storeNames: string | string[],
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) => {
        const transaction = originalTransaction(storeNames, mode, options);
        hooks.onTransactionStart?.(
          database,
          typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames),
          mode ?? 'readonly',
          transaction,
        );
        return transaction;
      }) as IDBDatabase['transaction'];
    });
    return request;
  }) as IDBFactory['open'];
};

const sameStores = (actual: string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && expected.every(name => actual.includes(name));

const trackOpened = (indexedDB: IDBFactory): Array<Promise<IDBDatabase>> => {
  const opened: Array<Promise<IDBDatabase>> = [];
  const originalOpen = indexedDB.open.bind(indexedDB);
  indexedDB.open = ((name: string, version?: number) => {
    const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
    const result = requestResult<IDBDatabase>(request);
    void result.catch(() => {});
    opened.push(result);
    return request;
  }) as IDBFactory['open'];
  return opened;
};

describe('public store surface', () => {
  it('exports a browser singleton without opening storage during module evaluation', () => {
    expect(localWorkspaceStore).toMatchObject({
      bootstrap: expect.any(Function),
      commit: expect.any(Function),
      exportRecoveryBundle: expect.any(Function),
    });
  });

  it('rejects normal commands while authority is cold or bootstrapping', async () => {
    const digestStarted = deferred();
    const releaseDigest = deferred();
    let held = false;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          if (!held) {
            held = true;
            digestStarted.resolve();
            await releaseDigest.promise;
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const harness = createHarness({ crypto });
    const store = createLocalWorkspaceStore(harness.environment);
    const command = { type: 'activate-project', projectId: 'project-a' } as const;

    await expect(store.commit(command)).rejects.toMatchObject({ code: 'authority-lost' });
    const bootstrap = store.bootstrap();
    await digestStarted.promise;
    await expect(store.commit(command)).rejects.toMatchObject({ code: 'authority-lost' });
    releaseDigest.resolve();
    await expect(bootstrap).resolves.toMatchObject({ status: 'ready' });
  });

  it('exports current legacy recovery without opening IndexedDB or writing legacy storage', async () => {
    const harness = createHarness();
    const store = createLocalWorkspaceStore(harness.environment);

    await expect(store.exportRecoveryBundle('legacy-current')).resolves.toMatchObject({
      type: 'application/json;charset=utf-8',
    });
    expect((harness.storage as MemoryStorage).reads).toEqual([
      ...LEGACY_DOCUMENT_KEYS,
      ...LEGACY_DOCUMENT_KEYS,
      ...LEGACY_DOCUMENT_KEYS,
    ]);
    expect((harness.storage as MemoryStorage).mutations).toEqual([]);
  });
});

describe('initial bootstrap and authority transition', () => {
  it('never returns ready before independent read-back and verified CAS', async () => {
    const events: string[] = [];
    const indexedDB = new IDBFactory();
    let opened = false;
    instrumentFactory(indexedDB, {
      onOpen() {
        if (!opened) {
          opened = true;
          events.push('open');
        }
      },
      onTransactionStart(_database, storeNames, mode, transaction) {
        if (mode === 'readonly' && sameStores(storeNames, STORE_NAMES)) {
          events.push('inspect');
        } else if (mode === 'readwrite' && sameStores(storeNames, STORE_NAMES)) {
          transaction.addEventListener('complete', () => events.push('write-copied'), {
            once: true,
          });
        } else if (mode === 'readonly' && sameStores(
          storeNames,
          ['projects', 'workspace', 'presets', 'pendingImports'],
        )) {
          events.push('read-all-separate-transaction');
        } else if (mode === 'readwrite' && sameStores(storeNames, ['migrationLedger'])) {
          transaction.addEventListener('complete', () => events.push('mark-verified'), {
            once: true,
          });
        }
      },
    });
    const storage = memoryStorage(validLegacyValues());
    const originalGetItem = storage.getItem.bind(storage);
    storage.getItem = (key: string) => {
      if (storage.reads.length === 0) events.push('capture-legacy');
      if (storage.reads.length === 16) events.push('rehash-legacy');
      return originalGetItem(key);
    };
    let nowCalls = 0;
    const harness = createHarness({
      indexedDB,
      storage,
      now: () => {
        nowCalls += 1;
        if (nowCalls === 1) events.push('prepare-copy');
        return nowCalls === 1 ? TEST_NOW : VERIFIED_NOW;
      },
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(events).toEqual([
      'open',
      'inspect',
      'capture-legacy',
      'prepare-copy',
      'write-copied',
      'read-all-separate-transaction',
      'rehash-legacy',
      'mark-verified',
    ]);
    expect(result.status).toBe('ready');
    expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
      state: 'verified',
      ledgerRevision: 1,
      verifiedAt: VERIFIED_NOW,
    });
  });

  it('emits each bootstrap phase once and in order', async () => {
    const harness = createHarness();
    const phases: string[] = [];
    const observer = { onPhase: (phase: string) => phases.push(phase) };
    const store = createLocalWorkspaceStore(harness.environment);

    const first = store.bootstrap(observer as WorkspaceBootstrapObserver);
    const second = store.bootstrap(observer as WorkspaceBootstrapObserver);
    expect(second).toBe(first);
    await first;

    expect(phases).toEqual([
      'opening-local-storage',
      'checking-existing-projects',
      'copying-projects',
      'verifying-projects',
      'finishing-upgrade',
    ]);
  });

  it('installs one retained legacy monitor before the first legacy read', async () => {
    const events: string[] = [];
    const storage = memoryStorage(validLegacyValues());
    const getItem = vi.fn((key: string) => {
      events.push('read');
      return storage.getItem(key);
    });
    const harness = createHarness({ storage: { getItem } });
    harness.environment.addStorageListener = listener => {
      events.push('monitor');
      harness.listeners.add(listener);
      return () => harness.unsubscribe();
    };
    const store = createLocalWorkspaceStore(harness.environment);

    await store.bootstrap();
    await store.bootstrap();

    expect(events[0]).toBe('monitor');
    expect(events.filter(event => event === 'monitor')).toHaveLength(1);
    expect(harness.listeners).toHaveLength(1);
    expect(harness.unsubscribe).not.toHaveBeenCalled();
  });

  it('initializes an all-absent native workspace through copied and verified', async () => {
    const harness = createHarness({ values: {} });

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );
    const stored = await inspect(harness);

    expect(result.receipt).toBeUndefined();
    expect(result.snapshot).toMatchObject({
      projects: [{ id: 'proj_fixture-uuid', name: 'Blank Project' }],
      activeProjectId: 'proj_fixture-uuid',
      customPresets: [],
      pendingImports: [],
    });
    expect(harness.createBlankProject).toHaveBeenCalledOnce();
    expect(stored.projects).toHaveLength(1);
    expect(stored.workspace).toHaveLength(1);
    expect(stored.legacyBackup[0].snapshot).toEqual(legacySnapshot());
    expect(stored.migrationLedger[0]).toMatchObject({
      state: 'verified',
      origin: 'native',
    });
    expect((harness.storage as MemoryStorage).mutations).toEqual([]);
  });

  it('keeps native default data inside the failed atomic copy', async () => {
    const harness = createHarness({ values: {} });
    harness.setFault('copy.after-projects');

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('migration-failed');
    expect(harness.createBlankProject).toHaveBeenCalledOnce();
    expect(await inspect(harness)).toEqual({
      projects: [],
      workspace: [],
      presets: [],
      pendingImports: [],
      migrationLedger: [],
      legacyBackup: [],
    });
  });

  it('treats presets-only storage as legacy and includes the blank in the copy', async () => {
    const values = {
      [LEGACY_KEYS.customPresets]: JSON.stringify([legacyCustomPreset()]),
    };
    const harness = createHarness({ values });

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.snapshot.projects).toHaveLength(1);
    expect(result.snapshot.customPresets.map(preset => preset.id)).toEqual(['preset-a']);
    expect(result.receipt).toMatchObject({
      projectCount: 0,
      customPresetCount: 1,
      pendingImportPreserved: false,
      migratedAt: TEST_NOW,
    });
  });

  it.each([
    ['one', [legacyProject()], 'project-a'],
    ['many', [legacyProject(), secondProject()], 'project-b'],
  ])('copies %s ordered legacy project set', async (_label, projects, activeProjectId) => {
    const values = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify(projects),
      [LEGACY_KEYS.activeProject]: activeProjectId,
    });
    const harness = createHarness({ values });

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.snapshot.projects.map(project => project.id))
      .toEqual(projects.map(project => project.id));
    expect(result.snapshot.activeProjectId).toBe(activeProjectId);
    expect(result.receipt?.projectCount).toBe(projects.length);
  });

  it('migrates the source present before preparation without writing legacy keys', async () => {
    const storage = memoryStorage(validLegacyValues());
    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    storage.seed(LEGACY_KEYS.activeProject, 'project-b');
    const harness = createHarness({ storage });

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.snapshot.projects.map(project => project.id)).toEqual(['project-a', 'project-b']);
    expect(storage.mutations).toEqual([]);
  });

  it('returns legacy-changing when source changes during preparation', async () => {
    const storage = new MemoryStorage(validLegacyValues(), (readCount, current) => {
      if (readCount === 4) {
        current.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
      }
    });
    const harness = createHarness({ storage });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery).toMatchObject({
      kind: 'legacy-changing',
      canRetry: true,
    });
    expect((await inspect(harness)).migrationLedger).toEqual([]);
    expect(storage.mutations).toEqual([]);
  });

  it('refuses authority when source changes after preparation and before copy', async () => {
    const storage = new MemoryStorage(validLegacyValues(), (readCount, current) => {
      if (readCount === 8) {
        current.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
      }
    });
    const harness = createHarness({ storage });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('legacy-changing');
    expect((await inspect(harness)).migrationLedger).toEqual([]);
  });

  it.each(['start', 'complete'] as const)(
    'refuses authority when source changes at copy transaction %s',
    async timing => {
      const indexedDB = new IDBFactory();
      const storage = memoryStorage(validLegacyValues());
      const harness = createHarness({ indexedDB, storage });
      let changed = false;
      const change = () => {
        if (changed) return;
        changed = true;
        storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
        harness.dispatchStorage(LEGACY_KEYS.projects);
      };
      instrumentFactory(indexedDB, {
        onTransactionStart(_database, storeNames, mode, transaction) {
          if (mode !== 'readwrite' || !sameStores(storeNames, STORE_NAMES)) return;
          if (timing === 'start') change();
          else transaction.addEventListener('complete', change, { once: true });
        },
      });

      const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

      expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
      expect((await inspect(harness)).migrationLedger[0].state).toBe('copied');
      expect(storage.mutations).toEqual([]);
    },
  );

  it('refuses authority when a storage event arrives during final source hashing', async () => {
    const sourceHashStarted = deferred();
    const releaseSourceHash = deferred();
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 5) {
              sourceHashStarted.resolve();
              await releaseSourceHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ crypto, storage });
    const store = createLocalWorkspaceStore(harness.environment);
    const bootstrap = store.bootstrap();
    await sourceHashStarted.promise;

    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    harness.dispatchStorage(LEGACY_KEYS.projects);
    releaseSourceHash.resolve();

    const result = await bootstrap;
    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('copied');
  });

  it('recaptures copied source after hashing when storage event delivery is delayed', async () => {
    const sourceHashStarted = deferred();
    const releaseSourceHash = deferred();
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 5) {
              sourceHashStarted.resolve();
              await releaseSourceHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ crypto, storage });
    const bootstrap = createLocalWorkspaceStore(harness.environment).bootstrap();
    await sourceHashStarted.promise;

    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    releaseSourceHash.resolve();

    const result = await bootstrap;
    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('copied');
    harness.dispatchStorage(LEGACY_KEYS.projects);
  });

  it('revalidates copied source after a byte-identical event during the final hash', async () => {
    const sourceHashStarted = deferred();
    const releaseSourceHash = deferred();
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 6) {
              sourceHashStarted.resolve();
              await releaseSourceHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const harness = createHarness({ crypto });
    const bootstrap = createLocalWorkspaceStore(harness.environment).bootstrap();
    await sourceHashStarted.promise;

    harness.dispatchStorage(LEGACY_KEYS.projects);
    releaseSourceHash.resolve();

    await expect(bootstrap).resolves.toMatchObject({ status: 'ready' });
    expect(legacyDigestCalls).toBeGreaterThan(6);
  });

  it('refuses copied ready when legacy changes in the finishing phase observer', async () => {
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ storage });
    const store = createLocalWorkspaceStore(harness.environment);

    const result = await store.bootstrap({
      onPhase(phase) {
        if (phase === 'finishing-upgrade') {
          storage.seed(
            LEGACY_KEYS.projects,
            JSON.stringify([legacyProject(), secondProject()]),
          );
        }
      },
    });

    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('verified');
  });

  it('refuses authority when source changes during the verified CAS', async () => {
    const indexedDB = new IDBFactory();
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ indexedDB, storage });
    let changed = false;
    instrumentFactory(indexedDB, {
      onTransactionStart(_database, storeNames, mode) {
        if (changed
          || mode !== 'readwrite'
          || !sameStores(storeNames, ['migrationLedger'])) {
          return;
        }
        changed = true;
        storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
        harness.dispatchStorage(LEGACY_KEYS.projects);
      },
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('verified');
  });

  it('recaptures copied source after verified CAS when storage event delivery is delayed', async () => {
    const indexedDB = new IDBFactory();
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ indexedDB, storage });
    let changed = false;
    instrumentFactory(indexedDB, {
      onTransactionStart(_database, storeNames, mode) {
        if (changed
          || mode !== 'readwrite'
          || !sameStores(storeNames, ['migrationLedger'])) {
          return;
        }
        changed = true;
        storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
      },
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('verified');
    harness.dispatchStorage(LEGACY_KEYS.projects);
  });

  it('does not reject a matching source merely because a storage event was observed', async () => {
    const indexedDB = new IDBFactory();
    const harness = createHarness({ indexedDB });
    instrumentFactory(indexedDB, {
      onTransactionStart(_database, storeNames, mode) {
        if (mode === 'readwrite' && sameStores(storeNames, STORE_NAMES)) {
          harness.dispatchStorage(LEGACY_KEYS.projects);
        }
      },
    });

    await expect(createLocalWorkspaceStore(harness.environment).bootstrap())
      .resolves.toMatchObject({ status: 'ready' });
  });

  it.each(COPY_TRANSACTION_FAULTS)(
    'returns retryable recovery and no partial target for %s',
    async faultPoint => {
      const harness = createHarness();
      harness.setFault(faultPoint);
      const store = createLocalWorkspaceStore(harness.environment);

      const result = await store.bootstrap();

      expect(recoveryResult(result).recovery).toMatchObject({
        kind: 'migration-failed',
        canRetry: true,
      });
      expect(await inspect(harness)).toEqual({
        projects: [],
        workspace: [],
        presets: [],
        pendingImports: [],
        migrationLedger: [],
        legacyBackup: [],
      });
      harness.setFault();
      await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    },
  );

  it('resumes a committed copied ledger after a crash', async () => {
    const baseStorage = memoryStorage(validLegacyValues());
    let reads = 0;
    let crash = true;
    const storage = {
      getItem(key: string) {
        reads += 1;
        if (crash && reads === 13) throw new Error('fault after committed copy');
        return baseStorage.getItem(key);
      },
    };
    const harness = createHarness({ storage });
    const first = createLocalWorkspaceStore(harness.environment);

    await expect(first.bootstrap()).rejects.toThrow('fault after committed copy');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('copied');

    crash = false;
    const second = createLocalWorkspaceStore(harness.environment);
    await expect(second.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    expect((await inspect(harness)).migrationLedger).toHaveLength(1);
  });

  it('does not return ready when the verified CAS aborts and retries from copied', async () => {
    const harness = createHarness();
    harness.setFault('mutation.before-complete');
    const store = createLocalWorkspaceStore(harness.environment);

    const first = await store.bootstrap();

    expect(recoveryResult(first).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('copied');

    harness.setFault();
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
  });
});

describe('existing target decision table', () => {
  const orphanStores = [
    'projects',
    'workspace',
    'presets',
    'pendingImports',
    'legacyBackup',
  ] as const;

  it.each(orphanStores)(
    'returns unrecognized-target for an orphaned %s record without creating defaults',
    async storeName => {
      const harness = createHarness({ values: {} });
      const copy = await prepareFor(createHarness());
      await ensureSchema(harness);
      const values = {
        projects: copy.projects[0],
        workspace: copy.workspace,
        presets: copy.presets[0],
        pendingImports: copy.pendingImports[0],
        legacyBackup: copy.backup,
      };
      await putRaw(harness.indexedDB, storeName, values[storeName]);

      const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

      expect(recoveryResult(result).recovery.kind).toBe('unrecognized-target');
      expect(harness.createBlankProject).not.toHaveBeenCalled();
      expect((harness.storage as MemoryStorage).reads).toEqual([
        ...LEGACY_DOCUMENT_KEYS,
        ...LEGACY_DOCUMENT_KEYS,
        ...LEGACY_DOCUMENT_KEYS,
      ]);
      expect((await inspect(harness))[storeName]).toHaveLength(1);
    },
  );

  it('advertises only current legacy recovery for an unrecognized target without a backup', async () => {
    const harness = createHarness({ values: {} });
    const copy = await prepareFor(createHarness());
    await ensureSchema(harness);
    await putRaw(harness.indexedDB, 'projects', copy.projects[0]);

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery).toMatchObject({
      kind: 'unrecognized-target',
      availableExports: ['legacy-current'],
    });
  });

  it.each([
    ['unknown', { id: WORKSPACE_MIGRATION_ID, indexedDbVersion: 99 }],
    ['malformed', {
      id: WORKSPACE_MIGRATION_ID,
      indexedDbVersion: 1,
      state: 'copied',
      persistenceRolloutEpoch: 1,
    }],
  ])('returns unrecognized-target for an %s ledger', async (_label, ledger) => {
    const harness = createHarness({ values: {} });
    await ensureSchema(harness);
    await putRaw(harness.indexedDB, 'migrationLedger', ledger);

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('unrecognized-target');
    expect(harness.createBlankProject).not.toHaveBeenCalled();
    expect((harness.storage as MemoryStorage).reads).toEqual([
      ...LEGACY_DOCUMENT_KEYS,
      ...LEGACY_DOCUMENT_KEYS,
      ...LEGACY_DOCUMENT_KEYS,
    ]);
  });

  it.each(['cleanup-started', 'cleanup-complete'] as const)(
    'refuses recognized rollout epoch 1 state %s without deleting legacy keys',
    async state => {
      const harness = createHarness();
      const copy = await seedCopy(harness);
      await putRaw(harness.indexedDB, 'migrationLedger', { ...copy.ledger, state });
      (harness.storage as MemoryStorage).reads.splice(0);
      harness.createBlankProject.mockClear();

      const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

      expect(recoveryResult(result).recovery.kind).toBe('unsupported-cleanup-state');
      expect((harness.storage as MemoryStorage).mutations).toEqual([]);
      expect(harness.createBlankProject).not.toHaveBeenCalled();
      expect((await inspect(harness)).migrationLedger[0].state).toBe(state);
    },
  );

  it('loads and independently verifies a committed copied ledger', async () => {
    const harness = createHarness();
    const copy = await seedCopy(harness);
    (harness.storage as MemoryStorage).reads.splice(0);
    harness.createBlankProject.mockClear();

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.snapshot.projects).toEqual(copy.projects.map(record => record.project));
    expect(result.receipt?.id).toBe(`${WORKSPACE_MIGRATION_ID}:${copy.sourceDigest}`);
    expect(harness.createBlankProject).not.toHaveBeenCalled();
    expect((await inspect(harness)).migrationLedger[0].state).toBe('verified');
  });

  it('returns a stored recovery marker from a copied ledger without verifying it', async () => {
    const harness = createHarness();
    const copy = await seedCopy(harness);
    const marker = {
      id: 'copied-recovery',
      kind: 'target-mismatch' as const,
      detectedAt: VERIFIED_NOW,
    };
    await putRaw(harness.indexedDB, 'migrationLedger', {
      ...copy.ledger,
      unresolvedRecovery: marker,
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery).toMatchObject({
      recoveryId: marker.id,
      kind: 'verification-failed',
    });
    expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
      state: 'copied',
      unresolvedRecovery: marker,
    });
  });

  it('returns verification-failed for a copied target read-back mismatch', async () => {
    const harness = createHarness();
    const copy = await seedCopy(harness);
    await putRaw(harness.indexedDB, 'projects', {
      ...copy.projects[0],
      project: { ...copy.projects[0].project, name: 'Changed after copy' },
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
    expect((await inspect(harness)).migrationLedger[0].state).toBe('copied');
  });

  it('returns verification-failed for a copied source mismatch', async () => {
    const oldValues = validLegacyValues();
    const storage = memoryStorage(oldValues);
    const harness = createHarness({ storage });
    const copy = await seedCopy(harness, { source: sourceFrom(oldValues) });
    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    const store = createLocalWorkspaceStore(harness.environment);

    const first = await store.bootstrap();
    expect(recoveryResult(first).recovery.kind).toBe('verification-failed');

    const retried = readyResult(await store.bootstrap());
    expect(retried.snapshot.projects.map(project => project.id))
      .toEqual(['project-a', 'project-b']);
    expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
      state: 'verified',
    });
    expect((await inspect(harness)).migrationLedger[0].sourceDigest)
      .not.toBe(copy.sourceDigest);
    expect(storage.mutations).toEqual([]);
  });

  it('preserves the previous copy when retry preparation rejects changed legacy', async () => {
    const oldValues = validLegacyValues();
    const storage = memoryStorage(oldValues);
    const harness = createHarness({ storage });
    await seedCopy(harness, { source: sourceFrom(oldValues) });
    storage.seed(LEGACY_KEYS.projects, '{');
    const store = createLocalWorkspaceStore(harness.environment);

    expect(recoveryResult(await store.bootstrap()).recovery.kind)
      .toBe('verification-failed');
    const before = canonicalStringify(await inspect(harness));
    const retry = recoveryResult(await store.bootstrap());

    expect(retry.recovery.kind).toBe('migration-failed');
    expect(canonicalStringify(await inspect(harness))).toBe(before);
    expect(storage.mutations).toEqual([]);
  });

  it('aborts copied replacement without changing either source', async () => {
    const oldValues = validLegacyValues();
    const storage = memoryStorage(oldValues);
    const harness = createHarness({ storage });
    await seedCopy(harness, { source: sourceFrom(oldValues) });
    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    const store = createLocalWorkspaceStore(harness.environment);
    expect(recoveryResult(await store.bootstrap()).recovery.kind)
      .toBe('verification-failed');
    const before = canonicalStringify(await inspect(harness));
    harness.setFault('copy.after-projects');

    expect(recoveryResult(await store.bootstrap()).recovery.kind)
      .toBe('migration-failed');
    expect(canonicalStringify(await inspect(harness))).toBe(before);
    expect(storage.mutations).toEqual([]);
  });

  it('lets concurrent copied retries follow one replacement winner', async () => {
    const oldValues = validLegacyValues();
    const storage = memoryStorage(oldValues);
    const harness = createHarness({ storage });
    await seedCopy(harness, { source: sourceFrom(oldValues) });
    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    const left = createLocalWorkspaceStore(harness.environment);
    const right = createLocalWorkspaceStore(harness.environment);
    const first = await Promise.all([left.bootstrap(), right.bootstrap()]);
    expect(first.map(result => recoveryResult(result).recovery.kind))
      .toEqual(['verification-failed', 'verification-failed']);

    const retried = await Promise.all([left.bootstrap(), right.bootstrap()]);

    expect(retried).toEqual([
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
    ]);
    const finalInspection = await inspect(harness);
    expect(finalInspection.migrationLedger).toHaveLength(1);
    expect(finalInspection.migrationLedger[0].state).toBe('verified');
    expect(finalInspection.legacyBackup).toHaveLength(1);
    expect(storage.mutations).toEqual([]);
  });

  it('loads verified records without comparing edits to the migration target digest', async () => {
    const harness = createHarness();
    const copy = await seedCopy(harness, { state: 'verified' });
    const adapter = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => VERIFIED_NOW,
    });
    await adapter.open();
    await adapter.saveProject({
      ...copy.projects[0].project,
      name: 'Valid edit after migration',
    }, 0);
    adapter.close();

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.snapshot.projects[0].name).toBe('Valid edit after migration');
  });

  it.each([
    ['project order', (copy: PreparedInitialCopy) => ({
      ...copy.workspace,
      projectOrder: [],
    })],
    ['active project', (copy: PreparedInitialCopy) => ({
      ...copy.workspace,
      activeProjectId: 'missing',
    })],
  ])('returns verification-failed for invalid verified %s', async (_label, corrupt) => {
    const harness = createHarness();
    const copy = await seedCopy(harness, { state: 'verified' });
    await putRaw(harness.indexedDB, 'workspace', corrupt(copy));

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('verification-failed');
  });

  it('returns split-brain when verified legacy no longer matches the accepted digest', async () => {
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ storage });
    await seedCopy(harness, { state: 'verified' });
    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery.kind).toBe('split-brain');
  });

  it('recaptures verified source after hashing when storage event delivery is delayed', async () => {
    const sourceHashStarted = deferred();
    const releaseSourceHash = deferred();
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 2) {
              sourceHashStarted.resolve();
              await releaseSourceHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ storage });
    await seedCopy(harness, { state: 'verified' });
    harness.environment.crypto = crypto;
    const bootstrap = createLocalWorkspaceStore(harness.environment).bootstrap();
    await sourceHashStarted.promise;

    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    releaseSourceHash.resolve();

    const result = await bootstrap;
    expect(recoveryResult(result).recovery.kind).toBe('split-brain');
    harness.dispatchStorage(LEGACY_KEYS.projects);
  });

  it('never publishes verified ready after legacy changes during the final hash', async () => {
    const sourceHashStarted = deferred();
    const releaseSourceHash = deferred();
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 7) {
              sourceHashStarted.resolve();
              await releaseSourceHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ storage });
    await seedCopy(harness, { state: 'verified' });
    harness.environment.crypto = crypto;
    const bootstrap = createLocalWorkspaceStore(harness.environment).bootstrap();
    await sourceHashStarted.promise;

    storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
    harness.dispatchStorage(LEGACY_KEYS.projects);
    releaseSourceHash.resolve();

    const result = await bootstrap;
    expect(recoveryResult(result).recovery.kind).toBe('split-brain');
  });

  it('refreshes verified recovery when legacy changes during capability hashing', async () => {
    const sourceHashStarted = deferred();
    const releaseSourceHash = deferred();
    let legacyDigestCalls = 0;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const text = new TextDecoder().decode(data as never);
          if (text.includes('doctect-legacy-source')) {
            legacyDigestCalls += 1;
            if (legacyDigestCalls === 12) {
              sourceHashStarted.resolve();
              await releaseSourceHash.promise;
            }
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const storage = memoryStorage(validLegacyValues());
    const harness = createHarness({ storage });
    await seedCopy(harness, { state: 'verified' });
    storage.seed(LEGACY_KEYS.projects, JSON.stringify([
      legacyProject('project-a', 11, { name: 'First bootstrap drift' }),
    ]));
    harness.environment.crypto = crypto;
    const bootstrap = createLocalWorkspaceStore(harness.environment).bootstrap();
    await sourceHashStarted.promise;

    storage.seed(LEGACY_KEYS.projects, JSON.stringify([
      legacyProject('project-a', 11, { name: 'Latest bootstrap drift' }),
    ]));
    harness.dispatchStorage(LEGACY_KEYS.projects);
    releaseSourceHash.resolve();

    const result = recoveryResult(await bootstrap);
    const latestDigest = await digestLegacySnapshot(
      captureLegacySnapshot(storage),
      webcrypto.subtle as unknown as SubtleCrypto,
    );
    expect(result.recovery.kind).toBe('split-brain');
    expect((await inspect(harness)).migrationLedger[0].unresolvedRecovery)
      .toMatchObject({ observedLegacyDigest: latestDigest });
  });

  it.each([
    ['legacy-drift', 'split-brain'],
    ['target-mismatch', 'verification-failed'],
    ['unknown-target', 'unrecognized-target'],
  ] as const)('returns stored %s recovery as %s', async (markerKind, publicKind) => {
    const harness = createHarness();
    await seedCopy(harness, { state: 'verified' });
    const stored = (await inspect(harness)).migrationLedger[0];
    await putRaw(harness.indexedDB, 'migrationLedger', {
      ...stored,
      unresolvedRecovery: {
        id: 'stored-recovery',
        kind: markerKind,
        detectedAt: VERIFIED_NOW,
      },
    });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(recoveryResult(result).recovery).toMatchObject({
      recoveryId: 'stored-recovery',
      kind: publicKind,
    });
  });

  it('reconstructs the same stable receipt on every verified bootstrap', async () => {
    const harness = createHarness();
    const firstStore = createLocalWorkspaceStore(harness.environment);
    const first = readyResult(await firstStore.bootstrap());
    const second = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(second.receipt).toEqual(first.receipt);
    expect(second.receipt?.id).toMatch(/^local-storage-to-indexeddb-v1:[a-f0-9]{64}$/);
  });
});

describe('concurrency, retries, and observers', () => {
  it('lets concurrent stores follow one winning native ledger and both become ready', async () => {
    const indexedDB = new IDBFactory();
    const storage = memoryStorage();
    const leftHarness = createHarness({
      indexedDB,
      storage,
      randomUUID: () => 'left-uuid',
      now: () => '2026-08-14T15:00:00.000Z',
    });
    const rightHarness = createHarness({
      indexedDB,
      storage,
      randomUUID: () => 'right-uuid',
      now: () => '2026-08-14T15:00:01.000Z',
    });

    const results = await Promise.all([
      createLocalWorkspaceStore(leftHarness.environment).bootstrap(),
      createLocalWorkspaceStore(rightHarness.environment).bootstrap(),
    ]);

    expect(results.map(result => result.status)).toEqual(['ready', 'ready']);
    const ledgers = (await inspect(leftHarness)).migrationLedger;
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]).toMatchObject({ state: 'verified', ledgerRevision: 1 });
    const projectId = readyResult(results[0]).snapshot.projects[0].id;
    expect(['proj_left-uuid', 'proj_right-uuid']).toContain(projectId);
    expect(readyResult(results[1]).snapshot.projects[0].id).toBe(projectId);
  });

  it('shares one in-flight bootstrap and registers later active observers', async () => {
    const digestStarted = deferred();
    const releaseDigest = deferred();
    let held = false;
    const crypto = {
      subtle: {
        digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          if (!held) {
            held = true;
            digestStarted.resolve();
            await releaseDigest.promise;
          }
          return webcrypto.subtle.digest(algorithm, data as never);
        },
      },
    } as unknown as Crypto;
    const harness = createHarness({ crypto });
    const store = createLocalWorkspaceStore(harness.environment);
    const firstPhases: string[] = [];
    const laterPhases: string[] = [];
    const abortedPhases: string[] = [];
    const firstLost = vi.fn();
    const laterLost = vi.fn();
    const abortedLost = vi.fn();
    const controller = new AbortController();
    const first = store.bootstrap({
      onPhase: phase => firstPhases.push(phase),
      onAuthorityLost: firstLost,
    });
    await digestStarted.promise;
    const second = store.bootstrap({
      onPhase: phase => laterPhases.push(phase),
      onAuthorityLost: laterLost,
    });
    const aborted = store.bootstrap({
      signal: controller.signal,
      onPhase: phase => abortedPhases.push(phase),
      onAuthorityLost: abortedLost,
    });
    controller.abort();

    expect(second).toBe(first);
    expect(aborted).toBe(first);
    releaseDigest.resolve();
    await first;

    expect(firstPhases).toEqual([
      'opening-local-storage',
      'checking-existing-projects',
      'copying-projects',
      'verifying-projects',
      'finishing-upgrade',
    ]);
    expect(laterPhases).toEqual([
      'copying-projects',
      'verifying-projects',
      'finishing-upgrade',
    ]);
    expect(abortedPhases).toEqual([]);

    const upgraded = await openRaw(harness.indexedDB, 2);
    expect(firstLost).toHaveBeenCalledOnce();
    expect(laterLost).toHaveBeenCalledOnce();
    expect(abortedLost).not.toHaveBeenCalled();
    expect(firstLost).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable' }));
    upgraded.close();
  });

  it('publishes the in-flight promise before invoking a reentrant phase observer', async () => {
    const indexedDB = new IDBFactory();
    let opens = 0;
    let copies = 0;
    instrumentFactory(indexedDB, {
      onOpen() {
        opens += 1;
      },
      onTransactionStart(_database, storeNames, mode) {
        if (mode === 'readwrite' && sameStores(storeNames, STORE_NAMES)) copies += 1;
      },
    });
    const harness = createHarness({ indexedDB });
    const store = createLocalWorkspaceStore(harness.environment);
    let reentered = false;
    let reentrant: Promise<WorkspaceBootstrapResult> | undefined;
    const phaseObserved = deferred();

    const first = store.bootstrap({
      onPhase() {
        if (reentered) return;
        reentered = true;
        reentrant = store.bootstrap();
        phaseObserved.resolve();
      },
    });

    await phaseObserved.promise;
    expect(reentrant).toBe(first);
    await expect(first).resolves.toMatchObject({ status: 'ready' });
    expect(opens).toBe(1);
    expect(copies).toBe(1);
  });

  it('caches only ready data while registering cached-call observers before return', async () => {
    const indexedDB = new IDBFactory();
    const opened = trackOpened(indexedDB);
    const harness = createHarness({ indexedDB });
    const store = createLocalWorkspaceStore(harness.environment);
    const first = await store.bootstrap();
    const reads = (harness.storage as MemoryStorage).reads.length;
    const onPhase = vi.fn();
    const onAuthorityLost = vi.fn();

    const second = await store.bootstrap({ onPhase, onAuthorityLost });

    expect(second).toBe(first);
    expect((harness.storage as MemoryStorage).reads).toHaveLength(reads);
    expect(opened).toHaveLength(1);
    expect(onPhase).not.toHaveBeenCalled();

    const rawDatabase = await opened[0];
    forceCloseDatabase(rawDatabase as never);
    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalledOnce());
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('synchronously freezes then restores authority for a byte-identical legacy event', async () => {
    const harness = createHarness();
    const onAuthorityLost = vi.fn();
    const store = createLocalWorkspaceStore(harness.environment);
    await store.bootstrap({ onAuthorityLost });

    harness.dispatchStorage(LEGACY_KEYS.projects);

    expect(onAuthorityLost).not.toHaveBeenCalled();
    await expect(store.commit({ type: 'activate-project', projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'authority-lost' });
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    expect(onAuthorityLost).not.toHaveBeenCalled();
  });

  it('does not cache recovery and succeeds after invalid legacy data is repaired', async () => {
    const storage = memoryStorage(validLegacyValues({ [LEGACY_KEYS.projects]: '{' }));
    const harness = createHarness({ storage });
    const store = createLocalWorkspaceStore(harness.environment);

    const first = await store.bootstrap();
    expect(recoveryResult(first).recovery.kind).toBe('migration-failed');

    storage.seed(LEGACY_KEYS.projects, validLegacyValues()[LEGACY_KEYS.projects]);
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
  });

  it('does not cache transient IndexedDB unavailability', async () => {
    const indexedDB = new IDBFactory();
    const originalOpen = indexedDB.open.bind(indexedDB);
    let fail = true;
    indexedDB.open = ((name: string, version?: number) => {
      if (fail) {
        fail = false;
        throw new DOMException('Temporarily disabled.', 'InvalidStateError');
      }
      return version === undefined ? originalOpen(name) : originalOpen(name, version);
    }) as IDBFactory['open'];
    const harness = createHarness({ indexedDB });
    const store = createLocalWorkspaceStore(harness.environment);

    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'unavailable' });
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'ready' });
  });
});

describe('IndexedDB availability and lifecycle loss', () => {
  it('returns unavailable for a blocked open without inventing recovery', async () => {
    const indexedDB = new IDBFactory();
    const originalOpen = indexedDB.open.bind(indexedDB);
    let dispatched = false;
    indexedDB.open = ((name: string, version?: number) => {
      const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
      if (!dispatched) {
        dispatched = true;
        queueMicrotask(() => request.dispatchEvent(new FakeIDBVersionChangeEvent('blocked', {
          oldVersion: 0,
          newVersion: version ?? null,
        })));
      }
      return request;
    }) as IDBFactory['open'];
    const harness = createHarness({ indexedDB });

    const result = await createLocalWorkspaceStore(harness.environment).bootstrap();

    expect(result).toMatchObject({
      status: 'unavailable',
      message: expect.any(String),
      availableExports: expect.any(Array),
    });
  });

  it('turns connection termination into private unavailability and notifies observers', async () => {
    const indexedDB = new IDBFactory();
    const opened = trackOpened(indexedDB);
    const harness = createHarness({ indexedDB });
    const onAuthorityLost = vi.fn();
    const store = createLocalWorkspaceStore(harness.environment);
    await store.bootstrap({ onAuthorityLost });
    const rawDatabase = await opened[0];

    forceCloseDatabase(rawDatabase as never);

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    ));
    await expect(store.commit({ type: 'activate-project', projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'authority-lost' });
    await expect(store.bootstrap()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('cannot return ready when lifecycle loss occurs during bootstrap', async () => {
    const indexedDB = new IDBFactory();
    let terminated = false;
    instrumentFactory(indexedDB, {
      onTransactionStart(database, storeNames, mode, transaction) {
        if (terminated || mode !== 'readonly' || !sameStores(storeNames, STORE_NAMES)) return;
        terminated = true;
        transaction.addEventListener('complete', () => {
          forceCloseDatabase(database as never);
        }, { once: true });
      },
    });
    const harness = createHarness({ indexedDB });
    const onAuthorityLost = vi.fn();

    const result = await createLocalWorkspaceStore(harness.environment)
      .bootstrap({ onAuthorityLost });

    expect(result.status).toBe('unavailable');
    expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    );
    expect((await inspect(harness)).migrationLedger).toEqual([]);
  });

  it('lets lifecycle loss dominate migration recovery raised during copy', async () => {
    const indexedDB = new IDBFactory();
    let database: IDBDatabase | undefined;
    instrumentFactory(indexedDB, {
      onOpen(opened) {
        database = opened;
      },
    });
    const harness = createHarness({
      indexedDB,
      fault(point) {
        if (point !== 'copy.after-projects') return;
        forceCloseDatabase(database as never);
        throw new Error('copy failed after lifecycle loss');
      },
    });
    const onAuthorityLost = vi.fn();

    const result = await createLocalWorkspaceStore(harness.environment)
      .bootstrap({ onAuthorityLost });

    expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    );
    expect(result.status).toBe('unavailable');
  });

  it('lets lifecycle loss dominate verification recovery raised after independent reads', async () => {
    const indexedDB = new IDBFactory();
    const harness = createHarness({ indexedDB });
    const copy = await seedCopy(harness);
    await putRaw(indexedDB, 'projects', {
      ...copy.projects[0],
      project: { ...copy.projects[0].project, name: 'Corrupt read-back' },
    });
    let terminated = false;
    instrumentFactory(indexedDB, {
      onTransactionStart(database, storeNames, mode, transaction) {
        if (terminated
          || mode !== 'readonly'
          || !sameStores(storeNames, ['legacyBackup'])) {
          return;
        }
        terminated = true;
        transaction.addEventListener('complete', () => {
          forceCloseDatabase(database as never);
        }, { once: true });
      },
    });
    const onAuthorityLost = vi.fn();

    const result = await createLocalWorkspaceStore(harness.environment)
      .bootstrap({ onAuthorityLost });

    expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    );
    expect(result.status).toBe('unavailable');
  });

  it('lets lifecycle loss dominate verification recovery raised during CAS', async () => {
    const indexedDB = new IDBFactory();
    let database: IDBDatabase | undefined;
    instrumentFactory(indexedDB, {
      onOpen(opened) {
        database = opened;
      },
    });
    const harness = createHarness({
      indexedDB,
      fault(point) {
        if (point !== 'mutation.before-complete') return;
        forceCloseDatabase(database as never);
        throw new Error('CAS failed after lifecycle loss');
      },
    });
    const onAuthorityLost = vi.fn();

    const result = await createLocalWorkspaceStore(harness.environment)
      .bootstrap({ onAuthorityLost });

    expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable' }),
    );
    expect(result.status).toBe('unavailable');
  });
});
