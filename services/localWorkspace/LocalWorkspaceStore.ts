import type { AppState } from '../../types';
import { digestLegacySnapshot } from './canonical';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type MigrationReceipt,
  type RecoverySource,
  type WorkspaceBootstrapObserver,
  type WorkspaceBootstrapPhase,
  type WorkspaceBootstrapResult,
  type WorkspaceCommand,
  type WorkspaceRecovery,
  type WorkspaceSnapshot,
} from './contracts';
import type { FaultInjector } from './faults';
import {
  createIndexedDbAdapter,
  type IndexedDbAdapter,
  type IndexedDbInspection,
} from './indexedDbAdapter';
import {
  LegacyCaptureError,
  captureLegacySnapshot,
  captureStableLegacySnapshot,
  monitorLegacyKeys,
} from './legacy';
import {
  LEGACY_DOCUMENT_KEYS,
  type LegacySnapshot,
} from './legacyTypes';
import {
  WorkspaceMigrationError,
  prepareInitialCopy,
  reconstructWorkspace,
  verifyPreparedCopy,
  type PreparedInitialCopy,
  type WorkspaceRecords,
} from './migration';
import {
  PERSISTENCE_ROLLOUT_EPOCH,
  WORKSPACE_DB_VERSION,
  WORKSPACE_MIGRATION_ID,
  type LegacyBackupRecord,
  type MigrationLedger,
  type RecoveryMarker,
} from './schema';

export interface LocalWorkspaceEnvironment {
  indexedDB: IDBFactory;
  legacyStorage: Pick<Storage, 'getItem'>;
  addStorageListener(listener: (event: StorageEvent) => void): () => void;
  crypto: Crypto;
  now(): string;
  randomUUID(): string;
  createBlankProject(): AppState;
  fault?: FaultInjector;
}

type AuthorityState =
  | 'cold'
  | 'bootstrapping'
  | 'ready'
  | 'frozen'
  | 'recovery'
  | 'unavailable';

type NonReadyResult = Extract<
  WorkspaceBootstrapResult,
  { status: 'recovery' | 'unavailable' }
>;

const LEDGER_KEYS = [
  'id',
  'indexedDbVersion',
  'state',
  'origin',
  'ledgerRevision',
  'sourceDigest',
  'expectedTargetDigest',
  'acceptedLegacyDigest',
  'originalLegacyBackupId',
  'acceptedLegacyBackupId',
  'keyFingerprints',
  'projectFingerprints',
  'presetFingerprints',
  'counts',
  'migratedAt',
  'verifiedAt',
  'persistenceRolloutEpoch',
  'unresolvedRecovery',
] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const isCanonicalTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const isLegacySnapshot = (value: unknown): value is LegacySnapshot => {
  if (!isPlainObject(value) || !hasExactKeys(value, LEGACY_DOCUMENT_KEYS)) return false;
  return LEGACY_DOCUMENT_KEYS.every(key => {
    const entry = value[key];
    return isPlainObject(entry)
      && hasExactKeys(entry, ['present', 'raw'])
      && typeof entry.present === 'boolean'
      && (entry.present ? typeof entry.raw === 'string' : entry.raw === null);
  });
};

const isRecoveryMarker = (value: unknown): value is RecoveryMarker => {
  if (!isPlainObject(value)) return false;
  const required = ['id', 'kind', 'detectedAt'];
  const allowed = [...required, 'observedLegacyDigest'];
  const keys = Object.keys(value);
  return required.every(key => Object.hasOwn(value, key))
    && keys.every(key => allowed.includes(key))
    && typeof value.id === 'string'
    && value.id.length > 0
    && (
      value.kind === 'legacy-drift'
      || value.kind === 'target-mismatch'
      || value.kind === 'unknown-target'
    )
    && isCanonicalTimestamp(value.detectedAt)
    && (
      value.observedLegacyDigest === undefined
      || isDigest(value.observedLegacyDigest)
    );
};

const isItemFingerprints = (
  value: unknown,
): value is MigrationLedger['projectFingerprints'] => {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((entry, index) => {
    if (!isPlainObject(entry)
      || !hasExactKeys(entry, ['sourceIndex', 'id', 'digest'])
      || entry.sourceIndex !== index
      || typeof entry.id !== 'string'
      || entry.id.length === 0
      || ids.has(entry.id)
      || !isDigest(entry.digest)) {
      return false;
    }
    ids.add(entry.id);
    return true;
  });
};

