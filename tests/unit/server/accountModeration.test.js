// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

const faults = vi.hoisted(() => ({
    pattern: null,
    afterQueryPattern: null,
    afterQuery: null,
    decodeModerationDates: false,
    historyQueries: 0,
}));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (faults.pattern?.test(text)) {
            faults.pattern = null;
            throw new Error('Injected moderation failure');
        }
        if (/FROM platform_audit_actions/.test(text)) faults.historyQueries += 1;
        const rows = await baseQuery(text, params);
        if (faults.afterQueryPattern?.test(text)) {
            faults.afterQueryPattern = null;
            faults.afterQuery?.();
        }
        if (faults.decodeModerationDates && /FROM platform_audit_actions/.test(text)) {
            return rows.map(row => ({ ...row, created_at: new Date(row.created_at) }));
        }
        return rows;
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
let ownerCookie;
let ordinaryCookie;
let targetId;
let hierarchyUserTargetId;
let adminTargetId;
let ownerTargetId;
let unknownRoleTargetId;

beforeAll(async () => {
    app = await initTestApp();
    adminCookie = await signUpUser(app, { email: 'moderator@test.dev', username: 'moderator' });
    ownerCookie = await signUpUser(app, { email: 'platform-owner@test.dev', username: 'platform_owner' });
    ordinaryCookie = await signUpUser(app, { email: 'ordinary@test.dev', username: 'ordinary' });
    await signUpUser(app, { email: 'target@test.dev', username: 'target_user' });
    await signUpUser(app, { email: 'hierarchy-user@test.dev', username: 'hierarchy_user' });
    await signUpUser(app, { email: 'protected-admin@test.dev', username: 'protected_admin' });
    await signUpUser(app, { email: 'protected-owner@test.dev', username: 'protected_owner' });
    await signUpUser(app, { email: 'unknown-role@test.dev', username: 'unknown_role' });
    const { query } = await import('../../../server/db.js');
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['moderator@test.dev']);
    await query(`UPDATE "user" SET role = 'owner' WHERE email = $1`, ['platform-owner@test.dev']);
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['protected-admin@test.dev']);
    await query(`UPDATE "user" SET role = 'owner' WHERE email = $1`, ['protected-owner@test.dev']);
    await query(`UPDATE "user" SET role = 'moderator' WHERE email = $1`, ['unknown-role@test.dev']);
    targetId = (await query('SELECT id FROM "user" WHERE email = $1', ['target@test.dev']))[0].id;
    hierarchyUserTargetId = (await query('SELECT id FROM "user" WHERE email = $1', ['hierarchy-user@test.dev']))[0].id;
    adminTargetId = (await query('SELECT id FROM "user" WHERE email = $1', ['protected-admin@test.dev']))[0].id;
    ownerTargetId = (await query('SELECT id FROM "user" WHERE email = $1', ['protected-owner@test.dev']))[0].id;
    unknownRoleTargetId = (await query('SELECT id FROM "user" WHERE email = $1', ['unknown-role@test.dev']))[0].id;
});

const encodeTestCursor = values => Buffer.from(JSON.stringify(values)).toString('base64url');
const decodeTestCursor = raw => JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

beforeEach(() => {
    process.env.OWNER_EMAILS = 'platform-owner@test.dev';
    faults.pattern = null;
    faults.afterQueryPattern = null;
    faults.afterQuery = null;
    faults.decodeModerationDates = false;
    faults.historyQueries = 0;
});

const rawHttpRequest = async (path, { method = 'POST', cookie, body } = {}) => {
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const address = server.address();
    const payload = body === undefined ? null : JSON.stringify(body);
    try {
        return await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: address.port,
                method,
                path,
                headers: {
                    ...(cookie ? { Cookie: cookie } : {}),
                    ...(payload ? {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                    } : {}),
                },
            }, res => {
                let raw = '';
                res.setEncoding('utf8');
                res.on('data', chunk => { raw += chunk; });
                res.on('end', () => resolve({
                    status: res.statusCode,
                    body: raw ? JSON.parse(raw) : null,
                }));
            });
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
};

