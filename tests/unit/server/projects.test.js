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

    it.each(['__proto__', 'constructor', 'toString'])(
        'rejects inherited %s roots without creating a cloud project',
        async rootId => {
            const before = await request(app).get('/api/projects').set('Cookie', cookieA);
            const res = await request(app).post('/api/projects').set('Cookie', cookieA)
                .send({ name: `Inherited ${rootId}`, state: { ...minimalState(), nodes: {}, rootId } });
            const after = await request(app).get('/api/projects').set('Cookie', cookieA);

            expect(res.status).toBe(400);
            expect(after.body.projects).toHaveLength(before.body.projects.length);
        },
    );

    it('rejects an inherited root commit without moving cloud head or writing history', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Inherited root commit', state: minimalState('Original') });
        const projectId = create.body.project.id;
        const head = create.body.commit.id;

        const rejected = await request(app).post(`/api/projects/${projectId}/commits`)
            .set('Cookie', cookieA)
            .set('If-Match', `"${head}"`)
            .send({
                state: { ...minimalState('Malformed'), nodes: {}, rootId: '__proto__' },
                message: 'Must not persist',
            });
        const project = await request(app).get(`/api/projects/${projectId}`).set('Cookie', cookieA);
        const history = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookieA);

        expect(rejected.status).toBe(400);
        expect(project.body.project.headCommitId).toBe(head);
        expect(history.body.commits).toHaveLength(1);
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
            .set('If-Match', `"${create.body.commit.id}"`)
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

    it('requires one quoted strong head tag for ordinary saves', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Conditional saves', state: minimalState('v1') });
        const path = `/api/projects/${create.body.project.id}/commits`;
        const body = { state: minimalState('v2'), message: 'second' };

        const missing = await request(app).post(path).set('Cookie', cookieA).send(body);
        expect(missing.status).toBe(428);
        expect(missing.body.code).toBe('PROJECT_HEAD_REQUIRED');

        for (const value of ['head-1', 'W/"head-1"', '"head-1", "head-2"', '*']) {
            const malformed = await request(app).post(path).set('Cookie', cookieA).set('If-Match', value).send(body);
            expect(malformed.status).toBe(400);
            expect(malformed.body.code).toBe('INVALID_IF_MATCH');
        }
    });

    it('rejects a stale ordinary save without inserting an orphan commit', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Stale save', state: minimalState('H1') });
        const projectId = create.body.project.id;
        const h1 = create.body.commit.id;
        const first = await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookieA)
            .set('If-Match', `"${h1}"`)
            .send({ state: minimalState('H2'), message: 'winner' });
        const stale = await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookieA)
            .set('If-Match', `"${h1}"`)
            .send({ state: minimalState('stale'), message: 'loser' });

        expect(first.status).toBe(201);
        expect(stale.status).toBe(409);
        expect(stale.body.code).toBe('PROJECT_HEAD_CHANGED');
        const project = await request(app).get(`/api/projects/${projectId}`).set('Cookie', cookieA);
        expect(project.body.project.headCommitId).toBe(first.body.commit.id);
        const history = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookieA);
        expect(history.body.commits.map(commit => commit.message)).toEqual(['winner', 'Initial save']);
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
