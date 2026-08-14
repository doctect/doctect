import {
  openDB,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb';
import {
  WorkspaceStoreError,
  type WorkspaceProject,
} from './contracts';
import type { FaultInjector } from './faults';
import type {
  PreparedInitialCopy,
  WorkspaceRecords,
} from './migration';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_DB_VERSION,
  WORKSPACE_MIGRATION_ID,
  type LegacyBackupRecord,
  type LocalWorkspaceDatabase,
  type MigrationLedger,
  type StoredPendingImport,
  type StoredPreset,
  type StoredProject,
  type StoredWorkspace,
} from './schema';

const STORE_NAMES = [
  'projects',
  'workspace',
  'presets',
  'pendingImports',
  'migrationLedger',
  'legacyBackup',
] as const;

type StoreName = typeof STORE_NAMES[number];
type WriteTransaction = IDBPTransaction<
  LocalWorkspaceDatabase,
  readonly StoreName[],
  'readwrite'
>;

export interface IndexedDbAdapterEnvironment {
  indexedDB: IDBFactory;
  now(): string;
  fault?: FaultInjector;
  onAuthorityLost?: (error: WorkspaceStoreError) => void;
}

export interface IndexedDbSchemaDescription {
  projects: string[];
  workspace: string[];
  presets: string[];
  pendingImports: string[];
  migrationLedger: string[];
  legacyBackup: string[];
}

export interface IndexedDbInspection {
  projects: StoredProject[];
  workspace: StoredWorkspace[];
  presets: StoredPreset[];
  pendingImports: StoredPendingImport[];
  migrationLedger: MigrationLedger[];
  legacyBackup: LegacyBackupRecord[];
}

export interface VerificationExpectation {
  ledgerRevision: number;
  sourceDigest: string;
  expectedTargetDigest: string;
}

export type InitialCopyResult = {
  status: 'copied' | 'existing-ledger' | 'orphaned-target';
};

export interface IndexedDbAdapter {
  open(): Promise<void>;
  close(): void;
  describeSchema(): Promise<IndexedDbSchemaDescription>;
  inspect(): Promise<IndexedDbInspection>;
  writeInitialCopy(prepared: PreparedInitialCopy): Promise<InitialCopyResult>;
  readWorkspaceRecords(): Promise<WorkspaceRecords>;
  readLegacyBackup(id: string): Promise<LegacyBackupRecord | undefined>;
  markVerified(expected: VerificationExpectation): Promise<MigrationLedger>;
  saveProject(project: WorkspaceProject, expectedStorageRevision: number): Promise<StoredProject>;
  saveWorkspace(workspace: StoredWorkspace, expectedRevision: number): Promise<StoredWorkspace>;
}

const recognizedLedger = (value: unknown): value is MigrationLedger => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<MigrationLedger>;
  return candidate.id === WORKSPACE_MIGRATION_ID
    && candidate.indexedDbVersion === WORKSPACE_DB_VERSION
    && candidate.persistenceRolloutEpoch === 1
    && (
      candidate.state === 'copied'
      || candidate.state === 'verified'
      || candidate.state === 'cleanup-started'
      || candidate.state === 'cleanup-complete'
    );
};

const errorName = (error: unknown): string | undefined => {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) {
    return undefined;
  }
  const name = Reflect.get(error, 'name');
  return typeof name === 'string' ? name : undefined;
};

const mappedError = (
  error: unknown,
  fallback: 'io' | 'unavailable' = 'io',
): WorkspaceStoreError => {
  if (error instanceof WorkspaceStoreError) return error;

  switch (errorName(error)) {
    case 'QuotaExceededError':
      return new WorkspaceStoreError('IndexedDB quota was exceeded.', 'quota', error);
    case 'DataCloneError':
      return new WorkspaceStoreError('Value could not be cloned for IndexedDB.', 'clone', error);
    case 'ConstraintError':
      return new WorkspaceStoreError('IndexedDB write conflicted with stored data.', 'conflict', error);
    case 'InvalidStateError':
    case 'NotFoundError':
    case 'VersionError':
      return new WorkspaceStoreError('IndexedDB is unavailable.', 'unavailable', error);
    default:
      return fallback === 'unavailable'
        ? new WorkspaceStoreError('IndexedDB is unavailable.', 'unavailable', error)
        : new WorkspaceStoreError('IndexedDB operation failed.', 'io', error);
  }
};

