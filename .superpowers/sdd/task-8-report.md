# Task 8 Report: Editor Working Copies, Save States, and Navigation Protection

## Status

Complete. `/app` now waits for verified workspace authority, EditorPage consumes only the supplied snapshot and semantic store commands, and editor changes use immediate generation-tracked working copies over durable snapshots.

## Implementation

- Replaced EditorPage legacy project loading, localStorage autosave, active-project persistence, blank repair, and staged-import consumption with `LocalWorkspaceStore` commands and `useWorkspaceProjectWrites`.
- Added per-project saving, saved, failed, and conflict states. Failed copies stay open; retry uses the newest generation; JSON actions export the newest working `initialState`.
- Converted create, activate, close, generated-project, cloud-link, and cloud-restore operations to await one semantic command and apply only its returned durable snapshot.
- Changed ProjectEditor state reporting from a 1,000 ms timer to an immediate identity-based effect that emits zero initial commands under React StrictMode replay.
- Made generated-project callbacks asynchronous through ProjectEditor and both generator modal layers; analytics fire only after durable creation succeeds.
- Replaced BrowserRouter with a data router, routed `/app` through `WorkspaceBootstrapGate` and public `localWorkspaceStore`, preserved gallery background-modal routing, and added `useBlocker`, conditional `beforeunload`, and an initially focused alertdialog.
- Moved production cloud project types to the public local-workspace seam.

## TDD Evidence

- Initial RED: `npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx` failed as expected. The hook suite could not resolve the absent hook; all 13 EditorPage cases rendered the legacy blank/localStorage path instead of the supplied verified snapshot and semantic commands.
- Callback/StrictMode RED: generator preview, hierarchy generator, and ProjectEditor suites reported 4 failures with 41 passing. Promise callbacks were treated as immediate truthy success, and the old timer emitted initial state during StrictMode replay.
- Review RED: the new stale-command-error regression failed 1/15 because an older failure remained visible after a newer command succeeded.
- Final focused GREEN: the exact nine-suite Task 8 command passed 81/81 tests across 9 files.

## Detector

- Ran the required detector exactly once over the exact Task 8 UI target list.
- It reported 9 warnings, all inspected as false positives in incumbent code: three rounded spinner `border-b-2` rules, one editor state-class ternary, one slate editor divider, one hierarchy toggle ternary, and two TabBar state/hover ternaries.
- No detector-driven UI edit was valid. Tests, not the detector, were rerun after review changes.

## Verification

- Full Vitest run, exactly once: 220/220 files and 2,279/2,279 tests passed in 41.60 seconds. The known moderation timeout did not occur.
- Production build: `npm run build` passed after transforming 2,448 modules. Existing large-chunk warning remains.
- `npx tsc --noEmit` reports only the known five unrelated baseline diagnostics: one in `changePassword.test.tsx`, three in `loginEmailVerification.test.tsx`, and one in `svgEditing.test.ts`.
- `git diff --check` passes.
- Additional direct test dependencies updated: `EditorPageGeneratorMetadata.test.tsx` now supplies verified snapshots without preempting Task 11 import handling; `CloudMenu.test.tsx` now expects one combined restore callback.

## Self-Review

- Standards axis: no repository standards file exists; no blocking Fowler-baseline smell found. EditorPage remains one integration surface because the command handlers are not reusable modules.
- Spec axis: all brief requirements are represented in implementation and tests, including initial zero-write StrictMode behavior, stale overlays, failure retention, command failures, generated metadata, cloud saves, latest JSON, durable-success analytics, retry, save states, data-router modal behavior, and navigation protection.
- Review found and fixed one stale semantic-command error race with a failing regression before the production fix.
- No unresolved Task 8 code finding remains.

## Concerns

- Five unrelated TypeScript baseline diagnostics remain unchanged.
- Build retains its existing large-chunk warning.
- Desktop/mobile wired-surface screenshots and controller finish review remain the requested controller gate after implementation; they were not run here.

## Critical and Important Review Fix Wave

