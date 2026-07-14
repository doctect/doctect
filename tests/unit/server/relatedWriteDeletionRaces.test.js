// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, minimalState, PNG_1X1, saveProjectCommit, signUpUser } from './helpers.js';

const readPause = vi.hoisted(() => ({ current: null }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        const rows = await baseQuery(text, params);
        const pause = readPause.current;
        const matchesKind = pause?.kind === 'project'
            ? text === 'SELECT * FROM projects WHERE id = $1'
            : pause?.kind === 'public-project'
                ? /SELECT p\.\*, u\.username AS author[\s\S]*WHERE p\.id = \$1 AND p\.visibility = 'public'/.test(text)
                : pause?.kind === 'review'
                    ? text === 'SELECT id, project_id FROM reviews WHERE id = $1'
                    : false;
        if (pause && matchesKind && params.includes(pause.id)) {
            readPause.current = null;
            pause.entered();
            await pause.release;
        }
        return rows;
    };
    return {
        ...actual,
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

const pauseNextRead = (kind, id) => {
    let signalEntered;
    let signalRelease;
    const entered = new Promise(resolve => { signalEntered = resolve; });
    const release = new Promise(resolve => { signalRelease = resolve; });
    readPause.current = { kind, id, entered: signalEntered, release };
    return { entered, release: signalRelease };
};

let app, query, ownerCookie, authorCookie, reviewerCookie;

beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    ownerCookie = await signUpUser(app, { email: 'race-owner@test.dev', username: 'race_owner' });
    authorCookie = await signUpUser(app, { email: 'race-author@test.dev', username: 'race_author' });
    reviewerCookie = await signUpUser(app, { email: 'race-reviewer@test.dev', username: 'race_reviewer' });
});

const createPublishedProject = async (name) => {
    const created = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name, state: minimalState(name) });
    const projectId = created.body.project.id;
    const published = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', ownerCookie)
        .set('If-Match', `"${created.body.project.headCommitId}"`)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    expect(published.status).toBe(200);
    return projectId;
};

const createChangedFork = async (name) => {
    const targetId = await createPublishedProject(name);
    const forked = await request(app).post(`/api/projects/${targetId}/fork`).set('Cookie', authorCookie);
    const sourceId = forked.body.project.id;
    const saved = await saveProjectCommit(app, authorCookie, sourceId,
        { state: minimalState(`${name} changed`), message: 'change' }, forked.body.project.headCommitId);
    expect(saved.status).toBe(201);
    return { sourceId, targetId };
};

const createReview = async (projectId) => {
    const reviewed = await request(app).put(`/api/gallery/${projectId}/review`).set('Cookie', reviewerCookie)
        .send({ rating: 4, body: 'review before race' });
    expect(reviewed.status).toBe(200);
    return reviewed.body.review.id;
};

const expectRejectedAfterDeletion = (response) => {
    expect([404, 409]).toContain(response.status);
};

