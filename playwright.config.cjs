const { defineConfig, devices } = require('@playwright/test');

const webPort = Number(process.env.E2E_WEB_PORT || 3000);
const apiPort = Number(process.env.E2E_API_PORT || 3001);
if (!Number.isInteger(webPort) || webPort <= 0 || !Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error('E2E_WEB_PORT and E2E_API_PORT must be positive integers');
}
const webOrigin = `http://localhost:${webPort}`;
const apiOrigin = `http://localhost:${apiPort}`;
const builtBundle = process.env.E2E_BUILT_BUNDLE === '1';
process.env.E2E_API_BASE = apiOrigin;

const e2eOwnerEmail = process.env.E2E_OWNER_EMAIL || `owner-${Date.now()}-${process.pid}@test.dev`;
process.env.E2E_OWNER_EMAIL = e2eOwnerEmail;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
    testDir: './tests/e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Shared dev server and SQLite state make cross-file browser concurrency nondeterministic. */
    workers: 1,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: webOrigin,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
        viewport: { width: 1280, height: 720 },
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                ...(builtBundle ? { launchOptions: { args: ['--unlimited-storage'] } } : {}),
            },
        },

        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },

        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        {
            name: 'workspace-large-chromium',
            testMatch: /local_workspace_migration\.spec\.js/,
            grep: /aggregate legacy JSON above 5 MiB/,
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: { args: ['--unlimited-storage'] },
            },
        },
        {
            name: 'workspace-large-firefox',
            testMatch: /local_workspace_migration\.spec\.js/,
            grep: /aggregate legacy JSON above 5 MiB/,
            use: {
                ...devices['Desktop Firefox'],
                launchOptions: { firefoxUserPrefs: { 'dom.storage.default_quota': 20480 } },
            },
        },
    ],

    /* Run your local dev server before starting the tests.
     *
     * RESEND_API_KEY is force-emptied: the dev server loads .env, and a real
     * key there once made every e2e signup send a REAL email (each full run
     * burns 10-15 sends of Resend quota on @test.dev addresses). Empty means
     * server/email.js uses its console fallback — same fail-safe as the unit
     * suite. reuseExistingServer remains OFF: reusing an already-running dev
     * server would bypass this env and use whatever key that server loaded.
     * Alternate E2E_WEB_PORT / E2E_API_PORT values avoid disturbing existing
     * 3000 / 3001 processes while preserving explicit server ownership.
     */
    webServer: {
        command: builtBundle
            ? `npm run build && npx concurrently --kill-others-on-fail "vite preview --host 127.0.0.1 --port ${webPort} --strictPort" "node server/index.js"`
            : `npx concurrently --kill-others-on-fail "vite --host 127.0.0.1 --port ${webPort} --strictPort" "node server/index.js"`,
        url: webOrigin,
        reuseExistingServer: false,
        env: {
            ...process.env,
            PORT: String(apiPort),
            RESEND_API_KEY: '',
            SIGNUP_CAP: '',
            OWNER_EMAILS: e2eOwnerEmail,
            CLIENT_URL: webOrigin,
            BETTER_AUTH_URL: `${apiOrigin}/api/auth`,
            TRUSTED_ORIGINS: `${webOrigin},${apiOrigin}`,
            VITE_API_URL: `${apiOrigin}/api/auth`,
            VITE_API_BASE: apiOrigin,
        },
    },
});
