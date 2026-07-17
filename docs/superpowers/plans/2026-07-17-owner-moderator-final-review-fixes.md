# Owner Moderator Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close final security, logout, deployment, authority-error, and transactional-audit review findings with regression coverage.

**Architecture:** Keep `OWNER_EMAILS` as live owner root of trust at shared guard boundary, add strict optional auth only for `/api/me`, and make logout complete server mutation plus fresh-authority invalidation before replacing route. Preserve existing transaction boundaries while proving project unpublish rollback through injected database failure; harden deployment through Bash strict mode and explicit tolerated failures.

**Tech Stack:** Express, Better Auth, React 19, React Router, Vitest, Supertest, Bash, SQLite/PostgreSQL abstraction.

## Global Constraints

- Follow RED/GREEN TDD for every behavior change.
- Do not modify `.superpowers/sdd/*` except `.superpowers/sdd/final-review-fix-report.md`.
- Do not implement deferred cursor whitespace or SQL `LIMIT` gaps.
- Preserve configured-owner moderation and stored-owner target protection.
- Commit fixes in one or logically split conventional commits.

---

### Task 1: Live Owner Authority On Shared Routes

**Files:**
- Modify: `tests/unit/server/guards.test.js`
- Modify: `tests/unit/server/accountModeration.test.js`
- Modify: `tests/unit/server/gallery.test.js`
- Modify: `tests/unit/server/reviews.test.js`
- Modify: `server/middleware/guards.js`

**Interfaces:**
- Consumes: `isConfiguredOwner(req.user)` and fresh database role from `requireAuth`.
- Produces: `requireAdmin` admitting admins plus currently configured owners only.

- [ ] Add tests proving configured owner shared access, immediate loss of stats/account/project/review mutation access after config removal, and unchanged target-owner protection.
- [ ] Run focused tests and confirm failures are `200` where `403` is required.
- [ ] Change `requireAdmin` predicate to `role === 'admin' || isConfiguredOwner(req.user)`.
- [ ] Configure owner-success fixtures explicitly and restore environment state after each test.
- [ ] Run focused guard/account/gallery/review tests to GREEN.

### Task 2: Logout Authority Invalidation And Route Replacement

**Files:**
- Modify: `tests/unit/AccountMenu.test.tsx`
- Modify: `tests/unit/adminModerationRouting.test.tsx`
- Modify: `components/AccountMenu.tsx`

**Interfaces:**
- Consumes: async `signOut()`, `useCurrentUser().refresh()`, React Router `useNavigate()`.
- Produces: successful logout refreshes authority then replaces current route with `/login`; failed logout stays on current route.

- [ ] Add deferred-signout menu test and moderation-route integration test proving loaded moderation stays mounted until success, then unmounts and lands on login.
- [ ] Run tests and confirm current fire-and-forget logout fails ordering/navigation assertions.
- [ ] Add one async logout handler shared by normal and error menu states; await `signOut`, await `refresh`, then `navigate('/login', { replace: true })`; retain route on failure.
- [ ] Run menu/routing/hook/page tests to GREEN.

### Task 3: Fail-Fast Deployment Script

**Files:**
- Modify: `tests/unit/server/ownerAuthority.test.js`
- Modify: `deploy.sh`

**Interfaces:**
- Consumes: optional dotenv values and required gcloud/docker commands.
- Produces: strict Bash execution where only repository creation and env removal are tolerated.

- [ ] Extend repository config tests with strict-mode, nounset-safe optional reads, quoting, tolerated-failure, and success-output ordering assertions.
- [ ] Run config test and confirm strict-mode assertions fail.
- [ ] Add `set -euo pipefail`, `${VAR:-}` optional reads, and quoted expansions throughout command arguments and tests.
- [ ] Keep `||` only on repository create and `BETTER_AUTH_URL` removal.
- [ ] Run config test plus `bash -n deploy.sh` to GREEN.

### Task 4: Strict Optional Authentication For `/api/me`

**Files:**
- Modify: `tests/unit/server/me.test.js`
- Modify: `server/middleware/guards.js`
- Modify: `server/routes/me.js`

**Interfaces:**
- Consumes: `resolveFreshUser(req)`.
- Produces: `strictOptionalAuth` returning `500` on authority lookup failure while preserving `null` for absent/suspended sessions.

- [ ] Add fault-injected `/api/me` test that forces fresh authority lookup failure and expects logged `500`, while retaining anonymous and suspension tests.
- [ ] Run focused me/guard tests and confirm current response is `200 { user: null }`.
- [ ] Export `strictOptionalAuth`; set `req.user` on success and log/return `500` on failure.
- [ ] Use strict middleware only on `/api/me`.
- [ ] Run me/guard/hook tests to GREEN.

### Task 5: Project Unpublish Audit Rollback Regression

**Files:**
- Modify: `tests/unit/server/gallery.test.js`

**Interfaces:**
- Consumes: existing `withTransaction` project update plus `insertPlatformAudit`.
- Produces: regression proof that audit insertion failure rolls project and new audit state back without touching legacy audit table.

- [ ] Add transaction fault injection around `INSERT INTO platform_audit_actions`.
- [ ] Add test snapshotting project, platform audit, and `moderation_actions`, expecting `500` and exact unchanged state.
- [ ] Run test and confirm injected failure reaches route and rollback assertions pass without production change.

### Task 6: Verification, Review, Report, And Commits

**Files:**
- Create: `.superpowers/sdd/final-review-fix-report.md`

**Interfaces:**
- Consumes: exact command outputs and final diff.
- Produces: durable RED/GREEN, verification, commit, and concern record.

- [ ] Run required focused server and frontend suites.
- [ ] Run `bash -n deploy.sh`, build, and TypeScript; record exact five baseline diagnostics.
- [ ] Run full serial Vitest if time permits.
- [ ] Review diff for authorization bypass, logout race/error behavior, transaction rollback, shell failure masking, and environment/test leakage.
- [ ] Write report with exact RED/GREEN commands/results, files, commits, and concerns.
- [ ] Inspect status/diff/log, stage only intended files, and create conventional commit(s).
