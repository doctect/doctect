// @vitest-environment node
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initTestApp } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });
afterEach(() => { process.env.SIGNUP_CAP = ''; });

describe('GET /api/signup-status', () => {
    it('reports open while under the cap', async () => {
        const res = await request(app).get('/api/signup-status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ open: true });
    });

    it('reports closed once the cap is reached', async () => {
        process.env.SIGNUP_CAP = '0';
        const res = await request(app).get('/api/signup-status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ open: false });
    });
});

describe('POST /api/waitlist', () => {
    it('rejects with SIGNUPS_OPEN while signups are open', async () => {
        const res = await request(app).post('/api/waitlist').send({ email: 'open@test.dev' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SIGNUPS_OPEN');
    });

    it('stores a valid email lowercased while closed', async () => {
        process.env.SIGNUP_CAP = '0';
        const res = await request(app).post('/api/waitlist').send({ email: '  Waiting@Test.DEV ' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        const { query } = await import('../../../server/db.js');
        const rows = await query('SELECT email FROM waitlist WHERE email = $1', ['waiting@test.dev']);
        expect(rows).toHaveLength(1);
    });

    it('treats a duplicate email as success without a second row', async () => {
        process.env.SIGNUP_CAP = '0';
        await request(app).post('/api/waitlist').send({ email: 'twice@test.dev' });
        const res = await request(app).post('/api/waitlist').send({ email: 'twice@test.dev' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        const { query } = await import('../../../server/db.js');
        const rows = await query('SELECT id FROM waitlist WHERE email = $1', ['twice@test.dev']);
        expect(rows).toHaveLength(1);
    });

    it('rejects malformed emails', async () => {
        process.env.SIGNUP_CAP = '0';
        for (const bad of ['not-an-email', 'a@b', 'a b@test.dev', '', 42, null, undefined]) {
            const res = await request(app).post('/api/waitlist').send({ email: bad });
            expect(res.status, `email: ${String(bad)}`).toBe(400);
        }
    });
});
