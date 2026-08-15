import { cloudApi } from './cloudApi';
import { stageImport } from './importProject';

const FORK_ATTEMPT_STORAGE_KEY = 'doctect_fork_attempts';
const FORK_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

interface ForkResultMetadata {
  projectId: string;
  name: string;
  headCommitId: string;
}

interface ForkAttempt {
  sourceProjectId: string;
  idempotencyKey: string;
  result?: ForkResultMetadata;
}

let volatileAttempts = new Map<string, ForkAttempt>();

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isResult = (value: unknown): value is ForkResultMetadata => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ForkResultMetadata>;
  return nonEmptyString(candidate.projectId)
    && typeof candidate.name === 'string'
    && nonEmptyString(candidate.headCommitId);
};

const isAttempt = (value: unknown): value is ForkAttempt => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ForkAttempt>;
  return nonEmptyString(candidate.sourceProjectId)
    && typeof candidate.idempotencyKey === 'string'
    && FORK_KEY_PATTERN.test(candidate.idempotencyKey)
    && (candidate.result === undefined || isResult(candidate.result));
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
  let result = attempt.result;
  if (!result) {
    const response = await cloudApi.fork(sourceProjectId, attempt.idempotencyKey);
    const project = response.project;
    if (!nonEmptyString(project?.id)
      || typeof project.name !== 'string'
      || !nonEmptyString(project.headCommitId)) {
      throw new Error('Fork response did not include durable project metadata.');
    }
    result = {
      projectId: project.id,
      name: project.name,
      headCommitId: project.headCommitId,
    };
    saveAttempt({ ...attempt, result });
  }

  const commit = await cloudApi.getCommit(result.projectId, result.headCommitId);
  const importId = await stageImport(
    {
      name: result.name,
      state: commit.state,
      cloud: { projectId: result.projectId, lastSyncedCommitId: commit.id },
    },
    { sourceKey: `gallery-fork:${result.projectId}:${commit.id}` },
  );
  clearAttempt(attempt);
  return importId;
}
