# Platform Owner and Moderator Authority Design

**Date:** 2026-07-16
**Status:** Approved, pending written-spec review
**Builds on:** `docs/superpowers/specs/2026-07-16-account-moderation-design.md`

## Goal

Introduce a deployment-controlled platform owner authority above moderators so compromised or abusive moderators can be demoted, signed out, optionally suspended, and audited without gaining any path to act on owners. Extend immutable auditing to every state-changing moderation action.

## Current State

- Platform authority is flat: every moderator has `role = 'admin'` and the same `requireAdmin` permissions.
- Admins can moderate normal users and content but cannot suspend another admin.
- No application role can promote or demote admins. `ADMIN_EMAILS`, a local SQLite script, or direct database access assigns the role outside the moderation audit.
- Existing account actions and selected project unpublishing are append-only audited. Standalone project unpublishing and review deletion are not.
- Better Auth admin HTTP endpoints are blocked, so no supported HTTP role-management path bypasses the application.
- Auth guards re-read suspension state but currently trust the session's role value. A future demotion must refresh role authority immediately.

## Chosen Authority Model

Use three effective roles:

```text
owner > admin > user
```

Null or unknown stored roles are treated as `user`. Permission hierarchy is explicit rather than inferred from arbitrary role strings.

| Capability | Owner | Admin | User |
|---|---:|---:|---:|
| View reports and moderation case context | Yes | Yes | No |
| Suspend/restore users | Yes | Yes | No |
| Moderate user-owned/user-authored content | Yes | Yes | No |
| Promote users to admin | Yes | No | No |
| Demote or suspend admins | Yes | No | No |
| Moderate admin-owned/admin-authored content | Yes | No | No |
| Inspect global platform audit | Yes | No | No |
| Act on an owner or owner content | No | No | No |
| Add/remove owners | Deployment only | No | No |

Existing `requireAdmin` semantics become moderator semantics and accept either `admin` or `owner`. Add a distinct `requireOwner` guard for role lifecycle and global audit endpoints.

## Owner Root of Trust

### Configuration

`OWNER_EMAILS` is the only supported owner-membership source. It is a comma-separated list whose entries are trimmed, lowercased, deduplicated, and compared with normalized account emails.

- Production refuses to start when the resulting set is empty.
- Development and tests may run with an empty set.
- Owner membership cannot be mutated through an application or Better Auth endpoint.
- Multiple configured owners are supported for account-loss and incident recovery.
- `ADMIN_EMAILS` signup auto-promotion is retired. Existing admin rows are not changed by that retirement.

### Startup reconciliation

After migrations and before accepting requests, one transaction reconciles existing accounts:

1. Existing accounts whose normalized email appears in `OWNER_EMAILS` become `owner`.
2. Accounts stored as `owner` whose email is no longer configured become `user`, not admin.
3. Each changed account increments `moderationVersion` and loses every active session.
4. Each role change receives an immutable system audit event in the same transaction.

Configured emails without an account require no row. If one later signs up, a post-create reconciliation transaction grants owner role, revokes any signup session, and writes the system audit event atomically. If audit/reconciliation fails, the account remains non-owner and cannot gain owner authority without a successful reconciliation.

System reconciliation events use actor kind `system`, no actor user ID, actor label `OWNER_EMAILS reconciliation`, and a fixed operational reason.

### Request-time enforcement

Every authenticated application request re-reads fresh account email, role, suspension fields, and moderation version under the existing auth transaction. `req.user` receives the fresh values rather than stale session role data.

`requireOwner` requires both:

1. fresh stored role equals `owner`; and
2. fresh normalized email remains in current `OWNER_EMAILS`.

This dual check prevents a stale database role or stale cookie from retaining owner authority. Role changes revoke sessions, but fresh request checks remain defense in depth.

Any database row marked `owner` is protected from application moderation even if configuration is temporarily inconsistent. Startup reconciliation resolves stale owner rows before traffic.

## Moderator Boundaries

Admins may target only normal users and state owned/authored by normal users.

- Account suspend/restore rejects targets whose fresh role is `admin` or `owner`.
- Standalone project unpublish checks the project owner's fresh role and rejects admin/owner-owned projects for an admin actor.
- Review deletion checks the review author's fresh role and rejects admin/owner-authored reviews for an admin actor.
- Owner actors may target user/admin accounts and their content, but never owner accounts or owner content.
- Search/detail may show admin/owner accounts for case awareness, but controls remain hidden or protected according to actor/target hierarchy.
- Stats and report-list access remains available to both admins and owners.

Server checks are authoritative. Client guards and hidden controls provide safety and clarity only.

## Owner Role-Lifecycle API

### Promote moderator

`POST /api/owner/users/:id/promote-admin`

Request:

```json
{
  "reason": "Required explanation",
  "expectedModerationVersion": 4
}
```

