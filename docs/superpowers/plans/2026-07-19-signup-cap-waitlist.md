# Signup Cap and Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap accounts at a configurable limit (default 500 verified accounts); once reached, refuse every account-creation path and offer a waitlist email form instead, with an admin listing of collected emails.

**Architecture:** Enforcement lives in a better-auth `databaseHooks.user.create.before` hook — the single choke point both email signup and first-time Google sign-in pass through. A shared message module lets the client recognize the OAuth-path rejection (better-auth forwards the thrown APIError's message as a redirect `?error=` param with spaces turned to underscores — verified against the vendored better-auth 1.4.10 source, `dist/api/routes/callback.mjs` `redirectOnError` + `dist/oauth2/link-account.mjs`). A new `waitlist` table stores emails; public `GET /api/signup-status` drives the login page UI.

**Tech Stack:** Express 5 (async route rejections auto-forward to the error handler — no try/catch wrappers needed), better-auth 1.4.10, better-sqlite3/Postgres via `server/db.js` `query()`, Vitest + supertest (server), Vitest + @testing-library/react (client).

**Spec:** `docs/superpowers/specs/2026-07-19-signup-cap-waitlist-design.md`

## Global Constraints

- SQL always uses `$1..$n` placeholders, each number exactly once, via `query()` from `server/db.js` — it runs identically on Postgres and SQLite.
- No new server route files: public endpoints go in `server/routes/me.js`, the admin endpoint in `server/routes/adminModeration.js`.
- Never `delete` an env var in tests or config — set it to `''` (present-but-empty); dotenv re-populates *missing* vars from a developer's real `.env`.
- Never edit an applied migration — append `015_waitlist` after `014_platform_audit_actions`.
- Cap counts **verified** accounts only: `"emailVerified" = TRUE` (works on both databases; SQLite treats `TRUE` as `1`).
- Cap check failures **fail open** (signup allowed, error logged).
- Error code strings: `SIGNUP_CAP_REACHED` (403, from auth), `SIGNUPS_OPEN` (409, from waitlist POST).
- Run unit tests with `npx vitest run <file>` (the `test` script is watch mode); full suite `npx vitest run tests/unit`.
- Commit messages: conventional-commit style matching recent history (`feat:`, `test:`, `docs:`).

---

### Task 1: Cap module, shared message, auth hook, env plumbing

**Files:**
- Create: `server/signupCap.js`
- Create: `shared/signupCapMessages.js`
- Modify: `server/auth.js` (imports at top; `databaseHooks.user.create`, currently lines 96–108)
- Modify: `tests/unit/server/helpers.js` (after the `RESEND_API_KEY` assignment, line 51)
- Modify: `playwright.config.cjs` (webServer `env` block, after `RESEND_API_KEY: '',` line 76)
- Modify: `.env.example` (append), `deploy.sh` (env normalization ~line 83, `--set-env-vars` block lines 135–140)
- Modify: `tests/unit/server/deployScript.test.js` (runDeploy env + one assertion)
- Test: `tests/unit/server/signupCap.test.js`

**Interfaces:**
- Consumes: `query()` from `server/db.js`; `APIError` already imported in `server/auth.js`.
- Produces: `getSignupCap(): number` and `isSignupOpen(): Promise<boolean>` (both exported from `server/signupCap.js`); `SIGNUP_CAP_MESSAGE: string` and `isSignupCapOAuthError(errorParam: string | null): boolean` (exported from `shared/signupCapMessages.js`); HTTP behavior: any account-creating auth call returns 403 with body `{ message: SIGNUP_CAP_MESSAGE, code: 'SIGNUP_CAP_REACHED' }` when the cap is reached. Tasks 2, 4, and 6 depend on these exact names.

- [ ] **Step 1: Seal SIGNUP_CAP in the test and e2e harnesses**

In `tests/unit/server/helpers.js`, immediately after the `process.env.RESEND_API_KEY = '';` line (line 51), add:

```js
    // A developer's .env may set SIGNUP_CAP (e.g. 0 to rehearse the closed
    // state); unit tests create accounts constantly and must never hit the cap.
    // Present-but-empty = default cap, never delete (dotenv resurrection).
    process.env.SIGNUP_CAP = '';
```

In `playwright.config.cjs`, in the webServer `env` block after `RESEND_API_KEY: '',`, add:

```js
            SIGNUP_CAP: '',
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/server/signupCap.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/signupCap.test.js`
Expected: FAIL — the cap tests ("blocks signup", "SIGNUP_CAP=0", "no user row", "fails open") fail because signups currently succeed regardless of `SIGNUP_CAP`.

- [ ] **Step 4: Implement the cap module and shared message**

Create `server/signupCap.js`:

```js
import { query } from './db.js';

const DEFAULT_CAP = 500;

// Read per call, not at import: dotenv loads during server import, and tests
// flip SIGNUP_CAP between requests.
export const getSignupCap = () => {
    const raw = process.env.SIGNUP_CAP;
    if (raw === undefined || raw === '') return DEFAULT_CAP;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_CAP;
    return parsed;
};

// Verified accounts only (spec): unverified rows never consume slots, accepting
// that under-cap signups may verify later and overshoot the cap.
export const isSignupOpen = async () => {
    const rows = await query('SELECT COUNT(*) AS count FROM "user" WHERE "emailVerified" = TRUE');
    return parseInt(rows[0].count, 10) < getSignupCap();
};
```

Create `shared/signupCapMessages.js`:

```js
// Single source for the signup-cap refusal copy. The server throws it as an
// APIError message; better-auth's OAuth callback forwards that message to the
// client as a redirect ?error= param with spaces turned into underscores
// (dist/api/routes/callback.mjs redirectOnError + dist/oauth2/link-account.mjs,
// verified against better-auth 1.4.10), so the client matches on the stable
// prefix rather than the full transformed string.
export const SIGNUP_CAP_MESSAGE = 'Signups are temporarily closed — the free account limit has been reached. You can join the waitlist or keep using the app without an account.';

export const isSignupCapOAuthError = (errorParam) =>
    typeof errorParam === 'string' && errorParam.startsWith('Signups_are_temporarily_closed');
```

- [ ] **Step 5: Wire the hook into `server/auth.js`**

Add imports at the top, next to the existing local imports:

```js
import { isSignupOpen } from "./signupCap.js";
import { SIGNUP_CAP_MESSAGE } from "../shared/signupCapMessages.js";
```

Replace the existing `databaseHooks` block (lines 96–108) with:

```js
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        let open = true;
                        try {
                            open = await isSignupOpen();
                        } catch (error) {
                            // Fail open: a broken counter must not lock signups entirely.
                            console.error('Signup cap check failed:', error);
                        }
                        if (!open) {
                            throw new APIError("FORBIDDEN", { message: SIGNUP_CAP_MESSAGE, code: "SIGNUP_CAP_REACHED" });
                        }
                        return { data: user };
                    },
                    after: async (user) => {
                        try {
                            await reconcileOwnerAuthority({ userId: user.id });
                        } catch (error) {
                            console.error('Owner signup reconciliation failed:', error);
                        }
                    }
                }
            }
        },
```

(The `after` hook is unchanged — only `before` is new.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/signupCap.test.js`
Expected: PASS (7 tests).

- [ ] **Step 7: Deploy/env plumbing, test-first**

In `tests/unit/server/deployScript.test.js`: add `SIGNUP_CAP: '7',` to the `runDeploy` env object (after `EMAIL_FROM: '',` line 74), and add this assertion to the `'skips repository creation and env removal when preflights report them present and absent'` test, after the existing `result.calls` assertions:

```js
        expect(result.calls).toContain('SIGNUP_CAP=7');
```

Run: `npx vitest run tests/unit/server/deployScript.test.js`
Expected: FAIL on the new assertion (deploy.sh doesn't pass SIGNUP_CAP yet).

Then in `deploy.sh`: after the `EMAIL_FROM="${EMAIL_FROM:-}"` normalization line (line 84), add:

```bash
SIGNUP_CAP="${SIGNUP_CAP:-}"
```

And in the `gcloud run deploy` invocation, after the `--set-env-vars "EMAIL_FROM=$EMAIL_FROM"` line (line 140 — add a trailing `\` to it), add:

```bash
  --set-env-vars "SIGNUP_CAP=$SIGNUP_CAP"
```

Append to `.env.example`:

```bash
# Verified-account cap: signups close once this many verified accounts exist.
# Empty/unset = 500. 0 = signups closed immediately.
SIGNUP_CAP=
```

Run: `npx vitest run tests/unit/server/deployScript.test.js`
Expected: PASS.

- [ ] **Step 8: Full server suite, then commit**

Run: `npx vitest run tests/unit/server`
Expected: all green (existing suites unaffected — helpers now pin `SIGNUP_CAP=''` = default cap 500, far above any test's account count).

```bash
git add server/signupCap.js shared/signupCapMessages.js server/auth.js tests/unit/server/signupCap.test.js tests/unit/server/helpers.js tests/unit/server/deployScript.test.js playwright.config.cjs deploy.sh .env.example
git commit -m "feat: enforce verified-account signup cap"
```

---

### Task 2: Waitlist migration + public endpoints

**Files:**
- Modify: `server/migrations/index.js` (append entry after `014_platform_audit_actions`)
- Modify: `server/routes/me.js`
- Test: `tests/unit/server/waitlist.test.js`

**Interfaces:**
- Consumes: `isSignupOpen()` from `server/signupCap.js` (Task 1); `query` already imported in `me.js`.
- Produces: `GET /api/signup-status` → `200 { open: boolean }`; `POST /api/waitlist` body `{ email }` → `200 { ok: true }` | `400 { error }` | `409 { error, code: 'SIGNUPS_OPEN' }`; table `waitlist(id TEXT PK, email TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP NOT NULL)`. Tasks 3 and 4 depend on these exact shapes.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/waitlist.test.js`:

```js
// @vitest-environment node
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initTestApp } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });
afterEach(() => { process.env.SIGNUP_CAP = ''; });

describe('GET /api/signup-status', () => {
    it('reports open while under the cap', async () => {
        const res = await request(app).get('/api/signup-status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ open: true });
    });

    it('reports closed once the cap is reached', async () => {
        process.env.SIGNUP_CAP = '0';
        const res = await request(app).get('/api/signup-status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ open: false });
    });
});

describe('POST /api/waitlist', () => {
    it('rejects with SIGNUPS_OPEN while signups are open', async () => {
        const res = await request(app).post('/api/waitlist').send({ email: 'open@test.dev' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SIGNUPS_OPEN');
    });

    it('stores a valid email lowercased while closed', async () => {
        process.env.SIGNUP_CAP = '0';
        const res = await request(app).post('/api/waitlist').send({ email: '  Waiting@Test.DEV ' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        const { query } = await import('../../../server/db.js');
        const rows = await query('SELECT email FROM waitlist WHERE email = $1', ['waiting@test.dev']);
        expect(rows).toHaveLength(1);
    });

    it('treats a duplicate email as success without a second row', async () => {
        process.env.SIGNUP_CAP = '0';
        await request(app).post('/api/waitlist').send({ email: 'twice@test.dev' });
        const res = await request(app).post('/api/waitlist').send({ email: 'twice@test.dev' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        const { query } = await import('../../../server/db.js');
        const rows = await query('SELECT id FROM waitlist WHERE email = $1', ['twice@test.dev']);
        expect(rows).toHaveLength(1);
    });

    it('rejects malformed emails', async () => {
        process.env.SIGNUP_CAP = '0';
        for (const bad of ['not-an-email', 'a@b', 'a b@test.dev', '', 42, null, undefined]) {
            const res = await request(app).post('/api/waitlist').send({ email: bad });
            expect(res.status, `email: ${String(bad)}`).toBe(400);
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/waitlist.test.js`
Expected: FAIL — `/api/signup-status` and `/api/waitlist` return 404 (routes don't exist).

- [ ] **Step 3: Append the migration**

In `server/migrations/index.js`, after the closing brace of the `014_platform_audit_actions` entry (keep it inside the `migrations` array), add:

```js
    {
        id: '015_waitlist',
        pg: `
            CREATE TABLE IF NOT EXISTS waitlist (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                "createdAt" TIMESTAMP NOT NULL
            )
        `
        // sqlite: same DDL works on better-sqlite3 (TIMESTAMP degrades to TEXT affinity)
    },
```

- [ ] **Step 4: Implement the endpoints**

In `server/routes/me.js`, extend the imports:

```js
import { randomUUID } from 'crypto';
import { isSignupOpen } from '../signupCap.js';
```

Add before `export default router;`:

```js
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/api/signup-status', async (req, res) => {
    let open = true;
    try {
        open = await isSignupOpen();
    } catch (error) {
        // Same fail-open stance as the signup hook: a broken counter reads as open.
        console.error('Signup status check failed:', error);
    }
    // Deliberately exposes only the boolean — never the count or the cap value.
    res.json({ open });
});

router.post('/api/waitlist', async (req, res) => {
    if (await isSignupOpen()) {
        // Signups open: refuse, so the table can't become a general email collector.
        return res.status(409).json({ error: 'Signups are open — you can create an account right now.', code: 'SIGNUPS_OPEN' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    // ON CONFLICT DO NOTHING: duplicate joins are idempotent success and don't
    // reveal whether an address was already on the list. Same syntax on both DBs.
    await query(
        'INSERT INTO waitlist (id, email, "createdAt") VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
        [randomUUID(), email, new Date().toISOString()]
    );
    res.json({ ok: true });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/waitlist.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Run migrations + me suites, then commit**

Run: `npx vitest run tests/unit/server/migrations.test.js tests/unit/server/me.test.js`
Expected: PASS.

```bash
git add server/migrations/index.js server/routes/me.js tests/unit/server/waitlist.test.js
git commit -m "feat: waitlist table, signup-status and waitlist endpoints"
```

---

### Task 3: Admin waitlist endpoint

**Files:**
- Modify: `server/routes/adminModeration.js`
- Test: `tests/unit/server/adminWaitlist.test.js`

**Interfaces:**
- Consumes: `waitlist` table (Task 2); `requireAdmin`, `query`, `asIso` already present in `adminModeration.js`.
- Produces: `GET /api/admin/waitlist` → `200 { count: number, entries: [{ email, createdAt }] }` newest first; `401` anonymous, `403` non-admin. Task 5 depends on this shape.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/adminWaitlist.test.js`:

```js
// @vitest-environment node
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });
afterEach(() => { process.env.SIGNUP_CAP = ''; });

const joinWaitlist = async (email) => {
    process.env.SIGNUP_CAP = '0';
    const res = await request(app).post('/api/waitlist').send({ email });
    expect(res.status).toBe(200);
    process.env.SIGNUP_CAP = '';
};

describe('GET /api/admin/waitlist', () => {
    it('requires an admin', async () => {
        const anon = await request(app).get('/api/admin/waitlist');
        expect(anon.status).toBe(401);
        const cookie = await signUpUser(app, { email: 'plain@test.dev', username: 'plain_user' });
        const user = await request(app).get('/api/admin/waitlist').set('Cookie', cookie);
        expect(user.status).toBe(403);
    });

    it('returns entries newest first with a count', async () => {
        // Email prefixes chosen so the email DESC tiebreak agrees with insertion
        // order even when both rows land in the same millisecond.
        await joinWaitlist('a-first@test.dev');
        await joinWaitlist('b-second@test.dev');
        const cookie = await signUpUser(app, { email: 'wl-admin@test.dev', username: 'wl_admin' });
        const { query } = await import('../../../server/db.js');
        await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['wl-admin@test.dev']);
        const res = await request(app).get('/api/admin/waitlist').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
        expect(res.body.entries.map(e => e.email)).toEqual(['b-second@test.dev', 'a-first@test.dev']);
        expect(typeof res.body.entries[0].createdAt).toBe('string');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/adminWaitlist.test.js`
Expected: FAIL — `/api/admin/waitlist` returns 404.

- [ ] **Step 3: Implement the endpoint**

In `server/routes/adminModeration.js`, after the existing `/api/admin/users/:id` GET route, add:

```js
router.get('/api/admin/waitlist', requireAdmin, async (req, res) => {
    const rows = await query('SELECT email, "createdAt" FROM waitlist ORDER BY "createdAt" DESC, email DESC');
    res.json({
        count: rows.length,
        entries: rows.map(row => ({ email: row.email, createdAt: asIso(row.createdAt) })),
    });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/adminWaitlist.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/routes/adminModeration.js tests/unit/server/adminWaitlist.test.js
git commit -m "feat: admin waitlist listing endpoint"
```

---

### Task 4: cloudApi methods + LoginPage waitlist panel

**Files:**
- Modify: `services/cloudApi.ts` (add three methods to the `cloudApi` object)
- Modify: `pages/LoginPage.tsx`
- Test: `tests/unit/loginWaitlist.test.tsx`

**Interfaces:**
- Consumes: `GET /api/signup-status`, `POST /api/waitlist` (Task 2); `GET /api/admin/waitlist` (Task 3); the `api<T>` helper and `cloudApi` object in `services/cloudApi.ts`.
- Produces: `cloudApi.getSignupStatus(): Promise<{ open: boolean }>`, `cloudApi.joinWaitlist(email: string): Promise<{ ok: true }>`, `cloudApi.getAdminWaitlist(): Promise<{ count: number; entries: { email: string; createdAt: string }[] }>`. Tasks 5 and 6 depend on these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/loginWaitlist.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

const mocks = vi.hoisted(() => ({
    getSignupStatus: vi.fn(),
    joinWaitlist: vi.fn(),
    signUpEmail: vi.fn(),
    signInSocial: vi.fn(),
}));

vi.mock('../../lib/auth-client', () => ({
    signIn: { email: vi.fn(), social: mocks.signInSocial },
    signUp: { email: mocks.signUpEmail },
    authClient: { sendVerificationEmail: vi.fn() },
    useSession: () => ({ data: null, isPending: false }),
}));

vi.mock('../../services/cloudApi', async importOriginal => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        cloudApi: { ...actual.cloudApi, getSignupStatus: mocks.getSignupStatus, joinWaitlist: mocks.joinWaitlist },
    };
});

const renderLogin = (entry: string = '/login') => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/login" element={<LoginPage />} /></Routes>
    </MemoryRouter>
);