const isRecognizedLedger = (value: unknown): value is MigrationLedger => {
  if (!isPlainObject(value) || !hasExactKeys(value, LEDGER_KEYS)) return false;
  const projectFingerprints = value.projectFingerprints;
  const presetFingerprints = value.presetFingerprints;
  if (value.id !== WORKSPACE_MIGRATION_ID
    || value.indexedDbVersion !== WORKSPACE_DB_VERSION
    || value.persistenceRolloutEpoch !== PERSISTENCE_ROLLOUT_EPOCH
    || !(
      value.state === 'copied'
      || value.state === 'verified'
      || value.state === 'cleanup-started'
      || value.state === 'cleanup-complete'
    )
    || !(value.origin === 'legacy' || value.origin === 'native')
    || !isNonNegativeInteger(value.ledgerRevision)
    || !isDigest(value.sourceDigest)
    || !isDigest(value.expectedTargetDigest)
    || !isDigest(value.acceptedLegacyDigest)
    || typeof value.originalLegacyBackupId !== 'string'
    || value.originalLegacyBackupId.length === 0
    || typeof value.acceptedLegacyBackupId !== 'string'
    || value.acceptedLegacyBackupId.length === 0
    || !isCanonicalTimestamp(value.migratedAt)
    || !(
      value.verifiedAt === null
      || isCanonicalTimestamp(value.verifiedAt)
    )
    || (value.state === 'copied' && value.verifiedAt !== null)
    || (value.state === 'verified' && value.verifiedAt === null)
    || !(value.unresolvedRecovery === null || isRecoveryMarker(value.unresolvedRecovery))) {
    return false;
  }

  if (!Array.isArray(value.keyFingerprints)
    || value.keyFingerprints.length !== LEGACY_DOCUMENT_KEYS.length
    || !value.keyFingerprints.every((entry, index) => isPlainObject(entry)
      && hasExactKeys(entry, ['key', 'present', 'digest'])
      && entry.key === LEGACY_DOCUMENT_KEYS[index]
      && typeof entry.present === 'boolean'
      && isDigest(entry.digest))
    || !isItemFingerprints(projectFingerprints)
    || !isItemFingerprints(presetFingerprints)
    || !isPlainObject(value.counts)
    || !hasExactKeys(value.counts, [
      'sourceProjects',
      'targetProjects',
      'customPresets',
      'pendingImports',
    ])
    || !isNonNegativeInteger(value.counts.sourceProjects)
    || !isNonNegativeInteger(value.counts.targetProjects)
    || value.counts.targetProjects === 0
    || !isNonNegativeInteger(value.counts.customPresets)
    || !isNonNegativeInteger(value.counts.pendingImports)
    || value.counts.sourceProjects !== projectFingerprints.length
    || value.counts.customPresets !== presetFingerprints.length) {
    return false;
  }

  return true;
};

const allStoresEmpty = (inspection: IndexedDbInspection): boolean =>
  inspection.projects.length === 0
  && inspection.workspace.length === 0
  && inspection.presets.length === 0
  && inspection.pendingImports.length === 0
  && inspection.migrationLedger.length === 0
  && inspection.legacyBackup.length === 0;

const recoveryDetails: Record<WorkspaceRecovery['kind'], {
  category: string;
  message: string;
  canRetry: boolean;
  canRecoverLegacyAsCopies: boolean;
}> = {
  'migration-failed': {
    category: 'migration-failed',
    message: 'Local workspace migration could not be completed.',
    canRetry: true,
    canRecoverLegacyAsCopies: false,
  },
  'legacy-changing': {
    category: 'legacy-changing',
    message: 'Legacy workspace data changed while it was being copied.',
    canRetry: true,
    canRecoverLegacyAsCopies: false,
  },
  'split-brain': {
    category: 'split-brain',
    message: 'Legacy and durable workspace data no longer agree.',
    canRetry: false,
    canRecoverLegacyAsCopies: true,
  },
  'unrecognized-target': {
    category: 'unrecognized-target',
    message: 'Existing durable workspace data is not recognized.',
    canRetry: false,
    canRecoverLegacyAsCopies: false,
  },
  'verification-failed': {
    category: 'verification-failed',
    message: 'Durable workspace verification failed.',
    canRetry: true,
    canRecoverLegacyAsCopies: true,
  },
  'unsupported-cleanup-state': {
    category: 'unsupported-cleanup-state',
    message: 'This rollout does not support legacy cleanup state.',
    canRetry: false,
    canRecoverLegacyAsCopies: false,
  },
};

