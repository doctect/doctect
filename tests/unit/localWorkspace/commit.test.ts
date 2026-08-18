// @vitest-environment node
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
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
  createLocalWorkspaceStore as createProductionLocalWorkspaceStore,
  type LocalWorkspaceEnvironment,
} from '../../../services/localWorkspace';
import { createLocalWorkspaceStoreForTesting } from '../../../services/localWorkspace/LocalWorkspaceStore';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type WorkspaceCommand,
  type WorkspaceCustomPreset,
  type WorkspaceImportInput,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../../services/localWorkspace/contracts';
import type { WorkspaceFaultPoint } from '../../../services/localWorkspace/faults';
import {
  createIndexedDbAdapter,
  type IndexedDbInspection,
} from '../../../services/localWorkspace/indexedDbAdapter';
import {
  canonicalStringify,
  sha256Hex,
} from '../../../services/localWorkspace/canonical';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_DB_VERSION,
  storedProjectLineage,
} from '../../../services/localWorkspace/schema';
import {
  getInstalledProjectAuthorityToken,
  inheritInstalledProjectAuthority,
} from '../../../services/localWorkspace/projectAuthority';
import {
  LEGACY_KEYS,
  MemoryStorage,
  currentState,
  historicalState,
  legacyCustomPreset,
  legacyProject,
  memoryStorage,
  secondProject,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const TEST_NOW = '2026-08-14T17:00:00.000Z';
const READ_ALL_SCOPE = ['projects', 'workspace', 'presets', 'pendingImports'] as const;
const ALL_STORES = [
  'projects',
  'workspace',
  'presets',
  'pendingImports',
  'migrationLedger',
  'legacyBackup',
] as const;

beforeAll(() => Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
}));

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface TransactionRecord {
  stores: string[];
  mode: IDBTransactionMode;
}

interface TransactionHook {
  (
    stores: string[],
    mode: IDBTransactionMode,
    transaction: IDBTransaction,
  ): void;
}

const sameStores = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && expected.every(store => actual.includes(store));

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
        hook?.(stores, effectiveMode, transaction);
        return transaction;
      }) as IDBDatabase['transaction'];
    });
    return request;
  }) as IDBFactory['open'];
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

const invokeListener = (
  listener: EventListenerOrEventListenerObject,
  event: Event,
): void => {
  if (typeof listener === 'function') listener(event);
  else listener.handleEvent(event);
};

const transactionCompletionHold = (scope: readonly string[]) => {
  const started = deferred();
  const committed = deferred();
  const release = deferred();
  let armed = false;
  let held = false;
  return {
    started: started.promise,
    committed: committed.promise,
    release: () => release.resolve(),
    arm: () => { armed = true; },
    hook(stores: string[], mode: IDBTransactionMode, transaction: IDBTransaction) {
      if (!armed || held || mode !== 'readwrite' || !sameStores(stores, scope)) return;
      held = true;
      const addEventListener = transaction.addEventListener.bind(transaction);
      transaction.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type !== 'complete') {
          return addEventListener(type, listener, options);
        }
        return addEventListener(type, event => {
          committed.resolve();
          void release.promise.then(() => invokeListener(listener, event));
        }, options);
      }) as IDBTransaction['addEventListener'];
      started.resolve();
    },
  };
};

const rebootstrapReadGuard = () => {
  let armed = false;
  let postCommandReadStarted = false;
  return {
    arm: () => { armed = true; },
    hook(stores: string[], mode: IDBTransactionMode) {
      if (!armed || mode !== 'readonly') return;
      if (sameStores(stores, READ_ALL_SCOPE)) postCommandReadStarted = true;
      if (sameStores(stores, ALL_STORES) && !postCommandReadStarted) {
        throw new Error('Bootstrap read overlapped an undrained mutation queue.');
      }
    },
  };
};

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

const putRaw = async (
  indexedDB: IDBFactory,
  storeName: 'migrationLedger' | 'workspace' | 'projects' | 'pendingImports',
  value: unknown,
): Promise<void> => {
  const database = await requestResult(indexedDB.open(WORKSPACE_DB_NAME));
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  database.close();
};

const projectNamed = (
  name: string,
  id = 'project-a',
): WorkspaceProject => legacyProject(id, 11, { name }) as WorkspaceProject;

const trustedProjectNamed = (
  source: WorkspaceProject,
  name: string,
): WorkspaceProject => {
  const project = { ...source, name };
  inheritInstalledProjectAuthority(project, source);
  return project;
};

const blankProject = (id = 'blank-project'): WorkspaceProject => ({
  id,
  name: 'Blank Project',
  initialState: currentState(),
});

const presetNamed = (
  id: string,
  title = id,
): WorkspaceCustomPreset => legacyCustomPreset(id, 11, { title }) as WorkspaceCustomPreset;

const pendingImport = (
  id: string,
  targetProjectId: string,
  state: unknown = currentState(),
): WorkspaceImportInput => ({
  id,
  targetProjectId,
  name: `Import ${id}`,
  state,
  createdAt: TEST_NOW,
});

const forkAttempt = (payloadDigit: string) => ({
  sourceKeyDigest: '1'.repeat(64),
  payloadDigest: payloadDigit.repeat(64),
});

const forkPendingImport = (
  owner: 'a' | 'b',
  id = `fork-import-${owner}`,
  targetProjectId = `fork-target-${owner}`,
): WorkspaceImportInput => ({
  ...pendingImport(id, targetProjectId),
  name: `Account ${owner.toUpperCase()} fork`,
  cloud: {
    projectId: `private-project-${owner}`,
    lastSyncedCommitId: `private-commit-${owner}`,
  },
});

const replaceForkImportCommand = (
  oldPending = forkPendingImport('a'),
  replacement = forkPendingImport('b'),
): Extract<WorkspaceCommand, { type: 'replace-staged-import' }> => ({
  type: 'replace-staged-import',
  expected: {
    importId: oldPending.id,
    targetProjectId: oldPending.targetProjectId,
    createdAt: oldPending.createdAt,
    ...forkAttempt('2'),
  },
  replacement: {
    pendingImport: replacement,
    attemptProvenance: forkAttempt('3'),
  },
});

const twoProjectValues = (): Record<string, string> => validLegacyValues({
  [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
  [LEGACY_KEYS.activeProject]: 'project-a',
});

const useQueueTimers = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
};

const writeTransactions = (records: TransactionRecord[]): TransactionRecord[] =>
  records.filter(record => record.mode === 'readwrite');

const NO_FAULT = Symbol('no-fault');

interface HarnessOptions {
  values?: Record<string, string>;
  hook?: TransactionHook;
  prepareProject?: (project: WorkspaceProject) => Promise<WorkspaceProject>;
}

interface Harness {
  environment: LocalWorkspaceEnvironment;
  indexedDB: IDBFactory;
  records: TransactionRecord[];
  storage: MemoryStorage;
  setFault(error?: unknown): void;
  dispatchStorage(key: string | null): void;
}

const createHarness = (options: HarnessOptions = {}): Harness => {
  const indexedDB = new IDBFactory();
  const records: TransactionRecord[] = [];
  instrumentFactory(indexedDB, records, options.hook);
  const storage = memoryStorage(options.values ?? validLegacyValues());
  const listeners = new Set<(event: StorageEvent) => void>();
  let fault: unknown | typeof NO_FAULT = NO_FAULT;
  const environment: LocalWorkspaceEnvironment = {
    indexedDB,
    legacyStorage: storage,
    addStorageListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    crypto: webcrypto as unknown as Crypto,
    now: () => TEST_NOW,
    randomUUID: () => 'fixture-uuid',
    createBlankProject: currentState,
    fault(point) {
      if (point === 'mutation.before-complete' && fault !== NO_FAULT) throw fault;
    },
  };
  return {
    environment,
    indexedDB,
    records,
    storage,
    setFault(error = NO_FAULT) {
      fault = error;
    },
    dispatchStorage(key) {
      const event = { key } as StorageEvent;
      for (const listener of listeners) listener(event);
    },
  };
};

const createLocalWorkspaceStore = (
  environment: LocalWorkspaceEnvironment,
  prepareProject?: (project: WorkspaceProject) => Promise<WorkspaceProject>,
): LocalWorkspaceStore => createLocalWorkspaceStoreForTesting(
  environment,
  WORKSPACE_DB_VERSION,
  prepareProject,
);

