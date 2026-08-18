import { cloudApi } from './cloudApi';
import { stageImport } from './importProject';

const FORK_ATTEMPT_STORAGE_KEY = 'doctect_fork_attempts';
const FORK_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

interface ForkAttempt {
  sourceProjectId: string;
  idempotencyKey: string;
}

let volatileAttempts = new Map<string, ForkAttempt>();

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isAttempt = (value: unknown): value is ForkAttempt => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ForkAttempt>;
  return Object.keys(candidate).length === 2
    && Object.hasOwn(candidate, 'sourceProjectId')
    && Object.hasOwn(candidate, 'idempotencyKey')
    && nonEmptyString(candidate.sourceProjectId)
    && typeof candidate.idempotencyKey === 'string'
    && FORK_KEY_PATTERN.test(candidate.idempotencyKey);
};

const readPersistedAttempts = (): Map<string, ForkAttempt> => {
  try {
    const raw = window.sessionStorage.getItem(FORK_ATTEMPT_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some(attempt => !isAttempt(attempt))) {
      window.sessionStorage.removeItem(FORK_ATTEMPT_STORAGE_KEY);
      return new Map();
    }
    return new Map(parsed.map(attempt => [attempt.sourceProjectId, attempt]));
  } catch {
    return new Map();
  }
};

const persistAttempts = (attempts: Map<string, ForkAttempt>): void => {
  try {
    if (attempts.size === 0) {
      window.sessionStorage.removeItem(FORK_ATTEMPT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        FORK_ATTEMPT_STORAGE_KEY,
        JSON.stringify([...attempts.values()]),
      );
    }
  } catch {
    // Volatile compact metadata still protects concurrent retries in this module instance.
  }
};

const saveAttempt = (attempt: ForkAttempt): void => {
  const attempts = readPersistedAttempts();
  attempts.set(attempt.sourceProjectId, attempt);
  volatileAttempts.set(attempt.sourceProjectId, attempt);
  persistAttempts(attempts);
};

const attemptForSource = (sourceProjectId: string): ForkAttempt => {
  const persisted = readPersistedAttempts().get(sourceProjectId);
  if (persisted) {
    volatileAttempts.set(sourceProjectId, persisted);
    return persisted;
  }
  const volatile = volatileAttempts.get(sourceProjectId);
  if (volatile) return volatile;
  const attempt = {
    sourceProjectId,
    idempotencyKey: `fork_${globalThis.crypto.randomUUID()}`,
  };
  saveAttempt(attempt);
  return attempt;
};

const clearAttempt = (attempt: ForkAttempt): void => {
  const attempts = readPersistedAttempts();
  if (attempts.get(attempt.sourceProjectId)?.idempotencyKey === attempt.idempotencyKey) {
    attempts.delete(attempt.sourceProjectId);
  }
  if (volatileAttempts.get(attempt.sourceProjectId)?.idempotencyKey === attempt.idempotencyKey) {
    volatileAttempts.delete(attempt.sourceProjectId);
  }
  persistAttempts(attempts);
};

export async function stageForkImport(sourceProjectId: string): Promise<string> {
  const attempt = attemptForSource(sourceProjectId);
  const response = await cloudApi.fork(sourceProjectId, attempt.idempotencyKey);
  const project = response.project;
  if (!nonEmptyString(project?.id)
    || typeof project.name !== 'string'
    || !nonEmptyString(project.headCommitId)) {
    throw new Error('Fork response did not include durable project metadata.');
  }

  const commit = await cloudApi.getCommit(project.id, project.headCommitId);
  const importId = await stageImport(
    {
      name: project.name,
      state: commit.state,
      cloud: { projectId: project.id, lastSyncedCommitId: commit.id },
    },
    { sourceKey: `gallery-fork:${project.id}:${commit.id}` },
  );
  clearAttempt(attempt);
  return importId;
}
