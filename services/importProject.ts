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
  replaceRetainedForkAttempt?: true;
}

interface ImportStageAttemptIdentity {
  importId: string;
  targetProjectId: string;
  createdAt: string;
  payloadHash: string;
}

interface ImportStageAttempt extends ImportStageAttemptIdentity {
  sourceKey: string;
  replaces?: ImportStageAttemptIdentity;
}

let volatileAttempts = new Map<string, ImportStageAttempt>();

const isCanonicalTimestamp = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
};

const hasAttemptIdentity = (
  candidate: Partial<ImportStageAttemptIdentity>,
): candidate is ImportStageAttemptIdentity => (
  typeof candidate.importId === 'string'
    && candidate.importId.length > 0
    && typeof candidate.targetProjectId === 'string'
    && candidate.targetProjectId.length > 0
    && typeof candidate.createdAt === 'string'
    && isCanonicalTimestamp(candidate.createdAt)
    && typeof candidate.payloadHash === 'string'
    && /^[a-f0-9]{64}$/.test(candidate.payloadHash)
);

const isAttemptIdentity = (value: unknown): value is ImportStageAttemptIdentity => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ImportStageAttemptIdentity>;
  return Object.keys(candidate).length === 4 && hasAttemptIdentity(candidate);
};

const isAttempt = (value: unknown): value is ImportStageAttempt => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ImportStageAttempt>;
  const keys = Object.keys(candidate);
  const replaces = candidate.replaces;
  return (keys.length === 5 || keys.length === 6)
    && keys.every(key => [
      'sourceKey',
      'importId',
      'targetProjectId',
      'createdAt',
      'payloadHash',
      'replaces',
    ].includes(key))
    && typeof candidate.sourceKey === 'string'
    && candidate.sourceKey.length > 0
    && hasAttemptIdentity(candidate)
    && (replaces === undefined || isAttemptIdentity(replaces));
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
  && left.payloadHash === right.payloadHash
  && (left.replaces === undefined || right.replaces === undefined
    ? left.replaces === right.replaces
    : left.replaces.importId === right.replaces.importId
      && left.replaces.targetProjectId === right.replaces.targetProjectId
      && left.replaces.createdAt === right.replaces.createdAt
      && left.replaces.payloadHash === right.replaces.payloadHash);

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

const attemptIdentity = (attempt: ImportStageAttempt): ImportStageAttemptIdentity => ({
  importId: attempt.importId,
  targetProjectId: attempt.targetProjectId,
  createdAt: attempt.createdAt,
  payloadHash: attempt.payloadHash,
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

const forkAttemptForSource = (sourceKey: string, payloadHash: string): ImportStageAttempt => {
  const attempts = readPersistedAttempts();
  const persisted = attempts.get(sourceKey);
  const attempt = persisted ?? volatileAttempts.get(sourceKey);
  if (!attempt) {
    const created = createAttempt(sourceKey, payloadHash);
    persistAttempt(created);
    return created;
  }
  volatileAttempts.set(sourceKey, attempt);
  if (attempt.payloadHash === payloadHash) return attempt;
  if (attempt.replaces) {
    throw new WorkspaceStoreError('Fork import source changed during replacement.', 'conflict');
  }
  const replacement: ImportStageAttempt = {
    ...createAttempt(sourceKey, payloadHash),
    replaces: attemptIdentity(attempt),
  };
  persistAttempt(replacement);
  return replacement;
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
    ? options.replaceRetainedForkAttempt
      ? forkAttemptForSource(options.sourceKey, payloadHash)
      : attemptForSource(options.sourceKey, payloadHash)
    : createAttempt('ordinary-caller', payloadHash);
  const pendingImport = {
    id: attempt.importId,
    targetProjectId: attempt.targetProjectId,
    name: payload.name,
    state: payload.state,
    ...(payload.cloud ? { cloud: payload.cloud } : {}),
    createdAt: attempt.createdAt,
  };
  if (options?.replaceRetainedForkAttempt) {
    const sourceKeyDigest = await sha256Hex(options.sourceKey);
    const attemptProvenance = { sourceKeyDigest, payloadDigest: payloadHash };
    await localWorkspaceStore.commit(attempt.replaces
      ? {
          type: 'replace-staged-import',
          expected: {
            importId: attempt.replaces.importId,
            targetProjectId: attempt.replaces.targetProjectId,
            createdAt: attempt.replaces.createdAt,
            sourceKeyDigest,
            payloadDigest: attempt.replaces.payloadHash,
          },
          replacement: { pendingImport, attemptProvenance },
        }
      : { type: 'stage-import', pendingImport, attemptProvenance });
  } else {
    await localWorkspaceStore.commit({ type: 'stage-import', pendingImport });
  }
  if (options) clearAttempt(attempt);
  return attempt.importId;
}
