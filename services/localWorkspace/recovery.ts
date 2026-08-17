import {
  canonicalStringify,
  digestLegacySnapshot,
  sha256Hex,
} from './canonical';
import type {
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
  reconstructWorkspace,
  type WorkspaceRecords,
} from './migration';
import type {
  LegacyBackupRecord,
  MigrationLedger,
  StoredPendingImport,
  StoredPreset,
  StoredProject,
  StoredWorkspace,
} from './schema';
import {
  preparePendingImport,
  validateCustomPreset,
  validateWorkspaceProject,
} from './validation';

const RECOVERY_MIME = 'application/json;charset=utf-8';
const LEGACY_PENDING_KEYS = new Set(['name', 'state', 'cloud']);
const REJECT_WARNINGS = { warningPolicy: 'reject' as const };

export interface LegacyRecoveryBundle {
  format: 'doctect.legacy-workspace-recovery';
  version: 1;
  capturedAt: string;
  entries: Array<{
    key: LegacyDocumentKey;
    present: boolean;
    raw: string | null;
  }>;
  digest: string;
}

export interface IndexedDbRecoveryBundle {
  format: 'doctect.indexeddb-workspace-recovery';
  version: 1;
  capturedAt: string;
  workspace: WorkspaceSnapshot;
}

export interface RecoveryPreparationEnvironment {
  crypto: Pick<Crypto, 'subtle'>;
  now(): string;
  randomUUID(): string;
}

export interface PreparedLegacyRecovery {
  recoveryId: string;
  observedLegacyDigest: string;
  expectedLedgerRevision: number;
  expectedAcceptedLegacyDigest: string;
  expectedAcceptedLegacyBackupId: string;
  expectedLedger: MigrationLedger;
  expectedRecords: WorkspaceRecords;
  projects: StoredProject[];
  workspace: StoredWorkspace;
  presets: StoredPreset[];
  pendingImports: StoredPendingImport[];
  backup: LegacyBackupRecord;
  ledger: MigrationLedger;
}

interface ParsedItem<T> {
  raw: unknown;
  value: T;
  digest: string;
}

interface ParsedLegacySource {
  projects: ParsedItem<WorkspaceProject>[];
  presets: ParsedItem<WorkspaceCustomPreset>[];
  pendingImport?: ParsedItem<Record<string, unknown>>;
  activeProjectId: string | null;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};

const legacyError = (message: string, cause?: unknown): Error =>
  new Error(message, cause === undefined ? undefined : { cause });

const readEntry = (source: LegacySnapshot, key: LegacyDocumentKey) => {
  const entry = source[key] as unknown;
  if (!isPlainObject(entry)
    || !hasExactKeys(entry, ['present', 'raw'])
    || typeof entry.present !== 'boolean'
    || (entry.present ? typeof entry.raw !== 'string' : entry.raw !== null)) {
    throw legacyError(`Legacy key ${key} has malformed raw-value metadata.`);
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
    throw legacyError(`Legacy key ${key} does not contain valid JSON.`, error);
  }
};

const itemDigest = (value: unknown, subtle: SubtleCrypto): Promise<string> =>
  sha256Hex(canonicalStringify(value), subtle);

const validateTimestamp = (value: string): void => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw legacyError('Recovery timestamp must be a canonical ISO timestamp.');
  }
};

