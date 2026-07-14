# Task 4 Report: Persistence, Publishing, Gallery, and History

## Status

Implemented Task 4. External project-load boundaries now normalize optional generator metadata with recoverable warnings, server saves validate metadata strictly, publishing warns before exposing source, existing full-state APIs retain source unchanged, and user documentation explains lifecycle and safety.

## RED / GREEN

### RED

- Added strict server cases for valid metadata, unknown fields, wrong format, wrong script types, invalid timestamp, both per-script byte limits, and total-state-size precedence.
- Added malformed metadata cases for local storage, staged gallery imports, JSON modal saves, and history restore.
- Added publish warning and Hierarchy Generator help-copy assertions.
- Added exact whitespace/Unicode transport evidence for codec, cloud commit fetch, gallery state fetch, fork first commit, history restore/clone, and gallery open/fork staging.
- Added metadata-bearing ZIP fixture proving PDF entry names and count do not change.
- Initial RED run produced 13 expected behavioral failures across strict validation, load normalization/warnings, publish warning, and help text. `PublishModal` initially hit a `DOMMatrix` test-environment import error; PDF dependencies were isolated in the test, then the warning assertion failed for the expected missing behavior.

### GREEN

- Focused Task 4 suites plus Hierarchy Generator help test: 11 test files, 91 tests passed.
- Full unit suite: 104 test files, 832 tests passed.
- Production build: passed.

## Load-Warning UX

- `EditorPage` uses `loadSavedProjects()` to load local projects once and initialize both projects and warnings.
- Local malformed generator metadata is detached without blocking the document.
- Staged gallery/fork/history-clone imports are normalized once in `EditorPage`; their warnings append to the same dismissible amber `role="alert"` banner.
- `JsonModal` saves normalized state, closes, then alerts once with joined warnings.
- Restore-mode `HistoryModal` restores normalized state, then alerts once. Clone mode keeps raw state for `EditorPage` normalization.
- Fatal JSON/migration handling remains on existing paths.

## Strict Validation

- `server/validateAppState.js` retains the 5 MiB total-state check before detailed validation.
- Optional `state.generator` now calls `validateGeneratorProvenance(..., { strictUnknownFields: true })`.
- Invalid shape, unknown keys, unsupported format, script types/sizes, and timestamp fail server save validation.
- Projects without generator metadata remain valid.

## Exact Round Trips

Whitespace, CRLF/LF differences, tabs, Unicode identifiers, and Unicode content are asserted byte-exactly through:

- gzip codec encode/decode;
- cloud commit create/fetch;
- gallery public state fetch;
- fork first commit fetch;
- history restore and raw clone callbacks;
- gallery Open in Editor staging;
- gallery fork staging with cloud linkage;
- JSON modal import;
- EditorPage JSON download.

Commit, codec, gallery, fork, and import payload shapes were not changed. Tests prove nested metadata travels through existing full-state storage.

## Publish Copy

Projects containing `initialState.generator` show an amber `role="alert"` before publish confirmation:

> This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information. To exclude source, cancel, use “Detach Saved Generator” in Hierarchy Generator, and save to cloud before publishing.

Projects without generator metadata show no generator warning. Existing general visibility copy and publish behavior remain unchanged.

## Documentation

Updated advanced docs, in-app docs, and Hierarchy Generator help text to cover:

- exact source retention across local, JSON, cloud, history, gallery, and fork paths;
- public visibility on publish and detach-before-publish guidance;
- inert project/source opening;
- sandboxed Preview with fixed 10-second timeout;
- replacement semantics for Apply Generated Project;
- Detach Saved Generator;
- no reverse synchronization from manual edits.

## Full Verification

- `npx vitest run tests/unit/server/validateAppState.test.js tests/unit/server/stateCodec.test.js tests/unit/server/commitStorage.test.js tests/unit/server/gallery.test.js tests/unit/HistoryModal.test.tsx tests/unit/GalleryDetailPage.test.tsx tests/unit/generateVariantsZip.test.ts tests/unit/PublishModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx`: 11 files, 91 tests passed.
- `npx vitest run`: 104 files, 832 tests passed.
- `npm run build`: passed; Vite retained its existing large-chunk warning.
- `git diff --check`: passed.
- Additional `npx tsc --noEmit`: fails on unchanged existing narrowing errors in `HierarchyGeneratorModal.tsx`, `changePassword.test.tsx`, `loginEmailVerification.test.tsx`, and `svgEditing.test.ts`. Task 4 changed hunks add no reported TypeScript errors, and Vite production build passes.

## Files

Production and docs:

- `pages/EditorPage.tsx`
- `components/JsonModal.tsx`
- `components/cloud/HistoryModal.tsx`
- `components/cloud/PublishModal.tsx`
- `components/HierarchyGeneratorModal.tsx`
- `server/validateAppState.js`
- `docs/6-advanced-features.md`
- `pages/DocsPage.tsx`

Tests:

