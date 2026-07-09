// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, TEST_PASSWORD } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('username plugin', () => {
    it('stores username at signup and returns it in the session', async () => {
        const cookie = await signUpUser(app, { email: 'handle@test.dev', username: 'planner_pro' });
        const res = await request(app).get('/api/auth/get-session').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('planner_pro');
    });
    it('rejects duplicate usernames', async () => {
        await signUpUser(app, { email: 'a1@test.dev', username: 'dupe' });
        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email: 'a2@test.dev', password: TEST_PASSWORD, name: 'A2', username: 'dupe' });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});

describe('is-username-available', () => {
    // Dedicated fixture for this block, inserted directly into the "user" table rather than via a
    // real /sign-up/email call (same raw-`query` technique already used for the admin-promotion
    // fixture in gallery.test.js). This keeps the block self-contained -- no dependency on the
    // 'username plugin' block above -- without adding a 4th sign-up-adjacent HTTP request to this
    // file: better-auth's built-in rate limiter caps those at 3 per 10s per IP+path
    // (getDefaultSpecialRules() in node_modules/better-auth/dist/api/rate-limiter/index.mjs, not
    // configurable via the rateLimit block in server/auth.js), and the block above already makes
    // exactly 3. is-username-available itself does a plain lookup on the user table's username
    // column (see node_modules/better-auth/dist/plugins/username/index.mjs), so a directly
    // inserted row is indistinguishable from one created via a real sign-up for this check.
    beforeAll(async () => {
        const { query } = await import('../../../server/db.js');
        const now = new Date().toISOString();
        await query(
            `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", username, "displayUsername")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['fixture-existing-username', 'Existing Username Fixture', 'existing-username-fixture@test.dev', 0, now, now, 'already_registered_handle', 'already_registered_handle']
        );
    });

    it('reports an existing username as unavailable', async () => {
        const res = await request(app).post('/api/auth/is-username-available').send({ username: 'already_registered_handle' });
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(false);
    });
    it('reports a new username as available', async () => {
        const res = await request(app).post('/api/auth/is-username-available').send({ username: 'brand_new_handle_xyz' });
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(true);
    });
});
