// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, TEST_PASSWORD, markVerified } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

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
});
