// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../../../services/migration';
import {
  canonicalStringify,
  digestLegacySnapshot,
  digestWorkspaceContent,
  sha256Hex,
} from '../../../services/localWorkspace/canonical';
import {
  prepareInitialCopy,
  reconstructWorkspace,
  verifyPreparedCopy,
  type PreparedInitialCopy,
  type WorkspaceRecords,
} from '../../../services/localWorkspace/migration';
import {
  LEGACY_KEYS,
  currentState,
  deterministicEnvironment,
  historicalState,
  legacyCustomPreset,
  legacyPendingImport,
  legacyProject,
  legacySnapshot,
  secondProject,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const testSubtle = webcrypto.subtle as unknown as SubtleCrypto;

beforeAll(() => Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
}));

afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const sourceFrom = (values: Partial<Record<string, string>> = {}) =>
  legacySnapshot(values as Partial<Record<keyof ReturnType<typeof legacySnapshot>, string>>);

const validSource = () => sourceFrom(validLegacyValues());

const recordsFrom = (prepared: PreparedInitialCopy): WorkspaceRecords => ({
  projects: structuredClone(prepared.projects),
  workspace: structuredClone(prepared.workspace),
  presets: structuredClone(prepared.presets),
  pendingImports: structuredClone(prepared.pendingImports),
});

