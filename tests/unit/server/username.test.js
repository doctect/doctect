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
