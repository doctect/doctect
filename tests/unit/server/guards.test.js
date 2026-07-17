// @vitest-environment node
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
let ownerProbe;
let requiredCookie;
let optionalCookie;
let adminCookie;
let ownerCookie;
let normalizedUserCookie;
const originalOwnerEmails = process.env.OWNER_EMAILS;
beforeAll(async () => {
    process.env.OWNER_EMAILS = '';
    app = await initTestApp();
    requiredCookie = await signUpUser(app, { email: 'required-guard@test.dev', username: 'required_guard' });
    optionalCookie = await signUpUser(app, { email: 'optional-guard@test.dev', username: 'optional_guard' });
    adminCookie = await signUpUser(app, { email: 'fresh-admin@test.dev', username: 'fresh_admin' });
    ownerCookie = await signUpUser(app, { email: 'fresh-owner@test.dev', username: 'fresh_owner' });
    normalizedUserCookie = await signUpUser(app, { email: 'fresh-user@test.dev', username: 'fresh_user' });

    const { query } = await import('../../../server/db.js');
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['fresh-admin@test.dev']);
    await query(`UPDATE "user" SET role = 'owner' WHERE email = $1`, ['fresh-owner@test.dev']);
    await query(`UPDATE "user" SET role = 'unexpected', banned = 0, "banExpires" = NULL,
        "moderationVersion" = 7 WHERE email = $1`, ['fresh-user@test.dev']);

    const { requireOwner } = await import('../../../server/middleware/guards.js');
    ownerProbe = express();
    ownerProbe.get('/owner', requireOwner, (req, res) => res.json({ role: req.user.role }));
});

afterAll(() => {
    if (originalOwnerEmails === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = originalOwnerEmails;
});

describe('security guards', () => {
    it('rejects mutating requests from untrusted origins', async () => {
        const res = await request(app)
            .post('/api/track')
            .set('Origin', 'https://evil.example.com')
            .send({ type: 'x', payload: {} });
        expect(res.status).toBe(403);
    });
    it('allows mutating requests without an Origin header (same-origin/native)', async () => {
        const res = await request(app).post('/api/track').send({ type: 'x', payload: {} });
        expect(res.status).toBe(201);
    });
    it('allows mutating requests from a trusted origin', async () => {
        const res = await request(app)
            .post('/api/track')
            .set('Origin', 'http://localhost:3000')
            .send({ type: 'x', payload: {} });
        expect(res.status).toBe(201);
    });
    it('allows the If-Match header used by cross-origin conditional publishes', async () => {
        const res = await request(app)
            .options('/api/projects/project-1/publish')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,if-match');

        const allowedHeaders = res.headers['access-control-allow-headers']
            .toLowerCase()
            .split(',')
            .map(header => header.trim());
        expect(allowedHeaders).toContain('if-match');
    });

    it('freshly rejects and cleans a preexisting session after direct active suspension state', async () => {
        const { query } = await import('../../../server/db.js');
        const user = (await query('SELECT id FROM "user" WHERE email = $1', ['required-guard@test.dev']))[0];
        await query(`UPDATE "user" SET banned = $1, "banExpires" = NULL WHERE id = $2`, [1, user.id]);

        const res = await request(app).get('/api/projects').set('Cookie', requiredCookie);

        expect(res.status).toBe(401);
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [user.id])).toEqual([]);
    });

    it('freshly nulls optional auth and cleans all sessions after direct active suspension state', async () => {
        const { query } = await import('../../../server/db.js');
        const user = (await query('SELECT id FROM "user" WHERE email = $1', ['optional-guard@test.dev']))[0];
        await query(`UPDATE "user" SET banned = $1, "banExpires" = $2 WHERE id = $3`,
            [1, '2999-01-01T00:00:00.000Z', user.id]);

        const res = await request(app).get('/api/me').set('Cookie', optionalCookie);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ user: null });
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [user.id])).toEqual([]);
    });

    it('uses fresh admin authority and rejects the same session immediately after demotion', async () => {
        const promoted = await request(app).get('/api/stats').set('Cookie', adminCookie);
        expect(promoted.status).toBe(200);

        const adminOwnerProbe = await request(ownerProbe).get('/owner').set('Cookie', adminCookie);
        expect(adminOwnerProbe.status).toBe(403);

        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user" SET role = 'user' WHERE email = $1`, ['fresh-admin@test.dev']);

        const demoted = await request(app).get('/api/stats').set('Cookie', adminCookie);
        expect(demoted.status).toBe(403);
    });

    it('authorizes configured fresh owners and revokes owner-only access when configuration changes', async () => {
        process.env.OWNER_EMAILS = ' FRESH-OWNER@test.dev ';

        const stats = await request(app).get('/api/stats').set('Cookie', ownerCookie);
        expect(stats.status).toBe(200);
        const configured = await request(ownerProbe).get('/owner').set('Cookie', ownerCookie);
        expect(configured.status).toBe(200);
        expect(configured.body).toEqual({ role: 'owner' });

        process.env.OWNER_EMAILS = 'someone-else@test.dev';
        const removedStats = await request(app).get('/api/stats').set('Cookie', ownerCookie);
        expect(removedStats.status).toBe(403);
        const removed = await request(ownerProbe).get('/owner').set('Cookie', ownerCookie);
        expect(removed.status).toBe(403);
    });

    it('returns a fresh normalized role from /api/me without moderation fields', async () => {
        const res = await request(app).get('/api/me').set('Cookie', normalizedUserCookie);

        expect(res.status).toBe(200);
        expect(res.body.user).toEqual({
            id: expect.any(String),
            email: 'fresh-user@test.dev',
            username: 'fresh_user',
            role: 'user',
        });
        expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'role', 'username']);
    });
});