describe('initial migration preparation', () => {
  it('preserves ordered complete project wrappers and migrates state content', async () => {
    const first = legacyProject('project-a', 9);
    const second = secondProject(11);
    const source = sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.projects]: JSON.stringify([first, second]),
      [LEGACY_KEYS.activeProject]: 'project-b',
    });
    const before = structuredClone(source);

    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));

    expect(prepared.origin).toBe('legacy');
    expect(prepared.source).toEqual(before);
    expect(source).toEqual(before);
    expect(prepared.workspace).toEqual({
      id: 'current',
      projectOrder: ['project-a', 'project-b'],
      activeProjectId: 'project-b',
      revision: 0,
    });
    expect(prepared.projects.map(record => record.id)).toEqual(['project-a', 'project-b']);
    expect(prepared.projects.map(record => record.incarnation))
      .toEqual(['fixture-uuid', 'fixture-uuid']);
    expect(prepared.projects.every(record => record.storageRevision === 0)).toBe(true);
    expect(prepared.projects.every(record => record.updatedAt === '2026-08-14T15:00:00.000Z'))
      .toBe(true);
    expect(prepared.projects[0].project).toMatchObject({
      name: 'Café project ☕',
      cloud: { projectId: 'cloud-project-a', lastSyncedCommitId: 'commit-project-a' },
      revision: 4,
      retainedWrapperField: { source: 'legacy' },
    });
    expect(prepared.projects[0].project.initialState.generator)
      .toEqual(first.initialState.generator);
    expect(prepared.projects[0].project.initialState.nodes.root.data.label).toBe('Café ☕');
    expect(prepared.projects[0].project.initialState.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('assigns one private incarnation to every migrated project record', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('incarnation-a')
      .mockReturnValueOnce('incarnation-b');
    const source = sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    });

    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
      randomUUID,
    }));

    expect(prepared.projects.map(record => record.incarnation))
      .toEqual(['incarnation-a', 'incarnation-b']);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it('migrates every historical project state in source order', async () => {
    const projects = Array.from({ length: CURRENT_SCHEMA_VERSION + 1 }, (_, version) =>
      legacyProject(`project-${version}`, version, { cloud: undefined, revision: version }));
    const source = sourceFrom({
      [LEGACY_KEYS.projects]: JSON.stringify(projects),
      [LEGACY_KEYS.activeProject]: '',
    });

    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));

    expect(prepared.workspace.projectOrder).toEqual(projects.map(project => project.id));
    expect(prepared.workspace.activeProjectId).toBe('project-0');
    expect(prepared.projects.map(record => record.project.initialState.schemaVersion))
      .toEqual(projects.map(() => CURRENT_SCHEMA_VERSION));
  });

  it('preserves preset order and uses accumulated IDs for duplicate detection', async () => {
    const presets = [legacyCustomPreset('preset-b', 5), legacyCustomPreset('preset-a', 11)];
    const prepared = await prepareInitialCopy(sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.customPresets]: JSON.stringify(presets),
    }), deterministicEnvironment({ crypto: webcrypto as Crypto }));

    expect(prepared.presets.map(record => ({ id: record.id, position: record.position })))
      .toEqual([{ id: 'preset-b', position: 0 }, { id: 'preset-a', position: 1 }]);
    expect(prepared.presets[0].preset.retainedPresetField).toEqual(['one', 'two']);
    expect(prepared.presets[0].preset.initialState.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    await expect(prepareInitialCopy(sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.customPresets]: JSON.stringify([
        legacyCustomPreset('same'),
        legacyCustomPreset('same'),
      ]),
    }), deterministicEnvironment({ crypto: webcrypto as Crypto })))
      .rejects.toMatchObject({ affectedKey: LEGACY_KEYS.customPresets });
  });

  it('converts the singleton pending import with stable and deterministic IDs', async () => {
    const source = validSource();
    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const expectedTarget = `proj_migrated_import_${prepared.sourceDigest.slice(0, 16)}`;

    expect(prepared.pendingImports).toHaveLength(1);
    expect(prepared.pendingImports[0]).toMatchObject({
      id: 'legacy-import-v1',
      position: 0,
      pendingImport: {
        id: 'legacy-import-v1',
        targetProjectId: expectedTarget,
        name: 'Imported 😀',
        cloud: { projectId: 'cloud-import', lastSyncedCommitId: 'commit-import' },
        createdAt: '2026-08-14T15:00:00.000Z',
        warnings: [],
      },
    });
    expect(prepared.pendingImports[0].pendingImport.state.schemaVersion)
      .toBe(CURRENT_SCHEMA_VERSION);
  });

  it('appends the first ascending suffix when deterministic import target IDs collide', async () => {
    const digestBytes = Uint8Array.from({ length: 32 }, () => 0xab);
    const crypto = {
      subtle: {
        digest: vi.fn(async () => digestBytes.buffer.slice(0)),
      },
    } as unknown as Crypto;
    const base = 'proj_migrated_import_abababababababab';
    const source = sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject(base),
        legacyProject(`${base}_1`),
      ]),
      [LEGACY_KEYS.activeProject]: base,
    });

    const prepared = await prepareInitialCopy(source, deterministicEnvironment({ crypto }));

    expect(prepared.pendingImports[0].pendingImport.targetProjectId).toBe(`${base}_2`);
  });

  it('creates one fresh usable blank project for missing or empty project sources', async () => {
    for (const source of [
      sourceFrom({ [LEGACY_KEYS.customPresets]: JSON.stringify([legacyCustomPreset()]) }),
      sourceFrom({ [LEGACY_KEYS.projects]: '[]' }),
    ]) {
      const prepared = await prepareInitialCopy(source, deterministicEnvironment({
        crypto: webcrypto as Crypto,
      }));
      expect(prepared.projects).toHaveLength(1);
      expect(prepared.projects[0].project).toMatchObject({
        id: 'proj_fixture-uuid',
        name: 'Blank Project',
        initialState: currentState(),
      });
      expect(prepared.workspace.projectOrder).toEqual(['proj_fixture-uuid']);
      expect(prepared.workspace.activeProjectId).toBe('proj_fixture-uuid');
      expect(prepared.ledger.counts.sourceProjects).toBe(0);
      expect(prepared.ledger.counts.targetProjects).toBe(1);
    }
  });

  it('distinguishes presets-only legacy migration from all-absent native initialization', async () => {
    const environment = deterministicEnvironment({ crypto: webcrypto as Crypto });
    const presetsOnly = await prepareInitialCopy(sourceFrom({
      [LEGACY_KEYS.customPresets]: JSON.stringify([legacyCustomPreset()]),
    }), environment);
    const native = await prepareInitialCopy(legacySnapshot(), environment);

    expect(presetsOnly.origin).toBe('legacy');
    expect(presetsOnly.receipt).toMatchObject({
      id: `local-storage-to-indexeddb-v1:${presetsOnly.sourceDigest}`,
      projectCount: 0,
      customPresetCount: 1,
      pendingImportPreserved: false,
      migratedAt: '2026-08-14T15:00:00.000Z',
    });
    expect(native.origin).toBe('native');
    expect(native.receipt).toBeUndefined();
    expect(native.source).toEqual(legacySnapshot());
  });

  it('builds exact source fingerprints, backup metadata, digests, and copied ledger', async () => {
    const source = validSource();
    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const rawProject = JSON.parse(source[LEGACY_KEYS.projects].raw!)[0];
    const rawPreset = JSON.parse(source[LEGACY_KEYS.customPresets].raw!)[0];

    expect(prepared.sourceDigest).toBe(await digestLegacySnapshot(source, testSubtle));
    expect(prepared.ledger.keyFingerprints).toEqual(await Promise.all(
      Object.values(LEGACY_KEYS).map(async key => ({
        key,
        present: source[key].present,
        digest: await sha256Hex(source[key].raw ?? '', testSubtle),
      })),
    ));
    expect(prepared.ledger.projectFingerprints).toEqual([{
      sourceIndex: 0,
      id: 'project-a',
      digest: await sha256Hex(canonicalStringify(rawProject), testSubtle),
    }]);
    expect(prepared.ledger.presetFingerprints).toEqual([{
      sourceIndex: 0,
      id: 'preset-a',
      digest: await sha256Hex(canonicalStringify(rawPreset), testSubtle),
    }]);
    expect(prepared.backup).toMatchObject({
      kind: 'original',
      capturedAt: '2026-08-14T15:00:00.000Z',
      snapshot: source,
      digest: prepared.sourceDigest,
    });
    expect(prepared.ledger).toMatchObject({
      state: 'copied',
      ledgerRevision: 0,
      sourceDigest: prepared.sourceDigest,
      expectedTargetDigest: prepared.targetDigest,
      acceptedLegacyDigest: prepared.sourceDigest,
      originalLegacyBackupId: prepared.backup.id,
      acceptedLegacyBackupId: prepared.backup.id,
      verifiedAt: null,
      unresolvedRecovery: null,
    });
  });

  it.each([
    [LEGACY_KEYS.projects, ''],
    [LEGACY_KEYS.projects, '{'],
    [LEGACY_KEYS.projects, '{}'],
    [LEGACY_KEYS.customPresets, '[{"id":"same"},{"id":"same"}]'],
    [LEGACY_KEYS.pendingImport, 'null'],
  ])('rejects invalid legacy %s without producing target records', async (key, raw) => {
    const source = legacySnapshot({ ...validLegacyValues(), [key]: raw });
    await expect(prepareInitialCopy(source, deterministicEnvironment({ crypto: webcrypto as Crypto })))
      .rejects.toMatchObject({ affectedKey: key });
  });

  it.each([
    ['duplicate project IDs', LEGACY_KEYS.projects, JSON.stringify([
      legacyProject('same'), legacyProject('same'),
    ])],
    ['empty project ID', LEGACY_KEYS.projects, JSON.stringify([legacyProject('', 11)])],
    ['malformed project state', LEGACY_KEYS.projects, JSON.stringify([
      legacyProject('bad', 11, { initialState: null }),
    ])],
    ['unresolved active project', LEGACY_KEYS.activeProject, 'missing'],
    ['empty preset ID', LEGACY_KEYS.customPresets, JSON.stringify([
      legacyCustomPreset('', 11),
    ])],
    ['malformed preset state', LEGACY_KEYS.customPresets, JSON.stringify([
      legacyCustomPreset('bad', 11, { initialState: null }),
    ])],
    ['future project schema', LEGACY_KEYS.projects, JSON.stringify([
      legacyProject('future', 11, {
        initialState: { ...currentState(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
      }),
    ])],
    ['unknown pending field', LEGACY_KEYS.pendingImport, JSON.stringify({
      ...legacyPendingImport(), unknown: true,
    })],
  ])('rejects %s with the affected legacy key', async (_label, key, raw) => {
    await expect(prepareInitialCopy(sourceFrom({
      ...validLegacyValues(),
      [key]: raw,
    }), deterministicEnvironment({ crypto: webcrypto as Crypto })))
      .rejects.toMatchObject({ affectedKey: key });
  });

  it.each([
    ['non-object generator', null],
    ['unsupported format', { formatVersion: 2 }],
    ['non-text template source', {
      formatVersion: 1, templateScript: 42, hierarchyScript: '', generatedAt: '2026-08-14T00:00:00.000Z',
    }],
    ['non-text hierarchy source', {
      formatVersion: 1, templateScript: '', hierarchyScript: 42, generatedAt: '2026-08-14T00:00:00.000Z',
    }],
    ['oversized template source', {
      formatVersion: 1, templateScript: 'x'.repeat(512 * 1024 + 1), hierarchyScript: '', generatedAt: '2026-08-14T00:00:00.000Z',
    }],
    ['oversized hierarchy source', {
      formatVersion: 1, templateScript: '', hierarchyScript: 'x'.repeat(512 * 1024 + 1), generatedAt: '2026-08-14T00:00:00.000Z',
    }],
    ['invalid generation time', {
      formatVersion: 1, templateScript: '', hierarchyScript: '', generatedAt: 'not-a-date',
    }],
  ])('rejects loader warning: %s', async (_label, generator) => {
    const state = { ...historicalState(8), generator };
    await expect(prepareInitialCopy(sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.projects]: JSON.stringify([
        legacyProject('warning', 8, { initialState: state }),
      ]),
    }), deterministicEnvironment({ crypto: webcrypto as Crypto })))
      .rejects.toMatchObject({ affectedKey: LEGACY_KEYS.projects });
  });
});

