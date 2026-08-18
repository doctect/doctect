import type { AppState } from '../../types';

export interface WorkspaceProject {
  id: string;
  name: string;
  initialState: AppState;
  cloud?: { projectId: string; lastSyncedCommitId: string };
  revision?: number;
  [unknownField: string]: unknown;
}

export interface WorkspaceCustomPreset {
  id: string;
  title: string;
  desc: string;
  color?: string;
  isCustom: true;
  initialState: AppState;
  [unknownField: string]: unknown;
}

export interface WorkspaceImportInput {
  id: string;
  targetProjectId: string;
  name: string;
  state: unknown;
  cloud?: { projectId: string; lastSyncedCommitId: string };
  createdAt: string;
}

export interface WorkspacePendingImport extends Omit<WorkspaceImportInput, 'state'> {
  state: AppState;
  warnings: string[];
}

export interface WorkspaceImportAttemptProvenance {
  sourceKeyDigest: string;
  payloadDigest: string;
}

export interface WorkspaceStagedImportExpectation extends WorkspaceImportAttemptProvenance {
  importId: string;
  targetProjectId: string;
  createdAt: string;
}

export interface WorkspaceSnapshot {
  projects: WorkspaceProject[];
  activeProjectId: string;
  customPresets: WorkspaceCustomPreset[];
  pendingImports: WorkspacePendingImport[];
}

export type WorkspaceCommand =
  | { type: 'save-project'; project: WorkspaceProject }
  | { type: 'create-and-activate-project'; project: WorkspaceProject }
  | { type: 'activate-project'; projectId: string }
  | { type: 'close-project'; projectId: string; successor?: WorkspaceProject }
  | { type: 'save-custom-preset'; preset: WorkspaceCustomPreset }
  | { type: 'delete-custom-preset'; presetId: string }
  | {
      type: 'stage-import';
      pendingImport: WorkspaceImportInput;
      attemptProvenance?: WorkspaceImportAttemptProvenance;
    }
  | {
      type: 'replace-staged-import';
      expected: WorkspaceStagedImportExpectation;
      replacement: {
        pendingImport: WorkspaceImportInput;
        attemptProvenance: WorkspaceImportAttemptProvenance;
      };
    }
  | { type: 'consume-import'; importId: string }
  | { type: 'recover-legacy-as-copies'; recoveryId: string };

export type WorkspaceBootstrapPhase =
  | 'opening-local-storage'
  | 'checking-existing-projects'
  | 'copying-projects'
  | 'verifying-projects'
  | 'finishing-upgrade';

export interface MigrationReceipt {
  id: string;
  projectCount: number;
  customPresetCount: number;
  pendingImportPreserved: boolean;
  migratedAt: string;
}

export type RecoverySource =
  | 'legacy-current'
  | 'legacy-original'
  | 'indexeddb-workspace';

export interface WorkspaceRecovery {
  recoveryId: string;
  kind:
    | 'migration-failed'
    | 'legacy-changing'
    | 'split-brain'
    | 'unrecognized-target'
    | 'verification-failed'
    | 'unsupported-cleanup-state';
  category: string;
  message: string;
  affectedKey?: string;
  affectedItem?: string;
  availableExports: RecoverySource[];
  canRetry: boolean;
  canRecoverLegacyAsCopies: boolean;
}

export type WorkspaceBootstrapResult =
  | { status: 'ready'; snapshot: WorkspaceSnapshot; receipt?: MigrationReceipt }
  | { status: 'recovery'; recovery: WorkspaceRecovery }
  | {
      status: 'unavailable';
      message: string;
      availableExports: RecoverySource[];
    };

export interface WorkspaceBootstrapObserver {
  signal?: AbortSignal;
  onPhase?: (phase: WorkspaceBootstrapPhase) => void;
  onAuthorityLost?: (
    result: Extract<WorkspaceBootstrapResult, { status: 'recovery' | 'unavailable' }>,
  ) => void;
}

export class WorkspaceStoreError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'unavailable'
      | 'quota'
      | 'clone'
      | 'io'
      | 'validation'
      | 'conflict'
      | 'authority-lost',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WorkspaceStoreError';
  }
}

export interface LocalWorkspaceStore {
  bootstrap(observer?: WorkspaceBootstrapObserver): Promise<WorkspaceBootstrapResult>;
  commit(command: WorkspaceCommand): Promise<WorkspaceSnapshot>;
  exportRecoveryBundle(source: RecoverySource): Promise<Blob>;
}
