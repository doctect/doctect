# Task 3 Report: Commit Lineage Repair Through Exact Adapter CAS

## Status

Implemented on `main` from base `8fdfdbb`.

- Intended commit subject: `fix(storage): commit lineage repair atomically`
- Scope: closed repair fault points and private adapter operation only
- Unrelated `.superpowers/brainstorm/` and `scratch/` files were not modified

## Implementation

Added `repairHistoricalLineage(prepared: PreparedLineageRepair): Promise<void>`
to the IndexedDB adapter only.

- Opens one `readwrite` transaction over exactly `projects` and
  `migrationLedger`.
- Compares the current migration ledger with the exact historical ledger.
- Compares the sorted current project key set with the exact prepared key set.
- Compares every current project record with its exact prepared historical
  record.
- Writes only prepared replacement project records and the prepared version-2
  ledger.
- Awaits all write requests and transaction completion before resolving.
- Aborts and drains the transaction on every fault, conflict, or IndexedDB
  failure.
- Adds four closed fault points covering transaction startup, project writes,
  ledger write, and completion.

## Files

- Modified `services/localWorkspace/faults.ts`.
- Modified `services/localWorkspace/indexedDbAdapter.ts`.
- Modified `tests/unit/localWorkspace/indexedDbAdapter.test.ts`.
- Regenerated maintained artifact `onboarding/index.html`.
- Included `.superpowers/sdd/task-3-brief.md`.
- Replaced stale ignored `.superpowers/sdd/task-3-report.md` with this report.

## TDD RED

Tests were added before production fault literals or adapter method.

Command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected missing-method failure observed:

```text
FAIL  tests/unit/localWorkspace/indexedDbAdapter.test.ts (85 tests | 7 failed) 253ms

TypeError: adapter.repairHistoricalLineage is not a function
TypeError: left.repairHistoricalLineage is not a function

Test Files  1 failed (1)
Tests       7 failed | 78 passed (85)
Duration    1.74s
```

Compiler RED command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx tsc --noEmit
```

Exact compiler output:

```text
tests/unit/localWorkspace/indexedDbAdapter.test.ts(67,3): error TS2322: Type '"lineage-repair.before-transaction"' is not assignable to type 'WorkspaceFaultPoint'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(68,3): error TS2322: Type '"lineage-repair.after-project-write"' is not assignable to type 'WorkspaceFaultPoint'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(69,3): error TS2322: Type '"lineage-repair.after-ledger-write"' is not assignable to type 'WorkspaceFaultPoint'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(70,3): error TS2322: Type '"lineage-repair.before-complete"' is not assignable to type 'WorkspaceFaultPoint'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(880,19): error TS2339: Property 'repairHistoricalLineage' does not exist on type 'IndexedDbAdapter'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(895,52): error TS2322: Type '"lineage-repair.before-transaction" | "lineage-repair.after-project-write" | "lineage-repair.after-ledger-write" | "lineage-repair.before-complete"' is not assignable to type 'WorkspaceFaultPoint'.
  Type '"lineage-repair.before-transaction"' is not assignable to type 'WorkspaceFaultPoint'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(898,26): error TS2339: Property 'repairHistoricalLineage' does not exist on type 'IndexedDbAdapter'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(928,28): error TS2339: Property 'repairHistoricalLineage' does not exist on type 'IndexedDbAdapter'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(942,12): error TS2339: Property 'repairHistoricalLineage' does not exist on type 'IndexedDbAdapter'.
tests/unit/localWorkspace/indexedDbAdapter.test.ts(943,13): error TS2339: Property 'repairHistoricalLineage' does not exist on type 'IndexedDbAdapter'.
```

Both RED runs failed only at intentionally absent Task 3 seams.

## Focused GREEN

Adapter command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Terminal summary:

```text
PASS  tests/unit/localWorkspace/indexedDbAdapter.test.ts (85 tests) 261ms

Test Files  1 passed (1)
Tests       85 passed (85)
Duration    1.80s
```

Coverage includes exact success writes, rollback at all four repair fault
points, changed-ledger conflict, changed-project conflict, changed-key-set
conflict, and one winner across two concurrent attempts.

## TypeScript

Command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx tsc --noEmit
```

Output:

```text
(no output; exit 0)
```

## Onboarding Artifact

Build command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" node onboarding/build.mjs
```

Output:

```text
onboarding/index.html written (276 KB, @8fdfdbb)
```

Bundle command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx vitest run tests/unit/onboarding/bundle.test.js
```

Terminal summary:

```text
PASS  tests/unit/onboarding/bundle.test.js (10 tests) 665ms

Test Files  1 passed (1)
Tests       10 passed (10)
Duration    2.05s
```

