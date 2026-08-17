// @vitest-environment node
import 'fake-indexeddb/auto';
import {
  IDBDatabase as FakeIDBDatabase,
  IDBFactory,
  IDBVersionChangeEvent as FakeIDBVersionChangeEvent,
  forceCloseDatabase,
} from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  WorkspacePendingImport,
  WorkspaceProject,
} from '../../../services/localWorkspace/contracts';
import { WorkspaceStoreError } from '../../../services/localWorkspace/contracts';
import type { WorkspaceFaultPoint } from '../../../services/localWorkspace/faults';
import {
  createIndexedDbAdapter,
  type IndexedDbAdapter,
} from '../../../services/localWorkspace/indexedDbAdapter';
import type {
  PreparedInitialCopy,
  WorkspaceRecords,
} from '../../../services/localWorkspace/migration';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_MIGRATION_ID,
  type LegacyBackupRecord,
  type MigrationLedger,
  type StoredProject,
} from '../../../services/localWorkspace/schema';
import {
  legacySnapshot,
  workspaceSnapshot,
} from '../../helpers/localWorkspaceFixtures';

const TEST_NOW = '2026-08-14T16:00:00.000Z';
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

const preparedCopy = (digest = 'source-digest'): PreparedInitialCopy => {
  const snapshot = workspaceSnapshot();
  if (digest !== 'source-digest') {
    snapshot.projects[0] = {
      ...snapshot.projects[0],
      name: `Project ${digest}`,
    };
  }
  const migratedAt = '2026-08-14T15:00:00.000Z';
  const source = legacySnapshot();
  const backupId = `${WORKSPACE_MIGRATION_ID}:original:${digest}`;
  const projects = snapshot.projects.map(project => ({
    id: project.id,
    project,
    incarnation: `incarnation-${project.id}`,
    storageRevision: 0,
    updatedAt: migratedAt,
  }));
  const workspace = {
    id: 'current' as const,
    projectOrder: projects.map(project => project.id),
    activeProjectId: snapshot.activeProjectId,
    revision: 0,
  };
  const presets = snapshot.customPresets.map((preset, position) => ({
    id: preset.id,
    preset,
    position,
  }));
  const pendingImports = snapshot.pendingImports.map((pendingImport, position) => ({
    id: pendingImport.id,
    pendingImport,
    position,
  }));
  const backup: LegacyBackupRecord = {
    id: backupId,
    kind: 'original',
    capturedAt: migratedAt,
    snapshot: source,
    digest,
  };
  const ledger: MigrationLedger = {
    id: WORKSPACE_MIGRATION_ID,
    indexedDbVersion: 1,
    state: 'copied',
    origin: 'legacy',
    ledgerRevision: 0,
    sourceDigest: digest,
    expectedTargetDigest: `target-${digest}`,
    acceptedLegacyDigest: digest,
    originalLegacyBackupId: backupId,
    acceptedLegacyBackupId: backupId,
    keyFingerprints: [],
    projectFingerprints: [],
    presetFingerprints: [],
    counts: {
      sourceProjects: projects.length,
      targetProjects: projects.length,
      customPresets: presets.length,
      pendingImports: pendingImports.length,
    },
    migratedAt,
    verifiedAt: null,
    persistenceRolloutEpoch: 1,
    unresolvedRecovery: null,
  };

  return {
    origin: 'legacy',
    source,
    sourceDigest: ledger.sourceDigest,
    targetDigest: ledger.expectedTargetDigest,
    projects,
    workspace,
    presets,
    pendingImports,
    backup,
    ledger,
  };
};

const emptyInspection = () => ({
  projects: [],
  workspace: [],
  presets: [],
  pendingImports: [],
  migrationLedger: [],
  legacyBackup: [],
});

interface TestAdapterOptions {
  indexedDB?: IDBFactory;
  requestedVersion?: number;
  faultPoint?: WorkspaceFaultPoint;
  faultError?: unknown;
  fault?: (point: WorkspaceFaultPoint) => void;
  now?: () => string;
  onAuthorityLost?: (error: WorkspaceStoreError) => void;
}

const adapters: IndexedDbAdapter[] = [];