- `tests/unit/PublishModal.test.tsx`
- `tests/unit/EditorPageGeneratorMetadata.test.tsx`
- `tests/unit/JsonModalGeneratorMetadata.test.tsx`
- `tests/unit/HistoryModal.test.tsx`
- `tests/unit/GalleryDetailPage.test.tsx`
- `tests/unit/HierarchyGeneratorModal.test.tsx`
- `tests/unit/generateVariantsZip.test.ts`
- `tests/unit/server/validateAppState.test.js`
- `tests/unit/server/stateCodec.test.js`
- `tests/unit/server/commitStorage.test.js`
- `tests/unit/server/gallery.test.js`

## Concerns

- `npm install` cannot resolve the repository's existing peer mismatch: `better-auth@1.4.10` optionally expects `better-sqlite3@^12`, while the project pins `^9.6.0`. Existing installed dependencies were used for verification.
- Vite reports existing bundles above 500 kB after minification.
- Repository-wide standalone TypeScript check has unchanged existing failures listed above; unit suite and production build pass.
- No Task 4 functional blocker found during self-review. Progress ledger was not touched.

## Review Fix: Cloud-Authoritative Publishing

### RED

- Added divergent-state tests where local source is detached but cloud head contains source, and where local source exists but cloud head does not.
- Added a deferred disclosure load proving Publish was incorrectly enabled before cloud authority resolved.
- RED result: `PublishModal.test.tsx` had 3 expected failures. Cloud-only source did not warn, local-only source falsely warned, and loading did not disable Publish.

### GREEN

- `PublishModal` now fetches `cloudApi.getProject(cloudProjectId)`, rejects a null head, then fetches that exact `headCommitId` with `cloudApi.getCommit`.
- Generator disclosure derives solely from the fetched cloud head state. Local `project.initialState.generator` is never used as fallback.
- Publish stays disabled while disclosure is loading or failed. Loading has `role="status"`; errors have a recoverable `role="alert"` with Retry.
- Existing publish request payload remains `{ description, tags, thumbnails }`.
- Strengthened history clone and gallery open/fork staging fixtures with schema-v8 malformed metadata. Eager normalization would migrate schema to v9 and detach metadata, so exact raw assertions now prove those boundaries do not normalize.
- Strengthened `EditorPage` staged-import evidence to assert it alone migrates that schema-v8 state to v9 and detaches malformed metadata.
- Focused review suites: 7 files, 64 tests passed.
- Full unit suite: 104 files, 834 tests passed.
- Production build: passed with the existing large-chunk warning.

### Cloud-Authority Rationale

Publishing exposes the cloud project's current head commit, not the mutable local editor snapshot. Disclosure must therefore inspect the same cloud head selected by the publish endpoint. Fetching project metadata first identifies the authoritative head; fetching that exact commit establishes whether public state contains generator source. Blocking Publish on failed or incomplete disclosure prevents stale local state, request failures, or a missing head from silently bypassing the source warning.

## Review Fix 2: Conditional Publish

### RED

- Added protocol coverage proving `cloudApi.publish` sends the inspected head in `If-Match` while preserving the exact `{ description, tags, thumbnails }` JSON body.
- Added server coverage for a required expected head and the H1 -> save H2 -> publish H1 race. The stale request must return 409 with `PROJECT_HEAD_CHANGED`, retain H2 as head, and leave the project private.
- Added modal coverage proving a conditional conflict reloads H2 disclosure and changes the source warning, a project-id rerender immediately gates old readiness, and an in-flight old-project handler cannot publish after rerender.
- RED result: 3 files ran with 6 expected failures and 16 passing tests. Failures showed the absent header/server precondition, stale H1 publication, missing conflict reload, missing inspected-head argument, and stale async publication.

### GREEN

- Publish disclosure state now binds readiness to both `cloudProjectId` and inspected `headCommitId`. Warning, handler, and button all require that identity match the current prop.
- Async publish work rechecks current project identity after thumbnail generation and before completion callbacks. Project changes reset form state and invalidate old operations.
- `PROJECT_HEAD_CHANGED` returns the modal to form, immediately gates Publish, reloads current project metadata plus its exact head commit, and requires a new click after disclosure succeeds.
- Server publish now requires `If-Match`, refetches the authoritative project row, and rejects a mismatched head before thumbnail or visibility mutation.
- Publish modal/server focused suites: 3 files, 22 tests passed.
- Task 4 focused suite: 11 files, 96 tests passed.
- Full unit suite: 104 files, 840 tests passed.
- Production build: passed with the existing large-chunk warning.

### Protocol

- Client inspects `GET /api/projects/:id`, then fetches exactly `GET /api/projects/:id/commits/:headCommitId` for disclosure.
- Publish sends that inspected commit ID as the raw `If-Match` request header.
- Request body remains exactly `{ description, tags, thumbnails }`; expected head is not duplicated in JSON.
- Missing `If-Match` returns 428 with `PROJECT_HEAD_REQUIRED`.
- If authoritative `projects.head_commit_id` differs, server returns 409 with stable code `PROJECT_HEAD_CHANGED` and performs no publish mutation.
- On that 409, client discards H1 readiness, reloads latest project/head disclosure, and never retries publication automatically.
