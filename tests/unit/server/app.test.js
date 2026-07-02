// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp } from './helpers.js';

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
        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email: 'first@test.dev', password: 'password1234', name: 'First' });
        expect(res.status).toBe(200);
        expect(res.headers['set-cookie']).toBeDefined();
    });
});