describe('account moderation authorization and reads', () => {
    it.each([
        '/api/admin/users?q=target',
        '/api/admin/users/not-a-user',
    ])('rejects an anonymous request for GET %s', async path => {
        expect((await request(app).get(path)).status).toBe(401);
    });

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
        expect((await request(app).get(`/api/admin/users?q=${'x'.repeat(101)}`).set('Cookie', adminCookie)).status).toBe(400);
        expect((await request(app).get('/api/admin/users?q=target&cursor=broken').set('Cookie', adminCookie)).status).toBe(400);
        const wildcard = await request(app).get('/api/admin/users?q=%25').set('Cookie', adminCookie);
        expect(wildcard.status).toBe(200);
        expect(wildcard.body.users).toEqual([]);
    });

    it('rejects a noncanonical cursor', async () => {
        const searchCursor = encodeTestCursor(['target@test.dev', targetId]);
        expect((await request(app)
            .get(`/api/admin/users?q=target&cursor=${encodeURIComponent(`${searchCursor}=`)}`)
            .set('Cookie', adminCookie)).status).toBe(400);
    });

    it.each([
        ['admin', 'admin', 'suspend'],
        ['admin', 'admin', 'restore'],
        ['admin', 'owner', 'suspend'],
        ['admin', 'owner', 'restore'],
        ['owner', 'owner', 'suspend'],
        ['owner', 'owner', 'restore'],
    ])('rejects %s actor against %s target via %s before state/version validation', async (actor, targetRole, action) => {
        const target = targetRole === 'admin' ? adminTargetId : ownerTargetId;
        const body = action === 'suspend'
            ? { reason: 'Hierarchy check', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: 999 }
            : { reason: 'Hierarchy check', expectedModerationVersion: 999 };
        const res = await request(app).post(`/api/admin/users/${target}/${action}`)
            .set('Cookie', actor === 'admin' ? adminCookie : ownerCookie)
            .send(body);

        expect({ status: res.status, body: res.body }).toEqual({
            status: 403,
            body: { error: 'Target is protected by role hierarchy' },
        });
    });

    it.each([
        ['user', 'suspend'],
        ['user', 'restore'],
        ['admin', 'suspend'],
        ['admin', 'restore'],
    ])('allows an owner against %s target via %s', async (targetRole, action) => {
        const { query } = await import('../../../server/db.js');
        const target = targetRole === 'admin' ? adminTargetId : hierarchyUserTargetId;
        await query(`UPDATE "user"
            SET banned = $1, "banReason" = $2, "banExpires" = NULL, "moderationVersion" = 0
            WHERE id = $3`, [action === 'restore' ? 1 : 0, action === 'restore' ? 'Existing suspension' : null, target]);
        const body = action === 'suspend'
            ? { reason: 'Owner moderation', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: 0 }
            : { reason: 'Owner moderation', expectedModerationVersion: 0 };

        const res = await request(app).post(`/api/admin/users/${target}/${action}`)
            .set('Cookie', ownerCookie)
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body.account.moderationVersion).toBe(1);
    });

    it('revokes stored-owner suspend and restore authority immediately after configuration removal', async () => {
        process.env.OWNER_EMAILS = '';
        const attempts = [
            [hierarchyUserTargetId, 'suspend', {
                reason: 'Removed owner user suspension', expiresAt: null,
                projectIdsToUnpublish: [], expectedModerationVersion: 0,
            }],
            [hierarchyUserTargetId, 'restore', {
                reason: 'Removed owner user restoration', expectedModerationVersion: 0,
            }],
            [adminTargetId, 'suspend', {
                reason: 'Removed owner admin suspension', expiresAt: null,
                projectIdsToUnpublish: [], expectedModerationVersion: 0,
            }],
            [adminTargetId, 'restore', {
                reason: 'Removed owner admin restoration', expectedModerationVersion: 0,
            }],
        ];

        for (const [id, action, body] of attempts) {
            const res = await request(app).post(`/api/admin/users/${id}/${action}`)
                .set('Cookie', ownerCookie).send(body);
            expect(res.status).toBe(403);
        }

        const protectedOwner = await request(app).post(`/api/admin/users/${ownerTargetId}/suspend`)
            .set('Cookie', adminCookie)
            .send({
                reason: 'Stored owner remains protected', expiresAt: null,
                projectIdsToUnpublish: [], expectedModerationVersion: 0,
            });
        expect(protectedOwner.status).toBe(403);
        expect(protectedOwner.body).toEqual({ error: 'Target is protected by role hierarchy' });
    });

    it('rejects a crafted admin restoration of a suspended admin', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user"
            SET banned = 1, "banReason" = 'Direct suspension', "banExpires" = NULL, "moderationVersion" = 7
            WHERE id = $1`, [adminTargetId]);

        const res = await request(app).post(`/api/admin/users/${adminTargetId}/restore`)
            .set('Cookie', adminCookie)
            .send({ reason: 'Crafted restoration', expectedModerationVersion: 7 });

        expect({ status: res.status, body: res.body }).toEqual({
            status: 403,
            body: { error: 'Target is protected by role hierarchy' },
        });
    });

    it('treats an unknown stored target role as user for moderation and DTOs', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user"
            SET role = 'moderator', banned = 0, "banReason" = NULL, "banExpires" = NULL, "moderationVersion" = 0
            WHERE id = $1`, [unknownRoleTargetId]);

        const res = await request(app).post(`/api/admin/users/${unknownRoleTargetId}/suspend`)
            .set('Cookie', adminCookie)
            .send({ reason: 'Unknown role policy', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: 0 });

        expect(res.status).toBe(200);
        expect(res.body.account.role).toBe('user');
    });

    it('rejects an oversized cursor', async () => {
        const oversizedCursor = encodeTestCursor(['target@test.dev', 'x'.repeat(600)]);
        expect((await request(app)
            .get(`/api/admin/users?q=target&cursor=${encodeURIComponent(oversizedCursor)}`)
            .set('Cookie', adminCookie)).status).toBe(400);
    });

    it('rejects a history cursor with an invalid timestamp', async () => {
        const invalidHistoryCursor = encodeTestCursor(['not-a-timestamp', 'history-id']);
        expect((await request(app)
            .get(`/api/admin/users/${targetId}?historyCursor=${encodeURIComponent(invalidHistoryCursor)}`)
            .set('Cookie', adminCookie)).status).toBe(400);
    });

    it('rejects a numeric-zone history cursor before querying history', async () => {
        const invalidHistoryCursor = encodeTestCursor(['2026-06-01T00:00:00+16:00', 'history-id']);
        const res = await request(app)
            .get(`/api/admin/users/${targetId}?historyCursor=${encodeURIComponent(invalidHistoryCursor)}`)
            .set('Cookie', adminCookie);

        expect({ status: res.status, historyQueries: faults.historyQueries }).toEqual({
            status: 400,
            historyQueries: 0,
        });
    });

    it('treats underscore and backslash as literal LIKE characters', async () => {
        const { query } = await import('../../../server/db.js');
        for (const [id, email, username] of [
            ['literal-underscore', 'literal-underscore@test.dev', 'literal_value'],
            ['literal-control', 'literal-control@test.dev', 'literalXvalue'],
            ['literal-backslash', 'literal-backslash@test.dev', 'literal\\value'],
        ]) {
            await query(`INSERT INTO "user"
                (id, name, email, "emailVerified", "createdAt", "updatedAt", username, banned)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, username, email, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', username, 0]);
        }

        const underscore = await request(app).get('/api/admin/users').query({ q: 'literal_' }).set('Cookie', adminCookie);
        const backslash = await request(app).get('/api/admin/users').query({ q: '\\' }).set('Cookie', adminCookie);

        expect(underscore.body.users.map(user => user.id)).toEqual(['literal-underscore']);
        expect(backslash.body.users.map(user => user.id)).toEqual(['literal-backslash']);
    });

    it('reports none, active, and expired suspension statuses', async () => {
        const { query } = await import('../../../server/db.js');
        for (const [id, banned, banExpires] of [
            ['status-none', 0, null],
            ['status-active', 1, '2999-01-01T00:00:00.000Z'],
            ['status-indefinite', 1, null],
            ['status-expired', 1, '2000-01-01T00:00:00.000Z'],
        ]) {
            await query(`INSERT INTO "user"
                (id, name, email, "emailVerified", "createdAt", "updatedAt", username, banned, "banExpires")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, id, `${id}@status.test`, 1, '2026-01-01T00:00:00.000Z',
                '2026-01-01T00:00:00.000Z', id, banned, banExpires]);
        }

        const res = await request(app).get('/api/admin/users?q=status.test').set('Cookie', adminCookie);
        expect(Object.fromEntries(res.body.users.map(user => [user.id, user.suspensionStatus]))).toEqual({
            'status-active': 'active',
            'status-expired': 'expired',
            'status-indefinite': 'active',
            'status-none': 'none',
        });
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

    it('returns generalized user history while excluding system actor rows', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`INSERT INTO platform_audit_actions
            (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at, metadata_json)
            VALUES ($1, 'system', NULL, $2, $3, $4, 'owner_granted', $5, $6, $7)`,
        ['system-history-row', 'OWNER_EMAILS reconciliation', ownerTargetId, 'protected-owner@test.dev',
            'System role event', '2026-07-16T09:00:00.000Z', JSON.stringify({
                source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner',
            })]);
        await query(`INSERT INTO platform_audit_actions
            (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at, metadata_json)
            VALUES ($1, 'user', $2, $3, $4, $5, 'account_restored', $6, $7, $8)`,
        ['user-history-row', 'history-admin', 'history-admin@test.dev', ownerTargetId, 'protected-owner@test.dev',
            'Visible user event', '2026-07-16T10:00:00.000Z', JSON.stringify({ source: 'account_workflow' })]);

        const res = await request(app).get(`/api/admin/users/${ownerTargetId}`).set('Cookie', adminCookie);

        expect(res.body.history.items).toEqual([{
            id: 'user-history-row', actorKind: 'user', actorUserId: 'history-admin',
            actorEmail: 'history-admin@test.dev', targetUserId: ownerTargetId, targetEmail: 'protected-owner@test.dev',
            projectId: null, reviewId: null, action: 'account_restored', reason: 'Visible user event',
            expiresAt: null, createdAt: '2026-07-16T10:00:00.000Z', metadata: { source: 'account_workflow' },
        }]);
    });

    it('bounds history pages at 25 and resumes in descending time order', async () => {
        const { query } = await import('../../../server/db.js');
        for (let index = 0; index < 26; index += 1) {
            const suffix = String(index).padStart(2, '0');
            await query(`INSERT INTO platform_audit_actions
                (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at, metadata_json)
                VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, $8, $9)`,
            [`history-${suffix}`, 'admin-history', 'history-admin@test.dev', targetId, 'target@test.dev',
                'account_restored', `History ${suffix}`, `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
                JSON.stringify({ source: 'account_workflow' })]);
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

    it('preserves SQLite timestamp ordering keys in history cursors', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`INSERT INTO "user"
            (id, name, email, "emailVerified", "createdAt", "updatedAt", username, banned)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['native-history-user', 'Native History', 'native-history@test.dev', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'native_history', 0]);
        for (let index = 0; index < 26; index += 1) {
            const suffix = String(index).padStart(2, '0');
            await query(`INSERT INTO platform_audit_actions
                (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at, metadata_json)
                VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, $8, $9)`,
            [`native-history-${suffix}`, 'admin-history', 'history-admin@test.dev', 'native-history-user',
                'native-history@test.dev', 'account_restored', `Native history ${suffix}`, '2026-06-01 00:00:00',
                JSON.stringify({ source: 'account_workflow' })]);
        }

        const first = await request(app).get('/api/admin/users/native-history-user').set('Cookie', adminCookie);
        const second = await request(app)
            .get(`/api/admin/users/native-history-user?historyCursor=${encodeURIComponent(first.body.history.nextCursor)}`)
            .set('Cookie', adminCookie);

        expect(first.body.history.items).toHaveLength(25);
        expect(first.body.history.items[0].id).toBe('native-history-25');
        expect(second.body.history.items.map(item => item.id)).toEqual(['native-history-00']);
        expect(second.body.history.nextCursor).toBeNull();
    });

    it('uses a lossless history key when the database driver decodes timestamps as Date', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`INSERT INTO "user"
            (id, name, email, "emailVerified", "createdAt", "updatedAt", username, banned)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['driver-date-user', 'Driver Date', 'driver-date@test.dev', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'driver_date', 0]);
        for (let index = 0; index < 26; index += 1) {
            const suffix = String(index).padStart(2, '0');
            await query(`INSERT INTO platform_audit_actions
                (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at, metadata_json)
                VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, $8, $9)`,
            [`driver-date-${suffix}`, 'admin-history', 'history-admin@test.dev', 'driver-date-user',
                'driver-date@test.dev', 'account_restored', `Driver date ${suffix}`, '2026-06-01T00:00:00.123456Z',
                JSON.stringify({ source: 'account_workflow' })]);
        }
        faults.decodeModerationDates = true;

        const first = await request(app).get('/api/admin/users/driver-date-user').set('Cookie', adminCookie);
        const decodedCursor = decodeTestCursor(first.body.history.nextCursor);
        const second = await request(app)
            .get(`/api/admin/users/driver-date-user?historyCursor=${encodeURIComponent(first.body.history.nextCursor)}`)
            .set('Cookie', adminCookie);

        expect(decodedCursor[0]).toBe('2026-06-01T00:00:00.123456Z');
        expect(second.body.history.items.map(item => item.id)).toEqual(['driver-date-00']);
        expect(second.body.history.nextCursor).toBeNull();
    });

    it('returns 404 for a missing target and 400 for a malformed history cursor', async () => {
        expect((await request(app).get('/api/admin/users/missing').set('Cookie', adminCookie)).status).toBe(404);
        expect((await request(app).get(`/api/admin/users/${targetId}?historyCursor=broken`).set('Cookie', adminCookie)).status).toBe(400);
    });
});

describe('Better Auth admin HTTP surface', () => {
    it.each([
        '/api/auth/admin',
        '/api/auth/admin/list-users',
        '/api/auth/admin/get-user?id=probe-user',
        '/api/auth/admin/unknown/descendant',
    ])('returns a JSON 404 for GET %s', async path => {
        const res = await request(app).get(path).set('Cookie', adminCookie);
        expect({ status: res.status, body: res.body }).toEqual({
            status: 404,
            body: { error: 'Not found' },
        });
    });

    it('blocks normalized plugin routes without changing users, accounts, sessions, roles, or audit', async () => {
        const { query } = await import('../../../server/db.js');
        const timestamp = '2026-07-16T00:00:00.000Z';
        const fixtures = [
            ['plugin-ban-target', 'Plugin Ban', 'plugin-ban@test.dev', 'admin', 0, null],
            ['plugin-unban-target', 'Plugin Unban', 'plugin-unban@test.dev', 'user', 1, 'Existing suspension'],
            ['plugin-role-target', 'Plugin Role', 'plugin-role@test.dev', 'user', 0, null],
            ['plugin-remove-target', 'Plugin Remove', 'plugin-remove@test.dev', 'user', 0, null],
        ];
        for (const [id, name, email, role, banned, banReason] of fixtures) {
            await query(`INSERT INTO "user"
                (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned, "banReason", "moderationVersion")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, name, email, 1, timestamp, timestamp, role, banned, banReason, 0]);
        }

        const userSnapshot = () => query(`SELECT id, email, role, banned, "banReason", "banExpires", "moderationVersion"
            FROM "user"
            WHERE id LIKE 'plugin-%' OR email = 'plugin-created@test.dev'
            ORDER BY id`);
        const auditSnapshot = () => query(`SELECT id, actor_kind, actor_user_id, target_user_id, action, reason, project_id
            FROM platform_audit_actions ORDER BY id`);
        const accountSnapshot = () => query(`SELECT id, "accountId", "providerId", "userId"
            FROM account WHERE "userId" LIKE 'plugin-%' ORDER BY id`);
        const sessionSnapshot = () => query(`SELECT id, "userId" FROM session
            WHERE "userId" LIKE 'plugin-%' ORDER BY id`);
        const beforeUsers = await userSnapshot();
        const beforeAudit = await auditSnapshot();
        const beforeAccounts = await accountSnapshot();
        const beforeSessions = await sessionSnapshot();
        let evidence;

        try {
            const calls = [
                ['/api/auth/admin/ban-user', { userId: 'plugin-ban-target', banReason: 'Bypass ban' }],
                ['/api/auth/x/../admin/unban-user', { userId: 'plugin-unban-target' }],
                ['/api/auth/x/%2e%2e/admin/set-role', { userId: 'plugin-role-target', role: 'admin' }],
                ['/api/auth/x/%2E%2E/admin/create-user', {
                    email: 'plugin-created@test.dev', password: 'Password-1234!', name: 'Plugin Created', role: 'admin',
                }],
                ['/api/auth/x/.%2e/admin/list-users', undefined, 'GET'],
                ['/api/auth/x/%2e./admin/remove-user', { userId: 'plugin-remove-target' }],
            ];
            const responses = [];
            for (const [path, body, method] of calls) {
                responses.push(await rawHttpRequest(path, { method, cookie: adminCookie, body }));
            }
            evidence = {
                responses,
                users: await userSnapshot(),
                accounts: await accountSnapshot(),
                sessions: await sessionSnapshot(),
                audit: await auditSnapshot(),
            };
        } finally {
            await query(`DELETE FROM account WHERE "userId" IN (
                SELECT id FROM "user" WHERE id LIKE 'plugin-%' OR email = 'plugin-created@test.dev'
            )`);
            await query(`DELETE FROM session WHERE "userId" IN (
                SELECT id FROM "user" WHERE id LIKE 'plugin-%' OR email = 'plugin-created@test.dev'
            )`);
            await query(`DELETE FROM "user" WHERE id LIKE 'plugin-%' OR email = 'plugin-created@test.dev'`);
        }

        expect(evidence).toEqual({
            responses: Array.from({ length: 6 }, () => expect.objectContaining({ status: 404 })),
            users: beforeUsers,
            accounts: beforeAccounts,
            sessions: beforeSessions,
            audit: beforeAudit,
        });
    });
});

