import type { AppState } from '../../types';
import { createBlankProject } from '../presets';
import {
  canonicalStringify,
  digestLegacySnapshot,
  digestWorkspaceContent,
  sha256Hex,
} from './canonical';
import type {
  MigrationReceipt,
  WorkspaceCustomPreset,
  WorkspacePendingImport,
  WorkspaceProject,
  WorkspaceSnapshot,
} from './contracts';
import {
  LEGACY_DOCUMENT_KEYS,
  LEGACY_KEYS,
  type LegacyDocumentKey,
  type LegacySnapshot,
} from './legacyTypes';
import {
  PERSISTENCE_ROLLOUT_EPOCH,
  WORKSPACE_DB_VERSION,
  WORKSPACE_MIGRATION_ID,
  type LegacyBackupRecord,
  type MigrationLedger,
  type StoredImportAttemptProvenance,
  type StoredPendingImport,
  type StoredPreset,
  type StoredProject,
  type StoredWorkspace,
} from './schema';
import {
  preparePendingImport,
  validateCustomPreset,
  validateMigratedState,
  validateWorkspaceProject,
} from './validation';

const REJECT_WARNINGS = { warningPolicy: 'reject' as const };
const LEGACY_PENDING_KEYS = new Set(['name', 'state', 'cloud']);
const STORED_PENDING_KEYS = new Set([
  'id',
  'targetProjectId',
  'name',
  'state',
  'cloud',
  'createdAt',
  'warnings',
]);

export interface MigrationPreparationEnvironment {
  crypto: Pick<Crypto, 'subtle'>;
  now(): string;
  randomUUID(): string;
  createBlankProject(): AppState;
}

export interface PreparedInitialCopy {
  origin: 'legacy' | 'native';
  source: LegacySnapshot;
  sourceDigest: string;
  targetDigest: string;
  projects: StoredProject[];
  workspace: StoredWorkspace;
  presets: StoredPreset[];
  pendingImports: StoredPendingImport[];
  backup: LegacyBackupRecord;
  ledger: MigrationLedger;
  receipt?: MigrationReceipt;
}

export interface WorkspaceRecords {
  projects: StoredProject[];
  workspace: StoredWorkspace;
  presets: StoredPreset[];
  pendingImports: StoredPendingImport[];
}

type MigrationErrorCategory = 'legacy-invalid' | 'target-invalid' | 'verification-failed';

export class WorkspaceMigrationError extends Error {
  constructor(
    message: string,
    public readonly category: MigrationErrorCategory,
    public readonly affectedKey?: LegacyDocumentKey,
    public readonly affectedItem?: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WorkspaceMigrationError';
  }
}