const createTestAdapter = (options: TestAdapterOptions = {}): IndexedDbAdapter => {
  const adapter = createIndexedDbAdapter({
    indexedDB: options.indexedDB ?? new IDBFactory(),
    now: options.now ?? (() => TEST_NOW),
    onAuthorityLost: options.onAuthorityLost,
    fault: options.fault ?? (point => {
      if (point === options.faultPoint) {
        throw options.faultError ?? new Error(`Injected fault at ${point}.`);
      }
    }),
  }, options.requestedVersion);
  adapters.push(adapter);
  return adapter;
};

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.close();
  vi.restoreAllMocks();
});

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
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

interface TrackedFactory {
  names: string[];
  opened: Array<Promise<IDBDatabase>>;
}

const trackFactory = (indexedDB: IDBFactory): TrackedFactory => {
  const names: string[] = [];
  const opened: Array<Promise<IDBDatabase>> = [];
  const originalOpen = indexedDB.open.bind(indexedDB);

  indexedDB.open = ((name: string, version?: number) => {
    names.push(name);
    const request = version === undefined
      ? originalOpen(name)
      : originalOpen(name, version);
    const result = requestResult<IDBDatabase>(request);
    void result.catch(() => {});
    opened.push(result);
    return request;
  }) as IDBFactory['open'];

  return { names, opened };
};

const openRaw = (
  indexedDB: IDBFactory,
  name: string,
  version?: number,
): Promise<IDBDatabase> => requestResult(
  version === undefined ? indexedDB.open(name) : indexedDB.open(name, version),
);

const seedRawRecord = async (
  indexedDB: IDBFactory,
  name: string,
  storeName: StoreName,
  value: unknown,
): Promise<void> => {
  const database = await openRaw(indexedDB, name);
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  database.close();
};

const verificationExpectation = (copy: PreparedInitialCopy) => ({
  ledgerRevision: copy.ledger.ledgerRevision,
  sourceDigest: copy.ledger.sourceDigest,
  expectedTargetDigest: copy.ledger.expectedTargetDigest,
});

const copyAndVerify = async (
  adapter: IndexedDbAdapter,
  copy: PreparedInitialCopy,
): Promise<void> => {
  await adapter.writeInitialCopy(copy);
  await adapter.markVerified(verificationExpectation(copy));
};

const changedProject = (project: WorkspaceProject, name: string): WorkspaceProject => ({
  ...structuredClone(project),
  name,
});

const lineageOf = (
  record: Pick<StoredProject, 'incarnation' | 'storageRevision'>,
) => ({
  incarnation: record.incarnation,
  revision: record.storageRevision,
});

const WRITE_OPERATIONS = [
  ['initial copy', (adapter: IndexedDbAdapter, copy: PreparedInitialCopy) =>
    adapter.writeInitialCopy(copy)],
  ['ledger verification', (adapter: IndexedDbAdapter, copy: PreparedInitialCopy) =>
    adapter.markVerified(verificationExpectation(copy))],
  ['project save', (adapter: IndexedDbAdapter, copy: PreparedInitialCopy) =>
    adapter.saveProject(copy.projects[0].project, lineageOf(copy.projects[0]))],
  ['workspace save', (adapter: IndexedDbAdapter, copy: PreparedInitialCopy) =>
    adapter.saveWorkspace(copy.workspace, 0)],
] as const;

describe('IndexedDB schema', () => {
  it('opens exact database version 1 by default', async () => {
    const indexedDB = new IDBFactory();
    const adapter = createTestAdapter({ indexedDB });
    await adapter.open();

    const rawDatabase = await openRaw(indexedDB, WORKSPACE_DB_NAME);
    expect(rawDatabase.version).toBe(1);
    rawDatabase.close();
  });

  it('creates exactly six stores and no indexes', async () => {
    const adapter = createTestAdapter();
    await adapter.open();

    expect(await adapter.describeSchema()).toEqual({
      projects: [],
      workspace: [],
      presets: [],
      pendingImports: [],
      migrationLedger: [],
      legacyBackup: [],
    });
  });

  it('uses id key paths for every store and current as the workspace singleton key', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const adapter = createTestAdapter({ indexedDB });
    await adapter.open();
    const rawDatabase = await tracked.opened[0];
    const transaction = rawDatabase.transaction(STORE_NAMES, 'readonly');

    expect(Object.fromEntries(STORE_NAMES.map(storeName => [
      storeName,
      transaction.objectStore(storeName).keyPath,
    ]))).toEqual(Object.fromEntries(STORE_NAMES.map(storeName => [storeName, 'id'])));
    await transactionDone(transaction);

    const copy = preparedCopy();
    await adapter.writeInitialCopy(copy);
    const workspaceTransaction = rawDatabase.transaction('workspace', 'readonly');
    expect(await requestResult(workspaceTransaction.objectStore('workspace').get('current')))
      .toEqual(copy.workspace);
    await transactionDone(workspaceTransaction);
  });
});

