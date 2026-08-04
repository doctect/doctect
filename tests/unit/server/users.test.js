// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app;
let publishedThumbnailIds;
beforeAll(async () => {
    app = await initTestApp();
    const cookie = await signUpUser(app, { email: 'prof@test.dev', username: 'profiled' });
    const p = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Profile Planner', state: minimalState() });
    const pub = await request(app).post(`/api/projects/${p.body.project.id}/publish`).set('Cookie', cookie)
        .set('If-Match', `"${p.body.project.headCommitId}"`)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1, PNG_1X1] });
    publishedThumbnailIds = pub.body.project.thumbnailIds;
    await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Private Thing', state: minimalState() });
});

describe('GET /api/users/:username', () => {
    it('returns public projects only', async () => {
        const res = await request(app).get('/api/users/profiled');
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('profiled');
        expect(res.body.projects.map(p => p.name)).toEqual(['Profile Planner']);
        // This is a public, unauthenticated endpoint — anyone can call it for any known/guessed
        // username. The account's real `name` field is never intended to be public and must
        // not leak here.
        expect(res.body.user.name).toBeUndefined();
    });
    it('404s unknown users', async () => {
        const res = await request(app).get('/api/users/ghost_user');
        expect(res.status).toBe(404);
    });
    it('returns ordered thumbnailIds on every project card', async () => {
        const res = await request(app).get('/api/users/profiled');
        expect(res.status).toBe(200);
        for (const project of res.body.projects) {
            expect(Array.isArray(project.thumbnailIds)).toBe(true);
            expect(project.thumbnailId).toBe(project.thumbnailIds[0] ?? null);
        }
        const planner = res.body.projects.find(p => p.name === 'Profile Planner');
        // Published with two thumbnails; ids must come back in position order
        // (same order the publish response reported them in).
        expect(planner.thumbnailIds).toEqual(publishedThumbnailIds);
        expect(planner.thumbnailIds).toHaveLength(2);
    });
});
