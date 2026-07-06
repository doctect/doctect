// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, projectId, initialCommitId, query;
beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
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

    it('a legacy head with NULL state_hash never false-positive dedupe-matches', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'LegacyHead', state: minimalState('Legacy') });
        const legacyProjectId = created.body.project.id;
        const legacyHeadCommitId = created.body.commit.id;

        // Simulate a pre-007_commit_storage-migration row: state_hash NULL, as it
        // would be for any commit written before that migration added the column.
        await query('UPDATE commits SET state_hash = NULL WHERE id = $1', [legacyHeadCommitId]);

        const res = await request(app).post(`/api/projects/${legacyProjectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('Legacy'), message: 'identical content, legacy head' });
        expect(res.status).toBe(201);
        expect(res.body.deduped).toBeUndefined();
        expect(res.body.commit.id).not.toBe(legacyHeadCommitId);
        const list = await request(app).get(`/api/projects/${legacyProjectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(2);
    });
});
