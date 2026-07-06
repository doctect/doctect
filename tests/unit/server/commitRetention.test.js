// tests/unit/server/commitRetention.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, query;
beforeAll(async () => {
    process.env.COMMIT_RETENTION_PER_PROJECT = '3';
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'retain@test.dev', username: 'retain_u' });
});
afterAll(() => { delete process.env.COMMIT_RETENTION_PER_PROJECT; });

const makeProjectWithCommits = async (name, count) => {
    const created = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name, state: minimalState(`${name}-0`) });
    const projectId = created.body.project.id;
    for (let i = 1; i < count; i++) {
        await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState(`${name}-${i}`), message: `c${i}` });
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
            await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
                .send({ state: minimalState(`MrSafe-${i}`), message: `c${i}` });
        }
        const rows = await query('SELECT id FROM commits WHERE id = $1', [oldestId]);
        expect(rows.length).toBe(1);
    });

    it('does not prune below the limit', async () => {
        const projectId = await makeProjectWithCommits('Small', 2);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(2);
    });
});
