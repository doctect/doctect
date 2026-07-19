// @vitest-environment node
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });
afterEach(() => { process.env.SIGNUP_CAP = ''; });

const joinWaitlist = async (email) => {
    process.env.SIGNUP_CAP = '0';
    const res = await request(app).post('/api/waitlist').send({ email });
    expect(res.status).toBe(200);
    process.env.SIGNUP_CAP = '';
};

describe('GET /api/admin/waitlist', () => {
    it('requires an admin', async () => {
        const anon = await request(app).get('/api/admin/waitlist');
        expect(anon.status).toBe(401);
        const cookie = await signUpUser(app, { email: 'plain@test.dev', username: 'plain_user' });
        const user = await request(app).get('/api/admin/waitlist').set('Cookie', cookie);
        expect(user.status).toBe(403);
    });

    it('returns entries newest first with a count', async () => {
        // Email prefixes chosen so the email DESC tiebreak agrees with insertion
        // order even when both rows land in the same millisecond.
        await joinWaitlist('a-first@test.dev');
        await joinWaitlist('b-second@test.dev');
        const cookie = await signUpUser(app, { email: 'wl-admin@test.dev', username: 'wl_admin' });
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['wl-admin@test.dev']);
        const res = await request(app).get('/api/admin/waitlist').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
        expect(res.body.entries.map(e => e.email)).toEqual(['b-second@test.dev', 'a-first@test.dev']);
        expect(typeof res.body.entries[0].createdAt).toBe('string');
    });
});
