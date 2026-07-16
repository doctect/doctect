// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

const faults = vi.hoisted(() => ({ pattern: null, decodeModerationDates: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (faults.pattern?.test(text)) {
            faults.pattern = null;
            throw new Error('Injected moderation failure');
        }
        const rows = await baseQuery(text, params);
        if (faults.decodeModerationDates && /FROM moderation_actions/.test(text)) {
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

const encodeTestCursor = values => Buffer.from(JSON.stringify(values)).toString('base64url');
const decodeTestCursor = raw => JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

beforeEach(() => {
    faults.pattern = null;
    faults.decodeModerationDates = false;
});

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

    it('preserves SQLite timestamp ordering keys in history cursors', async () => {
        const { query } = await import('../../../server/db.js');
        await query(`INSERT INTO "user"
            (id, name, email, "emailVerified", "createdAt", "updatedAt", username, banned)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['native-history-user', 'Native History', 'native-history@test.dev', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'native_history', 0]);
        for (let index = 0; index < 26; index += 1) {
            const suffix = String(index).padStart(2, '0');
            await query(`INSERT INTO moderation_actions
                (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [`native-history-${suffix}`, 'admin-history', 'history-admin@test.dev', 'native-history-user',
                'native-history@test.dev', 'account_restored', `Native history ${suffix}`, '2026-06-01 00:00:00']);
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
            await query(`INSERT INTO moderation_actions
                (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [`driver-date-${suffix}`, 'admin-history', 'history-admin@test.dev', 'driver-date-user',
                'driver-date@test.dev', 'account_restored', `Driver date ${suffix}`, '2026-06-01T00:00:00.123456Z']);
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
