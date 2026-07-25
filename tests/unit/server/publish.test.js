// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

const dbInterleave = vi.hoisted(() => ({ beforeConditionalPublish: null, afterPublishAllowance: null, failThumbnailInsert: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (/SELECT COUNT\(\*\) AS n FROM projects WHERE owner_id = \$1 AND visibility = 'public'/.test(text)
            && dbInterleave.afterPublishAllowance) {
            const result = await baseQuery(text, params);
            const hook = dbInterleave.afterPublishAllowance;
            dbInterleave.afterPublishAllowance = null;
            await hook();
            return result;
        }
        if (/UPDATE projects SET visibility = 'public', published_commit_id =/.test(text)
            && /WHERE id = \$6 AND head_commit_id = \$7/.test(text)
            && dbInterleave.beforeConditionalPublish) {
            const hook = dbInterleave.beforeConditionalPublish;
            dbInterleave.beforeConditionalPublish = null;
            await hook();
        }
        if (/INSERT INTO thumbnails/.test(text) && dbInterleave.failThumbnailInsert) {
            dbInterleave.failThumbnailInsert = false;
            throw new Error('Injected thumbnail insert failure');
        }
        return baseQuery(text, params);
    };
    return {
        ...actual,
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

let app, cookie, projectId, query;
beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'pub@test.dev', username: 'publisher' });
    const res = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Gallery Planner', state: minimalState() });
    projectId = res.body.project.id;
});

