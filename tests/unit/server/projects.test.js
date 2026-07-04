// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookieA, cookieB;
beforeAll(async () => {
    app = await initTestApp();
    cookieA = await signUpUser(app, { email: 'owner@test.dev', username: 'owner_a' });
    cookieB = await signUpUser(app, { email: 'other@test.dev', username: 'other_b' });
});

describe('projects API', () => {
    it('requires auth to create', async () => {
        const res = await request(app).post('/api/projects').send({ name: 'X', state: minimalState() });
        expect(res.status).toBe(401);
    });

    it('creates a project with an initial commit', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'My Planner', state: minimalState(), message: 'Initial save' });
        expect(res.status).toBe(201);
        expect(res.body.project.headCommitId).toBe(res.body.commit.id);
        expect(res.body.project.visibility).toBe('private');
    });

    it('rejects invalid states with 400', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Bad', state: { nope: true } });
        expect(res.status).toBe(400);
    });

    it('lists only my projects', async () => {
        const res = await request(app).get('/api/projects').set('Cookie', cookieB);
        expect(res.status).toBe(200);
        expect(res.body.projects.every(p => p.name !== 'My Planner')).toBe(true);
    });

    it('hides private projects from non-owners', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Secret', state: minimalState() });
        const res = await request(app).get(`/api/projects/${create.body.project.id}`).set('Cookie', cookieB);
        expect(res.status).toBe(404);
    });

    it('adds commits and moves head, then serves history and state', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Versioned', state: minimalState('v1') });
        const pid = create.body.project.id;
        const c2 = await request(app).post(`/api/projects/${pid}/commits`).set('Cookie', cookieA)
            .send({ state: minimalState('v2'), message: 'second' });
        expect(c2.status).toBe(201);

        const list = await request(app).get(`/api/projects/${pid}/commits`).set('Cookie', cookieA);
        expect(list.body.commits.length).toBe(2);
        expect(list.body.commits[0].message).toBe('second'); // newest first

        const full = await request(app).get(`/api/projects/${pid}/commits/${c2.body.commit.id}`).set('Cookie', cookieA);
        expect(full.body.commit.state.nodes.root.title).toBe('v2');

        const proj = await request(app).get(`/api/projects/${pid}`).set('Cookie', cookieA);
        expect(proj.body.project.headCommitId).toBe(c2.body.commit.id);
    });

    it('forbids commits by non-owners', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Mine', state: minimalState() });
        const res = await request(app).post(`/api/projects/${create.body.project.id}/commits`)
            .set('Cookie', cookieB).send({ state: minimalState(), message: 'hijack' });
        expect(res.status).toBe(404);
    });

    it('deletes a project', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Doomed', state: minimalState() });
        const del = await request(app).delete(`/api/projects/${create.body.project.id}`).set('Cookie', cookieA);
        expect(del.status).toBe(200);
        const gone = await request(app).get(`/api/projects/${create.body.project.id}`).set('Cookie', cookieA);
        expect(gone.status).toBe(404);
    });
});
