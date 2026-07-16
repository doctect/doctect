# Account Moderation and Suspension Design

**Date:** 2026-07-16
**Status:** Approved and implemented

## Goal

Give administrators a safe, auditable way to suspend abusive accounts, immediately revoke their access, optionally unpublish selected content, and later restore access. Support temporary and indefinite suspensions without adding application-level IP blocking.

## Current State

- Better Auth's admin plugin is enabled and the `user` table already has `role` and `banned` fields.
- The migration-managed schema does not contain Better Auth's `banReason` or `banExpires` fields, although the legacy setup script does.
- Session records can store an IP address, but the application does not expose or enforce an IP denylist.
- Admin-only server routes can inspect reports, unpublish one project, delete a review, and read event statistics.
- No account moderation page, account suspension API, or moderation audit table exists.
- Authentication and general write rate limits already provide basic abuse resistance. Their in-memory stores are not a substitute for a distributed edge control in multi-instance deployments.

## Chosen Approach

Build an application-owned moderation workflow using Better Auth-compatible suspension fields. Server routes coordinate account state, session revocation, selected project unpublishing, and append-only audit records in one database transaction.

This is preferred over directly composing Better Auth admin-client calls because separate client calls cannot make account, content, and audit changes atomic. It is preferred over a CLI because administrators need an accessible review and restoration workflow.

## Scope

### Included

- Admin user search and account detail.
- Temporary or indefinite account suspension.
- Mandatory moderation reasons.
- Immediate revocation of all target sessions.
- Selection of individual published projects to unpublish during suspension.
- Account restoration.
- Immutable moderation history.
- Admin UI, protected server API, schema migrations, tests, and operations documentation.

### Excluded

- Application-level exact-IP or CIDR denylisting.
- Automated suspensions or risk scoring.
- Automatic removal of all content owned by a suspended account.
- Role management, account deletion, review deletion within the suspension form, and appeals workflow.
- Suspending administrator accounts.

## Data Model

### User suspension fields

Append a migration adding fields required by Better Auth's admin suspension semantics:

- `banReason` — nullable text.
- `banExpires` — nullable timestamp.
- `moderationVersion` — non-null integer, initially `0`, used for optimistic concurrency.

The existing `banned` field remains the suspension flag. An active suspension is:

```text
banned = true AND (banExpires IS NULL OR banExpires > current time)
```

An expired temporary suspension permits a fresh sign-in under Better Auth's expiry semantics. The audit history remains intact. Restoration explicitly clears `banned`, `banReason`, and `banExpires` and increments `moderationVersion`.

Append migration `012_session_suspension_guard` after moderation schema migration. Both dialects add a `BEFORE INSERT` session trigger that rejects creation for an actively suspended referenced user. PostgreSQL trigger locks referenced user row with `FOR UPDATE` before evaluating fields, serializing session insertion with suspension's target-user lock: insert-first commits before suspension deletes sessions, while suspension-first exposes active state and rejects insert. SQLite uses equivalent active-state predicate under serialized writer behavior. Unbanned and expired users remain eligible for session creation.

Do not modify migration `012`. Append migration `013_session_suspension_wall_clock` to replace PostgreSQL trigger function with identical lock/guard behavior using `(clock_timestamp() AT TIME ZONE 'UTC')` for expiry comparison. Wall-clock time advances while row lock is awaited; explicit UTC conversion matches timestamp-without-time-zone `banExpires`. SQLite migration is safe `SELECT 1` because its trigger already uses `julianday('now')` at execution time.

### Moderation audit table

Add `moderation_actions` with:

- `id` — stable UUID.
- `actor_user_id` and `actor_email` — administrator identity and snapshot.
- `target_user_id` and `target_email` — moderated account identity and snapshot.
- `action` — `account_suspended`, `account_restored`, or `project_unpublished`.
- `reason` — mandatory administrator-provided reason.
- `expires_at` — suspension expiry when applicable.
- `project_id` — affected project for an unpublish event; otherwise null.
- `created_at` — server timestamp.

Indexes support target/time and actor/time history queries. IDs are retained as audit values rather than cascading foreign keys, so later account or project deletion cannot erase moderation history.

The application exposes no update or delete route for audit rows. PostgreSQL and SQLite migrations add guards that reject direct `UPDATE` and `DELETE` operations against this table, making records append-only even when application code changes later.

## Admin API

All endpoints use server-side `requireAdmin`. Client route guards are only a usability layer.