const conflict = (message: string): WorkspaceStoreError =>
  new WorkspaceStoreError(message, 'conflict');

const unverifiedAuthority = (): WorkspaceStoreError =>
  new WorkspaceStoreError('IndexedDB workspace authority is not verified.', 'authority-lost');

const restoreGlobalIndexedDB = (
  descriptor: PropertyDescriptor | undefined,
): void => {
  if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
  else Reflect.deleteProperty(globalThis, 'indexedDB');
};

const openWithFactory = <T>(indexedDB: IDBFactory, operation: () => T): T => {
  if (globalThis.indexedDB === indexedDB) return operation();

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  try {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      writable: true,
      value: indexedDB,
    });
    return operation();
  } finally {
    restoreGlobalIndexedDB(descriptor);
  }
};

const abortTransaction = async (
  transaction: WriteTransaction,
  requests: Promise<unknown>[],
  error: unknown,
): Promise<never> => {
  try {
    transaction.abort();
  } catch {
    // Transaction may already have aborted because a request failed.
  }
  await Promise.allSettled([...requests, transaction.done]);
  throw mappedError(error);
};

const requireVerifiedAuthority: (
  ledger: unknown,
) => asserts ledger is MigrationLedger = ledger => {
  if (!recognizedLedger(ledger)
    || ledger.state !== 'verified'
    || ledger.unresolvedRecovery !== null) {
    throw unverifiedAuthority();
  }
};

