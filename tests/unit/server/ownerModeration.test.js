// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, TEST_PASSWORD } from './helpers.js';

const dbHarness = vi.hoisted(() => ({
    postgresMode: false,
    queries: [],
    failPattern: null,
    failAt: 1,
    matchCount: 0,
    afterQueryPattern: null,
    afterQuery: null,
}));

vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        dbHarness.queries.push({ text, params: [...params] });
        if (dbHarness.failPattern?.test(text)) {
            dbHarness.matchCount += 1;
            if (dbHarness.matchCount === dbHarness.failAt) throw new Error('Injected owner lifecycle failure');
        }
        const sqliteParams = params.map(value => typeof value === 'boolean' ? Number(value) : value);
        const rows = await baseQuery(text.replace(/\s+FOR UPDATE\b/g, ''), sqliteParams);
        if (dbHarness.afterQueryPattern?.test(text)) dbHarness.afterQuery?.();
        return rows;
    };
    return {
        ...actual,
        get dbType() { return dbHarness.postgresMode ? 'postgres' : actual.dbType; },
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

const OWNER_EMAIL = 'lifecycle-owner@test.dev';
const ADMIN_EMAIL = 'lifecycle-admin@test.dev';
const USER_EMAIL = 'lifecycle-user@test.dev';
const PROMOTION_EMAIL = 'lifecycle-promotion@test.dev';
const REVOCATION_EMAIL = 'lifecycle-revocation@test.dev';
const OWNER_TARGET_ID = 'lifecycle-protected-owner';
const PROJECT_PREFIX = 'lifecycle-project-';
const originalOwnerEmails = process.env.OWNER_EMAILS;

let app;
let query;
let ownerCookie;
let adminCookie;
let userCookie;
let ownerId;
let promotionTargetId;
let revocationTargetId;

const userIdFor = async email => (await query('SELECT id FROM "user" WHERE email = $1', [email]))[0].id;
const promote = (targetId, body, cookie = ownerCookie) => request(app)
    .post(`/api/owner/users/${targetId}/promote-admin`)
    .set('Cookie', cookie)
    .send(body);
const revoke = (targetId, body, cookie = ownerCookie) => request(app)
    .post(`/api/owner/users/${targetId}/revoke-admin`)
    .set('Cookie', cookie)
    .send(body);
const promotionBody = (overrides = {}) => ({
    reason: 'Moderator coverage',
    expectedModerationVersion: 0,
    ...overrides,
});
const revocationBody = (overrides = {}) => ({
    reason: 'Moderator access removed',
    expectedModerationVersion: 0,
    suspension: null,
    projectIdsToUnpublish: [],
    ...overrides,
});

const insertSession = async (userId, suffix) => {
    const now = new Date().toISOString();
    await query(`INSERT INTO session
        (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
        VALUES ($1, $2, $3, $4, $5, $6)`,
    [`lifecycle-session-${suffix}`, new Date(Date.now() + 3600000).toISOString(),
        `lifecycle-token-${suffix}`, now, now, userId]);
};

const insertProject = async (id, ownerIdToUse, visibility = 'public', publishedCommitId = `commit-${id}`) => {
    await query(`INSERT INTO projects
        (id, owner_id, name, visibility, published_commit_id, published_name, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, ownerIdToUse, id, visibility, publishedCommitId, id, '2026-07-17T00:00:00.000Z']);
};

const snapshotRevocationState = async () => ({
    account: await query(`SELECT role, banned, "banReason", "banExpires", "moderationVersion", "updatedAt"
        FROM "user" WHERE id = $1`, [revocationTargetId]),
    sessions: await query('SELECT id, token FROM session WHERE "userId" = $1 ORDER BY id', [revocationTargetId]),
    projects: await query(`SELECT id, visibility, published_commit_id FROM projects
        WHERE id LIKE 'lifecycle-project-fault-%' ORDER BY id`),
    audit: await query(`SELECT action, reason, project_id, expires_at, metadata_json
        FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY rowid`, [revocationTargetId]),
});

const resetFaultFixture = async () => {
    dbHarness.failPattern = null;
    dbHarness.afterQueryPattern = null;
    await query('DELETE FROM session WHERE "userId" = $1', [revocationTargetId]);
    await query(`DELETE FROM projects WHERE id LIKE 'lifecycle-project-fault-%'`);
    await query(`UPDATE "user"
        SET role = 'admin', banned = 0, "banReason" = NULL, "banExpires" = NULL,
            "moderationVersion" = 7, "updatedAt" = '2026-07-17T00:00:00.000Z'
        WHERE id = $1`, [revocationTargetId]);
    await insertSession(revocationTargetId, 'fault-a');
    await insertSession(revocationTargetId, 'fault-b');
    await insertProject('lifecycle-project-fault-a', revocationTargetId);
    await insertProject('lifecycle-project-fault-b', revocationTargetId);
};

beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: OWNER_EMAIL, username: 'lifecycle_owner' });
    adminCookie = await signUpUser(app, { email: ADMIN_EMAIL, username: 'lifecycle_admin' });
    userCookie = await signUpUser(app, { email: USER_EMAIL, username: 'lifecycle_user' });
    await signUpUser(app, { email: PROMOTION_EMAIL, username: 'lifecycle_promotion' });
    await signUpUser(app, { email: REVOCATION_EMAIL, username: 'lifecycle_revocation' });
    ({ query } = await import('../../../server/db.js'));
    ownerId = await userIdFor(OWNER_EMAIL);
    promotionTargetId = await userIdFor(PROMOTION_EMAIL);
    revocationTargetId = await userIdFor(REVOCATION_EMAIL);
    const now = new Date().toISOString();
    await query(`INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt", role, "moderationVersion")
        VALUES ($1, $2, $3, $4, $5, $6, 'owner', 0)`,
    [OWNER_TARGET_ID, 'Protected Owner', 'lifecycle-protected-owner@test.dev', 1, now, now]);
    dbHarness.postgresMode = true;
});

afterAll(() => {
    if (originalOwnerEmails === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = originalOwnerEmails;
});

beforeEach(async () => {
    dbHarness.failPattern = null;
    dbHarness.failAt = 1;
    dbHarness.matchCount = 0;
    dbHarness.afterQueryPattern = null;
    dbHarness.afterQuery = null;
    process.env.OWNER_EMAILS = OWNER_EMAIL;
    await query(`UPDATE "user" SET role = 'owner' WHERE id = $1`, [ownerId]);
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [ADMIN_EMAIL]);
    await query(`UPDATE "user" SET role = 'user' WHERE email = $1`, [USER_EMAIL]);
    await query(`UPDATE "user"
        SET role = 'user', banned = 0, "banReason" = NULL, "banExpires" = NULL, "moderationVersion" = 0
        WHERE id = $1`, [promotionTargetId]);
    await query(`UPDATE "user"
        SET role = 'admin', banned = 0, "banReason" = NULL, "banExpires" = NULL, "moderationVersion" = 0
        WHERE id = $1`, [revocationTargetId]);
    await query(`UPDATE "user" SET role = 'owner', "moderationVersion" = 0 WHERE id = $1`, [OWNER_TARGET_ID]);
    await query('DELETE FROM session WHERE "userId" = $1', [promotionTargetId]);
    await query('DELETE FROM session WHERE "userId" = $1', [revocationTargetId]);
    await query(`DELETE FROM projects WHERE id LIKE '${PROJECT_PREFIX}%'`);
    dbHarness.queries = [];
});

describe('owner lifecycle authorization and status contracts', () => {
    it('returns exact 401 and 403 envelopes for anonymous, admin, and user actors', async () => {
        const anonymous = await request(app).post(`/api/owner/users/${promotionTargetId}/promote-admin`).send(promotionBody());
        expect({ status: anonymous.status, body: anonymous.body }).toEqual({ status: 401, body: { error: 'Unauthorized' } });

        for (const cookie of [adminCookie, userCookie]) {
            const denied = await promote(promotionTargetId, promotionBody(), cookie);
            expect({ status: denied.status, body: denied.body }).toEqual({
                status: 403,
                body: { error: 'Forbidden: Owners only' },
            });
        }
    });

    it('rejects stored owners before version and effective-role state checks', async () => {
        for (const response of [
            await promote(OWNER_TARGET_ID, promotionBody({ expectedModerationVersion: 999 })),
            await revoke(OWNER_TARGET_ID, revocationBody({ expectedModerationVersion: 999 })),
        ]) {
            expect({ status: response.status, body: response.body }).toEqual({
                status: 403,
                body: { error: 'Target is protected by role hierarchy' },
            });
        }
    });

    it('returns exact 404 and 409 envelopes for missing or changed target state', async () => {
        const missing = await promote('missing-lifecycle-user', promotionBody());
        expect({ status: missing.status, body: missing.body }).toEqual({ status: 404, body: { error: 'User not found' } });

        await query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [promotionTargetId]);
        expect((await promote(promotionTargetId, promotionBody())).status).toBe(409);
        await query(`UPDATE "user" SET role = 'user', banned = 1, "banExpires" = NULL WHERE id = $1`, [promotionTargetId]);
        expect((await promote(promotionTargetId, promotionBody())).status).toBe(409);
        await query(`UPDATE "user" SET role = 'user' WHERE id = $1`, [revocationTargetId]);
        expect((await revoke(revocationTargetId, revocationBody())).status).toBe(409);
        await query(`UPDATE "user" SET role = 'admin', "moderationVersion" = 1 WHERE id = $1`, [revocationTargetId]);
        const stale = await revoke(revocationTargetId, revocationBody());
        expect({ status: stale.status, body: stale.body }).toEqual({
            status: 409,
            body: { error: 'Role or moderation state changed; refresh and try again' },
        });
    });

    it('rejects malformed promotion and complete revocation bodies with exact 400 envelopes', async () => {
        for (const body of [
            promotionBody({ reason: ' ' }),
            promotionBody({ reason: 'x'.repeat(1001) }),
            promotionBody({ expectedModerationVersion: -1 }),
            promotionBody({ expectedModerationVersion: 0.5 }),
        ]) {
            const response = await promote(promotionTargetId, body);
            expect({ status: response.status, body: response.body }).toEqual({
                status: 400,
                body: { error: 'Invalid promotion request' },
            });
        }

        for (const body of [
            revocationBody({ reason: '' }),
            revocationBody({ expectedModerationVersion: undefined }),
            revocationBody({ suspension: undefined }),
            revocationBody({ suspension: 'indefinite' }),
            revocationBody({ suspension: {} }),
            revocationBody({ suspension: { expiresAt: 'not-a-date' } }),
            revocationBody({ suspension: { expiresAt: null, extra: true } }),
            revocationBody({ projectIdsToUnpublish: undefined }),
            revocationBody({ projectIdsToUnpublish: Array.from({ length: 21 }, (_, index) => `project-${index}`) }),
        ]) {
            const response = await revoke(revocationTargetId, body);
            expect({ status: response.status, body: response.body }).toEqual({
                status: 400,
                body: { error: 'Invalid revocation request' },
            });
        }
    });
});

describe('owner moderator lifecycle success', () => {
    it('promotes a fresh user, revokes all sessions, and returns one exact audit action', async () => {
        const firstSignin = await request(app).post('/api/auth/sign-in/email')
            .send({ email: PROMOTION_EMAIL, password: TEST_PASSWORD });
        const oldCookie = firstSignin.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');
        await request(app).post('/api/auth/sign-in/email').send({ email: PROMOTION_EMAIL, password: TEST_PASSWORD });

        const response = await promote(promotionTargetId, promotionBody({ reason: '  Add incident coverage  ' }));

        expect(response.status).toBe(200);
        expect(Object.keys(response.body).sort()).toEqual(['account', 'actions']);
        expect(Object.keys(response.body.account).sort()).toEqual([
            'banExpires', 'banReason', 'createdAt', 'email', 'id', 'moderationVersion',
            'role', 'suspensionStatus', 'username',
        ]);
        expect(response.body.account).toMatchObject({ role: 'admin', moderationVersion: 1, suspensionStatus: 'none' });
        expect(response.body.actions).toHaveLength(1);
        expect(Object.keys(response.body.actions[0]).sort()).toEqual([
            'action', 'actorEmail', 'actorKind', 'actorUserId', 'createdAt', 'expiresAt', 'id',
            'metadata', 'projectId', 'reason', 'reviewId', 'targetEmail', 'targetUserId',
        ]);
        expect(response.body.actions[0]).toMatchObject({
            actorKind: 'user', actorUserId: ownerId, actorEmail: OWNER_EMAIL,
            targetUserId: promotionTargetId, targetEmail: PROMOTION_EMAIL,
            action: 'admin_promoted', reason: 'Add incident coverage', expiresAt: null,
            projectId: null, reviewId: null,
            metadata: { source: 'owner_role_workflow', previousRole: 'user', newRole: 'admin' },
        });
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [promotionTargetId])).toEqual([]);
        expect(await query(`SELECT role, "moderationVersion" FROM "user" WHERE id = $1`, [promotionTargetId]))
            .toEqual([{ role: 'admin', moderationVersion: 1 }]);
        expect((await request(app).get('/api/projects').set('Cookie', oldCookie)).status).toBe(401);
    });

    it('demotes without changing existing suspension fields or mentioning them in SQL', async () => {
        const priorExpiry = '2026-01-01T00:00:00.000Z';
        await query(`UPDATE "user"
            SET banned = 1, "banReason" = 'pre-existing', "banExpires" = $1 WHERE id = $2`,
        [priorExpiry, revocationTargetId]);
        await insertSession(revocationTargetId, 'preserve');
        dbHarness.queries = [];

        const response = await revoke(revocationTargetId, revocationBody({ reason: '  End rotation  ' }));

        expect(response.status).toBe(200);
        expect(response.body.account).toMatchObject({
            role: 'user', moderationVersion: 1, banReason: 'pre-existing', banExpires: priorExpiry,
        });
        expect(response.body.actions.map(item => item.action)).toEqual(['admin_demoted']);
        expect(response.body.actions[0].metadata).toEqual({
            source: 'owner_role_workflow', previousRole: 'admin', newRole: 'user',
        });
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [revocationTargetId])).toEqual([]);
        const updates = dbHarness.queries.filter(item => /UPDATE "user"/.test(item.text));
        expect(updates).toHaveLength(1);
        expect(updates[0].text).not.toMatch(/banned|banReason|banExpires/);
    });

    it('demotes, suspends, unpublishes selected projects in request order, and restores only user access', async () => {
        await insertProject('lifecycle-project-selected-z', revocationTargetId);
        await insertProject('lifecycle-project-selected-a', revocationTargetId);
        await insertProject('lifecycle-project-unselected', revocationTargetId);
        const signin = await request(app).post('/api/auth/sign-in/email')
            .send({ email: REVOCATION_EMAIL, password: TEST_PASSWORD });
        const oldCookie = signin.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');

        const response = await revoke(revocationTargetId, revocationBody({
            reason: '  Abuse by moderator  ',
            suspension: { expiresAt: null },
            projectIdsToUnpublish: ['lifecycle-project-selected-z', 'lifecycle-project-selected-a'],
        }));

        expect(response.status).toBe(200);
        expect(response.body.account).toMatchObject({
            role: 'user', suspensionStatus: 'active', banReason: 'Abuse by moderator', banExpires: null,
            moderationVersion: 1,
        });
        expect(response.body.actions.map(item => item.action)).toEqual([
            'admin_demoted', 'account_suspended', 'project_unpublished', 'project_unpublished',
        ]);
        expect(response.body.actions.slice(2).map(item => item.projectId)).toEqual([
            'lifecycle-project-selected-z', 'lifecycle-project-selected-a',
        ]);
        expect(response.body.actions[1].metadata).toEqual({ source: 'owner_role_workflow' });
        expect(response.body.actions.slice(2).map(item => item.metadata)).toEqual([
            { source: 'owner_role_workflow', previousProjectVisibility: 'public' },
            { source: 'owner_role_workflow', previousProjectVisibility: 'public' },
        ]);
        expect(await query(`SELECT id, visibility, published_commit_id FROM projects
            WHERE id LIKE '${PROJECT_PREFIX}%' ORDER BY id`)).toEqual([
            { id: 'lifecycle-project-selected-a', visibility: 'private', published_commit_id: null },
            { id: 'lifecycle-project-selected-z', visibility: 'private', published_commit_id: null },
            { id: 'lifecycle-project-unselected', visibility: 'public', published_commit_id: 'commit-lifecycle-project-unselected' },
        ]);
        expect((await request(app).get('/api/projects').set('Cookie', oldCookie)).status).toBe(401);

        const restored = await request(app).post(`/api/admin/users/${revocationTargetId}/restore`)
            .set('Cookie', ownerCookie)
            .send({ reason: 'Appeal accepted', expectedModerationVersion: 1 });
        expect(restored.status).toBe(200);
        expect(restored.body.account).toMatchObject({ role: 'user', suspensionStatus: 'none', moderationVersion: 2 });
        expect(await query(`SELECT id, visibility FROM projects
            WHERE id IN ($1, $2) ORDER BY id`,
        ['lifecycle-project-selected-a', 'lifecycle-project-selected-z'])).toEqual([
            { id: 'lifecycle-project-selected-a', visibility: 'private' },
            { id: 'lifecycle-project-selected-z', visibility: 'private' },
        ]);
    });
});

describe('owner lifecycle locking and atomicity', () => {
    it('locks target first and projects in sorted order before one account update', async () => {
        await insertProject('lifecycle-project-lock-z', revocationTargetId);
        await insertProject('lifecycle-project-lock-a', revocationTargetId);
        dbHarness.queries = [];

        const response = await revoke(revocationTargetId, revocationBody({
            suspension: { expiresAt: null },
            projectIdsToUnpublish: ['lifecycle-project-lock-z', 'lifecycle-project-lock-a'],
        }));

        expect(response.status).toBe(200);
        const targetLockIndex = dbHarness.queries.findIndex(item =>
            /FROM "user" WHERE id = \$1 FOR UPDATE/.test(item.text) && item.params[0] === revocationTargetId);
        const projectLockIndex = dbHarness.queries.findIndex(item => /SELECT \* FROM projects .* FOR UPDATE/.test(item.text));
        const accountUpdateIndexes = dbHarness.queries
            .map((item, index) => /UPDATE "user"/.test(item.text) ? index : -1)
            .filter(index => index >= 0);
        expect(targetLockIndex).toBeGreaterThanOrEqual(0);
        expect(projectLockIndex).toBeGreaterThan(targetLockIndex);
        expect(dbHarness.queries[projectLockIndex].params).toEqual([
            'lifecycle-project-lock-a', 'lifecycle-project-lock-z',
        ]);
        expect(accountUpdateIndexes).toHaveLength(1);
        expect(accountUpdateIndexes[0]).toBeGreaterThan(projectLockIndex);
    });

    it('revalidates temporary expiry after locks without changing any state', async () => {
        const startedAt = Date.parse('2026-07-17T12:00:00.000Z');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
        const expiresAt = new Date(startedAt + 1000).toISOString();
        await resetFaultFixture();
        const before = await snapshotRevocationState();
        dbHarness.afterQueryPattern = /SELECT \* FROM projects/;
        dbHarness.afterQuery = () => nowSpy.mockReturnValue(startedAt + 1000);
        try {
            const response = await revoke(revocationTargetId, revocationBody({
                expectedModerationVersion: 7,
                suspension: { expiresAt },
                projectIdsToUnpublish: ['lifecycle-project-fault-a'],
            }));
            expect({ status: response.status, body: response.body }).toEqual({
                status: 400,
                body: { error: 'Invalid revocation request' },
            });
            dbHarness.afterQueryPattern = null;
            expect(await snapshotRevocationState()).toEqual(before);
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('rolls back every write when any revocation step fails', async () => {
        const cases = [
            ['role update', /UPDATE "user"/, 1, null, []],
            ['suspension update path', /UPDATE "user"/, 1, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['session deletion', /DELETE FROM session/, 1, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['first project update', /UPDATE projects SET visibility/, 1, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['second project update', /UPDATE projects SET visibility/, 2, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['demotion audit', /INSERT INTO platform_audit_actions/, 1, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['suspension audit', /INSERT INTO platform_audit_actions/, 2, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['first project audit', /INSERT INTO platform_audit_actions/, 3, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
            ['second project audit', /INSERT INTO platform_audit_actions/, 4, { expiresAt: null }, ['lifecycle-project-fault-b', 'lifecycle-project-fault-a']],
        ];

        for (const [label, pattern, failAt, suspension, projectIdsToUnpublish] of cases) {
            await resetFaultFixture();
            const before = await snapshotRevocationState();
            dbHarness.failPattern = pattern;
            dbHarness.failAt = failAt;
            dbHarness.matchCount = 0;
            const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

            const response = await revoke(revocationTargetId, revocationBody({
                reason: `Fault at ${label}`,
                expectedModerationVersion: 7,
                suspension,
                projectIdsToUnpublish,
            }));

            dbHarness.failPattern = null;
            expect({ label, status: response.status, body: response.body }).toEqual({
                label,
                status: 500,
                body: { error: 'Admin revocation failed' },
            });
            expect(await snapshotRevocationState()).toEqual(before);
            expect(errorLog).toHaveBeenCalledWith('Admin revocation failed:', expect.any(Error));
            errorLog.mockRestore();
        }
    });
});