describe('publishing', () => {
    const currentHead = async (id = projectId) => {
        const res = await request(app).get(`/api/projects/${id}`).set('Cookie', cookie);
        return res.body.project.headCommitId;
    };

    const publish = async (body, expectedHead) => request(app)
        .post(`/api/projects/${projectId}/publish`)
        .set('Cookie', cookie)
        .set('If-Match', `"${expectedHead ?? await currentHead()}"`)
        .send(body);

    it('publishes with metadata and thumbnails', async () => {
        const res = await publish({ description: 'A lovely planner', tags: ['planner', '2026'], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('public');
        expect(res.body.project.thumbnailIds.length).toBe(1);
    });

    it('serves the thumbnail with safe headers', async () => {
        const detail = await request(app).get(`/api/projects/${projectId}`).set('Cookie', cookie);
        // thumbnailIds available via publish response; fetch via gallery route
        const pub = await publish({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        const thumbId = pub.body.project.thumbnailIds[0];
        const res = await request(app).get(`/api/thumbnails/${thumbId}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('rejects invalid thumbnail data', async () => {
        const res = await publish({ description: 'x', tags: [], thumbnails: ['data:image/png;base64,aGVsbG8='] }); // "hello", not a PNG
        expect(res.status).toBe(400);
    });

    it('accepts six thumbnails', async () => {
        const six = [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1];
        const res = await publish({ description: 'x', tags: [], thumbnails: six });
        expect(res.status).toBe(200);
        expect(res.body.project.thumbnailIds.length).toBe(6);
    });

    it('rejects more than six thumbnails', async () => {
        const seven = [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1];
        const res = await publish({ description: 'x', tags: [], thumbnails: seven });
        expect(res.status).toBe(400);
    });

    it('records the source page of each preview, and null when not supplied', async () => {
        const withIds = await publish({
            description: 'x', tags: [],
            thumbnails: [PNG_1X1, PNG_1X1],
            previewNodeIds: ['root', 'root'],
        });
        expect(withIds.status).toBe(200);
        const tagged = await query(
            'SELECT node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [projectId]);
        expect(tagged.map(r => r.node_id)).toEqual(['root', 'root']);

        const withoutIds = await publish({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        expect(withoutIds.status).toBe(200);
        const untagged = await query(
            'SELECT node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [projectId]);
        expect(untagged.map(r => r.node_id)).toEqual([null]);
    });

    it('rejects previewNodeIds that do not pair one-to-one with thumbnails', async () => {
        const res = await publish({
            description: 'x', tags: [],
            thumbnails: [PNG_1X1, PNG_1X1],
            previewNodeIds: ['root'],
        });
        expect(res.status).toBe(400);
    });

    it('requires the inspected project head', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(428);
    });

    it.each(['head-1', 'W/"head-1"', '"head-1", "head-2"', '*'])('rejects malformed If-Match value %s', async value => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .set('If-Match', value)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_IF_MATCH');
    });

    it('allows If-Match in CORS preflight requests', async () => {
        const res = await request(app).options(`/api/projects/${projectId}/publish`)
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,if-match');

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('if-match');
    });

    it('rejects H1 after save H2 without making the project public', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Conditional Publish', state: minimalState('H1') });
        const conditionalProjectId = created.body.project.id;
        const h1 = created.body.project.headCommitId;
        const saved = await request(app).post(`/api/projects/${conditionalProjectId}/commits`).set('Cookie', cookie)
            .set('If-Match', `"${h1}"`)
            .send({ state: minimalState('H2'), message: 'H2' });

        const res = await request(app).post(`/api/projects/${conditionalProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', `"${h1}"`)
            .send({ description: 'stale', tags: [], thumbnails: [PNG_1X1] });

        expect(saved.body.commit.id).not.toBe(h1);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PROJECT_HEAD_CHANGED');
        const project = await request(app).get(`/api/projects/${conditionalProjectId}`).set('Cookie', cookie);
        expect(project.body.project.headCommitId).toBe(saved.body.commit.id);
        expect(project.body.project.visibility).toBe('private');
    });

    it('serializes a concurrent save behind the publish transaction', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Interleaved Publish', state: minimalState('H1') });
        const interleavedProjectId = created.body.project.id;
        const h1 = created.body.project.headCommitId;
        let releasePublish;
        const publishHeld = new Promise(resolve => { releasePublish = resolve; });
        let publishEntered;
        const entered = new Promise(resolve => { publishEntered = resolve; });
        dbInterleave.beforeConditionalPublish = async () => {
            publishEntered();
            await publishHeld;
        };
        const publishing = request(app).post(`/api/projects/${interleavedProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', `"${h1}"`)
            .send({ description: 'published', tags: ['published'], thumbnails: [PNG_1X1] })
            .then(response => response);
        await entered;

        let saveFinished = false;
        const saving = request(app).post(`/api/projects/${interleavedProjectId}/commits`)
            .set('Cookie', cookie)
            .set('If-Match', `"${h1}"`)
            .send({ state: minimalState('H2'), message: 'H2' })
            .then(response => {
                saveFinished = true;
                return response;
            });
        await new Promise(resolve => setTimeout(resolve, 50));
        const saveWasSerialized = !saveFinished;
        releasePublish();
        const [published, saved] = await Promise.all([publishing, saving]);

        expect(saveWasSerialized).toBe(true);
        expect(published.status).toBe(200);
        expect(saved.status).toBe(201);
        expect(published.body.project.visibility).toBe('public');
        expect((await currentHead(interleavedProjectId))).toBe(saved.body.commit.id);
    });

    it('serializes concurrent first publishes under the per-owner allowance', async () => {
        const previousLimit = process.env.MAX_PUBLIC_PROJECTS_PER_USER;
        const { query } = await import('../../../server/db.js');
        const currentPublic = await query(`SELECT COUNT(*) AS n FROM projects WHERE owner_id = (
            SELECT id FROM "user" WHERE email = $1
        ) AND visibility = 'public'`, ['pub@test.dev']);
        process.env.MAX_PUBLIC_PROJECTS_PER_USER = String(Number(currentPublic[0].n) + 1);
        const first = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'First allowance project', state: minimalState('first') });
        const second = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Second allowance project', state: minimalState('second') });
        let allowanceRead;
        const read = new Promise(resolve => { allowanceRead = resolve; });
        let release;
        const held = new Promise(resolve => { release = resolve; });
        dbInterleave.afterPublishAllowance = async () => {
            allowanceRead();
            await held;
        };

        const firstPublish = request(app).post(`/api/projects/${first.body.project.id}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', `"${first.body.commit.id}"`)
            .send({ description: 'first', tags: [], thumbnails: [PNG_1X1] })
            .then(response => response);
        await read;
        let secondFinished = false;
        const secondPublish = request(app).post(`/api/projects/${second.body.project.id}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', `"${second.body.commit.id}"`)
            .send({ description: 'second', tags: [], thumbnails: [PNG_1X1] })
            .then(response => {
                secondFinished = true;
                return response;
            });
        await new Promise(resolve => setTimeout(resolve, 50));
        const secondWasSerialized = !secondFinished;
        release();
        const responses = await Promise.all([firstPublish, secondPublish]);
        if (previousLimit === undefined) delete process.env.MAX_PUBLIC_PROJECTS_PER_USER;
        else process.env.MAX_PUBLIC_PROJECTS_PER_USER = previousLimit;

        expect(secondWasSerialized).toBe(true);
        expect(responses.map(response => response.status).sort()).toEqual([200, 403]);
        expect(responses.find(response => response.status === 403).body.code).toBe('PUBLIC_LIMIT_REACHED');
    });

    it('rolls back metadata and thumbnail replacement when insertion fails', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Rollback Publish', state: minimalState('Rollback') });
        const rollbackProjectId = created.body.project.id;
        const head = created.body.project.headCommitId;
        const seeded = await request(app).post(`/api/projects/${rollbackProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', `"${head}"`)
            .send({ description: 'existing', tags: ['existing'], thumbnails: [PNG_1X1] });
        await request(app).post(`/api/projects/${rollbackProjectId}/unpublish`).set('Cookie', cookie);

        dbInterleave.failThumbnailInsert = true;
        const failed = await request(app).post(`/api/projects/${rollbackProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', `"${head}"`)
            .send({ description: 'replacement', tags: ['replacement'], thumbnails: [PNG_1X1] });

        expect(failed.status).toBe(500);
        const { query } = await import('../../../server/db.js');
        const project = await query('SELECT visibility, description, tags FROM projects WHERE id = $1', [rollbackProjectId]);
        const thumbnails = await query('SELECT id FROM thumbnails WHERE project_id = $1 ORDER BY position', [rollbackProjectId]);
        expect(project[0]).toMatchObject({ visibility: 'private', description: 'existing', tags: '["existing"]' });
        expect(thumbnails).toEqual([{ id: seeded.body.project.thumbnailIds[0] }]);
    });

    it('unpublishes', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/unpublish`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('private');
    });
});
