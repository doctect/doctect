// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initTestApp, minimalState, PNG_1X1, signUpUser } from './helpers.js';

let app;
let ownerCookie;
let visitorCookie;

const save = (projectId, cookie, expectedHead, title) => request(app)
    .post(`/api/projects/${projectId}/commits`)
    .set('Cookie', cookie)
    .set('If-Match', `"${expectedHead}"`)
    .send({ state: minimalState(title), message: title });

const publish = (projectId, cookie, expectedHead, description = expectedHead) => request(app)
    .post(`/api/projects/${projectId}/publish`)
    .set('Cookie', cookie)
    .set('If-Match', `"${expectedHead}"`)
    .send({ description, tags: [description], thumbnails: [PNG_1X1] });

beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'snapshot-owner@test.dev', username: 'snapshot_owner' });
    visitorCookie = await signUpUser(app, { email: 'snapshot-visitor@test.dev', username: 'snapshot_visitor' });
});

describe('published project snapshots', () => {
    it('pins public state, detail, history, and forks until explicit republish', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Pinned planner', state: minimalState('published H1') });
        const projectId = created.body.project.id;
        const h1 = created.body.commit.id;
        expect((await publish(projectId, ownerCookie, h1, 'first')).status).toBe(200);

        const saved = await save(projectId, ownerCookie, h1, 'private H2');
        expect(saved.status).toBe(201);
        const h2 = saved.body.commit.id;

        const detail = await request(app).get(`/api/gallery/${projectId}`);
        expect(detail.body.project.headCommitId).toBe(h1);
        const publicProject = await request(app).get(`/api/projects/${projectId}`).set('Cookie', visitorCookie);
        expect(publicProject.body.project.headCommitId).toBe(h1);
        const state = await request(app).get(`/api/gallery/${projectId}/state`);
        expect(state.body.state.nodes.root.title).toBe('published H1');

        const publicHistory = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', visitorCookie);
        expect(publicHistory.body.commits.map(commit => commit.id)).toEqual([h1]);
        const hiddenCommit = await request(app).get(`/api/projects/${projectId}/commits/${h2}`).set('Cookie', visitorCookie);
        expect(hiddenCommit.status).toBe(404);

        const ownerHistory = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', ownerCookie);
        expect(ownerHistory.body.commits.map(commit => commit.id)).toEqual([h2, h1]);
        const ownerProject = await request(app).get(`/api/projects/${projectId}`).set('Cookie', ownerCookie);
        expect(ownerProject.body.project.headCommitId).toBe(h2);

        const forked = await request(app).post(`/api/projects/${projectId}/fork`).set('Cookie', visitorCookie);
        expect(forked.status).toBe(201);
        expect(forked.body.project.forkedFromCommitId).toBe(h1);
        const forkState = await request(app)
            .get(`/api/projects/${forked.body.project.id}/commits/${forked.body.project.headCommitId}`)
            .set('Cookie', visitorCookie);
        expect(forkState.body.commit.state.nodes.root.title).toBe('published H1');

        expect((await publish(projectId, ownerCookie, h2, 'second')).status).toBe(200);
        const republishedState = await request(app).get(`/api/gallery/${projectId}/state`);
        expect(republishedState.body.state.nodes.root.title).toBe('private H2');
        const republishedHistory = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', visitorCookie);
        expect(republishedHistory.body.commits.map(commit => commit.id)).toEqual([h2, h1]);

        await request(app).post(`/api/projects/${projectId}/unpublish`).set('Cookie', ownerCookie);
        expect((await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', visitorCookie)).status).toBe(404);
        expect((await request(app).get(`/api/projects/${projectId}/commits/${h1}`).set('Cookie', visitorCookie)).status).toBe(404);

        expect((await publish(projectId, ownerCookie, h2, 'third')).status).toBe(200);
        const historyAfterRepublish = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', visitorCookie);
        expect(historyAfterRepublish.body.commits.map(commit => commit.id)).toEqual([h2, h1]);
    });
});