const createPublishedProject = async (id, ownerId, name) => {
    const { query } = await import('../../../server/db.js');
    await query(`INSERT INTO projects
        (id, owner_id, name, visibility, published_commit_id, published_name, published_at)
        VALUES ($1, $2, $3, 'public', $4, $5, $6)`,
    [id, ownerId, name, `commit-${id}`, name, '2026-07-16T11:00:00.000Z']);
};

describe('account suspension', () => {
    beforeEach(async () => {
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user"
            SET banned = 0, "banReason" = NULL, "banExpires" = NULL, "moderationVersion" = 0
            WHERE id = $1`, [targetId]);
        await query('DELETE FROM session WHERE "userId" = $1', [targetId]);
    });

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
            { ...base, projectIdsToUnpublish: ['same', ' same '] },
            { ...base, projectIdsToUnpublish: [''] },
            { ...base, projectIdsToUnpublish: ['x'.repeat(201)] },
            { ...base, projectIdsToUnpublish: [` ${'x'.repeat(200)} `] },
            { ...base, expectedModerationVersion: -1 },
            { ...base, expectedModerationVersion: 0.5 },
        ];
        for (const body of malformed) {
            const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send(body);
            expect(res.status).toBe(400);
        }
        const forbidden = await request(app).post(`/api/admin/users/${adminId}/suspend`).set('Cookie', adminCookie).send(base);
        expect(forbidden.status).toBe(403);
        expect((await request(app).post('/api/admin/users/missing/suspend').set('Cookie', adminCookie).send(base)).status).toBe(404);
    });

    it.each([
        '2999-01-01T00:00:00',
        'January 1, 2999 00:00 UTC',
        '2999-02-29T00:00:00.000Z',
        '2999-01-01T00:00:00+24:00',
    ])('rejects noncanonical or calendar-invalid expiry %s', async expiresAt => {
        const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Invalid expiry shape',
            expiresAt,
            projectIdsToUnpublish: [],
            expectedModerationVersion: 0,
        });
        expect(res.status).toBe(400);
    });

    it('rejects more than 20 selected project IDs before transaction work', async () => {
        const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Oversized project selection',
            expiresAt: null,
            projectIdsToUnpublish: Array.from({ length: 21 }, (_, index) => `project-${index}`),
            expectedModerationVersion: 0,
        });
        expect(res.status).toBe(400);
    });

    it('accepts a timezone-aware expiry and at most 20 selected projects', async () => {
        const projectIds = Array.from({ length: 20 }, (_, index) => `boundary-project-${index}`);
        for (const projectId of projectIds) await createPublishedProject(projectId, targetId, projectId);

        const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Platform-scale boundary',
            expiresAt: '2999-01-01T00:00:00+05:30',
            projectIdsToUnpublish: projectIds,
            expectedModerationVersion: 0,
        });

        expect(res.status).toBe(200);
        expect(res.body.actions).toHaveLength(21);
    });

    it('atomically applies an indefinite suspension, revokes every session, and unpublishes only selected projects', async () => {
        const { query } = await import('../../../server/db.js');
        const firstSignin = await request(app).post('/api/auth/sign-in/email')
            .send({ email: 'target@test.dev', password: 'Password-1234!' });
        const firstCookie = firstSignin.headers['set-cookie'].map(cookie => cookie.split(';')[0]).join('; ');
        await request(app).post('/api/auth/sign-in/email')
            .send({ email: 'target@test.dev', password: 'Password-1234!' });
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
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        const suspended = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Temporary login block', expiresAt, projectIdsToUnpublish: [], expectedModerationVersion: 0,
        });
        expect(suspended.status).toBe(200);

        const active = await request(app).post('/api/auth/sign-in/email')
            .send({ email: 'target@test.dev', password: 'Password-1234!' });
        expect(active.status).toBe(403);
        expect(active.body.code).toBe('BANNED_USER');

        const { query } = await import('../../../server/db.js');
        await query('UPDATE "user" SET "banExpires" = $1 WHERE id = $2', [new Date(Date.now() - 1000).toISOString(), targetId]);
        const detail = await request(app).get(`/api/admin/users/${targetId}`).set('Cookie', adminCookie);
        expect(detail.body.account.suspensionStatus).toBe('expired');
        const expired = await request(app).post('/api/auth/sign-in/email')
            .send({ email: 'target@test.dev', password: 'Password-1234!' });
        expect(expired.status).toBe(200);
        expect((await query('SELECT banned, "banReason", "banExpires" FROM "user" WHERE id = $1', [targetId]))[0])
            .toEqual({ banned: 0, banReason: null, banExpires: null });
    });

    it('persists a future temporary expiry and records complete actor/target/project audit snapshots', async () => {
        const { query } = await import('../../../server/db.js');
        const adminId = (await query('SELECT id FROM "user" WHERE email = $1', ['moderator@test.dev']))[0].id;
        const legacyCount = (await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count;
        await createPublishedProject('temporary-project', targetId, 'Temporary project');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const requestStartedAt = Date.now();
        const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Temporary investigation', expiresAt,
            projectIdsToUnpublish: ['temporary-project'], expectedModerationVersion: 0,
        });
        const requestFinishedAt = Date.now();
        expect(res.status).toBe(200);
        expect(res.body.account.banExpires).toBe(expiresAt);
        for (const action of res.body.actions) {
            expect(Object.keys(action).sort()).toEqual([
                'action', 'actorEmail', 'actorKind', 'actorUserId', 'createdAt', 'expiresAt', 'id',
                'metadata', 'projectId', 'reason', 'reviewId', 'targetEmail', 'targetUserId',
            ]);
            expect(action).toMatchObject({
                actorKind: 'user', actorUserId: adminId, actorEmail: 'moderator@test.dev', targetUserId: targetId,
                targetEmail: 'target@test.dev', reason: 'Temporary investigation', expiresAt,
            });
            expect(new Date(action.createdAt).toString()).not.toBe('Invalid Date');
        }
        expect(res.body.actions.find(action => action.action === 'project_unpublished').projectId).toBe('temporary-project');
        expect(res.body.actions.find(action => action.action === 'project_unpublished').metadata).toEqual({
            source: 'account_workflow', previousProjectVisibility: 'public',
        });
        expect(res.body.actions.find(action => action.action === 'account_suspended').projectId).toBeNull();
        expect(res.body.actions.find(action => action.action === 'account_suspended').metadata)
            .toEqual({ source: 'account_workflow' });
        expect(JSON.stringify(res.body.actions)).not.toMatch(/password|token|session|ipAddress|banReason/i);

        const persisted = await query(`SELECT actor_kind, actor_user_id, actor_email, target_user_id, target_email,
                action, reason, expires_at, project_id, review_id, created_at, metadata_json
            FROM platform_audit_actions WHERE reason = $1 ORDER BY action`, ['Temporary investigation']);
        expect(persisted[0].created_at).toEqual(persisted[1].created_at);
        const persistedCreatedAt = new Date(persisted[0].created_at).getTime();
        expect(persistedCreatedAt).toBeGreaterThanOrEqual(requestStartedAt);
        expect(persistedCreatedAt).toBeLessThanOrEqual(requestFinishedAt);
        expect(persisted.map(({ created_at: _createdAt, ...action }) => action)).toEqual([
            {
                actor_kind: 'user', actor_user_id: adminId, actor_email: 'moderator@test.dev',
                target_user_id: targetId, target_email: 'target@test.dev',
                action: 'account_suspended', reason: 'Temporary investigation', expires_at: expiresAt,
                project_id: null, review_id: null, metadata_json: JSON.stringify({ source: 'account_workflow' }),
            },
            {
                actor_kind: 'user', actor_user_id: adminId, actor_email: 'moderator@test.dev',
                target_user_id: targetId, target_email: 'target@test.dev',
                action: 'project_unpublished', reason: 'Temporary investigation', expires_at: expiresAt,
                project_id: 'temporary-project', review_id: null,
                metadata_json: JSON.stringify({ source: 'account_workflow', previousProjectVisibility: 'public' }),
            },
        ]);
        expect((await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count).toBe(legacyCount);
    });

    it('rejects an expiry that elapses after locks with no account, session, project, or audit change', async () => {
        const { query } = await import('../../../server/db.js');
        const startedAt = Date.parse('2026-07-16T12:00:00.000Z');
        const expiresAt = new Date(startedAt + 1000).toISOString();
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
        await createPublishedProject('elapsed-expiry-project', targetId, 'Elapsed expiry');
        await query(`INSERT INTO session
            (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
            VALUES ($1, $2, $3, $4, $5, $6)`,
        ['elapsed-expiry-session', new Date(startedAt + 3600000).toISOString(), 'elapsed-expiry-token',
            new Date(startedAt).toISOString(), new Date(startedAt).toISOString(), targetId]);
        const beforeUser = await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [targetId]);
        const beforeSessions = await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId]);
        const beforeProject = await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', ['elapsed-expiry-project']);
        const beforeAudit = await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY id', [targetId]);
        faults.afterQueryPattern = /SELECT \* FROM projects WHERE id IN/;
        faults.afterQuery = () => nowSpy.mockReturnValue(startedAt + 1000);

        try {
            const res = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
                reason: 'Expiry elapsed under lock',
                expiresAt,
                projectIdsToUnpublish: ['elapsed-expiry-project'],
                expectedModerationVersion: 0,
            });

            expect(res.status).toBe(400);
            expect(await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
                FROM "user" WHERE id = $1`, [targetId])).toEqual(beforeUser);
            expect(await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId])).toEqual(beforeSessions);
            expect(await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', ['elapsed-expiry-project']))
                .toEqual(beforeProject);
            expect(await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY id', [targetId]))
                .toEqual(beforeAudit);
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('returns 409 for stale version, active target, or invalid project selection without partial changes', async () => {
        const { query } = await import('../../../server/db.js');
        await query('UPDATE "user" SET "moderationVersion" = $1 WHERE id = $2', [1, targetId]);
        const stale = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Stale', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: 0,
        });
        expect(stale.status).toBe(409);

        await query('UPDATE "user" SET banned = $1 WHERE id = $2', [1, targetId]);
        const active = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: 'Duplicate', expiresAt: null, projectIdsToUnpublish: [], expectedModerationVersion: 1,
        });
        expect(active.status).toBe(409);
        await query('UPDATE "user" SET banned = $1 WHERE id = $2', [0, targetId]);

        const ordinaryId = (await query('SELECT id FROM "user" WHERE email = $1', ['ordinary@test.dev']))[0].id;
        await createPublishedProject('foreign-project', ordinaryId, 'Foreign');
        await query(`INSERT INTO projects (id, owner_id, name, visibility, published_commit_id)
            VALUES ($1, $2, $3, 'private', $4)`, ['already-private', targetId, 'Already private', 'private-commit']);
        await query(`INSERT INTO projects (id, owner_id, name, visibility, published_commit_id)
            VALUES ($1, $2, $3, 'public', NULL)`, ['already-unpublished', targetId, 'Already unpublished']);

        for (const [reason, projectId] of [
            ['Foreign selection', 'foreign-project'],
            ['Private selection', 'already-private'],
            ['Unpublished selection', 'already-unpublished'],
            ['Missing selection', 'missing-project'],
        ]) {
            const conflict = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
                reason, expiresAt: null, projectIdsToUnpublish: [projectId], expectedModerationVersion: 1,
            });
            expect(conflict.status).toBe(409);
            expect((await query('SELECT banned, "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0])
                .toEqual({ banned: 0, moderationVersion: 1 });
            expect(await query('SELECT id FROM platform_audit_actions WHERE reason = $1', [reason])).toEqual([]);
        }
    });
});

