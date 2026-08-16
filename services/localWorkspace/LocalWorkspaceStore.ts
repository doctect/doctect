import type { AppState } from '../../types';
import { canonicalStringify, digestLegacySnapshot, sha256Hex } from './canonical';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type MigrationReceipt,
  type RecoverySource,
  type WorkspaceBootstrapObserver,
  type WorkspaceBootstrapPhase,
  type WorkspaceBootstrapResult,
  type WorkspaceCommand,
  type WorkspacePendingImport,
  type WorkspaceProject,
  type WorkspaceRecovery,
  type WorkspaceSnapshot,
} from './contracts';
import type { FaultInjector } from './faults';
import {
  createIndexedDbAdapter,
  type IndexedDbAdapter,
  type IndexedDbInspection,
  type PreparedImportConsumption,
} from './indexedDbAdapter';
import {
  LegacyCaptureError,
  captureLegacySnapshot,
  captureStableLegacySnapshot,
  captureStableLegacySnapshotWithDigest,
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
  createMutationQueue,
  type MutationQueue,
} from './mutationQueue';
import {
  createIndexedDbRecoveryBundle,
  createLegacyRecoveryBundle,
  prepareLegacyRecovery,
  validateLegacyRecoveryPreparationSources,
} from './recovery';
import {
  PERSISTENCE_ROLLOUT_EPOCH,
  WORKSPACE_DB_VERSION,
  WORKSPACE_MIGRATION_ID,
  type LegacyBackupRecord,
  type MigrationLedger,
  type RecoveryMarker,
  type StoredProject,
} from './schema';
import {
  preparePendingImport,
  validateCustomPreset,
  validateWorkspaceProject,
} from './validation';

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

const sameLegacySnapshot = (left: LegacySnapshot, right: LegacySnapshot): boolean =>
  LEGACY_DOCUMENT_KEYS.every(key =>
    left[key].present === right[key].present && left[key].raw === right[key].raw);

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
    canRecoverLegacyAsCopies: false,
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
    availableExports?: RecoverySource[];
  } = {},
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => {
  const details = recoveryDetails[kind];
  return {
    status: 'recovery',
    recovery: {
      recoveryId: options.recoveryId ?? `local-workspace-bootstrap:${kind}`,
      kind,
      category: options.category ?? details.category,
      message: options.message ?? details.message,
      ...(options.affectedKey ? { affectedKey: options.affectedKey } : {}),
      ...(options.affectedItem ? { affectedItem: options.affectedItem } : {}),
      availableExports: options.availableExports ?? [],
      canRetry: details.canRetry,
      canRecoverLegacyAsCopies: details.canRecoverLegacyAsCopies,
    },
  };
};

