# Account Moderation and Suspension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give administrators an auditable workflow to search accounts, apply temporary or indefinite suspensions, revoke sessions, atomically unpublish selected projects, and restore access.

**Architecture:** Migration `011_account_moderation` adds Better Auth-compatible suspension columns and an append-only audit table for both PostgreSQL and SQLite; migration SQL becomes statement arrays where trigger bodies contain semicolons. A dedicated Express router uses `requireAdmin`, `query`, `withTransaction`, and `lockProjectRows` for bounded reads and atomic moderation writes, while React consumes explicit DTOs through `services/cloudApi.ts` and protects `/admin/moderation` with `AdminGuard`.

**Tech Stack:** JavaScript ESM, Express 5, Better Auth 1.4.10, PostgreSQL/SQLite (`pg`, `better-sqlite3`), React 19, TypeScript 5.8, React Router 6, Vitest, Supertest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-16-account-moderation-design.md`

## Global Constraints

- An active suspension is: `banned = true AND (banExpires IS NULL OR banExpires > current time)`.
- An expired temporary suspension permits a fresh sign-in under Better Auth's expiry semantics. The audit history remains intact.
- Restoration explicitly clears `banned`, `banReason`, and `banExpires` and increments `moderationVersion`.
- IDs are retained as audit values rather than cascading foreign keys, so later account or project deletion cannot erase moderation history.
- The application exposes no update or delete route for audit rows.
- PostgreSQL and SQLite migrations add guards that reject direct `UPDATE` and `DELETE` operations against this table.
- All endpoints use server-side `requireAdmin`. Client route guards are only a usability layer.
- Search requires a non-empty email or username query and returns a bounded, cursor-paginated result set.
- Search never returns credentials, OAuth tokens, session tokens, session IPs, or password data.
- Reasons are trimmed, mandatory, and limited to 1,000 characters.
- Temporary expiry must be a valid future timestamp. Indefinite suspension uses null.
- Duplicate or malformed project IDs are rejected.
- `400` — malformed reason, expiry, project list, or concurrency input.
- Malformed search/history cursors also return `400`.
- `403` — non-admin caller or administrator target.
- `404` — target user not found.
- `409` — moderation version changed, target status changed, or any selected project is no longer both owned by the target and published.
- `500` — unexpected server failure; transaction rollback leaves no partial account, session, content, or audit changes.
- Any failure rolls back every step.
- Server authorization and transaction validation are authoritative; client checks cannot grant access.
- Existing origin checking protects mutation routes. Existing write limiting also applies.
- Suspension never exposes or acts on stored session IP addresses.
- Administrator accounts cannot be suspended through this workflow.
- It does not republish content; publishing remains an explicit owner or administrator decision outside this flow.
- The existing standalone project-unpublish endpoint remains available for content-only moderation outside an account suspension.
- No application-level exact-IP or CIDR denylist is added.
- Do not add Better Auth's `adminClient`; all moderation client calls go through `cloudApi` and application-owned `/api/admin/users` routes.
- Migration history remains append-only: do not edit migrations `001` through `010`; append `011_account_moderation`.
- `server/migrations.js` must continue accepting legacy SQL strings and additionally accept SQL statement arrays without splitting array elements on semicolons.
- Current baseline `npx tsc --noEmit --pretty false` reports exactly five pre-existing test diagnostics: four `TS2556` errors in `tests/unit/changePassword.test.tsx` / `tests/unit/loginEmailVerification.test.tsx` and one `TS2339` in `tests/unit/svgEditing.test.ts`. This feature must add zero diagnostics.

## File Structure And Interfaces

| File | Action | Responsibility |
|---|---|---|
| `server/migrations.js` | Modify | Execute either legacy semicolon-delimited strings or already-separated SQL arrays. |
| `server/migrations/index.js` | Modify | Append PostgreSQL/SQLite migration `011_account_moderation`, including immutable audit triggers. |
| `tests/unit/server/accountModerationMigration.test.js` | Create | Verify runner compatibility, equivalent columns/indexes/defaults, preserved access, and insert-only audit behavior. |
| `tests/unit/server/migrationsPostgres.test.js` | Modify | Prove PostgreSQL executes migration 011 array elements intact rather than splitting trigger bodies. |
| `server/routes/adminModeration.js` | Create | Validate input, shape safe DTOs, search/detail users, suspend/restore atomically, and append audit rows. |
| `server/app.js` | Modify | Mount `adminModerationRouter` with existing API middleware active. |
| `tests/unit/server/accountModeration.test.js` | Create | Integration-test authorization, DTO safety, active/expired behavior, session revocation, selected projects, audit data, status codes, and rollback injection. |
| `services/cloudApi.ts` | Modify | Define exact moderation DTOs and expose search/detail/suspend/restore methods. |
| `tests/unit/cloudApi.test.ts` | Modify | Verify moderation URL/query/body serialization. |
| `pages/AdminModerationPage.tsx` | Create | Render bounded search, detail/history, suspension confirmation, selected projects, restoration, and recoverable errors. |
| `tests/unit/AdminModerationPage.test.tsx` | Create | Cover loading, pagination, durations, validation, confirmation, duplicate-submit prevention, state retention, refresh, and history. |
| `App.tsx` | Modify | Add role-authoritative `AdminGuard` usability gate and `/admin/moderation` route. |
| `components/AccountMenu.tsx` | Modify | Show Moderation link only when session role is `admin`. |
| `tests/unit/adminModerationRouting.test.tsx` | Create | Verify loading, sign-in redirect, non-admin denial, admin rendering, and route wiring. |
| `tests/unit/AccountMenu.test.tsx` | Modify | Verify role-gated Moderation navigation. |
| `tests/e2e/account_moderation.spec.js` | Create | Exercise complete admin suspend/session/content/restore/history workflow. |
| `docs/8-cloud-and-gallery.md` | Modify | Document moderation API, expiry, restoration, selected-content behavior, audit lookup, and deliberate IP-ban exclusion. |

### Shared HTTP DTO Contract

All dates are ISO-8601 strings. Cursors are opaque base64url strings containing the last row's sort keys; clients must only return them unchanged.

```ts
export type SuspensionStatus = 'none' | 'active' | 'expired';

export interface ModerationUserSearchItem {
    id: string;
    email: string;
    username: string | null;
    role: string | null;
    createdAt: string;
    suspensionStatus: SuspensionStatus;
    banExpires: string | null;
    moderationVersion: number;
}

export interface ModerationAccount extends ModerationUserSearchItem {
    banReason: string | null;
}

export interface ModerationProject {
    id: string;
    name: string;
    publishedAt: string | null;
}

export type ModerationActionType = 'account_suspended' | 'account_restored' | 'project_unpublished';

export interface ModerationAction {
    id: string;
    actorUserId: string;
    actorEmail: string;
    targetUserId: string;
    targetEmail: string;
    action: ModerationActionType;
    reason: string;
    expiresAt: string | null;
    projectId: string | null;
    createdAt: string;
}

export interface ModerationUserDetail {
    account: ModerationAccount;
    projects: ModerationProject[];
    history: { items: ModerationAction[]; nextCursor: string | null };
}

export interface SuspendAccountInput {
    reason: string;
    expiresAt: string | null;
    projectIdsToUnpublish: string[];
    expectedModerationVersion: number;
}

export interface RestoreAccountInput {
    reason: string;
    expectedModerationVersion: number;
}
```

Exact endpoint envelopes:

```text
GET  /api/admin/users?q=<query>&cursor=<cursor>
200  { users: ModerationUserSearchItem[], nextCursor: string | null }

GET  /api/admin/users/:id?historyCursor=<cursor>
200  ModerationUserDetail

POST /api/admin/users/:id/suspend
body SuspendAccountInput
200  { account: ModerationAccount, actions: ModerationAction[] }

POST /api/admin/users/:id/restore
body RestoreAccountInput
200  { account: ModerationAccount, actions: ModerationAction[] }
```

`suspensionStatus` is computed at response time. `banned = false/null` is `none`; `banned = true` with null/future `banExpires` is `active`; `banned = true` with elapsed `banExpires` is `expired`. Suspension rejects only `active`; an `expired` account may be suspended again. Restoration accepts `active` or `expired` (`banned = true`) and rejects `none` with `409`.

---

### Task 1: Migration Runner And Append-Only Moderation Schema

**Files:**
- Modify: `server/migrations.js:19-25`
- Modify: `server/migrations/index.js:304-305`
- Create: `tests/unit/server/accountModerationMigration.test.js`
- Modify: `tests/unit/server/migrationsPostgres.test.js`

**Interfaces:**
- Consumes: Existing `migrations: Array<{ id: string, pg: string | string[], sqlite?: string | string[] }>` and `withTransaction(callback)`.
- Produces: Migration `011_account_moderation`; `runMigrations()` executes each array element as one statement and still splits legacy string migrations.

- [ ] **Step 1: Write failing migration tests**

Create `tests/unit/server/accountModerationMigration.test.js`:

```js
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { migrations } from '../../../server/migrations/index.js';

let query;
let runMigrations;