const recovery = (
  kind: WorkspaceRecovery['kind'],
  options: {
    recoveryId?: string;
    category?: string;
    message?: string;
    affectedKey?: string;
    affectedItem?: string;
  } = {},
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  const details = recoveryDetails[kind];
  const availableExports: RecoverySource[] = kind === 'migration-failed'
    || kind === 'legacy-changing'
    ? ['legacy-current']
    : ['legacy-current', 'legacy-original', 'indexeddb-workspace'];
  return {
    status: 'recovery',
    recovery: {
      recoveryId: options.recoveryId ?? `local-workspace-bootstrap:${kind}`,
      kind,
      category: options.category ?? details.category,
      message: options.message ?? details.message,
      ...(options.affectedKey ? { affectedKey: options.affectedKey } : {}),
      ...(options.affectedItem ? { affectedItem: options.affectedItem } : {}),
      availableExports,
      canRetry: details.canRetry,
      canRecoverLegacyAsCopies: details.canRecoverLegacyAsCopies,
    },
  };
};

const unavailable = (
  hasDurableWorkspace: boolean,
): Extract<WorkspaceBootstrapResult, { status: 'unavailable' }> => ({
  status: 'unavailable',
  message: 'Local workspace storage is unavailable.',
  availableExports: hasDurableWorkspace ? ['indexeddb-workspace'] : [],
});

const migrationFailure = (
  error: unknown,
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  if (error instanceof LegacyCaptureError) return recovery('legacy-changing');
  if (error instanceof WorkspaceMigrationError) {
    return recovery('migration-failed', {
      category: error.category,
      message: error.message,
      affectedKey: error.affectedKey,
      affectedItem: error.affectedItem,
    });
  }
  return recovery('migration-failed');
};

const verificationFailure = (
  error?: unknown,
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  if (error instanceof WorkspaceMigrationError) {
    return recovery('verification-failed', {
      category: error.category,
      message: error.message,
      affectedKey: error.affectedKey,
      affectedItem: error.affectedItem,
    });
  }
  return recovery('verification-failed');
};

const storedRecovery = (
  marker: RecoveryMarker,
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  const kind = marker.kind === 'legacy-drift'
    ? 'split-brain'
    : marker.kind === 'target-mismatch'
      ? 'verification-failed'
      : 'unrecognized-target';
  return recovery(kind, { recoveryId: marker.id, category: marker.kind });
};

const receiptFor = (ledger: MigrationLedger): MigrationReceipt | undefined =>
  ledger.origin === 'legacy'
    ? {
        id: `${WORKSPACE_MIGRATION_ID}:${ledger.sourceDigest}`,
        projectCount: ledger.counts.sourceProjects,
        customPresetCount: ledger.counts.customPresets,
        pendingImportPreserved: ledger.counts.pendingImports > 0,
        migratedAt: ledger.migratedAt,
      }
    : undefined;

const ready = (
  snapshot: WorkspaceSnapshot,
  ledger: MigrationLedger,
): Extract<WorkspaceBootstrapResult, { status: 'ready' }> => {
  const receipt = receiptFor(ledger);
  return {
    status: 'ready',
    snapshot,
    ...(receipt ? { receipt } : {}),
  };
};

const verificationError = (message: string): WorkspaceMigrationError =>
  new WorkspaceMigrationError(message, 'verification-failed');

