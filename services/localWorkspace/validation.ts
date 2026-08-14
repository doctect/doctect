import type { AppState } from '../../types';
import { validateAppState } from '../../shared/validateAppState.js';
import { loadProjectState, type ProjectLoadResult } from '../loadProjectState';
import { CURRENT_SCHEMA_VERSION } from '../migration';
import { canonicalStringify } from './canonical';
import type {
  WorkspaceCustomPreset,
  WorkspacePendingImport,
  WorkspaceProject,
} from './contracts';

export interface ProjectPreparationOptions {
  warningPolicy: 'reject' | 'retain';
}

export interface CustomPresetValidationOptions extends ProjectPreparationOptions {
  existingIds: ReadonlySet<string>;
}

const DEFAULT_PREPARATION_OPTIONS: ProjectPreparationOptions = { warningPolicy: 'reject' };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const cloneJsonObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object.`);
  try {
    canonicalStringify(value);
  } catch (error) {
    throw new Error(`${label} must be JSON-compatible: ${(error as Error).message}`, { cause: error });
  }
  return structuredClone(value);
};

const requireNonEmptyString: (
  value: unknown,
  label: string,
) => asserts value is string = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
};

const validateCloud = (value: unknown, label: string): void => {
  if (value === undefined) return;
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  if (typeof value.projectId !== 'string' || typeof value.lastSyncedCommitId !== 'string') {
    throw new Error(`${label} projectId and lastSyncedCommitId must be strings.`);
  }
};

const validateActiveVariant = (state: Record<string, unknown>): void => {
  if (typeof state.activeVariantId !== 'string'
    || !isPlainObject(state.variants)
    || !Object.hasOwn(state.variants, state.activeVariantId)) {
    throw new Error('activeVariantId must reference an existing variant.');
  }
};

const validateWarningPolicy = (options: ProjectPreparationOptions): void => {
  if (options.warningPolicy !== 'reject' && options.warningPolicy !== 'retain') {
    throw new Error('warningPolicy must be reject or retain.');
  }
};

export function validateMigratedState(state: unknown): AppState {
  const cloned = cloneJsonObject(state, 'Migrated project state');
  if (cloned.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Migrated project state must use current schema ${CURRENT_SCHEMA_VERSION}.`);
  }
  const result = validateAppState(cloned);
  if (!result.ok) throw new Error(`Migrated project state is invalid: ${result.error}`);
  validateActiveVariant(cloned);
  canonicalStringify(cloned);
  return cloned as unknown as AppState;
}

export function prepareProjectState(
  raw: unknown,
  options: ProjectPreparationOptions,
): ProjectLoadResult {
  validateWarningPolicy(options);
  const source = cloneJsonObject(raw, 'Project state');
  const schemaVersion = Object.hasOwn(source, 'schemaVersion') ? source.schemaVersion : 0;
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 0) {
    throw new Error('Project state schemaVersion must be a non-negative integer.');
  }
  if ((schemaVersion as number) > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Cannot load future schema version ${schemaVersion}.`);
  }

  if ((schemaVersion as number) >= 10) {
    const sourceResult = validateAppState(source);
    if (!sourceResult.ok) {
      throw new Error(`Project state is invalid before migration: ${sourceResult.error}`);
    }
    validateActiveVariant(source);
  }

  const loaded = loadProjectState(structuredClone(source));
  if (options.warningPolicy === 'reject' && loaded.warnings.length > 0) {
    throw new Error(loaded.warnings.join(' '));
  }
  return {
    state: validateMigratedState(loaded.state),
    warnings: [...loaded.warnings],
  };
}

export function validateWorkspaceProject(
  raw: unknown,
  options: ProjectPreparationOptions = DEFAULT_PREPARATION_OPTIONS,
): WorkspaceProject {
  const project = cloneJsonObject(raw, 'Workspace project');
  requireNonEmptyString(project.id, 'Workspace project id');
  if (typeof project.name !== 'string') throw new Error('Workspace project name must be a string.');
  validateCloud(project.cloud, 'Workspace project cloud metadata');
  if (project.revision !== undefined
    && (!Number.isInteger(project.revision) || (project.revision as number) < 0)) {
    throw new Error('Workspace project revision must be a non-negative integer.');
  }
  const prepared = prepareProjectState(project.initialState, options);
  return { ...project, initialState: prepared.state } as WorkspaceProject;
}

export function validateCustomPreset(
  raw: unknown,
  options: CustomPresetValidationOptions,
): WorkspaceCustomPreset {
  if (!options?.existingIds || typeof options.existingIds.has !== 'function') {
    throw new Error('Custom preset validation requires existingIds uniqueness context.');
  }
  const preset = cloneJsonObject(raw, 'Custom preset');
  requireNonEmptyString(preset.id, 'Custom preset id');
  if (options.existingIds.has(preset.id)) {
    throw new Error(`Duplicate custom preset id: ${preset.id}.`);
  }
  if (typeof preset.title !== 'string') throw new Error('Custom preset title must be a string.');
  if (typeof preset.desc !== 'string') throw new Error('Custom preset description must be a string.');
  if (preset.color !== undefined && typeof preset.color !== 'string') {
    throw new Error('Custom preset color must be a string.');
  }
  if (preset.isCustom !== true) throw new Error('Custom preset isCustom must be true.');
  const prepared = prepareProjectState(preset.initialState, options);
  return { ...preset, initialState: prepared.state } as WorkspaceCustomPreset;
}

const PENDING_IMPORT_KEYS = new Set([
  'id',
  'targetProjectId',
  'name',
  'state',
  'cloud',
  'createdAt',
]);

export function preparePendingImport(
  raw: unknown,
  options: ProjectPreparationOptions,
): WorkspacePendingImport {
  const input = cloneJsonObject(raw, 'Pending import');
  const unknownKey = Object.keys(input).find(key => !PENDING_IMPORT_KEYS.has(key));
  if (unknownKey) throw new Error(`Pending import contains unknown field: ${unknownKey}.`);
  requireNonEmptyString(input.id, 'Pending import id');
  requireNonEmptyString(input.targetProjectId, 'Pending import targetProjectId');
  if (typeof input.name !== 'string') throw new Error('Pending import name must be a string.');
  validateCloud(input.cloud, 'Pending import cloud metadata');
  if (typeof input.createdAt !== 'string') {
    throw new Error('Pending import createdAt must be an ISO timestamp.');
  }
  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== input.createdAt) {
    throw new Error('Pending import createdAt must be a canonical ISO timestamp.');
  }

  const prepared = prepareProjectState(input.state, options);
  return {
    id: input.id,
    targetProjectId: input.targetProjectId,
    name: input.name,
    ...(input.cloud === undefined ? {} : { cloud: input.cloud }),
    createdAt: input.createdAt,
    state: prepared.state,
    warnings: prepared.warnings,
  } as WorkspacePendingImport;
}
