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
