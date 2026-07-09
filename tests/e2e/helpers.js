// Load .env exactly like the webServer (server/index.js) does, BEFORE
// server/db.js reads DATABASE_URL — otherwise the server could be on the
// .env's Postgres while this helper silently updates a fallback SQLite.
import 'dotenv/config';
import { expect } from '@playwright/test';
import { query, dbType } from '../../server/db.js';

// Single source of truth for the password used by every e2e spec. Compliant
// with shared/passwordPolicy.js (12+ chars, 3+ character classes).
export const TEST_PASSWORD = 'Password-1234!';

// server/auth.js sets `requireEmailVerification: true`, so every signup --
// through the UI or hitting /api/auth/sign-up/email directly -- lands
// unverified and grants no session (see tests/unit/server/emailVerification.test.js).
// Rather than scraping the emailed link out of the webServer's stdout/logs,
// mark the row verified directly in whichever DB the running dev server is
// actually using. This module imports server/db.js directly, which resolves
// the connection exactly the way the server process (spawned by
// playwright.config.cjs's webServer as `npm run dev`) does -- DATABASE_URL if
// set, else SQLITE_PATH / server/analytics.db -- so as long as both the
// Playwright test process and the webServer child process were launched from
// the same shell (true for a single `npx playwright test` invocation) they
// operate on the same rows. This uses the real driver (better-sqlite3 / pg,
// via server/db.js's `query`), not a `sqlite3` CLI shell-out.
export const verifyUserByEmail = async (email) => {
    // better-auth's `emailVerified` column is BOOLEAN on Postgres (a bare
    // integer errors there) but NUMERIC-affinity on SQLite, where 1/0 is the
    // norm -- see server/migrations/index.js and tests/unit/server/helpers.js's
    // markVerified, which only ever runs against the forced-SQLite unit DB.
    // e2e's dev server can be pointed at either backend (see .env's
    // DATABASE_URL), so pick the value per dbType rather than hardcoding one.
    const verified = dbType === 'postgres' ? true : 1;
    await query('UPDATE "user" SET "emailVerified" = $1 WHERE email = $2', [verified, email]);
};

// Signs up through the real /login UI form, then completes verification out
// of band (DB write above) and finishes by actually signing in through the
// same form -- email/password state survives the "Back" click and the
// sign-up/sign-in mode toggle, so this reuses what's already typed. This
// mirrors what a real user gets from clicking the emailed link
// (autoSignInAfterVerification), just without needing to parse that link.
export const signUpAndVerify = async (page, { name, username, email, password = TEST_PASSWORD }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await page.locator('label:text-is("Name") + input').fill(name);
    await page.locator('label:text-is("Username") + input').fill(username);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByText(/verify your email/i)).toBeVisible({ timeout: 15000 });

    await verifyUserByEmail(email);

    await page.getByRole('button', { name: 'Back' }).click();
    // exact: true -- "Sign in with Google" also matches a case-insensitive
    // substring search for "Sign In".
    await page.getByRole('button', { name: 'Sign In', exact: true }).click(); // toggle sign-up -> sign-in mode
    await page.getByRole('button', { name: 'Sign In', exact: true }).click(); // submit
    await page.waitForURL('**/app', { timeout: 15000 });
};

// Same idea for a signup done via a raw API call (no UI) -- e.g.
// username_identity.spec.js's "no username" session, which mimics what
// Google OAuth produces. Verifies via the DB, then signs in through the auth
// API so the request context's cookie jar ends up with a real session.
export const apiSignUpAndVerify = async (requestContext, apiBase, { email, password = TEST_PASSWORD, name, username }) => {
    const signUpBody = { email, password, name };
    if (username !== undefined) signUpBody.username = username;
    const signUpRes = await requestContext.post(`${apiBase}/api/auth/sign-up/email`, { data: signUpBody });
    if (!signUpRes.ok()) {
        throw new Error(`sign-up failed: ${signUpRes.status()} ${await signUpRes.text()}`);
    }

    await verifyUserByEmail(email);

    const signInRes = await requestContext.post(`${apiBase}/api/auth/sign-in/email`, { data: { email, password } });
    if (!signInRes.ok()) {
        throw new Error(`sign-in failed: ${signInRes.status()} ${await signInRes.text()}`);
    }
    return signUpRes;
};
