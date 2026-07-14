# Server Integrity Final Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make migrations, commit retention, project deletion, and gallery detail reads atomic and concurrency-safe without changing generator or published-snapshot behavior.

**Architecture:** Reuse `withTransaction` as database serialization boundary. Run migration discovery and application under SQLite `BEGIN IMMEDIATE` or PostgreSQL transaction advisory lock; keep deletion cleanup in one transaction; return gallery detail from one SQL statement snapshot.

**Tech Stack:** Node.js ESM, Express, better-sqlite3, node-postgres, Vitest, Supertest, Playwright.

## Global Constraints

- Preserve dialect-specific migration SQL and startup behavior.
- Preserve all generator and published-snapshot behavior.
- Do not touch progress ledger.
- Use failing regression tests before production edits.
- Multiple focused commits allowed; never amend.
- Append final evidence to ignored `.superpowers/sdd/server-integrity-fix-report.md`.

---

### Task 1: Migration Atomicity And Serialization

**Files:**
- Modify: `server/migrations.js`
- Modify: `tests/unit/server/migrations.test.js`
- Modify: `tests/unit/server/publishedSnapshotMigration.test.js`
- Create: `tests/unit/server/publishedMetadataMigrationAtomicity.test.js`
- Create: `tests/unit/server/migrationsPostgres.test.js`

**Interfaces:** `runMigrations()` keeps its no-argument startup API; `withTransaction(txQuery => ...)` supplies SQLite `BEGIN IMMEDIATE` or a pinned PostgreSQL transaction.

- [ ] Add a concurrent `Promise.all([runMigrations(), runMigrations()])` regression and verify current runner fails from duplicate non-idempotent SQLite DDL.
- [ ] Inject failure on migration 009's second statement; assert first `ALTER TABLE` and ledger row roll back, then restart succeeds.
- [ ] Seed schema through 009, inject failure on migration 010's second statement and ledger insert; assert schema/data/ledger rollback, then restart succeeds.
- [ ] Mock PostgreSQL transaction query calls; assert advisory lock precedes applied-ID read and PostgreSQL SQL, not SQLite override, is executed.
- [ ] Wrap lock, applied-ID reread, pending SQL, and ledger inserts in `withTransaction`; issue `SELECT pg_advisory_xact_lock($1)` only for PostgreSQL.
- [ ] Run migration and transaction tests; commit focused migration changes.

### Task 2: Conflicted Merge Request Retention

**Files:**
- Modify: `tests/unit/server/commitRetention.test.js`
- Modify: `server/routes/projects.js`

**Interfaces:** `pruneCommits(projectId, queryFn)` protects source/base IDs for statuses `open` and `conflicted`.

- [ ] Add a conflicted MR fixture, save beyond retention, and request live MR detail to prove diff recomputation still has source/base commits.
- [ ] Verify regression fails with `Missing commits` under current open-only predicates.
- [ ] Change both retention subqueries to `status IN ('open', 'conflicted')`.
- [ ] Run retention and MR tests; commit focused retention fix.

### Task 3: Transactional Project Deletion

**Files:**
- Modify: `tests/unit/server/deleteProjectClosesMrs.test.js`
- Modify: `server/routes/projects.js`
- Modify: `docs/8-cloud-and-gallery.md`

**Interfaces:** DELETE route performs MR close and cleanup via one `withTransaction` callback.

- [ ] Add published-project deletion regression covering publication rows, thumbnail blobs, reports, reviews, commits, and project row.
- [ ] Inject commit-delete failure and assert MR status plus every project-owned row rolls back.
- [ ] Verify regressions fail because current route autocommits and leaves publication/thumbnail/report rows.
- [ ] Delete reports, publication records, thumbnails, reviews, commits, then project in dependency-safe transaction order.
- [ ] Replace stale cascade documentation with explicit transactional cleanup behavior.
- [ ] Run deletion, publish, review, and MR tests; commit focused deletion fix.

### Task 4: Gallery Detail Statement Snapshot

**Files:**
- Modify: `tests/unit/server/gallery.test.js`
- Modify: `server/routes/gallery.js`

**Interfaces:** `GET /api/gallery/:id` returns published metadata/head, ordered thumbnail IDs, lineage, and rating aggregate from one SQL statement.

- [ ] Add one-shot query hook that republishes after old detail rows are read but before returned rows are consumed; assert response is wholly old or wholly new.
- [ ] Verify current middleware-plus-follow-up-query route returns old metadata with new thumbnail IDs.
- [ ] Replace detail middleware/read sequence with one portable joined query using correlated rating aggregates and ordered thumbnail rows.
- [ ] Run gallery, ratings, publish, snapshot, and generator persistence tests; commit focused consistency fix.

### Task 5: Verification And Report

**Files:**
- Create ignored: `.superpowers/sdd/server-integrity-fix-report.md`

**Interfaces:** Final response reports DONE/BLOCKED, commits, totals, residuals, and report path.

- [ ] Run focused migration/server/gallery/deletion/retention tests.
- [ ] Run full `npx vitest run` and `npm run build`.
- [ ] Run `npx tsc --noEmit --pretty false`, compare diagnostics with head/base baseline where needed, and record delta.
- [ ] Run full Chromium and Firefox Playwright suites on isolated ports; record WebKit availability without requiring it.
- [ ] Inspect status, diff, and recent commits; append exact evidence and residuals to ignored report.