describe('account restoration', () => {
    it('requires a reason/version and rejects missing, stale, or unsuspended targets', async () => {
        expect((await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie)
            .send({ reason: '', expectedModerationVersion: 0 })).status).toBe(400);
        expect((await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie)
            .send({ reason: 'Missing version' })).status).toBe(400);
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user"
            SET banned = 1, "banReason" = 'Prior reason', "banExpires" = NULL,
                "moderationVersion" = "moderationVersion" + 1
            WHERE id = $1`, [targetId]);
        const version = (await query('SELECT "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0].moderationVersion;
        expect((await request(app).post('/api/admin/users/missing/restore').set('Cookie', adminCookie)
            .send({ reason: 'Missing target', expectedModerationVersion: 0 })).status).toBe(404);
        expect((await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie)
            .send({ reason: 'Stale version', expectedModerationVersion: version - 1 })).status).toBe(409);
        await query(`UPDATE "user" SET banned = 0, "banReason" = NULL, "banExpires" = NULL WHERE id = $1`, [targetId]);
        expect((await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie)
            .send({ reason: 'No suspension', expectedModerationVersion: version })).status).toBe(409);
    });

    it.each([
        ['active', null],
        ['expired', new Date(Date.now() - 1000).toISOString()],
    ])('restores an %s suspension, revokes sessions defensively, and never republishes content', async (_label, expiresAt) => {
        const { query } = await import('../../../server/db.js');
        const adminId = (await query('SELECT id FROM "user" WHERE email = $1', ['moderator@test.dev']))[0].id;
        const legacyCount = (await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count;
        await query(`INSERT INTO session
            (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
            VALUES ($1, $2, $3, $4, $5, $6)`,
        [`defensive-${_label}`, new Date(Date.now() + 3600000).toISOString(), `token-${_label}`,
            new Date().toISOString(), new Date().toISOString(), targetId]);
        await query(`UPDATE "user"
            SET banned = 1, "banReason" = 'Prior reason', "banExpires" = $1,
                "moderationVersion" = "moderationVersion" + 1
            WHERE id = $2`, [expiresAt, targetId]);
        const version = (await query('SELECT "moderationVersion" FROM "user" WHERE id = $1', [targetId]))[0].moderationVersion;
        const projectId = `restore-${_label}-project`;
        await createPublishedProject(projectId, targetId, `Restore ${_label}`);
        await query(`UPDATE projects SET visibility = 'private', published_commit_id = NULL WHERE id = $1`, [projectId]);
        const project = await query('SELECT id, visibility, published_commit_id FROM projects WHERE id = $1', [projectId]);

        const requestStartedAt = Date.now();
        const res = await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie).send({
            reason: `  Restored ${_label}  `, expectedModerationVersion: version,
        });
        const requestFinishedAt = Date.now();
        expect(res.status).toBe(200);
        expect(res.body.account).toMatchObject({
            suspensionStatus: 'none', banReason: null, banExpires: null, moderationVersion: version + 1,
        });
        expect(res.body.actions).toHaveLength(1);
        expect(res.body.actions[0]).toMatchObject({
            actorKind: 'user', actorUserId: adminId, actorEmail: 'moderator@test.dev',
            action: 'account_restored', reason: `Restored ${_label}`, expiresAt: null, projectId: null,
            reviewId: null, metadata: { source: 'account_workflow' },
        });
        const persistedAccount = (await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [targetId]))[0];
        const persistedAction = (await query(`SELECT id, actor_kind, actor_user_id, actor_email, target_user_id, target_email,
                action, reason, expires_at, project_id, review_id, created_at, metadata_json
            FROM platform_audit_actions WHERE id = $1`, [res.body.actions[0].id]))[0];
        expect(persistedAccount).toEqual({
            banned: 0,
            banReason: null,
            banExpires: null,
            moderationVersion: version + 1,
            updatedAt: persistedAction.created_at,
        });
        expect(persistedAction).toEqual({
            id: res.body.actions[0].id,
            actor_kind: 'user',
            actor_user_id: adminId,
            actor_email: 'moderator@test.dev',
            target_user_id: targetId,
            target_email: 'target@test.dev',
            action: 'account_restored',
            reason: `Restored ${_label}`,
            expires_at: null,
            project_id: null,
            review_id: null,
            created_at: persistedAction.created_at,
            metadata_json: JSON.stringify({ source: 'account_workflow' }),
        });
        const persistedTimestamp = new Date(persistedAction.created_at).getTime();
        expect(persistedTimestamp).toBeGreaterThanOrEqual(requestStartedAt);
        expect(persistedTimestamp).toBeLessThanOrEqual(requestFinishedAt);
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [targetId])).toEqual([]);
        expect(await query('SELECT id, visibility, published_commit_id FROM projects WHERE id = $1', [projectId]))
            .toEqual(project);
        expect((await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count).toBe(legacyCount);
    });
});

describe('moderation transaction rollback', () => {
    it.each([
        ['account update', /UPDATE "user"\s+SET banned/],
        ['session deletion', /DELETE FROM session WHERE "userId"/],
        ['project update', /UPDATE projects SET visibility = 'private'/],
        ['audit insertion', /INSERT INTO platform_audit_actions/],
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
        const beforeUser = await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [targetId]);
        const beforeSessions = await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId]);
        const beforeProject = await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', [projectId]);
        const beforeAudit = await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY id', [targetId]);

        faults.pattern = pattern;
        const failed = await request(app).post(`/api/admin/users/${targetId}/suspend`).set('Cookie', adminCookie).send({
            reason: `Rollback ${_stage}`, expiresAt: null, projectIdsToUnpublish: [projectId],
            expectedModerationVersion: beforeUser[0].moderationVersion,
        });
        expect(failed.status).toBe(500);
        expect(await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [targetId]))
            .toEqual(beforeUser);
        expect(await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId])).toEqual(beforeSessions);
        expect(await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', [projectId])).toEqual(beforeProject);
        expect(await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY id', [targetId])).toEqual(beforeAudit);
    });

    it('rolls back restoration account and session writes when audit insertion fails', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`INSERT INTO session
            (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
            VALUES ($1, $2, $3, $4, $5, $6)`,
        ['restore-rollback-session', new Date(Date.now() + 3600000).toISOString(), 'restore-rollback-token',
            new Date().toISOString(), new Date().toISOString(), targetId]);
        await query(`UPDATE "user"
            SET banned = 1, "banReason" = 'Rollback restoration', "banExpires" = NULL,
                "moderationVersion" = "moderationVersion" + 1
            WHERE id = $1`, [targetId]);
        const beforeUser = await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [targetId]);
        const beforeSessions = await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId]);
        const beforeAudit = await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY id', [targetId]);

        faults.pattern = /INSERT INTO platform_audit_actions/;
        const failed = await request(app).post(`/api/admin/users/${targetId}/restore`).set('Cookie', adminCookie).send({
            reason: 'Rollback failed restoration', expectedModerationVersion: beforeUser[0].moderationVersion,
        });
        expect(failed.status).toBe(500);
        expect(await query(`SELECT banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [targetId]))
            .toEqual(beforeUser);
        expect(await query('SELECT id FROM session WHERE "userId" = $1 ORDER BY id', [targetId])).toEqual(beforeSessions);
        expect(await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY id', [targetId])).toEqual(beforeAudit);
    });
});
