// tests/unit/server/deleteProjectClosesMrs.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, query, ownerCookie, authorCookie;
beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    ownerCookie = await signUpUser(app, { email: 'delmr-owner@test.dev', username: 'delmr_owner' });
    authorCookie = await signUpUser(app, { email: 'delmr-author@test.dev', username: 'delmr_author' });
});

// Builds a fresh upstream (owned by ownerCookie) + fork with one edit (by authorCookie)
// + an open merge request proposing that edit back. Returns all three ids so a test can
// delete either side. A fresh combo per test avoids cross-test ordering dependencies.
const makeOpenMr = async () => {
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Upstream', state: minimalState('base') });
    const targetId = pub.body.project.id;
    await request(app).post(`/api/projects/${targetId}/publish`).set('Cookie', ownerCookie)
        .set('If-Match', pub.body.project.headCommitId)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const fork = await request(app).post(`/api/projects/${targetId}/fork`).set('Cookie', authorCookie);
    const sourceId = fork.body.project.id;
    await request(app).post(`/api/projects/${sourceId}/commits`).set('Cookie', authorCookie)
        .send({ state: minimalState('changed'), message: 'edit' });
    const mr = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
        .send({ sourceProjectId: sourceId, title: 'Propose' });
    return { mrId: mr.body.mergeRequest.id, targetId, sourceId };
};

describe('deleting a project closes any open MRs referencing it', () => {
    it('closes an open MR when its SOURCE (fork) project is deleted', async () => {
        const { mrId, sourceId } = await makeOpenMr();
        const del = await request(app).delete(`/api/projects/${sourceId}`).set('Cookie', authorCookie);
        expect(del.status).toBe(200);
        const rows = await query('SELECT status FROM merge_requests WHERE id = $1', [mrId]);
        expect(rows[0].status).toBe('closed');
    });

    it('closes an open MR when its TARGET (upstream) project is deleted', async () => {
        const { mrId, targetId } = await makeOpenMr();
        const del = await request(app).delete(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        expect(del.status).toBe(200);
        const rows = await query('SELECT status FROM merge_requests WHERE id = $1', [mrId]);
        expect(rows[0].status).toBe('closed');
    });

    it('deletion still succeeds even though it closes MRs -- never blocked', async () => {
        const { targetId } = await makeOpenMr();
        const del = await request(app).delete(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        expect(del.status).toBe(200);
        expect(del.body.success).toBe(true);
        const getRes = await request(app).get(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        expect(getRes.status).toBe(404);
    });

    it('does not re-touch an already-closed MR\'s resolved_at when its project is later deleted', async () => {
        const { mrId, targetId } = await makeOpenMr();
        await request(app).post(`/api/merge-requests/${mrId}/close`).set('Cookie', ownerCookie);
        const before = await query('SELECT resolved_at FROM merge_requests WHERE id = $1', [mrId]);
        const resolvedAtBefore = before[0].resolved_at;
        await request(app).delete(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        const after = await query('SELECT status, resolved_at FROM merge_requests WHERE id = $1', [mrId]);
        expect(after[0].status).toBe('closed');
        expect(after[0].resolved_at).toBe(resolvedAtBefore);
    });
});
