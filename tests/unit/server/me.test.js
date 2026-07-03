// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('GET /api/me', () => {
    it('returns null user when anonymous', async () => {
        const res = await request(app).get('/api/me');
        expect(res.status).toBe(200);
        expect(res.body.user).toBeNull();
    });
    it('returns the session user when authenticated', async () => {
        const cookie = await signUpUser(app, { email: 'me@test.dev', username: 'me_user' });
        const res = await request(app).get('/api/me').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('me_user');
        expect(res.body.user.email).toBe('me@test.dev');
    });
});
