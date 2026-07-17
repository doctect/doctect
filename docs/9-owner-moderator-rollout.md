# 9. Owner and Moderator PostgreSQL Rollout

Use this checklist on a disposable PostgreSQL staging branch before production. Keep command output as rollout evidence. Replace placeholders only in shell environment; never commit credentials, cookie values, database URLs, or service URLs.

## 1. Prepare rollback point

- [ ] Create a database branch or backup immediately before rollout and record its provider-side identifier outside the repository.
- [ ] Record currently deployed application image digest outside the repository.
- [ ] Confirm staging contains representative users, admins, sessions, public projects, reviews, and legacy `moderation_actions` rows.
- [ ] Confirm both configured owner accounts exist and can receive verification email.

Capture baseline counts in `psql`:

```sql
SELECT COUNT(*) AS legacy_count_before FROM moderation_actions;
SELECT role, COUNT(*) AS accounts_before FROM "user" GROUP BY role ORDER BY role;
```

## 2. Run migrations and reconciliation

In a staging server terminal, set the disposable branch connection and two non-production owner addresses, then start the production path:

```bash
export DATABASE_URL='postgresql://staging-branch-url'
export OWNER_EMAILS='owner1@example.com,owner2@example.com'
NODE_ENV=production node server/index.js
```

Do not open staging traffic until startup logs show migrations and owner reconciliation completed. Empty, whitespace-only, or comma-only `OWNER_EMAILS` must stop production startup.

## 3. Verify migration, backfill, and owners

Run exactly:

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

- [ ] Migration row exists once.
- [ ] `legacy_count` equals `backfilled_count`.
- [ ] Trigger list includes `platform_audit_actions_no_update` and `platform_audit_actions_no_delete`.
- [ ] Existing configured accounts have role `owner`; any former owner absent from configuration has role `user`.
- [ ] Each changed account has exactly one matching system action with null actor user ID and constrained reconciliation metadata.

Confirm reconciliation revoked affected sessions:

```sql
SELECT u.email, s.id AS session_id
FROM "user" u
LEFT JOIN session s ON s."userId" = u.id
WHERE LOWER(TRIM(u.email)) IN ('owner1@example.com', 'owner2@example.com')
ORDER BY u.email, s.id;
```

Every reconciled account must have `session_id` null. Unchanged owners may retain sessions.

## 4. Prove both audit tables are append-only

Each mutation below must fail with `platform_audit_actions is append-only`; issue `ROLLBACK` after each failed transaction:

```sql
BEGIN;
UPDATE platform_audit_actions
SET reason = reason
WHERE id = (SELECT id FROM platform_audit_actions ORDER BY created_at DESC, id DESC LIMIT 1);
ROLLBACK;
```

```sql
BEGIN;
DELETE FROM platform_audit_actions
WHERE id = (SELECT id FROM platform_audit_actions ORDER BY created_at DESC, id DESC LIMIT 1);
ROLLBACK;
```

Repeat against one legacy row. Both attempts must fail with that table's append-only error:

```sql
BEGIN;
UPDATE moderation_actions
SET reason = reason
WHERE id = (SELECT id FROM moderation_actions ORDER BY created_at DESC, id DESC LIMIT 1);
ROLLBACK;
```

```sql
BEGIN;
DELETE FROM moderation_actions
WHERE id = (SELECT id FROM moderation_actions ORDER BY created_at DESC, id DESC LIMIT 1);
ROLLBACK;
```

Verify migration and later probes did not change legacy storage:

```sql
SELECT COUNT(*) AS legacy_count_after FROM moderation_actions;
SELECT COUNT(*) AS legacy_rows_missing_from_platform
FROM moderation_actions m
WHERE NOT EXISTS (SELECT 1 FROM platform_audit_actions p WHERE p.id = m.id);
```

`legacy_count_after` must equal `legacy_count_before`; missing count must be zero. No new workflow below may add a `moderation_actions` row.

## 5. Probe HTTP hierarchy and atomic behavior

Create disposable owner, admin, and user sessions through normal sign-in. Enter cookie headers without echoing them and provide disposable target IDs:

```bash
read -rsp 'Owner Cookie header: ' OWNER_COOKIE; printf '\n'
read -rsp 'Admin Cookie header: ' ADMIN_COOKIE; printf '\n'
read -rp 'Admin target user ID: ' ADMIN_ID
read -rp 'User target user ID: ' USER_ID
read -rp 'Current user moderationVersion: ' USER_VERSION
read -rp 'Current admin moderationVersion: ' ADMIN_VERSION
```

Use the staging service origin already held in local shell variable `BASE_URL`; do not write it into this file. These probes must return the shown statuses:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' -X POST \
  "${BASE_URL}/api/owner/users/${USER_ID}/promote-admin" \
  --data "{\"reason\":\"Hierarchy probe\",\"expectedModerationVersion\":${USER_VERSION}}"
# 403

curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' -X POST \
  "${BASE_URL}/api/admin/users/${ADMIN_ID}/suspend" \
  --data "{\"reason\":\"Peer protection probe\",\"expiresAt\":null,\"projectIdsToUnpublish\":[],\"expectedModerationVersion\":${ADMIN_VERSION}}"
# 403

curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" \
  -H 'Content-Type: application/json' -X POST \
  "${BASE_URL}/api/owner/users/${USER_ID}/promote-admin" \
  --data "{\"reason\":\"Staging promotion probe\",\"expectedModerationVersion\":${USER_VERSION}}"
# 200
```

- [ ] Promoted account's old session now receives `401` from a protected API.
- [ ] Admin cannot suspend/restore the promoted admin or moderate that admin's project/review (`403`).
- [ ] Owner can demote the disposable admin with a reason and optional suspension; response actions are ordered `admin_demoted`, optional `account_suspended`, then selected `project_unpublished` actions.
- [ ] Demoted account has role `user`, incremented version, and no session; later restoration leaves role `user`.
- [ ] Select one of two public target projects during suspension/demotion. Selected project becomes private with null published pointer; untouched project remains public. Restoration does not republish either project.
- [ ] Standalone project unpublish and review deletion reject missing/blank/overlong reasons with `400`, reject protected target content with `403`, and return one matching audit DTO on success.
- [ ] Force one audit insertion failure on a disposable transaction and confirm role, suspension, sessions, content, version, and audit rows all roll back.

Confirm Better Auth role mutation remains unavailable, including normalized path forms:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" "${BASE_URL}/api/auth/admin"
curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" "${BASE_URL}/api/auth/x/../admin"
curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" "${BASE_URL}/api/auth/x/%2e%2e/admin"
# 404 for each
```

## 6. Verify global filters and cursors

Use unique probe values from step 5:

```bash
curl -sS -H "Cookie: ${OWNER_COOKIE}" \
  "${BASE_URL}/api/owner/audit?actorEmail=owner1%40example.com&targetEmail=owner2%40example.com&action=admin_demoted"
curl -sS -H "Cookie: ${OWNER_COOKIE}" \
  "${BASE_URL}/api/owner/audit?from=2026-01-01T00%3A00%3A00Z&to=2026-12-31T23%3A59%3A59Z"
```

- [ ] Each returned item satisfies every active filter and includes no password, token, session, IP, arbitrary request body, or review text.
- [ ] Request `nextCursor` with the same filters; pages have no duplicates or omissions and remain ordered by `createdAt DESC, id DESC`.
- [ ] Reusing a cursor with changed filters is not treated as evidence; rerun pagination from page one.
- [ ] Admin receives `403` and anonymous request receives `401` for global audit.
- [ ] Invalid email/action/date/range/cursor returns `400 { "error": "Invalid audit query" }`.

## 7. Prove removed-owner recovery

On staging, change configuration to one retained owner and restart the production path:

```bash
export OWNER_EMAILS='owner2@example.com'
NODE_ENV=production node server/index.js
```

- [ ] Removed `owner1@example.com` is now `user`; retained owner remains `owner`.
- [ ] Removed owner's sessions are absent and old cookies receive `401`.
- [ ] One `owner_removed` system action records old/new role and reconciliation source.
- [ ] Retained owner can still reach owner audit and recover authority.

Restore the two-owner configuration and restart before rollout approval:

```bash
export OWNER_EMAILS='owner1@example.com,owner2@example.com'
NODE_ENV=production node server/index.js
```

Verify comma-separated values arrive intact in the deployment environment. `deploy.sh` must use gcloud custom delimiter `^;^` for both deploy and update commands; owner commas must not become pipes.

## 8. Review existing admins

```sql
SELECT id, email, role, "moderationVersion", banned, "banExpires"
FROM "user"
WHERE role = 'admin'
ORDER BY LOWER(email), id;
```

- [ ] Assign a named reviewer to every existing admin.
- [ ] Keep only accounts with current moderator need.
- [ ] Use owner workflow, not direct SQL, to demote unwanted admins so sessions, versions, optional content changes, and audit remain atomic.

## 9. Production rollout gate

- [ ] Repeat steps 1-3 against production backup/branch before opening traffic.
- [ ] Deploy with at least two owner addresses using the quoted custom delimiter.
- [ ] Repeat read-only checks and one disposable hierarchy workflow.
- [ ] Confirm both owners can sign in, open moderation controls, and query global audit.
- [ ] Confirm `legacy_count = backfilled_count`, both append-only triggers exist, and no unexpected legacy writes occurred.
- [ ] Do not approve production if any expected status, count, role, session result, action, metadata field, cursor result, or trigger behavior differs.

## 10. Rollback

Application rollback does **not** down-migrate `014_platform_audit_actions`. Keep migration `014`, its backfill, both append-only triggers, and all audit rows in place when deploying the previous image. Database migrations are forward-only under ordinary application rollback.

If application rollback is sufficient:

- [ ] Stop new deployment traffic or route it away.
- [ ] Deploy recorded previous image digest.
- [ ] Keep current database branch and verify health/read paths.
- [ ] Preserve `OWNER_EMAILS` for emergency access unless old application cannot read it; never remove owner evidence or audit rows.

If database state itself must be rolled back:

- [ ] Stop all writes.
- [ ] Preserve failed branch for investigation and audit export.
- [ ] Restore the pre-rollout backup or create a new branch at the recorded restore point.
- [ ] Point previous application image at restored branch through secret-managed deployment configuration.
- [ ] Verify account/session/content counts and application health before reopening traffic.
- [ ] Reconcile incident records separately; do not run handwritten `DROP`, `DELETE`, or reverse-migration SQL against audit tables.

After any rollback, document retained/removed owner configuration, image digest, database restore identifier, verification output, and incident owner outside the repository. Never place secret values or live URLs in this runbook.
