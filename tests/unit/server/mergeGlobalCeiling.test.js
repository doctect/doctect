// tests/unit/server/mergeGlobalCeiling.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie, authorCookie;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'gceilowner@test.dev', username: 'gceil_owner' });
    authorCookie = await signUpUser(app, { email: 'gceilauthor@test.dev', username: 'gceil_author' });
});
afterEach(() => {
    delete process.env.MAX_TOTAL_STORAGE_MB;
    delete process.env.USER_STORAGE_QUOTA_MB;
});

// Creates a fresh upstream (owned by ownerCookie) + fork with one real edit (by
// authorCookie) + an open merge request proposing that edit back. Returns the MR id.
// A fresh combo per test avoids depending on merge/test execution order.
const makeOpenMr = async (seed) => {
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: `Upstream-${seed}`, state: minimalState(`base-${seed}`) });
    const targetId = pub.body.project.id;
    await request(app).post(`/api/projects/${targetId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const fork = await request(app).post(`/api/projects/${targetId}/fork`).set('Cookie', authorCookie);
    const sourceId = fork.body.project.id;
    await request(app).post(`/api/projects/${sourceId}/commits`).set('Cookie', authorCookie)
        .send({ state: minimalState(`changed-${seed}`), message: 'edit' });
    const mr = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
        .send({ sourceProjectId: sourceId, title: `Propose-${seed}` });
    return mr.body.mergeRequest.id;
};

describe('merge respects the global storage ceiling (but not the per-user quota)', () => {
    it('rejects a merge that would exceed MAX_TOTAL_STORAGE_MB with 507', async () => {
        const mrId = await makeOpenMr('ceiling-block');
        process.env.MAX_TOTAL_STORAGE_MB = '0.0000001';
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(507);
        expect(res.body.code).toBe('SERVICE_STORAGE_FULL');
    });

    it('allows the merge once comfortably under the ceiling', async () => {
        const mrId = await makeOpenMr('ceiling-ok');
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(200);
        expect(res.body.commit.id).toBeTruthy();
    });

    it('does NOT apply the per-user quota to merges — an owner already "over" their personal quota can still receive one', async () => {
        const mrId = await makeOpenMr('quota-exempt');
        process.env.USER_STORAGE_QUOTA_MB = '0.0000001';
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(200);
    });
});