const openSignUpView = () => fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

describe('LoginPage waitlist behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.joinWaitlist.mockResolvedValue({ ok: true });
    });

    it('replaces the signup form with the waitlist panel when signups are closed', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        renderLogin();
        openSignUpView();
        expect(await screen.findByText(/Free accounts are full/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
        expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument();
    });

    it('joins the waitlist and confirms', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        renderLogin();
        openSignUpView();
        await screen.findByText(/Free accounts are full/);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'waitfan@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
        expect(await screen.findByText(/You're on the list/)).toBeInTheDocument();
        expect(mocks.joinWaitlist).toHaveBeenCalledWith('waitfan@test.dev');
    });

    it('surfaces a join failure', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        mocks.joinWaitlist.mockRejectedValue(new Error('Enter a valid email address.'));
        renderLogin();
        openSignUpView();
        await screen.findByText(/Free accounts are full/);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
        expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    });

    it('leaves the Sign In view untouched when signups are closed', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        renderLogin();
        await waitFor(() => expect(mocks.getSignupStatus).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
        expect(screen.queryByText(/Free accounts are full/)).not.toBeInTheDocument();
    });

    it('falls back to the signup form when the status fetch fails', async () => {
        mocks.getSignupStatus.mockRejectedValue(new Error('network down'));
        renderLogin();
        openSignUpView();
        expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    });

    it('switches to the waitlist panel when signup submit hits the cap', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: true });
        mocks.signUpEmail.mockImplementation((_creds: any, handlers: any) => {
            handlers.onError({ error: { code: 'SIGNUP_CAP_REACHED', message: 'Signups are temporarily closed' } });
            return Promise.resolve();
        });
        renderLogin();
        openSignUpView();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Late Arrival' } });
        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'late_arrival' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'late@test.dev' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
        expect(await screen.findByText(/Free accounts are full/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/loginWaitlist.test.tsx`
Expected: FAIL — `getSignupStatus` doesn't exist on `cloudApi`, and no waitlist panel renders.

- [ ] **Step 3: Add the cloudApi methods**

In `services/cloudApi.ts`, inside the `cloudApi` object, after the `me:` method, add:

```ts
    getSignupStatus: () => api<{ open: boolean }>('/api/signup-status'),
    joinWaitlist: (email: string) =>
        api<{ ok: true }>('/api/waitlist', { method: 'POST', body: JSON.stringify({ email }) }),
    getAdminWaitlist: () =>
        api<{ count: number; entries: { email: string; createdAt: string }[] }>('/api/admin/waitlist'),
```

- [ ] **Step 4: Implement the LoginPage waitlist panel**

In `pages/LoginPage.tsx`:

Add the import:

```tsx
import { cloudApi } from '../services/cloudApi';
```

Add state after the existing `useState` declarations (after `resendError`):

```tsx
    const [signupOpen, setSignupOpen] = useState(true);
    const [waitlistEmail, setWaitlistEmail] = useState('');
    const [waitlistJoined, setWaitlistJoined] = useState(false);
    const [waitlistError, setWaitlistError] = useState<string | null>(null);
    const [waitlistBusy, setWaitlistBusy] = useState(false);
```

Add an effect after the existing `verifiedBanner` effect:

```tsx
    useEffect(() => {
        let cancelled = false;
        cloudApi.getSignupStatus()
            .then(({ open }) => { if (!cancelled) setSignupOpen(open); })
            .catch(() => { /* Fail toward the normal form; the server still enforces the cap. */ });
        return () => { cancelled = true; };
    }, []);
```

Add helpers above `handleSubmit`:

```tsx
    const isCapError = (error: any): boolean => error?.code === 'SIGNUP_CAP_REACHED';

    const handleJoinWaitlist = async (e: React.FormEvent) => {
        e.preventDefault();
        setWaitlistBusy(true);
        setWaitlistError(null);
        try {
            await cloudApi.joinWaitlist(waitlistEmail.trim());
            setWaitlistJoined(true);
        } catch (err: any) {
            setWaitlistError(err.message || 'Something went wrong — try again.');
        } finally {
            setWaitlistBusy(false);
        }
    };
```

In `handleSubmit`'s signup branch, route the cap error to the panel — the `onError` callback becomes:

```tsx
                    onError: (ctx) => {
                        if (isCapError(ctx.error)) {
                            setSignupOpen(false);
                        } else {
                            setError(ctx.error.message);
                        }
                    }
```

and the `result?.error` check below it becomes:

```tsx
                if (result?.error) {
                    if (isCapError(result.error)) {
                        setSignupOpen(false);
                    } else {
                        setError(result.error.message);
                    }
                } else if (result?.data) {
                    setVerifyEmailFor(email);
                }
```

Update the heading so the closed state is labeled:

```tsx
                    {verifyEmailFor ? 'Verify your email' : (isLogin ? 'Sign In' : (signupOpen ? 'Create Account' : 'Join the waitlist'))}
```

Change the main render branch from `verifyEmailFor ? (...) : (<form ...>)` to a three-way branch — after the `verifyEmailFor ? (...)` block, replace `) : (` + `<form onSubmit={handleSubmit} ...>` so the structure is:

```tsx
                {verifyEmailFor ? (
                    /* existing verify block, unchanged */
                ) : (!isLogin && !signupOpen) ? (
                    <div className="space-y-4">
                        <p className="text-slate-600 text-sm">
                            Free accounts are full — we cap accounts at launch. Leave your email and
                            we'll let you know when spots open. You can keep using the editor and
                            gallery without an account.
                        </p>
                        {waitlistJoined ? (
                            <p className="text-sm text-green-600">You're on the list — we'll be in touch.</p>
                        ) : (
                            <form onSubmit={handleJoinWaitlist} className="space-y-3">
                                <div>
                                    <label htmlFor="waitlist-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        id="waitlist-email"
                                        type="email"
                                        value={waitlistEmail}
                                        onChange={(e) => setWaitlistEmail(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                                {waitlistError && <p className="text-sm text-red-600">{waitlistError}</p>}
                                <button
                                    type="submit"
                                    disabled={waitlistBusy}
                                    className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {waitlistBusy && <Loader2 size={16} className="animate-spin" />}
                                    Join the waitlist
                                </button>
                            </form>
                        )}
                    </div>
                ) : (
                    /* existing sign-in/sign-up <form>, unchanged */
                )}
```

The "Don't have an account? / Already have an account?" toggle at the bottom stays as is — switching to Sign Up while closed lands on the waitlist panel.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/loginWaitlist.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the other LoginPage suites, then commit**

Run: `npx vitest run tests/unit/loginRedirect.test.tsx tests/unit/loginPasswordPolicy.test.tsx tests/unit/loginEmailVerification.test.tsx`
Expected: PASS — the signup form's open-state behavior is unchanged.

```bash
git add services/cloudApi.ts pages/LoginPage.tsx tests/unit/loginWaitlist.test.tsx
git commit -m "feat: login waitlist panel when signup cap reached"
```

---

### Task 5: Admin dashboard waitlist section

**Files:**
- Create: `components/AdminWaitlistSection.tsx`
- Modify: `pages/AdminModerationPage.tsx`
- Test: `tests/unit/adminWaitlistSection.test.tsx`

**Interfaces:**
- Consumes: `cloudApi.getAdminWaitlist()` (Task 4).
- Produces: `AdminWaitlistSection` React component (named export, no props), rendered on the admin moderation page.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/adminWaitlistSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminWaitlistSection } from '../../components/AdminWaitlistSection';

const mocks = vi.hoisted(() => ({ getAdminWaitlist: vi.fn() }));

vi.mock('../../services/cloudApi', async importOriginal => {
    const actual: any = await importOriginal();
    return { ...actual, cloudApi: { ...actual.cloudApi, getAdminWaitlist: mocks.getAdminWaitlist } };
});

describe('AdminWaitlistSection', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists waitlist entries with a count', async () => {
        mocks.getAdminWaitlist.mockResolvedValue({
            count: 2,
            entries: [
                { email: 'b@test.dev', createdAt: '2026-07-19T10:00:00.000Z' },
                { email: 'a@test.dev', createdAt: '2026-07-18T10:00:00.000Z' },
            ],
        });
        render(<AdminWaitlistSection />);
        expect(await screen.findByText('Waitlist (2)')).toBeInTheDocument();
        expect(screen.getByText('b@test.dev')).toBeInTheDocument();
        expect(screen.getByText('a@test.dev')).toBeInTheDocument();
    });

    it('shows an empty state', async () => {
        mocks.getAdminWaitlist.mockResolvedValue({ count: 0, entries: [] });
        render(<AdminWaitlistSection />);
        expect(await screen.findByText('No one is waiting.')).toBeInTheDocument();
    });

    it('surfaces a load failure', async () => {
        mocks.getAdminWaitlist.mockRejectedValue(new Error('Forbidden: Admins only'));
        render(<AdminWaitlistSection />);
        expect(await screen.findByText('Forbidden: Admins only')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/adminWaitlistSection.test.tsx`
Expected: FAIL — the component module doesn't exist.

- [ ] **Step 3: Implement the component and mount it**

Create `components/AdminWaitlistSection.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { cloudApi } from '../services/cloudApi';

export function AdminWaitlistSection() {
    const [count, setCount] = useState<number | null>(null);
    const [entries, setEntries] = useState<{ email: string; createdAt: string }[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        cloudApi.getAdminWaitlist()
            .then(({ count, entries }) => {
                if (!cancelled) { setCount(count); setEntries(entries); }
            })
            .catch(err => { if (!cancelled) setError(err.message || 'Failed to load waitlist'); });
        return () => { cancelled = true; };
    }, []);

    return (
        <section className="mt-8">
            {error ? (
                <p className="text-sm text-red-600">{error}</p>
            ) : count === null ? (
                <p className="text-sm text-slate-500">Loading waitlist…</p>
            ) : (
                <>
                    <h2 className="text-lg font-semibold mb-2">Waitlist ({count})</h2>
                    {count === 0 ? (
                        <p className="text-sm text-slate-500">No one is waiting.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="text-left py-1 font-medium text-slate-600">Email</th>
                                    <th className="text-left py-1 font-medium text-slate-600">Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => (
                                    <tr key={entry.email} className="border-t">
                                        <td className="py-1">{entry.email}</td>
                                        <td className="py-1">{new Date(entry.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </section>
    );
}
```

In `pages/AdminModerationPage.tsx`, add the import at the top with the other component imports:

```tsx
import { AdminWaitlistSection } from '../components/AdminWaitlistSection';
```

Mount it after the user-detail section and before the confirmation dialog — locate this passage near the end of the file:

```tsx
                    )}

                    {confirming && hasCurrentAuthority(confirming) && (
```

and insert between them:

```tsx
                    <AdminWaitlistSection />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/adminWaitlistSection.test.tsx tests/unit/adminModerationRouting.test.tsx`
Expected: PASS (new component tests plus the existing page routing suite).

- [ ] **Step 5: Commit**

```bash
git add components/AdminWaitlistSection.tsx pages/AdminModerationPage.tsx tests/unit/adminWaitlistSection.test.tsx
git commit -m "feat: admin dashboard waitlist section"
```

---

### Task 6: Google signup rejection lands on the waitlist panel

**Files:**
- Modify: `pages/LoginPage.tsx`
- Test: `tests/unit/loginWaitlist.test.tsx` (extend)

**Interfaces:**
- Consumes: `isSignupCapOAuthError` from `shared/signupCapMessages.js` (Task 1); the waitlist panel state (`signupOpen`, `isLogin`) from Task 4.
- Produces: `signIn.social` is called with `errorCallbackURL: window.location.origin + '/login'`; landing on `/login?error=Signups_are_temporarily_closed...` shows the waitlist panel.

Background (verified against the vendored better-auth 1.4.10 source, no spike needed): when the `user.create.before` databaseHook throws an `APIError` during the OAuth callback, `dist/oauth2/link-account.mjs` catches it and returns `{ error: e.message }`; `dist/api/routes/callback.mjs` `redirectOnError` then redirects to the client-supplied `errorCallbackURL` (from `parseState`) with `?error=<message with spaces replaced by underscores>`. Returning Google users never reach the hook, so their sign-in is unaffected.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/loginWaitlist.test.tsx`, inside the existing `describe('LoginPage waitlist behavior', ...)` block:

```tsx
    it('shows the waitlist panel when Google signup was rejected by the cap', async () => {
        // Status fetch says open (fail-open) — the explicit OAuth rejection must still win.
        mocks.getSignupStatus.mockResolvedValue({ open: true });
        renderLogin('/login?error=Signups_are_temporarily_closed_%E2%80%94_the_free_account_limit_has_been_reached.');
        expect(await screen.findByText(/Free accounts are full/)).toBeInTheDocument();
    });

    it('does not open the waitlist panel for unrelated OAuth errors', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: true });
        renderLogin('/login?error=invalid_code');
        await waitFor(() => expect(mocks.getSignupStatus).toHaveBeenCalled());
        expect(screen.queryByText(/Free accounts are full/)).not.toBeInTheDocument();
    });

    it('passes an errorCallbackURL pointing at /login to Google sign-in', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: true });
        renderLogin();
        fireEvent.click(screen.getByText('Sign in with Google'));
        await waitFor(() => expect(mocks.signInSocial).toHaveBeenCalledWith(expect.objectContaining({
            errorCallbackURL: expect.stringContaining('/login'),
        })));
    });
