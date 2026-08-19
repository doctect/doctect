# Task 7 Report: Prove Version-1 Repair in Real Browsers

## Status

Implemented on `main` from base `fce5205` under Node `v22.23.2`.

- Added a real physical version-1 IndexedDB fixture with all six stores and no
  indexes.
- Proved automatic metadata-only repair in Chromium and Firefox.
- Attempted every configured standard engine. WebKit is blocked on this host by
  missing system libraries, recorded below without suppression.
- Updated every stale migration e2e selector to Task 5-6 copy.
- Updated current architecture docs only. Historical v1 specs and plans remain
  unchanged.
- Regenerated and verified maintained `onboarding/index.html`.
- Did not install dependencies or stop, reuse, or alter existing dev servers.
- Did not modify or stage unrelated `.superpowers/brainstorm/` or `scratch/`.

## Browser Server Safety

Existing Node servers owned ports `3000` and `3001`. Playwright configuration
has `reuseExistingServer: false`, so all Task 7 browser commands used isolated,
previously free ports `43170` and `43171`:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" E2E_WEB_PORT=43170 E2E_API_PORT=43171 npx playwright test ...
```

Playwright started and stopped only its own server pair. Existing port
`3000`/`3001` processes were not touched.

## TDD RED

Added the named import, approved receipt selector, and repair browser test
before exporting the fixture.

Command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" E2E_WEB_PORT=43170 E2E_API_PORT=43171 npx playwright test tests/e2e/local_workspace_migration.spec.js --grep="repairs recognized version-1 records missing only incarnation before opening editor" --project=chromium
```

Observed collection RED:

```text
SyntaxError: The requested module './fixtures/localWorkspaceMigration.js' does not provide an export named 'prepareHistoricalVersionOneWorkspace'

Error: No tests found.
```

Failure was the intended absent fixture export, not a browser assertion or
server failure.

## Fixture Implementation

`prepareHistoricalVersionOneWorkspace(page)` now:

- Resets local workspace state and seeds byte-exact legacy `localStorage` raw
  values.
- Calls production `captureLegacySnapshot()` and `prepareInitialCopy()` with
  deterministic time and UUID dependencies.
- Produces two historical project records, two preset records, one pending
  import, workspace metadata, verified ledger, and legacy backup.
- Removes only private `incarnation` metadata from project records.
- Sets exact historical ledger metadata: physical version 1, `verified` state,
  revision 1, and deterministic `verifiedAt`.
- Deletes any current database, opens physical database version 1, creates all
  six stores with key path `id`, and creates no indexes.
- Writes every historical record in one six-store transaction.
- Returns raw legacy values, seed evidence, exact expected logical workspace,
  target digest, historical projects, and historical ledger.

## Focused GREEN

Focused Chromium command was the RED command above after fixture export.

```text
Running 1 test using 1 worker
1 passed (7.1s)
```

The proof verifies before editor mount:

- No recovery alert.
- Approved `Your projects are ready` receipt.
- Exact logical workspace and exact legacy raw values.
- Physical database version 2 after bootstrap.
- Six index-free stores.
- Exact historical ledger with only version and revision advanced.
- Unchanged target digest.
- Every historical project unchanged except a non-empty incarnation.

It then continues to editor, reloads, confirms no recovery screen, and proves
every generated incarnation and all legacy raw values remain stable.

## Focused Engine Matrix

Command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" E2E_WEB_PORT=43170 E2E_API_PORT=43171 npx playwright test tests/e2e/local_workspace_migration.spec.js --grep="repairs recognized version-1 records missing only incarnation before opening editor" --project=chromium --project=firefox --project=webkit
```

Result:

```text
chromium: passed
firefox: passed
webkit: browser launch failed
2 passed (15.1s)
1 failed
```

Exact WebKit host error:

```text
Error: browserType.launch:
Host system is missing dependencies to run browsers.
Missing libraries:
    libvpx.so.9
    libavif.so.16
    libmanette-0.2.so.0
```

No application test body ran in WebKit. This is host capability, not a hidden
skip or fabricated pass.

## Migration Selector Update

All migration e2e selectors now use approved source copy:

- `Download projects from before the update`
- `Download older-version projects`
- `Download editor projects`
- `We found two different saved project sets`
- `Add changed projects without replacing anything`
- `Add separate copies`
- `Doctect can’t open your saved projects`
- `We couldn’t finish preparing your projects`

The receipt selector uses `Your projects are ready`. Exact search found no old
receipt, download, recovery-heading, or recovery-action selectors in the spec.

## Full Migration Spec

Command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" E2E_WEB_PORT=43170 E2E_API_PORT=43171 npx playwright test tests/e2e/local_workspace_migration.spec.js --project=chromium --project=firefox --project=webkit
```

Result:

```text
Running 54 tests using 1 worker
32 passed
4 skipped intentionally by project requirements
18 failed at WebKit launch
Duration: 2.5m
```

Every runnable Chromium and Firefox case passed. Each of the 18 WebKit cases
reported only the same missing `libvpx.so.9`, `libavif.so.16`, and
`libmanette-0.2.so.0` launch dependency error.

## Architecture Docs

Current docs now state:

- Physical IndexedDB version is 2.
- Database has six stores.
- Bootstrap recognizes only exact historical version-1 lineage state.
- Historical repair validates complete workspace and backups, preserves an
  editor export, adds only missing private incarnations, and advances ledger
  metadata through one exact CAS transaction.
