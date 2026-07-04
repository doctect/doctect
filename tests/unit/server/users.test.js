// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app;
beforeAll(async () => {
    app = await initTestApp();
    const cookie = await signUpUser(app, { email: 'prof@test.dev', username: 'profiled' });
    const p = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Profile Planner', state: minimalState() });
    await request(app).post(`/api/projects/${p.body.project.id}/publish`).set('Cookie', cookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Private Thing', state: minimalState() });
});

describe('GET /api/users/:username', () => {
    it('returns public projects only', async () => {
        const res = await request(app).get('/api/users/profiled');
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('profiled');
        expect(res.body.projects.map(p => p.name)).toEqual(['Profile Planner']);
    });
    it('404s unknown users', async () => {
        const res = await request(app).get('/api/users/ghost_user');
        expect(res.status).toBe(404);
    });
});
