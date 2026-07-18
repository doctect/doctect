# Account Moderation Final Fix Report

## Status

All final whole-branch review findings were addressed in isolated worktree `/media/anoop/ssd_1/Work/doctect/doctect/.worktrees/account-moderation` on branch `feat/account-moderation`.

Primary implementation commit:

- `3db726701f713c09fb619fb8c56b91e8ac7f38ca` — `fix(auth): close suspension races`
- `3ab8136bf6825fd2ef0dc99ada3dd5635be84018` — `fix(auth): serialize guard cleanup`

## Root Causes

### Normalized Better Auth administrator bypass

Express matched `/api/auth/admin` against raw request path before Better Call constructed and normalized its URL. Raw and percent-encoded dot segments could therefore miss Express prefix middleware, normalize to Better Auth `/admin/*`, and execute plugin administrator endpoints. Better Auth pre-hook only enforced password policy and did not reject normalized administrator paths.

Fix: retained Express prefix block and `admin()` plugin, then added normalized `ctx.path === '/admin' || ctx.path.startsWith('/admin/')` denial in Better Auth `hooks.before` before plugin endpoint execution.

### Session creation race

Better Auth's admin plugin read user suspension state before inserting a session. Suspension locked user, updated suspension fields, and deleted current sessions, but no database invariant prevented a concurrent insert after deletion. Application auth guards then trusted Better Auth's resolved session user without re-reading current suspension fields.

Fix: appended migration `012_session_suspension_guard`. PostgreSQL trigger locks referenced user row with `FOR UPDATE` before evaluating active suspension; SQLite trigger rejects active inserts under serialized writer behavior. Application guards now lock and read fresh `banned`/`banExpires` in one transaction, delete all target sessions in that transaction only while state remains active, and return required-auth `401` or optional-auth null.

### Guard cleanup/restoration race

Fresh guard read and session deletion originally used separate autocommit queries. Restoration could clear suspension, commit, and permit a new sign-in after guard read active state but before guard deletion; stale cleanup then deleted newly valid session.

Fix: guard suspension check and cleanup share `withTransaction`. PostgreSQL locks target user `FOR UPDATE`; SQLite serializes with `BEGIN IMMEDIATE`. If guard locks first, cleanup commits before restoration and later sign-in survives. If restoration commits first, guard recheck sees inactive state and performs no deletion.

### PostgreSQL transaction-start trigger clock

Migration `012` compared expiry with PostgreSQL `CURRENT_TIMESTAMP`, fixed at transaction start. Session insert waiting on suspension's user lock could evaluate stale pre-wait time and reject a suspension that expired during wait.

Fix: kept migrations `001`-`012` unchanged and appended `013_session_suspension_wall_clock`. It replaces PostgreSQL function comparison with `(clock_timestamp() AT TIME ZONE 'UTC')`; wall clock advances during lock wait, and UTC conversion matches timestamp-without-time-zone `banExpires`. SQLite uses safe `SELECT 1` because migration `012` trigger already evaluates `julianday('now')` at execution.

### Transaction-time expiry

`expiresAt` was checked before transaction entry only. Target and project locks could outlive a short remaining expiry, after which writes persisted an already-expired suspension and changed sessions/projects/audit.

Fix: after target/project locks and validation, server samples transaction write time, rejects elapsed expiry with `400`, and performs no writes.

### Input and UI gaps

JavaScript `Date.parse` accepted locale strings, timezone-less strings, and normalized impossible calendar dates. Project selection array had per-ID validation but no cardinality ceiling. Admin page chose controls only from suspension status and ignored protected administrator role.

Fix: strict calendar-valid ISO-8601 parsing with explicit timezone, named 20-project cap matching default supported public-project scale, and protected-administrator UI state with no suspension/restoration controls or confirmation. Server `403` remains authoritative.

### Full-suite fixture failure

Two migration atomicity fixtures marked `001_auth_tables` applied but omitted its `session` table. Migration `012` correctly failed against that impossible ledger/schema combination. Fixtures now include migration-001 session schema; production migration was not weakened.

## RED Evidence

Tests were written and run before production edits.

- Initial focused RED command: `npx vitest run tests/unit/server/accountModeration.test.js tests/unit/server/accountModerationMigration.test.js tests/unit/server/migrationsPostgres.test.js tests/unit/server/guards.test.js tests/unit/AdminModerationPage.test.tsx`
- Result: `5` files failed; `11` tests failed, `68` passed, `79` total.
- Normalized raw paths returned `200` and demonstrated real plugin execution: unban cleared suspension, role mutation promoted user, create added administrator, list exposed users, and remove deleted user. Expected 404/state snapshots failed.
- Migration `012` was absent; SQLite active-user session inserts resolved instead of rejecting; exact PostgreSQL function/trigger statements were absent.
- Required guard returned `200` for directly suspended preexisting session; optional guard returned user instead of null; sessions remained.
- Lock/clock test returned `200` instead of `400` and changed account/session/project/audit state.
- Protected administrator label was absent and suspension controls remained rendered.
- Two extra RED failures were restoration timestamp assertions caused by failed expiry test leaking mocked time; test was corrected with `finally` before implementation.

Separate validation/cardinality RED command:

- `npx vitest run tests/unit/server/accountModeration.test.js -t "rejects noncanonical|rejects more than 20"`
- Result: `4` failed, `1` passed, `40` skipped.
- Timezone-less, locale, and impossible-date values returned `200` instead of `400`.
- 21 project IDs reached transaction conflict and returned `409` instead of input `400`.
- Existing invalid `+24:00` offset already returned `400`; retained as boundary regression coverage.

Guard/restoration and wall-clock RED command:

