// tests/unit/server/projectsUsage.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, saveProjectCommit } from './helpers.js';

let app, cookie;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'usage@test.dev', username: 'usage_u' });
});

describe('GET /api/projects usage', () => {
    it('reports per-project size/commit count and overall usage vs quota', async () => {
        const p = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Usage', state: minimalState('u0') });
        await saveProjectCommit(app, cookie, p.body.project.id,
            { state: minimalState('u1'), message: 'second' }, p.body.commit.id);

        const res = await request(app).get('/api/projects').set('Cookie', cookie);
        expect(res.status).toBe(200);
        const proj = res.body.projects.find(x => x.id === p.body.project.id);
        expect(proj.commitCount).toBe(2);
        expect(proj.storedBytes).toBeGreaterThan(0);
        expect(res.body.usage.usedBytes).toBeGreaterThanOrEqual(proj.storedBytes);
        expect(res.body.usage.quotaBytes).toBe(50 * 1024 * 1024);
        // Existing DTO fields must survive untouched:
        expect(proj.name).toBe('Usage');
        expect(proj.visibility).toBe('private');
    });
});
