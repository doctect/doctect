// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, minimalState, PNG_1X1, signUpUser } from './helpers.js';

const faults = vi.hoisted(() => ({ afterCommitInsert: null, failHeadUpdate: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (/UPDATE projects SET head_commit_id =/.test(text) && faults.failHeadUpdate) {
            faults.failHeadUpdate = false;
            throw new Error('Injected head update failure');
        }
        const result = await baseQuery(text, params);
        if (/INSERT INTO commits/.test(text) && faults.afterCommitInsert) {
            const hook = faults.afterCommitInsert;
            faults.afterCommitInsert = null;
            await hook();
        }
        return result;
    };
    return {
        ...actual,
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

let app;
let ownerCookie;
let forkerCookie;

beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'write-owner@test.dev', username: 'write_owner' });
    forkerCookie = await signUpUser(app, { email: 'write-forker@test.dev', username: 'write_forker' });
});

beforeEach(() => {
    faults.afterCommitInsert = null;
    faults.failHeadUpdate = false;
});

describe('project write transactions', () => {
    it('serializes saves paused after insertion and rejects the stale parent without an orphan', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Interleaved saves', state: minimalState('H1') });
        const projectId = created.body.project.id;
        const h1 = created.body.commit.id;
        let entered;
        const inserted = new Promise(resolve => { entered = resolve; });
        let release;
        const held = new Promise(resolve => { release = resolve; });
        faults.afterCommitInsert = async () => {
            entered();
            await held;
        };

        const first = request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', ownerCookie)
            .set('If-Match', `"${h1}"`)
            .send({ state: minimalState('winner'), message: 'winner' })
            .then(response => response);
        await inserted;
        let secondFinished = false;
        const second = request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', ownerCookie)
            .set('If-Match', `"${h1}"`)
            .send({ state: minimalState('loser'), message: 'loser' })
            .then(response => {
                secondFinished = true;
                return response;
            });
        await new Promise(resolve => setTimeout(resolve, 50));
        const secondWasSerialized = !secondFinished;
        release();
        const [winner, loser] = await Promise.all([first, second]);
        expect(secondWasSerialized).toBe(true);
        expect(winner.status).toBe(201);
        expect(loser.status).toBe(409);
        const { query } = await import('../../../server/db.js');
        const commits = await query('SELECT message FROM commits WHERE project_id = $1 ORDER BY created_at', [projectId]);
        expect(commits.map(commit => commit.message).sort()).toEqual(['Initial save', 'winner']);
    });

    it('rolls back an inserted ordinary commit when head advancement fails', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Rollback save', state: minimalState('H1') });
        faults.failHeadUpdate = true;

        const failed = await request(app).post(`/api/projects/${created.body.project.id}/commits`).set('Cookie', ownerCookie)
            .set('If-Match', `"${created.body.commit.id}"`)
            .send({ state: minimalState('H2'), message: 'must roll back' });

        expect(failed.status).toBe(500);
        const { query } = await import('../../../server/db.js');
        const project = await query('SELECT head_commit_id FROM projects WHERE id = $1', [created.body.project.id]);
        const commits = await query('SELECT id FROM commits WHERE project_id = $1', [created.body.project.id]);
        expect(project[0].head_commit_id).toBe(created.body.commit.id);
        expect(commits).toHaveLength(1);
    });

    it('rolls back initial project creation when initial head advancement fails', async () => {
        faults.failHeadUpdate = true;
        const failed = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Failed initial transaction', state: minimalState() });

        expect(failed.status).toBe(500);
        const { query } = await import('../../../server/db.js');
        expect(await query('SELECT id FROM projects WHERE name = $1', ['Failed initial transaction'])).toEqual([]);
    });

    it('rolls back fork project and source count when initial fork head advancement fails', async () => {
        const source = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Fork transaction source', state: minimalState('published') });
        await request(app).post(`/api/projects/${source.body.project.id}/publish`).set('Cookie', ownerCookie)
            .set('If-Match', `"${source.body.commit.id}"`)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        faults.failHeadUpdate = true;

        const failed = await request(app).post(`/api/projects/${source.body.project.id}/fork`).set('Cookie', forkerCookie);

        expect(failed.status).toBe(500);
        const { query } = await import('../../../server/db.js');
        expect(await query('SELECT id FROM projects WHERE forked_from_project_id = $1', [source.body.project.id])).toEqual([]);
        expect((await query('SELECT fork_count FROM projects WHERE id = $1', [source.body.project.id]))[0].fork_count).toBe(0);
    });
});
