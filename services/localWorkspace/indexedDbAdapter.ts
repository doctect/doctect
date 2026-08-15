import {
  openDB,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb';
import {
  WorkspaceStoreError,
  type WorkspaceCustomPreset,
  type WorkspacePendingImport,
  type WorkspaceProject,
} from './contracts';
import { canonicalStringify } from './canonical';
import type { FaultInjector } from './faults';
import type {
  PreparedInitialCopy,
  WorkspaceRecords,
} from './migration';
import {
  validatePreparedLegacyRecovery,
  type PreparedLegacyRecovery,
} from './recovery';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_DB_VERSION,
  WORKSPACE_MIGRATION_ID,
  type LegacyBackupRecord,
  type LocalWorkspaceDatabase,
  type MigrationLedger,
  type RecoveryMarker,
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

export interface PreparedImportConsumption {
  pendingImportIdentity: string;
  project: StoredProject;
}

export interface LegacyDriftExpectation {
  expectedLedgerRevision: number;
  expectedAcceptedLegacyDigest: string;
  expectedRecoveryId: string | null;
  marker: RecoveryMarker & { observedLegacyDigest: string };
}

export interface IndexedDbAdapter {
  open(): Promise<void>;
  close(): void;
  describeSchema(): Promise<IndexedDbSchemaDescription>;
  inspect(): Promise<IndexedDbInspection>;
  writeInitialCopy(prepared: PreparedInitialCopy): Promise<InitialCopyResult>;
  readWorkspaceRecords(): Promise<WorkspaceRecords>;
  readLegacyBackup(id: string): Promise<LegacyBackupRecord | undefined>;
  readMigrationLedger(): Promise<MigrationLedger | undefined>;
  markVerified(expected: VerificationExpectation): Promise<MigrationLedger>;
  markLegacyDrift(expected: LegacyDriftExpectation): Promise<MigrationLedger>;
  recoverLegacyAsCopies(prepared: PreparedLegacyRecovery): Promise<MigrationLedger>;
  saveProject(project: WorkspaceProject, expectedStorageRevision: number): Promise<StoredProject>;
  saveWorkspace(workspace: StoredWorkspace, expectedRevision: number): Promise<StoredWorkspace>;
  createAndActivateProject(
    project: WorkspaceProject,
    expectedWorkspaceRevision: number,
  ): Promise<StoredWorkspace>;
  activateProject(projectId: string, expectedWorkspaceRevision: number): Promise<StoredWorkspace>;
  closeProject(
    projectId: string,
    successor: WorkspaceProject | undefined,
    expectedWorkspaceRevision: number,
    expectedStorageRevision: number,
  ): Promise<StoredWorkspace>;
  saveCustomPreset(preset: WorkspaceCustomPreset): Promise<void>;
  deleteCustomPreset(presetId: string): Promise<void>;
  stageImport(pendingImport: WorkspacePendingImport): Promise<void>;
  consumeImport(
    importId: string,
    expectedWorkspaceRevision: number,
    prepared?: PreparedImportConsumption,
    knownTargetProjectId?: string,
  ): Promise<{ targetProjectId: string; consumed: boolean }>;
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

const validation = (message: string): WorkspaceStoreError =>
  new WorkspaceStoreError(message, 'validation');

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
  transaction: WriteTransaction | undefined,
  requests: Promise<unknown>[],
  error: unknown,
): Promise<never> => {
  if (transaction) {
    try {
      transaction.abort();
    } catch {
      // Transaction may already have aborted because a request failed.
    }
    await Promise.allSettled([...requests, transaction.done]);
  }
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

const requireWorkspaceRevision = (
  workspace: StoredWorkspace | undefined,
  expectedRevision: number,
): StoredWorkspace => {
  if (!workspace || workspace.revision !== expectedRevision) {
    throw conflict('Workspace revision changed.');
  }
  return workspace;
};

export const createIndexedDbAdapter = (
  environment: IndexedDbAdapterEnvironment,
): IndexedDbAdapter => {
  let database: IDBPDatabase<LocalWorkspaceDatabase> | undefined;
  let opening: Promise<void> | undefined;
  let openingGeneration: number | undefined;
  let openGeneration = 0;
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

  const openConnection = async (generation: number): Promise<void> => {
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
      const opened = await Promise.race([guardedOpen, blocked]);
      if (generation !== openGeneration) {
        opened.close();
        return;
      }
      database = opened;
    } catch (error) {
      throw mappedError(error, 'unavailable');
    }
  };

  const open = (): Promise<void> => {
    if (authorityError) return Promise.reject(authorityError);
    if (database) return Promise.resolve();
    if (!opening) {
      const generation = openGeneration;
      openingGeneration = generation;
      opening = openConnection(generation).finally(() => {
        if (openingGeneration === generation) {
          opening = undefined;
          openingGeneration = undefined;
        }
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

    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      transaction = activeDatabase.transaction(STORE_NAMES, 'readwrite');
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

  const readMigrationLedger = async (): Promise<MigrationLedger | undefined> => {
    const activeDatabase = await getDatabase();
    let transaction;
    try {
      transaction = activeDatabase.transaction('migrationLedger', 'readonly');
      const ledger = await transaction.store.get(WORKSPACE_MIGRATION_ID);
      await transaction.done;
      return ledger;
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
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const ledgerTransaction = activeDatabase.transaction('migrationLedger', 'readwrite');
      transaction = ledgerTransaction as WriteTransaction;
      const ledger = await ledgerTransaction.store.get(WORKSPACE_MIGRATION_ID);
      if (!recognizedLedger(ledger)
        || ledger.state !== 'copied'
        || ledger.unresolvedRecovery !== null
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
      requests.push(ledgerTransaction.store.put(verifiedLedger));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await ledgerTransaction.done;
      return verifiedLedger;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const markLegacyDrift = async (
    expected: LegacyDriftExpectation,
  ): Promise<MigrationLedger> => {
    const activeDatabase = await getDatabase();
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const ledgerTransaction = activeDatabase.transaction('migrationLedger', 'readwrite');
      transaction = ledgerTransaction as WriteTransaction;
      const ledger = await ledgerTransaction.store.get(WORKSPACE_MIGRATION_ID);
      if (!recognizedLedger(ledger)
        || ledger.state !== 'verified'
        || ledger.acceptedLegacyDigest !== expected.expectedAcceptedLegacyDigest) {
        throw conflict('Verified migration ledger changed before legacy drift was recorded.');
      }
      if (ledger.unresolvedRecovery?.kind === 'legacy-drift'
        && ledger.unresolvedRecovery.observedLegacyDigest === expected.marker.observedLegacyDigest) {
        await ledgerTransaction.done;
        return ledger;
      }
      if (ledger.ledgerRevision !== expected.expectedLedgerRevision
        || (expected.expectedRecoveryId === null
          ? ledger.unresolvedRecovery !== null
          : ledger.unresolvedRecovery?.id !== expected.expectedRecoveryId)) {
        throw conflict('Legacy recovery marker changed before drift was recorded.');
      }
      const next: MigrationLedger = {
        ...ledger,
        ledgerRevision: ledger.ledgerRevision + 1,
        unresolvedRecovery: expected.marker,
      };
      requests.push(ledgerTransaction.store.put(next));
      await Promise.all(requests);
      await ledgerTransaction.done;
      return next;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const recoverLegacyAsCopies = async (
    prepared: PreparedLegacyRecovery,
  ): Promise<MigrationLedger> => {
    try {
      await validatePreparedLegacyRecovery(prepared);
    } catch (error) {
      throw new WorkspaceStoreError(
        'Prepared legacy recovery target is invalid.',
        'validation',
        error,
      );
    }
    const activeDatabase = await getDatabase();
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      transaction = activeDatabase.transaction(STORE_NAMES, 'readwrite');
      const ledgerStore = transaction.objectStore('migrationLedger');
      const projectStore = transaction.objectStore('projects');
      const workspaceStore = transaction.objectStore('workspace');
      const presetStore = transaction.objectStore('presets');
      const importStore = transaction.objectStore('pendingImports');
      const [ledger, workspace, projects, presets, pendingImports] = await Promise.all([
        ledgerStore.get(WORKSPACE_MIGRATION_ID),
        workspaceStore.get('current'),
        projectStore.getAll(),
        presetStore.getAll(),
        importStore.getAll(),
      ]);
      if (!recognizedLedger(ledger)
        || ledger.state !== 'verified'
        || canonicalStringify(ledger) !== canonicalStringify(prepared.expectedLedger)
        || ledger.ledgerRevision !== prepared.expectedLedgerRevision
        || ledger.acceptedLegacyDigest !== prepared.expectedAcceptedLegacyDigest
        || ledger.acceptedLegacyBackupId !== prepared.expectedAcceptedLegacyBackupId
        || ledger.unresolvedRecovery?.kind !== 'legacy-drift'
        || ledger.unresolvedRecovery.id !== prepared.recoveryId
        || ledger.unresolvedRecovery.observedLegacyDigest !== prepared.observedLegacyDigest
        || prepared.backup.digest !== prepared.observedLegacyDigest) {
        throw conflict('Legacy recovery authority changed before copies were written.');
      }
      if (!workspace) throw conflict('Workspace record changed before legacy recovery.');

      const currentRecords: WorkspaceRecords = {
        projects,
        workspace,
        presets,
        pendingImports,
      };
      if (canonicalStringify(currentRecords)
        !== canonicalStringify(prepared.expectedRecords)) {
        throw conflict('Workspace records changed before legacy recovery.');
      }

      for (const record of prepared.projects) requests.push(projectStore.add(record));
      requests.push(workspaceStore.put(prepared.workspace));
      for (const record of prepared.presets) requests.push(presetStore.add(record));
      for (const record of prepared.pendingImports) requests.push(importStore.add(record));
      requests.push(transaction.objectStore('legacyBackup').add(prepared.backup));
      requests.push(ledgerStore.put(prepared.ledger));
      environment.fault?.('recovery.before-complete');
      await Promise.all(requests);
      await transaction.done;
      return structuredClone(prepared.ledger);
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const saveProject = async (
    project: WorkspaceProject,
    expectedStorageRevision: number,
  ): Promise<StoredProject> => {
    const activeDatabase = await getDatabase();
    const updatedAt = environment.now();
    const storeNames = ['migrationLedger', 'projects'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const projectTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = projectTransaction as WriteTransaction;
      const ledger = await projectTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const stored = await projectTransaction.objectStore('projects').get(project.id);
      if (!stored || stored.storageRevision !== expectedStorageRevision) {
        throw conflict(`Project ${project.id} storage revision changed.`);
      }
      const next: StoredProject = {
        ...stored,
        id: project.id,
        project,
        storageRevision: stored.storageRevision + 1,
        updatedAt,
      };
      requests.push(projectTransaction.objectStore('projects').put(next));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await projectTransaction.done;
      return next;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const saveWorkspace = async (
    workspace: StoredWorkspace,
    expectedRevision: number,
  ): Promise<StoredWorkspace> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['migrationLedger', 'workspace'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const workspaceTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = workspaceTransaction as WriteTransaction;
      const ledger = await workspaceTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const stored = await workspaceTransaction.objectStore('workspace').get('current');
      if (!stored || stored.revision !== expectedRevision) {
        throw conflict('Workspace revision changed.');
      }
      const next: StoredWorkspace = {
        ...workspace,
        id: 'current',
        revision: stored.revision + 1,
      };
      requests.push(workspaceTransaction.objectStore('workspace').put(next));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await workspaceTransaction.done;
      return next;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const createAndActivateProject = async (
    project: WorkspaceProject,
    expectedWorkspaceRevision: number,
  ): Promise<StoredWorkspace> => {
    const activeDatabase = await getDatabase();
    const updatedAt = environment.now();
    const storeNames = ['projects', 'workspace', 'migrationLedger'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const projectTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = projectTransaction as WriteTransaction;
      const ledger = await projectTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const workspace = requireWorkspaceRevision(
        await projectTransaction.objectStore('workspace').get('current'),
        expectedWorkspaceRevision,
      );
      if (await projectTransaction.objectStore('projects').get(project.id)) {
        throw validation(`Project ${project.id} already exists.`);
      }

      const storedProject: StoredProject = {
        id: project.id,
        project,
        storageRevision: 0,
        updatedAt,
      };
      const nextWorkspace: StoredWorkspace = {
        ...workspace,
        projectOrder: [...workspace.projectOrder, project.id],
        activeProjectId: project.id,
        revision: workspace.revision + 1,
      };
      requests.push(projectTransaction.objectStore('projects').add(storedProject));
      requests.push(projectTransaction.objectStore('workspace').put(nextWorkspace));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await projectTransaction.done;
      return nextWorkspace;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const activateProject = async (
    projectId: string,
    expectedWorkspaceRevision: number,
  ): Promise<StoredWorkspace> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['projects', 'workspace', 'migrationLedger'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const workspaceTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = workspaceTransaction as WriteTransaction;
      const ledger = await workspaceTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const workspace = requireWorkspaceRevision(
        await workspaceTransaction.objectStore('workspace').get('current'),
        expectedWorkspaceRevision,
      );
      if (!await workspaceTransaction.objectStore('projects').get(projectId)
        || !workspace.projectOrder.includes(projectId)) {
        throw validation(`Project ${projectId} does not exist.`);
      }
      const nextWorkspace: StoredWorkspace = {
        ...workspace,
        activeProjectId: projectId,
        revision: workspace.revision + 1,
      };
      requests.push(workspaceTransaction.objectStore('workspace').put(nextWorkspace));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await workspaceTransaction.done;
      return nextWorkspace;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const closeProject = async (
    projectId: string,
    successor: WorkspaceProject | undefined,
    expectedWorkspaceRevision: number,
    expectedStorageRevision: number,
  ): Promise<StoredWorkspace> => {
    const activeDatabase = await getDatabase();
    const updatedAt = environment.now();
    const storeNames = ['projects', 'workspace', 'migrationLedger'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const workspaceTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = workspaceTransaction as WriteTransaction;
      const ledger = await workspaceTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const workspace = requireWorkspaceRevision(
        await workspaceTransaction.objectStore('workspace').get('current'),
        expectedWorkspaceRevision,
      );
      const projectStore = workspaceTransaction.objectStore('projects');
      const target = await projectStore.get(projectId);
      const targetIndex = workspace.projectOrder.indexOf(projectId);
      if (!target || target.storageRevision !== expectedStorageRevision) {
        throw conflict(`Project ${projectId} storage revision changed.`);
      }
      if (targetIndex < 0) throw validation(`Project ${projectId} does not exist.`);

      const remainingOrder = workspace.projectOrder.filter(id => id !== projectId);
      let nextOrder: string[];
      let activeProjectId: string;
      requests.push(projectStore.delete(projectId));
      if (remainingOrder.length === 0) {
        if (!successor) {
          throw validation('Closing the last project requires a successor.');
        }
        if (successor.id === projectId || await projectStore.get(successor.id)) {
          throw validation(`Successor project ${successor.id} is not unique.`);
        }
        requests.push(projectStore.add({
          id: successor.id,
          project: successor,
          storageRevision: 0,
          updatedAt,
        }));
        nextOrder = [successor.id];
        activeProjectId = successor.id;
      } else {
        nextOrder = remainingOrder;
        activeProjectId = remainingOrder[Math.max(0, targetIndex - 1)];
      }

      const nextWorkspace: StoredWorkspace = {
        ...workspace,
        projectOrder: nextOrder,
        activeProjectId,
        revision: workspace.revision + 1,
      };
      requests.push(workspaceTransaction.objectStore('workspace').put(nextWorkspace));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await workspaceTransaction.done;
      return nextWorkspace;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const saveCustomPreset = async (
    preset: WorkspaceCustomPreset,
  ): Promise<void> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['presets', 'migrationLedger'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const presetTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = presetTransaction as WriteTransaction;
      const ledger = await presetTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const presetStore = presetTransaction.objectStore('presets');
      const [stored, allPresets] = await Promise.all([
        presetStore.get(preset.id),
        presetStore.getAll(),
      ]);
      const position = stored?.position
        ?? Math.max(-1, ...allPresets.map(record => record.position)) + 1;
      requests.push(presetStore.put({ id: preset.id, preset, position }));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await presetTransaction.done;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const deleteCustomPreset = async (presetId: string): Promise<void> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['presets', 'migrationLedger'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const presetTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = presetTransaction as WriteTransaction;
      const ledger = await presetTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const presetStore = presetTransaction.objectStore('presets');
      const allPresets = await presetStore.getAll();
      const target = allPresets.find(record => record.id === presetId);
      if (!target) throw validation(`Custom preset ${presetId} does not exist.`);
      requests.push(presetStore.delete(presetId));
      for (const record of allPresets) {
        if (record.position <= target.position) continue;
        requests.push(presetStore.put({ ...record, position: record.position - 1 }));
      }
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await presetTransaction.done;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const stageImport = async (pendingImport: WorkspacePendingImport): Promise<void> => {
    const activeDatabase = await getDatabase();
    const storeNames = ['pendingImports', 'projects', 'migrationLedger'] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const importTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = importTransaction as WriteTransaction;
      const ledger = await importTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const importStore = importTransaction.objectStore('pendingImports');
      const projectStore = importTransaction.objectStore('projects');
      const [pendingImports, projects] = await Promise.all([
        importStore.getAll(),
        projectStore.getAll(),
      ]);
      const storedPending = pendingImports.find(record => record.id === pendingImport.id);
      const consumedProjects = projects.filter(record =>
        record.consumedImportId === pendingImport.id);
      if (storedPending && consumedProjects.length > 0) {
        throw conflict(`Import ${pendingImport.id} provenance is ambiguous.`);
      }
      if (storedPending) {
        if (canonicalStringify(storedPending.pendingImport)
          !== canonicalStringify(pendingImport)) {
          throw conflict(`Pending import ${pendingImport.id} changed.`);
        }
        await importTransaction.done;
        return;
      }
      if (consumedProjects.length > 0) {
        if (consumedProjects.length > 1) {
          throw conflict(`Consumed import ${pendingImport.id} provenance is ambiguous.`);
        }
        const consumed = consumedProjects[0];
        const expectedProject: WorkspaceProject = {
          id: pendingImport.targetProjectId,
          name: pendingImport.name,
          initialState: pendingImport.state,
          ...(pendingImport.cloud ? { cloud: pendingImport.cloud } : {}),
        };
        if (consumed.id !== pendingImport.targetProjectId
          || consumed.consumedImportCreatedAt !== pendingImport.createdAt
          || canonicalStringify(consumed.project) !== canonicalStringify(expectedProject)) {
          throw conflict(`Consumed import ${pendingImport.id} changed.`);
        }
        await importTransaction.done;
        return;
      }
      if (pendingImports.some(record =>
        record.pendingImport.targetProjectId === pendingImport.targetProjectId)) {
        throw conflict(`Pending import target ${pendingImport.targetProjectId} already exists.`);
      }
      if (projects.some(record => record.id === pendingImport.targetProjectId)) {
        throw conflict(`Project ${pendingImport.targetProjectId} already exists.`);
      }
      const position = Math.max(-1, ...pendingImports.map(record => record.position)) + 1;
      requests.push(importStore.add({
        id: pendingImport.id,
        pendingImport,
        position,
      }));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await importTransaction.done;
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  const consumeImport = async (
    importId: string,
    expectedWorkspaceRevision: number,
    prepared?: PreparedImportConsumption,
    knownTargetProjectId?: string,
  ): Promise<{ targetProjectId: string; consumed: boolean }> => {
    const activeDatabase = await getDatabase();
    const storeNames = [
      'pendingImports',
      'projects',
      'workspace',
      'migrationLedger',
    ] as const;
    let transaction: WriteTransaction | undefined;
    const requests: Promise<unknown>[] = [];
    try {
      const importTransaction = activeDatabase.transaction(storeNames, 'readwrite');
      transaction = importTransaction as WriteTransaction;
      const ledger = await importTransaction.objectStore('migrationLedger')
        .get(WORKSPACE_MIGRATION_ID);
      requireVerifiedAuthority(ledger);
      const workspace = requireWorkspaceRevision(
        await importTransaction.objectStore('workspace').get('current'),
        expectedWorkspaceRevision,
      );
      const importStore = importTransaction.objectStore('pendingImports');
      const projectStore = importTransaction.objectStore('projects');
      const [storedImport, pendingImports] = await Promise.all([
        importStore.get(importId),
        importStore.getAll(),
      ]);
      if (!storedImport) {
        const consumedTargets = (await projectStore.getAll()).filter(record =>
          record.consumedImportId === importId);
        if (consumedTargets.length === 0) {
          throw validation(`Pending import ${importId} does not exist.`);
        }
        if (consumedTargets.length > 1) {
          throw validation(`Consumed import ${importId} provenance is ambiguous.`);
        }
        const consumedTarget = consumedTargets[0];
        if ((knownTargetProjectId && knownTargetProjectId !== consumedTarget.id)
          || !workspace.projectOrder.includes(consumedTarget.id)) {
          throw conflict(`Consumed import ${importId} target changed.`);
        }
        await importTransaction.done;
        return { targetProjectId: consumedTarget.id, consumed: false };
      }

      const pending = storedImport.pendingImport;
      let storedPendingIdentity: string | undefined;
      try {
        storedPendingIdentity = JSON.stringify(pending);
      } catch {
        // Invalid changed records cannot match the independently prepared identity.
      }
      if (!prepared
        || storedPendingIdentity !== prepared.pendingImportIdentity
        || prepared.project.id !== pending.targetProjectId
        || prepared.project.project.id !== pending.targetProjectId
        || prepared.project.consumedImportId !== importId
        || (knownTargetProjectId && knownTargetProjectId !== pending.targetProjectId)) {
        throw conflict(`Pending import ${importId} target changed.`);
      }
      if (await projectStore.get(pending.targetProjectId)) {
        throw validation(`Project ${pending.targetProjectId} already exists.`);
      }
      requests.push(projectStore.add(prepared.project));
      requests.push(importStore.delete(importId));
      for (const record of pendingImports) {
        if (record.position <= storedImport.position) continue;
        requests.push(importStore.put({ ...record, position: record.position - 1 }));
      }
      requests.push(importTransaction.objectStore('workspace').put({
        ...workspace,
        projectOrder: [...workspace.projectOrder, prepared.project.id],
        activeProjectId: prepared.project.id,
        revision: workspace.revision + 1,
      }));
      environment.fault?.('mutation.before-complete');
      await Promise.all(requests);
      await importTransaction.done;
      return { targetProjectId: prepared.project.id, consumed: true };
    } catch (error) {
      return abortTransaction(transaction, requests, error);
    }
  };

  return {
    open,
    close() {
      openGeneration += 1;
      opening = undefined;
      openingGeneration = undefined;
      database?.close();
      database = undefined;
    },
    describeSchema,
    inspect,
    writeInitialCopy,
    readWorkspaceRecords,
    readLegacyBackup,
    readMigrationLedger,
    markVerified,
    markLegacyDrift,
    recoverLegacyAsCopies,
    saveProject,
    saveWorkspace,
    createAndActivateProject,
    activateProject,
    closeProject,
    saveCustomPreset,
    deleteCustomPreset,
    stageImport,
    consumeImport,
  };
};