const readyStore = async (
  options: HarnessOptions = {},
): Promise<{
  store: LocalWorkspaceStore;
  harness: Harness;
  snapshot: WorkspaceSnapshot;
}> => {
  const harness = createHarness(options);
  const store = createLocalWorkspaceStore(harness.environment, options.prepareProject);
  const result = await store.bootstrap();
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(`Expected ready, got ${result.status}.`);
  harness.records.length = 0;
  return { store, harness, snapshot: result.snapshot };
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

describe('semantic transaction scopes', () => {
  const cases: Array<{
    label: string;
    scope: readonly string[];
    command(snapshot: WorkspaceSnapshot): WorkspaceCommand;
    debounce?: boolean;
  }> = [
    {
      label: 'save-project',
      scope: ['projects', 'migrationLedger'],
      command: snapshot => ({
        type: 'save-project',
        project: trustedProjectNamed(snapshot.projects[0], 'Saved'),
      }),
      debounce: true,
    },
    {
      label: 'create-and-activate-project',
      scope: ['projects', 'workspace', 'migrationLedger'],
      command: () => ({ type: 'create-and-activate-project', project: projectNamed('New', 'new-project') }),
    },
    {
      label: 'activate-project',
      scope: ['projects', 'workspace', 'migrationLedger'],
      command: () => ({ type: 'activate-project', projectId: 'project-a' }),
    },
    {
      label: 'close-project',
      scope: ['projects', 'workspace', 'migrationLedger'],
      command: () => ({ type: 'close-project', projectId: 'project-a', successor: blankProject() }),
    },
    {
      label: 'save-custom-preset',
      scope: ['presets', 'migrationLedger'],
      command: () => ({ type: 'save-custom-preset', preset: presetNamed('preset-new') }),
    },
    {
      label: 'delete-custom-preset',
      scope: ['presets', 'migrationLedger'],
      command: () => ({ type: 'delete-custom-preset', presetId: 'preset-a' }),
    },
    {
      label: 'stage-import',
      scope: ['pendingImports', 'projects', 'migrationLedger'],
      command: () => ({ type: 'stage-import', pendingImport: pendingImport('import-new', 'target-new') }),
    },
    {
      label: 'consume-import',
      scope: ['pendingImports', 'projects', 'workspace', 'migrationLedger'],
      command: snapshot => ({ type: 'consume-import', importId: snapshot.pendingImports[0].id }),
    },
  ];

  it.each(cases)('$label uses only its required atomic write scope', async testCase => {
    const { store, harness, snapshot } = await readyStore();
    if (testCase.debounce) useQueueTimers();

    const committed = store.commit(testCase.command(snapshot));
    if (testCase.debounce) await vi.advanceTimersByTimeAsync(1_000);
    await committed;

    expect(writeTransactions(harness.records)).toHaveLength(1);
    expect(sameStores(writeTransactions(harness.records)[0].stores, testCase.scope)).toBe(true);
    expect(harness.records.some(record =>
      record.mode === 'readonly' && sameStores(record.stores, READ_ALL_SCOPE))).toBe(true);
  });
});

describe('project save queues', () => {
  it('reuses project authority identity across readbacks when installed revisions are unchanged', async () => {
    const { store } = await readyStore({ values: twoProjectValues() });

    const first = await store.commit({ type: 'activate-project', projectId: 'project-b' });
    const second = await store.commit({ type: 'activate-project', projectId: 'project-a' });

    const firstA = first.projects.find(project => project.id === 'project-a')!;
    const firstB = first.projects.find(project => project.id === 'project-b')!;
    const firstAToken = getInstalledProjectAuthorityToken(firstA);
    const firstBToken = getInstalledProjectAuthorityToken(firstB);
    expect(firstAToken).toBeDefined();
    expect(firstBToken).toBeDefined();
    expect(getInstalledProjectAuthorityToken(
      second.projects.find(project => project.id === 'project-a')!,
    )).toBe(firstAToken);
    expect(getInstalledProjectAuthorityToken(
      second.projects.find(project => project.id === 'project-b')!,
    )).toBe(firstBToken);
  });

  it('replaces only a project whose installed revision changed in another store', async () => {
    const { store, harness } = await readyStore({ values: twoProjectValues() });
    const initialRecord = (await inspect(harness)).projects.find(record => record.id === 'project-a')!;
    const before = await store.commit({ type: 'activate-project', projectId: 'project-b' });
    const beforeA = before.projects.find(project => project.id === 'project-a');
    const beforeB = before.projects.find(project => project.id === 'project-b');
    const beforeAToken = getInstalledProjectAuthorityToken(beforeA!);
    const beforeBToken = getInstalledProjectAuthorityToken(beforeB!);
    const foreign = createIndexedDbAdapter({ indexedDB: harness.indexedDB, now: () => TEST_NOW });
    const foreignA = (await foreign.inspect()).projects.find(record => record.id === 'project-a')!;
    await foreign.saveProject(projectNamed('Foreign A'), storedProjectLineage(foreignA));

    const observed = await store.commit({ type: 'activate-project', projectId: 'project-a' });

    const observedA = observed.projects.find(project => project.id === 'project-a')!;
    const observedB = observed.projects.find(project => project.id === 'project-b')!;
    expect(getInstalledProjectAuthorityToken(observedA)).not.toBe(beforeAToken);
    expect(observedA.name).toBe('Foreign A');
    expect(getInstalledProjectAuthorityToken(observedB)).toBe(beforeBToken);
    const foreignRecord = (await foreign.inspect()).projects.find(record => record.id === 'project-a')!;
    expect(foreignRecord.incarnation).toBe(initialRecord.incarnation);
    expect(foreignRecord.storageRevision).toBe(initialRecord.storageRevision + 1);
    foreign.close();
  });

  it('preserves authority identity for the exact revision written by an own save', async () => {
    const { store, harness, snapshot } = await readyStore();
    const initialRecord = (await inspect(harness)).projects.find(record => record.id === 'project-a')!;
    const before = snapshot.projects.find(project => project.id === 'project-a')!;
    const beforeToken = getInstalledProjectAuthorityToken(before);
    expect(beforeToken).toBeDefined();
    useQueueTimers();

    const saving = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(before, 'Own save'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const saved = await saving;
    const savedProject = saved.projects.find(project => project.id === 'project-a')!;

    expect(savedProject.name).toBe('Own save');
    expect(getInstalledProjectAuthorityToken(savedProject)).toBe(beforeToken);
    const savedRecord = (await inspect(harness)).projects.find(record => record.id === 'project-a')!;
    expect(savedRecord.incarnation).toBe(initialRecord.incarnation);
    expect(savedRecord.storageRevision).toBe(initialRecord.storageRevision + 1);
  });

  it('adopts a same-id replacement incarnation and rejects the stale incarnation save', async () => {
    const { store: staleStore, harness, snapshot } = await readyStore({
      values: twoProjectValues(),
    });
    const replacingStore = createLocalWorkspaceStore(harness.environment);
    const replacingBootstrap = await replacingStore.bootstrap();
    expect(replacingBootstrap.status).toBe('ready');
    if (replacingBootstrap.status !== 'ready') return;
    const staleA = snapshot.projects.find(project => project.id === 'project-a')!;
    const staleToken = getInstalledProjectAuthorityToken(staleA);
    const staleRecord = (await inspect(harness)).projects.find(record => record.id === 'project-a')!;
    const replacementA = projectNamed('Replacement A');

    await replacingStore.commit({ type: 'close-project', projectId: 'project-a' });
    harness.environment.randomUUID = () => 'replacement-incarnation';
    await replacingStore.commit({ type: 'create-and-activate-project', project: replacementA });

    useQueueTimers();
    const readback = staleStore.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-b')!,
        'Stale store B save',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const observed = await readback;
    const observedA = observed.projects.find(project => project.id === 'project-a')!;
    const staleSave = staleStore.commit({ type: 'save-project', project: staleA });
    const staleResultPromise = staleSave.then(
      () => ({ status: 'fulfilled' as const }),
      error => ({ status: 'rejected' as const, error }),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    const staleResult = await staleResultPromise;
    const durableA = (await inspect(harness)).projects.find(record => record.id === 'project-a')!;

    expect(observedA.name).toBe('Replacement A');
    expect(getInstalledProjectAuthorityToken(observedA)).not.toBe(staleToken);
    expect(staleResult).toMatchObject({ status: 'rejected', error: { code: 'conflict' } });
    expect(durableA.project.name).toBe('Replacement A');
    expect(durableA.storageRevision).toBe(0);
    expect(durableA.incarnation).not.toBe(staleRecord.incarnation);
  });

  it('rejects a tokenless old clone after adopting a same-id replacement', async () => {
    const { store: staleStore, harness, snapshot } = await readyStore({
      values: twoProjectValues(),
    });
    const replacingStore = createLocalWorkspaceStore(harness.environment);
    await expect(replacingStore.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    const tokenlessOldA = structuredClone(
      snapshot.projects.find(project => project.id === 'project-a')!,
    );

    await replacingStore.commit({ type: 'close-project', projectId: 'project-a' });
    harness.environment.randomUUID = () => 'tokenless-replacement-incarnation';
    await replacingStore.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Tokenless replacement'),
    });

    useQueueTimers();
    const readback = staleStore.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-b')!,
        'Read replacement through B',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(readback).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'project-a', name: 'Tokenless replacement' }),
      ]),
    });
    const staleSave = staleStore.commit({ type: 'save-project', project: tokenlessOldA });
    const staleSaveAssertion = expect(staleSave).rejects.toMatchObject({ code: 'conflict' });
    await vi.advanceTimersByTimeAsync(1_000);

    await staleSaveAssertion;
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({
        incarnation: 'tokenless-replacement-incarnation',
        storageRevision: 0,
        project: { name: 'Tokenless replacement' },
      });
  });

  it('coalesces rapid saves and persists only the newest project', async () => {
    const { store, harness, snapshot } = await readyStore();
    const source = snapshot.projects.find(project => project.id === 'project-a')!;
    useQueueTimers();

    const first = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'A'),
    });
    const second = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'B'),
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(writeTransactions(harness.records)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe(secondResult);
    expect(getInstalledProjectAuthorityToken(
      firstResult.projects.find(project => project.id === source.id)!,
    )).toBe(getInstalledProjectAuthorityToken(source));
    expect(firstResult.projects.find(project => project.id === 'project-a')?.name).toBe('B');
    expect(secondResult.projects.find(project => project.id === 'project-a')?.name).toBe('B');
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ project: { name: 'B' }, storageRevision: 1 });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(1);
    expect(harness.records.filter(record =>
      record.mode === 'readonly' && sameStores(record.stores, READ_ALL_SCOPE))).toHaveLength(1);
  });

  it('keeps caller mutation out of durable state and unrelated command readbacks', async () => {
    const { store, harness, snapshot } = await readyStore();
    const source = snapshot.projects[0];
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Durable saved name'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const publication = await save;
    publication.projects.find(project => project.id === source.id)!.name = 'Caller mutation';

    const laterReadback = await store.commit({
      type: 'save-custom-preset',
      preset: presetNamed('unrelated-preset'),
    });
    const durable = await inspect(harness);

    expect(laterReadback.projects.find(project => project.id === source.id)?.name)
      .toBe('Durable saved name');
    expect(durable.projects.find(record => record.id === source.id)?.project.name)
      .toBe('Durable saved name');
  });

  it('admits cloned bytes before debounce and prepares only the newest physical payload', async () => {
    const prepareProject = vi.fn(async (project: WorkspaceProject) => structuredClone(project));
    const { store, harness, snapshot } = await readyStore({ prepareProject });
    const source = snapshot.projects.find(project => project.id === 'project-a')!;
    const firstPayload = structuredClone(source);
    firstPayload.name = 'First admitted';
    inheritInstalledProjectAuthority(firstPayload, source);
    const newestPayload = structuredClone(source);
    newestPayload.name = 'Newest admitted';
    inheritInstalledProjectAuthority(newestPayload, source);
    useQueueTimers();

    const first = store.commit({ type: 'save-project', project: firstPayload });
    firstPayload.name = 'Mutated first caller bytes';
    firstPayload.initialState.nodes[firstPayload.initialState.rootId].title = 'Mutated first state';
    const newest = store.commit({ type: 'save-project', project: newestPayload });
    newestPayload.name = 'Mutated newest caller bytes';
    newestPayload.initialState.nodes[newestPayload.initialState.rootId].title = 'Mutated newest state';

    await vi.advanceTimersByTimeAsync(999);
    expect(prepareProject).not.toHaveBeenCalled();
    expect(writeTransactions(harness.records)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    const [firstResult, newestResult] = await Promise.all([first, newest]);

    expect(prepareProject).toHaveBeenCalledOnce();
    expect(prepareProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Newest admitted',
    }));
    expect(firstResult).toBe(newestResult);
    expect(firstResult.projects.find(project => project.id === source.id)).toMatchObject({
      name: 'Newest admitted',
      initialState: {
        nodes: {
          [source.initialState.rootId]: {
            title: source.initialState.nodes[source.initialState.rootId].title,
          },
        },
      },
    });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(1);
  });

  it('defers full invalid-project rejection until physical preparation', async () => {
    const { store, harness, snapshot } = await readyStore();
    const invalid = trustedProjectNamed(snapshot.projects[0], 'Future schema');
    invalid.initialState = {
      ...invalid.initialState,
      schemaVersion: 12,
    } as WorkspaceProject['initialState'];
    useQueueTimers();
    let settled = false;

    const save = store.commit({ type: 'save-project', project: invalid });
    const outcome = save.then(
      value => ({ status: 'fulfilled' as const, value }),
      error => ({ status: 'rejected' as const, error }),
    ).finally(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    expect(writeTransactions(harness.records)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toMatchObject({
      status: 'rejected',
      error: { code: 'validation' },
    });
    expect(writeTransactions(harness.records)).toHaveLength(0);
  });

  it('rejects all coalesced waiters with one preparation failure and performs no write', async () => {
    const failure = new WorkspaceStoreError('Preparation worker failed.', 'unavailable');
    const prepareProject = vi.fn(async (): Promise<WorkspaceProject> => { throw failure; });
    const { store, harness, snapshot } = await readyStore({ prepareProject });
    const source = snapshot.projects[0];
    useQueueTimers();

    const first = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'First'),
    });
    const second = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Second'),
    });
    const outcomes = Promise.all([
      first.then(() => undefined, error => error),
      second.then(() => undefined, error => error),
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    const [firstError, secondError] = await outcomes;

    expect(prepareProject).toHaveBeenCalledOnce();
    expect(firstError).toBe(failure);
    expect(secondError).toBe(failure);
    expect(writeTransactions(harness.records)).toHaveLength(0);
    expect((await inspect(harness)).projects.find(record => record.id === source.id)?.project.name)
      .toBe(source.name);
  });

  it('fails closed when production project preparation Worker is unsupported', async () => {
    expect(globalThis.Worker).toBeUndefined();
    const harness = createHarness();
    const store = createProductionLocalWorkspaceStore(harness.environment);
    const bootstrap = await store.bootstrap();
    expect(bootstrap.status).toBe('ready');
    if (bootstrap.status !== 'ready') return;
    const before = await inspect(harness);
    harness.records.length = 0;
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(bootstrap.snapshot.projects[0], 'Must not persist'),
    });
    const saveAssertion = expect(save).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(1_000);

    await saveAssertion;
    expect(writeTransactions(harness.records)).toHaveLength(0);
    expect(await inspect(harness)).toEqual(before);
  });

  it('rejects a same-id malformed Worker project before any adapter write', async () => {
    class MalformedProjectWorker {
      private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

      addEventListener(type: string, listener: (event: unknown) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      postMessage(message: unknown): void {
        const requestId = (message as { requestId?: unknown }).requestId;
        for (const listener of this.listeners.get('message') ?? []) {
          listener({
            data: {
              type: 'project-prepared',
              requestId,
              project: { id: 'project-a' },
            },
          });
        }
      }

      terminate(): void {}
    }
    vi.stubGlobal('Worker', MalformedProjectWorker);
    const harness = createHarness();
    const store = createProductionLocalWorkspaceStore(harness.environment);
    const bootstrap = await store.bootstrap();
    expect(bootstrap.status).toBe('ready');
    if (bootstrap.status !== 'ready') return;
    const before = await inspect(harness);
    harness.records.length = 0;
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(bootstrap.snapshot.projects[0], 'Must remain open'),
    });
    const saveAssertion = expect(save).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(1_000);

    await saveAssertion;
    expect(writeTransactions(harness.records)).toHaveLength(0);
    expect(await inspect(harness)).toEqual(before);
  });

  it.each([
    ['invalid current state', () => ({
      prepared: { id: 'project-a', name: 'Invalid state', initialState: {} },
    })],
    ['cyclic state', () => {
      const initialState = currentState() as unknown as Record<string, unknown>;
      initialState.cycle = initialState;
      return { prepared: { id: 'project-a', name: 'Cyclic state', initialState } };
    }],
    ['nested custom prototype', () => {
      const initialState = currentState();
      initialState.nodes.root.data = Object.assign(
        Object.create(null),
        initialState.nodes.root.data,
      );
      return { prepared: { id: 'project-a', name: 'Custom prototype', initialState } };
    }],
    ['nested accessor', () => {
      const initialState = currentState();
      const getter = vi.fn(() => { throw new Error('hostile nested getter ran'); });
      Object.defineProperty(initialState.nodes.root.data, 'hostile', {
        enumerable: true,
        get: getter,
      });
      return {
        prepared: { id: 'project-a', name: 'Nested accessor', initialState },
        getter,
      };
    }],
  ] as const)('rejects a deeply malformed Worker project before storage: %s', async (
    _label,
    create,
  ) => {
    const response = create();
    class MalformedProjectWorker {
      private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

      addEventListener(type: string, listener: (event: unknown) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      postMessage(message: unknown): void {
        const requestId = (message as { requestId?: unknown }).requestId;
        for (const listener of this.listeners.get('message') ?? []) {
          listener({
            data: {
              type: 'project-prepared',
              requestId,
              project: response.prepared,
            },
          });
        }
      }

      terminate(): void {}
    }
    vi.stubGlobal('Worker', MalformedProjectWorker);
    const harness = createHarness();
    const store = createProductionLocalWorkspaceStore(harness.environment);
    const bootstrap = await store.bootstrap();
    expect(bootstrap.status).toBe('ready');
    if (bootstrap.status !== 'ready') return;
    const before = await inspect(harness);
    harness.records.length = 0;
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(bootstrap.snapshot.projects[0], 'Must remain open'),
    });
    const saveAssertion = expect(save).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(1_000);

    await saveAssertion;
    if ('getter' in response) expect(response.getter).not.toHaveBeenCalled();
    expect(writeTransactions(harness.records)).toHaveLength(0);
    expect(harness.records.filter(record =>
      record.mode === 'readonly' && sameStores(record.stores, READ_ALL_SCOPE))).toHaveLength(0);
    expect(await inspect(harness)).toEqual(before);
  });

  it('retains exactly one newest follow-up while a project save is in flight', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store, harness, snapshot } = await readyStore({ hook: hold.hook });
    const source = snapshot.projects.find(project => project.id === 'project-a')!;
    useQueueTimers();
    hold.arm();

    const first = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'A'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    const second = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'B'),
    });
    const third = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'C'),
    });
    hold.release();

    const results = await Promise.all([first, second, third]);
    expect(results[1].projects.find(project => project.id === 'project-a')?.name).toBe('C');
    expect(results[2].projects.find(project => project.id === 'project-a')?.name).toBe('C');
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ project: { name: 'C' }, storageRevision: 2 });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(2);
  });

  it('keeps a queued stale intent pinned while an unrelated readback sees a newer revision', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store: storeA, harness, snapshot } = await readyStore({
      values: twoProjectValues(),
      hook: hold.hook,
    });
    const initialAToken = getInstalledProjectAuthorityToken(
      snapshot.projects.find(project => project.id === 'project-a')!,
    );
    const storeB = createLocalWorkspaceStore(harness.environment);
    const storeBBootstrap = await storeB.bootstrap();
    expect(storeBBootstrap.status).toBe('ready');
    if (storeBBootstrap.status !== 'ready') return;
    useQueueTimers();
    hold.arm();

    const unrelated = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-b')!,
        'Store A unrelated',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    const stale = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-a')!,
        'Store A stale',
      ),
    });
    const coalesced = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-a')!,
        'Store A newest stale',
      ),
    });
    const staleAssertions = Promise.all([
      expect(stale).rejects.toMatchObject({ code: 'conflict' }),
      expect(coalesced).rejects.toMatchObject({ code: 'conflict' }),
    ]);

    const foreign = storeB.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        storeBBootstrap.snapshot.projects.find(project => project.id === 'project-a')!,
        'Store B durable',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    hold.release();
    await foreign;

    const unrelatedResult = await unrelated;
    expect(unrelatedResult.projects.find(project => project.id === 'project-a')?.name)
      .toBe('Store B durable');
    expect(getInstalledProjectAuthorityToken(
      unrelatedResult.projects.find(project => project.id === 'project-a')!,
    )).not.toBe(initialAToken);
    await staleAssertions;
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({
        project: { name: 'Store B durable' },
        storageRevision: 1,
      });
  });

  it('restores installed replacement lineage after a terminally conflicted pin releases', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store: storeA, harness, snapshot } = await readyStore({
      values: twoProjectValues(),
      hook: hold.hook,
    });
    const replacementStore = createLocalWorkspaceStore(harness.environment);
    await expect(replacementStore.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    useQueueTimers();
    hold.arm();

    const heldB = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-b')!,
        'Held B',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    await hold.committed;
    const pinnedA = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-a')!,
        'Pinned old A',
      ),
    });
    const pinnedAssertion = expect(pinnedA).rejects.toMatchObject({ code: 'conflict' });
    await vi.advanceTimersByTimeAsync(1_000);
    await replacementStore.commit({ type: 'close-project', projectId: 'project-a' });
    harness.environment.randomUUID = () => 'failed-pin-replacement-incarnation';
    await replacementStore.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Replacement A'),
    });
    hold.release();

    await expect(heldB).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'project-a', name: 'Replacement A' }),
      ]),
    });
    await pinnedAssertion;
    await expect(storeA.commit({
      type: 'close-project',
      projectId: 'project-a',
    })).resolves.toMatchObject({
      projects: [expect.objectContaining({ id: 'project-b' })],
    });
    await expect(storeA.commit({
      type: 'close-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'validation' });
    expect((await inspect(harness)).projects.map(record => record.id)).toEqual(['project-b']);
  });

  it('pins a follow-up behind an in-flight save to that local write lineage', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store: storeA, harness, snapshot } = await readyStore({ hook: hold.hook });
    const source = snapshot.projects.find(project => project.id === 'project-a')!;
    const initialLineage = storedProjectLineage(
      (await inspect(harness)).projects.find(record => record.id === 'project-a')!,
    );
    useQueueTimers();
    hold.arm();

    const first = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Store A first'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    const followUp = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Store A follow-up'),
    });
    const followUpAssertion = expect(followUp).rejects.toMatchObject({ code: 'conflict' });

    const other = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => TEST_NOW,
    });
    const foreign = other.saveProject(
      projectNamed('Store B after first'),
      { ...initialLineage, revision: initialLineage.revision + 1 },
    );
    hold.release();
    await foreign;

    await expect(first).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'project-a', name: 'Store B after first' }),
      ]),
    });
    await followUpAssertion;
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({
        project: { name: 'Store B after first' },
        storageRevision: 2,
      });
    other.close();
  });

  it('adopts a foreign post-save revision after the local save lineage drains', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store: storeA, harness, snapshot } = await readyStore({ hook: hold.hook });
    const source = snapshot.projects.find(project => project.id === 'project-a')!;
    const initialLineage = storedProjectLineage(
      (await inspect(harness)).projects.find(record => record.id === 'project-a')!,
    );
    useQueueTimers();
    hold.arm();

    const first = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Store A first'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;

    const other = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => TEST_NOW,
    });
    const foreign = other.saveProject(
      projectNamed('Store B after first'),
      { ...initialLineage, revision: initialLineage.revision + 1 },
    );
    hold.release();
    await foreign;

    const firstResult = await first;
    expect(firstResult).toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'project-a', name: 'Store B after first' }),
      ]),
    });
    await vi.advanceTimersByTimeAsync(0);

    const basedOnObserved = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        firstResult.projects.find(project => project.id === 'project-a')!,
        'Store A based on observed revision',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(basedOnObserved).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({
          id: 'project-a',
          name: 'Store A based on observed revision',
        }),
      ]),
    });
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ storageRevision: 3 });
    other.close();
  });

  it('adopts a newer revision for a project with no admitted local intent', async () => {
    const { store: storeA, harness, snapshot } = await readyStore({ values: twoProjectValues() });
    const storeB = createLocalWorkspaceStore(harness.environment);
    const storeBBootstrap = await storeB.bootstrap();
    expect(storeBBootstrap.status).toBe('ready');
    if (storeBBootstrap.status !== 'ready') return;
    useQueueTimers();

    const foreign = storeB.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        storeBBootstrap.snapshot.projects.find(project => project.id === 'project-a')!,
        'Store B durable',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await foreign;

    const unrelated = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-b')!,
        'Store A unrelated',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const observed = await unrelated;
    const observedProject = observed.projects.find(project => project.id === 'project-a');
    expect(observedProject?.name).toBe('Store B durable');
    expect(observed.projects.find(project => project.id === 'project-b')?.name)
      .toBe('Store A unrelated');

    const saveAfterObservation = storeA.commit({
      type: 'save-project',
      project: trustedProjectNamed(observedProject!, 'Store A based on observed revision'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(saveAfterObservation).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({
          id: 'project-a',
          name: 'Store A based on observed revision',
        }),
      ]),
    });
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ storageRevision: 2 });
  });

  it('drains earlier saves before crossing a structural command barrier', async () => {
    const { store, harness, snapshot } = await readyStore({ values: twoProjectValues() });

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'Before barrier'),
    });
    const activate = store.commit({ type: 'activate-project', projectId: 'project-b' });
    const [saved, activated] = await Promise.all([save, activate]);

    expect(saved.projects.find(project => project.id === 'project-a')?.name).toBe('Before barrier');
    expect(activated).toMatchObject({ activeProjectId: 'project-b' });
    const writes = writeTransactions(harness.records);
    expect(writes).toHaveLength(2);
    expect(sameStores(writes[0].stores, ['projects', 'migrationLedger'])).toBe(true);
    expect(sameStores(writes[1].stores, ['projects', 'workspace', 'migrationLedger'])).toBe(true);
  });

  it('does not start a later save until an in-flight structural barrier finishes', async () => {
    const structuralScope = ['projects', 'workspace', 'migrationLedger'] as const;
    const hold = transactionCompletionHold(structuralScope);
    const { store, harness, snapshot } = await readyStore({
      values: twoProjectValues(),
      hook: hold.hook,
    });
    useQueueTimers();
    hold.arm();

    const activate = store.commit({ type: 'activate-project', projectId: 'project-b' });
    await hold.started;
    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'After barrier'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(0);

    hold.release();
    await Promise.all([activate, save]);
    const writes = writeTransactions(harness.records);
    expect(sameStores(writes[0].stores, structuralScope)).toBe(true);
    expect(sameStores(writes[1].stores, ['projects', 'migrationLedger'])).toBe(true);
  });

  it('freezes new work immediately while allowing accepted queued saves to drain', async () => {
    const { store, harness, snapshot } = await readyStore();
    const source = snapshot.projects[0];
    useQueueTimers();

    const accepted = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Accepted'),
    });
    harness.dispatchStorage(LEGACY_KEYS.projects);
    await expect(store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Rejected'),
    })).rejects.toMatchObject({ code: 'authority-lost' });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(accepted).resolves.toMatchObject({
      projects: expect.arrayContaining([expect.objectContaining({ name: 'Accepted' })]),
    });
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a')?.project.name)
      .toBe('Accepted');
  });

  it('drains a queued save before rebootstrap reads and installs durable state', async () => {
    const guard = rebootstrapReadGuard();
    const { store, harness, snapshot } = await readyStore({ hook: guard.hook });
    useQueueTimers();
    guard.arm();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'Before reload'),
    });
    harness.dispatchStorage(LEGACY_KEYS.projects);
    const rebootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    await save;
    await expect(rebootstrap).resolves.toMatchObject({
      status: 'ready',
      snapshot: {
        projects: expect.arrayContaining([
          expect.objectContaining({ id: 'project-a', name: 'Before reload' }),
        ]),
      },
    });
  });

  it('drains an in-flight save before rebootstrap starts a read transaction', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const guard = rebootstrapReadGuard();
    const hook: TransactionHook = (stores, mode, transaction) => {
      hold.hook(stores, mode, transaction);
      guard.hook(stores, mode);
    };
    const { store, harness, snapshot } = await readyStore({ hook });
    useQueueTimers();
    hold.arm();
    guard.arm();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'In flight'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    harness.dispatchStorage(LEGACY_KEYS.projects);
    const rebootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(0);
    hold.release();

    await save;
    await expect(rebootstrap).resolves.toMatchObject({
      status: 'ready',
      snapshot: {
        projects: expect.arrayContaining([
          expect.objectContaining({ id: 'project-a', name: 'In flight' }),
        ]),
      },
    });
  });
});