### Search users

`GET /api/admin/users?q=<query>&cursor=<cursor>`

- Requires a non-empty email or username query.
- Returns a bounded, cursor-paginated result set.
- Includes only ID, email, username, role, creation time, active suspension status, expiry, and `moderationVersion`.
- Never returns credentials, OAuth tokens, session tokens, session IPs, or password data.

### Account detail

`GET /api/admin/users/:id`

Returns:

- Minimal account and suspension state.
- Current `moderationVersion`.
- Published projects eligible for selection.
- Cursor-paginated moderation history.

### Suspend account

`POST /api/admin/users/:id/suspend`

Body:

```json
{
  "reason": "Required explanation",
  "expiresAt": "ISO timestamp or null",
  "projectIdsToUnpublish": ["project-id"],
  "expectedModerationVersion": 3
}
```

In one transaction, the server:

1. Locks and validates the target account.
2. Rejects administrator targets.
3. Verifies `expectedModerationVersion` and that the account state is still eligible for suspension.
4. Validates every selected project is owned by the target and still published.
5. Sets Better Auth-compatible suspension fields and increments `moderationVersion`.
6. Deletes every session belonging to the target, causing immediate sign-out.
7. Unpublishes only selected projects.
8. Appends one `account_suspended` audit row and one `project_unpublished` row per affected project.

Any failure rolls back every step.

### Restore account

`POST /api/admin/users/:id/restore`

Body contains a mandatory reason and `expectedModerationVersion`. In one transaction, the server validates current state, clears suspension fields, increments the version, deletes any target sessions defensively, and appends an `account_restored` action.

The existing standalone project-unpublish endpoint remains available for content-only moderation outside an account suspension.

## Admin UI

Add a role-gated navigation entry and `/admin/moderation` route.

### User search

- Search by email or username.
- Show bounded, paginated results with current suspension state.
- Do not provide an unfiltered account directory.

### Account detail

- Show account identity, role, suspension state, expiry, and recent moderation history.
- List currently published projects with individual selection controls and links for review.
- Never display session IPs, authentication tokens, or credential records.
- Label administrator targets as protected and render no suspension/restoration controls or confirmation. Server-side `403` remains authoritative.

### Suspension flow

1. Select indefinite, 24-hour, 7-day, 30-day, or custom future expiry.
2. Enter a mandatory reason.
3. Select zero or more published projects to unpublish.
4. Review a confirmation showing target account, duration, and exact selected projects.
5. Submit once; disable duplicate submission while pending.

Successful suspension refreshes account state and history. The target's active sessions cease to work immediately.

### Restoration flow

Restoration requires a new reason and confirmation. Successful restoration refreshes status and history. It does not republish content; publishing remains an explicit owner or administrator decision outside this flow.

## Validation and Error Handling

- Reasons are trimmed, mandatory, and limited to 1,000 characters.
- Temporary expiry must be calendar-valid ISO-8601 with `T`, seconds, and explicit `Z` or numeric timezone. Locale and timezone-less timestamps are rejected. Indefinite suspension uses null.
- Future expiry is checked before transaction entry and again after target/project locks immediately before first write. Expiry elapsed under locks returns `400` with no account, session, project, or audit mutation.
- Duplicate or malformed project IDs are rejected. `projectIdsToUnpublish` has a maximum cardinality of 20, matching default supported published-project scale.
- `400` — malformed reason, expiry, project list, or concurrency input.
- `403` — non-admin caller or administrator target.
- `404` — target user not found.
- `409` — moderation version changed, target status changed, or any selected project is no longer both owned by the target and published.
- `500` — unexpected server failure; transaction rollback leaves no partial account, session, content, or audit changes.

The UI preserves reason, duration, and project selections after recoverable failures, shows an actionable message, and asks the administrator to refresh after a conflict.

## Security and Operations

