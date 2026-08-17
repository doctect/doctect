# Lineage Admission Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every existing-project save and close to trusted exact project lineage while keeping UI epochs non-reusable and bounded by live projects.

**Architecture:** WeakMap authority remains private and validation explicitly transfers it. Mutation queue records exact caller authority separately from CAS lineage, permits revision advancement only behind a successful local predecessor, and carries an admitted close lineage to dispatch. Hook allocates globally increasing epochs into a live-ID map; EditorPage captures modal epoch and asks hook to reject stale close callbacks synchronously.

**Tech Stack:** TypeScript, React 19, IndexedDB/fake-indexeddb, Vitest, Testing Library.

## Global Constraints

- Work only in `.worktrees/indexeddb-local-persistence`.
- Never stage, restore, or modify `server/analytics.db`.
- Do not amend prior commits.
- Keep `LocalWorkspaceStore` public API exactly `bootstrap`, `commit`, and `exportRecoveryBundle`.
- Keep lineage/incarnation outside public project data, snapshots, recovery JSON, and digests.
- Add reviewer reproductions and observe RED before production edits.
- Commit correction once with subject `fix(storage): bind commands to exact lineage`.

---

### Task 1: Reproduce Admission Failures

**Files:**
- Modify: `tests/unit/localWorkspace/commit.test.ts`
- Modify: `tests/unit/localWorkspace/mutationQueue.test.ts`
- Modify: `tests/unit/useWorkspaceProjectWrites.test.tsx`
- Modify: `tests/unit/ProjectEditor.authority.test.tsx`

**Interfaces:**
- Consumes: existing `LocalWorkspaceStore.commit`, `MutationQueue.enqueueProjectSave`, hook authority epochs, and EditorPage close modal.
- Produces: failing regressions for all four review findings.

- [x] **Step 1: Add tokenless clone/replacement save regression**

Bootstrap two stores, retain `structuredClone(oldA)`, close/recreate A through the second store, make the first store adopt replacement A through B readback, then assert the tokenless old clone rejects with `conflict` and replacement bytes remain durable.

- [x] **Step 2: Add exact queue event-order regressions**

```ts
const current = queue.enqueueProjectSave(projectNamed('Current I:1'), lineage(1));
await expect(queue.enqueueProjectSave(
  projectNamed('Stale I:0'),
  lineage(0),
)).rejects.toMatchObject({ code: 'conflict' });
```

Cover reverse I:0/I:1 order, same-I:0 rapid coalescing, an active I:0 predecessor followed by I:0, and an I:1 payload admitted after that predecessor succeeds.

- [x] **Step 3: Add queued close/replacement regression**

Hold store A's B save, admit close A behind it, close/recreate A through store B, release B, then assert close conflicts and replacement A remains durable.

- [x] **Step 4: Add real UI stale-modal regression**

Open A close modal, hold B save, replace A through a second real store, release B readback, invoke captured confirm callback, and assert main store issues no close while replacement A survives.

- [x] **Step 5: Add bounded epoch regression**

Repeatedly remove and add projects, including same-ID re-adds. Assert every allocated epoch increases, removed IDs disappear immediately, and `authorityEpochs.size` equals live project count.

- [x] **Step 6: Run RED matrix**

Run:
```bash
npx vitest run tests/unit/localWorkspace/mutationQueue.test.ts tests/unit/localWorkspace/commit.test.ts tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/ProjectEditor.authority.test.tsx
```
Expected: failures show tokenless overwrite admission, revision-only coalescing, replacement close deletion, stale modal close submission, and retained removed epochs.

### Task 2: Require Trusted Save Authority