const parseLegacySource = async (
  source: LegacySnapshot,
  environment: RecoveryPreparationEnvironment,
): Promise<ParsedLegacySource> => {
  const projectValue = parseJsonEntry(source, LEGACY_KEYS.projects);
  if (projectValue !== undefined && !Array.isArray(projectValue)) {
    throw legacyError('Legacy projects must be an array.');
  }
  const rawProjects = Array.isArray(projectValue) ? projectValue : [];
  const projectIds = new Set<string>();
  const projects: ParsedItem<WorkspaceProject>[] = [];
  for (const [index, raw] of rawProjects.entries()) {
    try {
      const value = validateWorkspaceProject(raw, REJECT_WARNINGS);
      if (projectIds.has(value.id)) throw legacyError(`Duplicate project id ${value.id}.`);
      projectIds.add(value.id);
      projects.push({
        raw,
        value,
        digest: await itemDigest(raw, environment.crypto.subtle),
      });
    } catch (error) {
      throw legacyError(`Legacy project at index ${index} is invalid.`, error);
    }
  }

  const activeEntry = readEntry(source, LEGACY_KEYS.activeProject);
  const activeProjectId = activeEntry.present && activeEntry.raw !== ''
    ? activeEntry.raw
    : null;
  if (activeProjectId !== null && !projectIds.has(activeProjectId)) {
    throw legacyError(`Legacy active project ${activeProjectId} does not exist.`);
  }

  const presetValue = parseJsonEntry(source, LEGACY_KEYS.customPresets);
  if (presetValue !== undefined && !Array.isArray(presetValue)) {
    throw legacyError('Legacy custom presets must be an array.');
  }
  const rawPresets = Array.isArray(presetValue) ? presetValue : [];
  const presetIds = new Set<string>();
  const presets: ParsedItem<WorkspaceCustomPreset>[] = [];
  for (const [index, raw] of rawPresets.entries()) {
    try {
      const value = validateCustomPreset(raw, {
        warningPolicy: 'reject',
        existingIds: presetIds,
      });
      presetIds.add(value.id);
      presets.push({
        raw,
        value,
        digest: await itemDigest(raw, environment.crypto.subtle),
      });
    } catch (error) {
      throw legacyError(`Legacy custom preset at index ${index} is invalid.`, error);
    }
  }

  const pendingValue = parseJsonEntry(source, LEGACY_KEYS.pendingImport);
  let pendingImport: ParsedItem<Record<string, unknown>> | undefined;
  if (pendingValue !== undefined) {
    if (!isPlainObject(pendingValue)) {
      throw legacyError('Legacy pending import must be one object.');
    }
    const unknownKey = Object.keys(pendingValue).find(key => !LEGACY_PENDING_KEYS.has(key));
    if (unknownKey) {
      throw legacyError(`Legacy pending import contains unknown field ${unknownKey}.`);
    }
    try {
      preparePendingImport({
        ...pendingValue,
        id: 'recovery-validation-import',
        targetProjectId: 'recovery-validation-project',
        createdAt: '1970-01-01T00:00:00.000Z',
      }, REJECT_WARNINGS);
    } catch (error) {
      throw legacyError('Legacy pending import is invalid.', error);
    }
    pendingImport = {
      raw: pendingValue,
      value: structuredClone(pendingValue),
      digest: await itemDigest(pendingValue, environment.crypto.subtle),
    };
  }

  return { projects, presets, pendingImport, activeProjectId };
};

const nextUniqueId = (
  prefix: string,
  used: Set<string>,
  randomUUID: () => string,
): string => {
  const token = randomUUID();
  if (typeof token !== 'string' || token.length === 0) {
    throw legacyError('Recovery ID generator returned an invalid value.');
  }
  const base = `${prefix}${token}`;
  let candidate = base;
  for (let suffix = 1; used.has(candidate); suffix += 1) candidate = `${base}_${suffix}`;
  used.add(candidate);
  return candidate;
};

const changedItems = <T extends { id: string }>(
  current: ParsedItem<T>[],
  accepted: ParsedItem<T>[],
): ParsedItem<T>[] => {
  const acceptedDigests = new Map(accepted.map(item => [item.value.id, item.digest]));
  return current.filter(item => acceptedDigests.get(item.value.id) !== item.digest);
};

const sameCanonicalValue = (left: unknown, right: unknown): boolean =>
  canonicalStringify(left) === canonicalStringify(right);

const reserveLegacyPendingIdentity = (
  source: ParsedLegacySource,
  sourceDigest: string,
  reservedIds: Set<string>,
): void => {
  if (!source.pendingImport) return;
  reservedIds.add('legacy-import-v1');
  const projectIds = new Set(source.projects.map(item => item.value.id));
  const base = `proj_migrated_import_${sourceDigest.slice(0, 16)}`;
  let targetProjectId = base;
  for (let suffix = 1; projectIds.has(targetProjectId); suffix += 1) {
    targetProjectId = `${base}_${suffix}`;
  }
  reservedIds.add(targetProjectId);
};