```

And add a small matcher describe at the bottom of the same file:

```tsx
describe('isSignupCapOAuthError', () => {
    it('matches only the signup-cap error slug', async () => {
        const { isSignupCapOAuthError } = await import('../../shared/signupCapMessages.js');
        expect(isSignupCapOAuthError('Signups_are_temporarily_closed_—_the_free_account_limit_has_been_reached.')).toBe(true);
        expect(isSignupCapOAuthError('Signups_are_temporarily_closed')).toBe(true);
        expect(isSignupCapOAuthError('invalid_code')).toBe(false);
        expect(isSignupCapOAuthError(null)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/unit/loginWaitlist.test.tsx`
Expected: FAIL — the two panel tests and the errorCallbackURL test fail (matcher test passes; the module shipped in Task 1).

- [ ] **Step 3: Implement**

In `pages/LoginPage.tsx`:

Add the import:

```tsx
import { isSignupCapOAuthError } from '../shared/signupCapMessages.js';
```

Derive the rejection flag next to the existing `verifiedBanner` derivation:

```tsx
    const oauthCapRejected = isSignupCapOAuthError(new URLSearchParams(location.search).get('error'));
```

Add an effect after the signup-status effect from Task 4, and guard that effect's setter so a fail-open status can't override the explicit rejection. The two effects become:

```tsx
    useEffect(() => {
        let cancelled = false;
        cloudApi.getSignupStatus()
            // prev && open (not plain `open`): Task 4 made the close monotonic — a
            // deferred/stale open:true response must never reopen a panel closed by a
            // submit-time SIGNUP_CAP_REACHED. The oauthCapRejected guard extends the
            // same rule to the OAuth-rejection close.
            .then(({ open }) => { if (!cancelled && !oauthCapRejected) setSignupOpen(prev => prev && open); })
            .catch(() => { /* Fail toward the normal form; the server still enforces the cap. */ });
        return () => { cancelled = true; };
    }, [oauthCapRejected]);

    useEffect(() => {
        if (oauthCapRejected) {
            setIsLogin(false);
            setSignupOpen(false);
        }
    }, [oauthCapRejected]);
```

In the Google button's `onClick`, add the error callback:

```tsx
                            await signIn.social({
                                provider: "google",
                                callbackURL: window.location.origin + (from ?? '/app'),
                                errorCallbackURL: window.location.origin + '/login'
                            });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/loginWaitlist.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Full unit suite, then commit**

Run: `npx vitest run tests/unit`
Expected: all green.

```bash
git add pages/LoginPage.tsx tests/unit/loginWaitlist.test.tsx
git commit -m "feat: route capped Google signups to the waitlist panel"
```

---

### Task 7: Real-browser verification (mandatory)

**Files:**
- No production code changes expected. Screenshots go to `scratch/`; any bug found is fixed test-first before this task completes.

**Interfaces:**
- Consumes: everything above, running as a real app.

- [ ] **Step 1: Boot the app with a tiny cap**

```bash
SIGNUP_CAP=1 RESEND_API_KEY= DATABASE_URL= \
SQLITE_PATH=/tmp/claude-1000/-media-anoop-ssd-1-Work-doctect-doctect/850dc8b8-76ad-424d-8dfe-1e2bb27d55bf/scratchpad/capverify.db \
BETTER_AUTH_URL=http://localhost:3001/api/auth \
VITE_API_BASE=http://localhost:3001 \
npm run dev
```

Vite serves the client on `http://localhost:3000`; the API server runs on `:3001`. There is no vite proxy, so `VITE_API_BASE` must point at the API server explicitly (same as the Playwright config does). `RESEND_API_KEY`/`DATABASE_URL` are present-but-empty inline for the usual dotenv-resurrection reason; the scratch `SQLITE_PATH` keeps the developer's real `server/analytics.db` untouched.

- [ ] **Step 2: Create the one allowed account**

In a Playwright-driven or manual browser against `http://localhost:3000`: sign up `first@cap.test` with password `Password-1234!` and username `first_user`. Verify it directly in the database (same approach as the unit helpers):

```bash
sqlite3 /tmp/claude-1000/-media-anoop-ssd-1-Work-doctect-doctect/850dc8b8-76ad-424d-8dfe-1e2bb27d55bf/scratchpad/capverify.db "UPDATE \"user\" SET \"emailVerified\" = 1 WHERE email = 'first@cap.test';"
```

- [ ] **Step 3: Verify the closed state in the browser**

- Reload `/login`, switch to Sign Up: the waitlist panel must render (screenshot).
- Join the waitlist as `hopeful@cap.test`: success message (screenshot).
- Sign In view: email/password form and Google button still present; signing in as `first@cap.test` still works.
- Navigate to `/login?error=Signups_are_temporarily_closed_%E2%80%94_test`: waitlist panel renders (simulates the Google rejection redirect without a second Google account).
- Sign in as `first@cap.test`, promote it to admin (`UPDATE "user" SET role = 'admin' ...` via sqlite3), open the admin moderation page: the Waitlist section lists `hopeful@cap.test` (screenshot).
- `curl -s localhost:3001/api/signup-status` → `{"open":false}`.

- [ ] **Step 4: Verify the open state**

Restart the server with `SIGNUP_CAP=5`: `/api/signup-status` → `{"open":true}`; the Sign Up form renders normally; `POST /api/waitlist` returns 409.

- [ ] **Step 5: Record and commit**

If any step surfaced a bug: fix it test-first (failing unit test → fix → green) before finishing. Then:

```bash
git add -A docs/
git commit -m "docs: check off signup cap plan after real-browser verification" --allow-empty
```
