// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

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
});
