# Owner and Moderator Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deployment-controlled owners above moderators, immediate role reconciliation and revocation, hierarchy-safe moderation, and immutable audit coverage for every moderation state change.

**Architecture:** `OWNER_EMAILS` becomes root of trust through one parser/policy module used by startup reconciliation, signup reconciliation, and fresh request guards. Append-only migration `014` backfills legacy moderation history into generalized `platform_audit_actions`; shared mutation helpers make account, role, project, and review changes transactional with audit writes. Existing moderation page becomes fresh-role-aware, adds owner lifecycle controls and owner-only global audit while preserving moderator case workflows.

**Tech Stack:** JavaScript ESM, Express 5.2, Better Auth 1.4.10, PostgreSQL 8 driver, better-sqlite3 9, React 19, TypeScript 5.8, React Router 6, Vitest 4, Supertest, Testing Library, Playwright Chromium, Cloud Run/gcloud.

## Global Constraints

- Never edit applied migrations `011_account_moderation`, `012_session_suspension_guard`, or `013_session_suspension_wall_clock`; append `014_platform_audit_actions` only.
- Keep PostgreSQL and SQLite migration SQL containing trigger/function semicolons in statement arrays; migration runner must receive each array element intact.
- Every application SQL parameter uses `$1..$n`, each number exactly once, with values repeated in parameter arrays when SQL needs the same logical value twice.
- Mutation lock order is target user first, then project rows de-duplicated and sorted by ID through `lockProjectRows`, then review row when applicable.
- Effective roles are exactly `owner | admin | user`; null and unknown stored roles become `user`. Stored `owner` rows remain protected even when configuration is inconsistent.
- `OWNER_EMAILS` is sole owner-membership source: comma-separated, trimmed, lowercased, empty entries removed, and de-duplicated. Production with zero normalized entries must fail before listening; development/test may be empty.
- `ADMIN_EMAILS`, signup admin promotion, direct admin-promotion helper/script, and deployment/docs references are removed. Existing stored admins remain admins until owner action.
- `requireAdmin` accepts fresh `admin` or `owner`; `requireOwner` additionally requires fresh role `owner` and fresh normalized email membership in current `OWNER_EMAILS`.
- Better Auth `/admin` routes remain blocked both at Express `/api/auth/admin` and normalized Better Auth hook layers; retain existing bypass regression coverage.
- No application actor may target a stored/effective owner account, owner-owned project, or owner-authored review. Admins may target only users/user content; configured owners may target users/admins and their content.
- Every moderation state change writes `platform_audit_actions` in same transaction. Searches, reports, detail reads, and page views are not audited. `moderation_actions` receives no new application writes.
- Audit metadata is server-generated from action-specific whitelists. Never persist passwords, tokens, session IDs, IP addresses, request payloads, or review body text.
- Reasons are trimmed, mandatory, 1-1,000 characters. Non-null expiry uses calendar-valid ISO-8601 with `T`, seconds, and explicit `Z` or numeric offset, and remains future after locks.
- Account workflow and owner demotion project selection accepts 0-20 unique, trimmed, non-empty IDs of at most 200 characters. Only selected, target-owned, currently published projects are unpublished.
- Account role/suspension mutations increment `moderationVersion` once per request, revoke every target session, and use optimistic concurrency. Restoration never changes role or republishes content.
- Preserve database session-insert suspension triggers and application fresh-suspension cleanup behavior from migrations `012`-`013`.
- System reconciliation actor is `{ actorKind: 'system', actorUserId: null, actorEmail: 'OWNER_EMAILS reconciliation' }` with reason `Synchronize account role with OWNER_EMAILS configuration`.
- System reconciliation rows appear in owner global audit only; target-account history adds `actor_kind = 'user'`.
- Global and target history order is `created_at DESC, id DESC`, page size 25, with canonical base64url `[created_at_cursor, id]` cursors.
- No new runtime dependency. Keep server plain ESM JavaScript and client TypeScript/Tailwind conventions.
- TypeScript baseline is exactly five diagnostics and branch delta must remain zero:
  `tests/unit/changePassword.test.tsx(17,60) TS2556`,
  `tests/unit/loginEmailVerification.test.tsx(11,51) TS2556`,
  `tests/unit/loginEmailVerification.test.tsx(12,51) TS2556`,
  `tests/unit/loginEmailVerification.test.tsx(15,81) TS2556`, and
  `tests/unit/svgEditing.test.ts(33,39) TS2339`.
- Cloud Run `OWNER_EMAILS` updates must use a custom gcloud delimiter because a normal comma-delimited `--set-env-vars` value splits multiple owner addresses.

---

## File Structure and Interfaces

| Path | Change | Responsibility |
|---|---|---|
| `server/migrations/index.js` | Modify | Append dual-dialect migration `014_platform_audit_actions`, backfill, indexes, immutable triggers. |
| `server/platformAudit.js` | Create | Audit action/source constants, reason and metadata validation, insert, row-to-DTO conversion. |
| `server/moderationSupport.js` | Create | Shared suspension/version/project validation, account DTO, target-user lock. |
| `server/ownerAuthority.js` | Create | Owner email parser/config assertion, effective-role and hierarchy policy, startup/signup reconciliation. |
| `server/middleware/guards.js` | Modify | Fresh email/role/version projection, owner-aware moderator guard, `requireOwner`. |
| `server/auth.js` | Modify | Replace `ADMIN_EMAILS` hook with audited owner signup reconciliation; preserve normalized admin denial. |
| `server/index.js` | Modify | Validate production config and reconcile after migrations before `listen`. |
| `server/db.js` | Modify | Remove unaudited `makeUserAdmin`. |
| `server/routes/adminModeration.js` | Modify | Generalized history/audit and hierarchy-safe suspend/restore. |
| `server/routes/ownerModeration.js` | Create | Owner promotion, demotion, optional suspension/unpublishing, and global audit query. |
| `server/routes/gallery.js` | Modify | Atomic, reason-required, hierarchy-safe standalone project unpublish/review delete. |
| `server/app.js` | Modify | Register owner router; keep Better Auth denial and moderator stats/report access. |
| `services/cloudApi.ts` | Modify | Stable role/audit DTOs and typed moderation/owner endpoint methods. |
| `hooks/useCurrentUser.ts` | Create | Fetch fresh `/api/me` authority for route/menu UI instead of session role claims. |
| `pages/AdminModerationPage.tsx` | Modify | Coordinate account search/detail and mutation refresh state without absorbing every owner UI concern. |
| `components/moderation/OwnerRoleLifecyclePanel.tsx` | Create | Render owner-only promotion/demotion drafts and emit validated review requests. |
| `components/moderation/ModerationConfirmationDialog.tsx` | Create | Render and focus-manage immutable suspend/restore/promote/revoke confirmation snapshots. |
| `components/moderation/GlobalAuditPanel.tsx` | Create | Own owner-only global audit filters, request generations, errors, and cursor pages. |
| `App.tsx` | Modify | Fresh-role `ModeratorGuard` and moderation route wiring. |
| `components/AccountMenu.tsx` | Modify | Fresh-role moderation menu for admin and owner. |
| `tests/unit/server/platformAuditMigration.test.js` | Create | SQLite migration/backfill/immutability tests. |
| `tests/unit/server/platformAudit.test.js` | Create | Metadata whitelist, privacy, and shared writer tests. |
| `tests/unit/server/ownerAuthority.test.js` | Create | Parsing, fail-closed config, reconciliation, atomicity tests. |
| `tests/unit/server/ownerModeration.test.js` | Create | Lifecycle, hierarchy, lock order, rollback, global audit tests. |
| `tests/unit/server/accountModeration.test.js` | Modify | Owner/admin hierarchy and generalized account history/audit. |
| `tests/unit/server/gallery.test.js` | Modify | Audited standalone project unpublish and owner-role hierarchy. |
| `tests/unit/server/reviews.test.js` | Modify | Audited review deletion and author hierarchy. |
| `tests/unit/server/app.test.js`, `guards.test.js`, `guardsRestorationRace.test.js` | Modify | Fresh role guards, startup/signup behavior, normalized bypass regression. |
| `tests/unit/cloudApi.test.ts` | Modify | Exact typed request URLs/bodies/filter serialization. |
| `tests/unit/AdminModerationPage.test.tsx` | Modify | Role-specific controls, confirmations, retained drafts, global audit. |
| `tests/unit/GlobalAuditPanel.test.tsx` | Create | Owner-only global audit filters, pagination, races, privacy, and errors. |
| `tests/unit/adminModerationRouting.test.tsx`, `AccountMenu.test.tsx` | Modify | Fresh owner/admin route/menu behavior. |
| `tests/e2e/account_moderation.spec.js`, `tests/e2e/helpers.js`, `playwright.config.cjs` | Modify | Full owner-to-moderator lifecycle without direct role writes. |
| `.env.example`, `Dockerfile`, `deploy.sh` | Modify | Production owner configuration and safe gcloud delimiter. |
| `server/scripts/make_admin.js` | Delete | Remove unsupported unaudited role mutation path. |
| `server/scripts/setup_db.js` | Delete | Remove obsolete destructive schema bootstrap that diverges from migrations 011-014. |
| `docs/8-cloud-and-gallery.md` | Modify | Authority, endpoint, audit, privacy, and operations contract. |
| `docs/9-owner-moderator-rollout.md` | Create | PostgreSQL staging and production rollout/rollback checklist. |
| `README.md` | Modify | Document migration-driven startup, owner configuration, and current server commands. |