- Physical version 2 with a historical ledger is a supported retry state.
- Independent read-back remains authority gate.
- Legacy raw input remains read-only and every source is preserved for explicit
  recovery.

No historical v1 spec or plan changed.

## Boundary

Initial command:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npm run check:workspace-boundary --legacy-peer-deps
```

Application boundary checks passed, but the sole test failed because ignored
`reports/lighthouse.html` is still scanned as executable source:

```text
Test Files  1 failed (1)
Tests       1 failed | 614 passed (615)
```

The exact five findings referenced only `reports/lighthouse.html` lines 20,
2822, 2823, and 2852. The report is ignored by Git.

The report was then moved to the authorized path
`/tmp/opencode/doctect-lighthouse-task7.html` behind these safeguards:

- Source-present guard.
- Absent-destination guard.
- `EXIT`, `HUP`, `INT`, and `TERM` restoration traps.
- Source-present and destination-absent post-run checks.
- SHA-256 equality before and after restoration.

Isolated boundary result:

```text
Test Files  1 passed (1)
Tests       615 passed (615)
Duration    22.16s
```

Restoration SHA-256 before and after:

```text
8adbf0cc2b6abad2f1f5cd95f58e144df96381be20e3942a41fbefb309de11d4
```

## TypeScript

Command, rerun after final docs correction:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx tsc --noEmit
```

Result: exit 0 with no output.

## Production Build

Command, rerun after final docs correction:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npm run build --legacy-peer-deps
```

Result:

```text
2454 modules transformed
built in 10.38s
```

Build emitted the existing Vite chunk-size advisory. No build error occurred.
Generated `dist/` output was not staged.

## Onboarding

Final regeneration:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" node onboarding/build.mjs
```

```text
onboarding/index.html written (276 KB, @fce5205)
```

Bundle verification:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx vitest run tests/unit/onboarding/bundle.test.js
```

```text
Test Files  1 passed (1)
Tests       10 passed (10)
Duration    1.99s
```

## Full Vitest

First full run exposed one docs anti-rot failure after the requested prose was
wrapped between `six` and `stores atomically`:

```text
Test Files  1 failed | 232 passed (233)
Tests       1 failed | 3318 passed (3319)
Duration    92.00s
```

The prose was reformatted without changing meaning. Focused correction proof:

```text
PASS tests/unit/docsAntiRot.test.ts (16 tests)
```

Onboarding was regenerated again before the final full run. Final command used
the required worker cap and the same guarded Lighthouse isolation:

```bash
PATH="/home/anoop/.nvm/versions/node/v22.23.2/bin:$PATH" npx vitest run --maxWorkers=4
```

Final result:

```text
Test Files  233 passed (233)
Tests       3319 passed (3319)
Duration    91.48s
```

Existing React Router v7 future-flag warnings and migration logs were emitted.
No test failed. Lighthouse restoration SHA-256 matched, source exists, and the
temporary destination is absent.

## Files

- Added `.superpowers/sdd/task-7-report.md`.
- Modified `tests/e2e/fixtures/localWorkspaceMigration.js`.
- Modified `tests/e2e/local_workspace_migration.spec.js`.
- Modified `docs/1-high-level-architecture.md`.
- Modified `docs/3-state-management.md`.
- Regenerated `onboarding/index.html`.

## Tracked Status Audit

After browser, build, onboarding, and full-suite runs, tracked Task 7 changes
were limited to the files above. No generated Playwright result, report, build
output, log, database, or temporary Lighthouse file appeared as a staged Task 7
change.

Pre-existing user changes remain outside Task 7 staging:

- Modified `.superpowers/sdd/task-6-report.md`.
- Untracked `.superpowers/brainstorm/`.
- Untracked `scratch/`.

## Self-Review

Reviewed against fixed point `fce5205` and Task 7 brief on standards and spec
axes. Repository has no local coding-standards file; baseline smell review found
no issue.

- Fixture non-vacuity: deterministic source has two projects, two custom
  presets, one pending import, workspace metadata, one ledger, and one backup.
- Exact preservation: each repaired project equals its historical record plus
  only a non-empty incarnation; logical workspace, target digest, ledger fields,
  and raw legacy values are pinned.
- Physical schema: version-1 fixture creates all six stores and no indexes;
  repaired version-2 schema is asserted index-free.
- Receipt and recovery: approved receipt is required; recovery alert must be
  absent before editor opening and after reload.
- Reload behavior: every generated incarnation is captured and compared after
  editor continuation and reload.
- Selectors: all source selectors use Task 5-6 terminology; retired terms scan
  is empty.
- Docs truth: statements match `WORKSPACE_DB_VERSION = 2`, exact historical
  classification, atomic repair CAS, crash-intermediate retry, and strict
  independent read-back behavior implemented in Tasks 1-6.
- Scope: no production behavior changed; only browser fixture/proof, current
  docs, maintained onboarding artifact, and this report changed.

## Concerns

- WebKit cannot launch on this host because `libvpx.so.9`, `libavif.so.16`, and
  `libmanette-0.2.so.0` are unavailable. Chromium and Firefox provide complete
  runnable browser evidence; WebKit remains CI/compatible-host verification.
- Full Vitest emits existing React Router future-flag warnings.
- Production build emits existing chunk-size advisory.
- Ignored `reports/lighthouse.html` must remain isolated for the static boundary
  suite on this workspace; guarded restoration was verified byte-for-byte.
- No unresolved Task 7 code or documentation concern.