beforeAll(async () => {
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-moderation-migration-${Date.now()}.db`);
    process.env.DATABASE_URL = '';
    ({ query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));
    await runMigrations();
});

describe('011 account moderation migration', () => {
    it('uses statement arrays so trigger bodies remain intact on both databases', () => {
        const migration = migrations.find(item => item.id === '011_account_moderation');
        expect(migration).toBeDefined();
        expect(Array.isArray(migration.pg)).toBe(true);
        expect(Array.isArray(migration.sqlite)).toBe(true);
        expect(migration.pg.some(sql => sql.includes('CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()'))).toBe(true);
        expect(migration.sqlite.some(sql => sql.includes("RAISE(ABORT, 'moderation_actions is append-only')"))).toBe(true);
    });

    it('declares equivalent PostgreSQL and SQLite fields, indexes, and guards', () => {
        const migration = migrations.find(item => item.id === '011_account_moderation');
        for (const dialect of ['pg', 'sqlite']) {
            const sql = migration[dialect].join('\n');
            for (const field of ['banReason', 'banExpires', 'moderationVersion', 'actor_user_id',
                'actor_email', 'target_user_id', 'target_email', 'action', 'reason', 'expires_at',
                'project_id', 'created_at']) {
                expect(sql).toContain(field);
            }
            expect(sql).toContain('idx_moderation_actions_target_time');
            expect(sql).toContain('idx_moderation_actions_actor_time');
            expect(sql).toContain('moderation_actions_no_update');
            expect(sql).toContain('moderation_actions_no_delete');
        }
    });

    it('migrates a pre-011 ordinary user without changing access state', () => {
        const legacyDb = new Database(':memory:');
        for (const migration of migrations.filter(item => item.id !== '011_account_moderation')) {
            const sql = migration.sqlite ?? migration.pg;
            for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
                legacyDb.exec(statement);
            }
        }
        legacyDb.prepare(`INSERT INTO "user"
            (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            'legacy-user', 'Legacy', 'legacy@test.dev', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, 0,
        );
        const migration = migrations.find(item => item.id === '011_account_moderation');
        legacyDb.transaction(() => {
            for (const statement of migration.sqlite) legacyDb.exec(statement);
        })();
        const user = legacyDb.prepare('SELECT banned, "banReason", "banExpires", "moderationVersion" FROM "user" WHERE id = ?').get('legacy-user');
        expect(Number(user.banned)).toBe(0);
        expect(user.banReason).toBeNull();
        expect(user.banExpires).toBeNull();
        expect(user.moderationVersion).toBe(0);
        legacyDb.close();
    });

    it('adds compatible user fields with a non-null version default', async () => {
        const columns = await query('PRAGMA table_info("user")');
        const byName = Object.fromEntries(columns.map(column => [column.name, column]));
        expect(byName.banReason).toBeDefined();
        expect(byName.banExpires).toBeDefined();
        expect(byName.moderationVersion).toBeDefined();
        expect(byName.moderationVersion.notnull).toBe(1);
        expect(byName.moderationVersion.dflt_value).toBe('0');
    });

    it('creates audit columns and target/actor time indexes', async () => {
        const columns = await query('PRAGMA table_info(moderation_actions)');
        expect(columns.map(column => column.name)).toEqual([
            'id', 'actor_user_id', 'actor_email', 'target_user_id', 'target_email',
            'action', 'reason', 'expires_at', 'project_id', 'created_at',
        ]);
        const indexes = await query('PRAGMA index_list(moderation_actions)');
        expect(indexes.map(index => index.name)).toEqual(expect.arrayContaining([
            'idx_moderation_actions_target_time',
            'idx_moderation_actions_actor_time',
        ]));
    });

    it('accepts inserts and rejects direct updates and deletes', async () => {
        const values = [
            'audit-1', 'admin-1', 'admin@test.dev', 'legacy-user', 'legacy@test.dev',
            'account_suspended', 'Confirmed abuse', null, null, '2026-07-16T12:00:00.000Z',
        ];
        await query(`INSERT INTO moderation_actions
            (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, expires_at, project_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, values);
        await expect(query('UPDATE moderation_actions SET reason = $1 WHERE id = $2', ['changed', 'audit-1']))
            .rejects.toThrow('moderation_actions is append-only');
        await expect(query('DELETE FROM moderation_actions WHERE id = $1', ['audit-1']))
            .rejects.toThrow('moderation_actions is append-only');
        expect((await query('SELECT reason FROM moderation_actions WHERE id = $1', ['audit-1']))[0].reason)
            .toBe('Confirmed abuse');
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/server/accountModerationMigration.test.js`

Expected: FAIL because `011_account_moderation` and moderation columns/table do not exist.

- [ ] **Step 3: Make runner preserve SQL array elements**

Replace statement selection in `server/migrations.js` with:

```js
const sql = dbType === 'postgres' ? migration.pg : (migration.sqlite ?? migration.pg);
const statements = Array.isArray(sql)
    ? sql.map(statement => statement.trim()).filter(Boolean)
    : sql.split(';').map(statement => statement.trim()).filter(Boolean);
for (const statement of statements) {
    await txQuery(statement);
}
```

- [ ] **Step 4: Append migration 011**

Append this object after migration `010_published_metadata` in `server/migrations/index.js` (add a comma after migration 010):

```js
{
    id: '011_account_moderation',
    pg: [
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" TEXT',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "moderationVersion" INTEGER NOT NULL DEFAULT 0',
        `CREATE TABLE IF NOT EXISTS moderation_actions (
            id TEXT PRIMARY KEY,
            actor_user_id TEXT NOT NULL,
            actor_email TEXT NOT NULL,
            target_user_id TEXT NOT NULL,
            target_email TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('account_suspended', 'account_restored', 'project_unpublished')),
            reason TEXT NOT NULL,
            expires_at TIMESTAMP,
            project_id TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_time
            ON moderation_actions(target_user_id, created_at DESC, id DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_moderation_actions_actor_time
            ON moderation_actions(actor_user_id, created_at DESC, id DESC)`,
        `CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()
         RETURNS trigger AS $$
         BEGIN
             RAISE EXCEPTION 'moderation_actions is append-only';
         END;
         $$ LANGUAGE plpgsql`,
        'DROP TRIGGER IF EXISTS moderation_actions_no_update ON moderation_actions',
        `CREATE TRIGGER moderation_actions_no_update
            BEFORE UPDATE ON moderation_actions
            FOR EACH ROW EXECUTE FUNCTION reject_moderation_action_mutation()`,
        'DROP TRIGGER IF EXISTS moderation_actions_no_delete ON moderation_actions',
        `CREATE TRIGGER moderation_actions_no_delete
            BEFORE DELETE ON moderation_actions
            FOR EACH ROW EXECUTE FUNCTION reject_moderation_action_mutation()`,
    ],
    sqlite: [
        'ALTER TABLE "user" ADD COLUMN "banReason" TEXT',
        'ALTER TABLE "user" ADD COLUMN "banExpires" TIMESTAMP',
        'ALTER TABLE "user" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0',
        `CREATE TABLE IF NOT EXISTS moderation_actions (
            id TEXT PRIMARY KEY,
            actor_user_id TEXT NOT NULL,
            actor_email TEXT NOT NULL,
            target_user_id TEXT NOT NULL,
            target_email TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('account_suspended', 'account_restored', 'project_unpublished')),
            reason TEXT NOT NULL,
            expires_at TIMESTAMP,
            project_id TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_time
            ON moderation_actions(target_user_id, created_at DESC, id DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_moderation_actions_actor_time
            ON moderation_actions(actor_user_id, created_at DESC, id DESC)`,
        `CREATE TRIGGER IF NOT EXISTS moderation_actions_no_update
            BEFORE UPDATE ON moderation_actions
            BEGIN
                SELECT RAISE(ABORT, 'moderation_actions is append-only');
            END`,
        `CREATE TRIGGER IF NOT EXISTS moderation_actions_no_delete
            BEFORE DELETE ON moderation_actions
            BEGIN
                SELECT RAISE(ABORT, 'moderation_actions is append-only');
            END`,
    ],
}
```

- [ ] **Step 5: Run focused migration contracts**

In `tests/unit/server/migrationsPostgres.test.js`, replace the fixed pending-migration filter with mutable test state and add the migration 011 contract:

```js
const migrationState = vi.hoisted(() => ({ pendingId: '010_published_metadata' }));

// Inside the mocked SELECT id FROM app_migrations branch:
return migrations
    .filter(migration => migration.id !== migrationState.pendingId)
    .map(migration => ({ id: migration.id }));

// Inside beforeEach:
migrationState.pendingId = '010_published_metadata';

it('executes PostgreSQL moderation trigger bodies as intact array statements', async () => {
    migrationState.pendingId = '011_account_moderation';
    const { runMigrations } = await import('../../../server/migrations.js');
    await runMigrations();

    const texts = dbCalls.map(call => call.text);
    expect(texts).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" TEXT');
    expect(texts).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP');
    expect(texts).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "moderationVersion" INTEGER NOT NULL DEFAULT 0');
    const functionStatement = texts.find(text => text.includes('CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()'));
    expect(functionStatement).toContain("RAISE EXCEPTION 'moderation_actions is append-only';");
    expect(functionStatement).toContain('$$ LANGUAGE plpgsql');
    expect(dbCalls).toContainEqual({
        text: 'INSERT INTO app_migrations (id) VALUES ($1)',
        params: ['011_account_moderation'],
    });
});
```

This leaves the existing migration 010 PostgreSQL test intact; `beforeEach` selects 010 by default.

Run: `npx vitest run tests/unit/server/accountModerationMigration.test.js tests/unit/server/migrations.test.js tests/unit/server/migrationsPostgres.test.js`

Expected: PASS. PostgreSQL contract still sees migration SQL as complete statements; SQLite creates both immutable triggers.

- [ ] **Step 6: Commit**

```bash
git add server/migrations.js server/migrations/index.js \
  tests/unit/server/accountModerationMigration.test.js tests/unit/server/migrationsPostgres.test.js \
  docs/superpowers/specs/2026-07-16-account-moderation-design.md \
  docs/superpowers/plans/2026-07-16-account-moderation.md
git commit -m "feat(moderation): add suspension audit schema"
```

---

### Task 2: Safe Admin User Search And Detail API

**Files:**
- Create: `server/routes/adminModeration.js`
- Modify: `server/app.js:9-14,71-75`
- Create: `tests/unit/server/accountModeration.test.js`

**Interfaces:**
- Consumes: `requireAdmin(req,res,next)`, `query(text, params)`, migration 011 fields/table.
- Produces: `GET /api/admin/users` and `GET /api/admin/users/:id` with exact shared DTO contract above; exports default Express router.

- [ ] **Step 1: Create authorization and safe-search integration tests**

Start `tests/unit/server/accountModeration.test.js` with:

```js
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

const faults = vi.hoisted(() => ({ pattern: null }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (faults.pattern?.test(text)) {
            faults.pattern = null;
            throw new Error('Injected moderation failure');
        }
        return baseQuery(text, params);
    };
    return {
        ...actual,
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

let app;
let adminCookie;
let ordinaryCookie;
let targetId;

beforeAll(async () => {
    app = await initTestApp();
    adminCookie = await signUpUser(app, { email: 'moderator@test.dev', username: 'moderator' });
    ordinaryCookie = await signUpUser(app, { email: 'ordinary@test.dev', username: 'ordinary' });
    await signUpUser(app, { email: 'target@test.dev', username: 'target_user' });
    const { query } = await import('../../../server/db.js');
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['moderator@test.dev']);
    targetId = (await query('SELECT id FROM "user" WHERE email = $1', ['target@test.dev']))[0].id;
});

beforeEach(() => { faults.pattern = null; });

describe('account moderation authorization and reads', () => {
    it.each([
        ['GET', '/api/admin/users?q=target'],
        ['GET', '/api/admin/users/not-a-user'],
        ['POST', '/api/admin/users/not-a-user/suspend'],
        ['POST', '/api/admin/users/not-a-user/restore'],
    ])('rejects a non-admin for %s %s', async (method, path) => {
        const res = request(app)[method.toLowerCase()](path).set('Cookie', ordinaryCookie);
        if (method === 'POST') res.send({ reason: 'not allowed', expectedModerationVersion: 0, expiresAt: null, projectIdsToUnpublish: [] });
        expect((await res).status).toBe(403);
    });

    it('requires a non-empty bounded search query and validates cursors', async () => {
        expect((await request(app).get('/api/admin/users').set('Cookie', adminCookie)).status).toBe(400);
        expect((await request(app).get('/api/admin/users?q=%20%20').set('Cookie', adminCookie)).status).toBe(400);
        expect((await request(app).get('/api/admin/users?q=target&cursor=broken').set('Cookie', adminCookie)).status).toBe(400);
        const wildcard = await request(app).get('/api/admin/users?q=%25').set('Cookie', adminCookie);
        expect(wildcard.status).toBe(200);
        expect(wildcard.body.users).toEqual([]);
    });

    it('searches email or username, paginates, and returns only safe fields', async () => {
        const res = await request(app).get('/api/admin/users?q=target').set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        expect(res.body.users).toHaveLength(1);
        expect(Object.keys(res.body.users[0]).sort()).toEqual([
            'banExpires', 'createdAt', 'email', 'id', 'moderationVersion',
            'role', 'suspensionStatus', 'username',
        ]);
        expect(res.body.users[0]).toMatchObject({
            id: targetId,
            email: 'target@test.dev',
            username: 'target_user',
            suspensionStatus: 'none',
            moderationVersion: 0,
        });
        expect(JSON.stringify(res.body)).not.toMatch(/password|token|ipAddress|session/i);
        expect(res.body.nextCursor).toBeNull();
    });

    it('bounds search pages at 25 and resumes after the opaque cursor', async () => {
        const { query } = await import('../../../server/db.js');
        for (let index = 0; index < 26; index += 1) {
            const suffix = String(index).padStart(2, '0');
            await query(`INSERT INTO "user"
                (id, name, email, "emailVerified", "createdAt", "updatedAt", username, banned)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [`page-user-${suffix}`, `Page ${suffix}`, `page-${suffix}@cursor.test`, 1,
                '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', `page_user_${suffix}`, 0]);
        }
        const first = await request(app).get('/api/admin/users?q=cursor.test').set('Cookie', adminCookie);
        expect(first.status).toBe(200);
        expect(first.body.users).toHaveLength(25);
        expect(typeof first.body.nextCursor).toBe('string');
        const second = await request(app)
            .get(`/api/admin/users?q=cursor.test&cursor=${encodeURIComponent(first.body.nextCursor)}`)
            .set('Cookie', adminCookie);
        expect(second.status).toBe(200);
        expect(second.body.users).toHaveLength(1);
        expect(second.body.users[0].email).toBe('page-25@cursor.test');
        expect(second.body.nextCursor).toBeNull();
    });

    it('returns safe detail, published projects, and cursor-paginated history', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`INSERT INTO projects
            (id, owner_id, name, visibility, published_commit_id, published_name, published_at)
            VALUES ($1, $2, $3, 'public', $4, $5, $6)`,
        ['moderation-project', targetId, 'Private mutable name', 'commit-1', 'Published name', '2026-07-16T10:00:00.000Z']);
        const res = await request(app).get(`/api/admin/users/${targetId}`).set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body.account).sort()).toEqual([
            'banExpires', 'banReason', 'createdAt', 'email', 'id', 'moderationVersion',
            'role', 'suspensionStatus', 'username',
        ]);
        expect(res.body.projects).toEqual([{
            id: 'moderation-project', name: 'Published name', publishedAt: '2026-07-16T10:00:00.000Z',
        }]);
        expect(res.body.history).toEqual({ items: [], nextCursor: null });
        expect(JSON.stringify(res.body)).not.toMatch(/password|token|ipAddress/i);
    });

    it('bounds history pages at 25 and resumes in descending time order', async () => {
        const { query } = await import('../../../server/db.js');
        for (let index = 0; index < 26; index += 1) {
            const suffix = String(index).padStart(2, '0');
            await query(`INSERT INTO moderation_actions
                (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [`history-${suffix}`, 'admin-history', 'history-admin@test.dev', targetId, 'target@test.dev',
                'account_restored', `History ${suffix}`, `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`]);
        }
        const first = await request(app).get(`/api/admin/users/${targetId}`).set('Cookie', adminCookie);
        expect(first.body.history.items).toHaveLength(25);
        expect(first.body.history.items[0].reason).toBe('History 25');
        expect(typeof first.body.history.nextCursor).toBe('string');
        const second = await request(app)
            .get(`/api/admin/users/${targetId}?historyCursor=${encodeURIComponent(first.body.history.nextCursor)}`)
            .set('Cookie', adminCookie);
        expect(second.body.history.items).toHaveLength(1);
        expect(second.body.history.items[0].reason).toBe('History 00');
        expect(second.body.history.nextCursor).toBeNull();
    });

    it('returns 404 for a missing target and 400 for a malformed history cursor', async () => {
        expect((await request(app).get('/api/admin/users/missing').set('Cookie', adminCookie)).status).toBe(404);
        expect((await request(app).get(`/api/admin/users/${targetId}?historyCursor=broken`).set('Cookie', adminCookie)).status).toBe(400);
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/server/accountModeration.test.js`

Expected: FAIL with `404` for `/api/admin/users` because router is absent.

- [ ] **Step 3: Create DTO, cursor, and read-route implementation**

Create `server/routes/adminModeration.js` with these imports/constants/helpers and read routes:

```js
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dbType, query, withTransaction } from '../db.js';
import { requireAdmin } from '../middleware/guards.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();
const PAGE_SIZE = 25;

const asIso = value => value == null ? null : new Date(value).toISOString();
const isBanned = value => value === true || value === 1 || value === '1';

const suspensionStatus = (row, now = Date.now()) => {
    if (!isBanned(row.banned)) return 'none';
    if (row.banExpires == null) return 'active';
    return new Date(row.banExpires).getTime() > now ? 'active' : 'expired';
};

const searchUserDto = row => ({
    id: row.id,
    email: row.email,
    username: row.username ?? null,
    role: row.role ?? null,
    createdAt: asIso(row.createdAt),
    suspensionStatus: suspensionStatus(row),
    banExpires: asIso(row.banExpires),
    moderationVersion: Number(row.moderationVersion),
});

const accountDto = row => ({
    ...searchUserDto(row),
    banReason: row.banReason ?? null,
});

const actionDto = row => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email,
    action: row.action,
    reason: row.reason,
    expiresAt: asIso(row.expires_at),
    projectId: row.project_id ?? null,
    createdAt: asIso(row.created_at),
});

const encodeCursor = values => Buffer.from(JSON.stringify(values)).toString('base64url');
const escapeLike = value => value.replace(/\\/g, '\\\\').replace(/[%_]/g, character => `\\${character}`);
const decodeCursor = (raw, expectedLength) => {
    if (!raw) return null;
    try {
        const values = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
        if (!Array.isArray(values) || values.length !== expectedLength || values.some(value => typeof value !== 'string' || !value)) {
            return null;
        }
        return values;
    } catch {
        return null;
    }
};

router.get('/api/admin/users', requireAdmin, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length > 100) return res.status(400).json({ error: 'q must be 1 to 100 characters' });
    const cursor = req.query.cursor === undefined ? [] : decodeCursor(req.query.cursor, 2);
    if (cursor === null) return res.status(400).json({ error: 'cursor is invalid' });

    const escapedQuery = escapeLike(q.toLowerCase());
    const params = [`%${escapedQuery}%`, `%${escapedQuery}%`];
    let after = '';
    if (cursor.length) {
        params.push(cursor[0], cursor[0], cursor[1]);
        after = `AND (LOWER(email) > $3 OR (LOWER(email) = $4 AND id > $5))`;
    }
    const rows = await query(
        `SELECT id, email, username, role, "createdAt", banned, "banExpires", "moderationVersion"
         FROM "user"
         WHERE (LOWER(email) LIKE $1 ESCAPE '\\' OR LOWER(COALESCE(username, '')) LIKE $2 ESCAPE '\\')
         ${after}
         ORDER BY LOWER(email), id
         LIMIT ${PAGE_SIZE + 1}`,
        params,
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    res.json({
        users: page.map(searchUserDto),
        nextCursor: rows.length > PAGE_SIZE ? encodeCursor([last.email.toLowerCase(), last.id]) : null,
    });
});

router.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const cursor = req.query.historyCursor === undefined ? [] : decodeCursor(req.query.historyCursor, 2);
    if (cursor === null) return res.status(400).json({ error: 'historyCursor is invalid' });
    const users = await query(
        `SELECT id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"
         FROM "user" WHERE id = $1`,
        [req.params.id],
    );
    if (!users[0]) return res.status(404).json({ error: 'User not found' });

    const projects = await query(
        `SELECT id, COALESCE(published_name, name) AS name, published_at
         FROM projects
         WHERE owner_id = $1 AND visibility = 'public' AND published_commit_id IS NOT NULL
         ORDER BY published_at DESC, id`,
        [req.params.id],
    );
    const params = [req.params.id];
    let before = '';
    if (cursor.length) {
        params.push(cursor[0], cursor[0], cursor[1]);
        before = 'AND (created_at < $2 OR (created_at = $3 AND id < $4))';
    }
    const actions = await query(
        `SELECT * FROM moderation_actions
         WHERE target_user_id = $1 ${before}
         ORDER BY created_at DESC, id DESC
         LIMIT ${PAGE_SIZE + 1}`,
        params,
    );
    const historyPage = actions.slice(0, PAGE_SIZE);
    const last = historyPage[historyPage.length - 1];
    res.json({
        account: accountDto(users[0]),
        projects: projects.map(project => ({
            id: project.id,
            name: project.name,
            publishedAt: asIso(project.published_at),
        })),
        history: {
            items: historyPage.map(actionDto),
            nextCursor: actions.length > PAGE_SIZE ? encodeCursor([asIso(last.created_at), last.id]) : null,
        },
    });
});

export default router;
```

The mutation imports are intentionally present now because Tasks 3 and 4 add routes to this same focused module.

- [ ] **Step 4: Mount router under existing middleware**

In `server/app.js`, import and mount it after existing routers:

```js
import adminModerationRouter from './routes/adminModeration.js';

// Inside createApp(), after mergeRequestsRouter:
app.use(adminModerationRouter);
```

Because mounting occurs after `app.use('/api', checkOrigin)` and `app.use('/api', writeLimiter)`, moderation writes inherit both protections.

- [ ] **Step 5: Run read API tests**

Run: `npx vitest run tests/unit/server/accountModeration.test.js`

Expected: PASS for `account moderation authorization and reads`; no response contains password, account token, session token, or session IP columns.

- [ ] **Step 6: Commit**

```bash
git add server/routes/adminModeration.js server/app.js tests/unit/server/accountModeration.test.js
git commit -m "feat(moderation): add safe admin account reads"
```

---

### Task 3: Atomic Suspension, Session Revocation, And Selected Unpublishing

**Files:**
- Modify: `server/routes/adminModeration.js`
- Modify: `tests/unit/server/accountModeration.test.js`

**Interfaces:**
- Consumes: `withTransaction(callback)`, `lockProjectRows(projectIds, queryFn)`, `req.user`, `moderationVersion`.
- Produces: `POST /api/admin/users/:id/suspend`, exact `SuspendAccountInput`, and `{ account, actions }` response.

- [ ] **Step 1: Add suspension fixtures and behavior tests**

Append this helper and suite to `tests/unit/server/accountModeration.test.js`:

```js
const createPublishedProject = async (id, ownerId, name) => {
    const { query } = await import('../../../server/db.js');
    await query(`INSERT INTO projects
        (id, owner_id, name, visibility, published_commit_id, published_name, published_at)
        VALUES ($1, $2, $3, 'public', $4, $5, $6)`,
    [id, ownerId, name, `commit-${id}`, name, '2026-07-16T11:00:00.000Z']);
};

describe('account suspension', () => {
    it('rejects malformed input and administrator targets with exact status classes', async () => {
        const { query } = await import('../../../server/db.js');
        const adminId = (await query('SELECT id FROM "user" WHERE email = $1', ['moderator@test.dev']))[0].id;
        const base = { reason: 'Confirmed abuse', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: 0 };
        const malformed = [
            { ...base, reason: ' ' },
            { ...base, reason: 'x'.repeat(1001) },
            { ...base, expiresAt: 'not-a-date' },
            { ...base, expiresAt: new Date(Date.now() - 1000).toISOString() },
            { ...base, projectIdsToUnpublish: ['same', 'same'] },
            { ...base, projectIdsToUnpublish: [''] },
            { ...base, expectedModerationVersion: -1 },
        ];
        for (const body of malformed) {
            const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send(body);
            expect(res.status).toBe(400);
        }
        const forbidden = await request(app).post(`/api/admin/users/${adminId}/suspend`).set('Cookie', adminCookie).send(base);
        expect(forbidden.status).toBe(403);
        expect((await request(app).post('/api/admin/users/missing/suspend').set('Cookie', adminCookie).send(base)).status).toBe(404);
    });

    it('atomically applies an indefinite suspension, revokes every session, and unpublishes only selected projects', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user" SET banned = 0, "banReason" = NULL, "banExpires" = NULL, "moderationVersion" = 0 WHERE id = $1`, [targetId]);
        await query('DELETE FROM session WHERE "userId" = $1', [targetId]);
        const firstCookie = await (async () => {
            const signin = await request(app).post('/api/auth/sign-in/email').send({ email: 'target@test.dev', password: 'Password-1234!' });
            return signin.headers['set-cookie'].map(cookie => cookie.split(';')[0]).join('; ');
        })();
        await request(app).post('/api/auth/sign-in/email').send({ email: 'target@test.dev', password: 'Password-1234!' });
        await createPublishedProject('selected-project', targetId, 'Selected project');
        await createPublishedProject('untouched-project', targetId, 'Untouched project');

        const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: '  Confirmed repeated abuse  ',
            expiresAt: null,
            projectIdsToUnpublish: ['selected-project'],
            expectedModerationVersion: 0,
        });
        expect(res.status).toBe(200);
        expect(res.body.account).toMatchObject({
            suspensionStatus: 'active', banReason: 'Confirmed repeated abuse', banExpires: null, moderationVersion: 1,
        });
        expect(res.body.actions.map(action => action.action)).toEqual(['account_suspended', 'project_unpublished']);
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [targetId])).toEqual([]);
        expect((await request(app).get('/api/projects').set('Cookie', firstCookie)).status).toBe(401);
        expect((await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', ['selected-project']))[0])
            .toEqual({ visibility: 'private', published_commit_id: null });
        expect((await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', ['untouched-project']))[0])
            .toEqual({ visibility: 'public', published_commit_id: 'commit-untouched-project' });
    });

    it('blocks fresh sign-in while active and permits sign-in after temporary expiry', async () => {
        const active = await request(app).post('/api/auth/sign-in/email')
            .send({ email: 'target@test.dev', password: 'Password-1234!' });
        expect(active.status).toBe(403);
        expect(active.body.code).toBe('BANNED_USER');

        const { query } = await import('../../../server/db.js');
        await query('UPDATE "user" SET "banExpires" = $1 WHERE id = $2', [new Date(Date.now() - 1000).toISOString(), targetId]);
        const expired = await request(app).post('/api/auth/sign-in/email')
            .send({ email: 'target@test.dev', password: 'Password-1234!' });
        expect(expired.status).toBe(200);
        const detail = await request(app).get(`/api/admin/users/${targetId}`).set('Cookie', adminCookie);
        expect(detail.body.account.suspensionStatus).toBe('expired');
    });

    it('persists a future temporary expiry and records complete actor/target/project audit snapshots', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user" SET banned = 0, "banReason" = NULL, "banExpires" = NULL WHERE id = $1`, [targetId]);
        const version = (await query('SELECT "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0].moderationVersion;
        await createPublishedProject('temporary-project', targetId, 'Temporary project');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Temporary investigation', expiresAt,
            projectIdsToUnpublish: ['temporary-project'], expectedModerationVersion: version,
        });
        expect(res.status).toBe(200);
        expect(res.body.account.banExpires).toBe(expiresAt);
        for (const action of res.body.actions) {
            expect(action).toMatchObject({
                actorEmail: 'moderator@test.dev', targetUserId: targetId,
                targetEmail: 'target@test.dev', reason: 'Temporary investigation', expiresAt,
            });
            expect(new Date(action.createdAt).toString()).not.toBe('Invalid Date');
        }
        expect(res.body.actions.find(action => action.action === 'project_unpublished').projectId).toBe('temporary-project');
        expect(res.body.actions.find(action => action.action === 'account_suspended').projectId).toBeNull();
    });

    it('returns 409 for stale version, active target, foreign project, or already-private project without partial changes', async () => {
        const { query } = await import('../../../server/db.js');
        const current = (await query('SELECT "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0].moderationVersion;
        const stale = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Stale', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: current - 1,
        });
        expect(stale.status).toBe(409);
        const active = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Duplicate', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: current,
        });
        expect(active.status).toBe(409);

        await query(`UPDATE "user" SET banned = 0, "banReason" = NULL, "banExpires" = NULL WHERE id = $1`, [targetId]);
        await createPublishedProject('foreign-project', (await query('SELECT id FROM "user" WHERE email = $1', ['ordinary@test.dev']))[0].id, 'Foreign');
        const foreign = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Foreign selection', expiresAt: null, projectIdsToUnpublish: ['foreign-project'], expectedModerationVersion: current,
        });
        expect(foreign.status).toBe(409);
        expect((await query('SELECT banned, "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0])
            .toEqual({ banned: 0, moderationVersion: current });
        expect(await query('SELECT id FROM moderation_actions WHERE reason = $1', ['Foreign selection'])).toEqual([]);

        await query(`INSERT INTO projects
            (id, owner_id, name, visibility, published_commit_id)
            VALUES ($1, $2, $3, 'private', NULL)`,
        ['already-private', targetId, 'Already private']);
        const privateSelection = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Private selection', expiresAt: null,
            projectIdsToUnpublish: ['already-private'], expectedModerationVersion: current,
        });
        expect(privateSelection.status).toBe(409);
        expect((await query('SELECT banned, "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0])
            .toEqual({ banned: 0, moderationVersion: current });
        expect(await query('SELECT id FROM moderation_actions WHERE reason = $1', ['Private selection'])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run suspension tests to verify failure**

Run: `npx vitest run tests/unit/server/accountModeration.test.js -t "account suspension"`

Expected: FAIL because suspend route returns `404`.

- [ ] **Step 3: Add exact request validation and transaction helpers**

Insert before routes in `server/routes/adminModeration.js`:

```js
const validateReason = raw => {
    if (typeof raw !== 'string') return null;
    const reason = raw.trim();
    return reason.length >= 1 && reason.length <= 1000 ? reason : null;
};

const validateVersion = value => Number.isInteger(value) && value >= 0;

const validateExpiry = raw => {
    if (raw === null) return { ok: true, value: null };
    if (typeof raw !== 'string') return { ok: false };
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return { ok: false };
    return { ok: true, value: new Date(timestamp).toISOString() };
};

const validateProjectIds = raw => {
    if (!Array.isArray(raw) || raw.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) return null;
    const ids = raw.map(id => id.trim());
    return new Set(ids).size === ids.length ? ids : null;
};

const lockUser = async (id, txQuery) => {
    const suffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
    const rows = await txQuery(
        `SELECT id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"
         FROM "user" WHERE id = $1${suffix}`,
        [id],
    );
    return rows[0] ?? null;
};

const insertAction = async (txQuery, values) => {
    const id = randomUUID();
    await txQuery(
        `INSERT INTO moderation_actions
         (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, expires_at, project_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, values.actorUserId, values.actorEmail, values.targetUserId, values.targetEmail,
            values.action, values.reason, values.expiresAt, values.projectId, values.createdAt],
    );
    return actionDto({
        id,
        actor_user_id: values.actorUserId,
        actor_email: values.actorEmail,
        target_user_id: values.targetUserId,
        target_email: values.targetEmail,
        action: values.action,
        reason: values.reason,
        expires_at: values.expiresAt,
        project_id: values.projectId,
        created_at: values.createdAt,
    });
};
```

- [ ] **Step 4: Add suspend route**

Add before `export default router`:

```js
router.post('/api/admin/users/:id/suspend', requireAdmin, async (req, res) => {
    const reason = validateReason(req.body?.reason);
    const expiry = validateExpiry(req.body?.expiresAt);
    const projectIds = validateProjectIds(req.body?.projectIdsToUnpublish);
    const expectedVersion = req.body?.expectedModerationVersion;
    if (!reason || !expiry.ok || projectIds === null || !validateVersion(expectedVersion)) {
        return res.status(400).json({ error: 'Invalid suspension request' });
    }

    try {
        const result = await withTransaction(async txQuery => {
            const target = await lockUser(req.params.id, txQuery);
            if (!target) return { status: 404 };
            if (target.role === 'admin') return { status: 403 };
            if (Number(target.moderationVersion) !== expectedVersion || suspensionStatus(target) === 'active') {
                return { status: 409 };
            }

            const projects = await lockProjectRows(projectIds, txQuery);
            const selected = new Map(projects.map(project => [project.id, project]));
            const validProjects = projects.length === projectIds.length && projectIds.every(id => {
                const project = selected.get(id);
                return project?.owner_id === target.id
                    && project.visibility === 'public'
                    && project.published_commit_id != null;
            });
            if (!validProjects) return { status: 409 };

            const now = new Date().toISOString();
            const updated = await txQuery(
                `UPDATE "user"
                 SET banned = $1, "banReason" = $2, "banExpires" = $3,
                     "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $4
                 WHERE id = $5 AND "moderationVersion" = $6
                 RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
                [dbType === 'postgres' ? true : 1, reason, expiry.value, now, target.id, expectedVersion],
            );
            if (!updated[0]) return { status: 409 };
            await txQuery('DELETE FROM session WHERE "userId" = $1', [target.id]);

            for (const projectId of projectIds) {
                await txQuery(
                    `UPDATE projects SET visibility = 'private', published_commit_id = NULL WHERE id = $1`,
                    [projectId],
                );
            }

            const common = {
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                reason,
                expiresAt: expiry.value,
                createdAt: now,
            };
            const actions = [await insertAction(txQuery, {
                ...common, action: 'account_suspended', projectId: null,
            })];
            for (const projectId of projectIds) {
                actions.push(await insertAction(txQuery, {
                    ...common, action: 'project_unpublished', projectId,
                }));
            }
            return { status: 200, account: accountDto(updated[0]), actions };
        });
        if (result.status === 403) return res.status(403).json({ error: 'Administrator accounts cannot be suspended' });
        if (result.status === 404) return res.status(404).json({ error: 'User not found' });
        if (result.status === 409) return res.status(409).json({ error: 'Moderation state changed; refresh and try again' });
        return res.json({ account: result.account, actions: result.actions });
    } catch (error) {
        console.error('Account suspension failed:', error);
        return res.status(500).json({ error: 'Account suspension failed' });
    }
});
```

- [ ] **Step 5: Run suspension and existing auth tests**

Run: `npx vitest run tests/unit/server/accountModeration.test.js tests/unit/server/app.test.js tests/unit/server/guards.test.js`

Expected: PASS. Active Better Auth sign-in returns `403`/`BANNED_USER`; elapsed expiry permits `200`; only selected project loses public visibility/linkage.

- [ ] **Step 6: Commit**

```bash
git add server/routes/adminModeration.js tests/unit/server/accountModeration.test.js
git commit -m "feat(moderation): suspend accounts atomically"
```

---

### Task 4: Restore Workflow And Full Transaction Rollback Proof

**Files:**
- Modify: `server/routes/adminModeration.js`
- Modify: `tests/unit/server/accountModeration.test.js`

**Interfaces:**
- Consumes: `validateReason`, `validateVersion`, `lockUser`, `insertAction`, and `withTransaction` from Task 3.
- Produces: `POST /api/admin/users/:id/restore`; fault-injection coverage at account update, session deletion, project update, and audit insert.

- [ ] **Step 1: Add restoration tests**

Append to `tests/unit/server/accountModeration.test.js`:

```js
describe('account restoration', () => {
    it('requires a reason/version and rejects missing or unsuspended targets', async () => {
        expect((await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie)
            .send({ reason: '', expectedModerationVersion: 0 })).status).toBe(400);
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user" SET banned = 0, "banReason" = NULL, "banExpires" = NULL WHERE id = $1`, [targetId]);
        const version = (await query('SELECT "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0].moderationVersion;
        expect((await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie)
            .send({ reason: 'No suspension', expectedModerationVersion: version })).status).toBe(409);
    });

    it.each([
        ['active', null],
        ['expired', new Date(Date.now() - 1000).toISOString()],
    ])('restores an %s suspension, revokes sessions defensively, and never republishes content', async (_label, expiresAt) => {
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user"
            SET banned = 1, "banReason" = 'Prior reason', "banExpires" = $1,
                "moderationVersion" = "moderationVersion" + 1
            WHERE id = $2`, [expiresAt, targetId]);
        const version = (await query('SELECT "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0].moderationVersion;
        await query(`INSERT INTO session
            (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
            VALUES ($1, $2, $3, $4, $5, $6)`,
        [`defensive-${_label}`, new Date(Date.now() + 3600000).toISOString(), `token-${_label}`,
            new Date().toISOString(), new Date().toISOString(), targetId]);
        const project = await query('SELECT id, visibility, published_commit_id FROM projects WHERE id = $1', ['selected-project']);

        const res = await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie).send({
            reason: `Restored ${_label}`, expectedModerationVersion: version,
        });
        expect(res.status).toBe(200);
        expect(res.body.account).toMatchObject({
            suspensionStatus: 'none', banReason: null, banExpires: null, moderationVersion: version + 1,
        });
        expect(res.body.actions).toHaveLength(1);
        expect(res.body.actions[0]).toMatchObject({
            action: 'account_restored', reason: `Restored ${_label}`, expiresAt: null, projectId: null,
        });
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [targetId])).toEqual([]);
        expect(await query('SELECT id, visibility, published_commit_id FROM projects WHERE id = $1', ['selected-project']))
            .toEqual(project);
    });
});
```

- [ ] **Step 2: Add table-driven rollback fault injection**

Append this suite. Each case creates a clean target/project/session snapshot, injects exactly one database failure, then proves account/session/project/audit state is byte-for-byte unchanged:

```js
describe('moderation transaction rollback', () => {
    it.each([
        ['account update', /UPDATE "user"\s+SET banned/],
        ['session deletion', /DELETE FROM session WHERE "userId"/],
        ['project update', /UPDATE projects SET visibility = 'private'/],
        ['audit insertion', /INSERT INTO moderation_actions/],
    ])('rolls back every suspension write when %s fails', async (_stage, pattern) => {
        const { query } = await import('../../../server/db.js');
        const suffix = _stage.replaceAll(' ', '-');
        const projectId = `rollback-${suffix}`;
        await query(`UPDATE "user"
            SET banned = 0, "banReason" = NULL, "banExpires" = NULL,
                "moderationVersion" = "moderationVersion" + 1
            WHERE id = $1`, [targetId]);
        await query('DELETE FROM session WHERE "userId" = $1', [targetId]);
        await query(`INSERT INTO session
            (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
            VALUES ($1, $2, $3, $4, $5, $6)`,
        [`session-${suffix}`, new Date(Date.now() + 3600000).toISOString(), `rollback-token-${suffix}`,
            new Date().toISOString(), new Date().toISOString(), targetId]);
        await createPublishedProject(projectId, targetId, `Rollback ${_stage}`);
        const beforeUser = await query('SELECT banned, "banReason", "banExpires", "moderationVersion" FROM "user" WHERE id = $1', [targetId]);
        const beforeSessions = await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId]);
        const beforeProject = await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', [projectId]);
        const beforeAudit = await query('SELECT id FROM moderation_actions WHERE target_user_id = $1 ORDER BY id', [targetId]);

        faults.pattern = pattern;
        const failed = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: `Rollback ${_stage}`, expiresAt: null, projectIdsToUnpublish: [projectId],
            expectedModerationVersion: beforeUser[0].moderationVersion,
        });
        expect(failed.status).toBe(500);
        expect(await query('SELECT banned, "banReason", "banExpires", "moderationVersion" FROM "user" WHERE id = $1', [targetId]))
            .toEqual(beforeUser);
        expect(await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId])).toEqual(beforeSessions);
        expect(await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', [projectId])).toEqual(beforeProject);
        expect(await query('SELECT id FROM moderation_actions WHERE target_user_id = $1 ORDER BY id', [targetId])).toEqual(beforeAudit);
    });
});
```

- [ ] **Step 3: Run new tests to verify failure**

Run: `npx vitest run tests/unit/server/accountModeration.test.js -t "account restoration|moderation transaction rollback"`

Expected: restoration tests FAIL with `404`; rollback test for account update currently returns `500`, while remaining cases establish baseline coverage before restore implementation.

- [ ] **Step 4: Add restore route**

Add before `export default router` in `server/routes/adminModeration.js`:

```js
router.post('/api/admin/users/:id/restore', requireAdmin, async (req, res) => {
    const reason = validateReason(req.body?.reason);
    const expectedVersion = req.body?.expectedModerationVersion;
    if (!reason || !validateVersion(expectedVersion)) {
        return res.status(400).json({ error: 'Invalid restoration request' });
    }

    try {
        const result = await withTransaction(async txQuery => {
            const target = await lockUser(req.params.id, txQuery);
            if (!target) return { status: 404 };
            if (Number(target.moderationVersion) !== expectedVersion || !isBanned(target.banned)) {
                return { status: 409 };
            }
            const now = new Date().toISOString();
            const updated = await txQuery(
                `UPDATE "user"
                 SET banned = $1, "banReason" = NULL, "banExpires" = NULL,
                     "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $2
                 WHERE id = $3 AND "moderationVersion" = $4
                 RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
                [dbType === 'postgres' ? false : 0, now, target.id, expectedVersion],
            );
            if (!updated[0]) return { status: 409 };
            await txQuery('DELETE FROM session WHERE "userId" = $1', [target.id]);
            const action = await insertAction(txQuery, {
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                action: 'account_restored',
                reason,
                expiresAt: null,
                projectId: null,
                createdAt: now,
            });
            return { status: 200, account: accountDto(updated[0]), actions: [action] };
        });
        if (result.status === 404) return res.status(404).json({ error: 'User not found' });
        if (result.status === 409) return res.status(409).json({ error: 'Moderation state changed; refresh and try again' });
        return res.json({ account: result.account, actions: result.actions });
    } catch (error) {
        console.error('Account restoration failed:', error);
        return res.status(500).json({ error: 'Account restoration failed' });
    }
});
```

- [ ] **Step 5: Run complete server moderation suite**

Run: `npx vitest run tests/unit/server/accountModerationMigration.test.js tests/unit/server/accountModeration.test.js`

Expected: PASS. Four injected failures each return `500` and preserve account, all sessions, selected content, and audit rows.

- [ ] **Step 6: Run all server tests**

Run: `npx vitest run tests/unit/server/`

Expected: PASS, including existing standalone admin unpublish behavior and Better Auth tests.

- [ ] **Step 7: Commit**

```bash
git add server/routes/adminModeration.js tests/unit/server/accountModeration.test.js
git commit -m "feat(moderation): restore accounts with audit rollback"
```

---

### Task 5: Typed Client Moderation API

**Files:**
- Modify: `services/cloudApi.ts:27-72,152`
- Modify: `tests/unit/cloudApi.test.ts`

**Interfaces:**
- Consumes: Exact shared HTTP DTO contract and existing private `api<T>()` transport.
- Produces: Exported moderation DTO types plus `searchModerationUsers`, `getModerationUser`, `suspendAccount`, and `restoreAccount` methods. No Better Auth client plugin changes.

- [ ] **Step 1: Add failing serialization tests**

Append to `tests/unit/cloudApi.test.ts`:

```ts
describe('account moderation api methods', () => {
    const okJson = (body: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    afterEach(() => vi.unstubAllGlobals());

    it('serializes bounded search and opaque cursor', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ users: [], nextCursor: null }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.searchModerationUsers('user+tag@test.dev', 'opaque/cursor');
        expect(fetchMock.mock.calls[0][0]).toContain('/api/admin/users?q=user%2Btag%40test.dev&cursor=opaque%2Fcursor');
    });

    it('loads detail with an optional history cursor', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ account: {}, projects: [], history: { items: [], nextCursor: null } }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.getModerationUser('user/1', 'history+cursor');
        expect(fetchMock.mock.calls[0][0]).toContain('/api/admin/users/user%2F1?historyCursor=history%2Bcursor');
    });

    it('posts exact suspend and restore bodies', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ account: {}, actions: [] }));
        vi.stubGlobal('fetch', fetchMock);
        const suspend = {
            reason: 'Confirmed abuse', expiresAt: null,
            projectIdsToUnpublish: ['project-1'], expectedModerationVersion: 3,
        };
        await cloudApi.suspendAccount('user-1', suspend);
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(suspend);
        await cloudApi.restoreAccount('user-1', { reason: 'Appeal accepted', expectedModerationVersion: 4 });
        expect(fetchMock.mock.calls[1][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
            reason: 'Appeal accepted', expectedModerationVersion: 4,
        });
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/cloudApi.test.ts -t "account moderation api methods"`

Expected: FAIL because moderation methods do not exist.

- [ ] **Step 3: Add exact DTOs**

Add these definitions to `services/cloudApi.ts` after `StorageUsage`:

```ts
export type SuspensionStatus = 'none' | 'active' | 'expired';

export interface ModerationUserSearchItem {
    id: string;
    email: string;
    username: string | null;
    role: string | null;
    createdAt: string;
    suspensionStatus: SuspensionStatus;
    banExpires: string | null;
    moderationVersion: number;
}

export interface ModerationAccount extends ModerationUserSearchItem {
    banReason: string | null;
}

export interface ModerationProject {
    id: string;
    name: string;
    publishedAt: string | null;
}

export type ModerationActionType = 'account_suspended' | 'account_restored' | 'project_unpublished';

export interface ModerationAction {
    id: string;
    actorUserId: string;
    actorEmail: string;
    targetUserId: string;
    targetEmail: string;
    action: ModerationActionType;
    reason: string;
    expiresAt: string | null;
    projectId: string | null;
    createdAt: string;
}

export interface ModerationUserDetail {
    account: ModerationAccount;
    projects: ModerationProject[];
    history: { items: ModerationAction[]; nextCursor: string | null };
}

export interface SuspendAccountInput {
    reason: string;
    expiresAt: string | null;
    projectIdsToUnpublish: string[];
    expectedModerationVersion: number;
}

export interface RestoreAccountInput {
    reason: string;
    expectedModerationVersion: number;
}
```

- [ ] **Step 4: Add cloud API methods**

Add these methods to `cloudApi`:

```ts
searchModerationUsers: (q: string, cursor?: string | null) => {
    const params = new URLSearchParams({ q });
    if (cursor) params.set('cursor', cursor);
    return api<{ users: ModerationUserSearchItem[]; nextCursor: string | null }>(`/api/admin/users?${params}`);
},
getModerationUser: (id: string, historyCursor?: string | null) => {
    const params = new URLSearchParams();
    if (historyCursor) params.set('historyCursor', historyCursor);
    const suffix = params.size ? `?${params}` : '';
    return api<ModerationUserDetail>(`/api/admin/users/${encodeURIComponent(id)}${suffix}`);
},
suspendAccount: (id: string, input: SuspendAccountInput) =>
    api<{ account: ModerationAccount; actions: ModerationAction[] }>(
        `/api/admin/users/${encodeURIComponent(id)}/suspend`,
        { method: 'POST', body: JSON.stringify(input) },
    ),
restoreAccount: (id: string, input: RestoreAccountInput) =>
    api<{ account: ModerationAccount; actions: ModerationAction[] }>(
        `/api/admin/users/${encodeURIComponent(id)}/restore`,
        { method: 'POST', body: JSON.stringify(input) },
    ),
```

Do not modify `lib/auth-client.ts`; specifically, do not import or register `adminClient`.

- [ ] **Step 5: Run client API tests**

Run: `npx vitest run tests/unit/cloudApi.test.ts`

Expected: PASS, including existing cloud/gallery serialization tests.

- [ ] **Step 6: Commit**

```bash
git add services/cloudApi.ts tests/unit/cloudApi.test.ts
git commit -m "feat(moderation): add typed client api"
```

---

### Task 6: Admin Moderation Search, Detail, Suspension, And Restore Page

**Files:**
- Create: `pages/AdminModerationPage.tsx`
- Create: `tests/unit/AdminModerationPage.test.tsx`

**Interfaces:**
- Consumes: Four `cloudApi` moderation methods and all DTO types from Task 5.
- Produces: `AdminModerationPage` named export; accessible controls for search, pagination, project selection, duration, reason, confirmation, suspend, restore, and history pagination.

- [ ] **Step 1: Write page tests with representative safe DTOs**

Create `tests/unit/AdminModerationPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminModerationPage } from '../../pages/AdminModerationPage';
import { ApiError } from '../../services/cloudApi';

const api = vi.hoisted(() => ({
    searchModerationUsers: vi.fn(),
    getModerationUser: vi.fn(),
    suspendAccount: vi.fn(),
    restoreAccount: vi.fn(),
}));
vi.mock('../../services/cloudApi', async importOriginal => ({
    ...(await importOriginal()),
    cloudApi: api,
}));

const account = {
    id: 'user-1', email: 'target@test.dev', username: 'target', role: null,
    createdAt: '2026-01-01T00:00:00.000Z', suspensionStatus: 'none' as const,
    banExpires: null, banReason: null, moderationVersion: 3,
};
const detail = {
    account,
    projects: [
        { id: 'project-1', name: 'One', publishedAt: '2026-07-15T00:00:00.000Z' },
        { id: 'project-2', name: 'Two', publishedAt: '2026-07-14T00:00:00.000Z' },
    ],
    history: { items: [], nextCursor: null },
};

const renderPage = () => render(<MemoryRouter><AdminModerationPage /></MemoryRouter>);
const searchAndOpen = async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'target' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('target@test.dev');
    fireEvent.click(screen.getByRole('button', { name: 'Review target@test.dev' }));
    await screen.findByRole('heading', { name: 'target@test.dev' });
};