### Stable HTTP DTOs

All implementation tasks use these names and exact JSON fields:

```ts
export type PlatformRole = 'owner' | 'admin' | 'user';
export type ModerationActionType =
    | 'owner_granted' | 'owner_removed'
    | 'admin_promoted' | 'admin_demoted'
    | 'account_suspended' | 'account_restored'
    | 'project_unpublished' | 'review_deleted';
export type AuditSource =
    | 'owner_emails_reconciliation'
    | 'account_workflow'
    | 'owner_role_workflow'
    | 'standalone_project'
    | 'standalone_review';

export interface AuditMetadata {
    source: AuditSource;
    previousRole?: PlatformRole;
    newRole?: PlatformRole;
    previousProjectVisibility?: 'public';
    deletedReviewRating?: number;
}

export interface PlatformAuditAction {
    id: string;
    actorKind: 'user' | 'system';
    actorUserId: string | null;
    actorEmail: string;
    targetUserId: string | null;
    targetEmail: string | null;
    projectId: string | null;
    reviewId: string | null;
    action: ModerationActionType;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
    metadata: AuditMetadata;
}

export interface ModerationAccount {
    id: string;
    email: string;
    username: string | null;
    role: PlatformRole;
    createdAt: string;
    suspensionStatus: 'none' | 'active' | 'expired';
    banExpires: string | null;
    moderationVersion: number;
    banReason: string | null;
}
```

Endpoint bodies/envelopes are fixed:

```ts
POST /api/owner/users/:id/promote-admin
body: { reason: string; expectedModerationVersion: number }
200:  { account: ModerationAccount; actions: [PlatformAuditAction] }

POST /api/owner/users/:id/revoke-admin
body: {
  reason: string;
  expectedModerationVersion: number;
  suspension: { expiresAt: string | null } | null;
  projectIdsToUnpublish: string[];
}
200: { account: ModerationAccount; actions: PlatformAuditAction[] }
// action order: admin_demoted, optional account_suspended, then project_unpublished per request ID order

POST /api/admin/users/:id/suspend
body: { reason: string; expiresAt: string | null; projectIdsToUnpublish: string[]; expectedModerationVersion: number }
200: { account: ModerationAccount; actions: PlatformAuditAction[] }

POST /api/admin/users/:id/restore
body: { reason: string; expectedModerationVersion: number }
200: { account: ModerationAccount; actions: [PlatformAuditAction] }

POST /api/admin/projects/:id/unpublish
body: { reason: string }
200: { success: true; action: PlatformAuditAction }

DELETE /api/admin/reviews/:id
body: { reason: string }
200: { success: true; action: PlatformAuditAction }

GET /api/owner/audit?actorEmail=&targetEmail=&action=&from=&to=&cursor=
200: { items: PlatformAuditAction[]; nextCursor: string | null }
// actorEmail/targetEmail are normalized exact matches; from is inclusive; to is inclusive.
```

Mutation status/error envelopes are also fixed: anonymous `401 { error: 'Unauthorized' }`; wrong authority/hierarchy `403`; missing target/content `404`; malformed reason/version/expiry/selection/filter/cursor `400`; stale version/role/suspension/publication state `409`; unexpected transaction failure `500`. Owner lifecycle uses `403 { error: 'Target is protected by role hierarchy' }`, `404 { error: 'User not found' }`, `409 { error: 'Role or moderation state changed; refresh and try again' }`, and operation-specific `500` messages.

---

### Task 1: Generalized Immutable Audit Migration

**Files:**
- Create: `tests/unit/server/platformAuditMigration.test.js`
- Modify: `tests/unit/server/migrationsPostgres.test.js:21-147`
- Modify: `server/migrations/index.js:414-440`
- Include in first commit: `docs/superpowers/specs/2026-07-16-owner-moderator-authority-design.md`
- Include in first commit: `docs/superpowers/plans/2026-07-16-owner-moderator-authority.md`

**Interfaces:**
- Consumes: migration runner statement-array contract and existing `moderation_actions` schema.
- Produces: migration ID `014_platform_audit_actions` and immutable `platform_audit_actions` columns from Stable HTTP DTOs.

- [ ] **Step 1: Write failing SQLite migration tests**

Create a pre-014 database by applying migrations through `013`, insert one row for each legacy action, then restore migration list and run `runMigrations()`. Assert exact backfill, no duplicate after second run, old table unchanged, no foreign keys, JSON metadata, indexes, insert allowed, and direct update/delete rejected:

```js
expect((await query('SELECT COUNT(*) AS count FROM platform_audit_actions'))[0].count).toBe(3);
expect(await query(`SELECT id, actor_kind, review_id, action, metadata_json
    FROM platform_audit_actions ORDER BY id`)).toEqual([
  { id: 'legacy-restored', actor_kind: 'user', review_id: null, action: 'account_restored', metadata_json: '{"source":"account_workflow"}' },
  { id: 'legacy-suspended', actor_kind: 'user', review_id: null, action: 'account_suspended', metadata_json: '{"source":"account_workflow"}' },
  { id: 'legacy-unpublished', actor_kind: 'user', review_id: null, action: 'project_unpublished', metadata_json: '{"source":"account_workflow","previousProjectVisibility":"public"}' },
]);
await expect(query(`UPDATE platform_audit_actions SET reason = $1 WHERE id = $2`, ['changed', 'legacy-restored']))
  .rejects.toThrow('platform_audit_actions is append-only');
await expect(query('DELETE FROM platform_audit_actions WHERE id = $1', ['legacy-restored']))
  .rejects.toThrow('platform_audit_actions is append-only');
expect(await query('PRAGMA foreign_key_list(platform_audit_actions)')).toEqual([]);
```

- [ ] **Step 2: Add failing PostgreSQL exact-statement contract test**

Set `migrationState.pendingId = '014_platform_audit_actions'`; assert both trigger statements, JSONB backfill, indexes, and migration record. Also assert `migrations.slice(-4).map(({id}) => id)` equals `['011_account_moderation','012_session_suspension_guard','013_session_suspension_wall_clock','014_platform_audit_actions']`.

- [ ] **Step 3: Run RED migration tests**

Run: `npx vitest run tests/unit/server/platformAuditMigration.test.js tests/unit/server/migrationsPostgres.test.js`

Expected: FAIL because `platform_audit_actions` does not exist and migration `014_platform_audit_actions` is absent.

- [ ] **Step 4: Append migration 014 without changing 011-013**

Add PostgreSQL and SQLite arrays. Use these schema/action checks and equivalent dialect types:

