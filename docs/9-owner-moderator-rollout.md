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

Use one dedicated staging shell for steps 2-8. The block below keeps the server available to later commands in that shell, persists the pre-start marker in a restricted directory, and exports both `BASE_URL` and `ROLLOUT_STARTED_AT`. It never writes `DATABASE_URL` or cookies to disk.

```bash
set -euo pipefail
export DATABASE_URL='postgresql://staging-branch-url'
export OWNER_EMAILS='owner1@example.com,owner2@example.com'
test -d /tmp/opencode
umask 077

ROLLOUT_STATE_DIR=$(mktemp -d /tmp/opencode/doctect-owner-rollout.XXXXXX)
ROLLOUT_MARKER_FILE="${ROLLOUT_STATE_DIR}/started-at"
ROLLOUT_PID_FILE="${ROLLOUT_STATE_DIR}/server.pid"
ROLLOUT_SERVER_LOG="${ROLLOUT_STATE_DIR}/server.log"
ROLLOUT_PORT=${PORT:-3001}
export ROLLOUT_STATE_DIR ROLLOUT_MARKER_FILE ROLLOUT_PID_FILE ROLLOUT_SERVER_LOG ROLLOUT_PORT
printf 'Restricted rollout state: %s\n' "$ROLLOUT_STATE_DIR"
export PORT="$ROLLOUT_PORT"
export BASE_URL="http://127.0.0.1:${ROLLOUT_PORT}"
export ALLOWED_HOSTS="127.0.0.1:${ROLLOUT_PORT}${ALLOWED_HOSTS:+,${ALLOWED_HOSTS}}"
touch "$ROLLOUT_SERVER_LOG"
chmod 600 "$ROLLOUT_SERVER_LOG"

cleanup_rollout_server() {
  if [ -n "${ROLLOUT_SERVER_PID:-}" ] && kill -0 "$ROLLOUT_SERVER_PID" 2>/dev/null; then
    kill "$ROLLOUT_SERVER_PID" 2>/dev/null || true
    wait "$ROLLOUT_SERVER_PID" 2>/dev/null || true
  fi
  ROLLOUT_SERVER_PID=''
}

start_rollout_server() {
  if ! psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "SELECT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'" > "$ROLLOUT_MARKER_FILE"; then
    printf '%s\n' 'ERROR: failed to capture rollout marker' >&2
    return 1
  fi
  if ! chmod 600 "$ROLLOUT_MARKER_FILE" || ! : > "$ROLLOUT_SERVER_LOG"; then
    printf 'ERROR: cannot secure rollout marker/log under %s\n' "$ROLLOUT_STATE_DIR" >&2
    return 1
  fi

  NODE_ENV=production node server/index.js > "$ROLLOUT_SERVER_LOG" 2>&1 &
  ROLLOUT_SERVER_PID=$!
  export ROLLOUT_SERVER_PID
  if ! printf '%s\n' "$ROLLOUT_SERVER_PID" > "$ROLLOUT_PID_FILE" \
    || ! chmod 600 "$ROLLOUT_PID_FILE" "$ROLLOUT_SERVER_LOG"; then
    printf 'ERROR: cannot secure rollout PID/log under %s\n' "$ROLLOUT_STATE_DIR" >&2
    return 1
  fi

  local ready='false'
  local server_status
  for _ in $(seq 1 60); do
    if ! kill -0 "$ROLLOUT_SERVER_PID" 2>/dev/null; then
      if wait "$ROLLOUT_SERVER_PID"; then server_status=0; else server_status=$?; fi
      printf 'ERROR: startup/reconciliation exited with status %s; inspect restricted log: %s\n' \
        "$server_status" "$ROLLOUT_SERVER_LOG" >&2
      ROLLOUT_SERVER_PID=''
      return 1
    fi
    if curl -fsS "${BASE_URL}/api/me" >/dev/null 2>&1; then
      ready='true'
      break
    fi
    sleep 1
  done
  if [ "$ready" != 'true' ]; then
    printf 'ERROR: server health timeout; inspect restricted log: %s\n' "$ROLLOUT_SERVER_LOG" >&2
    return 1
  fi

  if ! read -r ROLLOUT_STARTED_AT < "$ROLLOUT_MARKER_FILE"; then
    printf '%s\n' 'ERROR: rollout marker is unreadable' >&2
    return 1
  fi
  export ROLLOUT_STARTED_AT
  printf 'Server ready: PID %s; marker and log restricted under %s\n' \
    "$ROLLOUT_SERVER_PID" "$ROLLOUT_STATE_DIR"
}

restart_rollout_server() {
  cleanup_rollout_server
  start_rollout_server
}

trap cleanup_rollout_server EXIT
trap 'cleanup_rollout_server; exit 130' INT
trap 'cleanup_rollout_server; exit 143' TERM
if ! start_rollout_server; then exit 1; fi
```

