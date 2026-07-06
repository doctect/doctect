// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

// Unique q-prefix isolates this file's projects from the shared worker DB.
const PREFIX = 'ratingsort';

let app, ownerCookie, ids = {};
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'rs-owner@test.dev', username: 'rs_owner' });
    const raterA = await signUpUser(app, { email: 'rs-a@test.dev', username: 'rs_rater_a' });
    const raterB = await signUpUser(app, { email: 'rs-b@test.dev', username: 'rs_rater_b' });

    for (const suffix of ['high', 'low', 'none']) {
        const p = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: `${PREFIX} ${suffix}`, state: minimalState() });
        ids[suffix] = p.body.project.id;
        await request(app).post(`/api/projects/${ids[suffix]}/publish`).set('Cookie', ownerCookie)
            .send({ description: 'd', tags: [], thumbnails: [PNG_1X1] });
    }
    // high: avg 4.5 (4 + 5), low: avg 2.0
    await request(app).put(`/api/gallery/${ids.high}/review`).set('Cookie', raterA).send({ rating: 4 });
    await request(app).put(`/api/gallery/${ids.high}/review`).set('Cookie', raterB).send({ rating: 5 });
    await request(app).put(`/api/gallery/${ids.low}/review`).set('Cookie', raterA).send({ rating: 2 });
});

describe('rating aggregates', () => {
    it('exposes ratingAvg / ratingCount on gallery cards', async () => {
        const res = await request(app).get(`/api/gallery?q=${PREFIX}`);
        const high = res.body.items.find(i => i.id === ids.high);
        const none = res.body.items.find(i => i.id === ids.none);
        expect(high.ratingAvg).toBe(4.5);
        expect(high.ratingCount).toBe(2);
        expect(none.ratingAvg).toBeNull();
        expect(none.ratingCount).toBe(0);
    });

    it('exposes them on the detail endpoint', async () => {
        const res = await request(app).get(`/api/gallery/${ids.high}`);
        expect(res.body.project.ratingAvg).toBe(4.5);
        expect(res.body.project.ratingCount).toBe(2);
    });

    it('sort=rating orders by average desc with unrated projects last', async () => {
        const res = await request(app).get(`/api/gallery?q=${PREFIX}&sort=rating`);
        const order = res.body.items.map(i => i.id);
        expect(order).toEqual([ids.high, ids.low, ids.none]);
    });

    it('rounds ratingAvg to one decimal', async () => {
        // 4 + 5 + 2 pattern on a fresh project: avg 3.666... -> 3.7
        const raterC = await signUpUser(app, { email: 'rs-c@test.dev', username: 'rs_rater_c' });
        await request(app).put(`/api/gallery/${ids.low}/review`).set('Cookie', raterC).send({ rating: 5 });
        // low is now (2 + 5) / 2 = 3.5 — exact; also verify a repeating decimal:
        const raterD = await signUpUser(app, { email: 'rs-d@test.dev', username: 'rs_rater_d' });
        await request(app).put(`/api/gallery/${ids.low}/review`).set('Cookie', raterD).send({ rating: 4 });
        // (2 + 5 + 4) / 3 = 3.666... -> 3.7
        const res = await request(app).get(`/api/gallery/${ids.low}`);
        expect(res.body.project.ratingAvg).toBe(3.7);
        expect(res.body.project.ratingCount).toBe(3);
    });

    it('profile project cards include the rating fields', async () => {
        const res = await request(app).get('/api/users/rs_owner');
        const high = res.body.projects.find(p => p.id === ids.high);
        expect(high.ratingAvg).toBe(4.5);
        expect(high.ratingCount).toBe(2);
    });
});
