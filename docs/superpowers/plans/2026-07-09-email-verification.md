# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email/password accounts must verify their address via an emailed link before they can sign in; Google sign-in and signed-out (local-first) usage stay untouched.

**Architecture:** better-auth's built-in verification-link flow (`requireEmailVerification` + `emailVerification` config) with delivery through a new `server/email.js` (Resend HTTP API via plain `fetch`, console fallback without an API key, injectable for tests). Client changes confined to `LoginPage`.

**Tech Stack:** better-auth 1.4.10, Resend HTTP API (no SDK), React 19, vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-07-09-email-verification-design.md`

## Global Constraints

- **Depends on the password-policy plan having landed** (`docs/superpowers/plans/2026-07-09-password-policy.md`): uses `TEST_PASSWORD` from `tests/unit/server/helpers.js`. Execute that plan first.
- Work on branch `feature/auth-hardening`.
- Fail-safe rule: a missing `RESEND_API_KEY` must NEVER disable sign-in blocking — it only switches delivery to console logging.
- Google sign-in and all signed-out functionality must be untouched (verified by the existing suite staying green).
- Env vars: `RESEND_API_KEY` (unset ⇒ console fallback), `EMAIL_FROM` (default `PDF Architect <onboarding@resend.dev>`).
- Verification links expire in 3600 seconds.

---

### Task 1: `server/email.js` — delivery with fallback and test injection

**Files:**
- Create: `server/email.js`
- Test: `tests/unit/server/email.test.js`

**Interfaces:**
- Produces:
  - `sendEmail({ to, subject, html, text }) -> Promise<object>`
  - `setSendEmailImpl(fn | null)` — test injection point; `null` restores real behavior.
  Later tasks import `sendEmail` in `server/auth.js`; tests import `setSendEmailImpl`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/email.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmail, setSendEmailImpl } from '../../../server/email.js';

describe('sendEmail', () => {
    beforeEach(() => { delete process.env.RESEND_API_KEY; });
    afterEach(() => { setSendEmailImpl(null); vi.restoreAllMocks(); });

    it('uses the injected implementation when set', async () => {
        const impl = vi.fn(async () => ({ id: 'injected' }));
        setSendEmailImpl(impl);
        const res = await sendEmail({ to: 'a@b.dev', subject: 's', html: '<p>x</p>', text: 'x' });
        expect(res).toEqual({ id: 'injected' });
        expect(impl).toHaveBeenCalledWith({ to: 'a@b.dev', subject: 's', html: '<p>x</p>', text: 'x' });
    });

    it('falls back to console logging when RESEND_API_KEY is unset', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await sendEmail({ to: 'a@b.dev', subject: 'Verify', html: '<a href="http://x/verify">v</a>', text: 'http://x/verify' });
        expect(res).toEqual({ fallback: true });
        const logged = warn.mock.calls.flat().join('\n');
        expect(logged).toContain('a@b.dev');
        expect(logged).toContain('http://x/verify'); // the link must be recoverable from logs
    });

    it('POSTs to Resend when RESEND_API_KEY is set', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        process.env.EMAIL_FROM = 'App <auth@app.dev>';
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 })
        );
        const res = await sendEmail({ to: 'a@b.dev', subject: 's', html: '<p>x</p>' });
        expect(res).toEqual({ id: 'resend-1' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.headers.Authorization).toBe('Bearer test-key');
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ from: 'App <auth@app.dev>', to: 'a@b.dev', subject: 's' });
    });

    it('throws loudly on a Resend error response', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }));
        await expect(sendEmail({ to: 'a@b.dev', subject: 's', html: 'x' })).rejects.toThrow(/403/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/email.test.js`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement**

```js
// server/email.js
// Outbound email. Real delivery via Resend's HTTP API (plain fetch, no SDK).
// Fail-safe: no RESEND_API_KEY => log the message (incl. any links) to the
// console and resolve. This keeps dev working with zero setup while never
// weakening auth: callers treat email as sent either way, and sign-in
// verification blocking is enforced independently of delivery.

let injectedImpl = null;

/** Test hook: replace delivery. Pass null to restore real behavior. */
export const setSendEmailImpl = (fn) => { injectedImpl = fn; };

export async function sendEmail({ to, subject, html, text }) {
    if (injectedImpl) return injectedImpl({ to, subject, html, text });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn(`[email] RESEND_API_KEY not set — NOT delivering to ${to}. Subject: ${subject}`);
        console.warn(`[email] Body:\n${text || html}`);
        return { fallback: true };
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'PDF Architect <onboarding@resend.dev>',
            to,
            subject,
            html,
            text,
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`[email] Resend request failed: ${res.status} ${body}`);
    }
    return res.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/email.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/email.js tests/unit/server/email.test.js
git commit -m "feat(auth): email delivery module (Resend + console fallback + test injection)"
```

---

### Task 2: Require verification in better-auth + keep the existing suite green