describe('open lifecycle', () => {
  it('keeps a blocked upgrade unavailable for later reads', async () => {
    const indexedDB = new IDBFactory();
    const versionOne = await openRaw(indexedDB, WORKSPACE_DB_NAME, 1);
    const adapter = createTestAdapter({ indexedDB, requestedVersion: 2 });

    try {
      await expect(adapter.open()).rejects.toMatchObject({ code: 'unavailable' });
      const laterRead = adapter.inspect().then(
        () => 'resolved',
        error => error instanceof WorkspaceStoreError ? error.code : 'unknown-error',
      );
      const outcome = await Promise.race([
        laterRead,
        new Promise<string>(resolve => setTimeout(() => resolve('pending'), 20)),
      ]);
      expect(outcome).toBe('unavailable');
    } finally {
      versionOne.close();
    }
  });

  it('rejects a blocked open without a timeout and closes the connection if it later opens', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const trackedOpen = indexedDB.open.bind(indexedDB);
    let blockedDispatched = false;
    indexedDB.open = ((name: string, version?: number) => {
      const request = version === undefined ? trackedOpen(name) : trackedOpen(name, version);
      if (!blockedDispatched) {
        blockedDispatched = true;
        queueMicrotask(() => request.dispatchEvent(new FakeIDBVersionChangeEvent('blocked', {
          oldVersion: 0,
          newVersion: version ?? null,
        })));
      }
      return request;
    }) as IDBFactory['open'];
    const close = vi.spyOn(FakeIDBDatabase.prototype, 'close');
    const adapter = createTestAdapter({ indexedDB });

    await expect(adapter.open()).rejects.toEqual(new WorkspaceStoreError(
      'IndexedDB upgrade is blocked.',
      'unavailable',
    ));

    await tracked.opened[0];
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('reports terminated storage as unavailable and rejects later operations', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const onAuthorityLost = vi.fn();
    const adapter = createTestAdapter({ indexedDB, onAuthorityLost });
    await adapter.open();
    const rawDatabase = await tracked.opened[0];

    forceCloseDatabase(rawDatabase as never);

    await vi.waitFor(() => expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'unavailable' }),
    ));
    await expect(adapter.inspect()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('closes and reports authority loss on versionchange', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const onAuthorityLost = vi.fn();
    const adapter = createTestAdapter({ indexedDB, onAuthorityLost });
    await adapter.open();

    const upgraded = await openRaw(indexedDB, tracked.names[0], 2);

    expect(onAuthorityLost).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'authority-lost' }),
    );
    await expect(adapter.inspect()).rejects.toMatchObject({ code: 'authority-lost' });
    upgraded.close();
  });

  it('invalidates a pending open on close and lets a new open become active', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const close = vi.spyOn(FakeIDBDatabase.prototype, 'close');
    const adapter = createTestAdapter({ indexedDB });

    const staleOpen = adapter.open();
    adapter.close();
    const currentOpen = adapter.open();
    await Promise.all([staleOpen, currentOpen]);

    expect(tracked.opened).toHaveLength(2);
    const [staleDatabase] = await Promise.all(tracked.opened);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.instances[0]).toBe(staleDatabase);
    await expect(adapter.describeSchema()).resolves.toEqual({
      projects: [],
      workspace: [],
      presets: [],
      pendingImports: [],
      migrationLedger: [],
      legacyBackup: [],
    });
  });
});

