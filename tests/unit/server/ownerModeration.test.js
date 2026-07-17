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
const GLOBAL_ACTOR_EMAIL = 'global.actor@test.dev';
const GLOBAL_TARGET_EMAIL = 'global.target@test.dev';
const GLOBAL_PAGE_TIME = '2099-01-02T00:00:00.123Z';
const GLOBAL_ACTION_TIME = '2099-01-01T12:00:00.000Z';
const GLOBAL_ACTIONS = [
    'owner_granted',
    'owner_removed',
    'admin_promoted',
    'admin_demoted',
    'account_suspended',
    'account_restored',
    'project_unpublished',
    'review_deleted',
];
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
const globalAudit = (filters = {}, cookie = ownerCookie) => request(app)
    .get('/api/owner/audit')
    .query(filters)
    .set('Cookie', cookie);
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

const insertGlobalAudit = async ({
    id, actorKind = 'user', actorUserId = 'global-actor', actorEmail = GLOBAL_ACTOR_EMAIL,
    targetUserId = promotionTargetId, targetEmail = GLOBAL_TARGET_EMAIL, action,
    reason = `Global audit ${action}`, createdAt, metadata,
}) => query(`INSERT INTO platform_audit_actions
    (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, project_id,
     review_id, action, reason, expires_at, created_at, metadata_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $12)`,
[id, actorKind, actorUserId, actorEmail, targetUserId, targetEmail,
    action === 'project_unpublished' || action === 'review_deleted' ? 'global-project' : null,
    action === 'review_deleted' ? 'global-private-review' : null, action, reason, createdAt,
    JSON.stringify(metadata)]);

const snapshotLifecycleState = async (targetId, projectPrefix = null) => ({
    user: await query('SELECT * FROM "user" WHERE id = $1', [targetId]),
    sessions: await query('SELECT * FROM session WHERE "userId" = $1 ORDER BY id', [targetId]),
    projects: projectPrefix === null
        ? []
        : await query('SELECT * FROM projects WHERE id LIKE $1 ORDER BY id', [`${projectPrefix}%`]),
    audit: await query('SELECT * FROM platform_audit_actions WHERE target_user_id = $1 ORDER BY rowid', [targetId]),
});