**Files:**
- Modify: `server/auth.js`
- Modify: `tests/unit/server/helpers.js` (`signUpUser`, `signUpUserNoUsername`)
- Test: `tests/unit/server/emailVerification.test.js`

**Interfaces:**
- Consumes: `sendEmail` (Task 1); `TEST_PASSWORD` (password-policy plan).
- Produces: signup helpers that return a signed-in cookie for an already-verified user — every existing server test keeps its contract.

- [ ] **Step 1: Update the shared helpers first.** With `requireEmailVerification: true`, sign-up no longer returns a session cookie, so both helpers must: sign up → mark verified directly in the DB → sign in → return the sign-in cookie.

```js
// tests/unit/server/helpers.js — replace both signup helpers.
// Direct DB verify: tests run on SQLite only (initTestApp forces SQLITE_PATH),
// so the 1/0 boolean form is safe. Import db lazily — server/db.js reads env
// at import time and must load after initTestApp has set SQLITE_PATH.
const markVerified = async (email) => {
    const { query } = await import('../../../server/db.js');
    await query('UPDATE "user" SET "emailVerified" = 1 WHERE email = $1', [email]);
};

const signInFor = async (app, email) => {
    const res = await request(app)
        .post('/api/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD });
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
};

export const signUpUser = async (app, { email, username }) => {
    const res = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name: username, username });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    await markVerified(email);
    return signInFor(app, email);
};

export const signUpUserNoUsername = async (app, { email, name }) => {
    const res = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    await markVerified(email);
    return signInFor(app, email);
};
```

Note: sign-up now sends a verification email through `sendEmail` — with no `RESEND_API_KEY` under test this hits the console-fallback path (harmless log noise). Tests that must not see it can inject a no-op via `setSendEmailImpl`.

- [ ] **Step 2: Write the failing flow test**

```js
// tests/unit/server/emailVerification.test.js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/emailVerification.test.js`
Expected: FAIL — no verification email captured; unverified sign-in returns 200

- [ ] **Step 4: Implement in `server/auth.js`**

```js
import { sendEmail } from "./email.js";
```

Update `emailAndPassword` and add `emailVerification` (sibling keys in the `betterAuth({...})` options):

```js
emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: true,
},
emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
            to: user.email,
            subject: "Verify your email — PDF Architect",
            html: `<p>Confirm your address to finish signing up: <a href="${url}">Verify email</a></p><p>This link expires in 1 hour. If you didn't create this account, ignore this email.</p>`,
            text: `Verify your email: ${url}\nThis link expires in 1 hour.`,
        });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
},
```

- [ ] **Step 5: Run the new test, then the whole server suite**

Run: `npx vitest run tests/unit/server/emailVerification.test.js`
Expected: PASS (4 tests)

Run: `npx vitest run tests/unit/server/`
Expected: all pass (helpers keep every existing test's cookie contract). Any failure here is a helper-contract break — fix the helper, not the tests.

- [ ] **Step 6: Commit**

```bash
git add server/auth.js tests/unit/server/helpers.js tests/unit/server/emailVerification.test.js
git commit -m "feat(auth): require email verification for email/password accounts"
```

---

### Task 3: LoginPage verification UX

**Files:**
- Modify: `pages/LoginPage.tsx`
- Test: `tests/unit/loginEmailVerification.test.tsx`

**Interfaces:**
- Consumes: `authClient.sendVerificationEmail` (built-in better-auth client method), `signUp.email` / `signIn.email` from `lib/auth-client.ts`.

Behavior contract:
1. Successful signup → replace the form with a **"Verify your email"** panel: the submitted address, "we sent you a verification link", a **Resend email** button.
2. Sign-in failing with status 403 (unverified) → same panel (better-auth already re-sent the link on that attempt).
3. Landing on `/login?verified=1` → success note ("Email verified — you're signed in") and continue via the existing `from`-redirect logic (user already has a session from `autoSignInAfterVerification`).
4. Signup and resend calls pass `callbackURL: \`${window.location.origin}/login?verified=1\`` so the emailed link returns to the app.

- [ ] **Step 1: Write the failing test** (mirror the auth-client mock pattern used in `tests/unit/loginRedirect.test.tsx`; adjust selectors to real markup, keep the behavioral assertions)

