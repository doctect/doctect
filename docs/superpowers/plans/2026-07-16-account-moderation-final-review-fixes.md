# Account Moderation Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all final whole-branch security, race, validation, and protected-administrator review findings without changing intended moderation behavior.

**Architecture:** Keep Express admin-route denial and Better Auth's `admin()` plugin, then deny normalized `/admin` paths in Better Auth's pre-hook. Append migration `012_session_suspension_guard` to serialize session inserts against target-user suspension state, and add fresh suspension reads in application guards. Revalidate expiry inside moderation transaction after locks, strictly validate timestamp/cardinality input, and render administrator detail as protected.

**Tech Stack:** JavaScript ESM, Express 5, Better Auth 1.4.10, PostgreSQL, SQLite, React 19, TypeScript 5.8, Vitest, Supertest, Testing Library, Playwright.

## Global Constraints

- Do not edit migration `011_account_moderation`; append `012_session_suspension_guard`.
- Keep PostgreSQL and SQLite trigger bodies as intact statement-array elements.
- PostgreSQL session insert must lock target user before deciding active suspension.
- Active means `banned` and null/future `banExpires`; expired suspension allows session insertion and sign-in.
- Every SQL placeholder number appears once.
- `expiresAt` accepts only calendar-valid ISO-8601 timestamps with explicit timezone and must remain future immediately before writes.
- `projectIdsToUnpublish` supports at most 20 IDs, matching default public-project platform scale.
- Administrator suspension remains server-authoritatively forbidden and UI controls are suppressed.
- Live PostgreSQL execution is unavailable; test exact SQL contract without claiming live execution.
- Baseline TypeScript output is exactly five diagnostics; fixes add zero.

---

### Task 1: Normalized Better Auth Administrator Denial

**Files:**
- Modify: `tests/unit/server/accountModeration.test.js`
- Modify: `server/auth.js`

**Interfaces:**
- Consumes: Better Auth `hooks.before` normalized `ctx.path`.
- Produces: `404` for `ctx.path === '/admin' || ctx.path.startsWith('/admin/')` before plugin endpoint execution.

- [ ] Add raw HTTP integration cases for direct, `..`, `%2e%2e`, `%2E%2E`, `.%2e`, and `%2e.` paths targeting list/ban/unban/role/create/remove endpoints; snapshot user, account, session, and audit state.
- [ ] Run `npx vitest run tests/unit/server/accountModeration.test.js` and record expected mutation/status failure.
- [ ] Add normalized-path check before password-policy handling, throwing Better Auth `APIError('NOT_FOUND')`.
- [ ] Re-run focused test and preserve normal sign-in plus `BANNED_USER` coverage.

### Task 2: Session Suspension Race Guards

**Files:**
- Modify: `tests/unit/server/accountModerationMigration.test.js`
- Modify: `tests/unit/server/migrationsPostgres.test.js`
- Modify: `tests/unit/server/guards.test.js`
- Modify: `server/migrations/index.js`
- Modify: `server/middleware/guards.js`

**Interfaces:**
- Produces migration ID `012_session_suspension_guard`.
- Produces fresh-session resolver behavior used by `requireAuth` and `optionalAuth`.

- [ ] Add SQLite behavior tests proving unbanned insert allowed, active indefinite/future inserts rejected, and expired insert allowed.
- [ ] Add exact PostgreSQL function/trigger contract assertions, including `SELECT ... FOR UPDATE` target-user serialization.
- [ ] Add app tests where a preexisting valid session is followed by direct active suspension state; require-auth returns `401`, optional-auth returns null, and all target sessions are deleted.
- [ ] Run migration/guard tests and record missing migration/fresh-check failures.
- [ ] Append PostgreSQL and SQLite trigger statements and add fresh user suspension query/session cleanup to both app auth guards.
- [ ] Re-run focused migration/guard tests.

### Task 3: Transaction-Time Expiry and Input Bounds

**Files:**
- Modify: `tests/unit/server/accountModeration.test.js`
- Modify: `server/routes/adminModeration.js`

**Interfaces:**
- Produces `MAX_PROJECTS_TO_UNPUBLISH = 20` validation contract.
- Produces `400 Invalid suspension request` when accepted expiry elapses after locks but before writes.

- [ ] Add malformed timestamp tests for timezone-less, locale, impossible-calendar, and malformed-zone values plus valid timezone-aware input.
- [ ] Add 20-ID accepted and 21-ID rejected boundary tests.
- [ ] Add deterministic lock/clock test that advances time after project locks and snapshots user, sessions, project, and audit as unchanged.
- [ ] Run moderation test and record pre-fix status/mutation failures.
- [ ] Implement strict ISO/calendar validation, cardinality cap, and post-lock expiry check immediately before first write.
- [ ] Re-run moderation test.

### Task 4: Protected Administrator UI

**Files:**
- Modify: `tests/unit/AdminModerationPage.test.tsx`
- Modify: `pages/AdminModerationPage.tsx`

**Interfaces:**
- Consumes: `detail.account.role`.
- Produces: visible protected-administrator state with no suspension/restoration controls or confirmation.

- [ ] Add page test opening an administrator detail and asserting protected state plus absent moderation controls.
- [ ] Run page test and record missing-state/control failure.
- [ ] Render protected administrator notice before status-based controls.
- [ ] Re-run page test.

### Task 5: Documentation, Verification, and Commits

**Files:**
- Modify: `docs/8-cloud-and-gallery.md`
- Modify: `docs/superpowers/specs/2026-07-16-account-moderation-design.md`
- Create: `.superpowers/sdd/final-fix-report.md`

- [ ] Document normalized plugin denial, insert trigger, fresh guard, strict expiry/cardinality, transaction-time expiry, protected UI, and live-PostgreSQL test limitation.
- [ ] Run focused migration/auth/guard/moderation/page/E2E suites.
- [ ] Run `npx vitest run`, `npm run build`, and `npx tsc --noEmit --pretty false`; compare TypeScript output to exact five-diagnostic baseline.
- [ ] Run Chromium E2E with isolated ports.
- [ ] Inspect `git status`, `git diff`, and recent log; self-review all changes and write final report with RED/GREEN evidence and residual concern.
- [ ] Stage only intended files and create scoped commits without amend.
