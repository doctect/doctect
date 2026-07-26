// tests/unit/server/userRateLimit.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, saveProjectCommit, PNG_1X1 } from './helpers.js';
import { publicationTag } from '../../../shared/publicationTag.js';

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

    it('counts listing edits against the same per-user write budget', async () => {
        const editor = await signUpUser(app, { email: 'editor@test.dev', username: 'editor_u' });
        const created = await request(app).post('/api/projects').set('Cookie', editor)
            .send({ name: 'Listing Budget', state: minimalState('root') });        // write 1
        expect(created.status).toBe(201);
        const id = created.body.project.id;

        const published = await request(app).post(`/api/projects/${id}/publish`).set('Cookie', editor)
            .set('If-Match', `"${created.body.project.headCommitId}"`)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        expect(published.status).toBe(200);   // publish carries no limiter today

        // The listing edit carries a token for the listing it was loaded against. Built from
        // the gallery DTO exactly as the client builds it: headCommitId is published_commit_id
        // and updatedAt is published_at. A GET costs no write budget.
        const loaded = (await request(app).get(`/api/gallery/${id}`)).body.project;
        const tag = publicationTag(loaded.headCommitId, loaded.updatedAt);

        const first = await request(app).patch(`/api/projects/${id}/publication`)
            .set('Cookie', editor).set('If-Match', `"${tag}"`)
            .send({ description: 'edit one', tags: [] });                           // write 2
        expect(first.status).toBe(200);

        const second = await request(app).patch(`/api/projects/${id}/publication`)
            .set('Cookie', editor).set('If-Match', `"${tag}"`)
            .send({ description: 'edit two', tags: [] });                           // write 3 — over
        expect(second.status).toBe(429);
        expect(second.body.code).toBe('RATE_LIMITED');
    });
});