The target must exist, have effective role `user`, and not have an active suspension. In one transaction the server locks the target, validates owner membership and version, changes role to `admin`, increments `moderationVersion`, revokes every target session, and appends `admin_promoted` audit action.

### Remove moderator access

`POST /api/owner/users/:id/revoke-admin`

Request:

```json
{
  "reason": "Required explanation",
  "expectedModerationVersion": 8,
  "suspension": {
    "expiresAt": "ISO timestamp or null"
  },
  "projectIdsToUnpublish": ["project-id"]
}
```

`suspension` may be null. The target must currently be admin, never owner. In one transaction the server:

1. Locks and revalidates the target and selected projects.
2. Always changes role to `user` and increments `moderationVersion` once.
3. Revokes every target session.
4. If suspension is supplied, sets validated temporary/indefinite suspension fields.
5. If suspension is omitted, preserves any pre-existing suspension fields rather than silently restoring access.
6. Unpublishes only selected target-owned published projects, whether or not suspension is supplied.
7. Appends `admin_demoted`, optional `account_suspended`, and one `project_unpublished` event per selected project.

Restoring the account later never restores admin role. A new owner promotion is required.

### Role-transition rules

- Promotion of admin/owner or active-suspended target returns `409`.
- Demotion of user or stale-version target returns `409`.
- Any owner target returns `403`.
- Missing target returns `404`.
- Invalid reason, version, expiry, or project selection returns `400`.
- Unexpected failure rolls back role, suspension, sessions, content, version, and audit rows.

Reasons are trimmed, mandatory, and limited to 1,000 characters. Existing strict ISO expiry and 20-project selection bounds remain.

## Account Restoration Rules

- Admins may restore only `user` targets.
- Owners may restore `user` or `admin` targets.
- No actor may restore an owner target.
- Restoration never changes role or republishes content.
- Owner demotion with optional suspension produces a user target, so later restoration leaves it as user.

This closes the current server asymmetry where crafted restore requests do not independently reject protected admin targets.

## Owner and Moderator UI

Extend `/admin/moderation` according to fresh session role:

### Admin view

- Normal user targets retain suspend/restore and selected-content controls.
- Admin and owner targets show protected notices and no mutation controls.
- Content controls reject protected owners/authors server-side even if a stale UI renders them.

### Owner view

- User target: existing moderation controls plus **Promote to moderator**.
- Admin target: **Remove moderator access** workflow with mandatory reason, optional suspension, and selected project unpublishing.
- Owner target: protected notice and no mutation controls.
- Confirmation names exact target, old/new role, suspension duration, and project names plus IDs.
- Successful role transition signs the target out and refreshes account state/history.
- Recoverable failures retain draft values; `409` requires detail refresh.

Add an owner-only global audit area within the moderation page, with cursor pagination and filters for actor email, target email, action type, and date range.

## Generalized Immutable Audit

### Schema

Append a migration creating `platform_audit_actions` and copy every existing `moderation_actions` row into it. Existing `moderation_actions` remains immutable historical storage but receives no future writes. New history reads and writes use `platform_audit_actions`.

Fields:

- stable UUID
- actor kind: `user` or `system`
- nullable actor user ID and actor email/label snapshot
- nullable target user ID and target email snapshot
- nullable project ID and review ID
- action type
- mandatory reason
- nullable suspension expiry
- server timestamp
- constrained action-specific metadata JSON

Supported actions:

- `owner_granted`
- `owner_removed`
- `admin_promoted`
- `admin_demoted`
- `account_suspended`
- `account_restored`
- `project_unpublished`
- `review_deleted`

PostgreSQL and SQLite triggers reject direct `UPDATE` and `DELETE`. No audit table foreign key cascades can erase history.

### Metadata and privacy

Metadata is generated server-side from whitelisted action fields:

- previous/new role
- action source, such as standalone moderation or account workflow
- previous project visibility
- deleted review rating

Audit never stores passwords, tokens, session IDs, IP addresses, arbitrary request payloads, or review body text.

### Mutation coverage

Every state-changing moderator/owner operation writes audit rows in the same transaction:

- role promotion/demotion
- owner configuration reconciliation
- account suspension/restoration
- project unpublishing, including standalone actions
- review deletion

Standalone project unpublish and review delete gain mandatory reasons. Review deletion snapshots review ID, project ID, author ID/email, and rating before deletion, but not review text.

Searches, report views, account-detail views, and moderation-page access are not audited.

### Visibility

- Moderators retain target-account history required for case context.
- Owners can query global newest-first audit with actor, target, action, and date filters.
- System owner-reconciliation events are visible only through owner global audit.

## Security Properties

