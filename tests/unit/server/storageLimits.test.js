// tests/unit/server/storageLimits.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, cookie, fresh, forker;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'limits@test.dev', username: 'limits_u' });
});
afterEach(() => {
    delete process.env.USER_STORAGE_QUOTA_MB;
    delete process.env.MAX_TOTAL_STORAGE_MB;
    delete process.env.MAX_PROJECTS_PER_USER;
    delete process.env.MAX_PUBLIC_PROJECTS_PER_USER;
});

describe('storage quota', () => {
    it('rejects a commit that would exceed the per-user quota', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Quota', state: minimalState('q0') });
        process.env.USER_STORAGE_QUOTA_MB = '0.0000001'; // ~0.1 bytes: anything trips it
        const res = await request(app).post(`/api/projects/${created.body.project.id}/commits`)
            .set('Cookie', cookie).send({ state: minimalState('q1'), message: 'over' });
        expect(res.status).toBe(413);
        expect(res.body.code).toBe('STORAGE_QUOTA_EXCEEDED');
    });

    it('rejects project creation over the global ceiling with 507', async () => {
        process.env.MAX_TOTAL_STORAGE_MB = '0.0000001';
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Full', state: minimalState() });
        expect(res.status).toBe(507);
        expect(res.body.code).toBe('SERVICE_STORAGE_FULL');
    });

    it('allows writes when comfortably under quota', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Fine', state: minimalState('fine') });
        expect(res.status).toBe(201);
    });
});

// Identity reuse note: better-auth hardcodes a 3-per-10s-per-IP+path limit on
// /api/auth/sign-up/email (getDefaultSpecialRules() in
// node_modules/better-auth/dist/api/rate-limiter/index.mjs; not configurable via the
// rateLimit block in server/auth.js -- same constraint already documented in
// requireUsername.test.js and username.test.js). This file needs several identities in
// different ownership roles; rather than one signUpUser call per role (5 total, over
// budget), roles that don't need a *clean* precondition reuse an already-signed-up
// cookie from an earlier test: `fresh` (0 projects when created, for the count-cap
// boundary test) doubles as the fork target's owner below (its own project count is
// irrelevant to that test), and `forker` (0 projects at the top of the fork test)
// doubles as the publish-cap user in the next describe block (its one pre-existing
// *private* project doesn't count against MAX_PUBLIC_PROJECTS_PER_USER). Total real
// sign-ups in this file: 3 (limits_u, cap_u, capfork_u).
describe('project count cap', () => {
    it('rejects creating a project beyond MAX_PROJECTS_PER_USER', async () => {
        fresh = await signUpUser(app, { email: 'cap@test.dev', username: 'cap_u' });
        process.env.MAX_PROJECTS_PER_USER = '1';
        const first = await request(app).post('/api/projects').set('Cookie', fresh)
            .send({ name: 'One', state: minimalState('one') });
        expect(first.status).toBe(201);
        const second = await request(app).post('/api/projects').set('Cookie', fresh)
            .send({ name: 'Two', state: minimalState('two') });
        expect(second.status).toBe(403);
        expect(second.body.code).toBe('PROJECT_LIMIT_REACHED');
    });

    it('rejects forking beyond the cap too', async () => {
        const pub = await request(app).post('/api/projects').set('Cookie', fresh)
            .send({ name: 'Pub', state: minimalState('pub') });
        await request(app).post(`/api/projects/${pub.body.project.id}/publish`).set('Cookie', fresh)
            .set('If-Match', pub.body.project.headCommitId)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        forker = await signUpUser(app, { email: 'capfork@test.dev', username: 'capfork_u' });
        await request(app).post('/api/projects').set('Cookie', forker)
            .send({ name: 'Mine', state: minimalState('mine') });
        process.env.MAX_PROJECTS_PER_USER = '1';
        const fork = await request(app).post(`/api/projects/${pub.body.project.id}/fork`).set('Cookie', forker);
        expect(fork.status).toBe(403);
        expect(fork.body.code).toBe('PROJECT_LIMIT_REACHED');
    });
});

describe('publish cap', () => {
    it('rejects publishing beyond MAX_PUBLIC_PROJECTS_PER_USER, but re-publishing an already-public project is fine', async () => {
        const p1 = await request(app).post('/api/projects').set('Cookie', forker)
            .send({ name: 'P1', state: minimalState('p1') });
        const p2 = await request(app).post('/api/projects').set('Cookie', forker)
            .send({ name: 'P2', state: minimalState('p2') });
        process.env.MAX_PUBLIC_PROJECTS_PER_USER = '1';
        const pub1 = await request(app).post(`/api/projects/${p1.body.project.id}/publish`).set('Cookie', forker)
            .set('If-Match', p1.body.project.headCommitId)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        expect(pub1.status).toBe(200);
        const pub2 = await request(app).post(`/api/projects/${p2.body.project.id}/publish`).set('Cookie', forker)
            .set('If-Match', p2.body.project.headCommitId)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        expect(pub2.status).toBe(403);
        expect(pub2.body.code).toBe('PUBLIC_LIMIT_REACHED');
        const repub = await request(app).post(`/api/projects/${p1.body.project.id}/publish`).set('Cookie', forker)
            .set('If-Match', p1.body.project.headCommitId)
            .send({ description: 'updated', tags: [], thumbnails: [PNG_1X1] });
        expect(repub.status).toBe(200);
    });
});
