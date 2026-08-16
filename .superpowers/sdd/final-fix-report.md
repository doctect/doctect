# Final Review Fix Report: IndexedDB Local Persistence

## Status

Complete. Critical save-lineage defect and Important static-policy/workflow gap from
`final-review-findings.md` are closed. Retained Minors remain unchanged as requested.

- Review base: `6feb8dfffe9c5452225014705d24e81aa88628aa`
- Reviewed head: `25027d07d7591a620ef8d13dda7c14807456e7f4`

## Critical: Admission-Time Project Revision Lineage

- Project save intent now captures its expected storage revision at `commit()` admission instead
  of looking it up when persistence eventually starts.
- A coalesced save retains the admitted base revision while replacing only project bytes.
- A save queued behind an active same-project save uses that local predecessor's next revision.
- Failed/conflicted saves do not advance lineage. Their dependents reject without dispatch, and a
  later retry remains based on the original revision instead of adopting foreign state.
- Post-command readback preserves revisions only for pending, queued-close, or conflicted local
  intent. Unrelated projects and successfully drained terminal saves adopt independently observed
  durable revisions.
- `LocalWorkspaceStore` verifies the pinned revision immediately before adapter dispatch, advances
  its private revision only from the successful adapter result, and removes closed-project state.

### Tests

- Added direct mutation-queue coverage for coalescing, active-save successors, failure propagation,
  and retry lineage.
- Added real two-store fake-IndexedDB cases proving an unrelated readback cannot rebase stale bytes,
  an in-flight successor stays on its local lineage, unpinned projects adopt foreign revisions, and
  a terminal save can adopt a foreign post-save revision after its lineage drains.

## Important: Static Policy and Workflow Graph

- Static-policy scan now includes root entries `App.tsx`, `index.tsx`, `index.html`, and `types.ts`,
  plus `lib/**`, `shared/**`, `constants/**`, and `server/**` alongside existing roots.
- Existing TypeScript checker/symbol protections remain intact.
- Exact legacy-access allowlist remains only:
  - `services/localWorkspace/legacyTypes.ts`
  - `tests/e2e/fixtures/localWorkspaceMigration.js`
- Added eight adversarial production-path cases and an exact workflow-path contract test.
- Pull-request workflow now triggers for all newly covered root and production paths.

## TDD Evidence

- Baseline before edits: `npm test -- --run` passed 225 files and 2,410 tests.
- Initial RED: 14 failures exposed stale save rebasing, coalesced/in-flight/failure lineage gaps,
  omitted policy roots, and omitted workflow paths. The unpinned-project adoption control passed.
- Review RED: terminal local save returned foreign revision 2, but its next edit dispatched stale
  revision 1 and rejected with `WorkspaceStoreError: storage revision changed`.
- Focused GREEN after final fix:
  `npx vitest run tests/unit/localWorkspace/commit.test.ts tests/unit/localWorkspace/mutationQueue.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/localWorkspaceBoundary.test.ts`
  passed 4 files and 163 tests.
- Boundary GREEN: 62/62 tests, including 53 prior adversarial cases and 9 new graph/workflow cases.

## Supported Browser Evidence

- Official image:
  `mcr.microsoft.com/playwright:v1.57.0-noble@sha256:3bed4b1a12f2338642f3d8cba28e291deef3c66bd4a964bbeb3e57bbff511dbd`
- Runtime check printed:
  `{"node":"v22.23.2","platformOverride":null,"skipHostValidation":null}`
- Neither `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` nor
  `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS` was set.
- Final command used the exact final worktree, `--ipc=host`, serialized workers, no retries, and
  the official image above:
  `npx playwright test tests/e2e/local_workspace_migration.spec.js --workers=1 --retries=0 --reporter=line`
- Result: 47 passed, 3 intentional standard-project large-source skips, 0 failed, in 3.6 minutes
  across Chromium, Firefox, WebKit, `workspace-large-chromium`, and
  `workspace-large-firefox`.

### Environment Diagnosis

Initial Docker setup exhausted the host root partition. Chromium traces then showed repeated module
requests failing with `net::ERR_INSUFFICIENT_RESOURCES` after several reloads. Mounting container
`/tmp` as tmpfs moved Chromium profile/cache writes off the full Docker overlay. Both isolated
Chromium failures passed 2/2, then the complete matrix passed. No product or browser-test change was
needed for this environment failure.

## Final Verification

- `npm test -- --run`: 226/226 files and 2,426/2,426 tests passed in 35.68 seconds.
- `npx tsc --noEmit`: exited 0 with no diagnostics.
- `npm run build`: passed after transforming 2,449 modules in 11.78 seconds. Existing large-chunk
  warning remains.
- Focused lineage/policy run: 163/163 tests passed.
- Supported browser matrix: 47 passed, 3 intentional skips.
- `git diff --check`: passed.

Two unrelated existing load-sensitive failures were diagnosed rather than hidden. A parallel
verification attempt timed out `accountModeration.test.js` setup; it passed 59/59 in isolation and
the uncontended full rerun passed. A later full run saw one `GalleryDetailPage` account-authority
mock failure; that file passed 17/17 in isolation and the unchanged complete rerun passed 2,426/2,426.

## Review

- Standards axis: no repository coding-standards document exists. In-thread review found no
  blocking Fowler-baseline smell, unsafe error path, or type-safety issue.
- Spec axis: both findings are fully implemented; exact allowlist and retained-Minor constraints are
  preserved. Review also found and closed the terminal-lineage adoption edge described above.
- Review ran in-thread because this harness exposes no subagent tool.

## Files Changed

- `.github/workflows/local-workspace-migration.yml`
- `services/localWorkspace/LocalWorkspaceStore.ts`
- `services/localWorkspace/mutationQueue.ts`
- `tests/unit/localWorkspace/commit.test.ts`
- `tests/unit/localWorkspace/mutationQueue.test.ts`
- `tests/unit/localWorkspaceBoundary.test.ts`

## Concerns

- No release blocker remains.
- Existing React Router future-flag warnings and Vite chunk-size warning are unchanged.
- Host Docker storage remains nearly full; local browser verification needs tmpfs or freed Docker
  storage. This does not affect application behavior or supported-host results.
