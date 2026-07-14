// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1, saveProjectCommit } from './helpers.js';

const galleryInterleave = vi.hoisted(() => ({ afterDetailRead: null }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        query: async (text, params = []) => {
            const rows = await actual.query(text, params);
            if (galleryInterleave.afterDetailRead
                && /SELECT p\.\*, u\.username AS author[\s\S]*WHERE p\.id = \$1 AND p\.visibility = 'public'/.test(text)) {
                const hook = galleryInterleave.afterDetailRead;
                galleryInterleave.afterDetailRead = null;
                await hook();
            }
            return rows;
        },
    };
});

let app, cookie, publicId, privateId;
const generator = {
    formatVersion: 1,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'gal@test.dev', username: 'gallerist' });
    const pub = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Public Planner', state: { ...minimalState(), generator } });
    publicId = pub.body.project.id;
    await request(app).post(`/api/projects/${publicId}/publish`).set('Cookie', cookie)
        .set('If-Match', `"${pub.body.project.headCommitId}"`)
        .send({ description: 'shiny', tags: ['planner'], thumbnails: [PNG_1X1] });
    const priv = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Hidden', state: minimalState() });
    privateId = priv.body.project.id;
});

describe('gallery', () => {
    it('lists only public projects, anonymously', async () => {
        const res = await request(app).get('/api/gallery');
        expect(res.status).toBe(200);
        const names = res.body.items.map(i => i.name);
        expect(names).toContain('Public Planner');
        expect(names).not.toContain('Hidden');
        // Find by name: other test files may share the worker DB, so ordering isn't guaranteed.
        const item = res.body.items.find(i => i.name === 'Public Planner');
        expect(item.author).toBe('gallerist');
        expect(item.thumbnailId).toBeTruthy();
    });

    it('supports search', async () => {
        const res = await request(app).get('/api/gallery?q=nomatchxyz');
        expect(res.body.items.length).toBe(0);
    });

    it('serves detail with thumbnails', async () => {
        const res = await request(app).get(`/api/gallery/${publicId}`);
        expect(res.status).toBe(200);
        expect(res.body.project.thumbnailIds.length).toBe(1);
    });

    it('404s for private projects', async () => {
        const res = await request(app).get(`/api/gallery/${privateId}`);
        expect(res.status).toBe(404);
    });

    it('serves state and increments download count', async () => {
        const res = await request(app).get(`/api/gallery/${publicId}/state`);
        expect(res.status).toBe(200);
        expect(res.body.state.rootId).toBe('root');
        expect(res.body.state.generator).toEqual(generator);
        const detail = await request(app).get(`/api/gallery/${publicId}`);
        expect(detail.body.project.downloadCount).toBe(1);
    });

    it('accepts reports', async () => {
        const res = await request(app).post(`/api/gallery/${publicId}/report`).send({ reason: 'spam' });
        expect(res.status).toBe(201);
    });

    it('returns one publication snapshot when republish interleaves with detail', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Snapshot detail old', state: minimalState('old head') });
        const projectId = created.body.project.id;
        const oldHead = created.body.project.headCommitId;
        const oldPublish = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .set('If-Match', `"${oldHead}"`)
            .send({ description: 'old metadata', tags: ['old'], thumbnails: [PNG_1X1] });
        const saved = await saveProjectCommit(app, cookie, projectId,
            { state: minimalState('new head'), message: 'new head' }, oldHead);
        const newHead = saved.body.commit.id;
        let newPublish;
        galleryInterleave.afterDetailRead = async () => {
            newPublish = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
                .set('If-Match', `"${newHead}"`)
                .send({ description: 'new metadata', tags: ['new'], thumbnails: [PNG_1X1] });
        };

        const detail = await request(app).get(`/api/gallery/${projectId}`);

        expect(newPublish.status).toBe(200);
        const tuple = {
            description: detail.body.project.description,
            headCommitId: detail.body.project.headCommitId,
            thumbnailIds: detail.body.project.thumbnailIds,
        };
        expect([
            { description: 'old metadata', headCommitId: oldHead, thumbnailIds: oldPublish.body.project.thumbnailIds },
            { description: 'new metadata', headCommitId: newHead, thumbnailIds: newPublish.body.project.thumbnailIds },
        ]).toContainEqual(tuple);
    });

    it('lets admins unpublish', async () => {
        // signUpUser creates plain users; simulate admin via direct db update
        const { query } = await import('../../../server/db.js');
        const adminCookie = await signUpUser(app, { email: 'admin@test.dev', username: 'the_admin' });
        await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['admin@test.dev']);
        const res = await request(app).post(`/api/admin/projects/${publicId}/unpublish`).set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        const detail = await request(app).get(`/api/gallery/${publicId}`);
        expect(detail.status).toBe(404);
    });
});