export async function createLegacyRecoveryBundle(
  snapshot: LegacySnapshot,
  capturedAt: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<Blob> {
  validateTimestamp(capturedAt);
  const source = structuredClone(snapshot);
  const bundle: LegacyRecoveryBundle = {
    format: 'doctect.legacy-workspace-recovery',
    version: 1,
    capturedAt,
    entries: LEGACY_DOCUMENT_KEYS.map(key => {
      const entry = readEntry(source, key);
      return {
        key,
        present: entry.present,
        raw: entry.present ? entry.raw : null,
      };
    }),
    digest: await digestLegacySnapshot(source, subtle),
  };
  return new Blob([JSON.stringify(bundle)], { type: RECOVERY_MIME });
}

export function decodeLegacyRecoveryBundle(value: unknown): LegacySnapshot {
  if (!isPlainObject(value)
    || !hasExactKeys(value, ['format', 'version', 'capturedAt', 'entries', 'digest'])
    || value.format !== 'doctect.legacy-workspace-recovery'
    || value.version !== 1
    || typeof value.capturedAt !== 'string'
    || typeof value.digest !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.digest)
    || !Array.isArray(value.entries)
    || value.entries.length !== LEGACY_DOCUMENT_KEYS.length) {
    throw new TypeError('Legacy recovery bundle is malformed.');
  }
  const entries = value.entries.map((entry, index) => {
    if (!isPlainObject(entry)
      || !hasExactKeys(entry, ['key', 'present', 'raw'])
      || entry.key !== LEGACY_DOCUMENT_KEYS[index]
      || typeof entry.present !== 'boolean'
      || (entry.present ? typeof entry.raw !== 'string' : entry.raw !== null)) {
      throw new TypeError('Legacy recovery bundle entry is malformed.');
    }
    return [entry.key, { present: entry.present, raw: entry.raw }];
  });
  return structuredClone(Object.fromEntries(entries) as LegacySnapshot);
}

export function createIndexedDbRecoveryBundle(
  workspace: WorkspaceSnapshot,
  capturedAt: string,
): Blob {
  validateTimestamp(capturedAt);
  const bundle: IndexedDbRecoveryBundle = {
    format: 'doctect.indexeddb-workspace-recovery',
    version: 1,
    capturedAt,
    workspace: structuredClone(workspace),
  };
  return new Blob([JSON.stringify(bundle)], { type: RECOVERY_MIME });
}

export async function validateLegacyRecoveryPreparationSources(
  currentSource: LegacySnapshot,
  acceptedSource: LegacySnapshot,
  environment: RecoveryPreparationEnvironment,
): Promise<void> {
  await Promise.all([
    parseLegacySource(structuredClone(currentSource), environment),
    parseLegacySource(structuredClone(acceptedSource), environment),
  ]);
}

export async function prepareLegacyRecovery(
  currentSource: LegacySnapshot,
  currentDigest: string,
  acceptedSource: LegacySnapshot,
  ledger: MigrationLedger,
  records: WorkspaceRecords,
  recoveryId: string,
  environment: RecoveryPreparationEnvironment,
): Promise<PreparedLegacyRecovery> {
  const updatedAt = environment.now();
  validateTimestamp(updatedAt);
  const [current, accepted] = await Promise.all([
    parseLegacySource(structuredClone(currentSource), environment),
    parseLegacySource(structuredClone(acceptedSource), environment),
  ]);

  const usedIds = new Set([
    ...records.projects.map(record => record.id),
    ...records.presets.map(record => record.id),
    ...records.pendingImports.map(record => record.id),
    ...records.pendingImports.map(record => record.pendingImport.targetProjectId),
    ...current.projects.map(item => item.value.id),
    ...accepted.projects.map(item => item.value.id),
    ...current.presets.map(item => item.value.id),
    ...accepted.presets.map(item => item.value.id),
  ]);
  for (const record of records.projects) {
    if (record.consumedImportId) usedIds.add(record.consumedImportId);
  }
  reserveLegacyPendingIdentity(current, currentDigest, usedIds);
  reserveLegacyPendingIdentity(accepted, ledger.acceptedLegacyDigest, usedIds);
  const projects = changedItems(current.projects, accepted.projects).map(item => {
    const id = nextUniqueId('proj_recovered_', usedIds, environment.randomUUID);
    const { cloud: _cloud, ...project } = item.value;
    return {
      id,
      project: {
        ...project,
        id,
        name: `Recovered — ${item.value.name}`,
      },
      incarnation: environment.randomUUID(),
      storageRevision: 0,
      updatedAt,
    } satisfies StoredProject;
  });

  const firstPresetPosition = Math.max(
    -1,
    ...records.presets.map(record => record.position),
  ) + 1;
  const presets = changedItems(current.presets, accepted.presets).map((item, index) => {
    const id = nextUniqueId('preset_recovered_', usedIds, environment.randomUUID);
    return {
      id,
      preset: { ...item.value, id },
      position: firstPresetPosition + index,
    } satisfies StoredPreset;
  });

  const pendingImports: StoredPendingImport[] = [];
  if (current.pendingImport
    && current.pendingImport.digest !== accepted.pendingImport?.digest) {
    const id = nextUniqueId('import_recovered_', usedIds, environment.randomUUID);
    const targetProjectId = nextUniqueId(
      'proj_recovered_import_',
      usedIds,
      environment.randomUUID,
    );
    const { cloud: _cloud, ...input } = current.pendingImport.value;
    const pendingImport: WorkspacePendingImport = preparePendingImport({
      ...input,
      id,
      targetProjectId,
      createdAt: updatedAt,
    }, REJECT_WARNINGS);
    pendingImports.push({
      id,
      pendingImport,
      position: Math.max(
        -1,
        ...records.pendingImports.map(record => record.position),
      ) + 1,
    });
  }

  const backup: LegacyBackupRecord = {
    id: `local-storage-to-indexeddb-v1:conflict:${recoveryId}`,
    kind: 'conflict',
    capturedAt: updatedAt,
    snapshot: structuredClone(currentSource),
    digest: currentDigest,
  };
  const workspace: StoredWorkspace = {
    ...records.workspace,
    projectOrder: [
      ...records.workspace.projectOrder,
      ...projects.map(record => record.id),
    ],
    revision: records.workspace.revision + (projects.length > 0 ? 1 : 0),
  };
  const nextLedger: MigrationLedger = {
    ...ledger,
    ledgerRevision: ledger.ledgerRevision + 1,
    acceptedLegacyDigest: currentDigest,
    acceptedLegacyBackupId: backup.id,
    unresolvedRecovery: null,
  };
  const prepared: PreparedLegacyRecovery = {
    recoveryId,
    observedLegacyDigest: currentDigest,
    expectedLedgerRevision: ledger.ledgerRevision,
    expectedAcceptedLegacyDigest: ledger.acceptedLegacyDigest,
    expectedAcceptedLegacyBackupId: ledger.acceptedLegacyBackupId,
    expectedLedger: structuredClone(ledger),
    expectedRecords: structuredClone(records),
    projects,
    workspace,
    presets,
    pendingImports,
    backup,
    ledger: nextLedger,
  };
  await validatePreparedLegacyRecovery(prepared, environment.crypto.subtle);
  return prepared;
}