- Server authorization and transaction validation are authoritative; client checks cannot grant access.
- Existing origin checking protects mutation routes. Existing write limiting also applies.
- Express direct `/api/auth/admin` denial remains defense-in-depth. Better Auth `hooks.before` rejects normalized `/admin` and `/admin/*` paths, covering raw and percent-encoded dot-segment normalization before plugin execution while retaining `admin()` for sign-in ban semantics.
- After Better Auth resolves a session, `requireAuth` and `optionalAuth` use one `withTransaction` operation to lock user, recheck fresh suspension fields, and delete sessions only if still active. PostgreSQL uses `FOR UPDATE`; SQLite uses transaction serialization. Guard-first cleanup commits before restoration/new sign-in, while restoration-first is observed as inactive and cannot delete post-restoration session. Active state remains unauthenticated (`401` or null respectively).
- Suspension never exposes or acts on stored session IP addresses.
- Administrator accounts cannot be suspended through this workflow, reducing accidental or hostile lockout. Admin role changes remain an operator-only task.
- Deployment documentation must explain suspension, expiry, restoration, audit lookup, and selected-content behavior.
- Application-level IP bans are intentionally omitted because VPNs, shared networks, carrier NAT, IPv6 rotation, and incorrect proxy trust can cause easy evasion or collateral blocking.
- If evidence later requires IP blocking, use short-lived CDN/WAF/load-balancer rules after verifying ingress isolation and trusted proxy configuration. A shared edge or distributed store is required for consistent multi-instance enforcement.

## Testing

### Migration and data tests

- PostgreSQL and SQLite schemas expose equivalent suspension and audit fields.
- Existing databases migrate without altering current users' access.
- Audit rows accept inserts and reject updates/deletes.
- Audit indexes and `moderationVersion` defaults exist.

### Server integration tests

- Non-admins cannot search, inspect, suspend, or restore users.
- Search is query-bound, paginated, and excludes sensitive fields.
- Administrator targets cannot be suspended.
- Indefinite and temporary suspension fields persist correctly.
- Every target session is revoked on suspension.
- Session insertion is allowed for unbanned/expired users and rejected for active users by SQLite behavior tests; PostgreSQL trigger SQL and row-lock serialization are asserted exactly because no live PostgreSQL harness exists.
- Preexisting sessions followed by direct active state are denied and cleaned by required and optional auth guards.
- Deterministic barrier tests cover both guard-first and restoration-first lock orderings and prove no post-restoration session deletion.
- Active suspension causes Better Auth's existing `BANNED_USER` sign-in response.
- Expired temporary suspension permits a fresh sign-in.
- Selected projects become private and lose published commit linkage; unselected projects remain published.
- Invalid, stale, foreign-owned, or already-unpublished project selection produces `409` without partial changes.
- Forced failures at account update, session deletion, project update, and audit insertion roll back the full transaction.
- Restore clears state, revokes sessions defensively, and appends the correct audit row.
- Audit events record actor, target, reason, expiry, action, timestamp, and project IDs accurately.

### Client tests

- Admin guard and role-based navigation.
- Search, pagination, empty results, and account detail loading.
- Duration presets and custom expiry validation.
- Individual project selection and confirmation summary.
- Duplicate-submit prevention and recoverable-error state retention.
- Suspension success, immediate status refresh, history display, and restoration.
- Sensitive authentication and session fields are neither requested nor rendered.
- Protected administrator detail is labeled and has no suspension/restoration controls or confirmation.

### End-to-end verification

Exercise a complete administrator workflow:

1. Sign in as an administrator.
2. Find a normal account with multiple published projects.
3. Suspend it and select only one project to unpublish.
4. Confirm its existing session is rejected and fresh sign-in is blocked.
5. Confirm selected content is private while unselected content remains public.
6. Restore the account and confirm fresh sign-in succeeds.
7. Confirm the complete immutable history appears in the admin page.

Run focused tests, the full unit suite, and the production build before completion.

## Acceptance Criteria

1. Administrators can search for an account and inspect its current moderation state without receiving sensitive authentication data.
2. Administrators can apply temporary or indefinite suspension with a mandatory reason.
3. Suspension immediately invalidates every target session and blocks sign-in while active.
4. Administrators can unpublish selected target-owned projects during suspension; unselected content remains unchanged.
5. Account, session, content, and audit changes are atomic.
6. Administrators can restore access with a mandatory reason; restoration never republishes content.
7. Every suspension, restoration, and selected unpublish action has an append-only audit record.
8. Administrator accounts cannot be suspended through this workflow.
9. No application-level IP denylist is introduced.
10. SQLite and PostgreSQL behavior is covered, existing moderation routes continue to work, and the full build/test suite passes.

PostgreSQL coverage in this repository is SQL-contract coverage rather than live server execution. Automated tests execute SQLite trigger behavior and assert exact PostgreSQL function/trigger statements, including target-user `FOR UPDATE` and migration `013` UTC wall-clock expression; they do not claim a live PostgreSQL migration run.
