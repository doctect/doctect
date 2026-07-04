// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie, forkerCookie, publicId, privateId;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'fowner@test.dev', username: 'fork_owner' });
    forkerCookie = await signUpUser(app, { email: 'forker@test.dev', username: 'forker' });
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Forkable', state: minimalState('upstream') });
    publicId = pub.body.project.id;
    await request(app).post(`/api/projects/${publicId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const priv = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'NotForkable', state: minimalState() });
    privateId = priv.body.project.id;
});

describe('fork', () => {
    it('requires auth', async () => {
        const res = await request(app).post(`/api/projects/${publicId}/fork`);
        expect(res.status).toBe(401);
    });

    it('forks a public project with lineage and copied state', async () => {
        const res = await request(app).post(`/api/projects/${publicId}/fork`).set('Cookie', forkerCookie);
        expect(res.status).toBe(201);
        const fork = res.body.project;
        expect(fork.forkedFromProjectId).toBe(publicId);
        expect(fork.visibility).toBe('private');
        expect(fork.headCommitId).toBeTruthy();

        const commit = await request(app)
            .get(`/api/projects/${fork.id}/commits/${fork.headCommitId}`).set('Cookie', forkerCookie);
        expect(commit.body.commit.state.nodes.root.title).toBe('upstream');

        const src = await request(app).get(`/api/gallery/${publicId}`);
        expect(src.body.project.forkCount).toBe(1);
        // fork points at the exact source commit it was cut from
        expect(fork.forkedFromCommitId).toBe(src.body.project.headCommitId);
    });

    it('refuses to fork private projects of others', async () => {
        const res = await request(app).post(`/api/projects/${privateId}/fork`).set('Cookie', forkerCookie);
        expect(res.status).toBe(404);
    });
});