`/api/me` can return only after `server/index.js` finishes migrations and owner reconciliation and begins listening. A failed migration/reconciliation exits the process, fails this block, and prints process status plus restricted log path without printing log contents. Keep this shell open for steps 3-8. Empty, whitespace-only, or comma-only `OWNER_EMAILS` must stop production startup.

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
SELECT actor_kind, actor_user_id, actor_email, target_email, action, reason, metadata_json
FROM platform_audit_actions WHERE action IN ('owner_granted', 'owner_removed')
ORDER BY created_at DESC, id DESC;
```

- [ ] Migration row exists once.
- [ ] `legacy_count` equals `backfilled_count`.
- [ ] Trigger list includes `platform_audit_actions_no_update` and `platform_audit_actions_no_delete`.
- [ ] Existing configured accounts have role `owner`; any former owner absent from configuration has role `user`.
- [ ] Each changed account has exactly one matching system action with null actor user ID and constrained reconciliation metadata.

Confirm reconciliation revoked sessions for **every changed account**, including stale owners removed from configuration. This query derives the changed set from exact system actions created after the pre-start marker, lists every changed account, and exits nonzero if the set is empty or any session remains:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v rollout_started_at="$ROLLOUT_STARTED_AT" <<'SQL'
WITH changed AS (
  SELECT DISTINCT target_user_id
  FROM platform_audit_actions
  WHERE created_at >= CAST(:'rollout_started_at' AS TIMESTAMP)
    AND actor_kind = 'system'
    AND actor_user_id IS NULL
    AND actor_email = 'OWNER_EMAILS reconciliation'
    AND reason = 'Synchronize account role with OWNER_EMAILS configuration'
    AND action IN ('owner_granted', 'owner_removed')
)
SELECT u.id, u.email, u.role, u."moderationVersion", COUNT(s.id) AS session_count
FROM changed c
JOIN "user" u ON u.id = c.target_user_id
LEFT JOIN session s ON s."userId" = u.id
GROUP BY u.id, u.email, u.role, u."moderationVersion"
ORDER BY LOWER(u.email), u.id;

WITH changed AS (
  SELECT DISTINCT target_user_id
  FROM platform_audit_actions
  WHERE created_at >= CAST(:'rollout_started_at' AS TIMESTAMP)
    AND actor_kind = 'system'
    AND actor_user_id IS NULL
    AND actor_email = 'OWNER_EMAILS reconciliation'
    AND reason = 'Synchronize account role with OWNER_EMAILS configuration'
    AND action IN ('owner_granted', 'owner_removed')
)
SELECT COUNT(*) > 0 AS changed_accounts_found FROM changed
\gset
\if :changed_accounts_found
\else
  \echo 'ERROR: no reconciliation-changed accounts found'
  \quit 1
\endif

WITH changed AS (
  SELECT DISTINCT target_user_id
  FROM platform_audit_actions
  WHERE created_at >= CAST(:'rollout_started_at' AS TIMESTAMP)
    AND actor_kind = 'system'
    AND actor_user_id IS NULL
    AND actor_email = 'OWNER_EMAILS reconciliation'
    AND reason = 'Synchronize account role with OWNER_EMAILS configuration'
    AND action IN ('owner_granted', 'owner_removed')
)
SELECT NOT EXISTS (
  SELECT 1 FROM changed c JOIN session s ON s."userId" = c.target_user_id
) AS changed_sessions_zero
\gset
\if :changed_sessions_zero
\else
  \echo 'ERROR: reconciliation left sessions on a changed account'
  \quit 1
\endif
SQL
```

Output must include both newly granted owners and stale removed owners. Every row must show `session_count = 0`.

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
read -rp 'Owner actor email: ' OWNER_ACTOR_EMAIL
read -rp 'Admin target user ID: ' ADMIN_ID
read -rp 'Disposable admin target email: ' DISPOSABLE_ADMIN_EMAIL
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

curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" \
  -H 'Content-Type: application/json' -X POST \
  "${BASE_URL}/api/owner/users/${ADMIN_ID}/revoke-admin" \
  --data "{\"reason\":\"Staging disposable admin demotion\",\"expectedModerationVersion\":${ADMIN_VERSION},\"suspension\":null,\"projectIdsToUnpublish\":[]}"
# 200; response action is admin_demoted and target is DISPOSABLE_ADMIN_EMAIL
```

- [ ] Promoted account's old session now receives `401` from a protected API.
- [ ] Admin cannot suspend/restore the promoted admin or moderate that admin's project/review (`403`).
- [ ] Owner can demote the disposable admin with a reason and optional suspension; response actions are ordered `admin_demoted`, optional `account_suspended`, then selected `project_unpublished` actions.
- [ ] Demoted account has role `user`, incremented version, and no session; later restoration leaves role `user`.
- [ ] Select one of two public target projects during suspension/demotion. Selected project becomes private with null published pointer; untouched project remains public. Restoration does not republish either project.
- [ ] Standalone project unpublish and review deletion reject missing/blank/overlong reasons with `400`, reject protected target content with `403`, and return one matching audit DTO on success.
- [ ] Run the executable audit-failure rollback probe below and retain its successful comparison output.

### Exact audit-failure rollback probe

Prepare a separate disposable admin account with at least one live session and one disposable published project. No other test may use this account or project while the probe runs. This procedure never updates or deletes an audit row: it installs a uniquely named `BEFORE INSERT` trigger scoped to the disposable target, `admin_demoted` action, and unique reason.

```bash
(
set -euo pipefail

read -rp 'Audit-failure disposable admin user ID: ' AUDIT_FAILURE_ADMIN_ID
read -rp 'Audit-failure admin moderationVersion: ' AUDIT_FAILURE_ADMIN_VERSION
read -rp 'Audit-failure disposable published project ID: ' AUDIT_FAILURE_PROJECT_ID

AUDIT_FAILURE_REASON="Staging audit rollback probe $(date +%s)-$$"
AUDIT_FAILURE_TRIGGER="staging_audit_probe_trigger_$(date +%s)_$$"
AUDIT_FAILURE_FUNCTION="staging_audit_probe_function_$(date +%s)_$$"
AUDIT_FAILURE_RESPONSE=$(mktemp)

snapshot_audit_failure_user() {
  psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -v probe_id="$AUDIT_FAILURE_ADMIN_ID" <<'SQL'
SELECT json_build_object(
  'role', role,
  'banned', banned,
  'banReason', "banReason",
  'banExpires', "banExpires",
  'moderationVersion', "moderationVersion",
  'updatedAt', "updatedAt"
)::text
FROM "user" WHERE id = :'probe_id';
SQL
}

snapshot_audit_failure_sessions() {
  psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -v probe_id="$AUDIT_FAILURE_ADMIN_ID" <<'SQL'
SELECT json_build_object(
  'count', COUNT(*),
  'idHash', md5(COALESCE(string_agg(id, ',' ORDER BY id), ''))
)::text
FROM session WHERE "userId" = :'probe_id';
SQL
}

snapshot_audit_failure_project() {
  psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -v project_id="$AUDIT_FAILURE_PROJECT_ID" <<'SQL'
SELECT json_build_object(
  'ownerId', owner_id,
  'visibility', visibility,
  'publishedCommitId', published_commit_id
)::text
FROM projects WHERE id = :'project_id';
SQL
}

snapshot_audit_failure_actions() {
  psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -v probe_id="$AUDIT_FAILURE_ADMIN_ID" <<'SQL'
SELECT json_build_object(
  'count', COUNT(*),
  'idHash', md5(COALESCE(string_agg(id, ',' ORDER BY id), ''))
)::text
FROM platform_audit_actions WHERE target_user_id = :'probe_id';
SQL
}

cleanup_audit_failure_probe() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -v trigger_name="$AUDIT_FAILURE_TRIGGER" \
    -v function_name="$AUDIT_FAILURE_FUNCTION" <<'SQL'
DROP TRIGGER IF EXISTS :"trigger_name" ON platform_audit_actions;
DROP FUNCTION IF EXISTS :"function_name"();
SQL
  rm -f "$AUDIT_FAILURE_RESPONSE"
}
trap cleanup_audit_failure_probe EXIT INT TERM

BEFORE_USER=$(snapshot_audit_failure_user)
BEFORE_SESSIONS=$(snapshot_audit_failure_sessions)
BEFORE_PROJECT=$(snapshot_audit_failure_project)
BEFORE_ACTIONS=$(snapshot_audit_failure_actions)

node -e '
const user = JSON.parse(process.argv[1]);
const sessions = JSON.parse(process.argv[2]);
const project = JSON.parse(process.argv[3]);
if (user.role !== "admin") throw new Error("probe target must start as admin");
if (sessions.count < 1) throw new Error("probe target must have a live session");
if (project.ownerId !== process.argv[4] || project.visibility !== "public" || !project.publishedCommitId) {
  throw new Error("probe project must be published and owned by target");
}
' "$BEFORE_USER" "$BEFORE_SESSIONS" "$BEFORE_PROJECT" "$AUDIT_FAILURE_ADMIN_ID"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v trigger_name="$AUDIT_FAILURE_TRIGGER" \
  -v function_name="$AUDIT_FAILURE_FUNCTION" \
  -v probe_id="$AUDIT_FAILURE_ADMIN_ID" \
  -v probe_reason="$AUDIT_FAILURE_REASON" <<'SQL'
CREATE FUNCTION :"function_name"()
RETURNS trigger
LANGUAGE plpgsql
AS $probe$
BEGIN
  RAISE EXCEPTION 'staging injected platform audit failure';
END;
$probe$;

CREATE TRIGGER :"trigger_name"
BEFORE INSERT ON platform_audit_actions
FOR EACH ROW
WHEN (
  NEW.target_user_id = :'probe_id'
  AND NEW.action = 'admin_demoted'
  AND NEW.reason = :'probe_reason'
)
EXECUTE FUNCTION :"function_name"();
SQL

AUDIT_FAILURE_BODY=$(node -e '
process.stdout.write(JSON.stringify({
  reason: process.argv[1],
  expectedModerationVersion: Number(process.argv[2]),
  suspension: { expiresAt: null },
  projectIdsToUnpublish: [process.argv[3]],
}));
' "$AUDIT_FAILURE_REASON" "$AUDIT_FAILURE_ADMIN_VERSION" "$AUDIT_FAILURE_PROJECT_ID")
HTTP_STATUS=$(curl -sS -o "$AUDIT_FAILURE_RESPONSE" -w '%{http_code}' \
  -H "Cookie: ${OWNER_COOKIE}" \
  -H 'Content-Type: application/json' -X POST \
  "${BASE_URL}/api/owner/users/${AUDIT_FAILURE_ADMIN_ID}/revoke-admin" \
  --data "$AUDIT_FAILURE_BODY")
test "$HTTP_STATUS" = '500'
node -e '
const body = require("fs").readFileSync(process.argv[1], "utf8");
if (JSON.parse(body).error !== "Admin revocation failed") throw new Error("unexpected failure response");
' "$AUDIT_FAILURE_RESPONSE"

AFTER_USER=$(snapshot_audit_failure_user)
AFTER_SESSIONS=$(snapshot_audit_failure_sessions)
AFTER_PROJECT=$(snapshot_audit_failure_project)
AFTER_ACTIONS=$(snapshot_audit_failure_actions)

test "$AFTER_USER" = "$BEFORE_USER"
test "$AFTER_SESSIONS" = "$BEFORE_SESSIONS"
test "$AFTER_PROJECT" = "$BEFORE_PROJECT"
test "$AFTER_ACTIONS" = "$BEFORE_ACTIONS"
printf '%s\n' 'PASS: role, suspension, version, sessions, project publication, and audit rows rolled back'

cleanup_audit_failure_probe
trap - EXIT INT TERM
)
```

Any nonzero exit fails the gate. The trap drops the temporary trigger and function and removes the response file whether setup, request, or comparison fails. Confirm the named trigger/function no longer exist before reusing the disposable account.

Confirm Better Auth role mutation remains unavailable, including normalized path forms:

```bash
curl --path-as-is -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" "${BASE_URL}/api/auth/admin"
curl --path-as-is -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" "${BASE_URL}/api/auth/x/../admin"
curl --path-as-is -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: ${OWNER_COOKIE}" "${BASE_URL}/api/auth/x/%2e%2e/admin"
# 404 for each
```

## 6. Verify global filters and cursors

First prove the step 5 owner-authored demotion is queryable for the disposable admin target. An owner cannot be an `admin_demoted` target, so do not use either configured owner as `targetEmail`:

```bash
(
set -euo pipefail
AUDIT_FILTER_RESPONSE=$(mktemp)
trap 'rm -f "$AUDIT_FILTER_RESPONSE"' EXIT

curl -sS --fail-with-body --get -o "$AUDIT_FILTER_RESPONSE" \
  -H "Cookie: ${OWNER_COOKIE}" \
  --data-urlencode "actorEmail=${OWNER_ACTOR_EMAIL}" \
  --data-urlencode "targetEmail=${DISPOSABLE_ADMIN_EMAIL}" \
  --data-urlencode 'action=admin_demoted' \
  "${BASE_URL}/api/owner/audit"

node -e '
const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const actor = process.argv[2].trim().toLowerCase();
const target = process.argv[3].trim().toLowerCase();
if (!Array.isArray(body.items) || body.items.length === 0) {
  throw new Error("Expected at least one matching admin_demoted action");
}
if (body.items.some(item => item.actorEmail.toLowerCase() !== actor
  || item.targetEmail?.toLowerCase() !== target || item.action !== "admin_demoted")) {
  throw new Error("global audit returned an item outside active filters");
}
const summary = `${body.items.length} matching admin_demoted action(s)\n`;
process.stdout.write(summary);
' "$AUDIT_FILTER_RESPONSE" "$OWNER_ACTOR_EMAIL" "$DISPOSABLE_ADMIN_EMAIL"
)
```

Expected at least one matching `admin_demoted` action; zero items fails the gate.

Next use a separate disposable user to generate 26 matching `admin_promoted` rows through owner APIs. This stays below the 200-write global limit, touches no production-like account/content, leaves the target as `user`, and does not directly insert or mutate audit rows:

```bash
(
set -euo pipefail
read -rp 'Cursor-probe disposable user ID: ' CURSOR_TARGET_ID
read -rp 'Cursor-probe disposable user email: ' CURSOR_TARGET_EMAIL
read -rp 'Cursor-probe current moderationVersion: ' CURSOR_VERSION

CURSOR_REASON="Staging cursor probe $(date +%s)-$$"
ROLE_RESPONSE=$(mktemp)
PAGE_ONE=$(mktemp)
PAGE_TWO=$(mktemp)
trap 'rm -f "$ROLE_RESPONSE" "$PAGE_ONE" "$PAGE_TWO"' EXIT

role_request() {
  local endpoint=$1
  local payload=$2
  local status
  status=$(curl -sS -o "$ROLE_RESPONSE" -w '%{http_code}' \
    -H "Cookie: ${OWNER_COOKIE}" \
    -H 'Content-Type: application/json' -X POST \
    "${BASE_URL}${endpoint}" --data "$payload")
  if [ "$status" != '200' ]; then
    node -e 'process.stderr.write(require("fs").readFileSync(process.argv[1], "utf8"))' "$ROLE_RESPONSE"
    return 1
  fi
  node -e '
const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (!Number.isInteger(body.account?.moderationVersion)) throw new Error("missing moderationVersion");
process.stdout.write(String(body.account.moderationVersion));
' "$ROLE_RESPONSE"
}

for _ in $(seq 1 26); do
  PROMOTE_BODY=$(node -e '
process.stdout.write(JSON.stringify({
  reason: process.argv[1],
  expectedModerationVersion: Number(process.argv[2]),
}));
' "$CURSOR_REASON" "$CURSOR_VERSION")
  CURSOR_VERSION=$(role_request "/api/owner/users/${CURSOR_TARGET_ID}/promote-admin" "$PROMOTE_BODY")

  DEMOTE_BODY=$(node -e '
process.stdout.write(JSON.stringify({
  reason: process.argv[1],
  expectedModerationVersion: Number(process.argv[2]),
  suspension: null,
  projectIdsToUnpublish: [],
}));
' "$CURSOR_REASON" "$CURSOR_VERSION")
  CURSOR_VERSION=$(role_request "/api/owner/users/${CURSOR_TARGET_ID}/revoke-admin" "$DEMOTE_BODY")
done

curl -sS --fail-with-body --get -o "$PAGE_ONE" \
  -H "Cookie: ${OWNER_COOKIE}" \
  --data-urlencode "actorEmail=${OWNER_ACTOR_EMAIL}" \
  --data-urlencode "targetEmail=${CURSOR_TARGET_EMAIL}" \
  --data-urlencode 'action=admin_promoted' \
  "${BASE_URL}/api/owner/audit"

NEXT_CURSOR=$(node -e '
const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (body.items?.length !== 25 || typeof body.nextCursor !== "string" || !body.nextCursor) {
  throw new Error("first page must contain 25 items and a nextCursor");
}
process.stdout.write(body.nextCursor);
' "$PAGE_ONE")

curl -sS --fail-with-body --get -o "$PAGE_TWO" \
  -H "Cookie: ${OWNER_COOKIE}" \
  --data-urlencode "actorEmail=${OWNER_ACTOR_EMAIL}" \
  --data-urlencode "targetEmail=${CURSOR_TARGET_EMAIL}" \
  --data-urlencode 'action=admin_promoted' \
  --data-urlencode "cursor=${NEXT_CURSOR}" \
  "${BASE_URL}/api/owner/audit"

node -e '
const fs = require("fs");
const page1 = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const page2 = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const actor = process.argv[3].trim().toLowerCase();
const target = process.argv[4].trim().toLowerCase();
if (page1.items.length !== 25 || !page1.nextCursor) throw new Error("invalid first page");
if (!Array.isArray(page2.items) || page2.items.length < 1) throw new Error("second page must be nonempty");
const combined = [...page1.items, ...page2.items];
if (combined.length < 26) throw new Error("fewer than 26 matching audit rows");
if (combined.some(item => item.actorEmail.toLowerCase() !== actor
  || item.targetEmail?.toLowerCase() !== target || item.action !== "admin_promoted")) {
  throw new Error("cursor page violated frozen filters");
}
const page1Ids = page1.items.map(item => item.id);
const page2Ids = new Set(page2.items.map(item => item.id));
if (new Set(page1Ids).size !== page1Ids.length || page2Ids.size !== page2.items.length) {
  throw new Error("duplicate ID within a page");
}
if (page1Ids.some(id => page2Ids.has(id))) throw new Error("cursor pages overlap");
for (let index = 1; index < combined.length; index += 1) {
  const previous = combined[index - 1];
  const current = combined[index];
  if (previous.createdAt < current.createdAt
    || (previous.createdAt === current.createdAt && previous.id <= current.id)) {
    throw new Error("combined IDs are not in createdAt DESC, id DESC order");
  }
}
process.stdout.write(combined.map(item => item.id).join("\n") + "\n");
' "$PAGE_ONE" "$PAGE_TWO" "$OWNER_ACTOR_EMAIL" "$CURSOR_TARGET_EMAIL"
)
```

The printed IDs are ordered evidence. Keep both response files only if copied to approved evidence storage before the subshell exits; they are deleted automatically. Replay `nextCursor` only with identical actor, target, and action filters.

- [ ] Each returned item includes no password, token, session, IP, arbitrary request body, or review text.
- [ ] Admin receives `403` and anonymous request receives `401` for global audit.
- [ ] Invalid email/action/date/range/cursor returns `400 { "error": "Invalid audit query" }`.

## 7. Prove removed-owner recovery

On staging, change configuration to one retained owner and restart the production path:

```bash
export OWNER_EMAILS='owner2@example.com'
if ! restart_rollout_server; then exit 1; fi
```

- [ ] Removed `owner1@example.com` is now `user`; retained owner remains `owner`.
- [ ] Removed owner's sessions are absent and old cookies receive `401`.
- [ ] One `owner_removed` system action records old/new role and reconciliation source.
- [ ] Retained owner can still reach owner audit and recover authority.

Restore the two-owner configuration and restart before rollout approval:

```bash
export OWNER_EMAILS='owner1@example.com,owner2@example.com'
if ! restart_rollout_server; then exit 1; fi
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

After steps 3-8 pass, copy required non-secret evidence to approved storage, then stop the managed server and remove restricted temporary state:

```bash
cleanup_rollout_server
trap - EXIT INT TERM
rm -f "$ROLLOUT_PID_FILE" "$ROLLOUT_MARKER_FILE" "$ROLLOUT_SERVER_LOG"
rmdir "$ROLLOUT_STATE_DIR"
unset ROLLOUT_SERVER_PID ROLLOUT_STARTED_AT ROLLOUT_PID_FILE ROLLOUT_MARKER_FILE
unset ROLLOUT_SERVER_LOG ROLLOUT_STATE_DIR ROLLOUT_PORT BASE_URL DATABASE_URL OWNER_EMAILS
unset ALLOWED_HOSTS PORT
unset -f cleanup_rollout_server start_rollout_server restart_rollout_server
```

If startup or any later command fails, exiting the dedicated shell invokes the process cleanup trap. Restricted marker/PID/log files remain for diagnosis; inspect the log locally, then run the removal commands above with the printed state-directory path. Never paste log contents into tickets without checking them for infrastructure identifiers or other sensitive operational data.

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
