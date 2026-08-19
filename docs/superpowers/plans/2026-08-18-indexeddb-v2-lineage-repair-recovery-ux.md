# IndexedDB v2 Lineage Repair and Recovery UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade local workspace storage to IndexedDB version 2, atomically repair exact historical project records missing private incarnation metadata, and replace confusing recovery terminology with explained project-copy actions.

**Architecture:** Physical IndexedDB upgrade and data repair remain separate. Bootstrap recognizes a fully valid historical version-1 ledger, prepares metadata-only replacements outside a transaction, commits project incarnations plus ledger version through an exact CAS transaction, then uses existing strict version-2 readback before mounting the editor. Recovery UI maps internal sources to shared plain-language cards while preserving store capability gates.

**Tech Stack:** TypeScript 5.8, React 19, IndexedDB, `idb` 8.0.3, Web Crypto SHA-256, Vitest 4, fake-indexeddb 6.2.5, Testing Library, Playwright Chromium/Firefox/WebKit.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-08-18-indexeddb-v2-lineage-repair-recovery-ux-design.md`.
- Database name remains exactly `doctect-local-workspace`.
- Current IndexedDB version becomes exactly `2`; historical repair recognizes exactly version `1`.
- Migration ID remains exactly `local-storage-to-indexeddb-v1`; persistence rollout epoch remains exactly `1`.
- Keep exactly six stores: `projects`, `workspace`, `presets`, `pendingImports`, `migrationLedger`, and `legacyBackup`; add no indexes.
- Physical `1 -> 2` open retains all records. Metadata repair runs afterward in a separate application transaction.
- Repair only a fully valid historical ledger whose project records are current-valid or differ only by absent `incarnation`.
- Preserve present valid incarnations. Never replace a present empty, non-string, or otherwise invalid incarnation.
- Repair changes only absent project incarnations, ledger `indexedDbVersion`, and ledger revision. Project payloads, timestamps, storage revisions, order, presets, pending imports, backups, markers, fingerprints, and content digests remain exact.
- Legacy document keys remain read-only. No cleanup, fallback editing, dual write, conflict winner selection, or site-data clearing.
- Keep `LocalWorkspaceStore` public surface at `bootstrap`, `commit`, and `exportRecoveryBundle`.
- Existing strict version-2 readback remains authority gate. Historical ledger never grants normal write authority.
- Recovery files remain safety/support artifacts; do not add import or restore UI.
- Remove user-facing labels `Backup download`, `Download backup`, `Download original backup`, `Download current browser copy`, `Download editor copy`, `Recovery downloads`, and `Storage detail` from migration/recovery/receipt paths.
- Keep all available validated project sets visible and explained. Open work remains a UI-only capability, not a new `RecoverySource`.
- Preserve alert semantics, native technical-details disclosure, dialog focus trap/Escape/focus return, inert background, 44-pixel controls, focus rings, and reduced-motion loaders.
- Use Node 22. Every dependency install uses `npm ci --legacy-peer-deps`; build commands use `npm run build --legacy-peer-deps`.
- Leave unrelated untracked `.superpowers/brainstorm/` and `scratch/` files untouched.
- Write each production behavior only after its focused test fails for the expected reason.

## File Structure

### New focused modules

- Create `services/localWorkspace/lineageRepair.ts`: pure validation, preparation, digest preservation, and metadata replacement construction for the single v1-to-v2 lineage transition.
- Create `components/workspace/recoverySourcePresentation.ts`: sole UI map from internal recovery source to title, explanation, action label, filename, and shared error/helper copy.
- Create `tests/unit/localWorkspace/lineageRepair.test.ts`: pure repair preparation tests.
- Create `tests/unit/recoverySourcePresentation.test.ts`: exact user-facing source-map contract.

### Existing persistence modules

- Modify `services/localWorkspace/schema.ts`: version 2 current types plus private historical v1 types.
- Modify `services/localWorkspace/faults.ts`: closed lineage-repair fault points.
- Modify `services/localWorkspace/indexedDbAdapter.ts`: physical v2 open expectations and private atomic repair transaction.
- Modify `services/localWorkspace/LocalWorkspaceStore.ts`: exact historical ledger validation, four-state classification, repair orchestration, protected export, and winner following.

### Existing UI modules

- Modify `components/workspace/WorkspaceRecoveryScreen.tsx`: approved headings, action-first hierarchy, explained source cards, scoped alert, and closed technical details.
- Modify `components/workspace/WorkspaceBootstrapGate.tsx`: shared filenames and approved action errors.
- Modify `components/workspace/MigrationReceipt.tsx`: approved success and pre-update project-copy language.

### Tests, browser proof, and current docs

- Modify `tests/unit/localWorkspace/validation.test.ts`.
- Modify `tests/unit/localWorkspace/indexedDbAdapter.test.ts`.
- Modify `tests/unit/localWorkspace/bootstrap.test.ts`.
- Modify `tests/unit/WorkspaceBootstrapGate.test.tsx`.
- Modify `tests/e2e/fixtures/localWorkspaceMigration.js`.
- Modify `tests/e2e/local_workspace_migration.spec.js`.
- Modify `docs/1-high-level-architecture.md` and `docs/3-state-management.md`.
- Do not rewrite historical specs or plans that accurately record initial database version 1.

---

### Task 1: Establish version-2 schema and historical types

**Files:**
- Modify: `services/localWorkspace/schema.ts:10-30,92-116`
- Modify: `tests/unit/localWorkspace/validation.test.ts:58-64`
- Modify: `tests/unit/localWorkspace/indexedDbAdapter.test.ts:25-35,63-141,230-249,371-561`

**Interfaces:**
- Consumes: existing `StoredProject`, `MigrationLedger`, `WORKSPACE_DB_VERSION`, and adapter `open()`.
- Produces: `WORKSPACE_DB_VERSION = 2`, `HistoricalStoredProjectV1`, and `HistoricalMigrationLedgerV1` for Tasks 2–4.

- [ ] **Step 1: Change version expectations to fail against current version 1**

In `tests/unit/localWorkspace/validation.test.ts`, change the pinned assertion:

```ts
expect(WORKSPACE_DB_VERSION).toBe(2);
```

In `tests/unit/localWorkspace/indexedDbAdapter.test.ts`, import `WORKSPACE_DB_VERSION`, use it for current prepared ledgers, and replace the default-version test with:

```ts
it('opens exact database version 2 by default', async () => {
  const indexedDB = new IDBFactory();
  const adapter = createTestAdapter({ indexedDB });
  await adapter.open();

  const rawDatabase = await openRaw(indexedDB, WORKSPACE_DB_NAME);
  expect(rawDatabase.version).toBe(2);
  rawDatabase.close();
});
```

Add this helper beside `openRaw`:

```ts
const openVersionOneDatabase = async (
  indexedDB: IDBFactory,
  name = WORKSPACE_DB_NAME,
): Promise<IDBDatabase> => {
  const request = indexedDB.open(name, 1);
  request.addEventListener('upgradeneeded', () => {
    for (const storeName of STORE_NAMES) {
      request.result.createObjectStore(storeName, { keyPath: 'id' });
    }
  }, { once: true });
  return requestResult(request);
};
```

Add physical-upgrade coverage:

```ts
it('opens a complete version-1 database at version 2 without changing records', async () => {
  const indexedDB = new IDBFactory();
  const versionOne = await openVersionOneDatabase(indexedDB);
  const transaction = versionOne.transaction('projects', 'readwrite');
  const historical = {
    id: 'historical-project',
    project: { marker: 'preserve-exactly' },
    storageRevision: 4,
    updatedAt: TEST_NOW,
  };
  transaction.objectStore('projects').put(historical);
  await transactionDone(transaction);
  versionOne.close();

  const adapter = createTestAdapter({ indexedDB });
  await adapter.open();

  const upgraded = await openRaw(indexedDB, WORKSPACE_DB_NAME);
  expect(upgraded.version).toBe(2);
  upgraded.close();
  expect((await adapter.inspect()).projects).toEqual([historical]);
  expect(await adapter.describeSchema()).toEqual({
    projects: [],
    workspace: [],
    presets: [],
    pendingImports: [],
    migrationLedger: [],
    legacyBackup: [],
  });
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/validation.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected: version assertions fail with received `1`; physical-upgrade test reports database version `1` or a `VersionError` until current version changes.

- [ ] **Step 3: Add current and historical schema types**

In `services/localWorkspace/schema.ts`, replace current version and ledger literals and add historical types:

```ts
export const WORKSPACE_DB_NAME = 'doctect-local-workspace';
export const WORKSPACE_DB_VERSION = 2;
export const WORKSPACE_MIGRATION_ID = 'local-storage-to-indexeddb-v1';
export const PERSISTENCE_ROLLOUT_EPOCH = 1;

export interface StoredProject {
  id: string;
  project: WorkspaceProject;
  incarnation: string;
  storageRevision: number;
  updatedAt: string;
  consumedImportId?: string;
  consumedImportCreatedAt?: string;
  consumedImportDigest?: string;
  consumedImportAttempt?: StoredImportAttemptProvenance;
}

export type HistoricalStoredProjectV1 = Omit<StoredProject, 'incarnation'> & {
  incarnation?: never;
};
```

Use the version constant in current ledger and add the historical ledger after it:

```ts
export interface MigrationLedger {
  id: 'local-storage-to-indexeddb-v1';
  indexedDbVersion: typeof WORKSPACE_DB_VERSION;
  state: 'copied' | 'verified' | 'cleanup-started' | 'cleanup-complete';
  origin: 'legacy' | 'native';
  ledgerRevision: number;
  sourceDigest: string;
  expectedTargetDigest: string;
  acceptedLegacyDigest: string;
  originalLegacyBackupId: string;
  acceptedLegacyBackupId: string;
  keyFingerprints: KeyFingerprint[];
  projectFingerprints: ItemFingerprint[];
  presetFingerprints: ItemFingerprint[];
  counts: {
    sourceProjects: number;
    targetProjects: number;
    customPresets: number;
    pendingImports: number;
  };
  migratedAt: string;
  verifiedAt: string | null;
  persistenceRolloutEpoch: 1;
  unresolvedRecovery: RecoveryMarker | null;
}

export type HistoricalMigrationLedgerV1 = Omit<MigrationLedger, 'indexedDbVersion'> & {
  indexedDbVersion: 1;
};
```

- [ ] **Step 4: Keep lifecycle tests meaningful at current version 2**

In `tests/unit/localWorkspace/indexedDbAdapter.test.ts`:

- set `preparedCopy().ledger.indexedDbVersion` to `WORKSPACE_DB_VERSION`;
- open version `WORKSPACE_DB_VERSION + 1` in the versionchange authority-loss test; and
- create the intentionally missing-store database at `WORKSPACE_DB_VERSION`, so default open does not repair its schema.

The changed lines are:

```ts
indexedDbVersion: WORKSPACE_DB_VERSION,
```

```ts
const upgraded = await openRaw(
  indexedDB,
  tracked.names[0],
  WORKSPACE_DB_VERSION + 1,
);
```

```ts
const malformedDatabase = await openRaw(
  indexedDB,
  databaseName,
  WORKSPACE_DB_VERSION,
);
```

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```bash
npx vitest run tests/unit/localWorkspace/validation.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
npx tsc --noEmit
```

Expected: both Vitest files pass; TypeScript reports no current-ledger literal mismatch.

- [ ] **Step 6: Commit schema foundation**

```bash
git add services/localWorkspace/schema.ts tests/unit/localWorkspace/validation.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
git commit -m "fix(storage): version local workspace schema" -m "Reserve IndexedDB version 2 for private lineage repair while retaining exact historical version-1 record types."
```

---

### Task 2: Prepare exact metadata-only lineage repairs

**Files:**
- Create: `services/localWorkspace/lineageRepair.ts`
- Create: `tests/unit/localWorkspace/lineageRepair.test.ts`

**Interfaces:**
- Consumes: `HistoricalMigrationLedgerV1`, `MigrationLedger`, `StoredProject`, `reconstructWorkspace()`, and `digestWorkspaceContent()`.
- Produces:

```ts
export interface LineageRepairCandidateRecords {
  projects: unknown;
  workspace: unknown;
  presets: unknown;
  pendingImports: unknown;
}

export interface ExpectedLineageRepairProject {
  id: string;
  record: unknown;
}

export interface PreparedLineageRepair {
  expectedLedger: HistoricalMigrationLedgerV1;
  expectedProjects: ExpectedLineageRepairProject[];
  replacementProjects: StoredProject[];
  ledger: MigrationLedger;
  snapshot: WorkspaceSnapshot;
}

export async function prepareLineageRepair(
  ledger: HistoricalMigrationLedgerV1,
  records: LineageRepairCandidateRecords,
  environment: LineageRepairPreparationEnvironment,
): Promise<PreparedLineageRepair>;
```

- [ ] **Step 1: Write RED preparation tests**

Create `tests/unit/localWorkspace/lineageRepair.test.ts` with a real prepared migration fixture:

```ts
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
```

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/lineageRepair.test.ts
```

Expected: FAIL because `services/localWorkspace/lineageRepair.ts` does not exist.

- [ ] **Step 3: Implement pure preparation module**

Create `services/localWorkspace/lineageRepair.ts`:

```ts
import { digestWorkspaceContent } from './canonical';
import type { WorkspaceSnapshot } from './contracts';
import {
  reconstructWorkspace,
  WorkspaceMigrationError,
  type WorkspaceRecords,
} from './migration';
import {
  WORKSPACE_DB_VERSION,
  type HistoricalMigrationLedgerV1,
  type MigrationLedger,
  type StoredPendingImport,
  type StoredPreset,
  type StoredProject,
  type StoredWorkspace,
} from './schema';

export interface LineageRepairPreparationEnvironment {
  crypto: Pick<Crypto, 'subtle'>;
  randomUUID(): string;
}

export interface LineageRepairCandidateRecords {
  projects: unknown;
  workspace: unknown;
  presets: unknown;
  pendingImports: unknown;
}

export interface ExpectedLineageRepairProject {
  id: string;
  record: unknown;
}

export interface PreparedLineageRepair {
  expectedLedger: HistoricalMigrationLedgerV1;
  expectedProjects: ExpectedLineageRepairProject[];
  replacementProjects: StoredProject[];
  ledger: MigrationLedger;
  snapshot: WorkspaceSnapshot;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const targetError = (message: string, cause?: unknown): WorkspaceMigrationError =>
  new WorkspaceMigrationError(message, 'target-invalid', undefined, undefined, cause);

const generatedIncarnation = (
  environment: LineageRepairPreparationEnvironment,
  index: number,
): string => {
  const incarnation = environment.randomUUID();
  if (typeof incarnation !== 'string' || incarnation.length === 0) {
    throw targetError(`Project record ${index} generated incarnation must be non-empty.`);
  }
  return incarnation;
};

export async function prepareLineageRepair(
  ledger: HistoricalMigrationLedgerV1,
  records: LineageRepairCandidateRecords,
  environment: LineageRepairPreparationEnvironment,
): Promise<PreparedLineageRepair> {
  if (!Array.isArray(records.projects)) {
    throw targetError('Project records must be an array.');
  }

  const expectedRawProjects = structuredClone(records.projects);
  const replacementProjects: StoredProject[] = [];
  const upgradedProjects = records.projects.map((rawRecord, index) => {
    if (!isPlainObject(rawRecord)) {
      throw targetError(`Project record ${index} must be an object.`);
    }
    const cloned = structuredClone(rawRecord);
    if (Object.hasOwn(cloned, 'incarnation')) {
      return cloned as unknown as StoredProject;
    }
    const replacement = {
      ...cloned,
      incarnation: generatedIncarnation(environment, index),
    } as unknown as StoredProject;
    replacementProjects.push(structuredClone(replacement));
    return replacement;
  });

  const upgradedRecords: WorkspaceRecords = {
    projects: upgradedProjects,
    workspace: structuredClone(records.workspace) as StoredWorkspace,
    presets: structuredClone(records.presets) as StoredPreset[],
    pendingImports: structuredClone(records.pendingImports) as StoredPendingImport[],
  };
  const snapshot = reconstructWorkspace(upgradedRecords);
  const observedDigest = await digestWorkspaceContent(snapshot, environment.crypto.subtle);
  if (observedDigest !== ledger.expectedTargetDigest) {
    throw new WorkspaceMigrationError(
      'Historical workspace digest changed during lineage preparation.',
      'verification-failed',
    );
  }

  const nextLedger: MigrationLedger = {
    ...structuredClone(ledger),
    indexedDbVersion: WORKSPACE_DB_VERSION,
    ledgerRevision: ledger.ledgerRevision + 1,
  };
  return {
    expectedLedger: structuredClone(ledger),
    expectedProjects: expectedRawProjects.map((record, index) => ({
      id: upgradedProjects[index].id,
      record,
    })),
    replacementProjects,
    ledger: nextLedger,
    snapshot,
  };
}
```

- [ ] **Step 4: Run preparation and strict reconstruction tests**

Run:

```bash
npx vitest run tests/unit/localWorkspace/lineageRepair.test.ts tests/unit/localWorkspace/migrationPreparation.test.ts
npx tsc --noEmit
```

Expected: all tests pass; existing strict `reconstructWorkspace()` test still rejects missing incarnation directly.

- [ ] **Step 5: Commit pure preparation**

```bash
git add services/localWorkspace/lineageRepair.ts tests/unit/localWorkspace/lineageRepair.test.ts
git commit -m "fix(storage): prepare v1 lineage repair" -m "Validate the exact historical workspace and construct private incarnation replacements without changing logical content or digests."
```

---

### Task 3: Commit lineage repair through exact adapter CAS

**Files:**
- Modify: `services/localWorkspace/faults.ts:1-13`
- Modify: `services/localWorkspace/indexedDbAdapter.ts:15-40,42-64,118-161,476-580,1376-1405`
- Modify: `tests/unit/localWorkspace/indexedDbAdapter.test.ts:41-61,153-179,238-276,698-879`

**Interfaces:**
- Consumes: `PreparedLineageRepair` from Task 2.
- Produces private adapter method:

```ts
repairHistoricalLineage(prepared: PreparedLineageRepair): Promise<void>;
```

- [ ] **Step 1: Add RED adapter transaction tests**

Extend test imports with `prepareLineageRepair` result typing and historical
schema symbols:

```ts
import type { PreparedLineageRepair } from '../../../services/localWorkspace/lineageRepair';
import {
  WORKSPACE_DB_VERSION,
  type HistoricalMigrationLedgerV1,
} from '../../../services/localWorkspace/schema';
```

Add repair fault points to the test’s closed matrix:

```ts
const LINEAGE_REPAIR_FAULTS = [
  'lineage-repair.before-transaction',
  'lineage-repair.after-project-write',
  'lineage-repair.after-ledger-write',
  'lineage-repair.before-complete',
] as const satisfies readonly WorkspaceFaultPoint[];
```

Add a helper that seeds all stores with one missing and one valid incarnation, then returns exact prepared CAS input:

```ts
const historicalRepairFixture = () => {
  const copy = preparedCopy();
  const first = structuredClone(copy.projects[0]) as Partial<StoredProject> & { id: string };
  delete first.incarnation;
  const second = structuredClone(copy.projects[1]);
  const expectedLedger = {
    ...structuredClone(copy.ledger),
    indexedDbVersion: 1,
  } as HistoricalMigrationLedgerV1;
  const replacement = {
    ...structuredClone(copy.projects[0]),
    incarnation: 'repair-incarnation-a',
  };
  const prepared: PreparedLineageRepair = {
    expectedLedger,
    expectedProjects: [
      { id: first.id, record: first },
      { id: second.id, record: second },
    ],
    replacementProjects: [replacement],
    ledger: {
      ...expectedLedger,
      indexedDbVersion: WORKSPACE_DB_VERSION,
      ledgerRevision: expectedLedger.ledgerRevision + 1,
    },
    snapshot: workspaceSnapshot(),
  };
  return { copy, first, second, expectedLedger, replacement, prepared };
};

const seedHistoricalRepairFixture = async (
  indexedDB: IDBFactory,
  fixture: ReturnType<typeof historicalRepairFixture>,
): Promise<void> => {
  const setup = createTestAdapter({ indexedDB });
  await setup.open();
  setup.close();
  const database = await openRaw(indexedDB, WORKSPACE_DB_NAME);
  const transaction = database.transaction(STORE_NAMES, 'readwrite');
  transaction.objectStore('projects').put(fixture.first);
  transaction.objectStore('projects').put(fixture.second);
  transaction.objectStore('workspace').put(fixture.copy.workspace);
  for (const preset of fixture.copy.presets) transaction.objectStore('presets').put(preset);
  for (const pending of fixture.copy.pendingImports) {
    transaction.objectStore('pendingImports').put(pending);
  }
  transaction.objectStore('migrationLedger').put(fixture.expectedLedger);
  transaction.objectStore('legacyBackup').put(fixture.copy.backup);
  await transactionDone(transaction);
  database.close();
};
```

Add tests:

```ts
describe('atomic historical lineage repair', () => {
  it('writes only missing incarnations and advances the exact ledger', async () => {
    const indexedDB = new IDBFactory();
    const fixture = historicalRepairFixture();
    await seedHistoricalRepairFixture(indexedDB, fixture);
    const adapter = createTestAdapter({ indexedDB });

    await adapter.repairHistoricalLineage(fixture.prepared);

    const inspection = await adapter.inspect();
    expect(inspection.projects).toEqual([fixture.replacement, fixture.second]);
    expect(inspection.migrationLedger).toEqual([fixture.prepared.ledger]);
    expect(inspection.workspace).toEqual([fixture.copy.workspace]);
    expect(inspection.presets).toEqual(fixture.copy.presets);
    expect(inspection.pendingImports).toEqual(fixture.copy.pendingImports);
    expect(inspection.legacyBackup).toEqual([fixture.copy.backup]);
  });

  it.each(LINEAGE_REPAIR_FAULTS)('rolls back exact historical state at %s', async faultPoint => {
    const indexedDB = new IDBFactory();
    const fixture = historicalRepairFixture();
    await seedHistoricalRepairFixture(indexedDB, fixture);
    const adapter = createTestAdapter({ indexedDB, faultPoint });
    const before = await adapter.inspect();

    await expect(adapter.repairHistoricalLineage(fixture.prepared))
      .rejects.toMatchObject({ code: 'io' });
    expect(await adapter.inspect()).toEqual(before);
  });

  it('rejects changed ledger, project bytes, and project key set', async () => {
    for (const mutate of [
      async (indexedDB: IDBFactory, fixture: ReturnType<typeof historicalRepairFixture>) =>
        seedRawRecord(indexedDB, WORKSPACE_DB_NAME, 'migrationLedger', {
          ...fixture.expectedLedger,
          ledgerRevision: fixture.expectedLedger.ledgerRevision + 1,
        }),
      async (indexedDB: IDBFactory, fixture: ReturnType<typeof historicalRepairFixture>) =>
        seedRawRecord(indexedDB, WORKSPACE_DB_NAME, 'projects', {
          ...fixture.first,
          updatedAt: '2026-08-14T17:00:00.000Z',
        }),
      async (indexedDB: IDBFactory) => seedRawRecord(
        indexedDB,
        WORKSPACE_DB_NAME,
        'projects',
        { id: 'unexpected-project' },
      ),
    ]) {
      const indexedDB = new IDBFactory();
      const fixture = historicalRepairFixture();
      await seedHistoricalRepairFixture(indexedDB, fixture);
      await mutate(indexedDB, fixture);
      const adapter = createTestAdapter({ indexedDB });
      const before = await adapter.inspect();
      await expect(adapter.repairHistoricalLineage(fixture.prepared))
        .rejects.toMatchObject({ code: 'conflict' });
      expect(await adapter.inspect()).toEqual(before);
    }
  });

  it('allows one concurrent repair winner and one exact conflict', async () => {
    const indexedDB = new IDBFactory();
    const fixture = historicalRepairFixture();
    await seedHistoricalRepairFixture(indexedDB, fixture);
    const left = createTestAdapter({ indexedDB });
    const right = createTestAdapter({ indexedDB });

    const results = await Promise.allSettled([
      left.repairHistoricalLineage(fixture.prepared),
      right.repairHistoricalLineage(fixture.prepared),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'conflict' } });
    expect((await left.inspect()).migrationLedger).toEqual([fixture.prepared.ledger]);
  });
});
```

- [ ] **Step 2: Run adapter tests and confirm RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected: TypeScript/test collection fails because `repairHistoricalLineage` and repair fault points do not exist.

- [ ] **Step 3: Add closed fault points and adapter interface**

Append these literals in `services/localWorkspace/faults.ts`:

```ts
  | 'lineage-repair.before-transaction'
  | 'lineage-repair.after-project-write'
  | 'lineage-repair.after-ledger-write'
  | 'lineage-repair.before-complete'
```

Import `PreparedLineageRepair` in `indexedDbAdapter.ts` and add to `IndexedDbAdapter`:

```ts
repairHistoricalLineage(prepared: PreparedLineageRepair): Promise<void>;
```

- [ ] **Step 4: Implement exact two-store CAS transaction**

Add before `readWorkspaceRecords`:

```ts
const repairHistoricalLineage = async (
  prepared: PreparedLineageRepair,
): Promise<void> => {
  const activeDatabase = await getDatabase();
  try {
    environment.fault?.('lineage-repair.before-transaction');
  } catch (error) {
    throw mappedError(error);
  }

  let transaction: WriteTransaction | undefined;
  const requests: Promise<unknown>[] = [];
  try {
    const repairTransaction = activeDatabase.transaction(
      ['projects', 'migrationLedger'],
      'readwrite',
    );
    transaction = repairTransaction as WriteTransaction;
    const projectStore = repairTransaction.objectStore('projects');
    const ledgerStore = repairTransaction.objectStore('migrationLedger');
    const currentLedger = await ledgerStore.get(WORKSPACE_MIGRATION_ID);
    if (canonicalStringify(currentLedger)
      !== canonicalStringify(prepared.expectedLedger)) {
      throw conflict('Historical migration ledger changed before lineage repair.');
    }

    const actualKeys = (await projectStore.getAllKeys()).map(String).sort();
    const expectedKeys = prepared.expectedProjects.map(item => item.id).sort();
    if (canonicalStringify(actualKeys) !== canonicalStringify(expectedKeys)) {
      throw conflict('Historical project key set changed before lineage repair.');
    }
    for (const expected of prepared.expectedProjects) {
      const current = await projectStore.get(expected.id);
      if (canonicalStringify(current) !== canonicalStringify(expected.record)) {
        throw conflict(`Historical project ${expected.id} changed before lineage repair.`);
      }
    }

    for (const replacement of prepared.replacementProjects) {
      requests.push(projectStore.put(replacement));
      environment.fault?.('lineage-repair.after-project-write');
    }
    requests.push(ledgerStore.put(prepared.ledger));
    environment.fault?.('lineage-repair.after-ledger-write');
    environment.fault?.('lineage-repair.before-complete');
    await Promise.all(requests);
    await repairTransaction.done;
  } catch (error) {
    return abortTransaction(transaction, requests, error);
  }
};
```

Return it from the adapter object between `replaceCopiedInitialCopy` and `readWorkspaceRecords`.

- [ ] **Step 5: Run adapter fault, concurrency, and lifecycle suite**

Run:

```bash
npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
npx tsc --noEmit
```

Expected: all adapter tests pass, including total rollback and one concurrent winner.

- [ ] **Step 6: Commit adapter repair**

```bash
git add services/localWorkspace/faults.ts services/localWorkspace/indexedDbAdapter.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
git commit -m "fix(storage): commit lineage repair atomically" -m "Compare the historical ledger and every project record before writing private incarnations and the version-2 ledger in one transaction."
```

---

### Task 4: Orchestrate automatic bootstrap repair and protected export

**Files:**
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts:23-75,108-288,680-861,1043-1366`
- Modify: `tests/unit/localWorkspace/bootstrap.test.ts:30-85,100-285,412-479,928-1059`

**Interfaces:**
- Consumes: `prepareLineageRepair()` and `adapter.repairHistoricalLineage()`.
- Produces private four-state bootstrap classification:

```ts
type InspectionClassification =
  | { kind: 'empty' }
  | { kind: 'current'; ledger: MigrationLedger }
  | { kind: 'historical-lineage'; ledger: HistoricalMigrationLedgerV1 }
  | { kind: 'unrecognized' };
```

- [ ] **Step 1: Add raw version-1 bootstrap fixture**

Extend test imports:

```ts
import { prepareLineageRepair } from '../../../services/localWorkspace/lineageRepair';
import {
  WORKSPACE_DB_NAME,
  WORKSPACE_MIGRATION_ID,
  storedProjectLineage,
  type HistoricalMigrationLedgerV1,
  type MigrationLedger,
} from '../../../services/localWorkspace/schema';
```

In `bootstrap.test.ts`, add `LINEAGE_REPAIR_FAULTS` and a helper after `prepareFor`:

```ts
const LINEAGE_REPAIR_FAULTS = [
  'lineage-repair.before-transaction',
  'lineage-repair.after-project-write',
  'lineage-repair.after-ledger-write',
  'lineage-repair.before-complete',
] as const satisfies readonly WorkspaceFaultPoint[];

const seedHistoricalLineage = async (
  harness: TestHarness,
  options: {
    state?: 'copied' | 'verified' | 'cleanup-started' | 'cleanup-complete';
    preserveIncarnation?: boolean;
    corruptIncarnation?: unknown;
    physicalVersionTwo?: boolean;
  } = {},
) => {
  const copy = await prepareFor(harness);
  const projects = structuredClone(copy.projects) as Array<Record<string, unknown>>;
  if (!options.preserveIncarnation) delete projects[0].incarnation;
  if (Object.hasOwn(options, 'corruptIncarnation')) {
    projects[0].incarnation = options.corruptIncarnation;
  }
  const state = options.state ?? 'verified';
  const ledger = {
    ...structuredClone(copy.ledger),
    indexedDbVersion: 1,
    state,
    ledgerRevision: state === 'copied' ? 0 : 1,
    verifiedAt: state === 'copied' ? null : VERIFIED_NOW,
  } as HistoricalMigrationLedgerV1;

  const request = harness.indexedDB.open(WORKSPACE_DB_NAME, 1);
  request.addEventListener('upgradeneeded', () => {
    for (const storeName of STORE_NAMES) {
      request.result.createObjectStore(storeName, { keyPath: 'id' });
    }
  }, { once: true });
  const database = await requestResult(request);
  const transaction = database.transaction(STORE_NAMES, 'readwrite');
  for (const project of projects) transaction.objectStore('projects').put(project);
  transaction.objectStore('workspace').put(copy.workspace);
  for (const preset of copy.presets) transaction.objectStore('presets').put(preset);
  for (const pending of copy.pendingImports) {
    transaction.objectStore('pendingImports').put(pending);
  }
  transaction.objectStore('migrationLedger').put(ledger);
  transaction.objectStore('legacyBackup').put(copy.backup);
  await transactionDone(transaction);
  database.close();

  if (options.physicalVersionTwo) {
    const upgraded = await openRaw(harness.indexedDB, 2);
    upgraded.close();
  }
  return { copy, projects, ledger };
};
```

- [ ] **Step 2: Write RED automatic-repair tests**

Add a `describe('historical version-1 lineage repair')` block:

```ts
it.each(['copied', 'verified'] as const)(
  'repairs a recognized %s ledger before ordinary verification',
  async state => {
    const randomUUID = vi.fn(() => 'repaired-incarnation');
    const harness = createHarness({ randomUUID });
    const historical = await seedHistoricalLineage(harness, { state });

    const result = readyResult(
      await createLocalWorkspaceStore(harness.environment).bootstrap(),
    );

    expect(result.snapshot.projects).toEqual(
      historical.copy.projects.map(record => record.project),
    );
    expect(result.receipt?.id).toBe(
      `${WORKSPACE_MIGRATION_ID}:${historical.copy.sourceDigest}`,
    );
    const stored = await inspect(harness);
    expect(stored.projects[0]).toEqual({
      ...historical.copy.projects[0],
      incarnation: 'repaired-incarnation',
    });
    expect(stored.migrationLedger[0]).toMatchObject({
      indexedDbVersion: 2,
      state: 'verified',
      ledgerRevision: 2,
    });
    expect((harness.storage as MemoryStorage).mutations).toEqual([]);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  },
);

it('resumes physical version 2 with a historical ledger after a crash', async () => {
  const harness = createHarness({ randomUUID: () => 'resumed-incarnation' });
  await seedHistoricalLineage(harness, { physicalVersionTwo: true });

  await expect(createLocalWorkspaceStore(harness.environment).bootstrap())
    .resolves.toMatchObject({ status: 'ready' });
  expect((await inspect(harness)).projects[0].incarnation).toBe('resumed-incarnation');
});

it('resumes strict verification after repair committed before readback', async () => {
  const harness = createHarness({ randomUUID: () => 'post-commit-incarnation' });
  const historical = await seedHistoricalLineage(harness);
  const adapter = createIndexedDbAdapter({
    indexedDB: harness.indexedDB,
    now: () => VERIFIED_NOW,
  });
  await adapter.open();
  const candidate = await adapter.inspect();
  const prepared = await prepareLineageRepair(historical.ledger, {
    projects: candidate.projects,
    workspace: candidate.workspace[0],
    presets: candidate.presets,
    pendingImports: candidate.pendingImports,
  }, {
    crypto: webcrypto as unknown as Crypto,
    randomUUID: harness.environment.randomUUID,
  });
  await adapter.repairHistoricalLineage(prepared);
  adapter.close();

  await expect(createLocalWorkspaceStore(harness.environment).bootstrap())
    .resolves.toMatchObject({ status: 'ready' });
  expect((await inspect(harness)).projects[0].incarnation)
    .toBe('post-commit-incarnation');
});

it('preserves a valid incarnation and advances only ledger metadata', async () => {
  const randomUUID = vi.fn(() => 'unused');
  const harness = createHarness({ randomUUID });
  const historical = await seedHistoricalLineage(harness, { preserveIncarnation: true });

  await expect(createLocalWorkspaceStore(harness.environment).bootstrap())
    .resolves.toMatchObject({ status: 'ready' });
  expect((await inspect(harness)).projects).toEqual(historical.copy.projects);
  expect(randomUUID).not.toHaveBeenCalled();
});

it.each(LINEAGE_REPAIR_FAULTS)(
  'keeps exact historical data and protected editor export at %s',
  async faultPoint => {
    const harness = createHarness();
    const historical = await seedHistoricalLineage(harness);
    harness.setFault(faultPoint);
    const store = createLocalWorkspaceStore(harness.environment);

    const result = recoveryResult(await store.bootstrap());

    expect(result.recovery.availableExports).toContain('indexeddb-workspace');
    const bundle = JSON.parse(await (await store.exportRecoveryBundle(
      'indexeddb-workspace',
    )).text());
    expect(bundle.workspace.projects).toEqual(
      historical.copy.projects.map(record => record.project),
    );
    const stored = await inspect(harness);
    expect(Object.hasOwn(stored.projects[0], 'incarnation')).toBe(false);
    expect(stored.migrationLedger[0]).toEqual(historical.ledger);
    expect((harness.storage as MemoryStorage).mutations).toEqual([]);
  },
);

it('does not repair invalid present incarnation or unsupported cleanup state', async () => {
  const invalid = createHarness();
  await seedHistoricalLineage(invalid, { corruptIncarnation: '' });
  expect(recoveryResult(
    await createLocalWorkspaceStore(invalid.environment).bootstrap(),
  ).recovery.kind).toBe('verification-failed');

  const cleanup = createHarness();
  const historical = await seedHistoricalLineage(cleanup, { state: 'cleanup-started' });
  expect(recoveryResult(
    await createLocalWorkspaceStore(cleanup.environment).bootstrap(),
  ).recovery.kind).toBe('unsupported-cleanup-state');
  expect((await inspect(cleanup)).migrationLedger[0]).toEqual(historical.ledger);
});

it('preserves an unresolved recovery marker byte-exactly across repair', async () => {
  const harness = createHarness();
  const historical = await seedHistoricalLineage(harness);
  const marker = {
    id: 'historical-target-marker',
    kind: 'target-mismatch' as const,
    detectedAt: VERIFIED_NOW,
  };
  await putRaw(harness.indexedDB, 'migrationLedger', {
    ...historical.ledger,
    unresolvedRecovery: marker,
  });

  const result = recoveryResult(
    await createLocalWorkspaceStore(harness.environment).bootstrap(),
  );

  expect(result.recovery.kind).toBe('verification-failed');
  expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
    indexedDbVersion: 2,
    ledgerRevision: historical.ledger.ledgerRevision + 1,
    unresolvedRecovery: marker,
  });
});

it('lets concurrent stores follow one repair winner', async () => {
  const harness = createHarness();
  await seedHistoricalLineage(harness);
  const left = createLocalWorkspaceStore(harness.environment);
  const right = createLocalWorkspaceStore(harness.environment);

  const results = await Promise.all([left.bootstrap(), right.bootstrap()]);

  expect(results.map(result => result.status)).toEqual(['ready', 'ready']);
  expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
    indexedDbVersion: 2,
    ledgerRevision: 2,
  });
});
```

- [ ] **Step 3: Run bootstrap tests and confirm RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts
```

Expected: historical targets return `unrecognized-target`; protected editor export is absent.

- [ ] **Step 4: Parameterize exact ledger validation without widening authority**

Import `HistoricalMigrationLedgerV1`, `prepareLineageRepair`, and `PreparedLineageRepair`. Replace the existing ledger predicate with an expected-version helper while preserving every existing field check:

```ts
type SupportedMigrationLedger = MigrationLedger | HistoricalMigrationLedgerV1;

const isLedgerAtVersion = (value: unknown, expectedVersion: 1 | 2): boolean => {
  if (!isPlainObject(value) || !hasExactKeys(value, LEDGER_KEYS)) return false;
  const projectFingerprints = value.projectFingerprints;
  const presetFingerprints = value.presetFingerprints;
  if (value.id !== WORKSPACE_MIGRATION_ID
    || value.indexedDbVersion !== expectedVersion
    || value.persistenceRolloutEpoch !== PERSISTENCE_ROLLOUT_EPOCH
    || !(
      value.state === 'copied'
      || value.state === 'verified'
      || value.state === 'cleanup-started'
      || value.state === 'cleanup-complete'
    )
    || !(value.origin === 'legacy' || value.origin === 'native')
    || !isNonNegativeInteger(value.ledgerRevision)
    || !isDigest(value.sourceDigest)
    || !isDigest(value.expectedTargetDigest)
    || !isDigest(value.acceptedLegacyDigest)
    || typeof value.originalLegacyBackupId !== 'string'
    || value.originalLegacyBackupId.length === 0
    || typeof value.acceptedLegacyBackupId !== 'string'
    || value.acceptedLegacyBackupId.length === 0
    || !isCanonicalTimestamp(value.migratedAt)
    || !(value.verifiedAt === null || isCanonicalTimestamp(value.verifiedAt))
    || (value.state === 'copied' && value.verifiedAt !== null)
    || (value.state === 'verified' && value.verifiedAt === null)
    || !(value.unresolvedRecovery === null || isRecoveryMarker(value.unresolvedRecovery))) {
    return false;
  }
  if (!Array.isArray(value.keyFingerprints)
    || value.keyFingerprints.length !== LEGACY_DOCUMENT_KEYS.length
    || !value.keyFingerprints.every((entry, index) => isPlainObject(entry)
      && hasExactKeys(entry, ['key', 'present', 'digest'])
      && entry.key === LEGACY_DOCUMENT_KEYS[index]
      && typeof entry.present === 'boolean'
      && isDigest(entry.digest))
    || !isItemFingerprints(projectFingerprints)
    || !isItemFingerprints(presetFingerprints)
    || !isPlainObject(value.counts)
    || !hasExactKeys(value.counts, [
      'sourceProjects',
      'targetProjects',
      'customPresets',
      'pendingImports',
    ])
    || !isNonNegativeInteger(value.counts.sourceProjects)
    || !isNonNegativeInteger(value.counts.targetProjects)
    || value.counts.targetProjects === 0
    || !isNonNegativeInteger(value.counts.customPresets)
    || !isNonNegativeInteger(value.counts.pendingImports)
    || value.counts.sourceProjects !== projectFingerprints.length
    || value.counts.customPresets !== presetFingerprints.length) {
    return false;
  }
  return true;
};

const isRecognizedLedger = (value: unknown): value is MigrationLedger =>
  isLedgerAtVersion(value, WORKSPACE_DB_VERSION);

const isHistoricalLineageLedger = (
  value: unknown,
): value is HistoricalMigrationLedgerV1 => isLedgerAtVersion(value, 1);
```

Keep `readRecognizedLedger()` current-only. Change `readVerificationInputs`, `validatedRecoverySources`, and `populateCapabilities` known-ledger parameters to `SupportedMigrationLedger`. When capability probing reads a candidate, accept it only through one of the two exact predicates:

```ts
if (isRecognizedLedger(candidate) || isHistoricalLineageLedger(candidate)) {
  ledger = candidate;
}
```

Make the protected in-memory editor export authoritative for capability display
after a failed repair; only reconstruct persistent current records when no
protected bundle exists:

```ts
if (protectedIndexedDbRecoveryBundle) {
  sources.push('indexeddb-workspace');
} else {
  try {
    reconstructWorkspace(await getAdapter().readWorkspaceRecords());
    sources.push('indexeddb-workspace');
  } catch {
    // Invalid or missing target must not be advertised.
  }
}
```

Historical ledgers may validate downloads but must not enable the
`recover-legacy-as-copies` command. In `populateCapabilities`, narrow command
capability to a current ledger before reading its marker or passing it to
`prepareLegacyRecovery`:

```ts
let currentLedger = knownLedger && isRecognizedLedger(knownLedger)
  ? knownLedger
  : undefined;
if (!currentLedger) {
  try {
    currentLedger = await readRecognizedLedger();
  } catch {
    // Recovery command stays unavailable without a current validated ledger.
  }
}
const marker = currentLedger?.unresolvedRecovery;
```

Use `currentLedger` for every subsequent state, revision, marker, accepted
backup, and recovery-preparation check in that function.

- [ ] **Step 5: Add four-state inspection classification**

Replace `classifyInspection` with:

```ts
type InspectionClassification =
  | { kind: 'empty' }
  | { kind: 'current'; ledger: MigrationLedger }
  | { kind: 'historical-lineage'; ledger: HistoricalMigrationLedgerV1 }
  | { kind: 'unrecognized' };

const classifyInspection = (
  inspection: IndexedDbInspection,
): InspectionClassification => {
  if (inspection.migrationLedger.length === 0) {
    return allStoresEmpty(inspection) ? { kind: 'empty' } : { kind: 'unrecognized' };
  }
  if (inspection.migrationLedger.length !== 1) return { kind: 'unrecognized' };
  const candidate: unknown = inspection.migrationLedger[0];
  if (isRecognizedLedger(candidate)) return { kind: 'current', ledger: candidate };
  if (isHistoricalLineageLedger(candidate)) {
    return { kind: 'historical-lineage', ledger: candidate };
  }
  return { kind: 'unrecognized' };
};
```

- [ ] **Step 6: Orchestrate preparation, protected export, CAS, and winner following**

Extend nested `followInspection` to a third `lineageRepairAttempt` argument and handle historical classification before current ledger logic:

```ts
const followInspection = async (
  inspection: IndexedDbInspection,
  allowCopiedReplacement: boolean,
  lineageRepairAttempt = 0,
): Promise<WorkspaceBootstrapResult> => {
  const classification = classifyInspection(inspection);
  if (classification.kind === 'empty' || classification.kind === 'unrecognized') {
    retryableCopiedLedger = undefined;
    return recovery('unrecognized-target');
  }
  if (classification.kind === 'historical-lineage') {
    const ledger = classification.ledger;
    if (ledger.state === 'cleanup-started' || ledger.state === 'cleanup-complete') {
      retryableCopiedLedger = undefined;
      return recovery('unsupported-cleanup-state');
    }
    if (lineageRepairAttempt >= 3) {
      return verificationFailure(new WorkspaceMigrationError(
        'Historical lineage repair changed repeatedly.',
        'verification-failed',
      ));
    }

    emit('verifying-projects');
    let inputs: Awaited<ReturnType<typeof readVerificationInputs>>;
    try {
      inputs = await readVerificationInputs(ledger);
    } catch (error) {
      if (error instanceof WorkspaceStoreError) return unavailable();
      if (error instanceof WorkspaceMigrationError) return verificationFailure(error);
      throw error;
    }

    let prepared: PreparedLineageRepair;
    try {
      prepared = await prepareLineageRepair(ledger, inputs.records, {
        crypto: environment.crypto,
        randomUUID: environment.randomUUID,
      });
      protectedIndexedDbRecoveryBundle = createProtectedIndexedDbRecoveryBundle(
        prepared.snapshot,
        environment.now(),
      );
    } catch (error) {
      if (error instanceof WorkspaceMigrationError) return verificationFailure(error);
      return migrationFailure(error);
    }

    emit('copying-projects');
    try {
      await adapter.repairHistoricalLineage(prepared);
    } catch (error) {
      if (error instanceof WorkspaceStoreError && error.code === 'conflict') {
        try {
          return followInspection(
            await adapter.inspect(),
            false,
            lineageRepairAttempt + 1,
          );
        } catch (inspectionError) {
          if (inspectionError instanceof WorkspaceStoreError) return unavailable();
          throw inspectionError;
        }
      }
      if (error instanceof WorkspaceStoreError && error.code === 'unavailable') {
        return unavailable();
      }
      if (error instanceof WorkspaceStoreError) return migrationFailure(error);
      throw error;
    }

    try {
      return followInspection(await adapter.inspect(), false, lineageRepairAttempt + 1);
    } catch (error) {
      if (error instanceof WorkspaceStoreError) return unavailable();
      throw error;
    }
  }

  const ledger = classification.ledger;
```

Retain existing current-ledger logic after the final line. At initial inspection, route current and historical states through `followInspection`; only `empty` starts initial copy:

```ts
const classification = classifyInspection(initialInspection);
if (classification.kind === 'unrecognized') {
  retryableCopiedLedger = undefined;
  return recovery('unrecognized-target');
}
if (classification.kind === 'current'
  || classification.kind === 'historical-lineage') {
  return followInspection(initialInspection, true);
}
retryableCopiedLedger = undefined;
```

- [ ] **Step 7: Run bootstrap, migration, adapter, and boundary tests**

Run:

```bash
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts tests/unit/localWorkspace/lineageRepair.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
npm run check:workspace-boundary --legacy-peer-deps
npx tsc --noEmit
```

Expected: all tests pass; boundary still confirms no legacy mutator and no extra public store method.

- [ ] **Step 8: Commit bootstrap repair**

```bash
git add services/localWorkspace/LocalWorkspaceStore.ts tests/unit/localWorkspace/bootstrap.test.ts
git commit -m "fix(storage): resume v1 lineage metadata" -m "Recognize only the exact historical ledger, protect validated project bytes, repair through CAS, and re-enter strict version-2 verification."
```

---

### Task 5: Explain recovery project sets and restore action hierarchy

**Files:**
- Create: `components/workspace/recoverySourcePresentation.ts`
- Create: `tests/unit/recoverySourcePresentation.test.ts`
- Modify: `components/workspace/WorkspaceRecoveryScreen.tsx:1-287`
- Modify: `tests/unit/WorkspaceBootstrapGate.test.tsx:625-690,780-843,1446-1638`

**Interfaces:**
- Produces:

```ts
export interface RecoverySourcePresentation {
  title: string;
  explanation: string;
  actionLabel: string;
  filename: string;
}

export const RECOVERY_SOURCE_PRESENTATION: Readonly<Record<RecoverySource, RecoverySourcePresentation>>;
export const OPEN_WORKSPACE_PRESENTATION: Readonly<RecoverySourcePresentation>;
export const PROJECT_COPY_HELPER_TEXT: string;
export const PROJECT_DOWNLOAD_ERROR: string;
export const SEPARATE_COPIES_ERROR: string;
```

- [ ] **Step 1: Write exact presentation-map RED test**

Create `tests/unit/recoverySourcePresentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  OPEN_WORKSPACE_PRESENTATION,
  PROJECT_COPY_HELPER_TEXT,
  PROJECT_DOWNLOAD_ERROR,
  RECOVERY_SOURCE_PRESENTATION,
  SEPARATE_COPIES_ERROR,
} from '../../components/workspace/recoverySourcePresentation';

describe('recovery source presentation', () => {
  it('explains every durable and open-work project set with unique actions', () => {
    expect(RECOVERY_SOURCE_PRESENTATION).toEqual({
      'indexeddb-workspace': {
        title: 'Projects saved by this editor',
        explanation: 'Project set stored by the current Doctect editor.',
        actionLabel: 'Download editor projects',
        filename: 'doctect-editor-projects.json',
      },
      'legacy-current': {
        title: 'Projects from an older app version',
        explanation: 'Latest project set still present in storage used by an older Doctect version.',
        actionLabel: 'Download older-version projects',
        filename: 'doctect-older-version-projects.json',
      },
      'legacy-original': {
        title: 'Projects from before the update',
        explanation: 'Exact project set Doctect found when it first started moving local projects.',
        actionLabel: 'Download projects from before the update',
        filename: 'doctect-projects-before-update.json',
      },
    });
    expect(OPEN_WORKSPACE_PRESENTATION).toEqual({
      title: 'Work from this tab',
      explanation: 'Latest workspace captured before the editor closed. It may include changes not yet saved.',
      actionLabel: 'Download work from this tab',
      filename: 'doctect-work-from-this-tab.json',
    });
    expect(new Set([
      ...Object.values(RECOVERY_SOURCE_PRESENTATION).map(item => item.actionLabel),
      OPEN_WORKSPACE_PRESENTATION.actionLabel,
    ]).size).toBe(4);
  });

  it('pins helper and action-error language', () => {
    expect(PROJECT_COPY_HELPER_TEXT).toBe(
      'Each file preserves a different project set. Keep any set you may need. These files are for safekeeping or support; this version of Doctect cannot open them directly.',
    );
    expect(PROJECT_DOWNLOAD_ERROR).toBe(
      'Project download failed. Nothing changed. Try again.',
    );
    expect(SEPARATE_COPIES_ERROR).toBe(
      'We couldn’t add the separate copies. Nothing was overwritten. Try again or save the project copies first.',
    );
  });
});
```

- [ ] **Step 2: Write RED recovery-screen behavior tests**

Import the shared presentation contract in `WorkspaceBootstrapGate.test.tsx`:

```ts
import {
  OPEN_WORKSPACE_PRESENTATION,
  PROJECT_DOWNLOAD_ERROR,
  RECOVERY_SOURCE_PRESENTATION,
  SEPARATE_COPIES_ERROR,
} from '../../components/workspace/recoverySourcePresentation';
```

Update/add tests in `WorkspaceBootstrapGate.test.tsx` to assert:

```ts
expect(screen.getByRole('heading', {
  name: 'We couldn’t finish preparing your projects',
})).toBeVisible();
expect(screen.getByText(
  'Editor stayed closed to protect your work. Your saved projects were not replaced or deleted.',
)).toBeVisible();
expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
```

For all-source split brain:

```ts
expect(screen.getByRole('heading', {
  name: 'We found two different saved project sets',
})).toBeVisible();
expect(screen.getByRole('heading', { name: 'Save project copies' })).toBeVisible();
for (const source of sources) {
  const presentation = RECOVERY_SOURCE_PRESENTATION[source];
  expect(screen.getByRole('heading', { name: presentation.title })).toBeVisible();
  expect(screen.getByText(presentation.explanation)).toBeVisible();
  expect(screen.getByRole('button', { name: presentation.actionLabel })).toBeEnabled();
}
```

Add scoped-alert and ordering assertions:

```ts
const alert = screen.getByRole('alert');
expect(within(alert).getByRole('heading', {
  name: 'We couldn’t finish preparing your projects',
})).toBeVisible();
expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
const details = screen.getByText('Technical details').closest('details');
expect(details).not.toHaveAttribute('open');
expect(alert).not.toContainElement(details);
const tryAgain = screen.getByRole('button', { name: 'Try again' });
const copiesHeading = screen.getByRole('heading', { name: 'Save project copies' });
expect(tryAgain.compareDocumentPosition(copiesHeading)
  & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

Update dialog assertions to `Add changed projects without replacing anything`, `Add changed projects as separate copies?`, and `Add separate copies`. Keep existing focus, Escape, Tab-trap, inert-background, and reduced-motion assertions.

- [ ] **Step 3: Run presentation and screen tests and confirm RED**

Run:

```bash
npx vitest run tests/unit/recoverySourcePresentation.test.ts tests/unit/WorkspaceBootstrapGate.test.tsx
```

Expected: map module is missing and existing screen exposes old headings/download labels.

- [ ] **Step 4: Create shared presentation module**

Create `components/workspace/recoverySourcePresentation.ts`:

```ts
import type { RecoverySource } from '../../services/localWorkspace/index';

export interface RecoverySourcePresentation {
  title: string;
  explanation: string;
  actionLabel: string;
  filename: string;
}

export const RECOVERY_SOURCE_PRESENTATION: Readonly<
  Record<RecoverySource, RecoverySourcePresentation>
> = {
  'indexeddb-workspace': {
    title: 'Projects saved by this editor',
    explanation: 'Project set stored by the current Doctect editor.',
    actionLabel: 'Download editor projects',
    filename: 'doctect-editor-projects.json',
  },
  'legacy-current': {
    title: 'Projects from an older app version',
    explanation: 'Latest project set still present in storage used by an older Doctect version.',
    actionLabel: 'Download older-version projects',
    filename: 'doctect-older-version-projects.json',
  },
  'legacy-original': {
    title: 'Projects from before the update',
    explanation: 'Exact project set Doctect found when it first started moving local projects.',
    actionLabel: 'Download projects from before the update',
    filename: 'doctect-projects-before-update.json',
  },
};

export const OPEN_WORKSPACE_PRESENTATION: Readonly<RecoverySourcePresentation> = {
  title: 'Work from this tab',
  explanation: 'Latest workspace captured before the editor closed. It may include changes not yet saved.',
  actionLabel: 'Download work from this tab',
  filename: 'doctect-work-from-this-tab.json',
};

export const PROJECT_COPY_HELPER_TEXT =
  'Each file preserves a different project set. Keep any set you may need. These files are for safekeeping or support; this version of Doctect cannot open them directly.';

export const PROJECT_DOWNLOAD_ERROR =
  'Project download failed. Nothing changed. Try again.';

export const SEPARATE_COPIES_ERROR =
  'We couldn’t add the separate copies. Nothing was overwritten. Try again or save the project copies first.';
```

- [ ] **Step 5: Restructure recovery screen around outcome, action, cards, details**

In `WorkspaceRecoveryScreen.tsx`, remove `EXPORT_LABELS`, import shared presentation, and use approved state copy:

```ts
const heading = result.status === 'unavailable'
  ? 'Doctect can’t open your saved projects'
  : splitBrain
    ? 'We found two different saved project sets'
    : 'We couldn’t finish preparing your projects';
const supportingCopy = result.status === 'unavailable'
  ? 'Local project storage could not be opened. No saved project data was changed.'
  : splitBrain
    ? 'Another tab or an older Doctect version may have saved different changes. Nothing was overwritten.'
    : 'Editor stayed closed to protect your work. Your saved projects were not replaced or deleted.';
```

Keep the outer section inert while the dialog is open, but put only outcome text and action error in the alert:

```tsx
<section
  aria-hidden={confirmationOpen ? true : undefined}
  inert={confirmationOpen ? true : undefined}
  className="w-full max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] sm:p-8"
>
  <div role="alert" aria-live="assertive">
    <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
      <AlertTriangle className="size-6" aria-hidden="true" />
    </div>
    <h1 id="workspace-recovery-heading" className="text-2xl font-bold tracking-tight text-slate-900">
      {heading}
    </h1>
    <p className="mt-3 max-w-[68ch] text-sm leading-6 text-slate-700 sm:text-base">
      {supportingCopy}
    </p>
    {actionError && (
      <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
        {actionError}
      </p>
    )}
  </div>
```

Move the existing primary-action block immediately after this alert. Rename labels to `Try again`, `Add changed projects without replacing anything`, and loading text `Adding separate copies`.

Render project-set cards after primary actions:

```tsx
<div className="mt-7 border-t border-slate-200 pt-6">
  <h2 className="text-base font-semibold text-slate-900">Save project copies</h2>
  <p className="mt-2 text-sm leading-6 text-slate-600">{PROJECT_COPY_HELPER_TEXT}</p>
  {onExportOpenWorkspace || availableExports.length > 0 ? (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {onExportOpenWorkspace && (
        <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">{OPEN_WORKSPACE_PRESENTATION.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {OPEN_WORKSPACE_PRESENTATION.explanation}
          </p>
          <button type="button" onClick={onExportOpenWorkspace} disabled={busy} className={`${downloadButtonClassName} mt-3`}>
            <Download className="size-4" aria-hidden="true" />
            {OPEN_WORKSPACE_PRESENTATION.actionLabel}
          </button>
        </article>
      )}
      {availableExports.map(source => {
        const presentation = RECOVERY_SOURCE_PRESENTATION[source];
        const downloading = activeExport === source;
        return (
          <article key={source} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">{presentation.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{presentation.explanation}</p>
            <button type="button" onClick={() => onExport(source)} disabled={busy} className={`${downloadButtonClassName} mt-3`}>
              {downloading
                ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Download className="size-4" aria-hidden="true" />}
              {downloading ? 'Preparing project file' : presentation.actionLabel}
            </button>
          </article>
        );
      })}
    </div>
  ) : (
    <p className="mt-2 text-sm leading-6 text-slate-600">
      No project copies are available to save right now.
    </p>
  )}
</div>
<details className="mt-6 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
  <summary className="cursor-pointer font-semibold text-slate-900">Technical details</summary>
  <p className="mt-2 leading-6">{technicalMessage}</p>
</details>
```

Rename dialog heading and confirm button exactly as tested. Keep focus refs and keyboard handler unchanged.

- [ ] **Step 6: Run UI tests and accessibility regressions**

Run:

```bash
npx vitest run tests/unit/recoverySourcePresentation.test.ts tests/unit/WorkspaceBootstrapGate.test.tsx
npx tsc --noEmit
```

Expected: approved source map and recovery screen tests pass; focus/reduced-motion regressions stay green.

- [ ] **Step 7: Commit recovery screen UX**

```bash
git add components/workspace/recoverySourcePresentation.ts components/workspace/WorkspaceRecoveryScreen.tsx tests/unit/recoverySourcePresentation.test.ts tests/unit/WorkspaceBootstrapGate.test.tsx
git commit -m "fix(workspace): explain recovery project copies"
```

---

### Task 6: Align gate downloads and migration receipt

**Files:**
- Modify: `components/workspace/WorkspaceBootstrapGate.tsx:143-147,441-525,577-585`
- Modify: `components/workspace/MigrationReceipt.tsx:1-105`
- Modify: `tests/unit/WorkspaceBootstrapGate.test.tsx:120-140,1581-1764`

**Interfaces:**
- Consumes: presentation constants from Task 5.
- Produces: shared durable/open-work filenames, approved errors, and approved receipt copy without changing bundle formats or source IDs.

- [ ] **Step 1: Write RED filename, error, and receipt tests**

Update download expectations to exact filenames:

```ts
expect(downloadBlob).toHaveBeenCalledWith(
  expect.any(Blob),
  RECOVERY_SOURCE_PRESENTATION['legacy-current'].filename,
);
expect(downloadBlob).toHaveBeenCalledWith(
  expect.any(Blob),
  RECOVERY_SOURCE_PRESENTATION['legacy-original'].filename,
);
expect(downloadBlob).toHaveBeenCalledWith(
  expect.any(Blob),
  RECOVERY_SOURCE_PRESENTATION['indexeddb-workspace'].filename,
);
expect(downloadJson).toHaveBeenCalledWith(
  expect.objectContaining({ format: 'doctect.open-workspace-recovery' }),
  OPEN_WORKSPACE_PRESENTATION.filename,
);
```

Pin errors:

```ts
expect(screen.getByText(PROJECT_DOWNLOAD_ERROR)).toBeVisible();
expect(screen.getByText(SEPARATE_COPIES_ERROR)).toBeVisible();
```

Replace receipt assertions:

```ts
expect(await screen.findByRole('heading', { name: 'Your projects are ready' })).toBeVisible();
expect(screen.getByText('Doctect moved and checked your local projects.')).toBeVisible();
expect(screen.getByText(
  'Doctect kept the previous saved project data unchanged in case recovery is needed.',
)).toBeVisible();
expect(screen.getByRole('button', {
  name: 'Download projects from before the update',
})).toBeEnabled();
```

When `isDownloading`, assert `Preparing project file` and retain reduced-motion loader assertion.

- [ ] **Step 2: Run gate tests and confirm RED**

Run:

```bash
npx vitest run tests/unit/WorkspaceBootstrapGate.test.tsx
```

Expected: old filenames, download errors, and receipt labels fail assertions.

- [ ] **Step 3: Route all download presentation through shared map**

In `WorkspaceBootstrapGate.tsx`, remove `DOWNLOAD_FILENAMES`, import shared constants, and use:

```ts
downloadBlob(blob, RECOVERY_SOURCE_PRESENTATION[source].filename);
```

```ts
downloadJson({
  format: 'doctect.open-workspace-recovery',
  version: 1,
  capturedAt: new Date().toISOString(),
  workspace: snapshot,
}, OPEN_WORKSPACE_PRESENTATION.filename);
```

Replace both durable/open-work download catch messages with `PROJECT_DOWNLOAD_ERROR`. Replace recovery-command failure with `SEPARATE_COPIES_ERROR`.

- [ ] **Step 4: Apply approved migration receipt copy**

In `MigrationReceipt.tsx`, import `RECOVERY_SOURCE_PRESENTATION`, bind:

```ts
const originalProjects = RECOVERY_SOURCE_PRESENTATION['legacy-original'];
```

Use these exact strings:

```tsx
<h1 id="migration-receipt-heading" className="text-2xl font-bold tracking-tight text-slate-900">
  Your projects are ready
</h1>
<p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
  Doctect moved and checked your local projects.
</p>
```

```tsx
<p className="mt-5 max-w-[68ch] text-sm leading-6 text-slate-600">
  Doctect kept the previous saved project data unchanged in case recovery is needed.
</p>
```

```tsx
{isDownloading ? 'Preparing project file' : originalProjects.actionLabel}
```

Keep count rows, acknowledgement key, `legacy-original` export source, continue action, error alert, and busy behavior unchanged.

- [ ] **Step 5: Run gate, presentation, and browser-download unit tests**

Run:

```bash
npx vitest run tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/recoverySourcePresentation.test.ts tests/unit/browserDownload.test.ts
npx tsc --noEmit
```

Expected: all tests pass; generic browser download behavior remains unchanged.

- [ ] **Step 6: Commit gate and receipt language**

```bash
git add components/workspace/WorkspaceBootstrapGate.tsx components/workspace/MigrationReceipt.tsx tests/unit/WorkspaceBootstrapGate.test.tsx
git commit -m "fix(workspace): align recovery downloads"
```

---

### Task 7: Prove repair in real browsers and update current architecture

**Files:**
- Modify: `tests/e2e/fixtures/localWorkspaceMigration.js:1-255`
- Modify: `tests/e2e/local_workspace_migration.spec.js:3-123,188-243,350-440,640-673`
- Modify: `docs/1-high-level-architecture.md:13,29-33`
- Modify: `docs/3-state-management.md:7-15,67-71`

**Interfaces:**
- Consumes: complete Tasks 1–6 behavior and existing browser fixture helpers.
- Produces `prepareHistoricalVersionOneWorkspace(page)`, resolving to legacy raw
  values, seed evidence, exact expected workspace, expected target digest,
  historical project records, and historical verified ledger.

- [ ] **Step 1: Write the cross-engine browser test before its fixture exists**

Import `prepareHistoricalVersionOneWorkspace`, update `receiptHeading` to the
approved heading, and add this test after the initial happy path:

```js
test('repairs recognized version-1 records missing only incarnation before opening editor', async ({ page }) => {
    const historical = await prepareHistoricalVersionOneWorkspace(page);

    await page.goto('/app');

    await expect(recoveryAlert(page)).toHaveCount(0);
    await expect(receiptHeading(page)).toBeVisible();
    expect(await readWorkspace(page)).toEqual(historical.expectedWorkspace);
    expect(await readLegacyRaw(page)).toEqual(historical.raw);
    const repaired = await inspectWorkspaceDatabase(page);
    expect(repaired.version).toBe(2);
    expectIndexFreeSchema(repaired);
    expect(repaired.records.migrationLedger).toEqual([{
        ...historical.historicalLedger,
        indexedDbVersion: 2,
        ledgerRevision: historical.historicalLedger.ledgerRevision + 1,
    }]);
    expect(repaired.records.migrationLedger[0].expectedTargetDigest)
        .toBe(historical.expectedTargetDigest);
    expect(repaired.records.projects).toHaveLength(historical.historicalProjects.length);
    for (const historicalProject of historical.historicalProjects) {
        const current = repaired.records.projects.find(record => record.id === historicalProject.id);
        expect(current).toEqual({
            ...historicalProject,
            incarnation: expect.any(String),
        });
        expect(current.incarnation.length).toBeGreaterThan(0);
    }
    const repairedIncarnations = Object.fromEntries(
        repaired.records.projects.map(record => [record.id, record.incarnation]),
    );

    await continueToEditor(page);
    await page.reload();

    await expect(editorPane(page).first()).toBeVisible();
    await expect(recoveryAlert(page)).toHaveCount(0);
    const reloaded = await inspectWorkspaceDatabase(page);
    expect(reloaded.version).toBe(2);
    expect(reloaded.records.migrationLedger[0].expectedTargetDigest)
        .toBe(historical.expectedTargetDigest);
    for (const [id, incarnation] of Object.entries(repairedIncarnations)) {
        expect(reloaded.records.projects.find(record => record.id === id)?.incarnation)
            .toBe(incarnation);
    }
    expect(await readLegacyRaw(page)).toEqual(historical.raw);
});
```

Use the approved receipt selector:

```js
const receiptHeading = page => page.getByRole('heading', { name: 'Your projects are ready' });
```

- [ ] **Step 2: Run the focused browser test and confirm RED**

Run:

```bash
npx playwright test tests/e2e/local_workspace_migration.spec.js --grep="repairs recognized version-1 records missing only incarnation before opening editor" --project=chromium
```

Expected: test collection fails because `prepareHistoricalVersionOneWorkspace`
is not exported from the fixture module.

- [ ] **Step 3: Add raw browser version-1 fixture**

Add `prepareHistoricalVersionOneWorkspace` after `prepareValidLegacyWorkspace` in `tests/e2e/fixtures/localWorkspaceMigration.js`:

```js
export const prepareHistoricalVersionOneWorkspace = async page => {
    await resetLocalWorkspace(page);
    const legacy = await createValidLegacyWorkspace(page);
    const seed = await seedLegacyRaw(page, legacy.raw);
    const evidence = await page.evaluate(async ({ databaseName, stores }) => {
        const [{ captureLegacySnapshot }, { prepareInitialCopy }, { createBlankProject }] = await Promise.all([
            import('/services/localWorkspace/legacy.ts'),
            import('/services/localWorkspace/migration.ts'),
            import('/services/presets.ts'),
        ]);
        let uuid = 0;
        const prepared = await prepareInitialCopy(captureLegacySnapshot(localStorage), {
            crypto: globalThis.crypto,
            now: () => '2026-08-18T12:00:00.000Z',
            randomUUID: () => `historical-seed-${++uuid}`,
            createBlankProject,
        });
        const historicalProjects = prepared.projects.map(record => {
            const historical = structuredClone(record);
            delete historical.incarnation;
            return historical;
        });
        const historicalLedger = {
            ...structuredClone(prepared.ledger),
            indexedDbVersion: 1,
            state: 'verified',
            ledgerRevision: 1,
            verifiedAt: '2026-08-18T12:01:00.000Z',
        };
        const expectedWorkspace = {
            projects: prepared.projects.map(record => record.project),
            activeProjectId: prepared.workspace.activeProjectId,
            customPresets: prepared.presets.map(record => record.preset),
            pendingImports: prepared.pendingImports.map(record => record.pendingImport),
        };

        await new Promise((resolve, reject) => {
            const deletion = indexedDB.deleteDatabase(databaseName);
            deletion.addEventListener('success', resolve, { once: true });
            deletion.addEventListener('error', () => reject(deletion.error), { once: true });
        });
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.addEventListener('upgradeneeded', () => {
                for (const store of stores) {
                    request.result.createObjectStore(store, { keyPath: 'id' });
                }
            }, { once: true });
            request.addEventListener('success', () => resolve(request.result), { once: true });
            request.addEventListener('error', () => reject(request.error), { once: true });
        });
        const transaction = database.transaction(stores, 'readwrite');
        for (const project of historicalProjects) transaction.objectStore('projects').put(project);
        transaction.objectStore('workspace').put(prepared.workspace);
        for (const preset of prepared.presets) transaction.objectStore('presets').put(preset);
        for (const pending of prepared.pendingImports) transaction.objectStore('pendingImports').put(pending);
        transaction.objectStore('migrationLedger').put(historicalLedger);
        transaction.objectStore('legacyBackup').put(prepared.backup);
        await new Promise((resolve, reject) => {
            transaction.addEventListener('complete', resolve, { once: true });
            transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
            transaction.addEventListener('error', () => reject(transaction.error), { once: true });
        });
        database.close();
        return {
            expectedWorkspace,
            expectedTargetDigest: prepared.targetDigest,
            historicalProjects,
            historicalLedger,
        };
    }, { databaseName: WORKSPACE_DB_NAME, stores: WORKSPACE_STORE_NAMES });
    return { ...legacy, seed, ...evidence };
};
```

- [ ] **Step 4: Run the focused repair proof in all standard engines**

Run:

```bash
npx playwright test tests/e2e/local_workspace_migration.spec.js --grep="repairs recognized version-1 records missing only incarnation before opening editor" --project=chromium --project=firefox --project=webkit
```

Expected: 3 passed; exact projects open, DB reports version 2, and reload
preserves generated incarnations.

- [ ] **Step 5: Update existing browser selectors to approved copy**

Replace old download and recovery selectors throughout the browser spec with:

- `Download projects from before the update`
- `Download older-version projects`
- `Download editor projects`
- `We found two different saved project sets`
- `Add changed projects without replacing anything`
- `Add separate copies`
- `Doctect can’t open your saved projects`
- `We couldn’t finish preparing your projects`

Run the complete standard-engine spec:

```bash
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=chromium --project=firefox --project=webkit
```

Expected: all applicable tests pass; no selector references removed user-facing
terminology.

- [ ] **Step 6: Update current architecture docs**

In `docs/1-high-level-architecture.md`, extend IndexedDB and authority-cutover text with:

```md
The current physical database version is 2. Bootstrap recognizes the exact
historical version-1 ledger shape created before private project incarnations
were introduced, adds only missing incarnation metadata through an atomic CAS
transaction, and then returns to the same strict independent read-back path.
```

In `docs/3-state-management.md`, replace the storage-cutover section with:

```md
## Storage Cutover and Recovery

The IndexedDB database is physical version 2 and has six stores: `projects`,
`workspace`, `presets`, `pendingImports`, `migrationLedger`, and `legacyBackup`.
Initial migration validates all projects and presets in memory, writes all six
stores atomically, independently reads them back, and switches authority only
after the ledger becomes `verified`.

Bootstrap classifies storage as empty, current version 2, exact historical
version-1 lineage state, or unrecognized. The historical path validates the
complete workspace and backups, protects an editor-project export, then adds
only missing private incarnations and advances ledger metadata in one exact CAS
transaction. Physical version 2 with a historical ledger is a supported
crash-intermediate state, so retry resumes without clearing or replacing data.

Legacy `localStorage` document keys are retained only as read-only migration and
recovery input. They are monitored for old-tab or rollback drift but never
become a silent editing fallback. This rollout performs no legacy cleanup and no
dual write; divergence blocks editing and preserves every source for explicit
recovery.
```

Keep historical v1 specs/plans unchanged.

- [ ] **Step 7: Run boundary, browser, type, and docs-adjacent build gates**

Run:

```bash
npm run check:workspace-boundary --legacy-peer-deps
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=chromium --project=firefox --project=webkit
npx tsc --noEmit
npm run build --legacy-peer-deps
```

Expected: boundary passes; standard browser matrix passes with only intentional project skips; TypeScript and production build pass.

- [ ] **Step 8: Commit browser proof and current docs**

```bash
git add tests/e2e/fixtures/localWorkspaceMigration.js tests/e2e/local_workspace_migration.spec.js docs/1-high-level-architecture.md docs/3-state-management.md
git commit -m "test(storage): prove v1 lineage browser repair" -m "Seed a real historical database in every supported engine and pin current architecture to the version-2 metadata-only transition."
```

---

### Task 8: Run complete release verification and reviews

**Files:**
- Verify only; modify files only when a failing gate identifies a real defect.

**Interfaces:**
- Consumes: completed Tasks 1–7.
- Produces: fresh release evidence for current HEAD.

- [ ] **Step 1: Install exact dependencies and browser engines if environment changed**

```bash
npm ci --legacy-peer-deps
npx playwright install --with-deps chromium firefox webkit
```

Expected: install exits 0 without lockfile changes.

- [ ] **Step 2: Run focused correction suites**

```bash
npx vitest run tests/unit/localWorkspace/lineageRepair.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/localWorkspace/bootstrap.test.ts tests/unit/recoverySourcePresentation.test.ts tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/localWorkspace/validation.test.ts
```

Expected: all focused test files pass.

- [ ] **Step 3: Run static boundary twice**

```bash
npm run check:workspace-boundary --legacy-peer-deps
npm run check:workspace-boundary --legacy-peer-deps
```

Expected: both independent runs pass with identical test counts.

- [ ] **Step 4: Run full unit, type, and build gates**

```bash
npx vitest run --maxWorkers=4
npx tsc --noEmit
npm run build --legacy-peer-deps
```

Expected: full Vitest suite, TypeScript, and production build all exit 0.

- [ ] **Step 5: Run complete supported browser matrix**

```bash
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=chromium --project=firefox --project=webkit --project=workspace-large-chromium --project=workspace-large-firefox
```

Expected: every applicable migration test passes; only project-declared large-storage skips occur.

- [ ] **Step 6: Run built Worker save proof**

```bash
rm -f /tmp/doctect-built-worker-proof.json
E2E_BUILT_BUNDLE=1 E2E_BUILT_WORKER_COMPLETION_MARKER=/tmp/doctect-built-worker-proof.json npx playwright test tests/e2e/local_workspace_migration.spec.js --project=chromium --grep="coalesces near-limit built-editor interactions before one module-Worker save$" --workers=1 --retries=0
```

Expected: test passes and completion marker exists with non-zero size.

- [ ] **Step 7: Request independent Standards and Spec reviews**

Use `superpowers:requesting-code-review` or repository `code-review` workflow against the implementation base. Require separate findings for:

- documented repository standards and static boundaries; and
- exact compliance with `docs/superpowers/specs/2026-08-18-indexeddb-v2-lineage-repair-recovery-ux-design.md`.

Expected: zero Critical and zero Important findings. Fix any finding through a new RED test and rerun affected gates; do not weaken safety assertions.

- [ ] **Step 8: Inspect final diff and status**

```bash
git status --short
git diff --check
git log --oneline -10
```

Expected: only pre-existing unrelated untracked `.superpowers/brainstorm/` and `scratch/` files remain; tracked implementation is committed; diff check is clean.
