import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../../../services/migration';
import {
  PERSISTENCE_ROLLOUT_EPOCH,
  WORKSPACE_DB_NAME,
  WORKSPACE_DB_VERSION,
  WORKSPACE_MIGRATION_ID,
} from '../../../services/localWorkspace/schema';
import {
  preparePendingImport,
  prepareProjectState,
  validateCustomPreset,
  validateMigratedState,
  validateWorkspaceProject,
} from '../../../services/localWorkspace/validation';
import {
  LEGACY_KEYS,
  currentState,
  historicalState,
  legacySnapshot,
  workspaceSnapshot,
} from '../../helpers/localWorkspaceFixtures';

const rejectWarnings = { warningPolicy: 'reject' as const };
const noExistingPresetIds = () => ({
  ...rejectWarnings,
  existingIds: new Set<string>(),
});

const project = () => ({
  id: 'project-1',
  name: '',
  initialState: currentState(),
  cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'commit-1' },
  revision: 0,
  retained: { nested: ['value'] },
});

const preset = () => ({
  id: 'preset-1',
  title: '',
  desc: 'Description',
  color: 'text-amber-500',
  isCustom: true as const,
  initialState: currentState(),
  retained: { source: 'legacy' },
});

const pendingImport = () => ({
  id: 'import-1',
  targetProjectId: 'project-imported',
  name: '',
  state: currentState(),
  cloud: { projectId: 'cloud-import', lastSyncedCommitId: 'commit-import' },
  createdAt: '2026-08-14T12:34:56.000Z',
});

describe('foundational contracts and fixtures', () => {
  it('pins database and rollout constants', () => {
    expect(WORKSPACE_DB_NAME).toBe('doctect-local-workspace');
    expect(WORKSPACE_DB_VERSION).toBe(1);
    expect(WORKSPACE_MIGRATION_ID).toBe('local-storage-to-indexeddb-v1');
    expect(PERSISTENCE_ROLLOUT_EPOCH).toBe(1);
  });

  it('returns fresh values from every fixture builder', () => {
    const state = currentState();
    state.nodes.root.title = 'changed';
    expect(currentState().nodes.root.title).toBe('Racine 根');

    const workspace = workspaceSnapshot();
    workspace.projects[0].name = 'changed';
    expect(workspaceSnapshot().projects[0].name).toBe('Café project ☕');

    const legacy = legacySnapshot();
    legacy[LEGACY_KEYS.projects].present = true;
    expect(legacySnapshot()[LEGACY_KEYS.projects].present).toBe(false);
  });
});

describe('strict project-state preparation', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it.each(Array.from({ length: 12 }, (_, version) => [version]))(
    'prepares supported historical schema v%s without mutating it',
    version => {
      const input = historicalState(version);
      const before = structuredClone(input);

      const prepared = prepareProjectState(input, rejectWarnings);

      expect(prepared.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(prepared.state.nodes.root.data.label).toBe('Café ☕');
      expect(prepared.warnings).toEqual([]);
      expect(input).toEqual(before);
      expect(prepared.state).not.toBe(input);
    },
  );

  it('rejects future project schema before loadProjectState can pass it through', () => {
    expect(() => prepareProjectState({
      ...currentState(),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    }, rejectWarnings)).toThrow(/future schema/i);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['text', '11'],
  ])('rejects %s schema versions', (_label, schemaVersion) => {
    expect(() => prepareProjectState({ ...currentState(), schemaVersion }, rejectWarnings))
      .toThrow(/schemaVersion/i);
  });

  it.each([
    ['v10 textOverflow', 10, { textOverflow: 'truncate' }],
    ['v10 textWrap', 10, { textWrap: 'true' }],
    ['v11 textPadding', 11, { textPadding: { top: -1, right: 0, bottom: 0, left: 0 } }],
  ])('rejects malformed current fields before normalization: %s', (_label, version, fields) => {
    const state = historicalState(version);
    Object.assign(state.variants.default.templates.page.elements[0], fields);
    expect(() => prepareProjectState(state, rejectWarnings)).toThrow(/textOverflow|textWrap|textPadding/);
  });

  it('rejects every data-detaching loader warning during migration', () => {
    expect(() => prepareProjectState({
      ...historicalState(8),
      generator: { formatVersion: 2 },
    }, rejectWarnings)).toThrow(/detached/i);
  });

  it('retains loader warnings only when explicitly requested', () => {
    const prepared = prepareProjectState({
      ...historicalState(8),
      generator: { formatVersion: 2 },
    }, { warningPolicy: 'retain' });

    expect(prepared.state.generator).toBeUndefined();
    expect(prepared.warnings).toEqual([
      'Saved generator was detached: Unsupported generator format version.',
    ]);
  });

  it('rejects structurally invalid migrated state and active-variant mismatch', () => {
    expect(() => prepareProjectState({ ...historicalState(9), rootId: 'missing' }, rejectWarnings))
      .toThrow(/rootId/);
    expect(() => prepareProjectState({
      ...currentState(),
      activeVariantId: 'missing',
    }, rejectWarnings)).toThrow(/activeVariantId/);
  });

  it('requires strict JSON-compatible plain objects', () => {
    const cyclic = currentState() as unknown as Record<string, unknown>;
    cyclic.cycle = cyclic;
    const custom = Object.assign(Object.create({ inherited: true }), currentState());

    expect(() => prepareProjectState(cyclic, rejectWarnings)).toThrow(/JSON-compatible/);
    expect(() => prepareProjectState(custom, rejectWarnings)).toThrow(/plain|JSON-compatible/);
  });

  it('validates only already-current output at the migrated-state seam', () => {
    expect(validateMigratedState(currentState()).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => validateMigratedState(historicalState(10))).toThrow(/current schema/i);
  });
});

