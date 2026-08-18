# Final Standards Blockers Implementation Plan

**Goal:** Close final whole-branch Standards blockers without weakening IndexedDB authority, public store API, or closed browser-storage policy.

**Constraints:** Test-first. No dual write, fallback editing, cleanup, serialized lineage, or user-identity trust in browser retry metadata. Keep `LocalWorkspaceStore` public surface at `bootstrap`, `commit`, and `exportRecoveryBundle`. Preserve immediate working-copy UI, one-second save coalescing, exact CAS/ABA checks, open-work capture, and supported-browser behavior.

## Task 1: Scope Fork Retry To Current Server Owner

**Files:** `services/forkProject.ts`, `tests/unit/forkProject.test.ts`, relevant server fork tests.

1. Add RED coverage for user A succeeding remotely then failing before local stage, reload/account switch, and user B retrying with the same source/key.
2. Persist only source project ID plus idempotency key. Never persist returned private fork/project/commit metadata.
3. Replay the authenticated fork endpoint on every retry. Let server owner-scoped idempotency return/create the current user's fork, then fetch/stage only that fresh result.
4. Retain attempt until durable local staging succeeds. Preserve existing error handling and once-per-consumed-import analytics behavior.
5. Verify fork unit/server tests, import tests, boundary, typecheck, and build. Commit independently.
6. Review follow-up: derive fork staging identity from the public source project ID and retained idempotency key, not returned private project or commit IDs. Keep generic import changed-payload retries conflicting; supersession is fork-only.
7. Atomically replace an exact ambiguously committed fork pending import, or reconcile the exact replacement if it is already pending or consumed. Persist only hash provenance, carry it privately through consumption, and reject changed records, collisions, ambiguous provenance, and consume-versus-replace races without deleting the prior pending import.
8. Add a real fork-to-import-to-bootstrap regression proving account B leaves one B import/project and one analytics event, while account A private metadata is absent from session metadata, durable records, public snapshots, and recovery exports. Re-run focused storage/fork/import/server tests, boundary, bounded full units, typecheck, build, and generated parity; commit the review fix independently.

## Task 2: Reserve Alternate Browser Capabilities

**Files:** `tests/unit/localWorkspaceBoundary.test.ts`, browser-preference policy plan if wording needs precision, generated onboarding page after test metadata changes.

1. Add RED probes for `document.defaultView`, `ownerDocument.defaultView`, frame `contentWindow`, `StorageEvent.storageArea`, ambient `frames`/`top`/`parent`/`opener`, and direct popup `open()` followed by computed storage access.
2. Reserve exact executable capability-acquisition syntax (`defaultView`, `contentWindow`, `storageArea`) regardless receiver. Reserve unbound ambient Window aliases and direct unbound `open()` while allowing lexical locals and ordinary domain properties.
3. Keep closed syntax: reject acquisition sites; do not trace aliases or evaluate property-key expressions.
4. Add safe controls for ordinary document members, local bindings, and existing generator/iframe production forms. Run both parser modes, full boundary, typecheck, build, and parity. Commit independently.

## Task 3: Coalesce Before Expensive Save Preparation

**Files:** `services/localWorkspace/LocalWorkspaceStore.ts`, `services/localWorkspace/mutationQueue.ts`, new private browser project-preparation worker/client, `services/localWorkspace/index.ts`, `hooks/useWorkspaceProjectWrites.ts`, `components/workspace/WorkspaceBootstrapGate.tsx`, focused unit/browser tests.

1. Add RED assertions that a rapid save burst performs no full project preparation before debounce, prepares/writes only the latest payload once, isolates caller mutation at admission, and preserves every waiter result/error.
2. At `commit(save-project)`, validate only authority-bearing project identity needed for queue admission. Clone admitted bytes immediately; defer full validate/migrate/final-validate until the physical save executes after coalescing.
3. Production preparation runs in a private module Worker. Main thread retains lineage admission, queue ordering, IndexedDB CAS, and authority installation. Unsupported/failed worker preparation fails the save without discarding the working copy; no silent unvalidated write.
4. Resolve coalesced waiters from one authority-bearing physical readback instead of cloning the full workspace per waiter. Callers treat returned snapshots as immutable.
5. Remove the hook's duplicate full-workspace clone before `WorkspaceBootstrapGate`; the gate remains the single protected-copy owner. Keep initial and structural full capture; project-edit publication must remain safely captured before authority-loss unmount.
6. Add near-limit tests: synchronous edit admission stays under a documented threshold relative to clone baseline, no preparation occurs in the interaction window, one physical preparation/write follows, stale lineage/close/freeze/drain behavior stays unchanged, and supported Chromium uses the worker path.
7. Run queue/store/hook/gate suites, boundary, full units, typecheck, build, focused browser performance, then full migration browser matrix. Commit independently.

## Task 4: Final Verification

1. Independently review each task, then the full branch from `6feb8dfffe9c5452225014705d24e81aa88628aa`.
2. Require focused suites, boundary both modes, complete bounded units, typecheck, build, generated parity, and exact-HEAD five-project Playwright matrix.
3. Record nonblocking Minors separately. Do not claim release-ready while any Critical/Important finding or required gate remains open.
