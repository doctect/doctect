// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

const stateWithDayName = (dayName) => {
    const s = minimalState();
    s.variants.default.templates.page.name = dayName;
    return s;
};

let app, ownerCookie, authorCookie, upstreamId, forkId;

const setupForkWithChanges = async () => {
    // upstream published project
    const up = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Upstream', state: stateWithDayName('Original') });
    upstreamId = up.body.project.id;
    await request(app).post(`/api/projects/${upstreamId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    // fork + a change
    const fork = await request(app).post(`/api/projects/${upstreamId}/fork`).set('Cookie', authorCookie);
    forkId = fork.body.project.id;
    await request(app).post(`/api/projects/${forkId}/commits`).set('Cookie', authorCookie)
        .send({ state: stateWithDayName('Improved'), message: 'improve page template' });
};

beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'mrowner@test.dev', username: 'mr_owner' });
    authorCookie = await signUpUser(app, { email: 'mrauthor@test.dev', username: 'mr_author' });
    await setupForkWithChanges();
});

describe('merge request creation', () => {
    it('rejects MRs from projects that are not forks', async () => {
        const p = await request(app).post('/api/projects').set('Cookie', authorCookie)
            .send({ name: 'Standalone', state: minimalState() });
        const res = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: p.body.project.id, title: 'nope' });
        expect(res.status).toBe(400);
    });

    it('rejects MRs when the fork has no changes since the fork point', async () => {
        const fork2 = await request(app).post(`/api/projects/${upstreamId}/fork`).set('Cookie', authorCookie);
        const res = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: fork2.body.project.id, title: 'no-op' });
        expect(res.status).toBe(400);
    });

    it('creates an open MR with a computed diff', async () => {
        const res = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: forkId, title: 'Improve the page template', description: 'Better name' });
        expect(res.status).toBe(201);
        expect(res.body.mergeRequest.status).toBe('open');
        expect(res.body.mergeRequest.targetProjectId).toBe(upstreamId);
    });

    it('lists incoming MRs for the target owner and blocks others', async () => {
        const mine = await request(app).get(`/api/projects/${upstreamId}/merge-requests`).set('Cookie', ownerCookie);
        expect(mine.status).toBe(200);
        expect(mine.body.mergeRequests.length).toBe(1);
        expect(mine.body.mergeRequests[0].authorUsername).toBe('mr_author');

        const blocked = await request(app).get(`/api/projects/${upstreamId}/merge-requests`).set('Cookie', authorCookie);
        expect(blocked.status).toBe(404);
    });

    it('serves MR detail with live diff to owner and author only', async () => {
        const list = await request(app).get('/api/merge-requests/mine').set('Cookie', authorCookie);
        const mrId = list.body.mergeRequests[0].id;

        const detail = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', ownerCookie);
        expect(detail.status).toBe(200);
        expect(detail.body.diff.source.templatesModified).toEqual({ default: ['page'] });
        expect(detail.body.diff.conflicts).toEqual([]);
        expect(detail.body.sourceState.variants.default.templates.page.name).toBe('Improved');

        const stranger = await signUpUser(app, { email: 'nosy@test.dev', username: 'nosy' });
        const blocked = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', stranger);
        expect(blocked.status).toBe(404);
    });

    it('recomputes the diff live against the target\'s current head, flagging new conflicts', async () => {
        // Upstream owner independently edits the very same template *after* the MR was opened.
        // A cached, creation-time diff would still report this MR as conflict-free; a live diff must not.
        await request(app).post(`/api/projects/${upstreamId}/commits`).set('Cookie', ownerCookie)
            .send({ state: stateWithDayName('OwnerEdited'), message: 'owner also renamed the page' });

        const list = await request(app).get('/api/merge-requests/mine').set('Cookie', authorCookie);
        const mrId = list.body.mergeRequests[0].id;

        const detail = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', ownerCookie);
        expect(detail.status).toBe(200);
        expect(detail.body.mergeRequest.status).toBe('conflicted');
        expect(detail.body.diff.conflicts.length).toBeGreaterThan(0);
        // targetState reflects the upstream's brand-new head, not the state at MR-creation time.
        expect(detail.body.targetState.variants.default.templates.page.name).toBe('OwnerEdited');
    });
});
