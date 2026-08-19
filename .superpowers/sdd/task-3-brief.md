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
