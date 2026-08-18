import {
  WorkspaceStoreError,
  type WorkspaceProject,
} from './contracts';

export interface ProjectPreparationWorker {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  postMessage(message: unknown): void;
  terminate(): void;
}

type ProjectPreparationWorkerFactory = () => ProjectPreparationWorker;

const WORKER_RESPONSE_TIMEOUT_MS = 30_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};

const unavailable = (message: string, cause?: unknown): WorkspaceStoreError =>
  new WorkspaceStoreError(message, 'unavailable', cause);

const defaultWorkerFactory = (): ProjectPreparationWorker => {
  if (typeof Worker !== 'function') {
    throw unavailable('Project preparation Worker is unavailable.');
  }
  return new Worker(
    new URL('./projectPreparationWorker.ts', import.meta.url),
    { type: 'module', name: 'doctect-project-preparation' },
  ) as unknown as ProjectPreparationWorker;
};

export const prepareProjectInModuleWorker = (
  project: WorkspaceProject,
  createWorker: ProjectPreparationWorkerFactory = defaultWorkerFactory,
): Promise<WorkspaceProject> => new Promise((resolve, reject) => {
  let worker: ProjectPreparationWorker;
  try {
    worker = createWorker();
  } catch (error) {
    reject(error instanceof WorkspaceStoreError
      ? error
      : unavailable('Project preparation Worker could not start.', error));
    return;
  }

  let settled = false;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;
  const attemptCleanup = (operation: () => void): void => {
    try {
      operation();
    } catch {
      // Cleanup failures cannot leave the request promise unsettled.
    }
  };
  const cleanup = (): void => {
    if (responseTimer !== undefined) attemptCleanup(() => clearTimeout(responseTimer));
    attemptCleanup(() => worker.removeEventListener('message', onMessage));
    attemptCleanup(() => worker.removeEventListener('error', onError));
    attemptCleanup(() => worker.removeEventListener('messageerror', onMessageError));
    attemptCleanup(() => worker.terminate());
  };
  const settle = (
    outcome: { project: WorkspaceProject } | { error: WorkspaceStoreError },
  ): void => {
    if (settled) return;
    settled = true;
    cleanup();
    if ('error' in outcome) reject(outcome.error);
    else resolve(outcome.project);
  };
  const protocolFailure = (): void => settle({
    error: unavailable('Project preparation Worker returned an invalid response.'),
  });
  const onMessage = (event: unknown): void => {
    const data = event !== null && typeof event === 'object' && 'data' in event
      ? (event as { data: unknown }).data
      : undefined;
    if (!isPlainObject(data) || data.requestId !== 1) {
      protocolFailure();
      return;
    }
    if (data.type === 'project-prepared') {
      if (!hasExactKeys(data, ['type', 'requestId', 'project'])
        || !isPlainObject(data.project)
        || data.project.id !== project.id) {
        protocolFailure();
        return;
      }
      settle({ project: data.project as unknown as WorkspaceProject });
      return;
    }
    if (data.type === 'project-preparation-failed') {
      if (!hasExactKeys(data, ['type', 'requestId', 'message'])
        || typeof data.message !== 'string'
        || data.message.length === 0) {
        protocolFailure();
        return;
      }
      settle({ error: new WorkspaceStoreError(data.message, 'validation') });
      return;
    }
    protocolFailure();
  };
  const onError = (event: unknown): void => {
    const eventDetails = event as { error?: unknown; message?: unknown };
    const details = event !== null && typeof event === 'object'
      ? eventDetails.error ?? eventDetails.message ?? event
      : event;
    settle({
      error: unavailable('Project preparation Worker failed.', details),
    });
  };
  const onMessageError = (event: unknown): void => settle({
    error: unavailable('Project preparation Worker message could not be decoded.', event),
  });

  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);
  worker.addEventListener('messageerror', onMessageError);
  responseTimer = setTimeout(() => settle({
    error: unavailable('Project preparation Worker did not respond.'),
  }), WORKER_RESPONSE_TIMEOUT_MS);
  try {
    worker.postMessage({ type: 'prepare-project', requestId: 1, project });
  } catch (error) {
    settle({
      error: unavailable('Project preparation Worker message could not be sent.', error),
    });
  }
});
