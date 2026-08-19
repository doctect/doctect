// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { digestWorkspaceContent } from '../../../services/localWorkspace/canonical';
import {
  prepareLineageRepair,
  type LineageRepairCandidateRecords,
} from '../../../services/localWorkspace/lineageRepair';
import { prepareInitialCopy } from '../../../services/localWorkspace/migration';
import type {
  HistoricalMigrationLedgerV1,
  StoredProject,
} from '../../../services/localWorkspace/schema';
import {
  deterministicEnvironment,
  legacySnapshot,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const candidate = async () => {
  const initial = await prepareInitialCopy(
    legacySnapshot(validLegacyValues()),
    deterministicEnvironment({ crypto: webcrypto as unknown as Crypto }),
  );
  const projects = structuredClone(initial.projects) as Array<StoredProject | Record<string, unknown>>;
  delete (projects[0] as Partial<StoredProject>).incarnation;
  const ledger = {
    ...structuredClone(initial.ledger),
    indexedDbVersion: 1,
  } as HistoricalMigrationLedgerV1;
  const records: LineageRepairCandidateRecords = {
    projects,
    workspace: structuredClone(initial.workspace),
    presets: structuredClone(initial.presets),
    pendingImports: structuredClone(initial.pendingImports),
  };
  return { initial, ledger, records };
};

describe('version-1 lineage repair preparation', () => {
  it('adds only missing private incarnation and preserves logical content', async () => {
    const fixture = await candidate();
    const before = structuredClone(fixture.records);
    const beforeProjects = structuredClone(fixture.records.projects) as unknown[];
    const randomUUID = vi.fn(() => 'repair-incarnation-a');

    const prepared = await prepareLineageRepair(fixture.ledger, fixture.records, {
      crypto: webcrypto as unknown as Crypto,
      randomUUID,
    });

    expect(fixture.records).toEqual(before);
    expect(prepared.expectedProjects).toEqual([{
      id: fixture.initial.projects[0].id,
      record: beforeProjects[0],
    }]);
    expect(prepared.replacementProjects).toEqual([{
      ...fixture.initial.projects[0],
      incarnation: 'repair-incarnation-a',
    }]);
    expect(prepared.ledger).toEqual({
      ...fixture.ledger,
      indexedDbVersion: 2,
      ledgerRevision: fixture.ledger.ledgerRevision + 1,
    });
    expect(prepared.snapshot.projects).toEqual(
      fixture.initial.projects.map(record => record.project),
    );
    expect(await digestWorkspaceContent(
      prepared.snapshot,
      (webcrypto as unknown as Crypto).subtle,
    )).toBe(fixture.ledger.expectedTargetDigest);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('preserves a valid existing incarnation without rewriting its project', async () => {
    const fixture = await candidate();
    (fixture.records.projects as unknown[])[0] = structuredClone(fixture.initial.projects[0]);

    const prepared = await prepareLineageRepair(fixture.ledger, fixture.records, {
      crypto: webcrypto as unknown as Crypto,
      randomUUID: vi.fn(() => 'unused'),
    });

    expect(prepared.replacementProjects).toEqual([]);
    expect(prepared.expectedProjects[0].record).toEqual(fixture.initial.projects[0]);
  });

  it.each([
    ['empty present incarnation', (record: Record<string, unknown>) => { record.incarnation = ''; }],
    ['non-string present incarnation', (record: Record<string, unknown>) => { record.incarnation = 7; }],
    ['unknown project-record field', (record: Record<string, unknown>) => { record.unknown = true; }],
    ['malformed project payload', (record: Record<string, unknown>) => { record.project = null; }],
  ])('rejects %s without changing input', async (_label, corrupt) => {
    const fixture = await candidate();
    const record = (fixture.records.projects as Record<string, unknown>[])[0];
    corrupt(record);
    const before = structuredClone(fixture.records);

    await expect(prepareLineageRepair(fixture.ledger, fixture.records, {
      crypto: webcrypto as unknown as Crypto,
      randomUUID: () => 'repair-incarnation-a',
    })).rejects.toMatchObject({ category: 'target-invalid' });
    expect(fixture.records).toEqual(before);
  });

  it('rejects empty generated incarnation and digest mismatch', async () => {
    const empty = await candidate();
    await expect(prepareLineageRepair(empty.ledger, empty.records, {
      crypto: webcrypto as unknown as Crypto,
      randomUUID: () => '',
    })).rejects.toMatchObject({ category: 'target-invalid' });

    const mismatched = await candidate();
    mismatched.ledger.expectedTargetDigest = 'f'.repeat(64);
    await expect(prepareLineageRepair(mismatched.ledger, mismatched.records, {
      crypto: webcrypto as unknown as Crypto,
      randomUUID: () => 'repair-incarnation-a',
    })).rejects.toMatchObject({ category: 'verification-failed' });
  });
});