describe('project structure commands', () => {
  it('creates, appends, and activates a unique project atomically', async () => {
    const { store, harness } = await readyStore({ values: twoProjectValues() });

    const result = await store.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Third', 'project-c'),
    });

    expect(result.projects.map(project => project.id)).toEqual([
      'project-a',
      'project-b',
      'project-c',
    ]);
    expect(result.activeProjectId).toBe('project-c');
    const stored = await inspect(harness);
    expect(stored.workspace[0]).toMatchObject({
      projectOrder: ['project-a', 'project-b', 'project-c'],
      activeProjectId: 'project-c',
      revision: 1,
    });
    expect(stored.projects.find(record => record.id === 'project-c'))
      .toMatchObject({
        incarnation: expect.any(String),
        storageRevision: 0,
        updatedAt: TEST_NOW,
      });

    await expect(store.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Duplicate', 'project-c'),
    })).rejects.toMatchObject({ code: 'validation' });
    expect((await inspect(harness)).projects.filter(record => record.id === 'project-c'))
      .toHaveLength(1);
  });

  it('validates activation target inside the atomic transaction', async () => {
    const { store, harness } = await readyStore({ values: twoProjectValues() });
    const before = await inspect(harness);

    await expect(store.commit({
      type: 'activate-project',
      projectId: 'missing-project',
    })).rejects.toMatchObject({ code: 'validation' });

    const after = await inspect(harness);
    expect(after.workspace).toEqual(before.workspace);
    expect(after.projects).toEqual(before.projects);
  });

  it('closes a project and activates the previous remaining project', async () => {
    const values = validLegacyValues({
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject(),
        secondProject(),
        legacyProject('project-c'),
      ]),
      [LEGACY_KEYS.activeProject]: 'project-c',
    });
    const { store, harness } = await readyStore({ values });

    const result = await store.commit({ type: 'close-project', projectId: 'project-c' });

    expect(result.projects.map(project => project.id)).toEqual(['project-a', 'project-b']);
    expect(result.activeProjectId).toBe('project-b');
    expect((await inspect(harness)).workspace[0]).toMatchObject({
      projectOrder: ['project-a', 'project-b'],
      activeProjectId: 'project-b',
      revision: 1,
    });
  });

  it('closes the last project only with a supplied blank successor', async () => {
    const { store, harness } = await readyStore();

    await expect(store.commit({
      type: 'close-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'validation' });

    const result = await store.commit({
      type: 'close-project',
      projectId: 'project-a',
      successor: blankProject('successor'),
    });
    expect(result.projects.map(project => project.id)).toEqual(['successor']);
    expect(result.activeProjectId).toBe('successor');
    const stored = await inspect(harness);
    expect(stored.projects.map(record => record.id)).toEqual(['successor']);
    expect(stored.workspace[0]).toMatchObject({
      projectOrder: ['successor'],
      activeProjectId: 'successor',
      revision: 1,
    });
  });

  it('cancels a queued target save and resolves it from close without resurrection', async () => {
    const { store, harness, snapshot } = await readyStore({ values: twoProjectValues() });
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'Must not return'),
    });
    const close = store.commit({ type: 'close-project', projectId: 'project-a' });
    const [saveResult, closeResult] = await Promise.all([save, close]);

    expect(saveResult).toEqual(closeResult);
    expect(closeResult.projects.map(project => project.id)).toEqual(['project-b']);
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await inspect(harness)).projects.map(record => record.id)).toEqual(['project-b']);
  });

  it('binds a queued close to the target lineage before an unrelated save readback', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store: staleStore, harness, snapshot } = await readyStore({
      values: twoProjectValues(),
      hook: hold.hook,
    });
    const replacingStore = createLocalWorkspaceStore(harness.environment);
    await expect(replacingStore.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    useQueueTimers();
    hold.arm();

    const unrelatedSave = staleStore.commit({
      type: 'save-project',
      project: trustedProjectNamed(
        snapshot.projects.find(project => project.id === 'project-b')!,
        'Held B save',
      ),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    await hold.committed;
    const queuedClose = staleStore.commit({ type: 'close-project', projectId: 'project-a' });

    await replacingStore.commit({ type: 'close-project', projectId: 'project-a' });
    harness.environment.randomUUID = () => 'queued-close-replacement-incarnation';
    await replacingStore.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Queued close replacement'),
    });
    hold.release();

    await unrelatedSave;
    await expect(queuedClose).rejects.toMatchObject({ code: 'conflict' });
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({
        incarnation: 'queued-close-replacement-incarnation',
        storageRevision: 0,
        project: { name: 'Queued close replacement' },
      });
  });

  it('rejects close when another same-version tab saved the target project', async () => {
    const { store, harness } = await readyStore({ values: twoProjectValues() });
    const other = createIndexedDbAdapter({ indexedDB: harness.indexedDB, now: () => TEST_NOW });
    const foreignBase = (await other.inspect()).projects.find(record => record.id === 'project-a')!;
    await other.saveProject(projectNamed('Saved elsewhere'), storedProjectLineage(foreignBase));

    await expect(store.commit({
      type: 'close-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'conflict' });

    const stored = await inspect(harness);
    expect(stored.projects.find(record => record.id === 'project-a')).toMatchObject({
      project: { name: 'Saved elsewhere' },
      storageRevision: 1,
    });
    expect(stored.workspace[0]).toMatchObject({
      projectOrder: ['project-a', 'project-b'],
      revision: 0,
    });
    other.close();
  });
});

describe('preset and import commands', () => {
  it('preserves preset position on save and compacts later positions on delete', async () => {
    const { store, harness } = await readyStore();

    await store.commit({ type: 'save-custom-preset', preset: presetNamed('preset-a', 'Updated') });
    await store.commit({ type: 'save-custom-preset', preset: presetNamed('preset-b', 'Second') });
    await store.commit({ type: 'save-custom-preset', preset: presetNamed('preset-c', 'Third') });
    const result = await store.commit({ type: 'delete-custom-preset', presetId: 'preset-b' });

    expect(result.customPresets.map(preset => [preset.id, preset.title])).toEqual([
      ['preset-a', 'Updated'],
      ['preset-c', 'Third'],
    ]);
    expect((await inspect(harness)).presets
      .sort((left, right) => left.position - right.position)
      .map(record => [record.id, record.position])).toEqual([
      ['preset-a', 0],
      ['preset-c', 1],
    ]);
  });

  it('stages prepared imports in order, retaining migration warnings', async () => {
    const { store, harness } = await readyStore();
    const warningState = {
      ...historicalState(8),
      generator: { formatVersion: 2 },
    };

    const first = await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('import-1', 'target-1', warningState),
    });
    expect(first.pendingImports.at(-1)).toMatchObject({
      id: 'import-1',
      targetProjectId: 'target-1',
      warnings: [expect.stringMatching(/detached/i)],
    });
    const second = await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('import-2', 'target-2'),
    });

    expect(second.pendingImports.slice(-2).map(item => item.id)).toEqual(['import-1', 'import-2']);
    const stored = (await inspect(harness)).pendingImports
      .sort((left, right) => left.position - right.position);
    expect(stored.map(record => record.position)).toEqual(stored.map((_record, index) => index));

    await expect(store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('import-1', 'another-target'),
    })).rejects.toMatchObject({ code: 'conflict' });
    await expect(store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('another-import', 'target-2'),
    })).rejects.toMatchObject({ code: 'conflict' });
    expect((await inspect(harness)).pendingImports
      .sort((left, right) => left.position - right.position)).toEqual(stored);
  });

  it('treats an exact staged import repeat as idempotent but rejects conflicting reuse', async () => {
    const { store, harness } = await readyStore();
    const command = {
      type: 'stage-import' as const,
      pendingImport: pendingImport('stable-import', 'stable-target'),
    };

    const first = await store.commit(command);
    const repeated = await store.commit(structuredClone(command));

    expect(first.pendingImports.filter(item => item.id === 'stable-import')).toHaveLength(1);
    expect(repeated.pendingImports.filter(item => item.id === 'stable-import')).toHaveLength(1);
    expect((await inspect(harness)).pendingImports
      .filter(record => record.id === 'stable-import')).toHaveLength(1);
    await expect(store.commit({
      ...command,
      pendingImport: { ...command.pendingImport, createdAt: '2026-08-14T17:00:01.000Z' },
    })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('replaces a fork pending import while keeping provenance private', async () => {
    const { store, harness } = await readyStore();
    const oldPending = forkPendingImport('a');
    await store.commit({
      type: 'stage-import',
      pendingImport: oldPending,
      attemptProvenance: forkAttempt('2'),
    });

    const replaced = await store.commit(replaceForkImportCommand(oldPending));

    const forkPending = replaced.pendingImports.filter(item => item.id.startsWith('fork-import-'));
    expect(forkPending).toHaveLength(1);
    expect(forkPending[0]).toMatchObject({
      id: 'fork-import-b',
      targetProjectId: 'fork-target-b',
      cloud: {
        projectId: 'private-project-b',
        lastSyncedCommitId: 'private-commit-b',
      },
    });
    expect(Object.hasOwn(forkPending[0], 'attemptProvenance')).toBe(false);
    expect(JSON.stringify(replaced)).not.toContain('private-project-a');
    expect(JSON.stringify(replaced)).not.toContain('private-commit-a');
    const durable = await inspect(harness);
    expect(durable.pendingImports.find(record => record.id === 'fork-import-b')
      ?.attemptProvenance).toEqual({
      ...forkAttempt('3'),
      pendingImportDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const recovery = JSON.parse(await (await store.exportRecoveryBundle('indexeddb-workspace')).text());
    expect(JSON.stringify(recovery)).not.toContain('attemptProvenance');
    expect(JSON.stringify(recovery)).not.toContain('consumedImportAttempt');
    expect(JSON.stringify(recovery)).not.toContain('private-project-a');
    expect(JSON.stringify(recovery)).not.toContain('private-commit-a');
  });

  it('adds a fork replacement when the old attempt never committed', async () => {
    const { store, harness } = await readyStore();

    const replaced = await store.commit(replaceForkImportCommand());

    expect(replaced.pendingImports.filter(item => item.id === 'fork-import-b')).toHaveLength(1);
    expect((await inspect(harness)).pendingImports.filter(record =>
      record.id === 'fork-import-b')).toHaveLength(1);
  });

  it('reconciles an exact fork replacement after post-commit readback loss', async () => {
    let failPostCommitRead = false;
    const hook: TransactionHook = (stores, mode) => {
      if (failPostCommitRead && mode === 'readonly' && sameStores(stores, READ_ALL_SCOPE)) {
        failPostCommitRead = false;
        throw new Error('Injected post-replacement read failure.');
      }
    };
    const { store, harness } = await readyStore({ hook });
    const oldPending = forkPendingImport('a');
    await store.commit({
      type: 'stage-import',
      pendingImport: oldPending,
      attemptProvenance: forkAttempt('2'),
    });
    const command = replaceForkImportCommand(oldPending);
    failPostCommitRead = true;

    await expect(store.commit(command)).rejects.toMatchObject({ code: 'io' });
    expect((await inspect(harness)).pendingImports.map(record => record.id))
      .toContain('fork-import-b');

    const reloaded = createLocalWorkspaceStore(harness.environment);
    await expect(reloaded.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    const reconciled = await reloaded.commit(structuredClone(command));
    expect(reconciled.pendingImports.filter(item => item.id === 'fork-import-b')).toHaveLength(1);
    expect(reconciled.pendingImports.some(item => item.id === 'fork-import-a')).toBe(false);
  });

  it('reconciles an exact consumed fork replacement without another project', async () => {
    const { store, harness } = await readyStore();
    const oldPending = forkPendingImport('a');
    await store.commit({
      type: 'stage-import',
      pendingImport: oldPending,
      attemptProvenance: forkAttempt('2'),
    });
    const command = replaceForkImportCommand(oldPending);
    await store.commit(command);
    await store.commit({ type: 'consume-import', importId: 'fork-import-b' });

    const reconciled = await store.commit(structuredClone(command));

    expect(reconciled.pendingImports.some(item => item.id.startsWith('fork-import-'))).toBe(false);
    expect(reconciled.projects.filter(project => project.id === 'fork-target-b')).toHaveLength(1);
    expect(reconciled.projects.some(project => project.id === 'fork-target-a')).toBe(false);
    const durable = await inspect(harness);
    expect(durable.projects.find(record => record.id === 'fork-target-b')?.consumedImportAttempt)
      .toEqual({
        ...forkAttempt('3'),
        pendingImportDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
    expect(Object.hasOwn(
      reconciled.projects.find(project => project.id === 'fork-target-b')!,
      'consumedImportAttempt',
    )).toBe(false);
  });

  it('rolls back a fork replacement fault without deleting the old pending import', async () => {
    const { store, harness } = await readyStore();
    const oldPending = forkPendingImport('a');
    await store.commit({
      type: 'stage-import',
      pendingImport: oldPending,
      attemptProvenance: forkAttempt('2'),
    });
    harness.setFault(new DOMException('No space.', 'QuotaExceededError'));

    await expect(store.commit(replaceForkImportCommand(oldPending)))
      .rejects.toMatchObject({ code: 'quota' });

    const durable = await inspect(harness);
    expect(durable.pendingImports.some(record => record.id === 'fork-import-a')).toBe(true);
    expect(durable.pendingImports.some(record => record.id === 'fork-import-b')).toBe(false);
  });

  it('serializes store consume against fork replacement so only one wins', async () => {
    const harness = createHarness();
    const left = createLocalWorkspaceStore(harness.environment);
    const right = createLocalWorkspaceStore(harness.environment);
    await left.bootstrap();
    await right.bootstrap();
    const oldPending = forkPendingImport('a');
    await left.commit({
      type: 'stage-import',
      pendingImport: oldPending,
      attemptProvenance: forkAttempt('2'),
    });
    await right.bootstrap();

    const results = await Promise.allSettled([
      left.commit({ type: 'consume-import', importId: oldPending.id }),
      right.commit(replaceForkImportCommand(oldPending)),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const durable = await inspect(harness);
    const consumedA = durable.projects.some(record => record.id === oldPending.targetProjectId);
    const pendingB = durable.pendingImports.some(record => record.id === 'fork-import-b');
    expect([consumedA, pendingB].filter(Boolean)).toHaveLength(1);
    expect(durable.pendingImports.some(record => record.id === oldPending.id)).toBe(false);
  });

  it('reconciles an exact stage retry after post-commit read failure and later consumption', async () => {
    let failPostCommitRead = false;
    const hook: TransactionHook = (stores, mode) => {
      if (failPostCommitRead && mode === 'readonly' && sameStores(stores, READ_ALL_SCOPE)) {
        failPostCommitRead = false;
        throw new Error('Injected post-stage read failure.');
      }
    };
    const { store, harness } = await readyStore({ hook });
    const command = {
      type: 'stage-import' as const,
      pendingImport: pendingImport('restart-stage', 'restart-stage-target'),
    };
    failPostCommitRead = true;

    await expect(store.commit(command)).rejects.toMatchObject({ code: 'io' });
    expect((await inspect(harness)).pendingImports
      .filter(record => record.id === 'restart-stage')).toHaveLength(1);

    const reloaded = createLocalWorkspaceStore(harness.environment);
    await expect(reloaded.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    const restaged = await reloaded.commit(structuredClone(command));
    expect(restaged.pendingImports.filter(item => item.id === 'restart-stage')).toHaveLength(1);
    expect(restaged.pendingImports.filter(item => item.targetProjectId === 'restart-stage-target'))
      .toHaveLength(1);

    await reloaded.commit({ type: 'consume-import', importId: 'restart-stage' });
    const reconciled = await reloaded.commit(structuredClone(command));
    expect(reconciled.pendingImports.some(item => item.id === 'restart-stage')).toBe(false);
    expect(reconciled.projects.filter(project => project.id === 'restart-stage-target'))
      .toHaveLength(1);
    const durable = await inspect(harness);
    expect(durable.projects.find(record => record.id === 'restart-stage-target'))
      .toMatchObject({
        consumedImportId: 'restart-stage',
        consumedImportCreatedAt: TEST_NOW,
      });
    expect(durable.pendingImports.some(record => record.id === 'restart-stage')).toBe(false);

    await expect(reloaded.commit({
      ...command,
      pendingImport: { ...command.pendingImport, name: 'Conflicting reuse' },
    })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('prepares imports before opening a write transaction', async () => {
    const { store, harness } = await readyStore();

    await expect(store.commit({
      type: 'stage-import',
      pendingImport: { ...pendingImport('invalid', 'target'), createdAt: 'not-a-date' },
    })).rejects.toMatchObject({ code: 'validation' });
    expect(writeTransactions(harness.records)).toHaveLength(0);
  });

  it('consumes one import exactly once', async () => {
    const { store, harness } = await readyStore();
    await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('import-1', 'target-1'),
    });

    const first = await store.commit({ type: 'consume-import', importId: 'import-1' });
    const second = await store.commit({ type: 'consume-import', importId: 'import-1' });

    expect(first.projects.filter(project => project.id === 'target-1')).toHaveLength(1);
    expect(second.projects.filter(project => project.id === 'target-1')).toHaveLength(1);
    expect(second.pendingImports.some(item => item.id === 'import-1')).toBe(false);
    const stored = await inspect(harness);
    const imported = stored.projects.filter(record => record.id === 'target-1');
    expect(imported).toHaveLength(1);
    expect(imported[0].incarnation).toEqual(expect.any(String));
    expect(Object.hasOwn(second.projects.find(project => project.id === 'target-1')!, 'incarnation'))
      .toBe(false);
    expect(stored.pendingImports.some(record => record.id === 'import-1')).toBe(false);
    expect(stored.workspace[0].revision).toBe(1);
  });

  it('persists private consume provenance across a post-commit crash and reload retry', async () => {
    let failPostCommitRead = false;
    const hook: TransactionHook = (stores, mode) => {
      if (failPostCommitRead && mode === 'readonly' && sameStores(stores, READ_ALL_SCOPE)) {
        failPostCommitRead = false;
        throw new Error('Injected post-commit read failure.');
      }
    };
    const { store, harness } = await readyStore({ hook });
    const staged = await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('restart-import', 'restart-target', {
        ...historicalState(8),
        generator: { formatVersion: 2 },
      }),
    });
    const normalizedPending = staged.pendingImports.find(item => item.id === 'restart-import')!;
    const expectedDigest = await sha256Hex(
      canonicalStringify(normalizedPending),
      (webcrypto as unknown as Crypto).subtle,
    );
    failPostCommitRead = true;

    await expect(store.commit({
      type: 'consume-import',
      importId: 'restart-import',
    })).rejects.toMatchObject({ code: 'io' });

    const committed = (await inspect(harness)).projects.find(record =>
      record.id === 'restart-target') as {
        consumedImportId?: string;
        consumedImportCreatedAt?: string;
        consumedImportDigest?: string;
        project: WorkspaceProject;
      };
    expect(committed.consumedImportId).toBe('restart-import');
    expect(committed.consumedImportCreatedAt).toBe(TEST_NOW);
    expect(committed.consumedImportDigest).toBe(expectedDigest);
    expect(Object.hasOwn(committed.project, 'consumedImportId')).toBe(false);
    expect(Object.hasOwn(committed.project, 'consumedImportDigest')).toBe(false);

    const reloaded = createLocalWorkspaceStore(harness.environment);
    await expect(reloaded.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    const retried = await reloaded.commit({
      type: 'consume-import',
      importId: 'restart-import',
    });
    expect(retried.projects.filter(project => project.id === 'restart-target')).toHaveLength(1);
    expect(Object.hasOwn(
      retried.projects.find(project => project.id === 'restart-target')!,
      'consumedImportId',
    )).toBe(false);
  });

  it('preserves private consume provenance on later public project saves', async () => {
    const { store, harness } = await readyStore();
    const stageCommand = {
      type: 'stage-import' as const,
      pendingImport: pendingImport('saved-import', 'saved-target'),
    };
    await store.commit(stageCommand);
    const consumed = await store.commit({ type: 'consume-import', importId: 'saved-import' });
    const beforeSave = (await inspect(harness)).projects.find(record => record.id === 'saved-target')!;
    expect(beforeSave.consumedImportDigest).toMatch(/^[a-f0-9]{64}$/);
    const target = consumed.projects.find(project => project.id === 'saved-target')!;
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(target, 'Saved after consume'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await save;
    const retried = await store.commit(structuredClone(stageCommand));

    expect(retried.pendingImports.some(item => item.id === 'saved-import')).toBe(false);
    expect(retried.projects.find(project => project.id === 'saved-target'))
      .toMatchObject({ name: 'Saved after consume' });
    expect((await inspect(harness)).projects.find(record => record.id === 'saved-target'))
      .toMatchObject({
        consumedImportId: 'saved-import',
        consumedImportCreatedAt: TEST_NOW,
        consumedImportDigest: beforeSave.consumedImportDigest,
        project: { name: 'Saved after consume' },
        storageRevision: 1,
      });
  });

  it('does not expose private consumed digest through exact stage reconciliation', async () => {
    const { store } = await readyStore();
    const command = {
      type: 'stage-import',
      pendingImport: pendingImport('private-digest-import', 'private-digest-target'),
    } as const;
    await store.commit(command);
    const consumed = await store.commit({
      type: 'consume-import',
      importId: 'private-digest-import',
    });
    const reconciled = await store.commit(structuredClone(command));

    for (const snapshot of [consumed, reconciled]) {
      const project = snapshot.projects.find(item => item.id === 'private-digest-target')!;
      expect(Object.hasOwn(project, 'consumedImportDigest')).toBe(false);
    }
  });

  it('rejects consume when cached pending identity changed before the transaction', async () => {
    const { store, harness } = await readyStore();
    await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('changed-import', 'changed-target'),
    });
    const storedImport = (await inspect(harness)).pendingImports.find(record =>
      record.id === 'changed-import')!;
    await putRaw(harness.indexedDB, 'pendingImports', {
      ...storedImport,
      pendingImport: { ...storedImport.pendingImport, name: 'Changed elsewhere' },
    });

    await expect(store.commit({
      type: 'consume-import',
      importId: 'changed-import',
    })).rejects.toMatchObject({ code: 'conflict' });

    const stored = await inspect(harness);
    expect(stored.pendingImports.find(record => record.id === 'changed-import'))
      .toMatchObject({ pendingImport: { name: 'Changed elsewhere' } });
    expect(stored.projects.some(record => record.id === 'changed-target')).toBe(false);
  });

  it('prepares and validates the consumed target before its write transaction starts', async () => {
    let consumeTransactionStarted = false;
    const hook: TransactionHook = (stores, mode) => {
      if (mode === 'readwrite' && sameStores(
        stores,
        ['pendingImports', 'projects', 'workspace', 'migrationLedger'],
      )) {
        consumeTransactionStarted = true;
      }
    };
    const { store } = await readyStore({ hook });
    await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('prepared-import', 'prepared-target'),
    });
    let preparedBeforeTransaction = false;
    vi.mocked(console.log).mockImplementation(message => {
      if (String(message).includes('[Migration] Migrating') && !consumeTransactionStarted) {
        preparedBeforeTransaction = true;
      }
    });

    await store.commit({ type: 'consume-import', importId: 'prepared-import' });

    expect(preparedBeforeTransaction).toBe(true);
  });

  it('compacts later pending-import positions when consuming from the middle', async () => {
    const { store, harness } = await readyStore();
    await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('import-1', 'target-1'),
    });
    await store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('import-2', 'target-2'),
    });

    const result = await store.commit({ type: 'consume-import', importId: 'import-1' });

    expect(result.pendingImports.map(item => item.id)).toEqual([
      'legacy-import-v1',
      'import-2',
    ]);
    expect((await inspect(harness)).pendingImports
      .sort((left, right) => left.position - right.position)
      .map(record => [record.id, record.position])).toEqual([
      ['legacy-import-v1', 0],
      ['import-2', 1],
    ]);
  });
});

describe('failure handling and private revisions', () => {
  it.each([
    ['quota', new DOMException('No space.', 'QuotaExceededError')],
    ['clone', new DOMException('Cannot clone.', 'DataCloneError')],
    ['io', new Error('Disk failed.')],
  ] as const)('maps %s failures, rolls back, and leaves cached state unchanged', async (code, error) => {
    const { store, harness } = await readyStore();
    const cached = await store.bootstrap();
    const before = await inspect(harness);
    harness.records.length = 0;
    harness.setFault(error);

    await expect(store.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Must roll back', 'failed-project'),
    })).rejects.toMatchObject({ code });

    expect(await store.bootstrap()).toBe(cached);
    const after = await inspect(harness);
    expect(after.projects).toEqual(before.projects);
    expect(after.workspace).toEqual(before.workspace);
    harness.setFault();
    await expect(store.commit({
      type: 'create-and-activate-project',
      project: projectNamed('Retry', 'failed-project'),
    })).resolves.toMatchObject({ activeProjectId: 'failed-project' });
  });

  it('rejects a stale same-version-tab project save without retrying or changing cache', async () => {
    const { store, harness, snapshot } = await readyStore();
    const cached = await store.bootstrap();
    const other = createIndexedDbAdapter({ indexedDB: harness.indexedDB, now: () => TEST_NOW });
    const foreignBase = (await other.inspect()).projects.find(record => record.id === 'project-a')!;
    await other.saveProject(projectNamed('Other tab'), storedProjectLineage(foreignBase));
    harness.records.length = 0;
    useQueueTimers();

    const stale = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'Stale tab'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(stale).rejects.toMatchObject({ code: 'conflict' });

    expect(await store.bootstrap()).toBe(cached);
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ project: { name: 'Other tab' }, storageRevision: 1 });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(1);
    other.close();
  });

  it('rejects a stale workspace command without retrying or changing cache', async () => {
    const { store, harness } = await readyStore({ values: twoProjectValues() });
    const cached = await store.bootstrap();
    const current = (await inspect(harness)).workspace[0];
    const other = createIndexedDbAdapter({ indexedDB: harness.indexedDB, now: () => TEST_NOW });
    await other.saveWorkspace({ ...current, activeProjectId: 'project-b' }, 0);
    harness.records.length = 0;

    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'conflict' });

    expect(await store.bootstrap()).toBe(cached);
    expect((await inspect(harness)).workspace[0]).toMatchObject({
      activeProjectId: 'project-b',
      revision: 1,
    });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'workspace', 'migrationLedger']))).toHaveLength(1);
    other.close();
  });

  it('turns lost verified authority into a frozen store', async () => {
    const { store, harness } = await readyStore();
    const ledger = (await inspect(harness)).migrationLedger[0];
    await putRaw(harness.indexedDB, 'migrationLedger', {
      ...ledger,
      state: 'cleanup-started',
    });
    harness.records.length = 0;

    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    const writesAfterLoss = writeTransactions(harness.records).length;
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(writeTransactions(harness.records)).toHaveLength(writesAfterLoss);
  });

  it('freezes and invalidates authority when post-commit reconstruction cannot run', async () => {
    let failPostCommitRead = false;
    const hook: TransactionHook = (stores, mode) => {
      if (failPostCommitRead && mode === 'readonly' && sameStores(stores, READ_ALL_SCOPE)) {
        failPostCommitRead = false;
        throw new Error('Injected post-commit read failure.');
      }
    };
    const { store, snapshot } = await readyStore({ hook });
    const onAuthorityLost = vi.fn();
    await store.bootstrap({ onAuthorityLost });
    useQueueTimers();
    failPostCommitRead = true;

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'Committed'),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(save).rejects.toMatchObject({ code: 'io' });

    expect(onAuthorityLost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable',
    }));
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    await expect(store.bootstrap()).resolves.toMatchObject({
      status: 'ready',
      snapshot: {
        projects: expect.arrayContaining([
          expect.objectContaining({ id: 'project-a', name: 'Committed' }),
        ]),
      },
    });
  });

  it.each([
    [1, 'private durable clone', /durable state could not be installed/i],
    [2, 'cached-ready authority clone', /durable state could not be installed/i],
    [3, 'queue publication clone', /durable result could not be published/i],
  ] as const)('terminally loses authority at post-commit clone %i: %s', async (
    cloneToFail,
    _label,
    expectedReason,
  ) => {
    const { store, harness, snapshot } = await readyStore({ values: twoProjectValues() });
    const onAuthorityLost = vi.fn();
    await store.bootstrap({ onAuthorityLost });
    const originalStructuredClone = globalThis.structuredClone;
    let snapshotCloneOrdinal = 0;
    let injectedCloneOrdinal: number | undefined;
    let armed = false;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
      if (armed
        && value !== null
        && typeof value === 'object'
        && Array.isArray((value as WorkspaceSnapshot).projects)
        && Array.isArray((value as WorkspaceSnapshot).customPresets)
        && Array.isArray((value as WorkspaceSnapshot).pendingImports)) {
        snapshotCloneOrdinal += 1;
        if (snapshotCloneOrdinal === cloneToFail) {
          injectedCloneOrdinal = snapshotCloneOrdinal;
          throw new DOMException(
            `Injected post-commit clone ${cloneToFail} failure.`,
            'DataCloneError',
          );
        }
      }
      return originalStructuredClone(value, options);
    });
    useQueueTimers();
    const source = snapshot.projects.find(project => project.id === 'project-a')!;

    const first = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'First coalesced save'),
    });
    const newest = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(source, 'Committed before clone failure'),
    });
    armed = true;
    const close = store.commit({ type: 'close-project', projectId: 'project-b' });
    const outcomes = await Promise.all([first, newest, close].map(promise => promise.then(
      value => ({ status: 'fulfilled' as const, value }),
      error => ({ status: 'rejected' as const, error }),
    )));

    expect(injectedCloneOrdinal).toBe(cloneToFail);
    expect(outcomes.map(outcome => outcome.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    const errors = outcomes.map(outcome => outcome.status === 'rejected' ? outcome.error : undefined);
    expect(errors[0]).toBe(errors[1]);
    expect(errors[1]).toBe(errors[2]);
    expect(errors[0]).toMatchObject({
      code: 'authority-lost',
      message: expect.stringMatching(expectedReason),
    });
    expect(onAuthorityLost).toHaveBeenCalledOnce();
    expect(onAuthorityLost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable',
      availableExports: expect.arrayContaining(['indexeddb-workspace']),
    }));
    expect(writeTransactions(harness.records)).toHaveLength(1);
    expect(harness.records.filter(record =>
      record.mode === 'readonly' && sameStores(record.stores, READ_ALL_SCOPE))).toHaveLength(1);
    const writesAfterLoss = writeTransactions(harness.records).length;
    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(writeTransactions(harness.records)).toHaveLength(writesAfterLoss);

    const protectedBeforeForeignWrite = await (
      await store.exportRecoveryBundle('indexeddb-workspace')
    ).text();
    expect(JSON.parse(protectedBeforeForeignWrite)).toMatchObject({
      workspace: {
        projects: [
          expect.objectContaining({ id: 'project-a', name: 'Committed before clone failure' }),
          expect.objectContaining({ id: 'project-b' }),
        ],
      },
    });

    const foreign = createIndexedDbAdapter({
      indexedDB: harness.indexedDB,
      now: () => TEST_NOW,
    });
    const committedRecord = (await foreign.inspect()).projects
      .find(record => record.id === 'project-a')!;
    await foreign.saveProject(
      projectNamed('Foreign write after publication failure'),
      storedProjectLineage(committedRecord),
    );
    const protectedAfterForeignWrite = await (
      await store.exportRecoveryBundle('indexeddb-workspace')
    ).text();

    expect(protectedAfterForeignWrite).toBe(protectedBeforeForeignWrite);
    expect((await foreign.inspect()).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ project: { name: 'Foreign write after publication failure' } });
    foreign.close();
    await expect(store.bootstrap()).resolves.toMatchObject({
      status: 'ready',
      snapshot: {
        projects: expect.arrayContaining([
          expect.objectContaining({ name: 'Foreign write after publication failure' }),
        ]),
      },
    });
  });

  it('uses exactly three authority-bearing snapshot clones after validated readback', async () => {
    const { store, snapshot } = await readyStore();
    const originalStructuredClone = globalThis.structuredClone;
    let armed = false;
    let snapshotCloneCount = 0;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
      if (armed
        && value !== null
        && typeof value === 'object'
        && Array.isArray((value as WorkspaceSnapshot).projects)
        && Array.isArray((value as WorkspaceSnapshot).customPresets)
        && Array.isArray((value as WorkspaceSnapshot).pendingImports)) {
        snapshotCloneCount += 1;
      }
      return originalStructuredClone(value, options);
    });
    useQueueTimers();

    const save = store.commit({
      type: 'save-project',
      project: trustedProjectNamed(snapshot.projects[0], 'Counted clone save'),
    });
    armed = true;
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(save).resolves.toMatchObject({
      projects: [expect.objectContaining({ name: 'Counted clone save' })],
    });
    expect(snapshotCloneCount).toBe(3);
  });
});

describe('command admission', () => {
  it('rejects commands before verified readiness without starting a transaction', async () => {
    const harness = createHarness();
    const store = createLocalWorkspaceStore(harness.environment);

    await expect(store.commit({
      type: 'activate-project',
      projectId: 'project-a',
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(harness.records).toEqual([]);
  });

  it('rejects deferred recovery commands honestly without mutation', async () => {
    const { store, harness } = await readyStore();
    const before = await inspect(harness);
    harness.records.length = 0;

    await expect(store.commit({
      type: 'recover-legacy-as-copies',
      recoveryId: 'recovery-1',
    })).rejects.toMatchObject({ code: 'unavailable' });

    expect(writeTransactions(harness.records)).toHaveLength(0);
    expect(await inspect(harness)).toEqual(before);
    expect(harness.storage.mutations).toEqual([]);
  });
});