export const createIndexedDbAdapter = (
  environment: IndexedDbAdapterEnvironment,
): IndexedDbAdapter => {
  let database: IDBPDatabase<LocalWorkspaceDatabase> | undefined;
  let opening: Promise<void> | undefined;
  let authorityError: WorkspaceStoreError | undefined;

  const reportAuthorityLoss = (
    error: WorkspaceStoreError,
    connection?: IDBPDatabase<LocalWorkspaceDatabase>,
  ): void => {
    if (authorityError) return;
    authorityError = error;
    const connectionToClose = connection ?? database;
    if (database === connectionToClose) database = undefined;
    connectionToClose?.close();
    environment.onAuthorityLost?.(error);
  };

  const openConnection = async (): Promise<void> => {
    if (authorityError) throw authorityError;

    let openedConnection: IDBPDatabase<LocalWorkspaceDatabase> | undefined;
    let blockedError: WorkspaceStoreError | undefined;
    let rejectBlocked!: (error: WorkspaceStoreError) => void;
    const blocked = new Promise<never>((_resolve, reject) => {
      rejectBlocked = reject;
    });

    let underlyingOpen: Promise<IDBPDatabase<LocalWorkspaceDatabase>>;
    try {
      underlyingOpen = openWithFactory(environment.indexedDB, () =>
        openDB<LocalWorkspaceDatabase>(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION, {
          upgrade(upgradeDatabase) {
            for (const storeName of STORE_NAMES) {
              if (!upgradeDatabase.objectStoreNames.contains(storeName)) {
                upgradeDatabase.createObjectStore(storeName, { keyPath: 'id' });
              }
            }
          },
          blocked() {
            blockedError ??= new WorkspaceStoreError(
              'IndexedDB upgrade is blocked.',
              'unavailable',
            );
            rejectBlocked(blockedError);
          },
          blocking() {
            reportAuthorityLoss(
              new WorkspaceStoreError(
                'IndexedDB authority was lost to a database version change.',
                'authority-lost',
              ),
              openedConnection,
            );
          },
          terminated() {
            reportAuthorityLoss(
              new WorkspaceStoreError('IndexedDB connection was terminated.', 'unavailable'),
              openedConnection,
            );
          },
        }));
    } catch (error) {
      throw mappedError(error, 'unavailable');
    }

    const guardedOpen = underlyingOpen.then(opened => {
      openedConnection = opened;
      if (blockedError) {
        opened.close();
        throw blockedError;
      }
      return opened;
    });

    try {
      database = await Promise.race([guardedOpen, blocked]);
    } catch (error) {
      throw mappedError(error, 'unavailable');
    }
  };

  const open = (): Promise<void> => {
    if (authorityError) return Promise.reject(authorityError);
    if (database) return Promise.resolve();
    if (!opening) {
      opening = openConnection().finally(() => {
        opening = undefined;
      });
    }
    return opening;
  };

  const getDatabase = async (): Promise<IDBPDatabase<LocalWorkspaceDatabase>> => {
    if (authorityError) throw authorityError;
    await open();
    if (authorityError) throw authorityError;
    if (!database) throw new WorkspaceStoreError('IndexedDB is unavailable.', 'unavailable');
    return database;
  };

  const describeSchema = async (): Promise<IndexedDbSchemaDescription> => {
    const activeDatabase = await getDatabase();
    let transaction;
    try {
      transaction = activeDatabase.transaction(STORE_NAMES, 'readonly');
      const description = Object.fromEntries(STORE_NAMES.map(storeName => [
        storeName,
        Array.from(transaction.objectStore(storeName).indexNames),
      ])) as unknown as IndexedDbSchemaDescription;
      await transaction.done;
      return description;
    } catch (error) {
      if (transaction) await transaction.done.catch(() => {});
      throw mappedError(error);
    }
  };

  const inspect = async (): Promise<IndexedDbInspection> => {
    const activeDatabase = await getDatabase();
    let transaction;
    try {
      transaction = activeDatabase.transaction(STORE_NAMES, 'readonly');
      const requests = STORE_NAMES.map(storeName =>
        transaction.objectStore(storeName).getAll());
      const [
        projects,
        workspace,
        presets,
        pendingImports,
        migrationLedger,
        legacyBackup,
      ] = await Promise.all(requests);
      await transaction.done;
      return {
        projects: projects as StoredProject[],
        workspace: workspace as StoredWorkspace[],
        presets: presets as StoredPreset[],
        pendingImports: pendingImports as StoredPendingImport[],
        migrationLedger: migrationLedger as MigrationLedger[],
        legacyBackup: legacyBackup as LegacyBackupRecord[],
      };
    } catch (error) {
      if (transaction) await transaction.done.catch(() => {});
      throw mappedError(error);
    }
  };

  const writeInitialCopy = async (
    prepared: PreparedInitialCopy,
  ): Promise<InitialCopyResult> => {
    const activeDatabase = await getDatabase();
    try {
      environment.fault?.('copy.before-transaction');
    } catch (error) {
      throw mappedError(error);
    }

    const transaction = activeDatabase.transaction(STORE_NAMES, 'readwrite');
    const requests: Promise<unknown>[] = [];
    try {
      const ledgerRequest = transaction.objectStore('migrationLedger').get(WORKSPACE_MIGRATION_ID);
      const countRequests = STORE_NAMES.map(storeName =>
        transaction.objectStore(storeName).count());
      const [ledger, ...counts] = await Promise.all([ledgerRequest, ...countRequests]);

      if (recognizedLedger(ledger)) {
        await transaction.done;
        return { status: 'existing-ledger' };
      }
      if (counts.some(count => count !== 0)) {
        await transaction.done;
        return { status: 'orphaned-target' };
      }

      const projectStore = transaction.objectStore('projects');
      for (const project of prepared.projects) requests.push(projectStore.add(project));
      environment.fault?.('copy.after-projects');

      requests.push(transaction.objectStore('workspace').add(prepared.workspace));
      environment.fault?.('copy.after-workspace');

      const presetStore = transaction.objectStore('presets');
      for (const preset of prepared.presets) requests.push(presetStore.add(preset));
      environment.fault?.('copy.after-presets');

      const pendingImportStore = transaction.objectStore('pendingImports');
      for (const pendingImport of prepared.pendingImports) {
        requests.push(pendingImportStore.add(pendingImport));
      }
      environment.fault?.('copy.after-pending-imports');

      requests.push(transaction.objectStore('legacyBackup').add(prepared.backup));
      environment.fault?.('copy.after-backup');

      requests.push(transaction.objectStore('migrationLedger').add(prepared.ledger));
      environment.fault?.('copy.after-ledger');
      environment.fault?.('copy.before-complete');

      await Promise.all(requests);
      await transaction.done;
      return { status: 'copied' };
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const readWorkspaceRecords = async (): Promise<WorkspaceRecords> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['projects', 'workspace', 'presets', 'pendingImports'] as const;
    let transaction;
    try {
      transaction = activeDatabase.transaction(storeNames, 'readonly');
      const [projects, workspace, presets, pendingImports] = await Promise.all([
        transaction.objectStore('projects').getAll(),
        transaction.objectStore('workspace').get('current'),
        transaction.objectStore('presets').getAll(),
        transaction.objectStore('pendingImports').getAll(),
      ]);
      await transaction.done;
      return {
        projects,
        workspace: workspace as StoredWorkspace,
        presets,
        pendingImports,
      };
    } catch (error) {
      if (transaction) await transaction.done.catch(() => {});
      throw mappedError(error);
    }
  };

  const readLegacyBackup = async (
    id: string,
  ): Promise<LegacyBackupRecord | undefined> => {
    const activeDatabase = await getDatabase();
    let transaction;
    try {
      transaction = activeDatabase.transaction('legacyBackup', 'readonly');
      const backup = await transaction.store.get(id);
      await transaction.done;
      return backup;
    } catch (error) {
      if (transaction) await transaction.done.catch(() => {});
      throw mappedError(error);
    }
  };

  const markVerified = async (
    expected: VerificationExpectation,
  ): Promise<MigrationLedger> => {
    const activeDatabase = await getDatabase();
    const verifiedAt = environment.now();
    const transaction = activeDatabase.transaction('migrationLedger', 'readwrite');
    const requests: Promise<unknown>[] = [];
    try {
      const ledger = await transaction.store.get(WORKSPACE_MIGRATION_ID);
      if (!recognizedLedger(ledger)
        || ledger.state !== 'copied'
        || ledger.ledgerRevision !== expected.ledgerRevision
        || ledger.sourceDigest !== expected.sourceDigest
        || ledger.expectedTargetDigest !== expected.expectedTargetDigest) {
        throw conflict('Copied migration ledger changed before verification.');
      }
      const verifiedLedger: MigrationLedger = {
        ...ledger,
        state: 'verified',
        ledgerRevision: ledger.ledgerRevision + 1,
        verifiedAt,
      };
      requests.push(transaction.store.put(verifiedLedger));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await transaction.done;
      return verifiedLedger;
    } catch (error) {
      return abortTransaction(transaction as WriteTransaction, requests, error);
    }
  };

  const saveProject = async (
    project: WorkspaceProject,
    expectedStorageRevision: number,
  ): Promise<StoredProject> => {
    const activeDatabase = await getDatabase();
    const updatedAt = environment.now();
    const storeNames = ['migrationLedger', 'projects'] as const;
    const transaction = activeDatabase.transaction(storeNames, 'readwrite');
    const requests: Promise<unknown>[] = [];
    try {
      const ledger = await transaction.objectStore('migrationLedger').get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const stored = await transaction.objectStore('projects').get(project.id);
      if (!stored || stored.storageRevision !== expectedStorageRevision) {
        throw conflict(`Project ${project.id} storage revision changed.`);
      }
      const next: StoredProject = {
        id: project.id,
        project,
        storageRevision: stored.storageRevision + 1,
        updatedAt,
      };
      requests.push(transaction.objectStore('projects').put(next));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await transaction.done;
      return next;
    } catch (error) {
      return abortTransaction(transaction as WriteTransaction, requests, error);
    }
  };

  const saveWorkspace = async (
    workspace: StoredWorkspace,
    expectedRevision: number,
  ): Promise<StoredWorkspace> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['migrationLedger', 'workspace'] as const;
    const transaction = activeDatabase.transaction(storeNames, 'readwrite');
    const requests: Promise<unknown>[] = [];
    try {
      const ledger = await transaction.objectStore('migrationLedger').get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const stored = await transaction.objectStore('workspace').get('current');
      if (!stored || stored.revision !== expectedRevision) {
        throw conflict('Workspace revision changed.');
      }
      const next: StoredWorkspace = {
        ...workspace,
        id: 'current',
        revision: stored.revision + 1,
      };
      requests.push(transaction.objectStore('workspace').put(next));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await transaction.done;
      return next;
    } catch (error) {
      return abortTransaction(transaction as WriteTransaction, requests, error);
    }
  };

  return {
    open,
    close() {
      database?.close();
      database = undefined;
    },
    describeSchema,
    inspect,
    writeInitialCopy,
    readWorkspaceRecords,
    readLegacyBackup,
    markVerified,
    saveProject,
    saveWorkspace,
  };
};
