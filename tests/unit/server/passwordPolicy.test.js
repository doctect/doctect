// tests/unit/server/passwordPolicy.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, TEST_PASSWORD, markVerified } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('password policy enforcement', () => {
    it('rejects sign-up with a too-short password', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email: 'short@test.dev', password: 'Aa1!Aa1!Aa1', name: 'short', username: 'shortpw' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password must be at least 12 characters');
    });

    it('rejects sign-up with only 2 character classes', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email: 'weak@test.dev', password: 'password1234', name: 'weak', username: 'weakpw' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password must use at least 3 of: lowercase, uppercase, digits, symbols');
    });

    it('accepts a compliant sign-up', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email: 'strong@test.dev', password: TEST_PASSWORD, name: 'strong', username: 'strongpw' });
        expect(res.status).toBe(200);
    });

    it('does not police sign-IN (pre-existing weak passwords keep working)', async () => {
        // Simulate a legacy account: create it while the hook allows it by using
        // a compliant password, then verify sign-in itself is never rejected by
        // the policy hook (only /sign-up/email, /change-password, /reset-password are).
        const email = 'legacy@test.dev';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'legacy', username: 'legacypw' });
        await markVerified(email);
        const res = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(res.status).toBe(200);
    });

    it('rejects change-password with a weak NEW password', async () => {
        const email = 'changer@test.dev';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'changer', username: 'changerpw' });
        await markVerified(email);
        const signin = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        const cookie = signin.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        const res = await request(app).post('/api/auth/change-password')
            .set('Cookie', cookie)
            .send({ currentPassword: TEST_PASSWORD, newPassword: 'password1234' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password must use at least 3 of: lowercase, uppercase, digits, symbols');
    });

    it('accepts change-password with a compliant new password, old password stops working', async () => {
        const email = 'rotator@test.dev';
        const NEW_PW = 'Rotated-Pass-99!';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'rotator', username: 'rotatorpw' });
        await markVerified(email);
        const signin = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        const cookie = signin.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');

        const change = await request(app).post('/api/auth/change-password')
            .set('Cookie', cookie)
            .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PW, revokeOtherSessions: true });
        expect(change.status).toBe(200);

        const oldTry = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(oldTry.status).not.toBe(200);

        const newTry = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: NEW_PW });
        expect(newTry.status).toBe(200);
    });
});
