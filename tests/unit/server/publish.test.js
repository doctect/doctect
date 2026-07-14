// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

const dbInterleave = vi.hoisted(() => ({ beforeConditionalPublish: null }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        query: async (text, params = []) => {
            if (/UPDATE projects SET visibility = 'public'/.test(text)
                && /WHERE id = \$3 AND head_commit_id = \$4/.test(text)
                && dbInterleave.beforeConditionalPublish) {
                const hook = dbInterleave.beforeConditionalPublish;
                dbInterleave.beforeConditionalPublish = null;
                await hook(actual.query);
            }
            return actual.query(text, params);
        },
    };
});

let app, cookie, projectId;
beforeAll(async () => {
    app = await initTestApp();
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
        .set('If-Match', expectedHead ?? await currentHead())
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

    it('rejects more than 4 thumbnails', async () => {
        const res = await publish({ description: 'x', tags: [], thumbnails: [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1] });
        expect(res.status).toBe(400);
    });

    it('requires the inspected project head', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(428);
    });

    it('rejects H1 after save H2 without making the project public', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Conditional Publish', state: minimalState('H1') });
        const conditionalProjectId = created.body.project.id;
        const h1 = created.body.project.headCommitId;
        const saved = await request(app).post(`/api/projects/${conditionalProjectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('H2'), message: 'H2' });

        const res = await request(app).post(`/api/projects/${conditionalProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', h1)
            .send({ description: 'stale', tags: [], thumbnails: [PNG_1X1] });

        expect(saved.body.commit.id).not.toBe(h1);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PROJECT_HEAD_CHANGED');
        const project = await request(app).get(`/api/projects/${conditionalProjectId}`).set('Cookie', cookie);
        expect(project.body.project.headCommitId).toBe(saved.body.commit.id);
        expect(project.body.project.visibility).toBe('private');
    });

    it('rejects when H1 changes to H2 after the early check without touching existing thumbnails', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Interleaved Publish', state: minimalState('H1') });
        const interleavedProjectId = created.body.project.id;
        const h1 = created.body.project.headCommitId;
        const seeded = await request(app).post(`/api/projects/${interleavedProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', h1)
            .send({ description: 'existing', tags: ['existing'], thumbnails: [PNG_1X1] });
        await request(app).post(`/api/projects/${interleavedProjectId}/unpublish`).set('Cookie', cookie);
        const saved = await request(app).post(`/api/projects/${interleavedProjectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('H2'), message: 'H2' });
        const h2 = saved.body.commit.id;
        const { query } = await import('../../../server/db.js');
        const existingThumbnails = await query(
            'SELECT id, mime, image FROM thumbnails WHERE project_id = $1 ORDER BY position',
            [interleavedProjectId],
        );
        await query('UPDATE projects SET head_commit_id = $1 WHERE id = $2', [h1, interleavedProjectId]);

        let interleaved = false;
        dbInterleave.beforeConditionalPublish = async realQuery => {
            interleaved = true;
            await realQuery('UPDATE projects SET head_commit_id = $1 WHERE id = $2', [h2, interleavedProjectId]);
        };
        const res = await request(app).post(`/api/projects/${interleavedProjectId}/publish`)
            .set('Cookie', cookie)
            .set('If-Match', h1)
            .send({ description: 'stale', tags: ['stale'], thumbnails: [PNG_1X1] });

        expect(interleaved).toBe(true);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PROJECT_HEAD_CHANGED');
        const project = await query('SELECT visibility, head_commit_id FROM projects WHERE id = $1', [interleavedProjectId]);
        const thumbnails = await query(
            'SELECT id, mime, image FROM thumbnails WHERE project_id = $1 ORDER BY position',
            [interleavedProjectId],
        );
        expect(project[0]).toMatchObject({ visibility: 'private', head_commit_id: h2 });
        expect(thumbnails).toHaveLength(1);
        expect(thumbnails[0]).toMatchObject({ id: seeded.body.project.thumbnailIds[0], mime: existingThumbnails[0].mime });
        expect(Buffer.compare(thumbnails[0].image, existingThumbnails[0].image)).toBe(0);
    });

    it('unpublishes', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/unpublish`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('private');
    });
});
