// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, TEST_PASSWORD } from './helpers.js';
import { setSendEmailImpl } from '../../../server/email.js';

let app;
const sent = []; // captured outbound emails

beforeAll(async () => {
    setSendEmailImpl(async (msg) => { sent.push(msg); return { id: `test-${sent.length}` }; });
    app = await initTestApp();
});
afterAll(() => setSendEmailImpl(null));

const lastLinkFor = (email) => {
    const msg = [...sent].reverse().find(m => m.to === email);
    if (!msg) return null;
    const m = /(https?:\/\/[^\s"'<>]+verify-email[^\s"'<>]*)/.exec(msg.text || msg.html);
    return m ? m[1] : null;
};

describe('email verification flow', () => {
    const email = 'verifyme@test.dev';

    it('sign-up sends a verification email and does not grant a session', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'verifyme', username: 'verifyme' });
        expect(res.status).toBe(200);
        expect(lastLinkFor(email)).toBeTruthy();
        // /api/me with whatever cookies sign-up set must not be an authenticated session
        const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
        const me = await request(app).get('/api/me').set('Cookie', cookies);
        expect(me.body.user ?? null).toBeNull();
    });

    it('sign-in before verification is refused and re-sends the email', async () => {
        const before = sent.length;
        const res = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(res.status).toBe(403);
        expect(sent.length).toBeGreaterThan(before);
    });

    it('visiting the verification link verifies the account; sign-in then succeeds', async () => {
        const link = lastLinkFor(email);
        expect(link).toBeTruthy();
        const url = new URL(link);
        const verifyRes = await request(app).get(url.pathname + url.search);
        expect([200, 302]).toContain(verifyRes.status);

        const signin = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(signin.status).toBe(200);
    });

    it('google-style accounts are unaffected (helpers still produce working sessions)', async () => {
        const { signUpUser } = await import('./helpers.js');
        const cookie = await signUpUser(app, { email: 'helper@test.dev', username: 'helperuser' });
        const me = await request(app).get('/api/me').set('Cookie', cookie);
        expect(me.body.user.username).toBe('helperuser');
    });
});
