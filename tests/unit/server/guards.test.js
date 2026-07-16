// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
let requiredCookie;
let optionalCookie;
beforeAll(async () => {
    app = await initTestApp();
    requiredCookie = await signUpUser(app, { email: 'required-guard@test.dev', username: 'required_guard' });
    optionalCookie = await signUpUser(app, { email: 'optional-guard@test.dev', username: 'optional_guard' });
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
});
