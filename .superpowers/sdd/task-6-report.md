# Task 6 Report: Old-Tab Drift and Recovery Copies

## Status

Complete. IndexedDB remains authoritative after migration, divergent legacy data is retained as exact recovery evidence, and users must explicitly recover changed legacy records as local copies.

## Implementation

- Freeze new workspace commands synchronously on matching legacy storage events, drain commands accepted before the freeze, hash the retained source, and persist a compare-and-swap `legacy-drift` marker.
- Recheck retained legacy bytes during bootstrap so missed storage events enter the same split-brain recovery flow.
- Export exact `legacy-current` and `legacy-original` raw values, including absent-versus-empty state, plus an independently read and validated `indexeddb-workspace` snapshot.
- Recover only new or changed projects, presets, and pending imports with collision-safe IDs; retain IndexedDB deletions and active-project authority; strip stale cloud linkage.
- Commit recovered records, conflict backup, accepted-source pointer, ledger revision, and marker resolution in one IndexedDB transaction.
- Revalidate IndexedDB and legacy authorities after recovery, reopen recovery on immediate further drift, and close/freeze on IndexedDB `versionchange`.
- Advertise copy recovery only while the stable current legacy digest still matches the persisted recovery marker.

## TDD Evidence

- Initial RED: `npx vitest run tests/unit/localWorkspace/drift.test.ts tests/unit/localWorkspace/recovery.test.ts` failed because recovery exports and drift handling were absent.
- Review RED: stale-marker capability regression failed with `expected true to be false` before the marker/source digest guard.
- Focused GREEN: `npx vitest run tests/unit/localWorkspace/drift.test.ts tests/unit/localWorkspace/recovery.test.ts tests/unit/localWorkspace/commit.test.ts` passed 67/67 tests.

## Verification

- Final full load run: 215/216 files passed and 2,161 tests passed; `tests/unit/server/accountModeration.test.js` hit its documented 10-second setup timeout before running 59 tests.
- Required isolation: `npx vitest run tests/unit/server/accountModeration.test.js` passed 59/59 tests in 6.53 seconds.
- Earlier local-workspace sweep passed 299/299 tests; bootstrap isolation passed 67/67 tests before the final focused regression was added.
- `npx tsc --noEmit` reports only five existing unrelated errors: one in `changePassword.test.tsx`, three in `loginEmailVerification.test.tsx`, and one in `svgEditing.test.ts`.
- `git diff --check` passes.

## Self-Review

- Added malformed-source capability validation, post-transaction independent target validation, versionchange generation guards, and cold legacy export typing during review.
- Added and fixed a race where legacy could change after marker persistence but before capability calculation.
- No unresolved Task 6 findings.

## Critical and Important Review Fixes

### Status

All requested Critical and Important findings are fixed in one follow-up wave. The unrelated reviewer Minor concerning the recovery-store assertion was intentionally not changed and remains queued for final-review triage.

### Implementation

- Stable legacy capture now checks event generation, hashes a recapture, and synchronously captures once more after hashing. Byte-identical events retry; byte changes never publish stale ready state, drift markers, or recovery capabilities.
- Drift-marker CAS conflicts now reread the winning ledger and recapture live legacy bytes before retrying. Persisted marker digest and returned recovery capabilities therefore describe the same stable source generation.
- Recovery commands retain a lifecycle generation and assert it after every asynchronous boundary, after the recovery transaction, and before restoring ready authority. Lifecycle loss remains unavailable, and ready is impossible while a recovery marker remains unresolved.
- Recovery preparation now builds and validates the complete target write set outside IndexedDB transactions. The transaction compares exact expected ledger and workspace records, then writes only prepared projects, workspace, presets, imports, backup, and ledger.
- Recovery ID allocation uses one reservation namespace covering durable, current-source, accepted-source, pending-target, and private consumed-import identities before generating any project, preset, import, or target ID.
- `legacy-original` exports the original backup's persisted `capturedAt`; live exports continue to use export time.
- Legacy storage remains read-only, raw backup bytes remain exact, queue freeze/drain behavior remains intact, and recovery still never auto-merges or deletes either authority.

