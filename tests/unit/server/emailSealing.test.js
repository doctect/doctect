// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestApp } from './helpers.js';

// Regression: initTestApp once DELETED RESEND_API_KEY, but server/auth.js loads
// dotenv during initTestApp's dynamic imports — and dotenv re-populates any
// MISSING var from a developer's real .env. With a real key there, every
// signup across the server suite sent REAL Resend email. The guard must be
// present-but-empty, which dotenv never overrides.
describe('test-suite email sealing', () => {
    beforeAll(async () => { await initTestApp(); });

    it('keeps RESEND_API_KEY empty even after dotenv has loaded', () => {
        expect(process.env.RESEND_API_KEY ?? '').toBe('');
    });

    it('keeps DATABASE_URL empty even after dotenv has loaded', () => {
        expect(process.env.DATABASE_URL ?? '').toBe('');
    });
});
