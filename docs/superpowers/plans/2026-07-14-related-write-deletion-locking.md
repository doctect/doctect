# Related Write Deletion Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent project deletion from racing merge-request, review, and report creation into orphaned related rows.

**Architecture:** Add one transaction-scoped helper that de-duplicates and sorts project IDs, then re-reads and locks matching PostgreSQL rows with `FOR UPDATE` while relying on SQLite's existing serialized `BEGIN IMMEDIATE` transaction. Every related-row creator and project deletion uses this protocol and performs authorization, publication checks, dependent reads, writes, and response reads in one transaction.

**Tech Stack:** Node.js ESM, Express, better-sqlite3, node-postgres, Vitest, Supertest, Playwright.

## Global Constraints

- Never trust pre-transaction middleware snapshots for writes.
- Preserve public/published snapshot semantics and all authorization/privacy behavior.
- Preserve deletion cleanup order, active-MR closure, rollback, and post-commit MR notification behavior.
- Lock multiple project IDs in deterministic sorted order.
- Do not amend commits.
- Do not touch progress ledger.
- Append final evidence to ignored `.superpowers/sdd/related-write-lock-report.md`.

---

### Task 1: Project Lock Contract

**Files:**
- Create: `server/projectLocks.js`
- Create: `tests/unit/server/projectLocksPostgres.test.js`

**Interfaces:**
- Produces: `lockProjectRows(projectIds: string[], queryFn: (sql: string, params?: unknown[]) => Promise<object[]>): Promise<object[]>`.
- PostgreSQL query shape: `SELECT * FROM projects WHERE id IN (...) ORDER BY id FOR UPDATE` with sorted, unique parameters.
- SQLite query shape: same re-read without `FOR UPDATE`; caller must invoke it inside `withTransaction`.

- [ ] Write PostgreSQL SQL-contract tests proving de-duplication, sorted parameter order, `ORDER BY id FOR UPDATE`, and empty-ID behavior.
- [ ] Run `npx vitest run tests/unit/server/projectLocksPostgres.test.js`; expect module-not-found failure.
- [ ] Implement minimal shared helper using `dbType` and supplied transaction query function.
- [ ] Re-run contract test; expect PASS.

### Task 2: Deterministic SQLite Deletion Races

**Files:**
- Create: `tests/unit/server/relatedWriteDeletionRaces.test.js`

**Interfaces:** DB query hooks pause requests after route middleware/initial source lookup has read a project but before writer transaction starts. Opposite-order hooks pause deletion after its middleware read but before its transaction starts.

- [ ] Add writer-first race tests for MR creation, review upsert, project report, and review report; while each writer is paused after initial read, commit deletion, release writer, expect 404/409, and assert no orphan/active MR.
- [ ] Add deletion-first-started opposite ordering for all four creators; commit writer while deletion is paused, release deletion, and assert deletion closes/removes created rows.
- [ ] Run `npx vitest run tests/unit/server/relatedWriteDeletionRaces.test.js`; expect orphan rows or active MRs from current non-transactional creators.

### Task 3: Transactional Route Revalidation

**Files:**
- Modify: `server/routes/projects.js`
- Modify: `server/routes/mergeRequests.js`
- Modify: `server/routes/gallery.js`

**Interfaces:**
- Consumes: `lockProjectRows(projectIds, txQuery)` from Task 1.
- MR creation returns transaction statuses for missing source, invalid fork/upstream/head/diff, then sends notification only after commit.
- Review/project-report/review-report creation returns `missing` when locked project no longer exists or is no longer published.

- [ ] Lock/revalidate deletion target and owner before active-MR closure and existing explicit cleanup sequence.
- [ ] Move MR source/target ownership, fork linkage, visibility, source/base/target-head reads, diff, insert, and DTO creation into one transaction; lock sorted source/target IDs.
- [ ] Move review upsert and DTO read into one transaction after locking/revalidating current public published project.
- [ ] Move project report insertion into one transaction after locking/revalidating current public published project.
- [ ] Resolve review project, lock/revalidate it, re-read review, and insert review report in one transaction.
- [ ] Run race test and focused existing MR/review/gallery/delete tests; expect PASS.

### Task 4: Regression And Integration Verification

**Files:**
- Modify if needed: `tests/unit/server/mergeRequests.test.js`
- Modify if needed: `tests/unit/server/reviews.test.js`
- Modify if needed: `tests/unit/server/gallery.test.js`
- Create ignored: `.superpowers/sdd/related-write-lock-report.md`

**Interfaces:** Final response reports `DONE` or `BLOCKED`, commit hashes, test totals, residuals, and report path.

- [ ] Run focused MR, notification, review, report, deletion, project transaction, DB transaction, and server tests.
- [ ] Run full `npx vitest run` and `npm run build`.
- [ ] Run `npx tsc --noEmit --pretty false`, compare diagnostic delta against head baseline.
- [ ] Run full available Chromium and Firefox Playwright suites on isolated ports; record WebKit unavailability if applicable.
- [ ] Inspect `git status`, `git diff`, and recent log; commit intended source/tests/plan without amend.
- [ ] Append commands, exact totals, commits, and residuals to ignored `.superpowers/sdd/related-write-lock-report.md`.
