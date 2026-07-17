// @vitest-environment node
import { afterEach, describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, TEST_PASSWORD, markVerified } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

afterEach(async () => {
    process.env.OWNER_EMAILS = '';
    const { query } = await import('../../../server/db.js');
    await query('DROP TRIGGER IF EXISTS fail_owner_signup_audit');
    vi.restoreAllMocks();
});

describe('app factory', () => {
    it('tracks events', async () => {
        const res = await request(app).post('/api/track').send({ type: 'unit', payload: {} });
        expect(res.status).toBe(201);
    });
    it('rejects /api/stats without a session', async () => {
        const res = await request(app).get('/api/stats');
        expect(res.status).toBe(401);
    });
    it('signs up a user via better-auth and sets a session cookie', async () => {
        const email = 'first@test.dev';
        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'First' });
        expect(res.status).toBe(200);
        // Email verification is required, so sign-up itself no longer grants a session;
        // verify (as the emailed link would) and sign in to confirm the account works.
        await markVerified(email);
        const signin = await request(app)
            .post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(signin.status).toBe(200);
        expect(signin.headers['set-cookie']).toBeDefined();
    });

    it('reconciles a configured signup to owner with an audit and no signup session', async () => {
        const email = 'configured-signup-owner@test.dev';
        process.env.OWNER_EMAILS = ` ${email.toUpperCase()} `;

        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'Configured Owner' });

        expect(res.status).toBe(200);
        const { query } = await import('../../../server/db.js');
        const [user] = await query(`SELECT id, role, "moderationVersion" FROM "user" WHERE email = $1`, [email]);
        expect(user).toEqual(expect.objectContaining({ role: 'owner', moderationVersion: 1 }));
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [user.id])).toEqual([]);
        expect(await query(`SELECT actor_kind, actor_user_id, actor_email, action, reason, metadata_json
            FROM platform_audit_actions WHERE target_user_id = $1`, [user.id])).toEqual([
            expect.objectContaining({
                actor_kind: 'system',
                actor_user_id: null,
                actor_email: 'OWNER_EMAILS reconciliation',
                action: 'owner_granted',
                reason: 'Synchronize account role with OWNER_EMAILS configuration',
                metadata_json: JSON.stringify({
                    source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner',
                }),
            }),
        ]);
    });

    it('finishes configured signup without authority when owner audit insertion fails', async () => {
        const email = 'failed-signup-owner@test.dev';
        process.env.OWNER_EMAILS = email;
        const { query } = await import('../../../server/db.js');
        await query(`CREATE TRIGGER fail_owner_signup_audit
            BEFORE INSERT ON platform_audit_actions
            BEGIN SELECT RAISE(ABORT, 'injected owner signup audit failure'); END`);
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'Failed Owner' });

        expect(res.status).toBe(200);
        const [user] = await query(`SELECT id, role, "moderationVersion" FROM "user" WHERE email = $1`, [email]);
        expect(user).toEqual(expect.objectContaining({ role: 'user', moderationVersion: 0 }));
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [user.id])).toEqual([]);
        expect(await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1', [user.id]))
            .toEqual([]);
        expect(errorLog).toHaveBeenCalledWith('Owner signup reconciliation failed:', expect.any(Error));
    });
});
