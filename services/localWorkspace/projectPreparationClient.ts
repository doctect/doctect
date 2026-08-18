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

const readPlainDataRecord = (
  value: unknown,
  exactKeys?: readonly string[],
): Record<string, unknown> | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string')) return undefined;
  const names = keys as string[];
  if (exactKeys
    && (names.length !== exactKeys.length || names.some(key => !exactKeys.includes(key)))) {
    return undefined;
  }
  const record: Record<string, unknown> = {};
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return undefined;
    record[key] = descriptor.value;
  }
  return record;
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
  const registeredListeners: Array<[string, (event: unknown) => void]> = [];
  const cleanup = (): unknown | undefined => {
    const failures: unknown[] = [];
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        failures.push(error);
      }
    };
    if (responseTimer !== undefined) attempt(() => clearTimeout(responseTimer));
    for (const [type, listener] of registeredListeners) {
      attempt(() => worker.removeEventListener(type, listener));
    }
    attempt(() => worker.terminate());
    if (failures.length === 0) return undefined;
    return failures.length === 1
      ? failures[0]
      : new AggregateError(failures, 'Project preparation Worker cleanup failed.');
  };
  const settle = (
    outcome: { project: WorkspaceProject } | { error: WorkspaceStoreError },
  ): void => {
    if (settled) return;
    settled = true;
    const cleanupFailure = cleanup();
    if (cleanupFailure !== undefined) {
      reject(unavailable('Project preparation Worker could not be cleaned up.', cleanupFailure));
      return;
    }
    if ('error' in outcome) reject(outcome.error);
    else resolve(outcome.project);
  };
  const protocolFailure = (): void => settle({
    error: unavailable('Project preparation Worker returned an invalid response.'),
  });
  const onMessage = (event: unknown): void => {
    let data: unknown;
    try {
      data = event !== null && typeof event === 'object' && 'data' in event
        ? (event as { data: unknown }).data
        : undefined;
      const envelope = readPlainDataRecord(data);
      if (!envelope) {
        protocolFailure();
        return;
      }
      if (envelope.type === 'project-prepared') {
        const prepared = readPlainDataRecord(data, ['type', 'requestId', 'project']);
        const candidate = prepared && readPlainDataRecord(prepared.project);
        const initialState = candidate && readPlainDataRecord(candidate.initialState);
        if (!prepared
          || prepared.requestId !== 1
          || !candidate
          || candidate.id !== project.id
          || typeof candidate.id !== 'string'
          || candidate.id.length === 0
          || typeof candidate.name !== 'string'
          || !initialState) {
          protocolFailure();
          return;
        }
        settle({ project: prepared.project as WorkspaceProject });
        return;
      }
      if (envelope.type === 'project-preparation-failed') {
        const failure = readPlainDataRecord(data, ['type', 'requestId', 'message']);
        if (!failure
          || failure.requestId !== 1
          || typeof failure.message !== 'string'
          || failure.message.length === 0) {
          protocolFailure();
          return;
        }
        settle({ error: new WorkspaceStoreError(failure.message, 'validation') });
        return;
      }
      protocolFailure();
    } catch {
      protocolFailure();
    }
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

  try {
    worker.addEventListener('message', onMessage);
    registeredListeners.push(['message', onMessage]);
    worker.addEventListener('error', onError);
    registeredListeners.push(['error', onError]);
    worker.addEventListener('messageerror', onMessageError);
    registeredListeners.push(['messageerror', onMessageError]);
    responseTimer = setTimeout(() => settle({
      error: unavailable('Project preparation Worker did not respond.'),
    }), WORKER_RESPONSE_TIMEOUT_MS);
    worker.postMessage({ type: 'prepare-project', requestId: 1, project });
  } catch (error) {
    settle({
      error: unavailable('Project preparation Worker could not be initialized.', error),
    });
  }
});
