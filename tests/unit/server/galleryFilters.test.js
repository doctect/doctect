// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

// Unique tag values isolate this file from the shared worker DB.
let app, ownerCookie, ids = {};
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'gf-owner@test.dev', username: 'gf_owner' });
    const make = async (name, tags) => {
        const p = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name, state: minimalState() });
        await request(app).post(`/api/projects/${p.body.project.id}/publish`).set('Cookie', ownerCookie)
            .send({ description: 'd', tags, thumbnails: [PNG_1X1] });
        return p.body.project.id;
    };
    ids.a = await make('gfilters alpha', ['gf-plan', 'gf-weekly']);
    ids.b = await make('gfilters beta', ['gf-planner']);
    ids.c = await make('gfilters gamma', ['gf-plan']);
});

describe('tag filtering', () => {
    it('filters by exact tag', async () => {
        const res = await request(app).get('/api/gallery?tag=gf-plan');
        const found = res.body.items.map(i => i.id);
        expect(found).toContain(ids.a);
        expect(found).toContain(ids.c);
        expect(found).not.toContain(ids.b); // 'gf-plan' must NOT match 'gf-planner'
    });

    it('combines tag with q', async () => {
        const res = await request(app).get('/api/gallery?tag=gf-plan&q=alpha');
        expect(res.body.items.map(i => i.id)).toEqual([ids.a]);
    });

    it('q matches tag text too', async () => {
        const res = await request(app).get('/api/gallery?q=gf-weekly');
        expect(res.body.items.map(i => i.id)).toContain(ids.a);
    });
});

describe('limit param', () => {
    it('caps the page size and reports hasMore against it', async () => {
        const res = await request(app).get('/api/gallery?q=gfilters&limit=2');
        expect(res.body.items.length).toBe(2);
        expect(res.body.hasMore).toBe(true);
        const page2 = await request(app).get('/api/gallery?q=gfilters&limit=2&page=1');
        expect(page2.body.items.length).toBe(1);
        expect(page2.body.hasMore).toBe(false);
    });

    it('clamps nonsense values', async () => {
        const res = await request(app).get('/api/gallery?q=gfilters&limit=9999');
        expect(res.status).toBe(200); // falls back to PAGE_SIZE cap, no error
        const zero = await request(app).get('/api/gallery?q=gfilters&limit=0');
        expect(zero.body.items.length).toBeGreaterThan(0); // floor of 1 / default applies
    });
});

describe('GET /api/gallery/tags', () => {
    it('returns public tag counts', async () => {
        const res = await request(app).get('/api/gallery/tags');
        expect(res.status).toBe(200);
        const plan = res.body.tags.find(t => t.tag === 'gf-plan');
        const planner = res.body.tags.find(t => t.tag === 'gf-planner');
        expect(plan.count).toBe(2);
        expect(planner.count).toBe(1);
    });

    it('does not fall through to the :id detail route', async () => {
        const res = await request(app).get('/api/gallery/tags');
        expect(res.body.tags).toBeDefined(); // not { error: 'Project not found' }
    });
});
