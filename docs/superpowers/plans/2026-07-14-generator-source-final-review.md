# Generator Source Final Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all whole-branch review findings with tested cancellation, sandbox confinement, bounded generated data, cloud-head publish consistency, atomic database operations, valid HTTP preconditions, accessible publish UI, and clean TypeScript delta.

**Architecture:** Keep existing component/service boundaries. Add cancellation and capability removal at sandbox boundary, graph validation before generated state enters app, exact cloud-head state in publish disclosure, and one reusable transaction boundary used by publish and MR merge.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Testing Library, Playwright, Express, better-sqlite3, node-postgres.

## Global Constraints

- Preserve fixed production timeout 10,000 ms and exact generator source.
- Preserve existing browser/security tests and no reverse synchronization.
- Do not touch progress ledger.
- Keep Task-6 design/plan docs unless technically stale.
- Keep final report ignored and never force-add it.

---

### Task 1: Modal Cancellation And Worker Confinement

**Files:**
- Modify: `tests/unit/HierarchyGeneratorModal.test.tsx`
- Modify: `tests/unit/generatorSandbox.test.ts`
- Modify: `tests/e2e/editor_advanced.spec.js`
- Modify: `components/HierarchyGeneratorModal.tsx`
- Modify: `services/generatorSandbox.ts`

**Interfaces:** `runGeneratorSandbox(request, environment?, signal?)`; one controller per running modal preview.

- [ ] Add modal RED tests covering abort on source edit, preset/reset, close/Escape, Apply, Detach, unmount, and replacement preview.
- [ ] Run `npx vitest run tests/unit/HierarchyGeneratorModal.test.tsx` and confirm cancellation assertions fail.
- [ ] Add Chromium RED tests proving infinite Worker termination, fan-out/message globals unavailable, iframe teardown, and no repeated-preview accumulation.
- [ ] Run focused sandbox/browser tests and confirm expected failures.
- [ ] Implement controller lifetime, explicit discriminant guards, signal plumbing, captured private port, and blocked fan-out globals.
- [ ] Re-run focused unit and Chromium tests until green.

### Task 2: Generated Reference And Traversal Bounds

**Files:**
- Modify: `shared/projectLimits.js`
- Modify: `services/validateGeneratedProject.ts`
- Modify: `services/pdfService.ts`
- Modify: `tests/unit/validateGeneratedProject.test.ts`
- Create: `tests/unit/pdfGeneratedTraversal.test.ts`

**Interfaces:** shared reference/traversal depth limits; generated validator rejects missing/cyclic/deep references and malformed/deep traversal paths.

- [ ] Add RED tests for missing target, cycle, excessive chain, malformed/deep traversal, valid chain/grid, and PDF export.
- [ ] Run focused tests and verify failures identify absent validation/recursive overflow.
- [ ] Add iterative validation and PDF traversal/reference resolution with visited/depth bounds.
- [ ] Re-run focused tests and relevant gallery PDF regressions until green.

### Task 3: Cloud-Head Publish And Dialog Semantics

**Files:**
- Modify: `tests/unit/PublishModal.test.tsx`
- Modify: `components/cloud/PublishModal.tsx`

**Interfaces:** ready disclosure contains `{ projectId, headCommitId, state, hasGenerator }`; all pages and thumbnails use `state`.

- [ ] Add RED divergent local/head page, selection, active variant, and thumbnail tests.
- [ ] Add RED dialog labelling, initial focus, Tab wrap, Escape, close-name, restoration, and error-alert tests.
- [ ] Run focused tests and confirm expected failures.
- [ ] Retain cloud-head state, derive all publish artifacts from it, and add accessible modal behavior.
- [ ] Re-run focused tests until green.

### Task 4: Transaction Primitive And Atomic Publish

**Files:**
- Modify: `server/db.js`
- Create: `tests/unit/server/dbTransactions.test.js`
- Modify: `server/routes/projects.js`
- Modify: `tests/unit/server/publish.test.js`

**Interfaces:** `withTransaction(callback)` supplies transaction-scoped query using same placeholder contract as `query`.

- [ ] Add RED SQLite rollback/serialization/no-leak tests and fake PostgreSQL BEGIN/COMMIT/ROLLBACK/release tests.
- [ ] Implement serialized SQLite and pinned-client PostgreSQL transaction executor.
- [ ] Add RED publish insertion-failure rollback and concurrent serialization tests.
- [ ] Move head lock/CAS, metadata, thumbnail replacement, and response read into one transaction.
- [ ] Run transaction and publish tests until green.

### Task 5: Atomic MR Merge

**Files:**
- Modify: `server/routes/projects.js`
- Modify: `server/routes/mergeRequests.js`
- Modify: `tests/unit/server/mergeRequests.test.js`

**Interfaces:** transaction-aware `insertCommit`, `pruneCommits`, row readers; stable `TARGET_HEAD_CHANGED` 409.

- [ ] Add RED interleaved target-save test proving no stale merge commit/status change.
- [ ] Add RED injected post-insert failure test proving commit/head/MR rollback.
- [ ] Lock MR/target, compare computed head, and perform commit/head/status changes through `txQuery`.
- [ ] Run MR and storage-limit tests until green.

### Task 6: Metadata, ETag, And Repository Hygiene

**Files:**
- Modify: `shared/generatorMetadata.js`
- Modify: `tests/unit/generatorMetadata.test.ts`
- Modify: `tests/unit/loadProjectState.test.ts`
- Modify: `services/cloudApi.ts`
- Modify: `server/routes/projects.js`
- Modify: `tests/unit/cloudApi.test.ts`
- Modify: `tests/unit/server/publish.test.js`
- Modify: `tutorial/episodes/ep5.js`
- Remove from index only: `.superpowers/sdd/task-4-report.md`

**Interfaces:** canonical UTC millisecond ISO timestamp; quoted `If-Match` strong entity tag.

- [ ] Add RED canonical timestamp, unknown stripping, exact size boundary, v9 immutability, quoted-header, malformed-header, and CORS tests.
- [ ] Implement canonical timestamp round-trip and entity-tag encoding/parsing.
- [ ] Re-run metadata/load/cloud/server tests until green.
- [ ] Remove Task-4 report from index while retaining ignored workspace copy.

### Task 7: Final Verification And Report

**Files:**
- Create ignored: `.superpowers/sdd/final-fix-report.md`

- [ ] Run all focused subsystem tests after each task.
- [ ] Run `npx vitest run` and record tests/files/passes.
- [ ] Run `npm run build` and record result.
- [ ] Run `npx tsc --noEmit --pretty false`; compare exact diagnostics with `main` and record unchanged baseline.
- [ ] Run full Chromium and Firefox Playwright projects on isolated ports without reusing user processes; record totals.
- [ ] Run WebKit if executable exists, otherwise record explicitly unrun.
- [ ] Inspect `git status`, `git diff`, and recent commits; commit focused changes without amend.
- [ ] Write final report with RED/GREEN, transaction/security models, commands/results, commits, residuals, and report path.