describe('target reconstruction', () => {
  it('reconstructs one independently validated ordered workspace snapshot', async () => {
    const prepared = await prepareInitialCopy(validSource(), deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));

    const reconstructed = reconstructWorkspace(recordsFrom(prepared));

    expect(reconstructed.projects).toEqual(prepared.projects.map(record => record.project));
    expect(reconstructed.activeProjectId).toBe(prepared.workspace.activeProjectId);
    expect(reconstructed.customPresets).toEqual(prepared.presets.map(record => record.preset));
    expect(reconstructed.pendingImports)
      .toEqual(prepared.pendingImports.map(record => record.pendingImport));
  });

  it.each([
    ['missing workspace', (records: any) => { records.workspace = undefined; }],
    ['missing ordered project', (records: any) => { records.projects.pop(); }],
    ['extra project', (records: any) => {
      const extra = structuredClone(records.projects[0]);
      extra.id = 'extra';
      extra.project.id = 'extra';
      records.projects.push(extra);
    }],
    ['duplicate project record', (records: any) => {
      records.projects.push(structuredClone(records.projects[0]));
      records.workspace.projectOrder.push(records.projects[0].id);
    }],
    ['duplicate order reference', (records: any) => {
      records.workspace.projectOrder.push(records.workspace.projectOrder[0]);
    }],
    ['unknown active project', (records: any) => { records.workspace.activeProjectId = 'missing'; }],
    ['missing project incarnation', (records: any) => { delete records.projects[0].incarnation; }],
    ['empty project incarnation', (records: any) => { records.projects[0].incarnation = ''; }],
    ['negative storage revision', (records: any) => { records.projects[0].storageRevision = -1; }],
    ['fractional workspace revision', (records: any) => { records.workspace.revision = 0.5; }],
    ['malformed project state', (records: any) => { records.projects[0].project.initialState = {}; }],
    ['invalid preset position', (records: any) => { records.presets[0].position = 0.5; }],
    ['duplicate preset record', (records: any) => { records.presets.push(structuredClone(records.presets[0])); }],
    ['invalid pending position', (records: any) => { records.pendingImports[0].position = -1; }],
    ['unknown pending payload field', (records: any) => {
      records.pendingImports[0].pendingImport.unknown = true;
    }],
  ])('rejects %s', async (_label, corrupt) => {
    const prepared = await prepareInitialCopy(validSource(), deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const records: any = recordsFrom(prepared);
    corrupt(records);

    expect(() => reconstructWorkspace(records)).toThrow();
  });

  it('validates private consume provenance without exposing or hashing it publicly', async () => {
    const prepared = await prepareInitialCopy(validSource(), deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const withoutProvenance = recordsFrom(prepared);
    const withProvenance: any = recordsFrom(prepared);
    withProvenance.projects[0].consumedImportId = 'import-1';
    withProvenance.projects[0].consumedImportCreatedAt = '2026-08-15T12:00:00.000Z';
    withProvenance.projects[0].consumedImportDigest = 'a'.repeat(64);

    const publicWithout = reconstructWorkspace(withoutProvenance);
    const publicWith = reconstructWorkspace(withProvenance);

    expect(publicWith).toEqual(publicWithout);
    expect(Object.hasOwn(publicWith.projects[0], 'consumedImportId')).toBe(false);
    expect(Object.hasOwn(publicWith.projects[0], 'consumedImportCreatedAt')).toBe(false);
    expect(Object.hasOwn(publicWith.projects[0], 'consumedImportDigest')).toBe(false);
    expect(Object.hasOwn(publicWith.projects[0], 'incarnation')).toBe(false);
    expect(Object.hasOwn(publicWith.projects[0], 'storageRevision')).toBe(false);
    await expect(digestWorkspaceContent(publicWith, testSubtle))
      .resolves.toBe(await digestWorkspaceContent(publicWithout, testSubtle));
  });

  it('rejects empty and duplicate private consume provenance', async () => {
    const source = sourceFrom({
      ...validLegacyValues(),
      [LEGACY_KEYS.projects]: JSON.stringify([legacyProject(), secondProject()]),
    });
    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const empty: any = recordsFrom(prepared);
    empty.projects[0].consumedImportId = '';
    expect(() => reconstructWorkspace(empty)).toThrow(/non-empty/i);

    const undefinedValue: any = recordsFrom(prepared);
    undefinedValue.projects[0].consumedImportId = undefined;
    expect(() => reconstructWorkspace(undefinedValue)).toThrow(/non-empty/i);

    const duplicate: any = recordsFrom(prepared);
    duplicate.projects[0].consumedImportId = 'same-import';
    duplicate.projects[1].consumedImportId = 'same-import';
    expect(() => reconstructWorkspace(duplicate)).toThrow(/duplicate.*consume/i);

    const orphanDigest: any = recordsFrom(prepared);
    orphanDigest.projects[0].consumedImportDigest = 'a'.repeat(64);
    expect(() => reconstructWorkspace(orphanDigest)).toThrow(/digest.*requires/i);

    const missingTimestamp: any = recordsFrom(prepared);
    missingTimestamp.projects[0].consumedImportId = 'import-with-digest';
    missingTimestamp.projects[0].consumedImportDigest = 'a'.repeat(64);
    expect(() => reconstructWorkspace(missingTimestamp)).toThrow(/digest.*createdAt/i);

    const malformedDigest: any = recordsFrom(prepared);
    malformedDigest.projects[0].consumedImportId = 'import-with-bad-digest';
    malformedDigest.projects[0].consumedImportCreatedAt = '2026-08-15T12:00:00.000Z';
    malformedDigest.projects[0].consumedImportDigest = 'not-a-sha256-digest';
    expect(() => reconstructWorkspace(malformedDigest)).toThrow(/digest.*sha-256/i);
  });
});

describe('prepared-copy verification', () => {
  it('returns the reconstructed snapshot when target and current source match the ledger', async () => {
    const source = validSource();
    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));

    const verified = await verifyPreparedCopy(prepared, recordsFrom(prepared), source);

    expect(verified).toEqual(reconstructWorkspace(recordsFrom(prepared)));
  });

  it('rejects exact retained-source drift', async () => {
    const source = validSource();
    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const changed = structuredClone(source);
    changed[LEGACY_KEYS.projects].raw += ' ';

    await expect(verifyPreparedCopy(prepared, recordsFrom(prepared), changed))
      .rejects.toMatchObject({ category: 'verification-failed' });
  });

  it('rejects independently valid target content and ledger-count mismatches', async () => {
    const source = validSource();
    const prepared = await prepareInitialCopy(source, deterministicEnvironment({
      crypto: webcrypto as Crypto,
    }));
    const changedRecords = recordsFrom(prepared);
    changedRecords.projects[0].project.name = 'Changed';
    await expect(verifyPreparedCopy(prepared, changedRecords, source))
      .rejects.toMatchObject({ category: 'verification-failed' });

    const changedLedger = structuredClone(prepared);
    changedLedger.ledger.counts.targetProjects += 1;
    await expect(verifyPreparedCopy(changedLedger, recordsFrom(prepared), source))
      .rejects.toMatchObject({ category: 'verification-failed' });
  });
});
