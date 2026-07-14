// tests/unit/server/commitRetention.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1, saveProjectCommit } from './helpers.js';

let app, cookie, upstreamCookie, query;
beforeAll(async () => {
    process.env.COMMIT_RETENTION_PER_PROJECT = '3';
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'retain@test.dev', username: 'retain_u' });
    upstreamCookie = await signUpUser(app, { email: 'retain-upstream@test.dev', username: 'retain_upstream' });
});
afterAll(() => { delete process.env.COMMIT_RETENTION_PER_PROJECT; });

const makeProjectWithCommits = async (name, count) => {
    const created = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name, state: minimalState(`${name}-0`) });
    const projectId = created.body.project.id;
    for (let i = 1; i < count; i++) {
        await saveProjectCommit(app, cookie, projectId, { state: minimalState(`${name}-${i}`), message: `c${i}` });
    }
    return projectId;
};

describe('commit retention', () => {
    it('keeps only the newest N commits per project', async () => {
        const projectId = await makeProjectWithCommits('Prune', 5);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(3);
        expect(list.body.commits.map(c => c.message)).toEqual(['c4', 'c3', 'c2']);
    });

    it('never deletes commits referenced by an open merge request', async () => {
        const projectId = await makeProjectWithCommits('MrSafe', 2);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        const oldestId = list.body.commits[list.body.commits.length - 1].id;
        await query(
            `INSERT INTO merge_requests (id, source_project_id, source_commit_id, target_project_id, base_commit_id, title, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
            ['mr-retention-1', projectId, oldestId, 'other-project', oldestId, 'keep me', 'retain_u']);
        for (let i = 2; i < 6; i++) {
            await saveProjectCommit(app, cookie, projectId, { state: minimalState(`MrSafe-${i}`), message: `c${i}` });
        }
        const rows = await query('SELECT id FROM commits WHERE id = $1', [oldestId]);
        expect(rows.length).toBe(1);
    });

    it('retains conflicted MR commits for live diff recomputation after pruning', async () => {
        const upstream = await request(app).post('/api/projects').set('Cookie', upstreamCookie)
            .send({ name: 'Conflicted upstream', state: minimalState('base') });
        const upstreamId = upstream.body.project.id;
        await request(app).post(`/api/projects/${upstreamId}/publish`).set('Cookie', upstreamCookie)
            .set('If-Match', `"${upstream.body.project.headCommitId}"`)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        const fork = await request(app).post(`/api/projects/${upstreamId}/fork`).set('Cookie', cookie);
        const sourceId = fork.body.project.id;
        const source = await saveProjectCommit(app, cookie, sourceId,
            { state: minimalState('proposed'), message: 'proposed change' }, fork.body.project.headCommitId);
        const created = await request(app).post('/api/merge-requests').set('Cookie', cookie)
            .send({ sourceProjectId: sourceId, title: 'Retain conflicted source' });
        expect(created.status).toBe(201);
        const mrId = created.body.mergeRequest.id;
        const sourceCommitId = source.body.commit.id;
        await query(`UPDATE merge_requests SET status = 'conflicted' WHERE id = $1`, [mrId]);

        for (let i = 0; i < 5; i++) {
            await saveProjectCommit(app, cookie, sourceId,
                { state: minimalState(`later-${i}`), message: `later-${i}` });
        }

        expect(await query('SELECT id FROM commits WHERE id = $1', [sourceCommitId])).toEqual([{ id: sourceCommitId }]);
        const detail = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', cookie);
        expect(detail.status).toBe(200);
        expect(detail.body.diff).not.toBeNull();
    });

    it('does not prune below the limit', async () => {
        const projectId = await makeProjectWithCommits('Small', 2);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(2);
    });
});