### Review-Fix RED

- Eleven requested regressions were added and observed failing in focused runs before production changes. Failures demonstrated late-hash ready publication, stale drift-marker publication, stale CAS snapshots, post-recovery lifecycle restoration, invalid target writes entering a transaction, cross-namespace/source-only ID reuse, and export-time substitution for original capture time.
- Intermediate five-suite run after the first implementation passed 180/191 tests. The 11 failures were superseded read-count and transaction-timing expectations; updating those expectations exposed no additional production failure.
- Self-review added two more regressions. `npx vitest run tests/unit/localWorkspace/bootstrap.test.ts tests/unit/localWorkspace/recovery.test.ts -t "refuses copied ready|keeps recovery open"` failed 2/2 because copied bootstrap returned ready after a reentrant finishing-phase source change and post-recovery returned ready with a persisted drift marker after source reversion.

### Review-Fix GREEN

- The same two self-review regressions passed 2/2 after restoring the final synchronous copied-source check and requiring `unresolvedRecovery === null` before post-recovery ready publication.
- Required five-suite command passed 193/193 tests across 5 files in 4.55 seconds.
- Required Task 6 focused command passed 75/75 tests across 3 files in 3.91 seconds.
- Full `tests/unit/localWorkspace` sweep passed 314/314 tests across 9 files in 4.52 seconds.
- `npx tsc --noEmit` reports only the same five unrelated baseline test diagnostics: one in `changePassword.test.tsx`, three in `loginEmailVerification.test.tsx`, and one in `svgEditing.test.ts`.
- `git diff --check` passes.

### Review-Fix Self-Review

- Standards axis: no documented repository-standard violation or blocking smell found. Hashing, parsing, and target validation remain outside active write transactions; transaction code is limited to exact CAS reads and prepared writes.
- Spec axis: each Critical/Important finding has direct regression coverage. Stable capture, marker publication, capability reporting, recovery lifecycle, complete target validation, global ID reservation, and original capture metadata now match the requested behavior.
- Additional authority review found and fixed two ready-publication gaps: reentrant source mutation after copied verification and source reversion while a post-recovery marker remained persisted.
- No unresolved Critical or Important finding remains. Deferred Minor: recovery-store assertion triage only.

## Remaining Critical and Important Fixes

### RED

- `npx vitest run tests/unit/localWorkspace/recovery.test.ts -t "appends recovered|retains a concurrent"` failed 2/2 selected tests with 21 skipped in 2.11 seconds.
- Concurrent post-commit marker regression received `ready` instead of `recovery` after legacy bytes changed and ABA-reverted around the final hash.
- Gapped-position regression rejected recovery with `Preset record positions must be unique and contiguous.` before it could prove max-position append behavior.

### Implementation

- Recovery now independently rereads the recognized ledger after target and legacy postchecks. A persisted marker immediately restores recovery authority; otherwise the complete ledger must exactly match the transaction's resolved ledger and retain `unresolvedRecovery: null` before ready publication.
- Preset and pending-import recovery positions start after the maximum persisted position. Multiple recovered presets retain source order through consecutive positions.
- Target reconstruction now accepts gaps while retaining nonnegative-integer and uniqueness checks, allowing stable persisted-order reconstruction and recovery without position reuse.

### GREEN

- The selected regressions passed 2/2 with 21 skipped in 2.15 seconds.
- Requested recovery/drift/bootstrap command passed 109/109 tests across 3 files in 4.21 seconds.
- Original Task 6 drift/recovery/commit command passed 77/77 tests across 3 files in 4.26 seconds.
- Migration preparation passed 47/47 tests; full local-workspace sweep passed 316/316 tests across 9 files.
- `npx tsc --noEmit` retains only the same five unrelated baseline test diagnostics. `git diff --check` passes.
- Deferred Minor unchanged: repeated-store assertion remains queued for final-review triage.