export const createLocalWorkspaceStore = (
  environment: LocalWorkspaceEnvironment,
): LocalWorkspaceStore => {
  let authority: AuthorityState = 'cold';
  let inFlight: Promise<WorkspaceBootstrapResult> | undefined;
  let cachedReady: Extract<WorkspaceBootstrapResult, { status: 'ready' }> | undefined;
  let lifecycleResult: NonReadyResult | undefined;
  let hasDurableWorkspace = false;
  let stopLegacyMonitor: (() => void) | undefined;
  let observedLegacyChange = 0;
  const observers = new Set<WorkspaceBootstrapObserver>();

  const registerObserver = (observer?: WorkspaceBootstrapObserver): void => {
    if (observer && !observer.signal?.aborted) observers.add(observer);
  };

  const notifyAuthorityLost = (result: NonReadyResult): void => {
    for (const observer of observers) {
      if (observer.signal?.aborted) continue;
      try {
        observer.onAuthorityLost?.(result);
      } catch {
        // Observer failures cannot change storage authority.
      }
    }
  };

  const handleAuthorityLost = (error: WorkspaceStoreError): void => {
    cachedReady = undefined;
    authority = error.code === 'authority-lost' ? 'frozen' : 'unavailable';
    lifecycleResult = unavailable(hasDurableWorkspace);
    notifyAuthorityLost(lifecycleResult);
  };

  let adapter: IndexedDbAdapter | undefined;
  const getAdapter = (): IndexedDbAdapter => {
    adapter ??= createIndexedDbAdapter({
      indexedDB: environment.indexedDB,
      now: environment.now,
      fault: environment.fault,
      onAuthorityLost: handleAuthorityLost,
    });
    return adapter;
  };

  const ensureLegacyMonitor = (): void => {
    if (stopLegacyMonitor) return;
    stopLegacyMonitor = monitorLegacyKeys(environment.addStorageListener, () => {
      observedLegacyChange += 1;
      if (authority === 'ready') {
        authority = 'frozen';
        cachedReady = undefined;
      }
    });
  };

  const validateBackup = async (
    ledger: MigrationLedger,
    backup: LegacyBackupRecord | undefined,
  ): Promise<LegacyBackupRecord> => {
    if (!isPlainObject(backup)
      || !hasExactKeys(backup, ['id', 'kind', 'capturedAt', 'snapshot', 'digest'])
      || backup.id !== ledger.originalLegacyBackupId
      || backup.kind !== 'original'
      || backup.capturedAt !== ledger.migratedAt
      || backup.digest !== ledger.sourceDigest
      || !isLegacySnapshot(backup.snapshot)
      || await digestLegacySnapshot(backup.snapshot, environment.crypto.subtle)
        !== ledger.sourceDigest) {
      throw verificationError('Stored legacy backup does not match the migration ledger.');
    }
    return backup;
  };

  const readVerificationInputs = async (
    ledger: MigrationLedger,
  ): Promise<{ records: WorkspaceRecords; backup: LegacyBackupRecord }> => {
    const activeAdapter = getAdapter();
    let records: WorkspaceRecords;
    let backup: LegacyBackupRecord | undefined;
    try {
      records = await activeAdapter.readWorkspaceRecords();
      backup = await activeAdapter.readLegacyBackup(ledger.originalLegacyBackupId);
    } catch (error) {
      if (error instanceof WorkspaceStoreError && error.code === 'unavailable') throw error;
      throw verificationError('Durable workspace records could not be read independently.');
    }
    return { records, backup: await validateBackup(ledger, backup) };
  };

  const classifyInspection = (
    inspection: IndexedDbInspection,
  ):
    | { kind: 'none' }
    | { kind: 'unrecognized' }
    | { kind: 'recognized'; ledger: MigrationLedger } => {
    if (inspection.migrationLedger.length === 0) {
      return allStoresEmpty(inspection) ? { kind: 'none' } : { kind: 'unrecognized' };
    }
    if (inspection.migrationLedger.length !== 1
      || !isRecognizedLedger(inspection.migrationLedger[0])) {
      return { kind: 'unrecognized' };
    }
    return { kind: 'recognized', ledger: inspection.migrationLedger[0] };
  };

  const bootstrapOperation = async (
    emit: (phase: WorkspaceBootstrapPhase) => void,
  ): Promise<WorkspaceBootstrapResult> => {
    const adapter = getAdapter();
    ensureLegacyMonitor();
    emit('opening-local-storage');
    try {
      await adapter.open();
    } catch (error) {
      if (error instanceof WorkspaceStoreError) return unavailable(hasDurableWorkspace);
      throw error;
    }

    emit('checking-existing-projects');
    let initialInspection: IndexedDbInspection;
    try {
      initialInspection = await adapter.inspect();
    } catch (error) {
      if (error instanceof WorkspaceStoreError) return unavailable(hasDurableWorkspace);
      throw error;
    }

    const processVerified = async (
      ledger: MigrationLedger,
    ): Promise<WorkspaceBootstrapResult> => {
      if (ledger.unresolvedRecovery) return storedRecovery(ledger.unresolvedRecovery);
      emit('verifying-projects');
      let inputs: { records: WorkspaceRecords; backup: LegacyBackupRecord };
      try {
        inputs = await readVerificationInputs(ledger);
      } catch (error) {
        if (error instanceof WorkspaceStoreError) return unavailable(hasDurableWorkspace);
        if (error instanceof WorkspaceMigrationError) return verificationFailure(error);
        throw error;
      }

      let snapshot: WorkspaceSnapshot;
      try {
        snapshot = reconstructWorkspace(inputs.records);
      } catch (error) {
        return verificationFailure(error);
      }
      const retainedSourceVersion = observedLegacyChange;
      const currentLegacy = captureLegacySnapshot(environment.legacyStorage);
      const currentDigest = await digestLegacySnapshot(
        currentLegacy,
        environment.crypto.subtle,
      );
      if (currentDigest !== ledger.acceptedLegacyDigest
        || observedLegacyChange !== retainedSourceVersion) {
        return recovery('split-brain');
      }

      emit('finishing-upgrade');
      return ready(snapshot, ledger);
    };

    const followInspection = async (
      inspection: IndexedDbInspection,
    ): Promise<WorkspaceBootstrapResult> => {
      const classification = classifyInspection(inspection);
      if (classification.kind === 'none' || classification.kind === 'unrecognized') {
        return recovery('unrecognized-target');
      }
      const ledger = classification.ledger;
      hasDurableWorkspace = true;
      if (ledger.state === 'cleanup-started' || ledger.state === 'cleanup-complete') {
        return recovery('unsupported-cleanup-state');
      }
      if (ledger.state === 'verified') return processVerified(ledger);

      emit('verifying-projects');
      let inputs: { records: WorkspaceRecords; backup: LegacyBackupRecord };
      try {
        inputs = await readVerificationInputs(ledger);
      } catch (error) {
        if (error instanceof WorkspaceStoreError) return unavailable(hasDurableWorkspace);
        if (error instanceof WorkspaceMigrationError) return verificationFailure(error);
        throw error;
      }

      const retainedSourceVersion = observedLegacyChange;
      const currentLegacy = captureLegacySnapshot(environment.legacyStorage);
      let snapshot: WorkspaceSnapshot;
      try {
        const prepared: PreparedInitialCopy = {
          origin: ledger.origin,
          source: inputs.backup.snapshot,
          sourceDigest: ledger.sourceDigest,
          targetDigest: ledger.expectedTargetDigest,
          projects: inputs.records.projects,
          workspace: inputs.records.workspace,
          presets: inputs.records.presets,
          pendingImports: inputs.records.pendingImports,
          backup: inputs.backup,
          ledger,
        };
        snapshot = await verifyPreparedCopy(
          prepared,
          inputs.records,
          currentLegacy,
          environment.crypto.subtle,
        );
      } catch (error) {
        return verificationFailure(error);
      }
      if (observedLegacyChange !== retainedSourceVersion) return verificationFailure();

      let verifiedLedger: MigrationLedger;
      try {
        verifiedLedger = await adapter.markVerified({
          ledgerRevision: ledger.ledgerRevision,
          sourceDigest: ledger.sourceDigest,
          expectedTargetDigest: ledger.expectedTargetDigest,
        });
      } catch (error) {
        if (error instanceof WorkspaceStoreError && error.code === 'conflict') {
          let latest: IndexedDbInspection;
          try {
            latest = await adapter.inspect();
          } catch (inspectionError) {
            if (inspectionError instanceof WorkspaceStoreError) {
              return unavailable(hasDurableWorkspace);
            }
            throw inspectionError;
          }
          return followInspection(latest);
        }
        if (error instanceof WorkspaceStoreError && error.code === 'unavailable') {
          return unavailable(hasDurableWorkspace);
        }
        return verificationFailure(error);
      }
      if (observedLegacyChange !== retainedSourceVersion) return verificationFailure();
      if (!isRecognizedLedger(verifiedLedger) || verifiedLedger.state !== 'verified') {
        return verificationFailure();
      }

      emit('finishing-upgrade');
      return ready(snapshot, verifiedLedger);
    };

    const classification = classifyInspection(initialInspection);
    if (classification.kind === 'unrecognized') return recovery('unrecognized-target');
    if (classification.kind === 'recognized') return followInspection(initialInspection);

    let prepared: PreparedInitialCopy;
    try {
      prepared = await captureStableLegacySnapshot(
        environment.legacyStorage,
        source => prepareInitialCopy(source, {
          crypto: environment.crypto,
          now: environment.now,
          randomUUID: environment.randomUUID,
          createBlankProject: environment.createBlankProject,
        }),
        environment.crypto.subtle,
      );
    } catch (error) {
      if (error instanceof LegacyCaptureError || error instanceof WorkspaceMigrationError) {
        return migrationFailure(error);
      }
      throw error;
    }

    emit('copying-projects');
    let copyResult: Awaited<ReturnType<typeof adapter.writeInitialCopy>>;
    try {
      copyResult = await adapter.writeInitialCopy(prepared);
    } catch (error) {
      if (error instanceof WorkspaceStoreError && error.code === 'unavailable') {
        return unavailable(hasDurableWorkspace);
      }
      if (error instanceof WorkspaceStoreError) return migrationFailure(error);
      throw error;
    }

    if (copyResult.status === 'orphaned-target') return recovery('unrecognized-target');
    if (copyResult.status === 'existing-ledger') {
      let winner: IndexedDbInspection;
      try {
        winner = await adapter.inspect();
      } catch (error) {
        if (error instanceof WorkspaceStoreError) return unavailable(hasDurableWorkspace);
        throw error;
      }
      return followInspection(winner);
    }

    hasDurableWorkspace = true;
    const result = await followInspection({
      projects: prepared.projects,
      workspace: [prepared.workspace],
      presets: prepared.presets,
      pendingImports: prepared.pendingImports,
      migrationLedger: [prepared.ledger],
      legacyBackup: [prepared.backup],
    });
    return result;
  };

  return {
    bootstrap(observer) {
      registerObserver(observer);
      if (cachedReady) return Promise.resolve(cachedReady);
      if (inFlight) return inFlight;

      authority = 'bootstrapping';
      const emitted = new Set<WorkspaceBootstrapPhase>();
      const emit = (phase: WorkspaceBootstrapPhase): void => {
        if (emitted.has(phase)) return;
        emitted.add(phase);
        for (const registered of observers) {
          if (registered.signal?.aborted) continue;
          try {
            registered.onPhase?.(phase);
          } catch {
            // Observer failures cannot interrupt bootstrap.
          }
        }
      };

      let operation!: Promise<WorkspaceBootstrapResult>;
      operation = bootstrapOperation(emit).then(result => {
        const effectiveResult = result.status === 'ready' && lifecycleResult
          ? lifecycleResult
          : result;
        if (effectiveResult.status === 'ready') {
          authority = 'ready';
          cachedReady = effectiveResult;
          lifecycleResult = undefined;
        } else {
          cachedReady = undefined;
          authority = effectiveResult.status === 'recovery' ? 'recovery' : 'unavailable';
        }
        return effectiveResult;
      }, error => {
        cachedReady = undefined;
        authority = lifecycleResult?.status === 'unavailable' ? 'unavailable' : 'cold';
        throw error;
      }).finally(() => {
        if (inFlight === operation) inFlight = undefined;
      });
      inFlight = operation;
      return operation;
    },

    commit(_command: WorkspaceCommand): Promise<WorkspaceSnapshot> {
      if (authority !== 'ready') {
        return Promise.reject(new WorkspaceStoreError(
          'Local workspace authority is not ready.',
          'authority-lost',
        ));
      }
      return Promise.reject(new WorkspaceStoreError(
        'Workspace commands are unavailable until durable command handling is installed.',
        'unavailable',
      ));
    },

    exportRecoveryBundle(_source: RecoverySource): Promise<Blob> {
      return Promise.reject(new WorkspaceStoreError(
        'Recovery export is not available in this storage rollout step.',
        'unavailable',
      ));
    },
  };
};