## Full Vitest Suite

An initial full-suite command ran before the ignored Lighthouse artifact was
properly isolated:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx vitest run --maxWorkers=4
```

It produced one environmental boundary failure because
`reports/lighthouse.html` is ignored by Git but still scanned by the static
boundary test:

```text
Test Files  1 failed | 231 passed (232)
Tests       1 failed | 3300 passed (3301)
Duration    91.35s

FAIL tests/unit/localWorkspaceBoundary.test.ts
Workspace boundary violations:
reports/lighthouse.html:20: passes a browser global outside approved static access
reports/lighthouse.html:2822: passes a browser global outside approved static access
reports/lighthouse.html:2822: accesses production localStorage outside approved persistence modules
reports/lighthouse.html:2823: passes a browser global outside approved static access
reports/lighthouse.html:2852: passes a browser global outside approved static access
```

Root cause was confirmed from the boundary walker: it recursively scans every
executable extension, including `.html`, and `reports/` is not in its explicit
excluded-directory set. Git ignore status does not affect that traversal.

The failing boundary suite then passed with the report moved and restored
under traps:

```text
PASS  tests/unit/localWorkspaceBoundary.test.ts (615 tests) 19272ms

Test Files  1 passed (1)
Tests       615 passed (615)
Duration    22.11s
```

Clean full-suite command used the requested worker limit and guarded report
restoration under `EXIT`, `HUP`, `INT`, and `TERM` traps:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH"; export PATH; source_report="reports/lighthouse.html"; temporary_report="/tmp/opencode/doctect-lighthouse-task3.html"; restore_lighthouse() { if [[ -e "$temporary_report" ]]; then mv -- "$temporary_report" "$source_report"; fi; }; test -e "$source_report" && test ! -e "$temporary_report" && trap restore_lighthouse EXIT HUP INT TERM && mv -- "$source_report" "$temporary_report" && npx vitest run --maxWorkers=4; status=$?; restore_lighthouse; trap - EXIT HUP INT TERM; test -e "$source_report" && test ! -e "$temporary_report" || exit 1; exit "$status"
```

Terminal summary:

```text
Test Files  232 passed (232)
Tests       3301 passed (3301)
Duration    91.31s
```

Suite emitted existing React Router future-flag warnings and migration logs.
No test failed in the isolated run.

### Lighthouse Restoration

Before isolation and after restoration:

```text
reports/lighthouse.html 700754 bytes 2026-01-04 17:01:56.797546259 -0800
```

- `/tmp/opencode/doctect-lighthouse-task3.html` was absent before moving.
- Original report size and timestamp remained unchanged after restoration.
- Source report exists after the suite.
- Temporary destination is absent after the suite.

## Self-Review

Reviewed worktree diff against fixed point `8fdfdbb` on standards and spec
axes. No repository coding-standard file was present.

### Concurrency

- Both attempts require overlapping `readwrite` transactions on `projects` and
  `migrationLedger`, so IndexedDB serializes their compare/write sequences.
- Winner advances ledger; loser reads changed ledger and returns `conflict`.
- Test proves exactly one fulfillment and one exact conflict.

### Rollback

- Pre-transaction fault maps directly without opening a transaction.
- Every later fault enters `abortTransaction`, aborts, and waits for queued
  requests plus `transaction.done` to settle.
- Fault matrix compares every store before and after, proving historical state
  remains byte-for-byte structurally unchanged.

### Exact CAS

- Ledger comparison uses `canonicalStringify` against `expectedLedger`.
- Project key sets are normalized to sorted strings and compared exactly.
- Every expected project is fetched by ID and compared canonically before any
  replacement is queued.
- No workspace, preset, pending-import, or backup store joins the transaction.

### Error Mapping

- Deliberate `WorkspaceStoreError` conflicts survive `mappedError` unchanged.
- Fault and IndexedDB failures use existing adapter mapping and abort path.
- Transaction startup failures are handled even when no transaction exists.

### Transaction Completion

- All `put` promises resolve before `repairTransaction.done` is awaited.
- Adapter method cannot resolve before atomic transaction completion.

### API Scope

- Only specified method was added to `IndexedDbAdapter` and returned adapter
  object.
- No standalone export, workspace service method, command, or UI API was added.
- Four new fault literals are exactly those required by the closed matrix.

### Review Findings

- Standards findings: 0.
- Spec findings: 0.
- Smell-baseline findings: 0.
- `git diff --check` returned no output.

## Concerns

- No implementation concern found within Task 3 scope.
- First full-suite attempt exposed ignored Lighthouse artifact handling; clean
  trapped rerun is green and original artifact is restored.
- Full suite retains pre-existing React Router warnings and migration logs.
