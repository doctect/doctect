# Task 4 Review Fix 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close publish TOCTOU race and prevent project-specific PublishModal state leaking across `cloudProjectId` changes.

**Architecture:** Keep existing early server head read as fast path, then make metadata publication authoritative through one conditional `UPDATE ... WHERE id/head_commit_id ... RETURNING` before any thumbnail mutation. Reset modal-local form state in an ID-keyed effect while existing disclosure fetch remains bound to project/head identity.

**Tech Stack:** Express, SQLite/Postgres unified query layer, React 19, Vitest, Testing Library, Supertest.

## Global Constraints

- Use TDD and observe each regression fail before production edits.
- Preserve publish JSON body exactly as `{ description, tags, thumbnails }`.
- Preserve inspected head in raw `If-Match` header.
- Do not touch progress ledger.
- Commit without amend.

---

### Task 1: Authoritative Conditional Publish

**Files:**
- Modify: `tests/unit/server/publish.test.js`
- Modify: `server/routes/projects.js:245-286`

**Interfaces:**
- Consumes: existing `query(text, params)` row-array contract and `If-Match` expected head.
- Produces: 409 `{ code: 'PROJECT_HEAD_CHANGED' }` when final conditional update returns no row.

- [ ] **Step 1: Write failing interleaving regression**

Wrap the DB query module in this test file with a one-shot hook. Seed an existing thumbnail, create H2, restore H1, then change H1 to H2 immediately before the route's final conditional update. Assert 409, private visibility, original thumbnail bytes/ID, and H2 head.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/server/publish.test.js`

Expected: interleaving case fails because no conditional update is issued and current route publishes stale H1.

- [ ] **Step 3: Add minimal conditional update**

Replace unconditional final update with:

```js
const updated = await query(
    `UPDATE projects SET visibility = 'public', description = $1, tags = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND head_commit_id = $4
     RETURNING *`,
    [d, JSON.stringify(tags), currentProject.id, expectedHead]
);
if (!updated[0]) {
    return res.status(409).json({ error: 'Project head changed since it was inspected.', code: 'PROJECT_HEAD_CHANGED' });
}
```

Run this before deleting or inserting thumbnails, and use returned row for response DTO.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/unit/server/publish.test.js tests/unit/server/projects.test.js`

Expected: all tests pass.

---

### Task 2: Reset Modal State on Project Change

**Files:**
- Modify: `tests/unit/PublishModal.test.tsx`
- Modify: `components/cloud/PublishModal.tsx:20-60`

**Interfaces:**
- Consumes: `cloudProjectId` and current `project.initialState`.
- Produces: empty description/tags/previews/error, first page selected, form phase, and loading disclosure for new project.

- [ ] **Step 1: Write failing rerender regression**

Render cloud-1, edit description/tags, generate previews and a publish error, then rerender cloud-2 with a different first page and pending disclosure. Assert old values, preview, error, and warning disappear; new first page is checked; Publish remains disabled until cloud-2 disclosure resolves.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/PublishModal.test.tsx`

Expected: stale description, tags, selection, or previews remain.

- [ ] **Step 3: Add minimal ID-keyed reset effect**

```tsx
useEffect(() => {
    setDescription('');
    setTagsText('');
    setSelected(computePageOrder(project.initialState).slice(0, 1));
    setPreviews([]);
    setPhase('form');
    setError(null);
}, [cloudProjectId]);
```

Keep disclosure identity reset/fetch and stale async guards unchanged.

- [ ] **Step 4: Verify GREEN and protocol**

Run: `npx vitest run tests/unit/PublishModal.test.tsx tests/unit/cloudApi.test.ts`

Expected: tests pass, including exact request body and `If-Match` assertions.

---

### Task 3: Evidence, Full Verification, and Commit

**Files:**
- Modify: `.superpowers/sdd/task-4-report.md`

**Interfaces:**
- Consumes: measured command outputs.
- Produces: `Review Fix 3` RED/GREEN/protocol evidence.

- [ ] **Step 1: Run focused and full verification**

Run PublishModal/server publish/projects suites, Task 4 focused command from Task 4 plan plus `publish.test.js` and `cloudApi.test.ts`, `npm test -- --run`, and `npm run build`.

- [ ] **Step 2: Append report evidence**

Add `## Review Fix 3: Atomic Publish and Project Reset` with RED observations, final behavior, exact pass counts, build result, and protocol preservation.

- [ ] **Step 3: Review and commit**

Inspect `git status`, `git diff`, and recent log. Stage only review-fix files and commit with a concise conventional commit message. Do not amend.

---

## Self-Review

- Spec coverage: Task 1 covers final atomic conditional update and interleaved H1/H2 preservation; Task 2 covers every named modal state; Task 3 covers protocol, report, focused/full tests, build, and commit.
- Placeholder scan: no TBD/TODO/deferred implementation steps.
- Type consistency: server `updated` remains DB row shape consumed by `projectDto`; modal reset uses existing state setters and `computePageOrder` return type.