- `npx vitest run tests/unit/server/guardsRestorationRace.test.js tests/unit/server/migrationsPostgres.test.js`
- Result: `2` files failed; `4` tests failed, `3` passed.
- Guard-first ordering was `guard-check`, `restore-clear`, `sign-in`, `guard-delete`, proving stale cleanup deleted post-restoration session.
- Both race tests proved guard used no transaction and generated no PostgreSQL `FOR UPDATE` query.
- Migration-order test found no `013`; exact UTC wall-clock function statement was absent.

## GREEN Evidence

- First focused GREEN: `5` files passed, `84` tests passed.
- Expanded migration/auth/guards/moderation/page suite: `13` files passed, `126` tests passed.
- Migration fixture regression rerun: `2` files passed, `2` tests passed.
- Final full `npx vitest run`: `127` files passed, `1073` tests passed, duration `19.36s`.
- `npm run build`: exit `0`, `2114` modules transformed, built in `20.23s`; existing chunk-size warning remains.
- `npx tsc --noEmit --pretty false`: exact baseline five diagnostics, zero delta:
  - Four `TS2556` diagnostics in `tests/unit/changePassword.test.tsx` and `tests/unit/loginEmailVerification.test.tsx`.
  - One `TS2339` diagnostic in `tests/unit/svgEditing.test.ts`.
- Chromium E2E: isolated client/API ports `43920`/`43921`, scratch SQLite, empty `DATABASE_URL`; `1 passed (6.6s)`. Temporary config/database removed.
- `git diff --check`: no output.

Guard/restoration follow-up GREEN evidence:

- Focused guards/migrations/moderation: `5` files passed, `66` tests passed.
- Expanded focused suite: `7` files passed, `72` tests passed.
- Final full `npx vitest run`: `128` files passed, `1077` tests passed, duration `21.55s`.
- `npm run build`: exit `0`, `2114` modules transformed, built in `20.51s`; existing chunk-size warning remains.
- `npx tsc --noEmit --pretty false`: exact same five baseline diagnostics, zero delta.
- Chromium E2E: isolated client/API ports `43930`/`43931`, scratch SQLite, empty `DATABASE_URL`; `1 passed (6.7s)`. Temporary config/database removed.

Normal sign-up/sign-in, active `BANNED_USER`, expired sign-in cleanup, required/optional guard behavior, migration idempotency, moderation rollback, protected page, and full administrator E2E workflow all ran in focused or full verification.

## Changed Files

- `server/auth.js` — normalized Better Auth administrator path denial.
- `server/migrations/index.js` — append-only migrations `012_session_suspension_guard` and `013_session_suspension_wall_clock`.
- `server/middleware/guards.js` — transaction-locked fresh suspension read, active-session cleanup, unauthenticated handling.
- `server/routes/adminModeration.js` — canonical expiry validation, 20-ID cap, post-lock expiry check.
- `pages/AdminModerationPage.tsx` — protected administrator state and suppressed controls/confirmation.
- `tests/unit/server/accountModeration.test.js` — raw normalized-path integration, expiry/cardinality/clock coverage, trigger-compatible session fixtures.
- `tests/unit/server/accountModerationMigration.test.js` — SQLite trigger behavior and statement-array coverage.
- `tests/unit/server/migrationsPostgres.test.js` — exact PostgreSQL trigger SQL/serialization contract.
- `tests/unit/server/guards.test.js` — fresh required/optional active-state denial and cleanup.
- `tests/unit/server/guardsRestorationRace.test.js` — deterministic guard-first/restoration-first serialization and session-survival coverage.
- `tests/unit/AdminModerationPage.test.tsx` — protected administrator page behavior.
- `tests/unit/server/publishedSnapshotMigration.test.js` — complete migration-001 fixture schema.
- `tests/unit/server/publishedMetadataMigrationAtomicity.test.js` — complete migration-001 fixture schema.
- `docs/8-cloud-and-gallery.md` — operational and HTTP contract updates plus PostgreSQL limitation.
- `docs/superpowers/specs/2026-07-16-account-moderation-design.md` — implemented security/race/validation/UI design.
- `docs/superpowers/plans/2026-07-16-account-moderation-final-review-fixes.md` — executable final-fix TDD plan.

## Self-Review

- Migrations `001`-`012` unchanged; `013` appended.
- Trigger bodies remain intact array statements.
- PostgreSQL insert trigger locks target user before evaluating active state, matching suspension's user-first lock order.
- Application guard locks target user and conditionally deletes sessions in one transaction, matching restoration's user-first lock order.
- Deterministic barriers prove both lock orderings preserve post-restoration session.
- PostgreSQL expiry comparison uses wall-clock UTC timestamp compatible with `banExpires TIMESTAMP`.
- SQLite behavior proves unbanned allowed, indefinite/future active rejected, expired allowed.
- Every changed application SQL statement uses each `$n` once.
- Express block retained as defense-in-depth; Better Auth `admin()` retained for `BANNED_USER` and expired-ban cleanup.
- Raw direct/dot/encoded-case/path tests cover ban, unban, role, create, list, and remove with 404 plus user/account/session/audit snapshots.
- Post-lock expiry test verifies zero account/session/project/audit mutation.
- Administrator server `403` unchanged; UI only improves safety and clarity.
- No unrelated production refactor or dependency added.

## Residual Concerns

- No live PostgreSQL harness exists. PostgreSQL migrations `012`/`013` are exact SQL-contract tested, including `FOR UPDATE` and UTC wall-clock expression, but not executed against live PostgreSQL. Documentation does not claim live execution.
- Existing five TypeScript diagnostics remain unchanged.
- Existing React Router warnings, intentional rollback logs, test email fallbacks, and Vite chunk-size warning remain unrelated.