```js
{
  id: '014_platform_audit_actions',
  pg: [
    `CREATE TABLE IF NOT EXISTS platform_audit_actions (
      id TEXT PRIMARY KEY,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'system')),
      actor_user_id TEXT,
      actor_email TEXT NOT NULL,
      target_user_id TEXT,
      target_email TEXT,
      project_id TEXT,
      review_id TEXT,
      action TEXT NOT NULL CHECK (action IN ('owner_granted', 'owner_removed', 'admin_promoted', 'admin_demoted', 'account_suspended', 'account_restored', 'project_unpublished', 'review_deleted')),
      reason TEXT NOT NULL,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json JSONB NOT NULL,
      CHECK ((actor_kind = 'system' AND actor_user_id IS NULL) OR (actor_kind = 'user' AND actor_user_id IS NOT NULL))
    )`,
    `INSERT INTO platform_audit_actions
      (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, project_id, review_id, action, reason, expires_at, created_at, metadata_json)
     SELECT id, 'user', actor_user_id, actor_email, target_user_id, target_email, project_id, NULL,
            action, reason, expires_at, created_at,
            CASE action
              WHEN 'project_unpublished' THEN jsonb_build_object('source', 'account_workflow', 'previousProjectVisibility', 'public')
              ELSE jsonb_build_object('source', 'account_workflow')
            END
     FROM moderation_actions
     ON CONFLICT (id) DO NOTHING`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_target_time ON platform_audit_actions(target_user_id, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_actor_email_time ON platform_audit_actions(LOWER(actor_email), created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_target_email_time ON platform_audit_actions(LOWER(target_email), created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_action_time ON platform_audit_actions(action, created_at DESC, id DESC)`,
    `CREATE OR REPLACE FUNCTION reject_platform_audit_action_mutation()
     RETURNS trigger AS $$
     BEGIN
       RAISE EXCEPTION 'platform_audit_actions is append-only';
     END;
     $$ LANGUAGE plpgsql`,
    `CREATE TRIGGER platform_audit_actions_no_update BEFORE UPDATE ON platform_audit_actions FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_action_mutation()`,
    `CREATE TRIGGER platform_audit_actions_no_delete BEFORE DELETE ON platform_audit_actions FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_action_mutation()`,
  ],
  sqlite: [
    `CREATE TABLE IF NOT EXISTS platform_audit_actions (
      id TEXT PRIMARY KEY,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'system')),
      actor_user_id TEXT,
      actor_email TEXT NOT NULL,
      target_user_id TEXT,
      target_email TEXT,
      project_id TEXT,
      review_id TEXT,
      action TEXT NOT NULL CHECK (action IN ('owner_granted', 'owner_removed', 'admin_promoted', 'admin_demoted', 'account_suspended', 'account_restored', 'project_unpublished', 'review_deleted')),
      reason TEXT NOT NULL,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
      CHECK ((actor_kind = 'system' AND actor_user_id IS NULL) OR (actor_kind = 'user' AND actor_user_id IS NOT NULL))
    )`,
    `INSERT OR IGNORE INTO platform_audit_actions
      (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, project_id, review_id, action, reason, expires_at, created_at, metadata_json)
     SELECT id, 'user', actor_user_id, actor_email, target_user_id, target_email, project_id, NULL,
            action, reason, expires_at, created_at,
            CASE action
              WHEN 'project_unpublished' THEN json_object('source', 'account_workflow', 'previousProjectVisibility', 'public')
              ELSE json_object('source', 'account_workflow')
            END
     FROM moderation_actions`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_target_time ON platform_audit_actions(target_user_id, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_actor_email_time ON platform_audit_actions(LOWER(actor_email), created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_target_email_time ON platform_audit_actions(LOWER(target_email), created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_action_time ON platform_audit_actions(action, created_at DESC, id DESC)`,
    `CREATE TRIGGER IF NOT EXISTS platform_audit_actions_no_update BEFORE UPDATE ON platform_audit_actions BEGIN SELECT RAISE(ABORT, 'platform_audit_actions is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS platform_audit_actions_no_delete BEFORE DELETE ON platform_audit_actions BEGIN SELECT RAISE(ABORT, 'platform_audit_actions is append-only'); END`,
  ],
}
```

- [ ] **Step 5: Run GREEN migration tests**

Run: `npx vitest run tests/unit/server/platformAuditMigration.test.js tests/unit/server/migrationsPostgres.test.js`

Expected: PASS; three legacy rows exist once in new table; SQLite update/delete throw append-only error; PostgreSQL function body remains one query call.

- [ ] **Step 6: Commit migration, spec, and plan**

```bash
git add docs/superpowers/specs/2026-07-16-owner-moderator-authority-design.md docs/superpowers/plans/2026-07-16-owner-moderator-authority.md server/migrations/index.js tests/unit/server/platformAuditMigration.test.js tests/unit/server/migrationsPostgres.test.js
git commit -m "feat(audit): add generalized platform history"
```

### Task 2: Shared Audit and Moderation Support

**Files:**
- Create: `server/platformAudit.js`
- Create: `server/moderationSupport.js`
- Create: `tests/unit/server/platformAudit.test.js`

**Interfaces:**
- Produces: `validateReason(raw): string | null`, `insertPlatformAudit(txQuery, event): Promise<PlatformAuditAction>`, `platformAuditActionDto(row)`.
- Produces: `MAX_PROJECTS_TO_UNPUBLISH`, `effective suspensionStatus`, `validateVersion`, `validateIsoTimestamp`, `validateExpiry`, `validateProjectIds`, `lockUser`, and `accountDto`.
- Metadata source/action combinations are exactly those in Stable HTTP DTOs.

- [ ] **Step 1: Write failing writer/privacy tests**

Use a recording `txQuery` and assert one insert with `$1` through `$13`, JSON serialization, nullable IDs, normalized DTO dates, and rejected extra metadata:

```js
await expect(insertPlatformAudit(txQuery, {
  actorKind: 'user', actorUserId: 'admin-1', actorEmail: 'admin@test.dev',
  targetUserId: 'user-1', targetEmail: 'user@test.dev', projectId: null, reviewId: 'review-1',
  action: 'review_deleted', reason: '  abusive review  ', expiresAt: null,
  createdAt: '2026-07-16T10:00:00.000Z',
  metadata: { source: 'standalone_review', deletedReviewRating: 2 },
})).resolves.toMatchObject({ reason: 'abusive review', metadata: { deletedReviewRating: 2 } });
await expect(insertPlatformAudit(txQuery, {
  ...event, metadata: { source: 'standalone_review', deletedReviewRating: 2, reviewBody: 'secret' },
})).rejects.toThrow('Invalid audit metadata');
expect(JSON.stringify(calls)).not.toMatch(/password|token|session|ipAddress|reviewBody/i);
```

- [ ] **Step 2: Write failing support validation tests**

Assert 1/1,000 reason bounds, strict timestamps, future expiry, version integer, 20 accepted/21 rejected IDs, duplicate-after-trim rejection, unknown role DTO normalization to `user`, and PostgreSQL `FOR UPDATE` target lock.

- [ ] **Step 3: Run RED support tests**

Run: `npx vitest run tests/unit/server/platformAudit.test.js`

Expected: FAIL with module-not-found for `server/platformAudit.js`.

- [ ] **Step 4: Implement exact action metadata whitelist and insert**

Use action rules that reject missing/extra keys and invalid source/value combinations:

```js
const metadataRules = {
  owner_granted: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_emails_reconciliation'] },
  owner_removed: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_emails_reconciliation'] },
  admin_promoted: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_role_workflow'] },
  admin_demoted: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_role_workflow'] },
  account_suspended: { keys: ['source'], sources: ['account_workflow', 'owner_role_workflow'] },
  account_restored: { keys: ['source'], sources: ['account_workflow'] },
  project_unpublished: { keys: ['source', 'previousProjectVisibility'], sources: ['account_workflow', 'owner_role_workflow', 'standalone_project'] },
  review_deleted: { keys: ['source', 'deletedReviewRating'], sources: ['standalone_review'] },
};

export const insertPlatformAudit = async (txQuery, raw) => {
  const event = validateAuditEvent(raw); // throws before SQL and returns trimmed reason + normalized metadata
  const id = randomUUID();
  await txQuery(`INSERT INTO platform_audit_actions
    (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, project_id, review_id, action, reason, expires_at, created_at, metadata_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
  [id, event.actorKind, event.actorUserId, event.actorEmail, event.targetUserId, event.targetEmail,
    event.projectId, event.reviewId, event.action, event.reason, event.expiresAt,
    event.createdAt, JSON.stringify(event.metadata)]);
  return platformAuditActionDto({ id, actor_kind: event.actorKind, actor_user_id: event.actorUserId,
    actor_email: event.actorEmail, target_user_id: event.targetUserId, target_email: event.targetEmail,
    project_id: event.projectId, review_id: event.reviewId, action: event.action, reason: event.reason,
    expires_at: event.expiresAt, created_at: event.createdAt, metadata_json: event.metadata });
};
```

`platformAuditActionDto` accepts PostgreSQL JSON objects or SQLite JSON strings. Role events require `previousRole/newRole`; project events require `previousProjectVisibility === 'public'`; review events require integer rating 1-5.

- [ ] **Step 5: Implement shared mutation support**

Move current strict expiry/project validation and account DTO behavior without loosening it. `lockUser` selects `id,email,username,role,"createdAt",banned,"banReason","banExpires","moderationVersion"`; PostgreSQL suffix is `FOR UPDATE`. `validateIsoTimestamp(raw, { future = false })` performs current calendar/zone checks, while `validateExpiry` calls it with `future: true`.

- [ ] **Step 6: Run GREEN support tests**

Run: `npx vitest run tests/unit/server/platformAudit.test.js`

Expected: PASS; unknown metadata keys and sensitive snapshots fail before insert; exact 13-placeholder insert passes.

- [ ] **Step 7: Commit shared support**

```bash
git add server/platformAudit.js server/moderationSupport.js tests/unit/server/platformAudit.test.js
git commit -m "feat(moderation): add shared audit support"
```

### Task 3: Owner Policy and Fresh Role Guards

**Files:**
- Create: `server/ownerAuthority.js`
- Create: `tests/unit/server/ownerAuthority.test.js`
- Modify: `server/middleware/guards.js:1-70`
- Modify: `tests/unit/server/guards.test.js`
- Modify: `tests/unit/server/guardsRestorationRace.test.js`
- Modify: `server/routes/me.js:7-13`

**Interfaces:**
- Produces: `normalizeEmail`, `parseOwnerEmails`, `getOwnerEmails`, `assertOwnerConfiguration`, `effectiveRole`, `isConfiguredOwner`, `canModerateRole`.
- Produces: fresh `req.user` fields `id,email,username,role,banned,banExpires,moderationVersion`; role is always a `PlatformRole`.
- Produces: `requireAdmin` for admin/owner and `requireOwner` for configured fresh owners.

- [ ] **Step 1: Write RED parser/policy matrix tests**

```js
expect([...parseOwnerEmails(' Owner@Example.COM, second@test.dev,owner@example.com, ,')])
  .toEqual(['owner@example.com', 'second@test.dev']);
expect(effectiveRole(null)).toBe('user');
expect(effectiveRole('unexpected')).toBe('user');
expect(canModerateRole('admin', 'user')).toBe(true);
expect(canModerateRole('admin', 'admin')).toBe(false);
expect(canModerateRole('owner', 'admin')).toBe(true);
expect(canModerateRole('owner', 'owner')).toBe(false);
expect(() => assertOwnerConfiguration({ NODE_ENV: 'production', OWNER_EMAILS: ' , ' }))
  .toThrow('OWNER_EMAILS must contain at least one email in production');
expect(() => assertOwnerConfiguration({ NODE_ENV: 'test', OWNER_EMAILS: '' })).not.toThrow();
```

- [ ] **Step 2: Write RED fresh-authority integration tests**

Create user/admin/owner cookies, then mutate stored roles after cookie issuance. Assert demoted admin immediately gets `403`, owner satisfies `/api/stats`, admin fails a temporary `requireOwner` probe, configured owner passes it, and removing owner email makes same stored-owner cookie fail owner probe. Assert `/api/me` returns fresh normalized role and no sensitive fields.

- [ ] **Step 3: Run RED authority/guard tests**

Run: `npx vitest run tests/unit/server/ownerAuthority.test.js tests/unit/server/guards.test.js tests/unit/server/guardsRestorationRace.test.js`

Expected: FAIL because parser/owner guard are absent and current guard returns stale session role.

- [ ] **Step 4: Implement parser and hierarchy policy**

```js
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const parseOwnerEmails = raw => new Set(String(raw ?? '').split(',').map(normalizeEmail).filter(Boolean));
export const getOwnerEmails = (env = process.env) => parseOwnerEmails(env.OWNER_EMAILS);
export const effectiveRole = role => role === 'owner' || role === 'admin' ? role : 'user';
export const isConfiguredOwner = (user, env = process.env) =>
  effectiveRole(user?.role) === 'owner' && getOwnerEmails(env).has(normalizeEmail(user?.email));
export const canModerateRole = (actorRole, targetRole) => {
  const actor = effectiveRole(actorRole);
  const target = effectiveRole(targetRole);
  return target !== 'owner' && (actor === 'owner' || (actor === 'admin' && target === 'user'));
};
```

- [ ] **Step 5: Freshen guard projection and add requireOwner**

Change guarded user read to:

```sql
SELECT id, email, username, role, banned, "banExpires", "moderationVersion"
FROM "user" WHERE id = $1 FOR UPDATE
```

Return `{ ...session.user, ...row, role: effectiveRole(row.role), moderationVersion: Number(row.moderationVersion) }`. Preserve active-suspension session deletion. `requireAdmin` accepts `admin || owner`; `requireOwner` checks `isConfiguredOwner(req.user)` after `requireAuth`.

- [ ] **Step 6: Run GREEN authority/guard tests**

Run: `npx vitest run tests/unit/server/ownerAuthority.test.js tests/unit/server/guards.test.js tests/unit/server/guardsRestorationRace.test.js tests/unit/server/me.test.js tests/unit/server/app.test.js`

Expected: PASS; stale role claims no longer authorize, and restoration serialization still preserves post-restoration sessions.

- [ ] **Step 7: Commit policy and guards**

```bash
git add server/ownerAuthority.js server/middleware/guards.js server/routes/me.js tests/unit/server/ownerAuthority.test.js tests/unit/server/guards.test.js tests/unit/server/guardsRestorationRace.test.js tests/unit/server/me.test.js tests/unit/server/app.test.js
git commit -m "feat(auth): enforce fresh owner authority"
```

### Task 4: Startup and Signup Owner Reconciliation

**Files:**
- Modify: `server/ownerAuthority.js`
- Modify: `tests/unit/server/ownerAuthority.test.js`
- Modify: `server/index.js:9-17`
- Modify: `server/auth.js:6,95-107`
- Modify: `server/db.js:114-116`
- Modify: `tests/unit/server/helpers.js:17-52`
- Modify: `tests/unit/server/app.test.js`

**Interfaces:**
- Produces: `reconcileOwnerAuthority({ userId?: string } = {}): Promise<PlatformAuditAction[]>`.
- Startup sequence: assert config, run migrations, reconcile all accounts, create app, listen.
- Signup hook calls same function with created user ID; failures leave role/version/sessions unchanged.

- [ ] **Step 1: Write RED reconciliation behavior tests**

Seed configured user, configured admin, retained owner, stale owner, ordinary admin, and sessions. Call reconciliation and assert:

```js
expect(await roles()).toEqual({
  configuredUser: 'owner', configuredAdmin: 'owner', retainedOwner: 'owner',
  staleOwner: 'user', ordinaryAdmin: 'admin',
});
expect(await sessionsForChangedUsers()).toEqual([]);
expect(await auditRows()).toEqual([
  expect.objectContaining({ actor_kind: 'system', actor_user_id: null, actor_email: 'OWNER_EMAILS reconciliation', action: 'owner_granted' }),
  expect.objectContaining({ action: 'owner_removed', metadata_json: expect.stringContaining('"newRole":"user"') }),
]);
```

Assert changed versions increment once, unchanged versions do not, multiple owners remain, absent configured emails create no row, second reconciliation is no-op, and user rows are locked in `ORDER BY id`.

- [ ] **Step 2: Write RED reconciliation rollback and signup tests**

Inject failure on `INSERT INTO platform_audit_actions`; assert role/version/session rows all equal pre-call snapshot. Sign up configured owner through Better Auth; assert role becomes owner only after audited reconciliation and every signup session is absent. Inject audit failure during configured signup; the hook logs `Owner signup reconciliation failed`, permits account creation to finish, and leaves account role `user`, version 0, no sessions revoked outside rolled-back transaction, and no owner audit.

- [ ] **Step 3: Run RED reconciliation tests**

Run: `npx vitest run tests/unit/server/ownerAuthority.test.js tests/unit/server/app.test.js`

Expected: FAIL because reconciliation is not exported and signup still reads `ADMIN_EMAILS`.

- [ ] **Step 4: Implement one-transaction reconciliation**

Inside `withTransaction`, lock either one user (`WHERE id = $1`) or all users (`ORDER BY id`) and filter candidates in JavaScript. For each role change, execute in order: role/version update, target session delete, system audit insert. Use `previousRole: effectiveRole(row.role)` and `newRole`, with `owner_granted` or `owner_removed`. Stale owners always become `user`, never `admin`.

```js
const updated = await txQuery(`UPDATE "user"
  SET role = $1, "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $2
  WHERE id = $3
  RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
  [desiredRole, now, row.id]);
await txQuery('DELETE FROM session WHERE "userId" = $1', [row.id]);
await insertPlatformAudit(txQuery, {
  actorKind: 'system', actorUserId: null, actorEmail: 'OWNER_EMAILS reconciliation',
  targetUserId: row.id, targetEmail: row.email, projectId: null, reviewId: null,
  action: desiredRole === 'owner' ? 'owner_granted' : 'owner_removed',
  reason: 'Synchronize account role with OWNER_EMAILS configuration', expiresAt: null, createdAt: now,
  metadata: { source: 'owner_emails_reconciliation', previousRole: effectiveRole(row.role), newRole: desiredRole },
});
```

- [ ] **Step 5: Wire startup/signup and retire ADMIN_EMAILS code**

Remove `makeUserAdmin` export/import. Better Auth `user.create.after` calls `reconcileOwnerAuthority({ userId: user.id })` inside `try/catch`; catch logs `Owner signup reconciliation failed:` and does not grant role. `server/index.js` does not catch reconciliation failures: it calls `assertOwnerConfiguration()`, then `runMigrations()`, then `reconcileOwnerAuthority()`, before importing/creating app and calling `listen`.

- [ ] **Step 6: Run GREEN reconciliation tests**

Run: `npx vitest run tests/unit/server/ownerAuthority.test.js tests/unit/server/app.test.js tests/unit/server/emailVerification.test.js`

Expected: PASS; configured signup is audited owner, injected audit failure cannot grant authority, ordinary signup/email verification remains green.

- [ ] **Step 7: Commit reconciliation**

```bash
git add server/ownerAuthority.js server/index.js server/auth.js server/db.js tests/unit/server/ownerAuthority.test.js tests/unit/server/helpers.js tests/unit/server/app.test.js
git commit -m "feat(auth): reconcile configured owners"
```

### Task 5: Hierarchy-Safe Account Moderation and Generalized History

**Files:**
- Modify: `server/routes/adminModeration.js:1-381`
- Modify: `tests/unit/server/accountModeration.test.js`

**Interfaces:**
- Consumes: `canModerateRole`, shared support, and `insertPlatformAudit`.
- Produces: existing four `/api/admin/users*` endpoints for both admin/owner with generalized action DTOs.
- Target history reads `platform_audit_actions WHERE target_user_id = $1 AND actor_kind = 'user'`.

- [ ] **Step 1: Write RED authorization matrix and history tests**

Add owner cookie and admin/owner targets. Assert admin cannot suspend/restore admin or owner; owner can suspend/restore admin/user; nobody can act on owner. Directly mark an admin suspended and prove crafted admin restore gets `403`. Insert a system owner event and user event for target; detail history includes only user event. Assert unknown stored role behaves as user.

- [ ] **Step 2: Write RED generalized mutation/rollback tests**

For suspend/restore, assert new table contains actor kind, snapshots, source metadata, no sensitive fields, and old `moderation_actions` count remains unchanged. Change fault patterns from `INSERT INTO moderation_actions` to `INSERT INTO platform_audit_actions`; preserve account/session/project rollback assertions.

- [ ] **Step 3: Run RED account moderation test**

Run: `npx vitest run tests/unit/server/accountModeration.test.js`

Expected: FAIL because owner is rejected by `requireAdmin`, restore lacks hierarchy check, and writes/reads still use `moderation_actions`.

- [ ] **Step 4: Refactor route onto shared support and policy**

Remove local duplicated account/validation/writer functions. Immediately after `lockUser`, enforce:

```js
if (!canModerateRole(req.user.role, target.role)) return { status: 403 };
```

Run this independently in both suspend and restore before version/state validation. Keep target-user-first then `lockProjectRows(projectIds, txQuery)`. Keep strict post-lock expiry recheck and one version increment.

- [ ] **Step 5: Replace all history reads/writes**

Select all generalized columns plus `CAST(created_at AS TEXT) AS created_at_cursor`. Account events use metadata `{ source: 'account_workflow' }`; project events add `previousProjectVisibility: 'public'`. Return shared DTOs. Map hierarchy failures to `403 { error: 'Target is protected by role hierarchy' }`.

- [ ] **Step 6: Preserve Better Auth denial regressions**

Change bypass audit snapshot to `platform_audit_actions`, rerun raw normalized paths, and assert no user/account/session/platform-audit mutation.

- [ ] **Step 7: Run GREEN account moderation test**

Run: `npx vitest run tests/unit/server/accountModeration.test.js tests/unit/server/guardsRestorationRace.test.js`

Expected: PASS; owner/admin matrix is enforced, old audit row count is unchanged, and every account state change has generalized audit.

- [ ] **Step 8: Commit account hierarchy**

```bash
git add server/routes/adminModeration.js tests/unit/server/accountModeration.test.js
git commit -m "feat(moderation): enforce account hierarchy"
```

### Task 6: Owner Moderator Lifecycle API

**Files:**
- Create: `server/routes/ownerModeration.js`
- Create: `tests/unit/server/ownerModeration.test.js`
- Modify: `server/app.js:9-15,75-80`

**Interfaces:**
- Produces: exact promote/revoke endpoints and bodies from Stable HTTP DTOs.
- Revoke action order is demotion, optional suspension, selected project events.
- Demotion with `suspension: null` preserves existing `banned`, `banReason`, `banExpires`; restoration never restores admin.

- [ ] **Step 1: Write RED owner-only/status contract tests**

Assert anonymous `401`, admin/user `403`, owner target `403`, missing `404`, malformed reason/version/suspension/21 projects `400`, promotion of admin/owner/active-suspended and demotion of user/stale version `409`.

- [ ] **Step 2: Write RED promotion success test**

Promote a fresh user with two active sessions. Assert role admin, version +1, sessions empty, one `admin_promoted` event with `{previousRole:'user',newRole:'admin',source:'owner_role_workflow'}`, exact response keys, and old cookie gets `401`.

- [ ] **Step 3: Write RED demotion variants**

Cover:

```js
await revoke({ suspension: null, projectIdsToUnpublish: [] });
expect(account).toMatchObject({ role: 'user', banReason: 'pre-existing', banExpires: priorExpiry });

await revoke({ suspension: { expiresAt: null }, projectIdsToUnpublish: ['selected'] });
expect(actions.map(item => item.action)).toEqual(['admin_demoted', 'account_suspended', 'project_unpublished']);
expect(await project('selected')).toMatchObject({ visibility: 'private', published_commit_id: null });
expect(await project('unselected')).toMatchObject({ visibility: 'public' });
```

Restore demoted/suspended target through account endpoint and assert role remains user and projects remain private.

- [ ] **Step 4: Write RED lock-order and fault-injection tests**

Record SQL sequence and assert target `SELECT ... FOR UPDATE` precedes sorted project lock. Inject failures at role update, session deletion, suspension update path, each project update, and each audit insert; compare role/suspension/version/session/project/audit snapshots before/after.

- [ ] **Step 5: Run RED lifecycle tests**

Run: `npx vitest run tests/unit/server/ownerModeration.test.js`

Expected: FAIL with `404` because owner router is not registered.

- [ ] **Step 6: Implement promote transaction**

Use `router.use('/api/owner', requireOwner)`. Lock target; reject stored owner before effective-role checks; require effective user, inactive suspension, exact version. Update role/version once, delete sessions, insert promotion event, return `{account,actions:[action]}`.

- [ ] **Step 7: Implement revoke transaction**

Validate complete body before transaction. Lock admin target, then sorted projects; revalidate selected ownership/publication and expiry after locks. One `UPDATE "user"` sets role/version and conditionally suspension fields, followed by session delete, project updates, and audit inserts. `suspension: null` update must not mention suspension columns.

- [ ] **Step 8: Register router and run GREEN lifecycle tests**

Run: `npx vitest run tests/unit/server/ownerModeration.test.js tests/unit/server/accountModeration.test.js tests/unit/server/app.test.js`

Expected: PASS; all injected failures roll back every snapshot and old admin sessions lose access.

- [ ] **Step 9: Commit lifecycle API**

```bash
git add server/routes/ownerModeration.js server/app.js tests/unit/server/ownerModeration.test.js
git commit -m "feat(owner): manage moderator lifecycle"
```

### Task 7: Audited Standalone Content Moderation

**Files:**
- Modify: `server/routes/gallery.js:184-197,287-290`
- Modify: `tests/unit/server/reviews.test.js:170-211`
- Modify: `tests/unit/server/gallery.test.js`

**Interfaces:**
- Consumes: shared reason/audit/target lock, `canModerateRole`, `lockProjectRows`.
- Produces: exact reason-required project unpublish and review delete responses from Stable HTTP DTOs.

- [ ] **Step 1: Write RED standalone project tests**

For admin and owner actors, create user/admin/owner-owned public projects. Assert mandatory reason, missing `404`, non-public `409`, hierarchy `403`, owner can unpublish admin project, admin can unpublish user project, and no actor can unpublish owner project. Success snapshots owner target, project ID, prior public visibility, standalone source, and leaves `moderation_actions` untouched.

- [ ] **Step 2: Write RED review-delete tests**

Create reviews authored by user/admin/owner. Assert same hierarchy, reason bounds, missing `404`, and success event snapshots review ID/project ID/author ID+email/rating but JSON does not contain body text. Audit-insert failure leaves review present.

- [ ] **Step 3: Run RED content tests**

Run: `npx vitest run tests/unit/server/gallery.test.js tests/unit/server/reviews.test.js`

Expected: FAIL because endpoints accept no reason, perform direct writes, and return no action.

- [ ] **Step 4: Implement user-first project unpublish**

Read only `owner_id` to discover target, start transaction, lock owner user first, lock project through `lockProjectRows([id])`, revalidate owner/public state and hierarchy, update publication, then insert `project_unpublished` with `{source:'standalone_project',previousProjectVisibility:'public'}`.

- [ ] **Step 5: Implement user-first review delete**

Read only `user_id,project_id` to discover lock keys. In transaction lock review author user, sorted project row, then review row (`FOR UPDATE` on PostgreSQL) selecting `id,project_id,user_id,rating` without body. Revalidate discovery keys/hierarchy, delete, then insert `review_deleted` with `{source:'standalone_review',deletedReviewRating:rating}`.

- [ ] **Step 6: Run GREEN content tests**

Run: `npx vitest run tests/unit/server/gallery.test.js tests/unit/server/reviews.test.js tests/unit/server/relatedWriteDeletionRaces.test.js`

Expected: PASS; audit failure rolls back content, owner content is protected, related-write lock regressions remain green.

- [ ] **Step 7: Commit standalone auditing**

```bash
git add server/routes/gallery.js tests/unit/server/gallery.test.js tests/unit/server/reviews.test.js
git commit -m "feat(moderation): audit content actions"
```

### Task 8: Owner Global Audit Query

**Files:**
- Modify: `server/routes/ownerModeration.js`
- Modify: `tests/unit/server/ownerModeration.test.js`

**Interfaces:**
- Produces: owner-only `GET /api/owner/audit` exact envelope.
- Filters: normalized exact actor/target email; exact supported action; strict ISO `from/to`; `from <= to`; canonical cursor.

- [ ] **Step 1: Write RED authorization/filter/cursor tests**

Seed all eight actions, system/user actors, mixed targets, and 26 same-timestamp rows. Assert owner-only access; actor/target/action/from/to combinations; inclusive boundaries; newest-first stable pages; malformed/oversized/noncanonical cursor, unknown action, invalid dates, and reversed range return `400` before audit query.

- [ ] **Step 2: Write RED privacy and system-visibility test**

Assert exact DTO key list and no password/token/session/IP/review-body text. Assert system owner reconciliation appears globally while Task 5 target detail excludes it.

- [ ] **Step 3: Run RED global-audit tests**

Run: `npx vitest run tests/unit/server/ownerModeration.test.js -t "global audit"`

Expected: FAIL with `404` for `/api/owner/audit`.

- [ ] **Step 4: Implement bounded dynamic query**

Build predicates and parameters together so every placeholder appears once. For cursor equality, push timestamp twice and ID once, matching existing moderation cursor convention. Select generalized columns and `CAST(created_at AS TEXT) AS created_at_cursor`, limit 26, return first 25 and cursor from final returned row. PostgreSQL casts timestamp parameters; SQLite uses stored timestamp text after strict ISO normalization.

- [ ] **Step 5: Run GREEN global-audit tests**

Run: `npx vitest run tests/unit/server/ownerModeration.test.js tests/unit/server/accountModeration.test.js`

Expected: PASS; owner sees filtered system/user events across two stable pages; admin receives `403`.

- [ ] **Step 6: Commit global audit API**

```bash
git add server/routes/ownerModeration.js tests/unit/server/ownerModeration.test.js
git commit -m "feat(owner): expose global audit history"
```

### Task 9: Typed Cloud API Contracts

**Files:**
- Modify: `services/cloudApi.ts:27-93,209-230`
- Modify: `tests/unit/cloudApi.test.ts:139-174`

**Interfaces:**
- Produces: Stable HTTP DTO types plus `PromoteAdminInput`, `RevokeAdminInput`, `GlobalAuditFilters`.
- Produces methods: `promoteAdmin`, `revokeAdmin`, `moderatorUnpublishProject`, `moderatorDeleteReview`, `getGlobalAudit`.

- [ ] **Step 1: Write RED serialization tests**

```ts
await cloudApi.promoteAdmin('user/1', { reason: 'Coverage', expectedModerationVersion: 3 });
expect(call(0)).toEqual(['/api/owner/users/user%2F1/promote-admin', 'POST', { reason: 'Coverage', expectedModerationVersion: 3 }]);
await cloudApi.revokeAdmin('admin-1', {
  reason: 'Abuse', expectedModerationVersion: 8,
  suspension: { expiresAt: null }, projectIdsToUnpublish: ['project-1'],
});
await cloudApi.moderatorUnpublishProject('p/1', 'Policy violation');
await cloudApi.moderatorDeleteReview('r/1', 'Harassment');
await cloudApi.getGlobalAudit({ actorEmail: 'Owner+tag@test.dev', action: 'admin_demoted', from: '2026-07-01T00:00:00.000Z', to: '2026-07-16T23:59:59.999Z', cursor: 'a/b' });
```

Assert encoded URLs, exact bodies, and no body on global GET.

- [ ] **Step 2: Run RED cloud API tests**

Run: `npx vitest run tests/unit/cloudApi.test.ts`

Expected: FAIL because new methods/types do not exist.

- [ ] **Step 3: Implement stable types and methods**

Replace nullable/string role DTOs with `PlatformRole`; replace old action DTO with `PlatformAuditAction`. Preserve existing account method names and envelopes while widening returned actions. Serialize only defined global filters with `URLSearchParams`; encode every path ID.

- [ ] **Step 4: Run GREEN API tests and type delta**

Run: `npx vitest run tests/unit/cloudApi.test.ts`

Expected: PASS with exact request snapshots.

Run: `npx tsc --noEmit --pretty false`

Expected: exit 2 with exact five baseline diagnostics listed under Global Constraints and no diagnostics in `services/cloudApi.ts`.

- [ ] **Step 5: Commit typed API**

```bash
git add services/cloudApi.ts tests/unit/cloudApi.test.ts
git commit -m "feat(client): type owner moderation API"
```

### Task 10: Fresh Role Routing, Menu, and Lifecycle Controls

**Files:**
- Create: `hooks/useCurrentUser.ts`
- Create: `components/moderation/OwnerRoleLifecyclePanel.tsx`
- Create: `components/moderation/ModerationConfirmationDialog.tsx`
- Modify: `App.tsx:17,79-86,127-138`
- Modify: `components/AccountMenu.tsx:1-55`
- Modify: `pages/AdminModerationPage.tsx:1-591`
- Modify: `tests/unit/adminModerationRouting.test.tsx`
- Modify: `tests/unit/AccountMenu.test.tsx`
- Modify: `tests/unit/AdminModerationPage.test.tsx`

**Interfaces:**
- Produces: `useCurrentUser(): { user: MeUser | null; loading: boolean; error: Error | null; refresh(): Promise<void> }` backed by `/api/me`.
- `ModeratorGuard` accepts fresh admin/owner and passes `actorRole` to `AdminModerationPage`.
- Account controls follow owner/admin/user matrix; role transition refreshes target detail and preserves recoverable drafts.
- `OwnerRoleLifecyclePanel` consumes `{ actorRole, account, projects, busy, onReviewPromote, onReviewRevoke }` and never calls APIs directly.
- `ModerationConfirmationDialog` consumes an immutable discriminated snapshot for `suspend | restore | promote-admin | revoke-admin`, owns focus entry/trap/Escape/restore, and emits only confirm/cancel.

- [ ] **Step 1: Write RED fresh route/menu tests**

Mock `cloudApi.me`, not Better Auth role claims. Assert loading, signed-out redirect, user denial, admin render, owner render, and stale session-admin/fresh-user denial. Menu shows Moderation to fresh admin/owner only and hides it from fresh user even if `useSession` says admin.

- [ ] **Step 2: Write RED role-control matrix tests**

Render page as admin/owner and open user/admin/owner details. Assert:

```ts
// admin actor
userTarget => suspend/restore controls
adminTarget => protected notice, no mutations
ownerTarget => protected notice, no mutations

// owner actor
userTarget => suspend/restore plus "Promote to moderator"
adminTarget => "Remove moderator access" with optional suspension and selected projects
ownerTarget => protected notice, no mutations
```

- [ ] **Step 3: Write RED confirmation and failure tests**

Promotion confirmation names exact email/ID and `user -> admin`. Demotion confirmation names exact email/ID, `admin -> user`, suspension duration/expiry, reason, and each selected project name+ID. Assert exact API bodies, double-submit lock, expired snapshot rejection, successful sign-out notice/detail refresh, retained draft after network failure, and `409` refresh guidance with no stale duplicate role action.

- [ ] **Step 4: Run RED UI tests**

Run: `npx vitest run tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx tests/unit/AdminModerationPage.test.tsx`

Expected: FAIL because owner is denied, role comes from session, and lifecycle controls are absent.

- [ ] **Step 5: Implement fresh-user hook and route/menu wiring**

Fetch `cloudApi.me()` on mount with cancellation generation. `ModeratorGuard` renders loading, login redirect, denial, or `<AdminModerationPage actorRole={user.role} />`. Account menu retains Better Auth only for `signOut`; visibility comes from fresh `/api/me`.

- [ ] **Step 6: Extract role lifecycle controls and confirmation dialog**

Move role draft rendering into `OwnerRoleLifecyclePanel` and all confirmation markup/focus behavior into `ModerationConfirmationDialog`. Define an immutable confirmation union with discriminants `suspend`, `restore`, `promote-admin`, and `revoke-admin`. Reuse duration/project controls, but demotion sends `suspension: null` unless operator explicitly selects suspension. Gate every render and confirmation by `actorRole` plus current target role; never rely on hidden controls as authority. `AdminModerationPage` retains API calls, stale-request generations, and success/refresh state.

- [ ] **Step 7: Run GREEN UI tests**

Run: `npx vitest run tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx tests/unit/AdminModerationPage.test.tsx`

Expected: PASS; exact role matrix, confirmations, focus trap, draft retention, and refresh-failure semantics pass.

- [ ] **Step 8: Commit routing/menu/lifecycle UI**

```bash
git add hooks/useCurrentUser.ts App.tsx components/AccountMenu.tsx pages/AdminModerationPage.tsx components/moderation/OwnerRoleLifecyclePanel.tsx components/moderation/ModerationConfirmationDialog.tsx tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx tests/unit/AdminModerationPage.test.tsx
git commit -m "feat(owner): add moderator role controls"
```

### Task 11: Owner Global Audit UI

**Files:**
- Create: `components/moderation/GlobalAuditPanel.tsx`
- Modify: `pages/AdminModerationPage.tsx`
- Create: `tests/unit/GlobalAuditPanel.test.tsx`
- Modify: `tests/unit/AdminModerationPage.test.tsx`

**Interfaces:**
- Consumes: `actorRole` and `cloudApi.getGlobalAudit(filters)`.
- Produces: `GlobalAuditPanel` owner-only unit with actor email, target email, action, from/to, and cursor pagination. `AdminModerationPage` only decides whether to mount it.

- [ ] **Step 1: Write RED visibility/filter/page tests**

In `GlobalAuditPanel.test.tsx`, fill all filters, submit, and assert exact `GlobalAuditFilters`; append second cursor page without replacing first. Render system actor label, nullable target/project/review IDs, role metadata, project prior visibility, and deleted rating. In the page test, assert panel absent for admin and present for owner.

- [ ] **Step 2: Write RED validation/race tests**

Assert invalid/reversed date range blocks request, reset clears filters/results, stale first response cannot overwrite newer filter response, and global audit errors do not erase account moderation drafts.

- [ ] **Step 3: Run RED global audit UI tests**

Run: `npx vitest run tests/unit/GlobalAuditPanel.test.tsx tests/unit/AdminModerationPage.test.tsx -t "global audit"`

Expected: FAIL because global audit controls are absent.

- [ ] **Step 4: Implement owner-only audit area**

Keep generation ref/loading/error/result state inside `GlobalAuditPanel`, isolated from account search/drafts. Convert `datetime-local` values to ISO before request. Render action/reason/actor/target/time plus whitelisted metadata only. `More audit actions` calls same frozen filter snapshot with returned cursor.

- [ ] **Step 5: Run GREEN global audit UI tests**

Run: `npx vitest run tests/unit/GlobalAuditPanel.test.tsx tests/unit/AdminModerationPage.test.tsx`

Expected: PASS; moderator view has no global query, owner filters and cursor pages remain stable.

- [ ] **Step 6: Commit global audit UI**

```bash
git add components/moderation/GlobalAuditPanel.tsx pages/AdminModerationPage.tsx tests/unit/GlobalAuditPanel.test.tsx tests/unit/AdminModerationPage.test.tsx
git commit -m "feat(owner): add global audit console"
```

### Task 12: Production Configuration, Deployment, Scripts, and Documentation

**Files:**
- Modify: `.env.example:1-16`
- Modify: `Dockerfile:18-40`
- Modify: `deploy.sh:64-89,123-135`
- Modify: `playwright.config.cjs:46-62`
- Modify: `tests/unit/server/helpers.js:17-52`
- Delete: `server/scripts/make_admin.js`
- Delete: `server/scripts/setup_db.js`
- Modify: `docs/8-cloud-and-gallery.md:120-129,158-188,299-302`
- Create: `docs/9-owner-moderator-rollout.md`
- Modify: `README.md:60-83`

**Interfaces:**
- Production image sets `NODE_ENV=production`.
- Unit tests force `OWNER_EMAILS=''`; Playwright injects one unique configured owner.
- Deployment sets one or more owner addresses without gcloud comma splitting.

- [ ] **Step 1: Write RED configuration contract assertions**

Add a focused test in `ownerAuthority.test.js` reading repository files and asserting: no `ADMIN_EMAILS` outside historical plans/specs, no `make_admin.js` or `setup_db.js`, Docker production environment, `.env.example` owner guidance, migration-driven startup documentation, and deploy custom delimiter form.

- [ ] **Step 2: Run RED configuration test**

Run: `npx vitest run tests/unit/server/ownerAuthority.test.js -t "repository configuration"`

Expected: FAIL on current `ADMIN_EMAILS`, missing production `NODE_ENV`, and existing admin script.

- [ ] **Step 3: Replace environment/deployment configuration**

`.env.example` documents `OWNER_EMAILS=owner@example.com,backup-owner@example.com` as sole deployment-controlled root. Add `ENV NODE_ENV=production` to runtime Docker stage. In both gcloud commands replace admin flag with an isolated custom delimiter:

```bash
--set-env-vars "^;^OWNER_EMAILS=${OWNER_EMAILS}"
```

Prompt for `OWNER_EMAILS`, reject normalized empty input before deploy, and print recommendation for at least two addresses. Do not translate owner commas to pipes.

- [ ] **Step 4: Isolate tests and remove direct role script**

Set present-but-empty `process.env.OWNER_EMAILS = ''` in unit helper before dynamic imports. In Playwright config create one per-run address and expose it to server and workers:

```js
const e2eOwnerEmail = process.env.E2E_OWNER_EMAIL || `owner-${Date.now()}-${process.pid}@test.dev`;
process.env.E2E_OWNER_EMAIL = e2eOwnerEmail;
// webServer.env
{ ...process.env, RESEND_API_KEY: '', OWNER_EMAILS: e2eOwnerEmail }
```

Delete `server/scripts/make_admin.js` and obsolete `server/scripts/setup_db.js`. Migrations are the sole supported schema bootstrap.

- [ ] **Step 5: Document exact authority and HTTP contracts**

Replace account moderation section with role matrix, root-of-trust/reconciliation behavior, fresh guards, all stable DTOs/endpoints/errors, audit schema/actions/metadata/privacy, standalone reason requirements, global filters/cursors, immutable old/new table status, and emergency owner recovery. Remove claim that role changes are operator-only and all `ADMIN_EMAILS` references. Update README to use existing `npm run server`/`npm run dev` commands and state that startup migrations replace deleted bootstrap scripts.

- [ ] **Step 6: Write PostgreSQL rollout runbook**

`docs/9-owner-moderator-rollout.md` contains this ordered checklist with exact commands/queries:

```bash
export DATABASE_URL='postgresql://staging-branch-url'
export OWNER_EMAILS='owner1@example.com,owner2@example.com'
NODE_ENV=production node server/index.js
```

```sql
SELECT id, applied_at FROM app_migrations WHERE id = '014_platform_audit_actions';
SELECT (SELECT COUNT(*) FROM moderation_actions) AS legacy_count,
       (SELECT COUNT(*) FROM platform_audit_actions
        WHERE id IN (SELECT id FROM moderation_actions)) AS backfilled_count;
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'platform_audit_actions'::regclass AND NOT tgisinternal ORDER BY tgname;
SELECT email, role, "moderationVersion" FROM "user"
WHERE LOWER(TRIM(email)) IN ('owner1@example.com', 'owner2@example.com') ORDER BY email;
SELECT actor_kind, actor_user_id, actor_email, target_email, action, metadata_json
FROM platform_audit_actions WHERE action IN ('owner_granted', 'owner_removed')
ORDER BY created_at DESC, id DESC;
```

Runbook also includes transaction attempts proving update/delete throw `platform_audit_actions is append-only`, legacy-table unchanged comparison, session absence for reconciled users, API owner/admin hierarchy probes, global filter/cursor checks, removed-owner redeploy recovery, existing-admin review, backup/branch restore rollback, and explicit rule that application rollback does not down-migrate `014`.

- [ ] **Step 7: Run GREEN config/docs checks**

Run: `npx vitest run tests/unit/server/ownerAuthority.test.js tests/unit/server/app.test.js`

Expected: PASS; repository configuration test finds no active `ADMIN_EMAILS` or direct admin script.

Run: `rg "ADMIN_EMAILS|makeUserAdmin|make_admin" --glob '!docs/superpowers/plans/**' --glob '!docs/superpowers/specs/**' .`

Expected: no output, exit 1.

- [ ] **Step 8: Commit production operations**

```bash
git add .env.example Dockerfile deploy.sh playwright.config.cjs tests/unit/server/helpers.js server/scripts/make_admin.js server/scripts/setup_db.js docs/8-cloud-and-gallery.md docs/9-owner-moderator-rollout.md README.md tests/unit/server/ownerAuthority.test.js
git commit -m "docs(owner): add secure rollout operations"
```

### Task 13: Full Owner-to-Moderator E2E and Final Verification

**Files:**
- Modify: `tests/e2e/helpers.js:36-52`
- Modify: `tests/e2e/account_moderation.spec.js:1-159`

**Interfaces:**
- Consumes: `E2E_OWNER_EMAIL`, real owner APIs/UI, platform audit, and existing test database driver.
- Produces: browser proof of owner signup/reconciliation, promotion, moderator action, global audit, demotion+suspension, immediate session denial, and user restoration.

- [ ] **Step 1: Replace direct E2E database authority helpers**

Delete `promoteUserToAdmin`. Rename audit helper to query `platform_audit_actions` and include actor/target/action/reason/project metadata. Keep direct email verification only; no E2E helper writes role/suspension/audit state.

- [ ] **Step 2: Write full RED Chromium workflow**

Use unique user/admin candidate emails and configured `process.env.E2E_OWNER_EMAIL`. Through real API/UI:

1. Sign up/verify configured owner and assert `/api/me` role owner after fresh sign-in.
2. Sign up moderator candidate and ordinary target; target publishes selected and untouched projects.
3. Owner opens moderation page, promotes candidate with reason, confirms `user -> admin`, and sees promotion history.
4. Candidate signs in after promotion and suspends ordinary target while selecting only one project.
5. Owner filters global audit by candidate actor plus ordinary target email and sees suspension/selected-unpublish snapshots; then filters by candidate target email and sees owner-authored promotion snapshot.
6. Owner removes candidate moderator access with indefinite suspension and no project selection; confirms `admin -> user`.
7. Candidate's already-open request context receives `401`; fresh sign-in receives `403 BANNED_USER`.
8. Owner restores ordinary target; target signs in, remains user, selected project remains private, untouched project remains public.
9. Database query confirms action sequence and no row in `moderation_actions` from this workflow.

- [ ] **Step 3: Run RED E2E**

Run: `npx playwright test tests/e2e/account_moderation.spec.js --project=chromium --workers=1`

Expected before completing helper/test refactor: FAIL at owner promotion because old test still depends on direct admin role write or cannot find new lifecycle controls.

- [ ] **Step 4: Complete E2E selectors and assertions**

Use role/name selectors matching Task 10 controls and exact project name+ID confirmation. Preserve context cleanup in `finally`. Global audit assertions must filter listitems by action and unique reason, not timestamp formatting.

- [ ] **Step 5: Run GREEN focused E2E**

Run: `npx playwright test tests/e2e/account_moderation.spec.js --project=chromium --workers=1`

Expected: 1 passed; owner-to-moderator lifecycle completes with no direct role writes.

- [ ] **Step 6: Run focused server/client regression gate**

Run:

```bash
npx vitest run --no-file-parallelism --maxWorkers=1 \
  tests/unit/server/platformAuditMigration.test.js \
  tests/unit/server/platformAudit.test.js \
  tests/unit/server/ownerAuthority.test.js \
  tests/unit/server/ownerModeration.test.js \
  tests/unit/server/accountModeration.test.js \
  tests/unit/server/gallery.test.js \
  tests/unit/server/reviews.test.js \
  tests/unit/server/guards.test.js \
  tests/unit/server/guardsRestorationRace.test.js \
  tests/unit/cloudApi.test.ts \
  tests/unit/GlobalAuditPanel.test.tsx \
  tests/unit/AdminModerationPage.test.tsx \
  tests/unit/adminModerationRouting.test.tsx \
  tests/unit/AccountMenu.test.tsx
```

Expected: exit 0; all listed files and tests pass serially.

- [ ] **Step 7: Run full serial Vitest and production build**

Run: `npx vitest run --no-file-parallelism --maxWorkers=1`

Expected: exit 0; all repository test files pass with no unhandled errors.

Run: `npm run build`

Expected: exit 0; Vite production bundle completes.

- [ ] **Step 8: Prove exact TypeScript zero delta**

Run:

```bash
test -d /tmp/opencode
npx tsc --noEmit --pretty false > /tmp/opencode/owner-authority-tsc.txt 2>&1; test $? -eq 2
```

Expected file contains exactly these six output lines representing five diagnostics, and nothing else:

```text
tests/unit/changePassword.test.tsx(17,60): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(11,51): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(12,51): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(15,81): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/svgEditing.test.ts(33,39): error TS2339: Property 'error' does not exist on type 'SvgValidation'.
  Property 'error' does not exist on type '{ ok: true; }'.
```

- [ ] **Step 9: Run complete Chromium gate**

Run: `npx playwright test --project=chromium --workers=1`

Expected: exit 0; all Chromium E2E specs pass, including owner lifecycle.

- [ ] **Step 10: Execute PostgreSQL staging checklist before production approval**

Follow `docs/9-owner-moderator-rollout.md` against disposable PostgreSQL staging branch. Required evidence: migration/backfill counts equal; both immutable triggers present and live update/delete attempts fail; configured owners/stale owners reconcile with versions/session revocation/system audit; role/content hierarchy probes return expected statuses; selected-only unpublish and no-republish behavior pass; global filters/cursors pass; Better Auth normalized admin probes remain `404`; deployment with two comma-separated owners succeeds via custom delimiter. Do not approve production if any check differs.

- [ ] **Step 11: Inspect final diff and commit E2E**

Run: `git status --short && git diff --check && git diff --stat && git log --oneline -10`

Expected: only planned files changed, no whitespace errors, no secrets or staging URLs, and no edits to migrations 011-013.

```bash
git add tests/e2e/helpers.js tests/e2e/account_moderation.spec.js
git commit -m "test(owner): cover moderator authority lifecycle"
```
