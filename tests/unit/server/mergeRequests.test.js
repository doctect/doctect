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
        .set('If-Match', up.body.project.headCommitId)
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
        expect(detail.body.isTargetOwner).toBe(true);

        const asAuthor = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', authorCookie);
        expect(asAuthor.status).toBe(200);
        expect(asAuthor.body.isTargetOwner).toBe(false);

        const stranger = await signUpUser(app, { email: 'nosy@test.dev', username: 'nosy' });
        const blocked = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', stranger);
        expect(blocked.status).toBe(404);
    });

    it('reports isTargetOwner correctly even when the same user is both the fork author and the target owner (self-fork)', async () => {
        // A solo user forking and proposing changes back to their OWN public project is a
        // legitimate flow (nothing prevents it) -- and it's exactly the case where "not the
        // author" is NOT a safe proxy for "is the target owner", since here they're the same person.
        // Reuses the already-signed-up ownerCookie (rather than a fresh signUpUser call) to stay
        // under better-auth's hardcoded 3-sign-up-per-10s-per-IP+path rate limit for this file
        // (see requireUsername.test.js for the same constraint, root-caused there) -- entirely new
        // project/fork/MR resources scoped to just this test, so it doesn't disturb other assertions.
        const own = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Solo Upstream', state: stateWithDayName('Original') });
        const ownId = own.body.project.id;
        await request(app).post(`/api/projects/${ownId}/publish`).set('Cookie', ownerCookie)
            .set('If-Match', own.body.project.headCommitId)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        const selfFork = await request(app).post(`/api/projects/${ownId}/fork`).set('Cookie', ownerCookie);
        const selfForkId = selfFork.body.project.id;
        await request(app).post(`/api/projects/${selfForkId}/commits`).set('Cookie', ownerCookie)
            .send({ state: stateWithDayName('Improved'), message: 'improve my own template' });
        const mk = await request(app).post('/api/merge-requests').set('Cookie', ownerCookie)
            .send({ sourceProjectId: selfForkId, title: 'Self merge test' });
        expect(mk.status).toBe(201);

        const detail = await request(app).get(`/api/merge-requests/${mk.body.mergeRequest.id}`).set('Cookie', ownerCookie);
        expect(detail.status).toBe(200);
        expect(detail.body.isTargetOwner).toBe(true);
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

describe('merge and close', () => {
    let mrId;
    beforeAll(async () => {
        // The MR left over from 'merge request creation' is no longer clean: its final test
        // ("recomputes the diff live...") deliberately gave upstream a conflicting commit, so
        // that exact MR is now genuinely (and correctly) conflicted against the live target head.
        // To exercise a real clean-merge path here, fork upstream's CURRENT head fresh and open
        // a brand-new MR from it, rather than reusing the now-conflicted one.
        const fork2 = await request(app).post(`/api/projects/${upstreamId}/fork`).set('Cookie', authorCookie);
        const cleanForkId = fork2.body.project.id;
        await request(app).post(`/api/projects/${cleanForkId}/commits`).set('Cookie', authorCookie)
            .send({ state: stateWithDayName('Improved'), message: 'improve page template again' });
        const mk = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: cleanForkId, title: 'Improve the page template (clean)' });
        mrId = mk.body.mergeRequest.id;
    });

    it('forbids merge by the author (only target owner)', async () => {
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', authorCookie);
        expect(res.status).toBe(403);
    });

    it('merges cleanly and creates a merge commit on target', async () => {
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(200);
        expect(res.body.mergeRequest.status).toBe('merged');

        const head = await request(app)
            .get(`/api/projects/${upstreamId}/commits/${res.body.commit.id}`).set('Cookie', ownerCookie);
        expect(head.body.commit.state.variants.default.templates.page.name).toBe('Improved');
        expect(head.body.commit.message).toContain('Merge:');

        // The merged/closed early-return branch of GET /api/merge-requests/:id must also report
        // isTargetOwner -- it's a separate code path from the live-diff branch above.
        const mergedDetail = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', ownerCookie);
        expect(mergedDetail.body.mergeRequest.status).toBe('merged');
        expect(mergedDetail.body.isTargetOwner).toBe(true);
    });

    it('refuses to merge twice', async () => {
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(409);
    });

    it('409s on conflicted MRs', async () => {
        // author makes a NEW fork change; owner then changes the same template upstream
        await request(app).post(`/api/projects/${forkId}/commits`).set('Cookie', authorCookie)
            .send({ state: stateWithDayName('Fork v3'), message: 'fork again' });
        const mk = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: forkId, title: 'Second round' });
        // NOTE: base is still the original fork point; upstream already merged 'Improved',
        // and now the owner edits the same template again:
        await request(app).post(`/api/projects/${upstreamId}/commits`).set('Cookie', ownerCookie)
            .send({ state: stateWithDayName('Owner rewrite'), message: 'owner edit' });
        const res = await request(app).post(`/api/merge-requests/${mk.body.mergeRequest.id}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(409);
        const detail = await request(app).get(`/api/merge-requests/${mk.body.mergeRequest.id}`).set('Cookie', ownerCookie);
        expect(detail.body.mergeRequest.status).toBe('conflicted');
    });

    it('author can close their own MR', async () => {
        const list = await request(app).get('/api/merge-requests/mine').set('Cookie', authorCookie);
        const openMr = list.body.mergeRequests.find(m => m.status !== 'merged');
        const res = await request(app).post(`/api/merge-requests/${openMr.id}/close`).set('Cookie', authorCookie);
        expect(res.status).toBe(200);
        expect(res.body.mergeRequest.status).toBe('closed');
    });
});
