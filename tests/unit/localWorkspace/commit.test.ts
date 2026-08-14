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
  createLocalWorkspaceStore,
  type LocalWorkspaceEnvironment,
} from '../../../services/localWorkspace';
import type {
  LocalWorkspaceStore,
  WorkspaceCommand,
  WorkspaceCustomPreset,
  WorkspaceImportInput,
  WorkspaceProject,
  WorkspaceSnapshot,
} from '../../../services/localWorkspace/contracts';
import type { WorkspaceFaultPoint } from '../../../services/localWorkspace/faults';
import {
  createIndexedDbAdapter,
  type IndexedDbInspection,
} from '../../../services/localWorkspace/indexedDbAdapter';
import {
  WORKSPACE_DB_NAME,
  type MigrationLedger,
  type StoredWorkspace,
} from '../../../services/localWorkspace/schema';
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
  const release = deferred();
  let armed = false;
  let held = false;
  return {
    started: started.promise,
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
          void release.promise.then(() => invokeListener(listener, event));
        }, options);
      }) as IDBTransaction['addEventListener'];
      started.resolve();
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
  storeName: 'migrationLedger' | 'workspace',
  value: MigrationLedger | StoredWorkspace,
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

const readyStore = async (
  options: HarnessOptions = {},
): Promise<{
  store: LocalWorkspaceStore;
  harness: Harness;
  snapshot: WorkspaceSnapshot;
}> => {
  const harness = createHarness(options);
  const store = createLocalWorkspaceStore(harness.environment);
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
      command: () => ({ type: 'save-project', project: projectNamed('Saved') }),
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
      scope: ['pendingImports', 'migrationLedger'],
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
  it('coalesces rapid saves and persists only the newest project', async () => {
    const { store, harness } = await readyStore();
    useQueueTimers();

    const first = store.commit({ type: 'save-project', project: projectNamed('A') });
    const second = store.commit({ type: 'save-project', project: projectNamed('B') });
    await vi.advanceTimersByTimeAsync(999);
    expect(writeTransactions(harness.records)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.projects.find(project => project.id === 'project-a')?.name).toBe('B');
    expect(secondResult.projects.find(project => project.id === 'project-a')?.name).toBe('B');
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ project: { name: 'B' }, storageRevision: 1 });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(1);
  });

  it('retains exactly one newest follow-up while a project save is in flight', async () => {
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const { store, harness } = await readyStore({ hook: hold.hook });
    useQueueTimers();
    hold.arm();

    const first = store.commit({ type: 'save-project', project: projectNamed('A') });
    await vi.advanceTimersByTimeAsync(1_000);
    await hold.started;
    const second = store.commit({ type: 'save-project', project: projectNamed('B') });
    const third = store.commit({ type: 'save-project', project: projectNamed('C') });
    hold.release();

    const results = await Promise.all([first, second, third]);
    expect(results[1].projects.find(project => project.id === 'project-a')?.name).toBe('C');
    expect(results[2].projects.find(project => project.id === 'project-a')?.name).toBe('C');
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a'))
      .toMatchObject({ project: { name: 'C' }, storageRevision: 2 });
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(2);
  });

  it('drains earlier saves before crossing a structural command barrier', async () => {
    const { store, harness } = await readyStore({ values: twoProjectValues() });

    const save = store.commit({ type: 'save-project', project: projectNamed('Before barrier') });
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
    const { store, harness } = await readyStore({
      values: twoProjectValues(),
      hook: hold.hook,
    });
    useQueueTimers();
    hold.arm();

    const activate = store.commit({ type: 'activate-project', projectId: 'project-b' });
    await hold.started;
    const save = store.commit({ type: 'save-project', project: projectNamed('After barrier') });
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
    const { store, harness } = await readyStore();
    useQueueTimers();

    const accepted = store.commit({ type: 'save-project', project: projectNamed('Accepted') });
    harness.dispatchStorage(LEGACY_KEYS.projects);
    await expect(store.commit({
      type: 'save-project',
      project: projectNamed('Rejected'),
    })).rejects.toMatchObject({ code: 'authority-lost' });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(accepted).resolves.toMatchObject({
      projects: expect.arrayContaining([expect.objectContaining({ name: 'Accepted' })]),
    });
    expect((await inspect(harness)).projects.find(record => record.id === 'project-a')?.project.name)
      .toBe('Accepted');
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
      .toMatchObject({ storageRevision: 0, updatedAt: TEST_NOW });

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
    const { store, harness } = await readyStore({ values: twoProjectValues() });
    useQueueTimers();

    const save = store.commit({ type: 'save-project', project: projectNamed('Must not return') });
    const close = store.commit({ type: 'close-project', projectId: 'project-a' });
    const [saveResult, closeResult] = await Promise.all([save, close]);

    expect(saveResult).toEqual(closeResult);
    expect(closeResult.projects.map(project => project.id)).toEqual(['project-b']);
    expect(writeTransactions(harness.records).filter(record =>
      sameStores(record.stores, ['projects', 'migrationLedger']))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await inspect(harness)).projects.map(record => record.id)).toEqual(['project-b']);
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
    })).rejects.toMatchObject({ code: 'validation' });
    await expect(store.commit({
      type: 'stage-import',
      pendingImport: pendingImport('another-import', 'target-2'),
    })).rejects.toMatchObject({ code: 'validation' });
    expect((await inspect(harness)).pendingImports
      .sort((left, right) => left.position - right.position)).toEqual(stored);
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
    expect(stored.projects.filter(record => record.id === 'target-1')).toHaveLength(1);
    expect(stored.pendingImports.some(record => record.id === 'import-1')).toBe(false);
    expect(stored.workspace[0].revision).toBe(1);
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
    const { store, harness } = await readyStore();
    const cached = await store.bootstrap();
    const other = createIndexedDbAdapter({ indexedDB: harness.indexedDB, now: () => TEST_NOW });
    await other.saveProject(projectNamed('Other tab'), 0);
    harness.records.length = 0;
    useQueueTimers();

    const stale = store.commit({ type: 'save-project', project: projectNamed('Stale tab') });
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