- Better Auth `/admin` HTTP endpoints remain denied at both Express and normalized auth-hook layers.
- Owner membership has no HTTP mutation path.
- Admins cannot act on peers or owners.
- Owners cannot act on configured/stored owners through application APIs.
- Fresh role lookup plus session revocation makes demotion immediate.
- Database session-insert suspension triggers continue preventing sign-in/suspension races.
- User-first row locking maintains existing lock order for role, suspension, session, and content mutations.
- Audit insertion failure aborts the state change.
- Direct database/deployment operators remain trusted and outside application enforcement by definition.

## Error Handling

- `400` — malformed reason, expiry, role input, selection, filter, or cursor.
- `401` — no valid session or revoked session.
- `403` — insufficient hierarchy, protected owner, or admin targeting admin/owner.
- `404` — target account/content missing.
- `409` — stale moderation version, role, suspension, or content state.
- `500` — unexpected failure; transaction rollback leaves no partial role, session, content, or audit state.

UI distinguishes mutation success from refresh failure and never offers a stale duplicate role action.

## Migration and Rollout

1. Configure at least two production `OWNER_EMAILS` before deploying this feature.
2. Stage migrations and reconciliation against PostgreSQL, including legacy moderation audit backfill and immutable triggers.
3. Deploy migrations, then run owner reconciliation before opening the server port.
4. Verify each configured owner can access owner controls and global audit.
5. Remove `ADMIN_EMAILS` from deployment configuration and documentation. Existing admin database roles remain until owners review them.
6. Review every existing admin and demote any account that no longer needs moderator authority.

Emergency recovery changes `OWNER_EMAILS` and redeploys. Removed owners become users; newly configured existing accounts become owners; all affected sessions are revoked; changes are system-audited.

Local development may omit `OWNER_EMAILS`. Production fails closed when it is missing or normalizes to an empty set.

## Testing

### Configuration and reconciliation

- Owner email trimming, lowercasing, deduplication, and exact matching.
- Production empty configuration prevents startup; development/test empty configuration works.
- Existing configured accounts become owners; stale owners become users.
- Multiple owners are retained.
- Reconciliation increments versions, revokes sessions, and writes exact system audit rows atomically.
- Configured owner signup receives owner only after successful audited reconciliation.
- Failed audit insertion rolls back role/session/version changes.

### Authorization matrix

- Owners satisfy moderator and owner guards.
- Admins satisfy moderator guard but fail owner guard.
- Users fail both.
- Stale admin/owner session roles cannot retain authority after database/config change.
- Admin cannot promote/demote, suspend/restore admin or owner, unpublish their projects, or delete their reviews.
- Owner can act on user/admin targets and content but never owner targets/content.
- Better Auth normalized admin bypass tests remain green.

### Role lifecycle and atomicity

- Promotion and demotion validate role/version/state and revoke all sessions.
- Demotion without suspension preserves existing suspension fields.
- Optional suspension and selected unpublishing commit with demotion in one transaction.
- Restoration never restores admin role or republishes content.
- Fault injection at role update, session deletion, content update, and audit insertion proves full rollback.
- Concurrent role/suspension/auth operations preserve user-first lock order and fresh authority.

### Audit

- Existing moderation rows backfill exactly once.
- New audit table accepts insert and rejects update/delete on SQLite; PostgreSQL SQL contracts are exact and staging executes them live.
- Every state-changing endpoint records actor, target, reason, action, timestamp, and action-specific metadata.
- Standalone unpublish/review delete require reasons and roll back if audit insertion fails.
- Global audit is owner-only, filtered, cursor-paginated, and excludes sensitive data.

### Client and browser

- Role-specific navigation and controls for owner/admin/user.
- Protected owner/admin target states.
- Exact confirmation content and recoverable failure behavior.
- End-to-end: configured owner promotes moderator; moderator moderates user; owner inspects audit; owner demotes and suspends abusive moderator; old moderator session loses access; restoration leaves target as user.

Run focused suites, full serial Vitest, production build, TypeScript diagnostic-delta check, and Chromium E2E before completion.

## Acceptance Criteria

1. `OWNER_EMAILS` is the sole owner root of trust and has no application mutation path.
2. Production cannot start without at least one configured owner email; multiple owners are supported.
3. Removed configured owners become users, configured existing accounts become owners, sessions are revoked, and changes are audited.
4. Admins can moderate users/user content only and cannot act on admins or owners.
5. Owners can promote users, demote admins, optionally suspend during demotion, and moderate admin content.
6. No application actor can mutate an owner account or owner content.
7. Role changes take effect immediately for existing sessions and are optimistic-concurrency protected.
8. Every state-changing moderation/role/content action has an immutable audit record in the same transaction.
9. Owner demotion with suspension restores later as user, never admin.
10. Existing account moderation, session-race protection, normalized Better Auth denial, selected-only unpublish, and no-republish behavior do not regress.
11. Existing admins survive rollout until an owner explicitly demotes them; `ADMIN_EMAILS` no longer grants new admin roles.
12. SQLite tests, PostgreSQL staging verification, full unit/build/browser gates, and documentation pass before production rollout.
