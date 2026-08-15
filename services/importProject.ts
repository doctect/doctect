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

let volatileAttempt: ImportStageAttempt | null = null;

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

const readPersistedAttempt = (): ImportStageAttempt | null => {
  try {
    const raw = window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isAttempt(parsed)) return parsed;
    window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
  } catch {
    // Volatile metadata still protects retries while this module remains mounted.
  }
  return null;
};

const persistAttempt = (attempt: ImportStageAttempt): void => {
  volatileAttempt = attempt;
  try {
    window.sessionStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // IndexedDB remains authoritative; session metadata only reconciles ambiguous retries.
  }
};

const sameAttempt = (left: ImportStageAttempt, right: ImportStageAttempt): boolean =>
  left.sourceKey === right.sourceKey
  && left.importId === right.importId
  && left.targetProjectId === right.targetProjectId
  && left.createdAt === right.createdAt
  && left.payloadHash === right.payloadHash;

const clearAttempt = (attempt: ImportStageAttempt): void => {
  if (volatileAttempt && sameAttempt(volatileAttempt, attempt)) volatileAttempt = null;
  try {
    const persisted = readPersistedAttempt();
    if (persisted && sameAttempt(persisted, attempt)) {
      window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
    }
  } catch {
    // Failed cleanup can only cause an exact idempotent reconciliation on a later retry.
  }
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
  if (volatileAttempt?.sourceKey === sourceKey) {
    return assertMatchingPayload(volatileAttempt, payloadHash);
  }
  const persisted = readPersistedAttempt();
  if (persisted?.sourceKey === sourceKey) {
    volatileAttempt = persisted;
    return assertMatchingPayload(persisted, payloadHash);
  }
  if (volatileAttempt) clearAttempt(volatileAttempt);
  else if (persisted) clearAttempt(persisted);
  const attempt = createAttempt(sourceKey, payloadHash);
  persistAttempt(attempt);
  return attempt;
};

export async function stageImport(
  payload: ImportPayload,
  options?: ImportStageOptions,
): Promise<string> {
  const payloadHash = await sha256Hex(canonicalStringify(payload));
  const attempt = options
    ? attemptForSource(options.sourceKey, payloadHash)
    : createAttempt('ordinary-caller', payloadHash);
  const bootstrap = await localWorkspaceStore.bootstrap();
  if (bootstrap.status !== 'ready') {
    throw new WorkspaceStoreError('Workspace is not ready.', 'authority-lost');
  }

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
