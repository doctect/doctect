import { describe, it, expect, afterEach } from 'vitest';
import { cloudApi, ApiError } from '../../services/cloudApi';

describe('cloudApi error handling', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('ApiError carries the code field from the response body', async () => {
        global.fetch = (async () => ({
            ok: false,
            status: 403,
            json: async () => ({ error: 'Set a public username before using cloud/gallery features.', code: 'USERNAME_REQUIRED' }),
        })) as any;

        try {
            await cloudApi.createProject({ name: 'X', state: {} as any });
            throw new Error('expected to throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).status).toBe(403);
            expect((e as ApiError).code).toBe('USERNAME_REQUIRED');
        }
    });

    it('ApiError.code is undefined when the server does not send one', async () => {
        global.fetch = (async () => ({
            ok: false,
            status: 400,
            json: async () => ({ error: 'name is required (max 100 chars)' }),
        })) as any;

        try {
            await cloudApi.createProject({ name: '', state: {} as any });
            throw new Error('expected to throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).code).toBeUndefined();
        }
    });
});
