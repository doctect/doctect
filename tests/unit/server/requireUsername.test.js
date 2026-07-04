// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUserNoUsername, minimalState, PNG_1X1 } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('requireUsername gate', () => {
    // Shared across all five "blocks" tests below rather than signing up separately in each: none
    // of them ever succeeds in setting a username (the gate 403s before any route logic runs), so
    // the same no-username account is valid precondition state for all five. This also keeps this
    // file's sign-up volume within better-auth's built-in rate limiter, which caps sign-up/sign-in/
    // change-password/change-email requests at 3 per 10s per IP+path (getDefaultSpecialRules() in
    // node_modules/better-auth/dist/api/rate-limiter/index.mjs) -- 6 independent sign-ups in one
    // file/app-instance deterministically 429s starting at the 4th.
    let cookie;
    beforeAll(async () => {
        cookie = await signUpUserNoUsername(app, { email: 'nouser1@test.dev', name: 'No User' });
    });

    it('blocks creating a cloud project without a username', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Blocked Project', state: minimalState() });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks saving a commit without a username', async () => {
        // requireUsername must fire before loadProject -- a nonexistent id still 403s, not 404s.
        const res = await request(app).post('/api/projects/nonexistent-id/commits').set('Cookie', cookie)
            .send({ state: minimalState(), message: 'Update' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks publishing without a username', async () => {
        const res = await request(app).post('/api/projects/nonexistent-id/publish').set('Cookie', cookie)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks forking without a username', async () => {
        const res = await request(app).post('/api/projects/nonexistent-id/fork').set('Cookie', cookie);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks opening a merge request without a username', async () => {
        const res = await request(app).post('/api/merge-requests').set('Cookie', cookie)
            .send({ sourceProjectId: 'nonexistent-id', title: 'Propose it' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('allows creating a cloud project once a username is set', async () => {
        // Its own dedicated account: this is the one test in the block that sets a username, and
        // must not disturb the shared no-username fixture used by the tests above.
        const freshCookie = await signUpUserNoUsername(app, { email: 'nouser6@test.dev', name: 'No User Six' });
        const update = await request(app).post('/api/auth/update-user').set('Cookie', freshCookie).send({ username: 'now_has_one' });
        expect(update.status).toBe(200);
        const res = await request(app).post('/api/projects').set('Cookie', freshCookie)
            .send({ name: 'Now Allowed', state: minimalState() });
        expect(res.status).toBe(201);
    });
});