describe('AdminModerationPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.searchModerationUsers.mockResolvedValue({ users: [account], nextCursor: 'next-search' });
        api.getModerationUser.mockResolvedValue(detail);
        api.suspendAccount.mockResolvedValue({
            account: { ...account, suspensionStatus: 'active', banReason: 'Confirmed abuse', moderationVersion: 4 },
            actions: [],
        });
        api.restoreAccount.mockResolvedValue({
            account: { ...account, moderationVersion: 5 }, actions: [],
        });
    });

    it('requires a query, searches, shows empty results, and paginates with the returned cursor', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(screen.getByText('Enter an email or username.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'target' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await screen.findByText('target@test.dev');
        fireEvent.click(screen.getByRole('button', { name: 'More accounts' }));
        expect(api.searchModerationUsers).toHaveBeenLastCalledWith('target', 'next-search');
        api.searchModerationUsers.mockResolvedValueOnce({ users: [], nextCursor: null });
        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'nobody' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(await screen.findByText('No matching accounts.')).toBeInTheDocument();
    });

    it('loads safe detail, individual project controls, links, and history', async () => {
        api.getModerationUser.mockResolvedValueOnce({
            ...detail,
            history: { items: [{
                id: 'action-1', actorUserId: 'admin-1', actorEmail: 'admin@test.dev',
                targetUserId: 'user-1', targetEmail: 'target@test.dev', action: 'account_suspended',
                reason: 'Prior reason', expiresAt: null, projectId: null, createdAt: '2026-07-15T00:00:00.000Z',
            }], nextCursor: 'next-history' },
        });
        await searchAndOpen();
        expect(screen.getByLabelText('Unpublish One')).not.toBeChecked();
        expect(screen.getByLabelText('Unpublish Two')).not.toBeChecked();
        expect(screen.getByRole('link', { name: 'Review One' })).toHaveAttribute('href', '/gallery/project-1');
        expect(screen.getByText('Prior reason')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'More history' }));
        expect(api.getModerationUser).toHaveBeenLastCalledWith('user-1', 'next-history');
        expect(screen.queryByText(/password|session token|ip address/i)).toBeNull();
    });

    it('shows an account-detail loading state until the selected account resolves', async () => {
        let resolveDetail: (value: typeof detail) => void = () => {};
        api.getModerationUser.mockReturnValueOnce(new Promise(resolve => { resolveDetail = resolve; }));
        renderPage();
        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'target' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await screen.findByText('target@test.dev');
        fireEvent.click(screen.getByRole('button', { name: 'Review target@test.dev' }));
        expect(screen.getByRole('status')).toHaveTextContent('Loading account details…');
        resolveDetail(detail);
        expect(await screen.findByRole('heading', { name: 'target@test.dev' })).toBeInTheDocument();
    });

    it.each([
        ['Indefinite', null],
        ['24 hours', 24],
        ['7 days', 7 * 24],
        ['30 days', 30 * 24],
    ])('builds %s expiry and confirms exact selected projects', async (duration, expectedHours) => {
        await searchAndOpen();
        const now = Date.parse('2026-07-16T12:00:00.000Z');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: duration } });
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByLabelText('Unpublish One'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/Projects: One/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm suspension' }));
        await waitFor(() => expect(api.suspendAccount).toHaveBeenCalledTimes(1));
        const input = api.suspendAccount.mock.calls[0][1];
        expect(input.projectIdsToUnpublish).toEqual(['project-1']);
        expect(input.expectedModerationVersion).toBe(3);
        if (expectedHours === null) expect(input.expiresAt).toBeNull();
        else expect(input.expiresAt).toBe(new Date(now + expectedHours * 3600000).toISOString());
        nowSpy.mockRestore();
    });

    it('validates custom future expiry and reason before opening confirmation', async () => {
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: 'Custom' } });
        fireEvent.change(screen.getByLabelText('Custom expiry'), { target: { value: '2020-01-01T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        expect(screen.getByText('Enter a reason from 1 to 1,000 characters.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        expect(screen.getByText('Custom expiry must be in the future.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Custom expiry'), { target: { value: '2999-01-01T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('submits once, refreshes status/history, and disables duplicate confirmation', async () => {
        let resolveSuspend: (value: unknown) => void = () => {};
        api.suspendAccount.mockReturnValueOnce(new Promise(resolve => { resolveSuspend = resolve; }));
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        const confirm = screen.getByRole('button', { name: 'Confirm suspension' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(api.suspendAccount).toHaveBeenCalledTimes(1);
        expect(confirm).toBeDisabled();
        resolveSuspend({ account: { ...account, suspensionStatus: 'active', moderationVersion: 4 }, actions: [] });
        await waitFor(() => expect(api.getModerationUser).toHaveBeenCalledTimes(2));
    });

    it('retains reason, duration, and selection after recoverable failure and asks refresh on conflict', async () => {
        api.suspendAccount.mockRejectedValueOnce(new ApiError(409, 'Moderation state changed; refresh and try again'));
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: '7 days' } });
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Keep this reason' } });
        fireEvent.click(screen.getByLabelText('Unpublish Two'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm suspension' }));
        expect(await screen.findByText('Account changed. Refresh account details before trying again.')).toBeInTheDocument();
        expect(screen.getByLabelText('Suspension reason')).toHaveValue('Keep this reason');
        expect(screen.getByLabelText('Suspension duration')).toHaveValue('7 days');
        expect(screen.getByLabelText('Unpublish Two')).toBeChecked();
    });

    it('requires a new restore reason, confirms, restores, and refreshes without republish controls', async () => {
        api.getModerationUser.mockResolvedValue({
            ...detail, account: { ...account, suspensionStatus: 'active', banReason: 'Old', moderationVersion: 4 },
        });
        await searchAndOpen();
        fireEvent.click(screen.getByRole('button', { name: 'Review restoration' }));
        expect(screen.getByText('Enter a restoration reason from 1 to 1,000 characters.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Restoration reason'), { target: { value: 'Appeal accepted' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review restoration' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm restoration' }));
        await waitFor(() => expect(api.restoreAccount).toHaveBeenCalledWith('user-1', {
            reason: 'Appeal accepted', expectedModerationVersion: 4,
        }));
        expect(screen.queryByRole('button', { name: /republish/i })).toBeNull();
        await waitFor(() => expect(api.getModerationUser).toHaveBeenCalledTimes(2));
    });
});
```

- [ ] **Step 2: Run page tests to verify failure**

Run: `npx vitest run tests/unit/AdminModerationPage.test.tsx`

Expected: FAIL because `pages/AdminModerationPage.tsx` does not exist.

- [ ] **Step 3: Implement page state and exact transitions**

Create `pages/AdminModerationPage.tsx`. Keep all page-specific logic in this file; use these exact state transitions and helpers:

```tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ApiError, cloudApi, ModerationAction, ModerationUserDetail,
    ModerationUserSearchItem, SuspensionStatus,
} from '../services/cloudApi';
import { AppHeader } from '../components/AppHeader';

const durations = ['Indefinite', '24 hours', '7 days', '30 days', 'Custom'] as const;
type Duration = typeof durations[number];

const expiryFor = (duration: Duration, custom: string): string | null | undefined => {
    if (duration === 'Indefinite') return null;
    if (duration === 'Custom') {
        const timestamp = Date.parse(custom);
        return Number.isFinite(timestamp) && timestamp > Date.now() ? new Date(timestamp).toISOString() : undefined;
    }
    const hours = duration === '24 hours' ? 24 : duration === '7 days' ? 168 : 720;
    return new Date(Date.now() + hours * 3600000).toISOString();
};

const statusLabel = (status: SuspensionStatus) =>
    status === 'active' ? 'Active suspension' : status === 'expired' ? 'Expired suspension' : 'Not suspended';

const errorMessage = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
        return 'Account changed. Refresh account details before trying again.';
    }
    return error instanceof Error ? error.message : 'Request failed';
};

