import {
  localWorkspaceStore,
  WorkspaceStoreError,
} from './localWorkspace/index';
import { canonicalStringify, sha256Hex } from './localWorkspace/canonical';

export const IMPORT_STAGE_ERROR_MESSAGE =
  'Could not prepare this project for the editor. Nothing was removed; try again.';

const ATTEMPT_STORAGE_KEY = 'doctect_import_stage_attempt';

export interface ImportPayload {
  name: string;
  state: unknown;
  cloud?: { projectId: string; lastSyncedCommitId: string };
}

export interface ImportStageOptions {
  sourceKey: string;
}

interface ImportStageAttempt {
  sourceKey: string;
  importId: string;
  targetProjectId: string;
  createdAt: string;
  payloadHash: string;
}

let volatileAttempts = new Map<string, ImportStageAttempt>();

const isCanonicalTimestamp = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
};

const isAttempt = (value: unknown): value is ImportStageAttempt => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ImportStageAttempt>;
  return typeof candidate.sourceKey === 'string'
    && candidate.sourceKey.length > 0
    && typeof candidate.importId === 'string'
    && candidate.importId.length > 0
    && typeof candidate.targetProjectId === 'string'
    && candidate.targetProjectId.length > 0
    && typeof candidate.createdAt === 'string'
    && isCanonicalTimestamp(candidate.createdAt)
    && typeof candidate.payloadHash === 'string'
    && /^[a-f0-9]{64}$/.test(candidate.payloadHash);
};

const readPersistedAttempts = (): Map<string, ImportStageAttempt> => {
  try {
    const raw = window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isAttempt)) {
      return new Map(parsed.map(attempt => [attempt.sourceKey, attempt]));
    }
    window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
  } catch {
    // Volatile metadata still protects retries while this module remains loaded.
  }
  return new Map();
};

const persistAttempts = (attempts: Map<string, ImportStageAttempt>): void => {
  try {
    if (attempts.size === 0) {
      window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        ATTEMPT_STORAGE_KEY,
        JSON.stringify([...attempts.values()]),
      );
    }
  } catch {
    // IndexedDB remains authoritative; session metadata only reconciles ambiguous retries.
  }
};

const persistAttempt = (attempt: ImportStageAttempt): void => {
  const attempts = readPersistedAttempts();
  attempts.set(attempt.sourceKey, attempt);
  volatileAttempts.set(attempt.sourceKey, attempt);
  persistAttempts(attempts);
};

const sameAttempt = (left: ImportStageAttempt, right: ImportStageAttempt): boolean =>
  left.sourceKey === right.sourceKey
  && left.importId === right.importId
  && left.targetProjectId === right.targetProjectId
  && left.createdAt === right.createdAt
  && left.payloadHash === right.payloadHash;

const clearAttempt = (attempt: ImportStageAttempt): void => {
  const attempts = readPersistedAttempts();
  const persisted = attempts.get(attempt.sourceKey);
  if (persisted && sameAttempt(persisted, attempt)) attempts.delete(attempt.sourceKey);
  const volatile = volatileAttempts.get(attempt.sourceKey);
  if (volatile && sameAttempt(volatile, attempt)) volatileAttempts.delete(attempt.sourceKey);
  persistAttempts(attempts);
};

const createAttempt = (sourceKey: string, payloadHash: string): ImportStageAttempt => ({
  sourceKey,
  importId: `import_${globalThis.crypto.randomUUID()}`,
  targetProjectId: `proj_${globalThis.crypto.randomUUID()}`,
  createdAt: new Date().toISOString(),
  payloadHash,
});

const assertMatchingPayload = (
  attempt: ImportStageAttempt,
  payloadHash: string,
): ImportStageAttempt => {
  if (attempt.payloadHash !== payloadHash) {
    throw new WorkspaceStoreError('Import source payload changed during retry.', 'conflict');
  }
  return attempt;
};

const attemptForSource = (sourceKey: string, payloadHash: string): ImportStageAttempt => {
  const persisted = readPersistedAttempts().get(sourceKey);
  if (persisted) {
    volatileAttempts.set(sourceKey, persisted);
    return assertMatchingPayload(persisted, payloadHash);
  }
  const volatile = volatileAttempts.get(sourceKey);
  if (volatile) return assertMatchingPayload(volatile, payloadHash);
  const attempt = createAttempt(sourceKey, payloadHash);
  persistAttempt(attempt);
  return attempt;
};

export async function stageImport(
  payload: ImportPayload,
  options?: ImportStageOptions,
): Promise<string> {
  const bootstrap = await localWorkspaceStore.bootstrap();
  if (bootstrap.status !== 'ready') {
    throw new WorkspaceStoreError('Workspace is not ready.', 'authority-lost');
  }
  const payloadHash = await sha256Hex(canonicalStringify(payload));
  const attempt = options
    ? attemptForSource(options.sourceKey, payloadHash)
    : createAttempt('ordinary-caller', payloadHash);

  await localWorkspaceStore.commit({
    type: 'stage-import',
    pendingImport: {
      id: attempt.importId,
      targetProjectId: attempt.targetProjectId,
      name: payload.name,
      state: payload.state,
      ...(payload.cloud ? { cloud: payload.cloud } : {}),
      createdAt: attempt.createdAt,
    },
  });
  if (options) clearAttempt(attempt);
  return attempt.importId;
}
