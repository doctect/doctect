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

let app, cookie, publicId, privateId, query, adminCookie, ownerModeratorCookie;
let userId, adminId, ownerModeratorId;
const generator = {
    formatVersion: 1,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'gal@test.dev', username: 'gallerist' });
    adminCookie = await signUpUser(app, { email: 'gallery-admin@test.dev', username: 'gallery_admin' });
    ownerModeratorCookie = await signUpUser(app, { email: 'gallery-owner@test.dev', username: 'gallery_owner' });
    ({ query } = await import('../../../server/db.js'));
    await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['gallery-admin@test.dev']);
    await query(`UPDATE "user" SET role = 'owner' WHERE email = $1`, ['gallery-owner@test.dev']);
    [userId, adminId, ownerModeratorId] = await Promise.all([
        query('SELECT id FROM "user" WHERE email = $1', ['gal@test.dev']).then(rows => rows[0].id),
        query('SELECT id FROM "user" WHERE email = $1', ['gallery-admin@test.dev']).then(rows => rows[0].id),
        query('SELECT id FROM "user" WHERE email = $1', ['gallery-owner@test.dev']).then(rows => rows[0].id),
    ]);
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

    describe('standalone project moderation', () => {
        const insertProject = async (id, ownerId, visibility = 'public') => {
            await query(`INSERT INTO projects
                (id, owner_id, name, visibility, published_commit_id, published_name, published_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, ownerId, id, visibility, visibility === 'public' ? `commit-${id}` : null,
                id, '2026-07-17T00:00:00.000Z']);
        };
        const unpublish = (id, actorCookie, body = { reason: 'Policy violation' }) => request(app)
            .post(`/api/admin/projects/${id}/unpublish`).set('Cookie', actorCookie).send(body);

        it.each([
            ['missing', {}],
            ['blank', { reason: '   ' }],
            ['overlong', { reason: 'x'.repeat(1001) }],
        ])('rejects %s reasons', async (_label, body) => {
            const res = await unpublish('standalone-project-invalid-reason', adminCookie, body);
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'Invalid project unpublish request' });
        });

        it('returns 404 for a missing project and 409 for changed publication state', async () => {
            const missing = await unpublish('standalone-project-missing', adminCookie);
            expect(missing.status).toBe(404);
            expect(missing.body).toEqual({ error: 'Project not found' });

            await insertProject('standalone-project-private', userId, 'private');
            const privateProject = await unpublish('standalone-project-private', adminCookie);
            expect(privateProject.status).toBe(409);
            expect(privateProject.body).toEqual({ error: 'Project state changed; refresh and try again' });
        });

        it('enforces admin and owner hierarchy for project owners', async () => {
            await insertProject('standalone-project-admin-protected', adminId);
            await insertProject('standalone-project-owner-admin-attempt', ownerModeratorId);
            await insertProject('standalone-project-owner-owner-attempt', ownerModeratorId);

            for (const [id, actor] of [
                ['standalone-project-admin-protected', adminCookie],
                ['standalone-project-owner-admin-attempt', adminCookie],
                ['standalone-project-owner-owner-attempt', ownerModeratorCookie],
            ]) {
                const res = await unpublish(id, actor);
                expect(res.status).toBe(403);
                expect(res.body).toEqual({ error: 'Target is protected by role hierarchy' });
            }
        });

        it.each([
            ['admin', () => adminCookie, 'gallery-admin@test.dev', () => userId, 'gal@test.dev'],
            ['owner', () => ownerModeratorCookie, 'gallery-owner@test.dev', () => adminId, 'gallery-admin@test.dev'],
        ])('lets %s unpublish lower-role content and returns its audit snapshot', async (
            label, actorCookie, actorEmail, targetId, targetEmail,
        ) => {
            const id = `standalone-project-success-${label}`;
            await insertProject(id, targetId());
            const legacyCount = (await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count;

            const res = await unpublish(id, actorCookie(), { reason: '  Unsafe gallery content  ' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                action: {
                    id: expect.any(String),
                    actorKind: 'user',
                    actorUserId: label === 'admin' ? adminId : ownerModeratorId,
                    actorEmail,
                    targetUserId: targetId(),
                    targetEmail,
                    projectId: id,
                    reviewId: null,
                    action: 'project_unpublished',
                    reason: 'Unsafe gallery content',
                    expiresAt: null,
                    createdAt: expect.any(String),
                    metadata: { source: 'standalone_project', previousProjectVisibility: 'public' },
                },
            });
            expect(await query('SELECT visibility, published_commit_id FROM projects WHERE id = $1', [id]))
                .toEqual([{ visibility: 'private', published_commit_id: null }]);
            expect(await query(`SELECT target_user_id, target_email, project_id, action, reason, metadata_json
                FROM platform_audit_actions WHERE id = $1`, [res.body.action.id])).toEqual([{
                target_user_id: targetId(),
                target_email: targetEmail,
                project_id: id,
                action: 'project_unpublished',
                reason: 'Unsafe gallery content',
                metadata_json: JSON.stringify({ source: 'standalone_project', previousProjectVisibility: 'public' }),
            }]);
            expect((await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count).toBe(legacyCount);
        });
    });
});