describe('write transaction startup', () => {
  it.each(WRITE_OPERATIONS)('maps closed-connection failure for %s', async (_label, write) => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const adapter = createTestAdapter({ indexedDB });
    await adapter.open();
    const rawDatabase = await tracked.opened[0];
    rawDatabase.close();

    await expect(write(adapter, preparedCopy())).rejects.toMatchObject({
      name: 'WorkspaceStoreError',
      code: 'unavailable',
      cause: expect.objectContaining({ name: 'InvalidStateError' }),
    });
  });

  it('maps a missing-store transaction failure without trying to abort', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const setupAdapter = createTestAdapter({ indexedDB });
    await setupAdapter.open();
    const databaseName = tracked.names[0];
    setupAdapter.close();
    await requestResult(indexedDB.deleteDatabase(databaseName));
    const malformedDatabase = await openRaw(indexedDB, databaseName, 1);
    malformedDatabase.close();
    const adapter = createTestAdapter({ indexedDB });
    await adapter.open();

    await expect(adapter.writeInitialCopy(preparedCopy())).rejects.toMatchObject({
      name: 'WorkspaceStoreError',
      code: 'unavailable',
      cause: expect.objectContaining({ name: 'NotFoundError' }),
    });
  });
});

describe('atomic initial copy', () => {
  it('writes every prepared record and the exact backup and copied ledger', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();

    await expect(adapter.writeInitialCopy(copy)).resolves.toEqual({ status: 'copied' });
    expect(await adapter.inspect()).toEqual({
      projects: copy.projects,
      workspace: [copy.workspace],
      presets: copy.presets,
      pendingImports: copy.pendingImports,
      migrationLedger: [copy.ledger],
      legacyBackup: [copy.backup],
    });
  });

  it.each(COPY_TRANSACTION_FAULTS)(
    'aborts the whole initial copy at %s',
    async faultPoint => {
      const adapter = createTestAdapter({ faultPoint });

      await expect(adapter.writeInitialCopy(preparedCopy()))
        .rejects.toMatchObject({ code: 'io' });
      expect(await adapter.inspect()).toEqual(emptyInspection());
    },
  );

  it.each([
    ['QuotaExceededError', new DOMException('No space.', 'QuotaExceededError'), 'quota'],
    ['generic I/O failure', new Error('Device failed.'), 'io'],
    ['explicit abort', new DOMException('Explicit abort.', 'AbortError'), 'io'],
  ] as const)('maps %s and leaves no partial copy', async (_label, faultError, code) => {
    const adapter = createTestAdapter({
      faultPoint: 'copy.after-workspace',
      faultError,
    });

    await expect(adapter.writeInitialCopy(preparedCopy())).rejects.toMatchObject({ code });
    expect(await adapter.inspect()).toEqual(emptyInspection());
  });

  it('maps DataCloneError and aborts every queued write', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    copy.projects[0].project.notCloneable = () => undefined;

    await expect(adapter.writeInitialCopy(copy)).rejects.toMatchObject({ code: 'clone' });
    expect(await adapter.inspect()).toEqual(emptyInspection());
  });

  it('lets only one concurrent tab create the initial copy', async () => {
    const indexedDB = new IDBFactory();
    const left = createTestAdapter({ indexedDB });
    const right = createTestAdapter({ indexedDB });
    await Promise.all([left.open(), right.open()]);

    const results = await Promise.all([
      left.writeInitialCopy(preparedCopy()),
      right.writeInitialCopy(preparedCopy()),
    ]);

    expect(results.map(result => result.status).sort())
      .toEqual(['copied', 'existing-ledger']);
    expect((await left.inspect()).migrationLedger).toHaveLength(1);
  });

  it('returns existing-ledger without changing any records', async () => {
    const adapter = createTestAdapter();
    const first = preparedCopy();
    await adapter.writeInitialCopy(first);
    const second = preparedCopy();
    second.projects[0].project.name = 'Must not overwrite';

    await expect(adapter.writeInitialCopy(second))
      .resolves.toEqual({ status: 'existing-ledger' });
    expect(await adapter.inspect()).toEqual({
      projects: first.projects,
      workspace: [first.workspace],
      presets: first.presets,
      pendingImports: first.pendingImports,
      migrationLedger: [first.ledger],
      legacyBackup: [first.backup],
    });
  });

  it.each(STORE_NAMES)('returns orphaned-target for an existing %s record without writing', async storeName => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const adapter = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await adapter.open();
    const orphanValues: Record<StoreName, unknown> = {
      projects: copy.projects[0],
      workspace: copy.workspace,
      presets: copy.presets[0],
      pendingImports: copy.pendingImports[0],
      migrationLedger: { id: WORKSPACE_MIGRATION_ID },
      legacyBackup: copy.backup,
    };
    await seedRawRecord(indexedDB, tracked.names[0], storeName, orphanValues[storeName]);
    copy.projects[0].project.notCloneable = () => undefined;

    await expect(adapter.writeInitialCopy(copy))
      .resolves.toEqual({ status: 'orphaned-target' });
    const inspection = await adapter.inspect();
    expect(inspection[storeName]).toHaveLength(1);
    expect(STORE_NAMES.reduce((count, name) => count + inspection[name].length, 0)).toBe(1);
  });

  it('resolves only after the copy transaction completes', async () => {
    const events: string[] = [];
    const originalTransaction = FakeIDBDatabase.prototype.transaction;
    vi.spyOn(FakeIDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      if (mode === 'readwrite') {
        transaction.addEventListener('complete', () => events.push('complete'), { once: true });
      }
      return transaction;
    } as IDBDatabase['transaction']);
    const adapter = createTestAdapter();

    await adapter.writeInitialCopy(preparedCopy()).then(() => {
      events.push('resolved');
    });

    expect(events).toEqual(['complete', 'resolved']);
  });
});

