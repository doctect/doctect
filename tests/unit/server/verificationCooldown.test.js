// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, TEST_PASSWORD } from './helpers.js';
import { setSendEmailImpl } from '../../../server/email.js';

let app;
const sent = [];

beforeAll(async () => {
    setSendEmailImpl(async (msg) => { sent.push(msg); return { id: `t-${sent.length}` }; });
    app = await initTestApp();
});
afterAll(() => setSendEmailImpl(null));

const verificationEmailsTo = (email) =>
    sent.filter(m => m.to === email && /verify/i.test(m.subject));

describe('verification email cooldown', () => {
    it('does not re-send on every unverified sign-in attempt within the cooldown', async () => {
        const email = 'cooldown@test.dev';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'cd', username: 'cooldownuser' });
        const afterSignup = verificationEmailsTo(email).length;
        expect(afterSignup).toBe(1); // sendOnSignUp

        // Three rapid unverified sign-in attempts: each is refused (403), but
        // only the FIRST may trigger a re-send; the rest are inside the cooldown.
        for (let i = 0; i < 3; i++) {
            const res = await request(app).post('/api/auth/sign-in/email')
                .send({ email, password: TEST_PASSWORD });
            expect(res.status).toBe(403);
        }
        // signup already sent one within the window, so sign-ins add nothing
        expect(verificationEmailsTo(email).length).toBe(afterSignup);
    });

    it('cooldown is per-address, not global', async () => {
        const email = 'other@test.dev';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'ot', username: 'otheruser' });
        expect(verificationEmailsTo(email).length).toBe(1);
    });
});