export function AdminModerationPage() {
    const [query, setQuery] = useState('');
    const [users, setUsers] = useState<ModerationUserSearchItem[]>([]);
    const [searchCursor, setSearchCursor] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [detail, setDetail] = useState<ModerationUserDetail | null>(null);
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState<Duration>('Indefinite');
    const [customExpiry, setCustomExpiry] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [restoreReason, setRestoreReason] = useState('');
    const [confirming, setConfirming] = useState<'suspend' | 'restore' | null>(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState<'search' | 'detail' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const search = async (cursor: string | null = null) => {
        const trimmed = query.trim();
        if (!trimmed) { setError('Enter an email or username.'); return; }
        setError(null);
        setLoading('search');
        try {
            const result = await cloudApi.searchModerationUsers(trimmed, cursor);
            setUsers(current => cursor ? [...current, ...result.users] : result.users);
            setSearchCursor(result.nextCursor);
            setSearched(true);
        } catch (requestError) { setError(errorMessage(requestError)); }
        finally { setLoading(null); }
    };

    const loadDetail = async (id: string, historyCursor: string | null = null) => {
        setError(null);
        setLoading('detail');
        try {
            const result = await cloudApi.getModerationUser(id, historyCursor);
            setDetail(current => historyCursor && current ? {
                ...result,
                history: { items: [...current.history.items, ...result.history.items], nextCursor: result.history.nextCursor },
            } : result);
            if (!historyCursor) setSelected([]);
        } catch (requestError) { setError(errorMessage(requestError)); }
        finally { setLoading(null); }
    };

    const reviewSuspend = () => {
        const trimmed = reason.trim();
        if (!trimmed || trimmed.length > 1000) { setError('Enter a reason from 1 to 1,000 characters.'); return; }
        if (expiryFor(duration, customExpiry) === undefined) { setError('Custom expiry must be in the future.'); return; }
        setError(null);
        setConfirming('suspend');
    };

    const reviewRestore = () => {
        const trimmed = restoreReason.trim();
        if (!trimmed || trimmed.length > 1000) { setError('Enter a restoration reason from 1 to 1,000 characters.'); return; }
        setError(null);
        setConfirming('restore');
    };

    const submit = async () => {
        if (!detail || !confirming || busy) return;
        setBusy(true);
        setError(null);
        try {
            if (confirming === 'suspend') {
                await cloudApi.suspendAccount(detail.account.id, {
                    reason: reason.trim(),
                    expiresAt: expiryFor(duration, customExpiry) as string | null,
                    projectIdsToUnpublish: selected,
                    expectedModerationVersion: detail.account.moderationVersion,
                });
            } else {
                await cloudApi.restoreAccount(detail.account.id, {
                    reason: restoreReason.trim(),
                    expectedModerationVersion: detail.account.moderationVersion,
                });
            }
            setConfirming(null);
            await loadDetail(detail.account.id);
            if (confirming === 'suspend') { setReason(''); setSelected([]); }
            else setRestoreReason('');
        } catch (requestError) {
            setConfirming(null);
            setError(errorMessage(requestError));
        } finally { setBusy(false); }
    };

    const toggleProject = (id: string) => setSelected(current =>
        current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

    return (
        <div className="min-h-screen overflow-y-auto bg-slate-50 text-slate-900">
        <AppHeader />
        <main className="p-4 md:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <header><p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Administration</p><h1 className="text-3xl font-bold">Account moderation</h1></header>
                <form onSubmit={event => { event.preventDefault(); void search(); }} className="flex flex-col gap-2 sm:flex-row">
                    <label className="flex-1 text-sm font-medium">Search accounts
                        <input aria-label="Search accounts" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                    </label>
                    <button className="self-end rounded bg-slate-900 px-4 py-2 text-white" type="submit">Search</button>
                </form>
                {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {loading === 'search' && <p role="status">Loading accounts…</p>}
                {loading === 'detail' && <p role="status">Loading account details…</p>}
                <section className="grid gap-3 md:grid-cols-2">
                    {users.map(user => <article key={user.id} className="rounded border bg-white p-4">
                        <strong>{user.email}</strong><p className="text-sm text-slate-600">{user.username || 'No username'} · {statusLabel(user.suspensionStatus)}</p>
                        <button onClick={() => void loadDetail(user.id)} aria-label={`Review ${user.email}`} className="mt-2 text-sm font-semibold text-blue-700">Review account</button>
                    </article>)}
                    {searched && users.length === 0 && <p>No matching accounts.</p>}
                </section>
                {searchCursor && <button onClick={() => void search(searchCursor)} className="text-sm font-semibold text-blue-700">More accounts</button>}

                {detail && <section className="space-y-6 rounded-xl border bg-white p-4 md:p-6">
                    <div><h2 className="text-2xl font-bold">{detail.account.email}</h2><p>{detail.account.username || 'No username'} · {detail.account.role || 'user'} · {statusLabel(detail.account.suspensionStatus)}</p>{detail.account.banExpires && <p>Expiry: {new Date(detail.account.banExpires).toLocaleString()}</p>}</div>
                    {detail.account.suspensionStatus !== 'active' ? <>
                        <label className="block text-sm font-medium">Suspension duration
                            <select aria-label="Suspension duration" value={duration} onChange={event => setDuration(event.target.value as Duration)} className="mt-1 block rounded border px-3 py-2">{durations.map(item => <option key={item}>{item}</option>)}</select>
                        </label>
                        {duration === 'Custom' && <label className="block text-sm font-medium">Custom expiry<input aria-label="Custom expiry" type="datetime-local" value={customExpiry} onChange={event => setCustomExpiry(event.target.value)} className="mt-1 block rounded border px-3 py-2" /></label>}
                        <label className="block text-sm font-medium">Reason<textarea aria-label="Suspension reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="mt-1 block min-h-24 w-full rounded border px-3 py-2" /></label>
                        <fieldset><legend className="font-semibold">Published projects to unpublish</legend>{detail.projects.map(project => <div key={project.id} className="flex items-center justify-between border-b py-2"><label><input type="checkbox" aria-label={`Unpublish ${project.name}`} checked={selected.includes(project.id)} onChange={() => toggleProject(project.id)} /> <span>{project.name}</span></label><Link aria-label={`Review ${project.name}`} to={`/gallery/${project.id}`} target="_blank" rel="noreferrer" className="text-blue-700">Review</Link></div>)}</fieldset>
                        <button onClick={reviewSuspend} className="rounded bg-red-700 px-4 py-2 text-white">Review suspension</button>
                    </> : <>
                        <label className="block text-sm font-medium">Restoration reason<textarea aria-label="Restoration reason" value={restoreReason} onChange={event => setRestoreReason(event.target.value)} maxLength={1000} className="mt-1 block min-h-24 w-full rounded border px-3 py-2" /></label>
                        <button onClick={reviewRestore} className="rounded bg-emerald-700 px-4 py-2 text-white">Review restoration</button>
                    </>}
                    <div><h3 className="text-lg font-bold">Moderation history</h3>{detail.history.items.length === 0 ? <p>No moderation actions.</p> : <ul>{detail.history.items.map((action: ModerationAction) => <li key={action.id} className="border-b py-3"><strong>{action.action.replaceAll('_', ' ')}</strong><p>{action.reason}</p><small>{action.actorEmail} · {new Date(action.createdAt).toLocaleString()}{action.projectId ? ` · project ${action.projectId}` : ''}</small></li>)}</ul>}{detail.history.nextCursor && <button onClick={() => void loadDetail(detail.account.id, detail.history.nextCursor)} className="mt-2 text-sm font-semibold text-blue-700">More history</button>}</div>
                </section>}

                {confirming && detail && <div role="dialog" aria-modal="true" className="fixed inset-0 grid place-items-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-6"><h2 className="text-xl font-bold">Confirm {confirming === 'suspend' ? 'suspension' : 'restoration'}</h2><p>Account: {detail.account.email}</p>{confirming === 'suspend' && <><p>Duration: {duration === 'Custom' ? `Until ${customExpiry}` : duration}</p><p>Projects: {selected.length ? detail.projects.filter(project => selected.includes(project.id)).map(project => project.name).join(', ') : 'None'}</p></>}<div className="mt-4 flex gap-2"><button onClick={() => setConfirming(null)} disabled={busy} className="rounded border px-3 py-2">Cancel</button><button onClick={() => void submit()} disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-white">{busy ? 'Submitting…' : confirming === 'suspend' ? 'Confirm suspension' : 'Confirm restoration'}</button></div></div></div>}
            </div>
        </main>
        </div>
    );
}
```

This markup intentionally renders no credential, OAuth, token, session, or IP fields. It preserves form state on API failure, clears it only after success, and reloads account/history after each mutation. An expired suspension is not active, so the page permits applying a new suspension directly; restoration UI is shown for active suspensions.

- [ ] **Step 4: Run page tests**

Run: `npx vitest run tests/unit/AdminModerationPage.test.tsx`

Expected: PASS for search, empty state, both cursors, presets/custom validation, exact selection summary, duplicate-submit lock, conflict retention, success refresh, and restoration.

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: exactly the five pre-existing diagnostics listed in Global Constraints; no new diagnostics and none in moderation files.

- [ ] **Step 6: Commit**

```bash
git add pages/AdminModerationPage.tsx tests/unit/AdminModerationPage.test.tsx
git commit -m "feat(moderation): add admin workflow page"
```

---

### Task 7: Admin Route Guard And Role-Gated Account Menu Link

**Files:**
- Modify: `App.tsx:4-20,46-78,96-116`
- Modify: `components/AccountMenu.tsx:2-4,36-45`
- Create: `tests/unit/adminModerationRouting.test.tsx`
- Modify: `tests/unit/AccountMenu.test.tsx`

**Interfaces:**
- Consumes: `useSession()` where `session.user.role` is authoritative only for client usability; server `requireAdmin` remains authoritative authorization.
- Produces: Exported `AdminGuard`, route `/admin/moderation`, and admin-only `Moderation` menu link.

- [ ] **Step 1: Add failing guard and route tests**

Create `tests/unit/adminModerationRouting.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App, { AdminGuard } from '../../App';

const sessionState = vi.hoisted(() => ({ value: { data: null as any, isPending: false } }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => sessionState.value,
    signOut: vi.fn(), signIn: {}, signUp: {}, authClient: {},
}));
vi.mock('../../pages/AdminModerationPage', () => ({
    AdminModerationPage: () => <div>MODERATION_PAGE_MARKER</div>,
}));

describe('AdminGuard', () => {
    beforeEach(() => { sessionState.value = { data: null, isPending: false }; });

    it('shows loading state while session resolves', () => {
        sessionState.value = { data: null, isPending: true };
        render(<MemoryRouter><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.getByLabelText('Loading session')).toBeInTheDocument();
    });

    it('redirects signed-out users to login', () => {
        render(<MemoryRouter initialEntries={['/admin/moderation']}><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.queryByText('SECRET')).toBeNull();
    });

    it('shows access denied to a signed-in non-admin', () => {
        sessionState.value = { data: { user: { role: null } }, isPending: false };
        render(<MemoryRouter><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.getByText('Access denied. Administrators only.')).toBeInTheDocument();
    });

    it('renders children for an admin', () => {
        sessionState.value = { data: { user: { role: 'admin' } }, isPending: false };
        render(<MemoryRouter><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.getByText('SECRET')).toBeInTheDocument();
    });

    it('wires /admin/moderation through AdminGuard', () => {
        sessionState.value = { data: { user: { role: 'admin' } }, isPending: false };
        window.history.pushState({}, '', '/admin/moderation');
        render(<App />);
        expect(screen.getByText('MODERATION_PAGE_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Add failing role-link tests**

Append to `tests/unit/AccountMenu.test.tsx`:

```tsx
it('shows Moderation only for administrators', () => {
    mockUseSession.mockReturnValue({
        data: { user: { username: 'admin_user', name: 'Admin', role: 'admin' } }, isPending: false,
    });
    renderAt(['/gallery']);
    fireEvent.click(screen.getByTitle('Account'));
    expect(screen.getByText('Moderation').closest('a')).toHaveAttribute('href', '/admin/moderation');
});

it('does not show Moderation to an ordinary signed-in user', () => {
    mockUseSession.mockReturnValue({
        data: { user: { username: 'ordinary', name: 'Ordinary', role: null } }, isPending: false,
    });
    renderAt(['/gallery']);
    fireEvent.click(screen.getByTitle('Account'));
    expect(screen.queryByText('Moderation')).toBeNull();
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx`

Expected: FAIL because `AdminGuard`, route, and menu link do not exist.

- [ ] **Step 4: Add AdminGuard and route**

In `App.tsx`, import `AdminModerationPage`, add route, and replace the old commented admin suggestion with an exported guard:

```tsx
import { AdminModerationPage } from './pages/AdminModerationPage';

// Inside Routes:
<Route
  path="/admin/moderation"
  element={
    <AdminGuard>
      <AdminModerationPage />
    </AdminGuard>
  }
/>

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  if (isPending) return <div aria-label="Loading session" className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} />;
  const role = (session.user as { role?: string | null }).role;
  if (role !== 'admin') return <div className="p-8 text-center text-red-700">Access denied. Administrators only.</div>;
  return <>{children}</>;
}
```

Leave `AuthGuard` behavior unchanged for non-admin routes.

- [ ] **Step 5: Add role-gated menu entry**

In `components/AccountMenu.tsx`, import `Shield` from `lucide-react`, derive role beside the existing username cast, and insert the link before Account settings:

```tsx
const role = (session.user as { role?: string | null }).role;

{role === 'admin' && (
    <Link to="/admin/moderation" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
        <Shield size={12} /> Moderation
    </Link>
)}
```

- [ ] **Step 6: Run route/menu and page tests**

Run: `npx vitest run tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx tests/unit/AdminModerationPage.test.tsx`

Expected: PASS. Non-admin UI denial does not replace server-side `requireAdmin` tests from Task 2.

- [ ] **Step 7: Commit**

```bash
git add App.tsx components/AccountMenu.tsx tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx
git commit -m "feat(moderation): gate admin route and navigation"
```

---

### Task 8: End-To-End Administrator Workflow

**Files:**
- Create: `tests/e2e/account_moderation.spec.js`

**Interfaces:**
- Consumes: Real Better Auth sessions, direct fixture setup through `page.request`/`query`, `/admin/moderation` UI, public gallery routes.
- Produces: Browser proof of selected-only unpublish, immediate existing-session rejection, active sign-in denial, restoration, successful fresh sign-in, and visible immutable history.

- [ ] **Step 1: Write failing E2E test**

Create `tests/e2e/account_moderation.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { apiSignUpAndVerify, TEST_PASSWORD } from './helpers.js';
import { query } from '../../server/db.js';

const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';
const unique = Date.now();
const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default', schemaVersion: 7,
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('admin suspends selected content, revokes access, restores, and sees immutable history', async ({ browser }) => {
    test.setTimeout(120000);
    const targetEmail = `moderation-target-${unique}@test.dev`;
    const adminEmail = `moderation-admin-${unique}@test.dev`;

    const targetContext = await browser.newContext();
    await apiSignUpAndVerify(targetContext.request, API_BASE, {
        email: targetEmail, password: TEST_PASSWORD, name: 'Moderation Target', username: `target_${unique}`,
    });
    const createProject = async name => {
        const created = await targetContext.request.post(`${API_BASE}/api/projects`, { data: { name, state } });
        expect(created.ok()).toBeTruthy();
        const project = (await created.json()).project;
        const published = await targetContext.request.post(`${API_BASE}/api/projects/${project.id}/publish`, {
            headers: { 'If-Match': `"${project.headCommitId}"` },
            data: { description: name, tags: [], thumbnails: [PNG] },
        });
        expect(published.ok()).toBeTruthy();
        return project.id;
    };
    const selectedId = await createProject(`Selected ${unique}`);
    const untouchedId = await createProject(`Untouched ${unique}`);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await apiSignUpAndVerify(adminPage.request, API_BASE, {
        email: adminEmail, password: TEST_PASSWORD, name: 'Moderation Admin', username: `admin_${unique}`,
    });
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [adminEmail]);

    await adminPage.goto('/admin/moderation');
    await adminPage.getByLabel('Search accounts').fill(targetEmail);
    await adminPage.getByRole('button', { name: 'Search' }).click();
    await adminPage.getByRole('button', { name: `Review ${targetEmail}` }).click();
    await expect(adminPage.getByRole('heading', { name: targetEmail })).toBeVisible();
    await adminPage.getByLabel(`Unpublish Selected ${unique}`).check();
    await adminPage.getByLabel('Suspension reason').fill('E2E confirmed abuse');
    await adminPage.getByRole('button', { name: 'Review suspension' }).click();
    await expect(adminPage.getByRole('dialog').getByText(/Projects: Selected/)).toBeVisible();
    await adminPage.getByRole('button', { name: 'Confirm suspension' }).click();
    await expect(adminPage.getByText('Active suspension')).toBeVisible();

    const revoked = await targetContext.request.get(`${API_BASE}/api/projects`);
    expect(revoked.status()).toBe(401);
    const blockedContext = await browser.newContext();
    const blocked = await blockedContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
        data: { email: targetEmail, password: TEST_PASSWORD },
    });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe('BANNED_USER');
    expect((await adminContext.request.get(`${API_BASE}/api/gallery/${selectedId}`)).status()).toBe(404);
    expect((await adminContext.request.get(`${API_BASE}/api/gallery/${untouchedId}`)).status()).toBe(200);

    await adminPage.getByLabel('Restoration reason').fill('E2E appeal accepted');
    await adminPage.getByRole('button', { name: 'Review restoration' }).click();
    await adminPage.getByRole('button', { name: 'Confirm restoration' }).click();
    await expect(adminPage.getByText('Not suspended')).toBeVisible();
    const restored = await blockedContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
        data: { email: targetEmail, password: TEST_PASSWORD },
    });
    expect(restored.status()).toBe(200);
    expect((await adminContext.request.get(`${API_BASE}/api/gallery/${selectedId}`)).status()).toBe(404);
    await expect(adminPage.getByText('E2E confirmed abuse')).toBeVisible();
    await expect(adminPage.getByText('E2E appeal accepted')).toBeVisible();
    await expect(adminPage.getByText(`project ${selectedId}`)).toBeVisible();

    const audit = await query('SELECT action, reason, project_id FROM moderation_actions WHERE target_email = $1 ORDER BY created_at, action', [targetEmail]);
    expect(audit).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'account_suspended', reason: 'E2E confirmed abuse', project_id: null }),
        expect.objectContaining({ action: 'project_unpublished', reason: 'E2E confirmed abuse', project_id: selectedId }),
        expect.objectContaining({ action: 'account_restored', reason: 'E2E appeal accepted', project_id: null }),
    ]));

    await targetContext.close();
    await blockedContext.close();
    await adminContext.close();
});
```

- [ ] **Step 2: Run Chromium E2E test**

Run: `npx playwright test tests/e2e/account_moderation.spec.js --project=chromium`

Expected before implementation tasks are complete: FAIL at `/admin/moderation`. Expected after Tasks 1-7: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/account_moderation.spec.js
git commit -m "test(moderation): cover full admin workflow"
```

---

### Task 9: Operations Documentation And Final Verification

**Files:**
- Modify: `docs/8-cloud-and-gallery.md`

**Interfaces:**
- Consumes: Final API/status/expiry/audit behavior from Tasks 1-8.
- Produces: Operator-facing suspension, restoration, audit lookup, selected-content, and IP-control guidance.

- [ ] **Step 1: Add moderation API rows**

Add these rows to `docs/8-cloud-and-gallery.md`'s API table after existing admin routes:

```markdown
| `GET /api/admin/users?q=&cursor=` | admin | Search accounts by email/username; safe bounded DTOs only |
| `GET /api/admin/users/:id?historyCursor=` | admin | Account suspension state, published projects, and moderation history |
| `POST /api/admin/users/:id/suspend` | admin | Suspend, revoke sessions, optionally unpublish selected projects, and audit atomically |
| `POST /api/admin/users/:id/restore` | admin | Clear suspension, defensively revoke sessions, and audit atomically |
```

- [ ] **Step 2: Add operations section**

Add this section before `## Known Limitations / Follow-ups`:

```markdown
## Account moderation operations

Administrators use `/admin/moderation` to search by email or username; there is no unfiltered account directory. Search/detail responses contain identity, role, creation time, suspension state, published-project metadata, and moderation history only. They never include passwords, provider tokens, session tokens, or session IP addresses.

Suspension requires a reason of 1–1,000 characters and may be indefinite or expire at a future time. Active means `banned = true` and either no expiry or an expiry later than current server time. Every target session is deleted in the same transaction, so existing cookies stop authorizing immediately; Better Auth rejects fresh sign-in with `BANNED_USER` while suspension is active. Once a temporary expiry passes, Better Auth permits fresh sign-in even though the historical suspension fields and audit events remain available to administrators.

The suspension form lists currently published projects owned by the target. Only checked projects become private and lose `published_commit_id`; unchecked projects remain public. Suspension never automatically removes all account content. Restoration clears suspension fields and revokes any sessions defensively, but never republishes content.

Every suspension and restoration creates a row in `moderation_actions`; each selected unpublish creates its own row with `project_id`. Rows snapshot actor/target IDs and emails, reason, expiry, and server timestamp. PostgreSQL and SQLite reject direct updates/deletes through database triggers. Operators can inspect one account's history in `/admin/moderation` or query `moderation_actions` by `target_user_id`/`target_email`, ordered by `created_at DESC`; no application endpoint mutates audit history.

Administrator accounts cannot be suspended through this workflow. Role changes remain an operator action. Application-level IP blocking is intentionally absent: VPNs, shared networks, carrier NAT, IPv6 rotation, and incorrect proxy trust make it easy to evade or cause collateral blocking. If evidence later requires IP controls, apply short-lived CDN/WAF/load-balancer rules only after verifying ingress isolation and trusted proxy configuration; horizontally scaled enforcement needs a shared edge or distributed store.
```

- [ ] **Step 3: Run placeholder and sensitive-field scans**

Run: `rg -n "adminClient" server/routes/adminModeration.js pages/AdminModerationPage.tsx services/cloudApi.ts docs/8-cloud-and-gallery.md`

Expected: no output. `adminClient` must not appear in source/docs.

Run: `rg -n "ipAddress|accessToken|refreshToken|idToken|password|session token" server/routes/adminModeration.js pages/AdminModerationPage.tsx`

Expected: no output.

- [ ] **Step 4: Run focused feature verification**

Run: `npx vitest run tests/unit/server/accountModerationMigration.test.js tests/unit/server/accountModeration.test.js tests/unit/cloudApi.test.ts tests/unit/AdminModerationPage.test.tsx tests/unit/adminModerationRouting.test.tsx tests/unit/AccountMenu.test.tsx`

Expected: all listed test files PASS.

- [ ] **Step 5: Run all unit tests**

Run: `npx vitest run`

Expected: all unit tests PASS with no unhandled errors.

- [ ] **Step 6: Run static type and production build checks**

Run: `npx tsc --noEmit`

Expected: exactly the five pre-existing diagnostics listed in Global Constraints; no new diagnostics and none in moderation files.

Run: `npm run build`

Expected: Vite exits `0` and writes production assets to `dist/`.

- [ ] **Step 7: Run complete browser workflow**

Run: `npx playwright test tests/e2e/account_moderation.spec.js --project=chromium`

Expected: PASS (1 test), proving existing-session rejection, active fresh-sign-in block, selected-only unpublish, restoration sign-in, non-republication, and three audit events.

- [ ] **Step 8: Commit documentation**

```bash
git add docs/8-cloud-and-gallery.md
git commit -m "docs(moderation): document account operations"
```

- [ ] **Step 9: Inspect final scope**

Run: `git status --short`

Expected: no uncommitted moderation files; unrelated entries that predated execution may remain.

Run: `git log --oneline -9`

Expected: moderation commits for schema, safe reads, suspension, restoration/rollback, typed API, page, route/navigation, E2E, and operations docs.
