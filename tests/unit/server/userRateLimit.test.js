// tests/unit/server/userRateLimit.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, saveProjectCommit } from './helpers.js';

let app;
beforeAll(async () => {
    process.env.USER_COMMITS_PER_HOUR = '2';
    app = await initTestApp();
});
afterAll(() => { delete process.env.USER_COMMITS_PER_HOUR; });

describe('per-user write rate limit', () => {
    it('blocks a user after USER_COMMITS_PER_HOUR content writes, without affecting other users', async () => {
        const heavy = await signUpUser(app, { email: 'heavy@test.dev', username: 'heavy_u' });
        const calm = await signUpUser(app, { email: 'calm@test.dev', username: 'calm_u' });

        const p = await request(app).post('/api/projects').set('Cookie', heavy)
            .send({ name: 'R1', state: minimalState('r0') });                          // write 1
        expect(p.status).toBe(201);
        const c1 = await saveProjectCommit(app, heavy, p.body.project.id,
            { state: minimalState('r1'), message: 'c1' }, p.body.commit.id);           // write 2
        expect(c1.status).toBe(201);
        const c2 = await saveProjectCommit(app, heavy, p.body.project.id,
            { state: minimalState('r2'), message: 'c2' }, c1.body.commit.id);           // write 3 — over
        expect(c2.status).toBe(429);
        expect(c2.body.code).toBe('RATE_LIMITED');

        const other = await request(app).post('/api/projects').set('Cookie', calm)
            .send({ name: 'Calm', state: minimalState('calm') });
        expect(other.status).toBe(201);
    });
});
