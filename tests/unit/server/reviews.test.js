// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, signUpUserNoUsername, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie, raterCookie, rater2Cookie, noUsernameCookie, projectId;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'rev-schema-owner@test.dev', username: 'rev_schema_owner' });
    raterCookie = await signUpUser(app, { email: 'rev-rater@test.dev', username: 'rev_rater' });
    rater2Cookie = await signUpUser(app, { email: 'rev-rater2@test.dev', username: 'rev_rater2' });
    noUsernameCookie = await signUpUserNoUsername(app, { email: 'rev-noname@test.dev', name: 'Anon Legacy' });
    const proj = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Reviewable Planner', state: minimalState() });
    projectId = proj.body.project.id;
    await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', ownerCookie)
        .set('If-Match', proj.body.project.headCommitId)
        .send({ description: 'reviewable', tags: ['rev-tag'], thumbnails: [PNG_1X1] });
});

describe('008_reviews schema', () => {
    it('creates the reviews table with a 1-5 rating check and per-user uniqueness', async () => {
        const { query } = await import('../../../server/db.js');
        const now = new Date().toISOString();
        await query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-schema-1', 'proj-schema-x', 'user-schema-a', 4, 'nice', now, now]);
        const rows = await query('SELECT rating, body FROM reviews WHERE id = $1', ['rv-schema-1']);
        expect(rows[0].rating).toBe(4);
        expect(rows[0].body).toBe('nice');
        // CHECK constraint
        await expect(query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-schema-2', 'proj-schema-x', 'user-schema-b', 6, null, now, now])).rejects.toThrow();
        // UNIQUE(project_id, user_id)
        await expect(query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-schema-3', 'proj-schema-x', 'user-schema-a', 2, null, now, now])).rejects.toThrow();
    });

    it('adds a nullable review_id column to reports', async () => {
        const { query } = await import('../../../server/db.js');
        await query(
            `INSERT INTO reports (id, project_id, reporter_user_id, reason, review_id)
             VALUES ($1, $2, $3, $4, $5)`,
            ['rep-schema-1', 'proj-schema-x', null, 'test', 'rv-schema-1']);
        const rows = await query('SELECT review_id FROM reports WHERE id = $1', ['rep-schema-1']);
        expect(rows[0].review_id).toBe('rv-schema-1');
    });

    it('deleting a project deletes its reviews', async () => {
        const { query } = await import('../../../server/db.js');
        const p = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Review Cleanup Target', state: minimalState() });
        const projectId = p.body.project.id;
        const now = new Date().toISOString();
        await query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-cleanup-1', projectId, 'user-schema-c', 5, null, now, now]);
        const del = await request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie);
        expect(del.status).toBe(200);
        const left = await query('SELECT id FROM reviews WHERE project_id = $1', [projectId]);
        expect(left.length).toBe(0);
    });
});

describe('review write gating', () => {
    it('rejects anonymous writes', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`).send({ rating: 4 });
        expect(res.status).toBe(401);
    });

    it('rejects accounts without a username, with the USERNAME_REQUIRED code', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', noUsernameCookie).send({ rating: 4 });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it("rejects the owner's self-review", async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', ownerCookie).send({ rating: 5 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/own project/i);
    });

    it('validates the rating', async () => {
        for (const rating of [0, 6, 2.5, undefined, 'four']) {
            const res = await request(app).put(`/api/gallery/${projectId}/review`)
                .set('Cookie', raterCookie).send({ rating });
            expect(res.status).toBe(400);
        }
    });

    it('rejects bodies over 2000 chars', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', raterCookie).send({ rating: 4, body: 'x'.repeat(2001) });
        expect(res.status).toBe(400);
    });
});

describe('review CRUD', () => {
    it('creates a review and returns its DTO', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', raterCookie).send({ rating: 4, body: '  Solid layout.  ' });
        expect(res.status).toBe(200);
        expect(res.body.review.rating).toBe(4);
        expect(res.body.review.body).toBe('Solid layout.'); // trimmed
        expect(res.body.review.author).toBe('rev_rater');
        expect(res.body.review.createdAt).toBeTruthy();
    });

    it('lists reviews publicly; myReview only for the signed-in caller', async () => {
        const anon = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(anon.status).toBe(200);
        expect(anon.body.reviews.some(r => r.author === 'rev_rater')).toBe(true);
        expect(anon.body.myReview).toBeNull();

        const mine = await request(app).get(`/api/gallery/${projectId}/reviews`).set('Cookie', raterCookie);
        expect(mine.body.myReview.rating).toBe(4);
    });

    it('upserts: a second PUT by the same user edits, not duplicates', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', raterCookie).send({ rating: 2, body: 'Changed my mind.' });
        expect(res.status).toBe(200);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        const mine = list.body.reviews.filter(r => r.author === 'rev_rater');
        expect(mine.length).toBe(1);
        expect(mine[0].rating).toBe(2);
        expect(mine[0].body).toBe('Changed my mind.');
    });

    it('a second user gets their own independent review', async () => {
        await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', rater2Cookie).send({ rating: 5 });
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(list.body.reviews.length).toBe(2);
    });

    it("deletes only the caller's own review; 404 when there is none", async () => {
        const del = await request(app).delete(`/api/gallery/${projectId}/review`).set('Cookie', rater2Cookie);
        expect(del.status).toBe(200);
        const again = await request(app).delete(`/api/gallery/${projectId}/review`).set('Cookie', rater2Cookie);
        expect(again.status).toBe(404);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(list.body.reviews.length).toBe(1); // rev_rater's survives
    });

    it('anonymous delete is rejected', async () => {
        const res = await request(app).delete(`/api/gallery/${projectId}/review`);
        expect(res.status).toBe(401);
    });

    it('reviews of a non-public project 404 (write and read)', async () => {
        const priv = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Private No Reviews', state: minimalState() });
        const put = await request(app).put(`/api/gallery/${priv.body.project.id}/review`)
            .set('Cookie', raterCookie).send({ rating: 3 });
        expect(put.status).toBe(404);
        const list = await request(app).get(`/api/gallery/${priv.body.project.id}/reviews`);
        expect(list.status).toBe(404);
    });
});

describe('review reporting and moderation', () => {
    let adminCookie, reviewId;
    beforeAll(async () => {
        const { query } = await import('../../../server/db.js');
        adminCookie = await signUpUser(app, { email: 'rev-admin@test.dev', username: 'rev_admin' });
        await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['rev-admin@test.dev']);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        reviewId = list.body.reviews.find(r => r.author === 'rev_rater').id;
    });

    it('accepts an anonymous review report and requires a reason', async () => {
        const bad = await request(app).post(`/api/gallery/${projectId}/reviews/${reviewId}/report`).send({});
        expect(bad.status).toBe(400);
        const ok = await request(app).post(`/api/gallery/${projectId}/reviews/${reviewId}/report`)
            .send({ reason: 'abusive text' });
        expect(ok.status).toBe(201);
    });

    it('404s when the review does not belong to that project', async () => {
        const res = await request(app).post(`/api/gallery/${projectId}/reviews/not-a-real-review/report`)
            .send({ reason: 'x' });
        expect(res.status).toBe(404);
    });

    it('surfaces the review in the admin report listing', async () => {
        const res = await request(app).get('/api/admin/reports').set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        const rep = res.body.reports.find(r => r.review_id === reviewId);
        expect(rep).toBeTruthy();
        expect(rep.review_rating).toBe(2);
        expect(rep.review_body).toBe('Changed my mind.');
    });

    it('lets an admin delete a review; non-admins cannot', async () => {
        const forbidden = await request(app).delete(`/api/admin/reviews/${reviewId}`).set('Cookie', raterCookie);
        expect(forbidden.status).toBe(403);
        const res = await request(app).delete(`/api/admin/reviews/${reviewId}`).set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(list.body.reviews.find(r => r.id === reviewId)).toBeUndefined();
    });
});
