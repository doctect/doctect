import { vi, type Mock } from 'vitest';
import type {
  LocalWorkspaceStore,
  MigrationReceipt,
  RecoverySource,
  WorkspaceBootstrapObserver,
  WorkspaceBootstrapPhase,
  WorkspaceBootstrapResult,
  WorkspaceRecovery,
  WorkspaceSnapshot,
} from '../../services/localWorkspace/index';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

export const deferred = <T>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

export const workspaceSnapshot = (
  overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot => ({
  projects: [{
    id: 'project-a',
    name: 'Project A',
    initialState: {} as WorkspaceSnapshot['projects'][number]['initialState'],
  }],
  activeProjectId: 'project-a',
  customPresets: [],
  pendingImports: [],
  ...overrides,
});

export const migrationReceipt = (
  overrides: Partial<MigrationReceipt> = {},
): MigrationReceipt => ({
  id: 'migration-receipt-a',
  projectCount: 1,
  customPresetCount: 0,
  pendingImportPreserved: false,
  migratedAt: '2026-08-14T15:00:00.000Z',
  ...overrides,
});

export const workspaceRecovery = (
  overrides: Partial<WorkspaceRecovery> = {},
): WorkspaceRecovery => ({
  recoveryId: 'recovery-a',
  kind: 'migration-failed',
  category: 'migration-failed',
  message: 'Local workspace migration could not be completed.',
  availableExports: [],
  canRetry: true,
  canRecoverLegacyAsCopies: false,
  ...overrides,
});

export const splitBrainRecovery = (
  overrides: Partial<WorkspaceRecovery> = {},
): WorkspaceRecovery => workspaceRecovery({
  recoveryId: 'split-brain-a',
  kind: 'split-brain',
  category: 'split-brain',
  message: 'Legacy and durable workspace data no longer agree.',
  availableExports: [
    'legacy-current',
    'legacy-original',
    'indexeddb-workspace',
  ],
  canRetry: false,
  canRecoverLegacyAsCopies: true,
  ...overrides,
});

export const readyResult = (
  overrides: Partial<Extract<WorkspaceBootstrapResult, { status: 'ready' }>> = {},
): Extract<WorkspaceBootstrapResult, { status: 'ready' }> => ({
  status: 'ready',
  snapshot: workspaceSnapshot(),
  ...overrides,
});

export const recoveryResult = (
  recovery: WorkspaceRecovery = workspaceRecovery(),
): Extract<WorkspaceBootstrapResult, { status: 'recovery' }> => ({
  status: 'recovery',
  recovery,
});

export const unavailableResult = (
  overrides: Partial<Extract<WorkspaceBootstrapResult, { status: 'unavailable' }>> = {},
): Extract<WorkspaceBootstrapResult, { status: 'unavailable' }> => ({
  status: 'unavailable',
  message: 'Local workspace storage is unavailable.',
  availableExports: [],
  ...overrides,
});

type BootstrapResponse =
  | WorkspaceBootstrapResult
  | Promise<WorkspaceBootstrapResult>
  | ((observer?: WorkspaceBootstrapObserver) =>
      WorkspaceBootstrapResult | Promise<WorkspaceBootstrapResult>);

interface FakeStoreOptions {
  bootstrap?: BootstrapResponse | BootstrapResponse[];
  commit?: WorkspaceSnapshot | Promise<WorkspaceSnapshot>;
  exportBundles?: Partial<Record<RecoverySource, Blob | Promise<Blob>>>;
}

export interface FakeLocalWorkspaceStore extends LocalWorkspaceStore {
  bootstrap: Mock<LocalWorkspaceStore['bootstrap']>;
  commit: Mock<LocalWorkspaceStore['commit']>;
  exportRecoveryBundle: Mock<LocalWorkspaceStore['exportRecoveryBundle']>;
  readonly observers: WorkspaceBootstrapObserver[];
  emitPhase(phase: WorkspaceBootstrapPhase, observerIndex?: number): void;
  emitAuthorityLost(
    result: Extract<WorkspaceBootstrapResult, { status: 'recovery' | 'unavailable' }>,
    observerIndex?: number,
  ): void;
}

export const fakeStore = (options: FakeStoreOptions = {}): FakeLocalWorkspaceStore => {
  const configured = options.bootstrap ?? readyResult();
  const responses = (Array.isArray(configured) ? configured : [configured]).slice();
  if (responses.length === 0) responses.push(readyResult());
  const observers: WorkspaceBootstrapObserver[] = [];

  const bootstrap = vi.fn<LocalWorkspaceStore['bootstrap']>(observer => {
    observers.push(observer ?? {});
    const response = responses.length > 1 ? responses.shift()! : responses[0];
    try {
      return Promise.resolve(
        typeof response === 'function' ? response(observer) : response,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  });
  const commit = vi.fn<LocalWorkspaceStore['commit']>(() =>
    Promise.resolve(options.commit ?? workspaceSnapshot()));
  const exportRecoveryBundle = vi.fn<LocalWorkspaceStore['exportRecoveryBundle']>(source =>
    Promise.resolve(
      options.exportBundles?.[source]
        ?? new Blob([JSON.stringify({ source })], {
          type: 'application/json;charset=utf-8',
        }),
    ));

  const observerAt = (observerIndex?: number): WorkspaceBootstrapObserver | undefined =>
    observers[observerIndex ?? observers.length - 1];

  return {
    bootstrap,
    commit,
    exportRecoveryBundle,
    observers,
    emitPhase(phase, observerIndex) {
      observerAt(observerIndex)?.onPhase?.(phase);
    },
    emitAuthorityLost(result, observerIndex) {
      observerAt(observerIndex)?.onAuthorityLost?.(result);
    },
  };
};

export const fakeReadyStore = (
  overrides: Partial<Extract<WorkspaceBootstrapResult, { status: 'ready' }>> = {},
): FakeLocalWorkspaceStore => fakeStore({ bootstrap: readyResult(overrides) });
