import type { DBSchema } from 'idb';
import type {
  WorkspaceCustomPreset,
  WorkspaceImportAttemptProvenance,
  WorkspacePendingImport,
  WorkspaceProject,
} from './contracts';
import type { LegacyDocumentKey, LegacySnapshot } from './legacyTypes';

export const WORKSPACE_DB_NAME = 'doctect-local-workspace';
export const WORKSPACE_DB_VERSION = 2;
export const WORKSPACE_MIGRATION_ID = 'local-storage-to-indexeddb-v1';
export const PERSISTENCE_ROLLOUT_EPOCH = 1;

export interface ProjectLineage {
  readonly incarnation: string;
  readonly revision: number;
}

export interface StoredProject {
  id: string;
  project: WorkspaceProject;
  incarnation: string;
  storageRevision: number;
  updatedAt: string;
  consumedImportId?: string;
  consumedImportCreatedAt?: string;
  consumedImportDigest?: string;
  consumedImportAttempt?: StoredImportAttemptProvenance;
}

export type HistoricalStoredProjectV1 = Omit<StoredProject, 'incarnation'> & {
  incarnation?: never;
};

export const storedProjectLineage = (
  record: Pick<StoredProject, 'incarnation' | 'storageRevision'>,
): ProjectLineage => ({
  incarnation: record.incarnation,
  revision: record.storageRevision,
});

export const sameProjectLineage = (
  left: ProjectLineage,
  right: ProjectLineage,
): boolean => left.incarnation === right.incarnation && left.revision === right.revision;

export const nextProjectLineage = (lineage: ProjectLineage): ProjectLineage => ({
  incarnation: lineage.incarnation,
  revision: lineage.revision + 1,
});

export interface StoredWorkspace {
  id: 'current';
  projectOrder: string[];
  activeProjectId: string;
  revision: number;
}

export interface StoredPreset {
  id: string;
  preset: WorkspaceCustomPreset;
  position: number;
}

export interface StoredPendingImport {
  id: string;
  pendingImport: WorkspacePendingImport;
  position: number;
  attemptProvenance?: StoredImportAttemptProvenance;
}

export interface StoredImportAttemptProvenance extends WorkspaceImportAttemptProvenance {
  pendingImportDigest: string;
}

export interface KeyFingerprint {
  key: LegacyDocumentKey;
  present: boolean;
  digest: string;
}

export interface ItemFingerprint {
  sourceIndex: number;
  id: string;
  digest: string;
}

export interface RecoveryMarker {
  id: string;
  kind: 'legacy-drift' | 'target-mismatch' | 'unknown-target';
  detectedAt: string;
  observedLegacyDigest?: string;
}

export interface MigrationLedger {
  id: 'local-storage-to-indexeddb-v1';
  indexedDbVersion: typeof WORKSPACE_DB_VERSION;
  state: 'copied' | 'verified' | 'cleanup-started' | 'cleanup-complete';
  origin: 'legacy' | 'native';
  ledgerRevision: number;
  sourceDigest: string;
  expectedTargetDigest: string;
  acceptedLegacyDigest: string;
  originalLegacyBackupId: string;
  acceptedLegacyBackupId: string;
  keyFingerprints: KeyFingerprint[];
  projectFingerprints: ItemFingerprint[];
  presetFingerprints: ItemFingerprint[];
  counts: {
    sourceProjects: number;
    targetProjects: number;
    customPresets: number;
    pendingImports: number;
  };
  migratedAt: string;
  verifiedAt: string | null;
  persistenceRolloutEpoch: 1;
  unresolvedRecovery: RecoveryMarker | null;
}

export type HistoricalMigrationLedgerV1 = Omit<MigrationLedger, 'indexedDbVersion'> & {
  indexedDbVersion: 1;
};

export interface LegacyBackupRecord {
  id: string;
  kind: 'original' | 'conflict';
  capturedAt: string;
  snapshot: LegacySnapshot;
  digest: string;
}

export interface LocalWorkspaceDatabase extends DBSchema {
  // DBSchema describes values this rollout intentionally writes or upgrades.
  // readWorkspaceRecords still exposes unknown candidates because IndexedDB can
  // contain malformed values outside this authorized physical model.
  projects: { key: string; value: StoredProject | HistoricalStoredProjectV1 };
  workspace: { key: 'current'; value: StoredWorkspace };
  presets: { key: string; value: StoredPreset };
  pendingImports: { key: string; value: StoredPendingImport };
  migrationLedger: { key: typeof WORKSPACE_MIGRATION_ID; value: MigrationLedger };
  legacyBackup: { key: string; value: LegacyBackupRecord };
}
