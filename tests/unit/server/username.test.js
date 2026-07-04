// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

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
            .send({ email: 'a2@test.dev', password: 'password1234', name: 'A2', username: 'dupe' });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});

describe('is-username-available', () => {
    it('reports an existing username as unavailable', async () => {
        // Reuses the 'dupe' account created by 'rejects duplicate usernames' above instead of
        // signing up a new one here: better-auth's built-in rate limiter caps sign-up/sign-in/
        // change-password/change-email requests at 3 per 10s per IP+path (getDefaultSpecialRules()
        // in node_modules/better-auth/dist/api/rate-limiter/index.mjs — not configurable via the
        // rateLimit block in server/auth.js, which only affects its *other* default rules), and the
        // 'username plugin' block above already makes 3 such requests, so a 4th deterministically 429s.
        const res = await request(app).post('/api/auth/is-username-available').send({ username: 'dupe' });
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(false);
    });
    it('reports a new username as available', async () => {
        const res = await request(app).post('/api/auth/is-username-available').send({ username: 'brand_new_handle_xyz' });
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(true);
    });
});
