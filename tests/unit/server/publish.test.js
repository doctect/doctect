// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, cookie, projectId;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'pub@test.dev', username: 'publisher' });
    const res = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Gallery Planner', state: minimalState() });
    projectId = res.body.project.id;
});

describe('publishing', () => {
    it('publishes with metadata and thumbnails', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'A lovely planner', tags: ['planner', '2026'], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('public');
        expect(res.body.project.thumbnailIds.length).toBe(1);
    });

    it('serves the thumbnail with safe headers', async () => {
        const detail = await request(app).get(`/api/projects/${projectId}`).set('Cookie', cookie);
        // thumbnailIds available via publish response; fetch via gallery route
        const pub = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        const thumbId = pub.body.project.thumbnailIds[0];
        const res = await request(app).get(`/api/thumbnails/${thumbId}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('rejects invalid thumbnail data', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: ['data:image/png;base64,aGVsbG8='] }); // "hello", not a PNG
        expect(res.status).toBe(400);
    });

    it('rejects more than 4 thumbnails', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1] });
        expect(res.status).toBe(400);
    });

    it('unpublishes', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/unpublish`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('private');
    });
});
