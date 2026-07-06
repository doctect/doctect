// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'rev-schema-owner@test.dev', username: 'rev_schema_owner' });
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