describe('atomic copied target replacement', () => {
  it('atomically replaces an exact copied ledger with a newly prepared copy', async () => {
    const adapter = createTestAdapter();
    const oldCopy = preparedCopy();
    const newCopy = preparedCopy('new-source-digest');
    await adapter.writeInitialCopy(oldCopy);

    await adapter.replaceCopiedInitialCopy(newCopy, oldCopy.ledger);

    expect(await adapter.inspect()).toEqual({
      projects: newCopy.projects,
      workspace: [newCopy.workspace],
      presets: newCopy.presets,
      pendingImports: newCopy.pendingImports,
      migrationLedger: [newCopy.ledger],
      legacyBackup: [newCopy.backup],
    });
  });

  it.each(COPY_TRANSACTION_FAULTS)(
    'preserves the previous copied target when replacement fails at %s',
    async faultPoint => {
      let replacementArmed = false;
      const adapter = createTestAdapter({
        fault(point) {
          if (replacementArmed && point === faultPoint) {
            throw new Error(`Injected replacement fault at ${point}.`);
          }
        },
      });
      const oldCopy = preparedCopy();
      const newCopy = preparedCopy('new-source-digest');
      await adapter.writeInitialCopy(oldCopy);
      const before = await adapter.inspect();
      replacementArmed = true;

      await expect(adapter.replaceCopiedInitialCopy(
        newCopy,
        oldCopy.ledger,
      )).rejects.toBeInstanceOf(WorkspaceStoreError);

      expect(await adapter.inspect()).toEqual(before);
    },
  );

  it('rejects replacement when the copied ledger no longer matches exactly', async () => {
    const adapter = createTestAdapter();
    const oldCopy = preparedCopy();
    const newCopy = preparedCopy('new-source-digest');
    await adapter.writeInitialCopy(oldCopy);
    const before = await adapter.inspect();

    await expect(adapter.replaceCopiedInitialCopy(newCopy, {
      ...oldCopy.ledger,
      ledgerRevision: oldCopy.ledger.ledgerRevision + 1,
    })).rejects.toMatchObject({ code: 'conflict' });

    expect(await adapter.inspect()).toEqual(before);
  });
});