export async function validatePreparedLegacyRecovery(
  prepared: PreparedLegacyRecovery,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<void> {
  reconstructWorkspace(structuredClone(prepared.expectedRecords));
  reconstructWorkspace({
    projects: [
      ...structuredClone(prepared.expectedRecords.projects),
      ...structuredClone(prepared.projects),
    ],
    workspace: structuredClone(prepared.workspace),
    presets: [
      ...structuredClone(prepared.expectedRecords.presets),
      ...structuredClone(prepared.presets),
    ],
    pendingImports: [
      ...structuredClone(prepared.expectedRecords.pendingImports),
      ...structuredClone(prepared.pendingImports),
    ],
  });

  const expectedWorkspace: StoredWorkspace = {
    ...prepared.expectedRecords.workspace,
    projectOrder: [
      ...prepared.expectedRecords.workspace.projectOrder,
      ...prepared.projects.map(record => record.id),
    ],
    revision: prepared.expectedRecords.workspace.revision
      + (prepared.projects.length > 0 ? 1 : 0),
  };
  const expectedLedger: MigrationLedger = {
    ...prepared.expectedLedger,
    ledgerRevision: prepared.expectedLedger.ledgerRevision + 1,
    acceptedLegacyDigest: prepared.observedLegacyDigest,
    acceptedLegacyBackupId: prepared.backup.id,
    unresolvedRecovery: null,
  };
  if (prepared.recoveryId.length === 0
    || prepared.expectedLedgerRevision !== prepared.expectedLedger.ledgerRevision
    || prepared.expectedAcceptedLegacyDigest !== prepared.expectedLedger.acceptedLegacyDigest
    || prepared.expectedAcceptedLegacyBackupId
      !== prepared.expectedLedger.acceptedLegacyBackupId
    || prepared.expectedLedger.unresolvedRecovery?.kind !== 'legacy-drift'
    || prepared.expectedLedger.unresolvedRecovery.id !== prepared.recoveryId
    || prepared.expectedLedger.unresolvedRecovery.observedLegacyDigest
      !== prepared.observedLegacyDigest
    || prepared.backup.kind !== 'conflict'
    || prepared.backup.digest !== prepared.observedLegacyDigest
    || !sameCanonicalValue(prepared.workspace, expectedWorkspace)
    || !sameCanonicalValue(prepared.ledger, expectedLedger)
    || await digestLegacySnapshot(prepared.backup.snapshot, subtle)
      !== prepared.observedLegacyDigest) {
    throw new TypeError('Prepared legacy recovery write set is invalid.');
  }
}
