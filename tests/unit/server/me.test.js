// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

const authFault = vi.hoisted(() => ({ failFreshUserLookup: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => {
                if (authFault.failFreshUserLookup && /SELECT id, email, username, role, banned/.test(text)) {
                    authFault.failFreshUserLookup = false;
                    throw new Error('Injected authority lookup failure');
                }
                return txQuery(text, params);
            }),
        ),
    };
});

let app;
beforeAll(async () => { app = await initTestApp(); });
beforeEach(() => { authFault.failFreshUserLookup = false; });

describe('GET /api/me', () => {
    it('returns null user when anonymous', async () => {
        const res = await request(app).get('/api/me');
        expect(res.status).toBe(200);
        expect(res.body.user).toBeNull();
    });
    it('returns the session user when authenticated', async () => {
        const cookie = await signUpUser(app, { email: 'me@test.dev', username: 'me_user' });
        const res = await request(app).get('/api/me').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('me_user');
        expect(res.body.user.email).toBe('me@test.dev');
        // The account's real `name` field is never intended to be public and no client
        // code reads it off this endpoint — it must not leak into the API response.
        expect(res.body.user.name).toBeUndefined();
    });

    it('returns 500 when fresh authority lookup fails', async () => {
        const cookie = await signUpUser(app, { email: 'me-fault@test.dev', username: 'me_fault' });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        authFault.failFreshUserLookup = true;

        try {
            const res = await request(app).get('/api/me').set('Cookie', cookie);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Internal Server Error' });
            expect(errorSpy).toHaveBeenCalledWith('Auth Error:', expect.objectContaining({
                message: 'Injected authority lookup failure',
            }));
        } finally {
            errorSpy.mockRestore();
        }
    });
});