describe('independent reads and ledger transition', () => {
  it('reads complete records and exact backup in separate read-only operations', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await adapter.writeInitialCopy(copy);

    const records = await adapter.readWorkspaceRecords();
    const backup = await adapter.readLegacyBackup(copy.backup.id);

    expect(records).toEqual<WorkspaceRecords>({
      projects: copy.projects,
      workspace: copy.workspace,
      presets: copy.presets,
      pendingImports: copy.pendingImports,
    });
    expect(backup).toEqual(copy.backup);
    expect(await adapter.readLegacyBackup('missing')).toBeUndefined();

    records.projects[0].project.name = 'Mutated read result';
    (backup as LegacyBackupRecord).digest = 'mutated';
    expect((await adapter.readWorkspaceRecords()).projects[0].project.name)
      .toBe(copy.projects[0].project.name);
    expect((await adapter.readLegacyBackup(copy.backup.id))?.digest).toBe(copy.backup.digest);
  });

  it('marks a matching copied ledger verified with timestamp and incremented revision', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await adapter.writeInitialCopy(copy);

    await expect(adapter.markVerified(verificationExpectation(copy))).resolves.toMatchObject({
      state: 'verified',
      ledgerRevision: 1,
      verifiedAt: TEST_NOW,
      sourceDigest: copy.sourceDigest,
      expectedTargetDigest: copy.targetDigest,
    });
    expect((await adapter.inspect()).migrationLedger).toEqual([{
      ...copy.ledger,
      state: 'verified',
      ledgerRevision: 1,
      verifiedAt: TEST_NOW,
    }]);
  });

  it.each([
    ['ledger revision', { ledgerRevision: 9 }],
    ['source digest', { sourceDigest: 'other-source' }],
    ['target digest', { expectedTargetDigest: 'other-target' }],
  ] as const)('rejects a stale copied-ledger %s comparison', async (_label, override) => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await adapter.writeInitialCopy(copy);

    await expect(adapter.markVerified({
      ...verificationExpectation(copy),
      ...override,
    })).rejects.toMatchObject({ code: 'conflict' });
    expect((await adapter.inspect()).migrationLedger).toEqual([copy.ledger]);
  });

  it('rejects verification while copied-ledger recovery is unresolved', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const adapter = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await adapter.open();
    await adapter.writeInitialCopy(copy);
    const unresolvedLedger: MigrationLedger = {
      ...copy.ledger,
      unresolvedRecovery: {
        id: 'copied-recovery',
        kind: 'target-mismatch',
        detectedAt: TEST_NOW,
      },
    };
    await seedRawRecord(
      indexedDB,
      tracked.names[0],
      'migrationLedger',
      unresolvedLedger,
    );

    await expect(adapter.markVerified(verificationExpectation(copy)))
      .rejects.toMatchObject({ code: 'conflict' });
    expect((await adapter.inspect()).migrationLedger).toEqual([unresolvedLedger]);
  });

  it('lets only one concurrent tab mark the copied ledger verified', async () => {
    const indexedDB = new IDBFactory();
    const left = createTestAdapter({ indexedDB });
    const right = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await Promise.all([left.open(), right.open()]);
    await left.writeInitialCopy(copy);

    const results = await Promise.allSettled([
      left.markVerified(verificationExpectation(copy)),
      right.markVerified(verificationExpectation(copy)),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'conflict' });
    expect((await left.inspect()).migrationLedger[0]).toMatchObject({
      state: 'verified',
      ledgerRevision: 1,
    });
  });

  it('rejects verification when the ledger is no longer copied', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);

    await expect(adapter.markVerified({
      ...verificationExpectation(copy),
      ledgerRevision: 1,
    })).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('normal mutation compare-and-swap', () => {
  it('saves only at the exact project incarnation and revision', async () => {
    const indexedDB = new IDBFactory();
    const adapter = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);
    const original = copy.projects[0];

    const saved = await adapter.saveProject(changedProject(original.project, 'Exact lineage'), {
      incarnation: original.incarnation,
      revision: original.storageRevision,
    });
    expect(saved).toMatchObject({
      incarnation: original.incarnation,
      storageRevision: 1,
      project: { name: 'Exact lineage' },
    });

    const replacement = {
      ...saved,
      incarnation: 'replacement-incarnation',
      project: changedProject(saved.project, 'Replacement'),
    };
    await seedRawRecord(indexedDB, WORKSPACE_DB_NAME, 'projects', replacement);

    await expect(adapter.saveProject(changedProject(saved.project, 'Stale overwrite'), {
      incarnation: original.incarnation,
      revision: replacement.storageRevision,
    })).rejects.toMatchObject({ code: 'conflict' });
    expect((await adapter.inspect()).projects.find(record => record.id === replacement.id))
      .toEqual(replacement);
  });

  it('closes only at the exact project incarnation and revision', async () => {
    const exactIndexedDB = new IDBFactory();
    const exactAdapter = createTestAdapter({ indexedDB: exactIndexedDB });
    const exactCopy = preparedCopy();
    await copyAndVerify(exactAdapter, exactCopy);

    await exactAdapter.closeProject(
      exactCopy.projects[0].id,
      undefined,
      exactCopy.workspace.revision,
      {
        incarnation: exactCopy.projects[0].incarnation,
        revision: exactCopy.projects[0].storageRevision,
      },
    );
    expect((await exactAdapter.inspect()).projects.some(record => (
      record.id === exactCopy.projects[0].id
    ))).toBe(false);

    const staleIndexedDB = new IDBFactory();
    const staleAdapter = createTestAdapter({ indexedDB: staleIndexedDB });
    const staleCopy = preparedCopy();
    await copyAndVerify(staleAdapter, staleCopy);
    const replacement = {
      ...staleCopy.projects[0],
      incarnation: 'replacement-incarnation',
      project: changedProject(staleCopy.projects[0].project, 'Replacement'),
    };
    await seedRawRecord(staleIndexedDB, WORKSPACE_DB_NAME, 'projects', replacement);

    await expect(staleAdapter.closeProject(
      replacement.id,
      undefined,
      staleCopy.workspace.revision,
      {
        incarnation: staleCopy.projects[0].incarnation,
        revision: replacement.storageRevision,
      },
    )).rejects.toMatchObject({ code: 'conflict' });
    expect((await staleAdapter.inspect()).projects.find(record => record.id === replacement.id))
      .toEqual(replacement);
  });

  it('rejects project mutation before verified authority', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await adapter.writeInitialCopy(copy);

    await expect(adapter.saveProject(
      changedProject(copy.projects[0].project, 'Too early'),
      lineageOf(copy.projects[0]),
    )).rejects.toMatchObject({ code: 'authority-lost' });
    expect((await adapter.inspect()).projects[0]).toEqual(copy.projects[0]);
  });

  it('saves a project with a new private storage revision after verification', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);

    await expect(adapter.saveProject(
      changedProject(copy.projects[0].project, 'Durable name'),
      lineageOf(copy.projects[0]),
    )).resolves.toMatchObject({
      project: { name: 'Durable name' },
      storageRevision: 1,
      updatedAt: TEST_NOW,
    });
  });

  it('accepts only exact pending or consumed repeats for a reused stage identity', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);
    const pending = structuredClone(copy.pendingImports[0].pendingImport);
    const digest = 'a'.repeat(64);

    await expect(adapter.stageImport(structuredClone(pending), digest)).resolves.toBeUndefined();
    expect((await adapter.inspect()).pendingImports.filter(record => record.id === pending.id))
      .toHaveLength(1);
    await expect(adapter.stageImport({
      ...structuredClone(pending),
      createdAt: '2026-08-14T16:00:01.000Z',
    }, 'b'.repeat(64))).rejects.toMatchObject({ code: 'conflict' });

    const project = {
      id: pending.targetProjectId,
      name: pending.name,
      initialState: pending.state,
      ...(pending.cloud ? { cloud: pending.cloud } : {}),
    };
    await adapter.consumeImport(pending.id, copy.workspace.revision, {
      pendingImportIdentity: JSON.stringify(pending),
      project: {
        id: project.id,
        project,
        incarnation: 'consumed-import-incarnation',
        storageRevision: 0,
        updatedAt: TEST_NOW,
        consumedImportId: pending.id,
        consumedImportCreatedAt: pending.createdAt,
        consumedImportDigest: digest,
      } as StoredProject,
    });
    await expect(adapter.stageImport(structuredClone(pending), digest)).resolves.toBeUndefined();
    const stored = await adapter.inspect();
    expect(stored.pendingImports.some(record => record.id === pending.id)).toBe(false);
    expect(stored.projects.filter(record => record.id === pending.targetProjectId)).toHaveLength(1);
    await expect(adapter.stageImport({
      ...structuredClone(pending),
      name: 'Conflicting consumed import',
    } as WorkspacePendingImport, 'b'.repeat(64))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('uses immutable consumed digest after later project edits', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);
    const pending = structuredClone(copy.pendingImports[0].pendingImport);
    const digest = 'a'.repeat(64);
    const project = {
      id: pending.targetProjectId,
      name: pending.name,
      initialState: pending.state,
      ...(pending.cloud ? { cloud: pending.cloud } : {}),
    };

    await adapter.consumeImport(pending.id, copy.workspace.revision, {
      pendingImportIdentity: JSON.stringify(pending),
      project: {
        id: project.id,
        project,
        incarnation: 'consumed-import-incarnation',
        storageRevision: 0,
        updatedAt: TEST_NOW,
        consumedImportId: pending.id,
        consumedImportCreatedAt: pending.createdAt,
        consumedImportDigest: digest,
      },
    });
    await adapter.saveProject(
      { ...project, name: 'Edited after import' },
      { incarnation: 'consumed-import-incarnation', revision: 0 },
    );

    await expect(adapter.stageImport(structuredClone(pending), digest)).resolves.toBeUndefined();
    expect((await adapter.inspect()).projects.find(record => record.id === project.id))
      .toMatchObject({
        consumedImportDigest: digest,
        project: { name: 'Edited after import' },
        storageRevision: 1,
      });
  });

  it('rejects consumed stage reuse when only normalized warnings differ', async () => {
    const adapter = createTestAdapter();
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);
    const pending = structuredClone(copy.pendingImports[0].pendingImport);
    const digest = 'a'.repeat(64);
    const project = {
      id: pending.targetProjectId,
      name: pending.name,
      initialState: pending.state,
      ...(pending.cloud ? { cloud: pending.cloud } : {}),
    };
    await adapter.consumeImport(pending.id, copy.workspace.revision, {
      pendingImportIdentity: JSON.stringify(pending),
      project: {
        id: project.id,
        project,
        incarnation: 'consumed-import-incarnation',
        storageRevision: 0,
        updatedAt: TEST_NOW,
        consumedImportId: pending.id,
        consumedImportCreatedAt: pending.createdAt,
        consumedImportDigest: digest,
      },
    });

    await expect(adapter.stageImport({
      ...structuredClone(pending),
      warnings: [...pending.warnings, 'Different retained warning.'],
    }, 'b'.repeat(64))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects one of two stale same-project saves without overwriting the winner', async () => {
    const indexedDB = new IDBFactory();
    const left = createTestAdapter({ indexedDB });
    const right = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await Promise.all([left.open(), right.open()]);
    await copyAndVerify(left, copy);

    const results = await Promise.allSettled([
      left.saveProject(changedProject(copy.projects[0].project, 'Left'), lineageOf(copy.projects[0])),
      right.saveProject(changedProject(copy.projects[0].project, 'Right'), lineageOf(copy.projects[0])),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'conflict' });
    const stored = (await left.inspect()).projects.find(record => record.id === copy.projects[0].id);
    expect(stored).toMatchObject({ storageRevision: 1 });
    expect(['Left', 'Right']).toContain(stored?.project.name);
  });

  it('rejects one of two stale workspace revisions without a partial structural update', async () => {
    const indexedDB = new IDBFactory();
    const left = createTestAdapter({ indexedDB });
    const right = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await Promise.all([left.open(), right.open()]);
    await copyAndVerify(left, copy);
    const [firstId, secondId] = copy.workspace.projectOrder;

    const results = await Promise.allSettled([
      left.saveWorkspace({
        ...copy.workspace,
        activeProjectId: secondId,
      }, 0),
      right.saveWorkspace({
        ...copy.workspace,
        projectOrder: [secondId, firstId],
      }, 0),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'conflict' });
    expect((await left.inspect()).workspace[0].revision).toBe(1);
  });

  it('rejects normal mutations while recovery is unresolved', async () => {
    const indexedDB = new IDBFactory();
    const tracked = trackFactory(indexedDB);
    const adapter = createTestAdapter({ indexedDB });
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);
    const verifiedLedger = (await adapter.inspect()).migrationLedger[0];
    await seedRawRecord(indexedDB, tracked.names[0], 'migrationLedger', {
      ...verifiedLedger,
      unresolvedRecovery: {
        id: 'recovery-1',
        kind: 'legacy-drift',
        detectedAt: TEST_NOW,
      },
    });

    await expect(adapter.saveProject(copy.projects[0].project, lineageOf(copy.projects[0])))
      .rejects.toMatchObject({ code: 'authority-lost' });
  });

  it('aborts a mutation fault and preserves the prior project record', async () => {
    let failMutation = false;
    const adapter = createTestAdapter({
      fault: point => {
        if (failMutation && point === 'mutation.before-complete') {
          throw new DOMException('No space.', 'QuotaExceededError');
        }
      },
    });
    const copy = preparedCopy();
    await copyAndVerify(adapter, copy);
    failMutation = true;

    await expect(adapter.saveProject(
      changedProject(copy.projects[0].project, 'Must roll back'),
      lineageOf(copy.projects[0]),
    )).rejects.toMatchObject({ code: 'quota' });
    expect((await adapter.inspect()).projects[0]).toEqual(copy.projects[0]);
  });
});