const unavailable = (
  availableExports: RecoverySource[] = ['legacy-current'],
): Extract<WorkspaceBootstrapResult, { status: 'unavailable' }> => ({
  status: 'unavailable',
  message: 'Local workspace storage is unavailable.',
  availableExports,
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

const createLocalWorkspaceStoreAtVersion = (
  environment: LocalWorkspaceEnvironment,
  requestedIndexedDbVersion: number,
): LocalWorkspaceStore => {
  let authority: AuthorityState = 'cold';
  let inFlight: Promise<WorkspaceBootstrapResult> | undefined;
  let authorityValidation: Promise<WorkspaceBootstrapResult> | undefined;
  let cachedReady: Extract<WorkspaceBootstrapResult, { status: 'ready' }> | undefined;
  let lifecycleResult: NonReadyResult | undefined;
  let lifecycleGeneration = 0;
  let stopLegacyMonitor: (() => void) | undefined;
  let observedLegacyChange = 0;
  const observers = new Set<WorkspaceBootstrapObserver>();
  let durableSnapshot: WorkspaceSnapshot | undefined;
  let expectedWorkspaceRevision: number | undefined;
  let expectedProjectRevisions = new Map<string, number>();
  let consumedImportTargets = new Map<string, string>();
  let mutationQueue: MutationQueue | undefined;
  let startReadyLegacyRevalidation: (() => void) | undefined;
  let resetCommandQueue: (() => void) | undefined;

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

  const invalidateDurableAuthority = (): void => {
    cachedReady = undefined;
    durableSnapshot = undefined;
    expectedWorkspaceRevision = undefined;
    expectedProjectRevisions = new Map();
    consumedImportTargets = new Map();
  };

  const handleAuthorityLost = (error: WorkspaceStoreError): void => {
    mutationQueue?.freeze();
    invalidateDurableAuthority();
    authority = error.code === 'authority-lost' ? 'frozen' : 'unavailable';
    lifecycleGeneration += 1;
    lifecycleResult = unavailable();
    notifyAuthorityLost(lifecycleResult);
  };

  let adapter: IndexedDbAdapter | undefined;
  const getAdapter = (): IndexedDbAdapter => {
    adapter ??= createIndexedDbAdapter({
      indexedDB: environment.indexedDB,
      now: environment.now,
      fault: environment.fault,
      onAuthorityLost: handleAuthorityLost,
    }, requestedIndexedDbVersion);
    return adapter;
  };

  const ensureLegacyMonitor = (): void => {
    if (stopLegacyMonitor) return;
    stopLegacyMonitor = monitorLegacyKeys(environment.addStorageListener, () => {
      observedLegacyChange += 1;
      if (authority === 'ready') startReadyLegacyRevalidation?.();
    });
  };

  interface ObservedLegacyCapture {
    snapshot: LegacySnapshot;
    digest: string;
    generation: number;
  }

  const captureObservedLegacy = async (
    assertCurrent?: () => void,
  ): Promise<ObservedLegacyCapture> => {
    const captured = await captureStableLegacySnapshotWithDigest(
      environment.legacyStorage,
      environment.crypto.subtle,
      {
        generation: () => observedLegacyChange,
        assertCurrent,
      },
    );
    assertCurrent?.();
    return { ...captured, generation: observedLegacyChange };
  };

  const sameObservedLegacy = (
    left: ObservedLegacyCapture,
    right: ObservedLegacyCapture,
  ): boolean => left.generation === right.generation
    && left.digest === right.digest
    && sameLegacySnapshot(left.snapshot, right.snapshot);

  const installDurableState = (
    records: WorkspaceRecords,
    snapshot: WorkspaceSnapshot,
    options: {
      updateCachedReady?: boolean;
      preservePinnedProjectRevisions?: boolean;
    } = {},
  ): WorkspaceSnapshot => {
    const nextSnapshot = structuredClone(snapshot);
    const nextProjectRevisions = new Map(
      records.projects.map(record => [record.id, record.storageRevision]),
    );
    if (options.preservePinnedProjectRevisions) {
      for (const [projectId, revision] of expectedProjectRevisions) {
        if (mutationQueue?.hasPinnedProjectRevision(projectId)) {
          nextProjectRevisions.set(projectId, revision);
        }
      }
    }
    const nextConsumedImportTargets = new Map<string, string>();
    for (const record of records.projects) {
      if (record.consumedImportId) {
        nextConsumedImportTargets.set(record.consumedImportId, record.id);
      }
    }
    const nextWorkspaceRevision = records.workspace.revision;
    durableSnapshot = nextSnapshot;
    expectedProjectRevisions = nextProjectRevisions;
    expectedWorkspaceRevision = nextWorkspaceRevision;
    consumedImportTargets = nextConsumedImportTargets;
    if (options.updateCachedReady && cachedReady) {
      cachedReady = { ...cachedReady, snapshot: structuredClone(nextSnapshot) };
    }
    return nextSnapshot;
  };

  const validateBackup = async (
    backup: LegacyBackupRecord | undefined,
    expected: {
      id: string;
      digest: string;
      kind?: LegacyBackupRecord['kind'];
      capturedAt?: string;
    },
  ): Promise<LegacyBackupRecord> => {
    if (!isPlainObject(backup)
      || !hasExactKeys(backup, ['id', 'kind', 'capturedAt', 'snapshot', 'digest'])
      || backup.id !== expected.id
      || !(backup.kind === 'original' || backup.kind === 'conflict')
      || (expected.kind !== undefined && backup.kind !== expected.kind)
      || !isCanonicalTimestamp(backup.capturedAt)
      || (expected.capturedAt !== undefined && backup.capturedAt !== expected.capturedAt)
      || backup.digest !== expected.digest
      || !isLegacySnapshot(backup.snapshot)
      || await digestLegacySnapshot(backup.snapshot, environment.crypto.subtle)
        !== expected.digest) {
      throw verificationError('Stored legacy backup does not match the migration ledger.');
    }
    return backup;
  };

  const readVerificationInputs = async (
    ledger: MigrationLedger,
  ): Promise<{
    records: WorkspaceRecords;
    originalBackup: LegacyBackupRecord;
    acceptedBackup: LegacyBackupRecord;
  }> => {
    const activeAdapter = getAdapter();
    let records: WorkspaceRecords;
    let originalBackup: LegacyBackupRecord | undefined;
    let acceptedBackup: LegacyBackupRecord | undefined;
    try {
      records = await activeAdapter.readWorkspaceRecords();
      originalBackup = await activeAdapter.readLegacyBackup(ledger.originalLegacyBackupId);
      acceptedBackup = ledger.acceptedLegacyBackupId === ledger.originalLegacyBackupId
        ? originalBackup
        : await activeAdapter.readLegacyBackup(ledger.acceptedLegacyBackupId);
    } catch (error) {
      if (error instanceof WorkspaceStoreError && error.code === 'unavailable') throw error;
      throw verificationError('Durable workspace records could not be read independently.');
    }
    const validatedOriginal = await validateBackup(originalBackup, {
      id: ledger.originalLegacyBackupId,
      digest: ledger.sourceDigest,
      kind: 'original',
      capturedAt: ledger.migratedAt,
    });
    if (ledger.acceptedLegacyBackupId === ledger.originalLegacyBackupId) {
      if (validatedOriginal.digest !== ledger.acceptedLegacyDigest) {
        throw verificationError('Accepted legacy source does not match its backup.');
      }
      return {
        records,
        originalBackup: validatedOriginal,
        acceptedBackup: validatedOriginal,
      };
    }
    return {
      records,
      originalBackup: validatedOriginal,
      acceptedBackup: await validateBackup(acceptedBackup, {
        id: ledger.acceptedLegacyBackupId,
        digest: ledger.acceptedLegacyDigest,
      }),
    };
  };

  const readRecognizedLedger = async (): Promise<MigrationLedger> => {
    let ledger: MigrationLedger | undefined;
    try {
      ledger = await getAdapter().readMigrationLedger();
    } catch (error) {
      if (error instanceof WorkspaceStoreError) throw error;
      throw new WorkspaceStoreError('Migration ledger could not be read.', 'unavailable', error);
    }
    if (!isRecognizedLedger(ledger)) {
      throw new WorkspaceStoreError('Migration ledger is unavailable.', 'unavailable');
    }
    return ledger;
  };

  const validatedRecoverySources = async (
    knownLedger?: MigrationLedger,
  ): Promise<RecoverySource[]> => {
    const sources: RecoverySource[] = [];
    try {
      await captureObservedLegacy();
      sources.push('legacy-current');
    } catch {
      // A changing or inaccessible source is not currently callable.
    }

    let ledger = knownLedger;
    if (!ledger) {
      try {
        const candidate = await getAdapter().readMigrationLedger();
        if (isRecognizedLedger(candidate)) ledger = candidate;
      } catch {
        // Durable exports remain unavailable when their ledger cannot be read.
      }
    }
    if (ledger) {
      try {
        const backup = await getAdapter().readLegacyBackup(ledger.originalLegacyBackupId);
        await validateBackup(backup, {
          id: ledger.originalLegacyBackupId,
          digest: ledger.sourceDigest,
          kind: 'original',
          capturedAt: ledger.migratedAt,
        });
        sources.push('legacy-original');
      } catch {
        // Invalid or missing backup must not be advertised.
      }
    }
    try {
      reconstructWorkspace(await getAdapter().readWorkspaceRecords());
      sources.push('indexeddb-workspace');
    } catch {
      // Invalid or missing target must not be advertised.
    }
    return sources;
  };

  const populateCapabilities = async (
    result: NonReadyResult,
    knownLedger?: MigrationLedger,
  ): Promise<NonReadyResult> => {
    const exports = await validatedRecoverySources(knownLedger);
    if (result.status !== 'recovery') return { ...result, availableExports: exports };

    let ledger = knownLedger;
    if (!ledger) {
      try {
        ledger = await readRecognizedLedger();
      } catch {
        // Recovery command stays unavailable without a validated ledger.
      }
    }
    let canRecoverLegacyAsCopies = false;
    const marker = ledger?.unresolvedRecovery;
    if (result.recovery.kind === 'split-brain'
      && ledger?.state === 'verified'
      && marker?.kind === 'legacy-drift'
      && marker.id === result.recovery.recoveryId
      && marker.observedLegacyDigest !== undefined
      && exports.includes('legacy-current')
      && exports.includes('indexeddb-workspace')) {
      try {
        const acceptedBackup = await validateBackup(
          await getAdapter().readLegacyBackup(ledger.acceptedLegacyBackupId),
          {
            id: ledger.acceptedLegacyBackupId,
            digest: ledger.acceptedLegacyDigest,
          },
        );
        const current = await captureObservedLegacy();
        if (current.digest === marker.observedLegacyDigest) {
          await validateLegacyRecoveryPreparationSources(
            current.snapshot,
            acceptedBackup.snapshot,
            {
              crypto: environment.crypto,
              now: environment.now,
              randomUUID: environment.randomUUID,
            },
          );
          canRecoverLegacyAsCopies = true;
        }
      } catch {
        // Accepted baseline is required to prepare changed-only copies.
      }
    }
    return {
      ...result,
      recovery: {
        ...result.recovery,
        availableExports: exports,
        canRecoverLegacyAsCopies,
      },
    };
  };

  const driftMarker = (
    observedLegacyDigest: string,
    nextLedgerRevision: number,
  ): RecoveryMarker => ({
    id: `${WORKSPACE_MIGRATION_ID}:legacy-drift:${nextLedgerRevision}:${observedLegacyDigest}:${environment.randomUUID()}`,
    kind: 'legacy-drift',
    detectedAt: environment.now(),
    observedLegacyDigest,
  });

  const recordLegacyDrift = async (
    initialCapture: ObservedLegacyCapture,
    knownLedger?: MigrationLedger,
  ): Promise<{
    ledger: MigrationLedger;
    capture: ObservedLegacyCapture;
    marker?: RecoveryMarker;
  }> => {
    let capture = initialCapture;
    let ledger = knownLedger ?? await readRecognizedLedger();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (ledger.state !== 'verified') {
        throw new WorkspaceStoreError('Verified migration ledger is unavailable.', 'conflict');
      }
      const existing = ledger.unresolvedRecovery;
      if (existing?.kind !== 'legacy-drift' && existing !== null) {
        throw new WorkspaceStoreError('Another recovery marker is already active.', 'conflict');
      }
      if (existing?.observedLegacyDigest === capture.digest) {
        return { ledger, capture, marker: existing };
      }
      if (existing === null && ledger.acceptedLegacyDigest === capture.digest) {
        return { ledger, capture };
      }
      try {
        const marker = existing && existing.observedLegacyDigest === undefined
          ? { ...existing, observedLegacyDigest: capture.digest }
          : driftMarker(capture.digest, ledger.ledgerRevision + 1);
        const updated = await getAdapter().markLegacyDrift({
          expectedLedgerRevision: ledger.ledgerRevision,
          expectedAcceptedLegacyDigest: ledger.acceptedLegacyDigest,
          expectedRecoveryId: existing?.id ?? null,
          marker: marker as RecoveryMarker & {
            observedLegacyDigest: string;
          },
        });
        return {
          ledger: updated,
          capture,
          marker: updated.unresolvedRecovery ?? undefined,
        };
      } catch (error) {
        if (!(error instanceof WorkspaceStoreError) || error.code !== 'conflict') throw error;
        ledger = await readRecognizedLedger();
        capture = await captureObservedLegacy();
      }
    }
    throw new WorkspaceStoreError('Legacy recovery marker changed repeatedly.', 'conflict');
  };

  const populateStableNonReadyResult = async (
    result: NonReadyResult,
  ): Promise<NonReadyResult> => {
    if (result.status !== 'recovery'
      || result.recovery.kind !== 'split-brain'
      || result.recovery.category !== 'legacy-drift') {
      return populateCapabilities(result);
    }

    let resolution = await recordLegacyDrift(
      await captureObservedLegacy(),
      await readRecognizedLedger(),
    );
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!resolution.marker) return populateCapabilities(result, resolution.ledger);
      const populated = await populateCapabilities(
        storedRecovery(resolution.marker),
        resolution.ledger,
      );
      const finalCapture = await captureObservedLegacy();
      if (sameObservedLegacy(finalCapture, resolution.capture)) return populated;
      resolution = await recordLegacyDrift(finalCapture, resolution.ledger);
    }
    throw new LegacyCaptureError(
      'Legacy storage changed repeatedly while recovery capabilities were prepared.',
    );
  };

  startReadyLegacyRevalidation = () => {
    if (authority !== 'ready' || authorityValidation) return;
    const queue = mutationQueue;
    queue?.freeze();
    authority = 'frozen';
    lifecycleGeneration += 1;
    const validationGeneration = lifecycleGeneration;
    const supersedingLifecycleResult = (): NonReadyResult | undefined =>
      lifecycleGeneration !== validationGeneration ? lifecycleResult : undefined;

    let operation!: Promise<WorkspaceBootstrapResult>;
    operation = Promise.resolve().then(() => queue?.drain()).then(async () => {
      const captured = await captureObservedLegacy();
      const supersedingAfterCapture = supersedingLifecycleResult();
      if (supersedingAfterCapture) return supersedingAfterCapture;
      let resolution = await recordLegacyDrift(captured);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const supersedingAfterRecord = supersedingLifecycleResult();
        if (supersedingAfterRecord) return supersedingAfterRecord;
        const after = await captureObservedLegacy();
        const supersedingAfterRecapture = supersedingLifecycleResult();
        if (supersedingAfterRecapture) return supersedingAfterRecapture;
        if (!sameObservedLegacy(after, resolution.capture)) {
          resolution = await recordLegacyDrift(after, resolution.ledger);
          continue;
        }

        if (!resolution.marker) {
          authority = 'ready';
          lifecycleResult = undefined;
          resetCommandQueue?.();
          if (!cachedReady || !durableSnapshot) {
            throw new WorkspaceStoreError('Ready workspace snapshot is unavailable.', 'unavailable');
          }
          return cachedReady;
        }

        const result = await populateCapabilities(
          storedRecovery(resolution.marker),
          resolution.ledger,
        );
        const supersedingAfterCapabilities = supersedingLifecycleResult();
        if (supersedingAfterCapabilities) return supersedingAfterCapabilities;
        const finalCapture = await captureObservedLegacy();
        const supersedingAfterFinalCapture = supersedingLifecycleResult();
        if (supersedingAfterFinalCapture) return supersedingAfterFinalCapture;
        if (!sameObservedLegacy(finalCapture, resolution.capture)) {
          resolution = await recordLegacyDrift(finalCapture, resolution.ledger);
          continue;
        }
        invalidateDurableAuthority();
        authority = 'recovery';
        lifecycleResult = result;
        notifyAuthorityLost(result);
        return result;
      }
      throw new LegacyCaptureError('Legacy storage changed repeatedly during drift detection.');
    }).catch(async error => {
      const superseding = supersedingLifecycleResult();
      if (superseding) return superseding;
      const result = error instanceof LegacyCaptureError
        ? await populateCapabilities(recovery('legacy-changing'))
        : await populateCapabilities(unavailable());
      invalidateDurableAuthority();
      authority = result.status === 'recovery' ? 'recovery' : 'unavailable';
      lifecycleResult = result;
      notifyAuthorityLost(result);
      return result;
    }).finally(() => {
      if (authorityValidation === operation) authorityValidation = undefined;
    });
    authorityValidation = operation;
  };

  const retainedLegacyMatches = async (
    acceptedSource: LegacySnapshot,
    acceptedDigest: string,
  ): Promise<boolean> => {
    let current: ObservedLegacyCapture;
    try {
      current = await captureObservedLegacy();
    } catch (error) {
      if (error instanceof LegacyCaptureError) return false;
      throw error;
    }
    if (!sameLegacySnapshot(current.snapshot, acceptedSource)
      || current.digest !== acceptedDigest) {
      return false;
    }
    return true;
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
      if (error instanceof WorkspaceStoreError) return unavailable();
      throw error;
    }

    emit('checking-existing-projects');
    let initialInspection: IndexedDbInspection;
    try {
      initialInspection = await adapter.inspect();
    } catch (error) {
      if (error instanceof WorkspaceStoreError) return unavailable();
      throw error;
    }

    const processVerified = async (
      ledger: MigrationLedger,
    ): Promise<WorkspaceBootstrapResult> => {
      if (ledger.unresolvedRecovery?.kind !== 'legacy-drift'
        && ledger.unresolvedRecovery !== null) {
        return storedRecovery(ledger.unresolvedRecovery);
      }
      emit('verifying-projects');
      let inputs: Awaited<ReturnType<typeof readVerificationInputs>>;
      try {
        inputs = await readVerificationInputs(ledger);
      } catch (error) {
        if (error instanceof WorkspaceStoreError) return unavailable();
        if (error instanceof WorkspaceMigrationError) return verificationFailure(error);
        throw error;
      }

      let snapshot: WorkspaceSnapshot;
      try {
        snapshot = reconstructWorkspace(inputs.records);
      } catch (error) {
        return verificationFailure(error);
      }

      let current: ObservedLegacyCapture;
      try {
        current = await captureObservedLegacy();
      } catch (error) {
        if (!(error instanceof LegacyCaptureError)) return recovery('split-brain');
        try {
          current = await captureObservedLegacy();
          const recorded = await recordLegacyDrift(current, ledger);
          return recorded.marker ? storedRecovery(recorded.marker) : recovery('legacy-changing');
        } catch {
          return recovery('legacy-changing');
        }
      }
      if (ledger.unresolvedRecovery
        || current.digest !== ledger.acceptedLegacyDigest
        || !sameLegacySnapshot(current.snapshot, inputs.acceptedBackup.snapshot)) {
        try {
          const recorded = await recordLegacyDrift(current, ledger);
          if (recorded.marker) return storedRecovery(recorded.marker);
        } catch (error) {
          if (error instanceof WorkspaceStoreError && error.code === 'unavailable') {
            return unavailable();
          }
          return recovery('split-brain');
        }
      }

      emit('finishing-upgrade');
      try {
        const finalSource = await captureObservedLegacy();
        if (finalSource.digest !== ledger.acceptedLegacyDigest
          || !sameLegacySnapshot(finalSource.snapshot, inputs.acceptedBackup.snapshot)) {
          const recorded = await recordLegacyDrift(finalSource, ledger);
          if (recorded.marker) return storedRecovery(recorded.marker);
        }
      } catch (error) {
        return error instanceof LegacyCaptureError
          ? recovery('legacy-changing')
          : recovery('split-brain');
      }
      installDurableState(inputs.records, snapshot);
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
      if (ledger.state === 'cleanup-started' || ledger.state === 'cleanup-complete') {
        return recovery('unsupported-cleanup-state');
      }
      if (ledger.state === 'verified') return processVerified(ledger);
      if (ledger.unresolvedRecovery) return storedRecovery(ledger.unresolvedRecovery);

      emit('verifying-projects');
      let inputs: Awaited<ReturnType<typeof readVerificationInputs>>;
      try {
        inputs = await readVerificationInputs(ledger);
      } catch (error) {
        if (error instanceof WorkspaceStoreError) return unavailable();
        if (error instanceof WorkspaceMigrationError) return verificationFailure(error);
        throw error;
      }

      const currentLegacy = captureLegacySnapshot(environment.legacyStorage);
      let snapshot: WorkspaceSnapshot;
      try {
        const prepared: PreparedInitialCopy = {
          origin: ledger.origin,
          source: inputs.originalBackup.snapshot,
          sourceDigest: ledger.sourceDigest,
          targetDigest: ledger.expectedTargetDigest,
          projects: inputs.records.projects,
          workspace: inputs.records.workspace,
          presets: inputs.records.presets,
          pendingImports: inputs.records.pendingImports,
          backup: inputs.originalBackup,
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
      if (!await retainedLegacyMatches(
        inputs.acceptedBackup.snapshot,
        ledger.acceptedLegacyDigest,
      )) {
        return verificationFailure();
      }

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
              return unavailable();
            }
            throw inspectionError;
          }
          return followInspection(latest);
        }
        if (error instanceof WorkspaceStoreError && error.code === 'unavailable') {
          return unavailable();
        }
        return verificationFailure(error);
      }
      if (!isRecognizedLedger(verifiedLedger)
        || verifiedLedger.state !== 'verified'
        || verifiedLedger.unresolvedRecovery !== null) {
        return verificationFailure();
      }
      if (!await retainedLegacyMatches(
        inputs.acceptedBackup.snapshot,
        verifiedLedger.acceptedLegacyDigest,
      )) {
        return verificationFailure();
      }

      emit('finishing-upgrade');
      if (!sameLegacySnapshot(
        captureLegacySnapshot(environment.legacyStorage),
        inputs.acceptedBackup.snapshot,
      )) {
        return verificationFailure();
      }
      installDurableState(inputs.records, snapshot);
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
        { generation: () => observedLegacyChange },
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
        return unavailable();
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
        if (error instanceof WorkspaceStoreError) return unavailable();
        throw error;
      }
      return followInspection(winner);
    }

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

  const validationError = (error: unknown): WorkspaceStoreError =>
    error instanceof WorkspaceStoreError
      ? error
      : new WorkspaceStoreError('Workspace command is invalid.', 'validation', error);

  const requireCommandId = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new WorkspaceStoreError(`${label} must be a non-empty string.`, 'validation');
    }
    return value;
  };

  const prepareCommand = (command: WorkspaceCommand): WorkspaceCommand => {
    try {
      switch (command.type) {
        case 'save-project':
        case 'create-and-activate-project':
          return {
            ...command,
            project: validateWorkspaceProject(command.project, { warningPolicy: 'reject' }),
          };
        case 'activate-project':
          return { ...command, projectId: requireCommandId(command.projectId, 'Project id') };
        case 'close-project':
          return {
            ...command,
            projectId: requireCommandId(command.projectId, 'Project id'),
            ...(command.successor
              ? {
                  successor: validateWorkspaceProject(command.successor, {
                    warningPolicy: 'reject',
                  }),
                }
              : {}),
          };
        case 'save-custom-preset': {
          const existingIds = new Set(
            (durableSnapshot?.customPresets ?? [])
              .map(preset => preset.id)
              .filter(id => id !== command.preset.id),
          );
          return {
            ...command,
            preset: validateCustomPreset(command.preset, {
              warningPolicy: 'reject',
              existingIds,
            }),
          };
        }
        case 'delete-custom-preset':
          return { ...command, presetId: requireCommandId(command.presetId, 'Preset id') };
        case 'stage-import':
          return {
            ...command,
            pendingImport: preparePendingImport(command.pendingImport, {
              warningPolicy: 'retain',
            }),
          };
        case 'consume-import':
          return { ...command, importId: requireCommandId(command.importId, 'Import id') };
        case 'recover-legacy-as-copies':
          return {
            ...command,
            recoveryId: requireCommandId(command.recoveryId, 'Recovery id'),
          };
      }
    } catch (error) {
      throw validationError(error);
    }
  };

  const readPostCommandSnapshot = async (): Promise<WorkspaceSnapshot> => {
    let records: WorkspaceRecords;
    let snapshot: WorkspaceSnapshot;
    try {
      records = await getAdapter().readWorkspaceRecords();
      snapshot = reconstructWorkspace(records);
    } catch (error) {
      const failure = error instanceof WorkspaceStoreError
        ? error
        : new WorkspaceStoreError(
            'Durable workspace failed post-command validation.',
            'io',
            error,
          );
      if (authority === 'ready') {
        handleAuthorityLost(new WorkspaceStoreError(
          'Durable workspace authority could not be revalidated after commit.',
          'authority-lost',
          failure,
        ));
      } else {
        mutationQueue?.freeze();
        invalidateDurableAuthority();
      }
      throw failure;
    }
    return installDurableState(records, snapshot, {
      updateCachedReady: true,
      preservePinnedProjectRevisions: true,
    });
  };

  const runCommandOperation = async (
    operation: () => Promise<WorkspaceSnapshot>,
  ): Promise<WorkspaceSnapshot> => {
    try {
      return await operation();
    } catch (error) {
      const mapped = error instanceof WorkspaceStoreError
        ? error
        : new WorkspaceStoreError('Workspace command failed.', 'io', error);
      if (mapped.code === 'authority-lost' && authority === 'ready') {
        handleAuthorityLost(mapped);
      }
      throw mapped;
    }
  };

  const currentWorkspaceRevision = (): number => {
    if (expectedWorkspaceRevision === undefined) {
      throw new WorkspaceStoreError(
        'Verified workspace revision is unavailable.',
        'authority-lost',
      );
    }
    return expectedWorkspaceRevision;
  };

  const executeProjectSave = (
    project: WorkspaceProject,
    expectedRevision: number,
  ): Promise<WorkspaceSnapshot> =>
    runCommandOperation(async () => {
      const currentRevision = expectedProjectRevisions.get(project.id);
      if (currentRevision === undefined) {
        throw new WorkspaceStoreError(`Project ${project.id} does not exist.`, 'validation');
      }
      if (currentRevision !== expectedRevision) {
        throw new WorkspaceStoreError(
          `Project ${project.id} local revision lineage changed.`,
          'conflict',
        );
      }
      const saved = await getAdapter().saveProject(project, expectedRevision);
      expectedProjectRevisions.set(project.id, saved.storageRevision);
      return readPostCommandSnapshot();
    });

  const prepareImportConsumption = async (
    importId: string,
  ): Promise<PreparedImportConsumption | undefined> => {
    const pendingImport = durableSnapshot?.pendingImports.find(item => item.id === importId);
    if (!pendingImport) return undefined;
    const project = validateWorkspaceProject({
      id: pendingImport.targetProjectId,
      name: pendingImport.name,
      initialState: pendingImport.state,
      ...(pendingImport.cloud ? { cloud: pendingImport.cloud } : {}),
    }, { warningPolicy: 'reject' });
    const updatedAt = environment.now();
    if (!isCanonicalTimestamp(updatedAt)) {
      throw new WorkspaceStoreError(
        'Consumed project timestamp must be a canonical ISO timestamp.',
        'validation',
      );
    }
    const storedProject: StoredProject = {
      id: project.id,
      project,
      storageRevision: 0,
      updatedAt,
      consumedImportId: importId,
      consumedImportCreatedAt: pendingImport.createdAt,
      consumedImportDigest: await sha256Hex(
        canonicalStringify(pendingImport),
        environment.crypto.subtle,
      ),
    };
    return {
      pendingImportIdentity: JSON.stringify(pendingImport),
      project: storedProject,
    };
  };

  const executeExclusiveCommand = (
    command: Exclude<WorkspaceCommand, { type: 'save-project' }>,
  ): Promise<WorkspaceSnapshot> => runCommandOperation(async () => {
    switch (command.type) {
      case 'create-and-activate-project':
        await getAdapter().createAndActivateProject(
          command.project,
          currentWorkspaceRevision(),
        );
        break;
      case 'activate-project':
        await getAdapter().activateProject(command.projectId, currentWorkspaceRevision());
        break;
      case 'close-project':
        if (!expectedProjectRevisions.has(command.projectId)) {
          throw new WorkspaceStoreError(
            `Project ${command.projectId} does not exist.`,
            'validation',
          );
        }
        await getAdapter().closeProject(
          command.projectId,
          command.successor,
          currentWorkspaceRevision(),
          expectedProjectRevisions.get(command.projectId) as number,
        );
        expectedProjectRevisions.delete(command.projectId);
        break;
      case 'save-custom-preset':
        await getAdapter().saveCustomPreset(command.preset);
        break;
      case 'delete-custom-preset':
        await getAdapter().deleteCustomPreset(command.presetId);
        break;
      case 'stage-import':
        await getAdapter().stageImport(
          command.pendingImport as WorkspacePendingImport,
          await sha256Hex(
            canonicalStringify(command.pendingImport),
            environment.crypto.subtle,
          ),
        );
        break;
      case 'consume-import': {
        const knownTargetProjectId = consumedImportTargets.get(command.importId);
        await getAdapter().consumeImport(
          command.importId,
          currentWorkspaceRevision(),
          await prepareImportConsumption(command.importId),
          knownTargetProjectId,
        );
        break;
      }
      case 'recover-legacy-as-copies':
        throw new WorkspaceStoreError(
          'Legacy copy recovery is not available in this storage rollout step.',
          'unavailable',
        );
    }

    const snapshot = await readPostCommandSnapshot();
    return snapshot;
  });

  const executeRecoveryCommand = async (recoveryId: string): Promise<WorkspaceSnapshot> => {
    const recoveryLifecycleGeneration = lifecycleGeneration;
    const recoveryLifecycleIsCurrent = (): boolean =>
      lifecycleGeneration === recoveryLifecycleGeneration && authority === 'recovery';
    const assertRecoveryLifecycle = (): void => {
      if (!recoveryLifecycleIsCurrent()) {
        throw new WorkspaceStoreError(
          'Local workspace lifecycle changed during legacy recovery.',
          'authority-lost',
        );
      }
    };
    let prepared: Awaited<ReturnType<typeof prepareLegacyRecovery>>;
    try {
      prepared = await captureStableLegacySnapshot(
        environment.legacyStorage,
        async source => {
          const sourceDigest = await digestLegacySnapshot(source, environment.crypto.subtle);
          assertRecoveryLifecycle();
          const ledger = await readRecognizedLedger();
          assertRecoveryLifecycle();
          const marker = ledger.unresolvedRecovery;
          if (ledger.state !== 'verified'
            || marker?.kind !== 'legacy-drift'
            || marker.id !== recoveryId
            || marker.observedLegacyDigest !== sourceDigest) {
            throw new WorkspaceStoreError(
              'Legacy recovery confirmation no longer matches current authority.',
              'conflict',
            );
          }

          let records: WorkspaceRecords;
          let acceptedBackup: LegacyBackupRecord | undefined;
          try {
            [records, acceptedBackup] = await Promise.all([
              getAdapter().readWorkspaceRecords(),
              getAdapter().readLegacyBackup(ledger.acceptedLegacyBackupId),
            ]);
            assertRecoveryLifecycle();
            reconstructWorkspace(records);
            acceptedBackup = await validateBackup(acceptedBackup, {
              id: ledger.acceptedLegacyBackupId,
              digest: ledger.acceptedLegacyDigest,
            });
            assertRecoveryLifecycle();
          } catch (error) {
            if (error instanceof WorkspaceStoreError) throw error;
            throw new WorkspaceStoreError(
              'Recovery authorities could not be validated independently.',
              'unavailable',
              error,
            );
          }

          try {
            const recovery = await prepareLegacyRecovery(
              source,
              sourceDigest,
              acceptedBackup.snapshot,
              ledger,
              records,
              recoveryId,
              {
                crypto: environment.crypto,
                now: environment.now,
                randomUUID: environment.randomUUID,
              },
            );
            assertRecoveryLifecycle();
            return recovery;
          } catch (error) {
            if (error instanceof WorkspaceStoreError) throw error;
            throw new WorkspaceStoreError(
              'Changed legacy workspace is invalid and cannot be recovered as copies.',
              'validation',
              error,
            );
          }
        },
        environment.crypto.subtle,
        {
          generation: () => observedLegacyChange,
          assertCurrent: assertRecoveryLifecycle,
        },
      );
      assertRecoveryLifecycle();
    } catch (error) {
      if (error instanceof WorkspaceStoreError) throw error;
      if (error instanceof LegacyCaptureError) {
        throw new WorkspaceStoreError(
          'Legacy workspace changed during recovery preparation.',
          'conflict',
          error,
        );
      }
      throw new WorkspaceStoreError('Legacy recovery preparation failed.', 'validation', error);
    }

    const nextLedger = await getAdapter().recoverLegacyAsCopies(prepared);
    assertRecoveryLifecycle();
    let records: WorkspaceRecords;
    let snapshot: WorkspaceSnapshot;
    try {
      records = await getAdapter().readWorkspaceRecords();
      assertRecoveryLifecycle();
      snapshot = reconstructWorkspace(records);
    } catch (error) {
      if (!recoveryLifecycleIsCurrent()) throw error;
      const failure = new WorkspaceStoreError(
        'Recovered workspace failed independent validation.',
        'unavailable',
        error,
      );
      handleAuthorityLost(failure);
      throw failure;
    }

    try {
      let current = await captureObservedLegacy(assertRecoveryLifecycle);
      let currentLedger = nextLedger;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        assertRecoveryLifecycle();
        if (currentLedger.unresolvedRecovery === null
          && current.digest === currentLedger.acceptedLegacyDigest
          && sameLegacySnapshot(current.snapshot, prepared.backup.snapshot)) {
          const persistedLedger = await readRecognizedLedger();
          assertRecoveryLifecycle();
          if (persistedLedger.unresolvedRecovery !== null) {
            const result = await populateCapabilities(
              storedRecovery(persistedLedger.unresolvedRecovery),
              persistedLedger,
            );
            assertRecoveryLifecycle();
            invalidateDurableAuthority();
            authority = 'recovery';
            lifecycleResult = result;
            notifyAuthorityLost(result);
            return structuredClone(snapshot);
          }
          if (canonicalStringify(persistedLedger) !== canonicalStringify(nextLedger)) {
            throw new WorkspaceStoreError(
              'Resolved legacy recovery ledger changed before authority was restored.',
              'conflict',
            );
          }
          installDurableState(records, snapshot);
          const readyResult = ready(snapshot, persistedLedger);
          assertRecoveryLifecycle();
          authority = 'ready';
          cachedReady = readyResult;
          lifecycleResult = undefined;
          resetCommandQueue?.();
          return structuredClone(snapshot);
        }

        const recorded = await recordLegacyDrift(current, currentLedger);
        assertRecoveryLifecycle();
        currentLedger = recorded.ledger;
        if (!recorded.marker) {
          current = await captureObservedLegacy(assertRecoveryLifecycle);
          continue;
        }
        const result = await populateCapabilities(
          storedRecovery(recorded.marker),
          recorded.ledger,
        );
        assertRecoveryLifecycle();
        const finalCapture = await captureObservedLegacy(assertRecoveryLifecycle);
        if (!sameObservedLegacy(finalCapture, recorded.capture)) {
          current = finalCapture;
          continue;
        }
        assertRecoveryLifecycle();
        invalidateDurableAuthority();
        authority = 'recovery';
        lifecycleResult = result;
        notifyAuthorityLost(result);
        return structuredClone(snapshot);
      }
      throw new LegacyCaptureError(
        'Legacy storage changed repeatedly after recovery.',
      );
    } catch (error) {
      if (!recoveryLifecycleIsCurrent()) throw error;
      if (error instanceof LegacyCaptureError) {
        const result = await populateCapabilities(recovery('legacy-changing'));
        assertRecoveryLifecycle();
        invalidateDurableAuthority();
        authority = 'recovery';
        lifecycleResult = result;
        notifyAuthorityLost(result);
        return structuredClone(snapshot);
      }
      const failure = error instanceof WorkspaceStoreError
        ? error
        : new WorkspaceStoreError(
            'Legacy workspace could not be revalidated after recovery.',
            'unavailable',
            error,
          );
      handleAuthorityLost(failure);
      throw failure;
    }
  };

  const createCommandQueue = (): MutationQueue => createMutationQueue({
    saveProject: executeProjectSave,
    runExclusive: executeExclusiveCommand,
  });
  resetCommandQueue = () => {
    mutationQueue = createCommandQueue();
  };

  return {
    bootstrap(observer) {
      registerObserver(observer);
      if (authorityValidation) return authorityValidation;
      if (cachedReady) return Promise.resolve(cachedReady);
      if (inFlight) return inFlight;

      const priorQueue = mutationQueue;
      priorQueue?.freeze();
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

      const startingLifecycleGeneration = lifecycleGeneration;
      let operation!: Promise<WorkspaceBootstrapResult>;
      operation = Promise.resolve()
        .then(() => priorQueue?.drain())
        .then(() => bootstrapOperation(emit))
        .then(async (result): Promise<WorkspaceBootstrapResult> =>
          result.status === 'ready' ? result : populateStableNonReadyResult(result))
        .then(result => {
          const effectiveResult = lifecycleGeneration !== startingLifecycleGeneration
            && lifecycleResult
            ? lifecycleResult
            : result;
          if (effectiveResult.status === 'ready') {
            authority = 'ready';
            cachedReady = effectiveResult;
            lifecycleResult = undefined;
            resetCommandQueue?.();
          } else {
            mutationQueue?.freeze();
            cachedReady = undefined;
            authority = effectiveResult.status === 'recovery' ? 'recovery' : 'unavailable';
          }
          return effectiveResult;
        }, error => {
          if (lifecycleGeneration !== startingLifecycleGeneration && lifecycleResult) {
            mutationQueue?.freeze();
            cachedReady = undefined;
            authority = lifecycleResult.status === 'recovery' ? 'recovery' : 'unavailable';
            return lifecycleResult;
          }
          mutationQueue?.freeze();
          cachedReady = undefined;
          authority = lifecycleResult?.status === 'unavailable' ? 'unavailable' : 'cold';
          throw error;
        }).finally(() => {
        if (inFlight === operation) inFlight = undefined;
      });
      inFlight = operation;
      return operation;
    },

    commit(command: WorkspaceCommand): Promise<WorkspaceSnapshot> {
      if (command.type === 'recover-legacy-as-copies') {
        let recoveryId: string;
        try {
          recoveryId = requireCommandId(command.recoveryId, 'Recovery id');
        } catch (error) {
          return Promise.reject(validationError(error));
        }
        if (authority === 'ready') {
          return Promise.reject(new WorkspaceStoreError(
            'No unresolved legacy recovery is available.',
            'unavailable',
          ));
        }
        if (authority !== 'recovery') {
          return Promise.reject(new WorkspaceStoreError(
            'Local workspace authority is not ready for recovery.',
            'authority-lost',
          ));
        }
        return executeRecoveryCommand(recoveryId);
      }
      const queue = mutationQueue;
      if (authority !== 'ready' || !queue) {
        return Promise.reject(new WorkspaceStoreError(
          'Local workspace authority is not ready.',
          'authority-lost',
        ));
      }
      let prepared: WorkspaceCommand;
      try {
        prepared = prepareCommand(command);
      } catch (error) {
        return Promise.reject(validationError(error));
      }
      if (prepared.type !== 'save-project') return queue.runExclusive(prepared);
      const expectedRevision = expectedProjectRevisions.get(prepared.project.id);
      if (expectedRevision === undefined) {
        return Promise.reject(new WorkspaceStoreError(
          `Project ${prepared.project.id} does not exist.`,
          'validation',
        ));
      }
      return queue.enqueueProjectSave(prepared.project, expectedRevision);
    },

    async exportRecoveryBundle(source: RecoverySource): Promise<Blob> {
      if (source === 'legacy-current') {
        try {
          const captured = await captureStableLegacySnapshotWithDigest(
            environment.legacyStorage,
            environment.crypto.subtle,
          );
          return createLegacyRecoveryBundle(
            captured.snapshot,
            environment.now(),
            environment.crypto.subtle,
          );
        } catch (error) {
          if (error instanceof LegacyCaptureError) throw error;
          throw new WorkspaceStoreError(
            'Current legacy recovery source is unavailable.',
            'unavailable',
            error,
          );
        }
      }

      if (source === 'legacy-original') {
        try {
          const ledger = await readRecognizedLedger();
          const backup = await validateBackup(
            await getAdapter().readLegacyBackup(ledger.originalLegacyBackupId),
            {
              id: ledger.originalLegacyBackupId,
              digest: ledger.sourceDigest,
              kind: 'original',
              capturedAt: ledger.migratedAt,
            },
          );
          return createLegacyRecoveryBundle(
            backup.snapshot,
            backup.capturedAt,
            environment.crypto.subtle,
          );
        } catch (error) {
          throw new WorkspaceStoreError(
            'Original legacy recovery source is unavailable.',
            'unavailable',
            error,
          );
        }
      }

      if (source === 'indexeddb-workspace') {
        try {
          const snapshot = reconstructWorkspace(await getAdapter().readWorkspaceRecords());
          return createIndexedDbRecoveryBundle(snapshot, environment.now());
        } catch (error) {
          throw new WorkspaceStoreError(
            'IndexedDB workspace recovery source is unavailable.',
            'unavailable',
            error,
          );
        }
      }

      return Promise.reject(new WorkspaceStoreError(
        'Recovery source is unavailable.',
        'unavailable',
      ));
    },
  };
};

export const createLocalWorkspaceStore = (
  environment: LocalWorkspaceEnvironment,
): LocalWorkspaceStore => createLocalWorkspaceStoreAtVersion(
  environment,
  WORKSPACE_DB_VERSION,
);

// Real-browser upgrade tests import this module directly; public barrel stays production-only.
export const createLocalWorkspaceStoreForTesting = (
  environment: LocalWorkspaceEnvironment,
  requestedIndexedDbVersion: number,
): LocalWorkspaceStore => createLocalWorkspaceStoreAtVersion(
  environment,
  requestedIndexedDbVersion,
);