describe('deletion commits before a stale related-row writer', () => {
    it('rejects MR creation and leaves no active MR after source deletion', async () => {
        const { sourceId } = await createChangedFork('MR deletion wins');
        const pause = pauseNextRead('project', sourceId);
        const creating = request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: sourceId, title: 'stale MR' }).then(response => response);
        await pause.entered;

        const deleted = await request(app).delete(`/api/projects/${sourceId}`).set('Cookie', authorCookie);
        pause.release();
        const created = await creating;

        expect(deleted.status).toBe(200);
        expectRejectedAfterDeletion(created);
        expect(await query(
            `SELECT id FROM merge_requests
             WHERE source_project_id = $1 AND status IN ('open', 'conflicted')`,
            [sourceId],
        )).toEqual([]);
    });

    it('rejects review upsert and leaves no orphan review after project deletion', async () => {
        const projectId = await createPublishedProject('Review deletion wins');
        const pause = pauseNextRead('public-project', projectId);
        const writing = request(app).put(`/api/gallery/${projectId}/review`).set('Cookie', reviewerCookie)
            .send({ rating: 5, body: 'stale review' }).then(response => response);
        await pause.entered;

        const deleted = await request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie);
        pause.release();
        const written = await writing;

        expect(deleted.status).toBe(200);
        expectRejectedAfterDeletion(written);
        expect(await query('SELECT id FROM reviews WHERE project_id = $1', [projectId])).toEqual([]);
    });

    it('rejects project report and leaves no orphan report after project deletion', async () => {
        const projectId = await createPublishedProject('Project report deletion wins');
        const pause = pauseNextRead('public-project', projectId);
        const writing = request(app).post(`/api/gallery/${projectId}/report`)
            .send({ reason: 'stale project report' }).then(response => response);
        await pause.entered;

        const deleted = await request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie);
        pause.release();
        const written = await writing;

        expect(deleted.status).toBe(200);
        expectRejectedAfterDeletion(written);
        expect(await query('SELECT id FROM reports WHERE project_id = $1', [projectId])).toEqual([]);
    });

    it('rejects review report and leaves no orphan report after project deletion', async () => {
        const projectId = await createPublishedProject('Review report deletion wins');
        const reviewId = await createReview(projectId);
        const pause = pauseNextRead('review', reviewId);
        const writing = request(app).post(`/api/gallery/${projectId}/reviews/${reviewId}/report`)
            .send({ reason: 'stale review report' }).then(response => response);
        await pause.entered;

        const deleted = await request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie);
        pause.release();
        const written = await writing;

        expect(deleted.status).toBe(200);
        expectRejectedAfterDeletion(written);
        expect(await query('SELECT id FROM reports WHERE project_id = $1', [projectId])).toEqual([]);
        expect(await query('SELECT id FROM reviews WHERE id = $1', [reviewId])).toEqual([]);
    });
});

describe('related-row writer commits before deletion', () => {
    it('closes an MR committed while deletion is paused before its transaction', async () => {
        const { sourceId } = await createChangedFork('MR writer wins');
        const pause = pauseNextRead('project', sourceId);
        const deleting = request(app).delete(`/api/projects/${sourceId}`).set('Cookie', authorCookie)
            .then(response => response);
        await pause.entered;

        const created = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: sourceId, title: 'committed MR' });
        pause.release();
        const deleted = await deleting;

        expect(created.status).toBe(201);
        expect(deleted.status).toBe(200);
        expect(await query('SELECT status FROM merge_requests WHERE id = $1', [created.body.mergeRequest.id]))
            .toEqual([{ status: 'closed' }]);
    });

    it('removes a review committed while deletion is paused before its transaction', async () => {
        const projectId = await createPublishedProject('Review writer wins');
        const pause = pauseNextRead('project', projectId);
        const deleting = request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie)
            .then(response => response);
        await pause.entered;

        const written = await request(app).put(`/api/gallery/${projectId}/review`).set('Cookie', reviewerCookie)
            .send({ rating: 3, body: 'committed review' });
        pause.release();
        const deleted = await deleting;

        expect(written.status).toBe(200);
        expect(deleted.status).toBe(200);
        expect(await query('SELECT id FROM reviews WHERE project_id = $1', [projectId])).toEqual([]);
    });

    it('removes a project report committed while deletion is paused before its transaction', async () => {
        const projectId = await createPublishedProject('Project report writer wins');
        const pause = pauseNextRead('project', projectId);
        const deleting = request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie)
            .then(response => response);
        await pause.entered;

        const written = await request(app).post(`/api/gallery/${projectId}/report`)
            .send({ reason: 'committed project report' });
        pause.release();
        const deleted = await deleting;

        expect(written.status).toBe(201);
        expect(deleted.status).toBe(200);
        expect(await query('SELECT id FROM reports WHERE project_id = $1', [projectId])).toEqual([]);
    });

    it('removes a review report committed while deletion is paused before its transaction', async () => {
        const projectId = await createPublishedProject('Review report writer wins');
        const reviewId = await createReview(projectId);
        const pause = pauseNextRead('project', projectId);
        const deleting = request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie)
            .then(response => response);
        await pause.entered;

        const written = await request(app).post(`/api/gallery/${projectId}/reviews/${reviewId}/report`)
            .send({ reason: 'committed review report' });
        pause.release();
        const deleted = await deleting;

        expect(written.status).toBe(201);
        expect(deleted.status).toBe(200);
        expect(await query('SELECT id FROM reports WHERE project_id = $1', [projectId])).toEqual([]);
        expect(await query('SELECT id FROM reviews WHERE id = $1', [reviewId])).toEqual([]);
    });
});
