import path from 'path';
import os from 'os';
import request from 'supertest';

// Polyfill for Node 18 test workers. Vitest runs each test file in an isolated
// worker thread, which (unlike the main thread) does not expose global.crypto
// on Node 18 — the same reason server/index.js polyfills it before booting.
// Tests import server/app.js and server/migrations.js directly and never load
// server/index.js, so every test file needs this applied before better-auth
// (used transitively by createApp()) runs. Doing it once here, at the top of
// the shared helpers module, covers every later test file that imports it.
if (!globalThis.crypto) {
    const { webcrypto } = await import('node:crypto');
    globalThis.crypto = webcrypto;
}

export const initTestApp = async () => {
    if (!process.env.SQLITE_PATH) {
        process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-app-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    }
    delete process.env.DATABASE_URL;
    // Force test-safe values for every env var the server reads directly for origin/host
    // checks, regardless of whatever real .env file might already sit in the current working
    // directory (e.g. a developer's own local production-deploy config, which sets
    // TRUSTED_ORIGINS/CLIENT_URL to real deployed URLs, not localhost). server/auth.js imports
    // 'dotenv/config' at its top, which loads process.cwd()'s .env unconditionally - without
    // forcing these here, running the suite from a directory that happens to already have such
    // a .env makes origin-check tests fail for reasons that have nothing to do with the code
    // under test. This mirrors the SQLITE_PATH/DATABASE_URL isolation immediately above.
    process.env.TRUSTED_ORIGINS = 'http://localhost:3000,http://localhost:3001';
    process.env.CLIENT_URL = 'http://localhost:3000';
    delete process.env.ALLOWED_HOSTS;
    // better-auth caps /sign-up* at 3 requests per 10s (built-in special rule that
    // overrides the configured window/max); any test file that creates 4+ users in its
    // beforeAll would 429. server/auth.js reads this to skip rate limiting under test.
    process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
    const { runMigrations } = await import('../../../server/migrations.js');
    await runMigrations();
    const { createApp } = await import('../../../server/app.js');
    return createApp();
};

// Compliant with shared/passwordPolicy.js (12+ chars, 3+ classes). Exported so
// tests that sign in as a helper-created user use the same value.
export const TEST_PASSWORD = 'Password-1234!';

export const signUpUser = async (app, { email, username }) => {
    const res = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name: username, username });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
};

export const signUpUserNoUsername = async (app, { email, name }) => {
    const res = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
};

// Shared fixtures. IMPORTANT: keep these in this plain (non-`.test.js`) helper module,
// never export fixtures from a `*.test.js` file and import them into another `*.test.js`
// file — Vitest gives each test file its own isolated module graph, so importing a
// named export from another spec file re-evaluates that file's module top-to-bottom,
// silently re-registering (and re-running) its entire describe/it suite a second time
// under the importing file. Always add shared test fixtures here instead.
export const minimalState = (title = 'Root') => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title, data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 7
});

// Valid 1x1 transparent PNG data URL, used by every publish-related test.
export const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
