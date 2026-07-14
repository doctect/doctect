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
});
