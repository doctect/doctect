// @vitest-environment node
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, markVerified, TEST_PASSWORD } from './helpers.js';

const capFault = vi.hoisted(() => ({ failCount: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        query: (text, params = []) => {
            if (capFault.failCount && /"emailVerified" = TRUE/.test(text)) {
                capFault.failCount = false;
                return Promise.reject(new Error('Injected cap count failure'));
            }
            return actual.query(text, params);
        },
    };
});

let app;
let counter = 0;
beforeAll(async () => { app = await initTestApp(); });
afterEach(() => {
    // Present-but-empty, never delete (dotenv resurrection — see helpers.js).
    process.env.SIGNUP_CAP = '';
    capFault.failCount = false;
});

const uniqueEmail = () => `cap-${++counter}@test.dev`;
const signUp = (email) => request(app)
    .post('/api/auth/sign-up/email')
    .send({ email, password: TEST_PASSWORD, name: 'cap', username: email.split('@')[0].replace(/-/g, '_') });

const verifiedCount = async () => {
    const { query } = await import('../../../server/db.js');
    const rows = await query('SELECT COUNT(*) AS count FROM "user" WHERE "emailVerified" = TRUE');
    return parseInt(rows[0].count, 10);
};

describe('signup cap enforcement', () => {
    it('allows signup while under the cap', async () => {
        process.env.SIGNUP_CAP = '500';
        const res = await signUp(uniqueEmail());
        expect(res.status).toBe(200);
    });

    it('blocks signup with SIGNUP_CAP_REACHED once verified accounts reach the cap', async () => {
        const email = uniqueEmail();
        expect((await signUp(email)).status).toBe(200);
        await markVerified(email);
        process.env.SIGNUP_CAP = String(await verifiedCount());
        const res = await signUp(uniqueEmail());
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SIGNUP_CAP_REACHED');
        expect(res.body.message).toMatch(/Signups are temporarily closed/);
    });

    it('does not count unverified accounts toward the cap', async () => {
        // This signup stays unverified — it must not consume a slot.
        expect((await signUp(uniqueEmail())).status).toBe(200);
        process.env.SIGNUP_CAP = String((await verifiedCount()) + 1);
        expect((await signUp(uniqueEmail())).status).toBe(200);
    });

    it('treats SIGNUP_CAP=0 as closed', async () => {
        process.env.SIGNUP_CAP = '0';
        const res = await signUp(uniqueEmail());
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SIGNUP_CAP_REACHED');
    });

    it('does not create a user row for a blocked signup', async () => {
        process.env.SIGNUP_CAP = '0';
        const email = uniqueEmail();
        await signUp(email);
        const { query } = await import('../../../server/db.js');
        const rows = await query('SELECT id FROM "user" WHERE email = $1', [email]);
        expect(rows).toHaveLength(0);
    });

    it('falls back to the default cap on garbage values', async () => {
        for (const bad of ['banana', '-5', '2.5']) {
            process.env.SIGNUP_CAP = bad;
            expect((await signUp(uniqueEmail())).status, `SIGNUP_CAP=${bad}`).toBe(200);
        }
    });

    it('fails open when the verified-count query errors', async () => {
        process.env.SIGNUP_CAP = '0';
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        capFault.failCount = true;
        try {
            const res = await signUp(uniqueEmail());
            expect(res.status).toBe(200);
            expect(errorSpy).toHaveBeenCalledWith('Signup cap check failed:', expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
    });
});
