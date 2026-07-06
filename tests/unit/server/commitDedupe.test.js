// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, projectId, initialCommitId;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'dedupe@test.dev', username: 'dedupe_u' });
    const res = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Dedupe', state: minimalState('A') });
    projectId = res.body.project.id;
    initialCommitId = res.body.commit.id;
});

describe('commit dedupe', () => {
    it('saving an identical state returns the existing head commit, creates nothing', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('A'), message: 'same again' });
        expect(res.status).toBe(200);
        expect(res.body.deduped).toBe(true);
        expect(res.body.commit.id).toBe(initialCommitId);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(1);
    });

    it('a genuinely changed state still creates a new commit', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('B'), message: 'changed' });
        expect(res.status).toBe(201);
        expect(res.body.commit.id).not.toBe(initialCommitId);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(2);
    });
});