```tsx
// tests/unit/loginEmailVerification.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

const signUpEmail = vi.fn(async () => ({ data: { user: {} }, error: null }));
const signInEmail = vi.fn(async () => ({ data: null, error: { status: 403, message: 'Email not verified' } }));
const sendVerificationEmail = vi.fn(async () => ({ data: {}, error: null }));
vi.mock('../../lib/auth-client', () => ({
    signIn: { email: (...a: any[]) => signInEmail(...a), social: vi.fn() },
    signUp: { email: (...a: any[]) => signUpEmail(...a) },
    useSession: () => ({ data: null, isPending: false }),
    signOut: vi.fn(),
    authClient: { sendVerificationEmail: (...a: any[]) => sendVerificationEmail(...a) },
}));

const renderAt = (path = '/login') => render(
    <MemoryRouter initialEntries={[path]}><LoginPage /></MemoryRouter>
);

describe('email verification UX', () => {
    beforeEach(() => { signUpEmail.mockClear(); signInEmail.mockClear(); sendVerificationEmail.mockClear(); });

    it('shows the verify panel after signup and can resend', async () => {
        renderAt();
        fireEvent.click(screen.getByText(/sign up/i));
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@user.dev' } });
        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'newuser' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /sign up|create account/i }));

        await waitFor(() => screen.getByText(/verify your email/i));
        expect(screen.getByText(/new@user.dev/)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /resend/i }));
        await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'new@user.dev' })
        ));
    });

    it('shows the verify panel when sign-in is refused as unverified', async () => {
        renderAt();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'old@user.dev' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in|log in/i }));
        await waitFor(() => screen.getByText(/verify your email/i));
    });

    it('acknowledges ?verified=1', async () => {
        renderAt('/login?verified=1');
        expect(await screen.findByText(/email verified/i)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/loginEmailVerification.test.tsx`
Expected: FAIL — no verify panel exists

- [ ] **Step 3: Implement in `pages/LoginPage.tsx`**

Add state:

```tsx
const [verifyEmailFor, setVerifyEmailFor] = useState<string | null>(null);
const [resent, setResent] = useState(false);
const verifiedBanner = new URLSearchParams(location.search).get('verified') === '1';
```

- Signup success handler: `setVerifyEmailFor(email)` instead of navigating.
- Sign-in error handler: if `error.status === 403` (or the error message contains "not verified"), `setVerifyEmailFor(email)`.
- Both `signUp.email` and the resend call include `callbackURL: \`${window.location.origin}/login?verified=1\``.
- When `verifyEmailFor` is set, render instead of the form:

```tsx
<div className="text-center space-y-3">
    <h2 className="font-bold text-lg">Verify your email</h2>
    <p className="text-slate-600">We sent a verification link to <strong>{verifyEmailFor}</strong>. Click it to finish signing in.</p>
    <button
        onClick={async () => {
            await authClient.sendVerificationEmail({
                email: verifyEmailFor,
                callbackURL: `${window.location.origin}/login?verified=1`,
            });
            setResent(true);
        }}
        className="px-3 py-1.5 border rounded text-sm"
    >
        Resend email
    </button>
    {resent && <p className="text-sm text-green-600">Sent — check your inbox.</p>}
    <button onClick={() => setVerifyEmailFor(null)} className="text-sm text-slate-500 underline">Back</button>
</div>
```

- When `verifiedBanner`, render a success note above the form: `Email verified — you're signed in.` The page's existing session-aware redirect (it already navigates signed-in users to `from`) completes the flow.

Match existing styling; import `authClient` from `../lib/auth-client`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/loginEmailVerification.test.tsx`
Expected: PASS (3 tests)

Also run: `npx vitest run tests/unit/loginRedirect.test.tsx tests/unit/loginPasswordPolicy.test.tsx`
Expected: still pass

- [ ] **Step 5: Commit**

```bash
git add pages/LoginPage.tsx tests/unit/loginEmailVerification.test.tsx
git commit -m "feat(auth): verify-your-email flow on login page"
```

---

### Task 4: Real-browser end-to-end (mandatory, not committed)

- [ ] **Step 1:** Start API + client with a throwaway DB and no `RESEND_API_KEY`:
  `SQLITE_PATH=/tmp/verify.db BETTER_AUTH_URL=http://localhost:3001/api/auth node server/index.js` and `npx vite --port 5199 --strictPort`.
- [ ] **Step 2:** In Playwright: sign up a fresh account → "Verify your email" panel appears; confirm no session (`/api/me` null).
- [ ] **Step 3:** Pull the verification URL from the server console (fallback logger prints it), visit it in the browser → lands on `/login?verified=1`, banner shows, user is signed in (AccountMenu shows the username).
- [ ] **Step 4:** Sign out, sign in again → succeeds (verified). Create a second account, attempt sign-in without verifying → refused + panel.
- [ ] **Step 5:** Report results with screenshots/probe output. Fix anything found test-first.

---

## Self-review notes

- Spec coverage: delivery module + fallback + injection (T1), requireEmailVerification/sendOnSignUp/autoSignIn/expiresIn + helper protection (T2), all three client states + callbackURL (T3), real-browser run (T4). Ops section of the spec is deploy-time config, no code task.
- Fail-safe: T1's fallback test proves the link is recoverable from logs; blocking is enforced by better-auth config regardless of delivery (T2 flow test runs with injected sender, T4 runs with fallback).
- Order dependency stated in Global Constraints: password-policy plan first (`TEST_PASSWORD`).
- The verification-link regex in T2 matches better-auth's `/verify-email` endpoint URL; if the captured URL differs in 1.4.10, adjust the regex to the actual link in the captured message — the assertion contract is "a link that verifies the account."