**Files:**
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`
- Modify: store tests that construct direct save commands.

**Interfaces:**
- Consumes: `getInstalledProjectAuthorityLineage(project)` after validation transfers WeakMap metadata.
- Produces: existing-project saves admitted only with private `ProjectLineage`.

- [x] **Step 1: Reject missing lineage before queue admission**

```ts
const authorityLineage = getInstalledProjectAuthorityLineage(prepared.project);
if (!authorityLineage) {
  return Promise.reject(new WorkspaceStoreError(
    `Project ${prepared.project.id} save authority is unavailable.`,
    'conflict',
  ));
}
return queue.enqueueProjectSave(prepared.project, authorityLineage);
```

- [x] **Step 2: Update valid direct-store tests to inherit authority explicitly**

Use `inheritInstalledProjectAuthority(edited, source)` from a store-returned source project. Keep deliberate tokenless regression untrusted.

- [x] **Step 3: Verify save admission tests GREEN**

Run `npx vitest run tests/unit/localWorkspace/commit.test.ts tests/unit/localWorkspace/drift.test.ts tests/unit/WorkspaceBootstrapGate.test.tsx`.

### Task 3: Enforce Exact Queue Lineage

**Files:**
- Modify: `services/localWorkspace/mutationQueue.ts`
- Modify: `tests/unit/localWorkspace/mutationQueue.test.ts`

**Interfaces:**
- Consumes: exact `ProjectLineage`, `sameProjectLineage`, and `nextProjectLineage`.
- Produces: payload `authorityLineage`, CAS `expectedLineage`, and explicit predecessor transition.

- [x] **Step 1: Compare queued callers with current pinned lineage exactly**

Coalescing may replace payload only when caller lineage equals current pinned lineage. Set `authorityLineage` to the accepted caller lineage; reject either incarnation or revision mismatch.

- [x] **Step 2: Record explicit predecessor transition**

Add optional predecessor lineage to save entries. A save admitted while a same-project save is active may use `nextProjectLineage(active.expectedLineage)` only when caller authority exactly matches the still-pinned predecessor, or may use current caller lineage after the predecessor success has established it.

- [x] **Step 3: Verify dispatch authorization**

At pump, require pinned lineage to equal CAS lineage and require payload authority either to equal CAS lineage or to equal the recorded predecessor side of an exact one-step transition.

- [x] **Step 4: Run queue tests GREEN**

Run `npx vitest run tests/unit/localWorkspace/mutationQueue.test.ts`.

### Task 4: Bind Close at Admission

**Files:**
- Modify: `services/localWorkspace/mutationQueue.ts`
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`
- Modify: `tests/unit/localWorkspace/commit.test.ts`

**Interfaces:**
- Produces: private `ExclusiveAdmission` union where close carries `targetLineage`.
- Consumes: synchronous store `expectedProjectLineages` and queue active-save state.

- [x] **Step 1: Capture close lineage in `commit`**

After command validation, synchronously reject missing target or call queue with `{ command, targetLineage: { ...lineage } }`. Non-close exclusive commands carry only `{ command }`.

- [x] **Step 2: Cancel queued target saves without advancing close**

Remove queued target saves and transfer their waiters to close. If no target save is active, bind close to admitted target lineage unchanged.

- [x] **Step 3: Bind active predecessor exactly**

If target save is active, bind close to one next revision only when admission lineage is the active save's exact authority/expected lineage. Dispatch close only after queue pin reaches bound lineage; failed active saves therefore make close conflict.

- [x] **Step 4: Execute with admitted lineage**

Compare admitted target lineage with store expected lineage, pass it unchanged to adapter close CAS, and never reread/relabel from a replacement.

- [x] **Step 5: Run queued close tests GREEN**

Run `npx vitest run tests/unit/localWorkspace/commit.test.ts`.

### Task 5: Guard UI and Bound Epoch State

**Files:**
- Modify: `hooks/useWorkspaceProjectWrites.ts`
- Modify: `pages/EditorPage.tsx`
- Modify: `tests/unit/useWorkspaceProjectWrites.test.tsx`
- Modify: `tests/unit/EditorPageWorkspaceCommands.test.tsx`
- Modify: `tests/unit/ProjectEditor.authority.test.tsx`

**Interfaces:**
- Produces: `commitStructural(command, expectedAuthorityEpoch?)` synchronous close guard.
- Produces: live-only `authorityEpochs` backed by globally increasing allocator.

- [x] **Step 1: Replace tombstones with allocator**

Initialize live projects with unique increasing epochs. Reconciliation builds a fresh live-only map, preserves epochs only for unchanged authority, and allocates a new epoch for additions or authority changes.

- [x] **Step 2: Add synchronous close guard**

Before structural promise chaining, reject close when its captured epoch differs from `authorityEpochsRef.current.get(projectId)`.

- [x] **Step 3: Capture modal authority in EditorPage**

Replace `closingProjectId` with `{ projectId, authorityEpoch }`. Tab close captures rendered epoch; confirm and save-and-close pass it to `commitStructural`.

- [x] **Step 4: Run hook/UI tests GREEN**

Run `npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx tests/unit/ProjectEditor.authority.test.tsx`.

### Task 6: Verify, Review, Report, Commit

**Files:**
- Create: `.superpowers/sdd/final-review-lineage-admission-report.md`

- [x] **Step 1: Run focused matrix**

Run queue, adapter, store, hook, EditorPage, ProjectEditor authority, and boundary suites; record file/test counts.

- [x] **Step 2: Run static checks**

Run `npx tsc --noEmit` and `git diff --check`.

- [x] **Step 3: Run bounded full suite**

Run `npm test -- --run --maxWorkers=4`; require 227/227 files and all tests green, with updated count.

- [x] **Step 4: Self-review exact admission rules and write report**

Document RED evidence, save/close predecessor rules, CAS/ABA proofs, UI epoch guard, O(live projects) state, verification, files, and concerns.

- [x] **Step 5: Commit intended files only**

Stage no `server/analytics.db` changes. Commit once as:
```text
fix(storage): bind commands to exact lineage
```