### Implementation

- Project saves now reject stale generations before changing durable refs, working copies, save states, or rendered structure. Current save responses reconcile only their project into the latest structural snapshot.
- Project writes now use synchronous updater functions over the newest working copy, so root-title and document-state effects compose instead of rebuilding from one render's stale project.
- Cloud link and restore writes now use the same generation-aware hook path as editor changes, retain failed working copies for retry, and preserve newer edits across backward completions.
- Structural create, activate, and close callbacks use one monotonic authority generation, so stale successes and errors cannot replace newer editor structure or messaging.
- The unsaved-navigation alertdialog now captures and restores its opener, traps Tab and Shift+Tab, and makes the editor shell inert and hidden from accessibility APIs while open.
- CloudMenu retains failed local-link IDs and updated heads without repeating remote creation or commit calls. Pending links are isolated by local project ID across tab switches.

### TDD Evidence

- Initial review RED: the exact seven-suite covering command reported 17 failing and 35 passing tests. Failures reproduced stale whole-snapshot replacement, non-composable updates, direct cloud writes, stale structural authority, missing dialog isolation, and repeated cloud remote writes.
- Stale-error RED: the focused hook case failed with `expected false to be true`, proving a superseded save error still leaked failure to its caller.
- Project-isolation RED: the focused CloudMenu rerender case exposed `Retry local link` on a different local project instead of `Save to cloud (new)`.
- Final covering GREEN: the exact seven-suite command passed 53/53 tests across 7 files.
- Original Task 8 regression GREEN: the exact nine-suite command passed 89/89 tests across 9 files.

### Verification

- Full Vitest run, exactly once for this fix wave: 220/220 files and 2,290/2,290 tests passed in 40.28 seconds.
- `npm run build` passed after transforming 2,448 modules in 12.18 seconds; the existing large-chunk warning remains.
- `npx tsc --noEmit` still reports only the same five unrelated baseline diagnostics in `changePassword.test.tsx`, `loginEmailVerification.test.tsx`, and `svgEditing.test.ts`.
- Review found no remaining Critical or Important issue in the fix diff. No repository coding-standard file exists; the diff has no blocking Fowler-baseline smell.
- The Impeccable detector was not rerun. Screenshots remain deferred to the requested controller gate.

## Cross-Authority Review Fix

### Implementation

- Replaced EditorPage's independent structural generation clock and direct snapshot publication with `commitStructural` on the workspace-write hook.
- Structural intents now enter one invocation-ordered queue. Each successful store result is reconciled and rendered before the next intent executes, while failures leave all earlier successful structure visible.
- Structural reconciliation takes project order, additions, removals, active project, presets, and pending imports from the returned snapshot. Surviving project payloads come from the latest hook-owned durable generation, with current working copies overlaid.
- Removed-project generations are invalidated inside reconciliation, preventing pending save completions from restoring closed projects or stale save states.

### TDD Evidence

- Focused RED: `npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx` reported 3 failing and 29 passing tests. Failures were missing `commitStructural`, stale structural content replacing scale 9 with scale 1, and an ignored successful activation leaving UI on Project A while mock durable state was Project B.
- Focused GREEN: the same command passed 32/32 tests across 2 files.
- Final covering GREEN: the exact seven-suite command passed 55/55 tests across 7 files.
- Original Task 8 regression GREEN: the exact nine-suite command passed 91/91 tests across 9 files.

### Verification

- Full Vitest run, exactly once for this fix wave: 220/220 files and 2,292/2,292 tests passed in 39.21 seconds.
- `npm run build` passed after transforming 2,448 modules in 11.45 seconds; the existing large-chunk warning remains.
- `npx tsc --noEmit` still reports only the same five unrelated baseline diagnostics in `changePassword.test.tsx`, `loginEmailVerification.test.tsx`, and `svgEditing.test.ts`.
- Review found no remaining Critical or Important cross-authority issue. No Minor finding was addressed.
- The Impeccable detector was not rerun. Screenshots remain deferred.