const resetPromotionFaultFixture = async () => {
    dbHarness.failPattern = null;
    await query('DELETE FROM session WHERE "userId" = $1', [promotionTargetId]);
    await query(`UPDATE "user"
        SET role = 'user', banned = 1, "banReason" = 'expired promotion fixture',
            "banExpires" = '2026-01-01T00:00:00.000Z', "moderationVersion" = 4,
            "updatedAt" = '2026-07-17T00:00:00.000Z'
        WHERE id = $1`, [promotionTargetId]);
    await insertSession(promotionTargetId, 'promotion-fault-a');
    await insertSession(promotionTargetId, 'promotion-fault-b');
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
    dbHarness.postgresMode = true;
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

describe('owner global audit', () => {
    beforeAll(async () => {
        const metadataByAction = {
            owner_granted: { source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner' },
            owner_removed: { source: 'owner_emails_reconciliation', previousRole: 'owner', newRole: 'user' },
            admin_promoted: { source: 'owner_role_workflow', previousRole: 'user', newRole: 'admin' },
            admin_demoted: { source: 'owner_role_workflow', previousRole: 'admin', newRole: 'user' },
            account_suspended: { source: 'account_workflow' },
            account_restored: { source: 'account_workflow' },
            project_unpublished: { source: 'standalone_project', previousProjectVisibility: 'public' },
            review_deleted: { source: 'standalone_review', deletedReviewRating: 4 },
        };
        for (const [index, action] of GLOBAL_ACTIONS.entries()) {
            await insertGlobalAudit({
                id: `global-action-${action}`,
                actorKind: action.startsWith('owner_') ? 'system' : 'user',
                actorUserId: action.startsWith('owner_') ? null : 'global-actor',
                actorEmail: action.startsWith('owner_') ? 'OWNER_EMAILS reconciliation' : GLOBAL_ACTOR_EMAIL,
                targetUserId: action === 'owner_granted' ? OWNER_TARGET_ID : promotionTargetId,
                action,
                createdAt: new Date(Date.parse(GLOBAL_ACTION_TIME) + index * 1000).toISOString(),
                metadata: metadataByAction[action],
            });
        }
        for (let index = 0; index < 26; index += 1) {
            await insertGlobalAudit({
                id: `global-page-${String(index).padStart(2, '0')}`,
                actorEmail: 'Page.Actor@Test.Dev',
                targetEmail: 'Page.Target@Test.Dev',
                action: 'account_restored',
                reason: `Global page ${index}`,
                createdAt: GLOBAL_PAGE_TIME,
                metadata: { source: 'account_workflow' },
            });
        }
        await query(`INSERT INTO reviews
            (id, project_id, user_id, rating, body, created_at, updated_at)
            VALUES ($1, $2, $3, 4, $4, $5, $6)`,
        ['global-private-review', 'global-project', promotionTargetId,
            'GLOBAL_PRIVATE_REVIEW_BODY', GLOBAL_ACTION_TIME, GLOBAL_ACTION_TIME]);
    });

    beforeEach(() => {
        dbHarness.postgresMode = false;
        dbHarness.queries = [];
    });

    it('keeps global audit owner-only with exact authorization envelopes', async () => {
        const anonymous = await request(app).get('/api/owner/audit');
        expect({ status: anonymous.status, body: anonymous.body }).toEqual({
            status: 401, body: { error: 'Unauthorized' },
        });
        for (const cookie of [adminCookie, userCookie]) {
            const denied = await globalAudit({}, cookie);
            expect({ status: denied.status, body: denied.body }).toEqual({
                status: 403, body: { error: 'Forbidden: Owners only' },
            });
        }
        expect((await globalAudit({ actorEmail: GLOBAL_ACTOR_EMAIL })).status).toBe(200);
    });

    it('applies normalized exact global audit filters, all actions, and inclusive dates', async () => {
        for (const action of GLOBAL_ACTIONS) {
            const response = await globalAudit({ action });
            expect(response.status).toBe(200);
            expect(response.body.items.length).toBeGreaterThan(0);
            expect(response.body.items.every(item => item.action === action)).toBe(true);
        }

        dbHarness.queries = [];
        const response = await globalAudit({
            actorEmail: `  ${GLOBAL_ACTOR_EMAIL.toUpperCase()}  `,
            targetEmail: `  ${GLOBAL_TARGET_EMAIL.toUpperCase()}  `,
            action: 'admin_promoted',
            from: '2099-01-01T12:00:02.000Z',
            to: '2099-01-01T12:00:02.000Z',
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [expect.objectContaining({
                id: 'global-action-admin_promoted',
                actorEmail: GLOBAL_ACTOR_EMAIL,
                targetEmail: GLOBAL_TARGET_EMAIL,
                action: 'admin_promoted',
                createdAt: '2099-01-01T12:00:02.000Z',
            })],
            nextCursor: null,
        });
        const sql = dbHarness.queries.find(item => /FROM platform_audit_actions/.test(item.text));
        expect(sql.params).toEqual([
            GLOBAL_ACTOR_EMAIL, GLOBAL_TARGET_EMAIL, 'admin_promoted',
            '2099-01-01T12:00:02.000Z', '2099-01-01T12:00:02.000Z',
        ]);
        expect(sql.text).not.toMatch(/CAST\(\$\d+ AS TIMESTAMP\)/);
        expect(sql.text.match(/\$\d+/g)).toEqual(['$1', '$2', '$3', '$4', '$5']);
    });

    it('rejects every malformed global audit filter before audit SQL', async () => {
        const invalidQueries = [
            { actorEmail: ' ' },
            { targetEmail: 'x'.repeat(321) },
            { actorEmail: [GLOBAL_ACTOR_EMAIL, 'other@test.dev'] },
            { action: 'account_deleted' },
            { action: ' admin_promoted' },
            { from: '2099-01-01' },
            { from: '2099-02-30T00:00:00.000Z' },
            { to: '2099-01-01T00:00:00+1500' },
            { from: '2099-01-02T00:00:00.000Z', to: '2099-01-01T00:00:00.000Z' },
            { cursor: 'broken' },
            { cursor: 'x'.repeat(513) },
            { cursor: Buffer.from(JSON.stringify([GLOBAL_PAGE_TIME, 'global-page-01'])).toString('base64url') + '=' },
        ];

        for (const filters of invalidQueries) {
            dbHarness.queries = [];
            const response = await globalAudit(filters);
            expect({ filters, status: response.status }).toEqual({ filters, status: 400 });
            expect(dbHarness.queries.some(item => /FROM platform_audit_actions/.test(item.text))).toBe(false);
        }
    });

    it('paginates same-timestamp global audit rows with a canonical stable cursor', async () => {
        const first = await globalAudit({ actorEmail: '  PAGE.ACTOR@TEST.DEV ' });
        expect(first.status).toBe(200);
        expect(Object.keys(first.body).sort()).toEqual(['items', 'nextCursor']);
        expect(first.body.items.map(item => item.id)).toEqual(
            Array.from({ length: 25 }, (_, index) => `global-page-${String(25 - index).padStart(2, '0')}`),
        );
        const decoded = JSON.parse(Buffer.from(first.body.nextCursor, 'base64url').toString('utf8'));
        expect(decoded).toEqual([GLOBAL_PAGE_TIME, 'global-page-01']);
        expect(Buffer.from(JSON.stringify(decoded)).toString('base64url')).toBe(first.body.nextCursor);

        dbHarness.queries = [];
        const second = await globalAudit({ actorEmail: 'page.actor@test.dev', cursor: first.body.nextCursor });
        expect(second.body).toEqual({
            items: [expect.objectContaining({ id: 'global-page-00' })],
            nextCursor: null,
        });
        const sql = dbHarness.queries.find(item => /FROM platform_audit_actions/.test(item.text));
        expect(sql.params).toEqual([
            'page.actor@test.dev', GLOBAL_PAGE_TIME, GLOBAL_PAGE_TIME, 'global-page-01',
        ]);
        const placeholders = sql.text.match(/\$\d+/g);
        expect(placeholders).toEqual(['$1', '$2', '$3', '$4']);
        expect(new Set(placeholders).size).toBe(placeholders.length);

        dbHarness.postgresMode = true;
        dbHarness.queries = [];
        const postgres = await globalAudit({ from: GLOBAL_ACTION_TIME, to: GLOBAL_PAGE_TIME, cursor: first.body.nextCursor });
        expect(postgres.status).toBe(200);
        const postgresSql = dbHarness.queries.find(item => /FROM platform_audit_actions/.test(item.text));
        expect(postgresSql.text.match(/CAST\(\$\d+ AS TIMESTAMP\)/g)).toEqual([
            'CAST($1 AS TIMESTAMP)', 'CAST($2 AS TIMESTAMP)',
            'CAST($3 AS TIMESTAMP)', 'CAST($4 AS TIMESTAMP)',
        ]);
        const postgresPlaceholders = postgresSql.text.match(/\$\d+/g);
        expect(new Set(postgresPlaceholders).size).toBe(postgresPlaceholders.length);
    });

    it('returns only safe global audit DTOs and keeps system rows out of target history', async () => {
        const response = await globalAudit({ action: 'owner_granted' });
        expect(response.status).toBe(200);
        expect(response.body.items.map(item => item.id)).toContain('global-action-owner_granted');
        expect(Object.keys(response.body.items[0]).sort()).toEqual([
            'action', 'actorEmail', 'actorKind', 'actorUserId', 'createdAt', 'expiresAt', 'id',
            'metadata', 'projectId', 'reason', 'reviewId', 'targetEmail', 'targetUserId',
        ]);
        expect(JSON.stringify(response.body)).not.toMatch(/password|token|session|ipAddress|GLOBAL_PRIVATE_REVIEW_BODY/i);

        const detail = await request(app).get(`/api/admin/users/${OWNER_TARGET_ID}`).set('Cookie', ownerCookie);
        expect(detail.status).toBe(200);
        expect(detail.body.history.items.map(item => item.id)).not.toContain('global-action-owner_granted');
    });
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

        const conflict = {
            status: 409,
            body: { error: 'Role or moderation state changed; refresh and try again' },
        };

        await query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [promotionTargetId]);
        const adminPromotion = await promote(promotionTargetId, promotionBody());
        expect({ status: adminPromotion.status, body: adminPromotion.body }).toEqual(conflict);
        await query(`UPDATE "user" SET role = 'user', banned = 1, "banExpires" = NULL WHERE id = $1`, [promotionTargetId]);
        const suspendedPromotion = await promote(promotionTargetId, promotionBody());
        expect({ status: suspendedPromotion.status, body: suspendedPromotion.body }).toEqual(conflict);
        await query(`UPDATE "user" SET role = 'user' WHERE id = $1`, [revocationTargetId]);
        const userRevocation = await revoke(revocationTargetId, revocationBody());
        expect({ status: userRevocation.status, body: userRevocation.body }).toEqual(conflict);
        await query(`UPDATE "user" SET role = 'admin', "moderationVersion" = 1 WHERE id = $1`, [revocationTargetId]);
        const stale = await revoke(revocationTargetId, revocationBody());
        expect({ status: stale.status, body: stale.body }).toEqual(conflict);
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
        const sessionsBefore = await query(`SELECT id, "expiresAt" FROM session
            WHERE "userId" = $1 ORDER BY id`, [promotionTargetId]);
        expect(sessionsBefore).toHaveLength(2);
        expect(sessionsBefore.every(session => new Date(session.expiresAt).getTime() > Date.now())).toBe(true);
        expect((await request(app).get('/api/projects').set('Cookie', oldCookie)).status).toBe(200);

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
    it('rejects foreign, private, and unpublished project selections without changing any state', async () => {
        const foreignOwnerId = await userIdFor(USER_EMAIL);
        await insertProject('lifecycle-project-invalid-foreign', foreignOwnerId);
        await insertProject('lifecycle-project-invalid-private', revocationTargetId, 'private');
        await insertProject('lifecycle-project-invalid-unpublished', revocationTargetId, 'public', null);
        await insertSession(revocationTargetId, 'invalid-selection');
        const before = await snapshotLifecycleState(revocationTargetId, 'lifecycle-project-invalid-');

        for (const projectId of [
            'lifecycle-project-invalid-foreign',
            'lifecycle-project-invalid-private',
            'lifecycle-project-invalid-unpublished',
        ]) {
            const response = await revoke(revocationTargetId, revocationBody({
                reason: `Reject ${projectId}`,
                projectIdsToUnpublish: [projectId],
            }));

            expect({ status: response.status, body: response.body }).toEqual({
                status: 409,
                body: { error: 'Role or moderation state changed; refresh and try again' },
            });
            expect(await snapshotLifecycleState(revocationTargetId, 'lifecycle-project-invalid-')).toEqual(before);
        }
    });

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

    it('rolls back complete promotion state when any write fails', async () => {
        const cases = [
            ['role update', /UPDATE "user"/],
            ['session deletion', /DELETE FROM session/],
            ['audit insertion', /INSERT INTO platform_audit_actions/],
        ];

        for (const [label, pattern] of cases) {
            await resetPromotionFaultFixture();
            const before = await snapshotLifecycleState(promotionTargetId);
            dbHarness.failPattern = pattern;
            dbHarness.failAt = 1;
            dbHarness.matchCount = 0;
            const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

            const response = await promote(promotionTargetId, promotionBody({
                reason: `Promotion fault at ${label}`,
                expectedModerationVersion: 4,
            }));

            dbHarness.failPattern = null;
            expect({ label, status: response.status, body: response.body }).toEqual({
                label,
                status: 500,
                body: { error: 'Admin promotion failed' },
            });
            expect(await snapshotLifecycleState(promotionTargetId)).toEqual(before);
            expect(errorLog).toHaveBeenCalledWith('Admin promotion failed:', expect.any(Error));
            errorLog.mockRestore();
        }
    });
});