const defaultEnvironment = (): MigrationPreparationEnvironment => ({
  crypto: globalThis.crypto,
  now: () => new Date().toISOString(),
  randomUUID: () => globalThis.crypto.randomUUID(),
  createBlankProject,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const sourceError = (
  key: LegacyDocumentKey,
  message: string,
  cause?: unknown,
  affectedItem?: string,
): WorkspaceMigrationError => new WorkspaceMigrationError(
  message,
  'legacy-invalid',
  key,
  affectedItem,
  cause,
);

const targetError = (message: string, cause?: unknown): WorkspaceMigrationError =>
  new WorkspaceMigrationError(message, 'target-invalid', undefined, undefined, cause);

const verificationError = (message: string): WorkspaceMigrationError =>
  new WorkspaceMigrationError(message, 'verification-failed');

const readEntry = (source: LegacySnapshot, key: LegacyDocumentKey) => {
  const entry = source?.[key] as unknown;
  if (!isPlainObject(entry) || typeof entry.present !== 'boolean') {
    throw sourceError(key, `Legacy key ${key} has malformed presence metadata.`);
  }
  if (entry.present) {
    if (typeof entry.raw !== 'string') {
      throw sourceError(key, `Present legacy key ${key} must contain raw text.`);
    }
  } else if (entry.raw !== null) {
    throw sourceError(key, `Absent legacy key ${key} must contain null raw text.`);
  }
  return entry as LegacySnapshot[LegacyDocumentKey];
};

const parseJsonEntry = (
  source: LegacySnapshot,
  key: Exclude<LegacyDocumentKey, typeof LEGACY_KEYS.activeProject>,
): unknown | undefined => {
  const entry = readEntry(source, key);
  if (!entry.present) return undefined;
  try {
    return JSON.parse(entry.raw as string);
  } catch (error) {
    throw sourceError(key, `Legacy key ${key} does not contain valid JSON.`, error);
  }
};

function validateTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw targetError(`${label} must be an ISO timestamp.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw targetError(`${label} must be a canonical ISO timestamp.`);
  }
}

function requireNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw targetError(`${label} must be a non-negative integer.`);
  }
}

const requireExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void => {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw targetError(`${label} is missing ${key}.`);
  }
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) throw targetError(`${label} contains unknown field ${unknown}.`);
};

const validateStoredImportAttempt = (
  value: unknown,
  label: string,
): StoredImportAttemptProvenance => {
  if (!isPlainObject(value)) throw targetError(`${label} must be an object.`);
  requireExactKeys(
    value,
    ['sourceKeyDigest', 'payloadDigest', 'pendingImportDigest'],
    [],
    label,
  );
  for (const key of ['sourceKeyDigest', 'payloadDigest', 'pendingImportDigest'] as const) {
    if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key])) {
      throw targetError(`${label} ${key} must be a lowercase SHA-256 digest.`);
    }
  }
  return structuredClone(value) as unknown as StoredImportAttemptProvenance;
};

const fingerprintItems = async (
  items: unknown[],
  ids: string[],
  subtle: SubtleCrypto,
) => Promise.all(items.map(async (item, sourceIndex) => ({
  sourceIndex,
  id: ids[sourceIndex],
  digest: await sha256Hex(canonicalStringify(item), subtle),
})));

const importTargetId = (sourceDigest: string, existingIds: ReadonlySet<string>): string => {
  const base = `proj_migrated_import_${sourceDigest.slice(0, 16)}`;
  if (!existingIds.has(base)) return base;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!existingIds.has(candidate)) return candidate;
  }
};

export async function prepareInitialCopy(
  source: LegacySnapshot,
  environment: MigrationPreparationEnvironment = defaultEnvironment(),
): Promise<PreparedInitialCopy> {
  const sourceCopy = structuredClone(source);
  const entries = Object.fromEntries(
    LEGACY_DOCUMENT_KEYS.map(key => [key, readEntry(sourceCopy, key)]),
  ) as LegacySnapshot;
  const origin = LEGACY_DOCUMENT_KEYS.some(key => entries[key].present) ? 'legacy' : 'native';
  const sourceDigest = await digestLegacySnapshot(entries, environment.crypto.subtle);

  const rawProjectsValue = parseJsonEntry(entries, LEGACY_KEYS.projects);
  if (rawProjectsValue !== undefined && !Array.isArray(rawProjectsValue)) {
    throw sourceError(LEGACY_KEYS.projects, 'Legacy projects must be an array.');
  }
  const rawProjects = Array.isArray(rawProjectsValue) ? rawProjectsValue : [];
  const projectIds = new Set<string>();
  const migratedProjects: WorkspaceProject[] = [];
  for (const [index, rawProject] of rawProjects.entries()) {
    try {
      const project = validateWorkspaceProject(rawProject, REJECT_WARNINGS);
      if (projectIds.has(project.id)) throw new Error(`Duplicate project id: ${project.id}.`);
      projectIds.add(project.id);
      migratedProjects.push(project);
    } catch (error) {
      throw sourceError(
        LEGACY_KEYS.projects,
        `Legacy project at index ${index} is invalid: ${(error as Error).message}`,
        error,
        String(index),
      );
    }
  }

  const activeEntry = readEntry(entries, LEGACY_KEYS.activeProject);
  const requestedActiveId = activeEntry.present && activeEntry.raw !== '' ? activeEntry.raw : null;
  if (requestedActiveId !== null && !projectIds.has(requestedActiveId)) {
    throw sourceError(
      LEGACY_KEYS.activeProject,
      `Legacy active project ${requestedActiveId} does not reference a source project.`,
    );
  }

  const rawPresetsValue = parseJsonEntry(entries, LEGACY_KEYS.customPresets);
  if (rawPresetsValue !== undefined && !Array.isArray(rawPresetsValue)) {
    throw sourceError(LEGACY_KEYS.customPresets, 'Legacy custom presets must be an array.');
  }
  const rawPresets = Array.isArray(rawPresetsValue) ? rawPresetsValue : [];
  const presetIds = new Set<string>();
  const migratedPresets: WorkspaceCustomPreset[] = [];
  for (const [index, rawPreset] of rawPresets.entries()) {
    try {
      const preset = validateCustomPreset(rawPreset, {
        warningPolicy: 'reject',
        existingIds: presetIds,
      });
      presetIds.add(preset.id);
      migratedPresets.push(preset);
    } catch (error) {
      throw sourceError(
        LEGACY_KEYS.customPresets,
        `Legacy custom preset at index ${index} is invalid: ${(error as Error).message}`,
        error,
        String(index),
      );
    }
  }

  const rawPendingValue = parseJsonEntry(entries, LEGACY_KEYS.pendingImport);
  let rawPending: Record<string, unknown> | undefined;
  if (rawPendingValue !== undefined) {
    if (!isPlainObject(rawPendingValue)) {
      throw sourceError(LEGACY_KEYS.pendingImport, 'Legacy pending import must be one object.');
    }
    const unknownKey = Object.keys(rawPendingValue).find(key => !LEGACY_PENDING_KEYS.has(key));
    if (unknownKey) {
      throw sourceError(
        LEGACY_KEYS.pendingImport,
        `Legacy pending import contains unknown field ${unknownKey}.`,
      );
    }
    rawPending = rawPendingValue;
  }

  const projectFingerprints = await fingerprintItems(
    rawProjects,
    migratedProjects.map(project => project.id),
    environment.crypto.subtle,
  );
  const presetFingerprints = await fingerprintItems(
    rawPresets,
    migratedPresets.map(preset => preset.id),
    environment.crypto.subtle,
  );
  const keyFingerprints = await Promise.all(LEGACY_DOCUMENT_KEYS.map(async key => ({
    key,
    present: entries[key].present,
    digest: await sha256Hex(entries[key].raw ?? '', environment.crypto.subtle),
  })));

  const migratedAt = environment.now();
  validateTimestamp(migratedAt, 'Migration timestamp');

  if (migratedProjects.length === 0) {
    try {
      const blank = validateWorkspaceProject({
        id: `proj_${environment.randomUUID()}`,
        name: 'Blank Project',
        initialState: environment.createBlankProject(),
      }, REJECT_WARNINGS);
      migratedProjects.push(blank);
      projectIds.add(blank.id);
    } catch (error) {
      throw targetError(`Fresh blank project is invalid: ${(error as Error).message}`, error);
    }
  }

  let pendingImport: WorkspacePendingImport | undefined;
  if (rawPending !== undefined) {
    try {
      pendingImport = preparePendingImport({
        ...rawPending,
        id: 'legacy-import-v1',
        targetProjectId: importTargetId(sourceDigest, projectIds),
        createdAt: migratedAt,
      }, REJECT_WARNINGS);
    } catch (error) {
      throw sourceError(
        LEGACY_KEYS.pendingImport,
        `Legacy pending import is invalid: ${(error as Error).message}`,
        error,
      );
    }
  }

  const projects: StoredProject[] = migratedProjects.map(project => ({
    id: project.id,
    project,
    incarnation: environment.randomUUID(),
    storageRevision: 0,
    updatedAt: migratedAt,
  }));
  const workspace: StoredWorkspace = {
    id: 'current',
    projectOrder: projects.map(record => record.id),
    activeProjectId: requestedActiveId ?? projects[0].id,
    revision: 0,
  };
  const presets: StoredPreset[] = migratedPresets.map((preset, position) => ({
    id: preset.id,
    preset,
    position,
  }));
  const pendingImports: StoredPendingImport[] = pendingImport ? [{
    id: pendingImport.id,
    pendingImport,
    position: 0,
  }] : [];
  const targetSnapshot: WorkspaceSnapshot = {
    projects: projects.map(record => record.project),
    activeProjectId: workspace.activeProjectId,
    customPresets: presets.map(record => record.preset),
    pendingImports: pendingImports.map(record => record.pendingImport),
  };
  const targetDigest = await digestWorkspaceContent(targetSnapshot, environment.crypto.subtle);
  const backupId = `${WORKSPACE_MIGRATION_ID}:original:${sourceDigest}`;
  const backup: LegacyBackupRecord = {
    id: backupId,
    kind: 'original',
    capturedAt: migratedAt,
    snapshot: structuredClone(entries),
    digest: sourceDigest,
  };
  const ledger: MigrationLedger = {
    id: WORKSPACE_MIGRATION_ID,
    indexedDbVersion: WORKSPACE_DB_VERSION,
    state: 'copied',
    origin,
    ledgerRevision: 0,
    sourceDigest,
    expectedTargetDigest: targetDigest,
    acceptedLegacyDigest: sourceDigest,
    originalLegacyBackupId: backupId,
    acceptedLegacyBackupId: backupId,
    keyFingerprints,
    projectFingerprints,
    presetFingerprints,
    counts: {
      sourceProjects: rawProjects.length,
      targetProjects: projects.length,
      customPresets: presets.length,
      pendingImports: pendingImports.length,
    },
    migratedAt,
    verifiedAt: null,
    persistenceRolloutEpoch: PERSISTENCE_ROLLOUT_EPOCH,
    unresolvedRecovery: null,
  };
  const receipt: MigrationReceipt | undefined = origin === 'legacy' ? {
    id: `${WORKSPACE_MIGRATION_ID}:${sourceDigest}`,
    projectCount: rawProjects.length,
    customPresetCount: presets.length,
    pendingImportPreserved: pendingImports.length === 1,
    migratedAt,
  } : undefined;

  return {
    origin,
    source: structuredClone(entries),
    sourceDigest,
    targetDigest,
    projects,
    workspace,
    presets,
    pendingImports,
    backup,
    ledger,
    ...(receipt ? { receipt } : {}),
  };
}

const validateProjectRecords = (records: unknown): Map<string, WorkspaceProject> => {
  if (!Array.isArray(records)) throw targetError('Project records must be an array.');
  const projects = new Map<string, WorkspaceProject>();
  const consumedImportIds = new Set<string>();
  for (const [index, rawRecord] of records.entries()) {
    if (!isPlainObject(rawRecord)) throw targetError(`Project record ${index} must be an object.`);
    requireExactKeys(
      rawRecord,
      ['id', 'project', 'incarnation', 'storageRevision', 'updatedAt'],
      [
        'consumedImportId',
        'consumedImportCreatedAt',
        'consumedImportDigest',
        'consumedImportAttempt',
      ],
      `Project record ${index}`,
    );
    if (typeof rawRecord.id !== 'string' || rawRecord.id.length === 0) {
      throw targetError(`Project record ${index} id must be a non-empty string.`);
    }
    if (projects.has(rawRecord.id)) throw targetError(`Duplicate project record id ${rawRecord.id}.`);
    if (typeof rawRecord.incarnation !== 'string' || rawRecord.incarnation.length === 0) {
      throw targetError(`Project record ${rawRecord.id} incarnation must be a non-empty string.`);
    }
    requireNonNegativeInteger(rawRecord.storageRevision, `Project record ${rawRecord.id} storageRevision`);
    validateTimestamp(rawRecord.updatedAt, `Project record ${rawRecord.id} updatedAt`);
    if (Object.hasOwn(rawRecord, 'consumedImportId')) {
      if (typeof rawRecord.consumedImportId !== 'string'
        || rawRecord.consumedImportId.length === 0) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportId must be a non-empty string.`,
        );
      }
      if (consumedImportIds.has(rawRecord.consumedImportId)) {
        throw targetError(`Duplicate consumed import id ${rawRecord.consumedImportId}.`);
      }
      consumedImportIds.add(rawRecord.consumedImportId);
    }
    if (Object.hasOwn(rawRecord, 'consumedImportCreatedAt')) {
      if (!Object.hasOwn(rawRecord, 'consumedImportId')) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportCreatedAt requires consumedImportId.`,
        );
      }
      validateTimestamp(
        rawRecord.consumedImportCreatedAt,
        `Project record ${rawRecord.id} consumedImportCreatedAt`,
      );
    }
    if (Object.hasOwn(rawRecord, 'consumedImportDigest')) {
      if (!Object.hasOwn(rawRecord, 'consumedImportId')) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportDigest requires consumedImportId.`,
        );
      }
      if (!Object.hasOwn(rawRecord, 'consumedImportCreatedAt')) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportDigest requires consumedImportCreatedAt.`,
        );
      }
      if (typeof rawRecord.consumedImportDigest !== 'string'
        || !/^[a-f0-9]{64}$/.test(rawRecord.consumedImportDigest)) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportDigest must be a lowercase SHA-256 digest.`,
        );
      }
    }
    if (Object.hasOwn(rawRecord, 'consumedImportAttempt')) {
      if (!Object.hasOwn(rawRecord, 'consumedImportId')
        || !Object.hasOwn(rawRecord, 'consumedImportCreatedAt')
        || !Object.hasOwn(rawRecord, 'consumedImportDigest')) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportAttempt requires complete consume provenance.`,
        );
      }
      const consumedImportAttempt = validateStoredImportAttempt(
        rawRecord.consumedImportAttempt,
        `Project record ${rawRecord.id} consumedImportAttempt`,
      );
      if (consumedImportAttempt.pendingImportDigest !== rawRecord.consumedImportDigest) {
        throw targetError(
          `Project record ${rawRecord.id} consumedImportAttempt pending digest must match consumedImportDigest.`,
        );
      }
    }
    try {
      if (!isPlainObject(rawRecord.project)) throw new Error('Project payload must be an object.');
      validateMigratedState(rawRecord.project.initialState);
      const project = validateWorkspaceProject(rawRecord.project, REJECT_WARNINGS);
      if (project.id !== rawRecord.id) throw new Error('Stored ID does not match project ID.');
      projects.set(project.id, project);
    } catch (error) {
      throw targetError(`Project record ${rawRecord.id} is invalid: ${(error as Error).message}`, error);
    }
  }
  return projects;
};

const validateWorkspaceRecord = (raw: unknown): StoredWorkspace => {
  if (!isPlainObject(raw)) throw targetError('Workspace record must be an object.');
  requireExactKeys(raw, ['id', 'projectOrder', 'activeProjectId', 'revision'], [], 'Workspace record');
  if (raw.id !== 'current') throw targetError('Workspace record id must be current.');
  if (!Array.isArray(raw.projectOrder)
    || raw.projectOrder.some(id => typeof id !== 'string' || id.length === 0)) {
    throw targetError('Workspace projectOrder must contain non-empty string IDs.');
  }
  if (typeof raw.activeProjectId !== 'string' || raw.activeProjectId.length === 0) {
    throw targetError('Workspace activeProjectId must be a non-empty string.');
  }
  requireNonNegativeInteger(raw.revision, 'Workspace revision');
  return structuredClone(raw) as unknown as StoredWorkspace;
};

const orderedByPosition = <T extends { position: number }>(records: T[], label: string): T[] => {
  const positions = new Set<number>();
  for (const record of records) {
    requireNonNegativeInteger(record.position, `${label} position`);
    if (positions.has(record.position)) throw targetError(`${label} positions must be unique.`);
    positions.add(record.position);
  }
  return [...records].sort((left, right) => left.position - right.position);
};

const validatePresetRecords = (records: unknown): WorkspaceCustomPreset[] => {
  if (!Array.isArray(records)) throw targetError('Preset records must be an array.');
  const ids = new Set<string>();
  const validated = records.map((rawRecord, index) => {
    if (!isPlainObject(rawRecord)) throw targetError(`Preset record ${index} must be an object.`);
    requireExactKeys(rawRecord, ['id', 'preset', 'position'], [], `Preset record ${index}`);
    if (typeof rawRecord.id !== 'string' || rawRecord.id.length === 0) {
      throw targetError(`Preset record ${index} id must be a non-empty string.`);
    }
    try {
      if (!isPlainObject(rawRecord.preset)) throw new Error('Preset payload must be an object.');
      validateMigratedState(rawRecord.preset.initialState);
      const preset = validateCustomPreset(rawRecord.preset, {
        warningPolicy: 'reject',
        existingIds: ids,
      });
      if (preset.id !== rawRecord.id) throw new Error('Stored ID does not match preset ID.');
      ids.add(preset.id);
      return { preset, position: rawRecord.position as number };
    } catch (error) {
      throw targetError(`Preset record ${rawRecord.id} is invalid: ${(error as Error).message}`, error);
    }
  });
  return orderedByPosition(validated, 'Preset record').map(record => record.preset);
};

const validatePendingRecords = (records: unknown): WorkspacePendingImport[] => {
  if (!Array.isArray(records)) throw targetError('Pending import records must be an array.');
  const ids = new Set<string>();
  const validated = records.map((rawRecord, index) => {
    if (!isPlainObject(rawRecord)) throw targetError(`Pending import record ${index} must be an object.`);
    requireExactKeys(
      rawRecord,
      ['id', 'pendingImport', 'position'],
      ['attemptProvenance'],
      `Pending import record ${index}`,
    );
    if (typeof rawRecord.id !== 'string' || rawRecord.id.length === 0) {
      throw targetError(`Pending import record ${index} id must be a non-empty string.`);
    }
    if (ids.has(rawRecord.id)) throw targetError(`Duplicate pending import record id ${rawRecord.id}.`);
    if (!isPlainObject(rawRecord.pendingImport)) {
      throw targetError(`Pending import record ${rawRecord.id} payload must be an object.`);
    }
    const payload = rawRecord.pendingImport;
    const unknown = Object.keys(payload).find(key => !STORED_PENDING_KEYS.has(key));
    if (unknown) {
      throw targetError(`Pending import record ${rawRecord.id} contains unknown field ${unknown}.`);
    }
    for (const required of ['id', 'targetProjectId', 'name', 'state', 'createdAt', 'warnings']) {
      if (!Object.hasOwn(payload, required)) {
        throw targetError(`Pending import record ${rawRecord.id} is missing ${required}.`);
      }
    }
    if (!Array.isArray(payload.warnings)
      || payload.warnings.some(warning => typeof warning !== 'string')) {
      throw targetError(`Pending import record ${rawRecord.id} warnings must be strings.`);
    }
    if (Object.hasOwn(rawRecord, 'attemptProvenance')) {
      validateStoredImportAttempt(
        rawRecord.attemptProvenance,
        `Pending import record ${rawRecord.id} attemptProvenance`,
      );
    }
    try {
      validateMigratedState(payload.state);
      const { warnings, ...input } = payload;
      const pendingImport = preparePendingImport(input, REJECT_WARNINGS);
      if (pendingImport.id !== rawRecord.id) throw new Error('Stored ID does not match import ID.');
      ids.add(pendingImport.id);
      return {
        pendingImport: { ...pendingImport, warnings: [...warnings] },
        position: rawRecord.position as number,
      };
    } catch (error) {
      throw targetError(
        `Pending import record ${rawRecord.id} is invalid: ${(error as Error).message}`,
        error,
      );
    }
  });
  return orderedByPosition(validated, 'Pending import record').map(record => record.pendingImport);
};

export function reconstructWorkspace(records: WorkspaceRecords): WorkspaceSnapshot {
  if (!isPlainObject(records)) throw targetError('Workspace records must be an object.');
  const projectsById = validateProjectRecords(records.projects);
  const workspace = validateWorkspaceRecord(records.workspace);
  const order = workspace.projectOrder;
  if (new Set(order).size !== order.length) throw targetError('Workspace projectOrder contains duplicates.');
  if (order.length !== projectsById.size || order.some(id => !projectsById.has(id))) {
    throw targetError('Workspace projectOrder must reference every project record exactly once.');
  }
  if (!projectsById.has(workspace.activeProjectId)) {
    throw targetError('Workspace activeProjectId must reference an ordered project.');
  }

  return {
    projects: order.map(id => projectsById.get(id) as WorkspaceProject),
    activeProjectId: workspace.activeProjectId,
    customPresets: validatePresetRecords(records.presets),
    pendingImports: validatePendingRecords(records.pendingImports),
  };
}

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export async function verifyPreparedCopy(
  prepared: PreparedInitialCopy,
  records: WorkspaceRecords,
  currentLegacy: LegacySnapshot,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<WorkspaceSnapshot> {
  const reconstructed = reconstructWorkspace(records);
  const observed = {
    targetDigest: await digestWorkspaceContent(reconstructed, subtle),
    sourceDigest: await digestLegacySnapshot(currentLegacy, subtle),
    projectCount: records.projects.length,
    presetCount: records.presets.length,
    pendingImportCount: records.pendingImports.length,
    projectOrder: records.workspace.projectOrder,
    activeProjectId: records.workspace.activeProjectId,
  };
  const expected = {
    targetDigest: prepared.ledger.expectedTargetDigest,
    sourceDigest: prepared.ledger.sourceDigest,
    projectCount: prepared.ledger.counts.targetProjects,
    presetCount: prepared.ledger.counts.customPresets,
    pendingImportCount: prepared.ledger.counts.pendingImports,
    projectOrder: prepared.workspace.projectOrder,
    activeProjectId: prepared.workspace.activeProjectId,
  };

  if (prepared.targetDigest !== expected.targetDigest
    || prepared.sourceDigest !== expected.sourceDigest
    || observed.targetDigest !== expected.targetDigest
    || observed.sourceDigest !== expected.sourceDigest
    || observed.projectCount !== expected.projectCount
    || observed.presetCount !== expected.presetCount
    || observed.pendingImportCount !== expected.pendingImportCount
    || !sameStrings(observed.projectOrder, expected.projectOrder)
    || observed.activeProjectId !== expected.activeProjectId) {
    throw verificationError('Prepared workspace copy does not match migration expectations.');
  }
  return reconstructed;
}
