// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

const dbFaults = vi.hoisted(() => ({ beforeMergeUserLookup: null, failMergedStatusUpdate: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (/SELECT username FROM "user"/.test(text) && dbFaults.beforeMergeUserLookup) {
            const hook = dbFaults.beforeMergeUserLookup;
            dbFaults.beforeMergeUserLookup = null;
            await hook();
        }
        if (/UPDATE merge_requests SET status = 'merged'/.test(text) && dbFaults.failMergedStatusUpdate) {
            dbFaults.failMergedStatusUpdate = false;
            throw new Error('Injected merge status failure');
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

const stateWithDayName = (dayName) => {
    const s = minimalState();
    s.variants.default.templates.page.name = dayName;
    return s;
};

const generator = (overrides = {}) => ({
    formatVersion: 1,
    templateScript: 'return { elements: [] };',
    hierarchyScript: 'return { nodes: {} };',
    generatedAt: '2026-07-14T10:00:00.000Z',
    ...overrides,
});

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

const makeOpenMr = async (seed) => {
    const upstream = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: `Atomic Upstream ${seed}`, state: stateWithDayName(`Base ${seed}`) });
    const targetId = upstream.body.project.id;
    await request(app).post(`/api/projects/${targetId}/publish`).set('Cookie', ownerCookie)
        .set('If-Match', upstream.body.project.headCommitId)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const fork = await request(app).post(`/api/projects/${targetId}/fork`).set('Cookie', authorCookie);
    await request(app).post(`/api/projects/${fork.body.project.id}/commits`).set('Cookie', authorCookie)
        .send({ state: stateWithDayName(`Fork ${seed}`), message: `fork ${seed}` });
    const created = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
        .send({ sourceProjectId: fork.body.project.id, title: `Atomic ${seed}` });
    return { mrId: created.body.mergeRequest.id, targetId, headId: upstream.body.project.headCommitId };
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

    it('accepts an MR whose only change is added generator provenance', async () => {
        const up = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Generator Upstream', state: minimalState() });
        await request(app).post(`/api/projects/${up.body.project.id}/publish`).set('Cookie', ownerCookie)
            .set('If-Match', up.body.project.headCommitId)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        const fork = await request(app).post(`/api/projects/${up.body.project.id}/fork`).set('Cookie', authorCookie);
        await request(app).post(`/api/projects/${fork.body.project.id}/commits`).set('Cookie', authorCookie)
            .send({ state: { ...minimalState(), generator: generator() }, message: 'save generator source' });

        const created = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: fork.body.project.id, title: 'Add generator source' });

        expect(created.status).toBe(201);
        const detail = await request(app).get(`/api/merge-requests/${created.body.mergeRequest.id}`).set('Cookie', ownerCookie);
        expect(detail.body.diff.source.generatorChange).toBe('added');
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

    it('persists source generator provenance in a generator-only merge commit', async () => {
        const up = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Generator Merge Upstream', state: minimalState() });
        await request(app).post(`/api/projects/${up.body.project.id}/publish`).set('Cookie', ownerCookie)
            .set('If-Match', up.body.project.headCommitId)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        const fork = await request(app).post(`/api/projects/${up.body.project.id}/fork`).set('Cookie', authorCookie);
        const provenance = generator({ generatedAt: '2026-07-14T12:34:56.000Z' });
        await request(app).post(`/api/projects/${fork.body.project.id}/commits`).set('Cookie', authorCookie)
            .send({ state: { ...minimalState(), generator: provenance }, message: 'save generator source' });
        const created = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: fork.body.project.id, title: 'Merge generator source' });

        const merged = await request(app).post(`/api/merge-requests/${created.body.mergeRequest.id}/merge`).set('Cookie', ownerCookie);

        expect(merged.status).toBe(200);
        const head = await request(app)
            .get(`/api/projects/${up.body.project.id}/commits/${merged.body.commit.id}`).set('Cookie', ownerCookie);
        expect(head.body.commit.state.generator).toEqual(provenance);
    });

    it('rejects when the target head changes after diff computation', async () => {
        const { mrId: atomicMrId, targetId } = await makeOpenMr('head-race');
        let releaseMerge;
        const held = new Promise(resolve => { releaseMerge = resolve; });
        let mergePaused;
        const paused = new Promise(resolve => { mergePaused = resolve; });
        dbFaults.beforeMergeUserLookup = async () => {
            mergePaused();
            await held;
        };
        const merging = request(app).post(`/api/merge-requests/${atomicMrId}/merge`)
            .set('Cookie', ownerCookie)
            .then(response => response);
        await paused;

        const saved = await request(app).post(`/api/projects/${targetId}/commits`).set('Cookie', ownerCookie)
            .send({ state: stateWithDayName('Owner advanced'), message: 'owner advanced target' });
        releaseMerge();
        const merged = await merging;

        expect(saved.status).toBe(201);
        expect(merged.status).toBe(409);
        expect(merged.body.code).toBe('TARGET_HEAD_CHANGED');
        const { query } = await import('../../../server/db.js');
        const project = await query('SELECT head_commit_id FROM projects WHERE id = $1', [targetId]);
        const mr = await query('SELECT status FROM merge_requests WHERE id = $1', [atomicMrId]);
        const staleMerges = await query('SELECT id FROM commits WHERE project_id = $1 AND message = $2', [targetId, 'Merge: Atomic head-race (from @mr_author)']);
        expect(project[0].head_commit_id).toBe(saved.body.commit.id);
        expect(mr[0].status).toBe('open');
        expect(staleMerges).toEqual([]);
    });

    it('rolls back commit and target head when final MR update fails', async () => {
        const { mrId: atomicMrId, targetId, headId } = await makeOpenMr('rollback');
        dbFaults.failMergedStatusUpdate = true;

        const merged = await request(app).post(`/api/merge-requests/${atomicMrId}/merge`).set('Cookie', ownerCookie);

        expect(merged.status).toBe(500);
        const { query } = await import('../../../server/db.js');
        const project = await query('SELECT head_commit_id FROM projects WHERE id = $1', [targetId]);
        const mr = await query('SELECT status FROM merge_requests WHERE id = $1', [atomicMrId]);
        const mergeCommits = await query('SELECT id FROM commits WHERE project_id = $1 AND message = $2', [targetId, 'Merge: Atomic rollback (from @mr_author)']);
        expect(project[0].head_commit_id).toBe(headId);
        expect(mr[0].status).toBe('open');
        expect(mergeCommits).toEqual([]);
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
