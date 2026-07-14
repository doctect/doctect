// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, query;
const generator = {
    formatVersion: 1,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};
beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'store@test.dev', username: 'store_u' });
});

describe('compressed commit storage', () => {
    it('stores new commits gzipped with size and hash, state_json empty', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Zip', state: minimalState() });
        expect(res.status).toBe(201);
        const rows = await query('SELECT state_json, state_gzip, state_bytes, state_hash FROM commits WHERE id = $1', [res.body.commit.id]);
        expect(rows[0].state_json).toBe('');
        expect(rows[0].state_gzip).not.toBeNull();
        expect(rows[0].state_bytes).toBeGreaterThan(0);
        expect(typeof rows[0].state_hash).toBe('string');
    });

    it('round-trips state through the commit-detail endpoint', async () => {
        const state = { ...minimalState('RoundTrip'), generator };
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'RT', state });
        const res = await request(app)
            .get(`/api/projects/${created.body.project.id}/commits/${created.body.commit.id}`)
            .set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.commit.state).toEqual(state);
        expect(res.body.commit.state.generator).toEqual(generator);
    });

    it('still reads legacy rows that only have state_json', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Legacy', state: minimalState() });
        const projectId = created.body.project.id;
        const legacyState = minimalState('LegacyTitle');
        await query(
            `INSERT INTO commits (id, project_id, parent_commit_id, message, state_json, schema_version, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['legacy-commit-1', projectId, null, 'legacy', JSON.stringify(legacyState), 7, 'someone', new Date().toISOString()]);
        const res = await request(app)
            .get(`/api/projects/${projectId}/commits/legacy-commit-1`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.commit.state).toEqual(legacyState);
    });

    it('forking a compressed commit round-trips correctly', async () => {
        const state = { ...minimalState('ForkMe'), generator };
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'ForkSrc', state });
        await request(app).post(`/api/projects/${created.body.project.id}/publish`).set('Cookie', cookie)
            .set('If-Match', `"${created.body.project.headCommitId}"`)
            .send({ description: '', tags: [], thumbnails: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='] });
        const cookieB = await signUpUser(app, { email: 'forker@test.dev', username: 'forker_u' });
        const fork = await request(app).post(`/api/projects/${created.body.project.id}/fork`).set('Cookie', cookieB);
        expect(fork.status).toBe(201);
        const detail = await request(app)
            .get(`/api/projects/${fork.body.project.id}/commits/${fork.body.project.headCommitId}`)
            .set('Cookie', cookieB);
        expect(detail.body.commit.state).toEqual(state);
        expect(detail.body.commit.state.generator).toEqual(generator);
    });
});