describe('workspace wrapper validation', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('preserves empty project names, cloud metadata, revisions, and unknown JSON fields', () => {
    const input = project();
    const validated = validateWorkspaceProject(input, rejectWarnings);

    expect(validated).toEqual(input);
    expect(validated.name).toBe('');
    expect(validated.retained).toEqual({ nested: ['value'] });
    expect(validated).not.toBe(input);
    expect(validated.initialState).not.toBe(input.initialState);
  });

  it.each([
    ['empty id', { id: '' }],
    ['non-string name', { name: 42 }],
    ['negative revision', { revision: -1 }],
    ['fractional revision', { revision: 1.5 }],
    ['non-object cloud', { cloud: null }],
    ['non-string cloud project', { cloud: { projectId: 1, lastSyncedCommitId: 'commit' } }],
    ['missing cloud commit', { cloud: { projectId: 'cloud' } }],
  ])('rejects malformed projects with %s', (_label, override) => {
    expect(() => validateWorkspaceProject({ ...project(), ...override }, rejectWarnings)).toThrow();
  });

  it('validates custom presets and preserves unknown JSON fields', () => {
    const input = preset();
    const validated = validateCustomPreset(input, noExistingPresetIds());

    expect(validated).toEqual(input);
    expect(validated.title).toBe('');
    expect(validated.retained).toEqual({ source: 'legacy' });
  });

  it('requires explicit preset-ID uniqueness context', () => {
    // @ts-expect-error Preset validation must be fail-closed when uniqueness context is omitted.
    expect(() => validateCustomPreset(preset())).toThrow(/existingIds|uniqueness context/i);
  });

  it('rejects duplicate and malformed custom-preset IDs', () => {
    expect(() => validateCustomPreset(preset(), {
      ...rejectWarnings,
      existingIds: new Set(['preset-1']),
    })).toThrow(/duplicate/i);
    expect(() => validateCustomPreset({ ...preset(), id: '' }, noExistingPresetIds())).toThrow(/id/i);
  });

  it.each([
    ['title', { title: 1 }],
    ['description', { desc: null }],
    ['color', { color: 42 }],
    ['custom marker', { isCustom: false }],
  ])('rejects malformed custom-preset %s', (_label, override) => {
    expect(() => validateCustomPreset({ ...preset(), ...override }, noExistingPresetIds())).toThrow();
  });
});

describe('pending import preparation', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('returns prepared state, exact metadata, and warnings', () => {
    const input = pendingImport();
    const prepared = preparePendingImport(input, rejectWarnings);

    expect(prepared).toEqual({ ...input, state: input.state, warnings: [] });
    expect(prepared.state).not.toBe(input.state);
  });

  it('retains data-detachment warnings for an explicitly retain-policy import', () => {
    const prepared = preparePendingImport({
      ...pendingImport(),
      state: {
        ...historicalState(8),
        generator: { formatVersion: 2 },
      },
    }, { warningPolicy: 'retain' });

    expect(prepared.state.generator).toBeUndefined();
    expect(prepared.warnings[0]).toMatch(/detached/i);
  });

  it.each([
    ['empty import ID', { id: '' }],
    ['empty target ID', { targetProjectId: '' }],
    ['non-string name', { name: 1 }],
    ['non-canonical timestamp', { createdAt: '2026-08-14' }],
    ['invalid timestamp', { createdAt: 'not-a-date' }],
    ['malformed cloud', { cloud: { projectId: 'cloud', lastSyncedCommitId: 1 } }],
  ])('rejects %s', (_label, override) => {
    expect(() => preparePendingImport({ ...pendingImport(), ...override }, rejectWarnings)).toThrow();
  });
});
