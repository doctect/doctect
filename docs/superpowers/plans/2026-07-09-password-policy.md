# Password Policy + Change Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a 12-char / 3-of-4-classes password policy everywhere passwords are set, and add a Change Password section to the Account settings page.

**Architecture:** One shared validator (`shared/passwordPolicy.js`) consumed by both the server (a better-auth `before` hook — authoritative) and the client (inline form feedback). Change-password uses better-auth's built-in `/change-password` endpoint; no new server routes.

**Tech Stack:** better-auth 1.4.10 (`createAuthMiddleware`/`APIError` from `better-auth/api`), React 19, vitest + supertest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-09-password-policy-design.md`

## Global Constraints

- Policy: minimum **12** characters AND at least **3 of 4** classes (lowercase, uppercase, digit, symbol). Max length stays better-auth's default 128.
- Policy applies ONLY where a password is *set* (`/sign-up/email`, `/change-password`, `/reset-password`) — never on sign-in.
- Policy failures return 400 with the validator's exact message.
- `shared/` files are plain ESM JS (no TypeScript) — same as `shared/diff.js`.
- Work on branch `feature/auth-hardening` (create from current HEAD if it doesn't exist: `git checkout -b feature/auth-hardening`).
- Run any single test file with `npx vitest run <path>`; full suite with `npm test`.

---

### Task 1: Shared password validator

**Files:**
- Create: `shared/passwordPolicy.js`
- Test: `tests/unit/shared/passwordPolicy.test.js`

**Interfaces:**
- Produces: `validatePassword(password: string) -> { ok: true } | { ok: false, message: string }` and `MIN_PASSWORD_LENGTH = 12`. Later tasks import both from `shared/passwordPolicy.js`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/shared/passwordPolicy.test.js
import { describe, it, expect } from 'vitest';
import { validatePassword, MIN_PASSWORD_LENGTH } from '../../../shared/passwordPolicy.js';

describe('validatePassword', () => {
    it('exports MIN_PASSWORD_LENGTH = 12', () => {
        expect(MIN_PASSWORD_LENGTH).toBe(12);
    });

    it('rejects 11 chars even with all four classes', () => {
        const r = validatePassword('Aa1!Aa1!Aa1'); // 11 chars
        expect(r.ok).toBe(false);
        expect(r.message).toBe('Password must be at least 12 characters');
    });

    it('accepts exactly 12 chars with 3 classes (lower+upper+digit)', () => {
        expect(validatePassword('Aa1Aa1Aa1Aa1')).toEqual({ ok: true });
    });

    it('rejects 12+ chars with only 2 classes (lower+digit)', () => {
        const r = validatePassword('password1234');
        expect(r.ok).toBe(false);
        expect(r.message).toBe('Password must use at least 3 of: lowercase, uppercase, digits, symbols');
    });

    it('accepts lower+digit+symbol (no uppercase)', () => {
        expect(validatePassword('password-1234')).toEqual({ ok: true });
    });

    it('accepts all four classes', () => {
        expect(validatePassword('Password-1234!')).toEqual({ ok: true });
    });

    it('counts unicode letters as letters, never rejects for containing unicode', () => {
        // ñ = lowercase letter, Ü = uppercase letter, plus digit => 3 classes
        expect(validatePassword('ñÜ1ñÜ1ñÜ1ñÜ1')).toEqual({ ok: true });
    });

    it('does not count whitespace as a symbol', () => {
        // lower + digit + spaces only => still 2 classes
        const r = validatePassword('password 1234');
        expect(r.ok).toBe(false);
    });

    it('rejects non-string input with the length message', () => {
        expect(validatePassword(undefined).ok).toBe(false);
        expect(validatePassword(null).ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shared/passwordPolicy.test.js`
Expected: FAIL — `Failed to resolve import "../../../shared/passwordPolicy.js"`

- [ ] **Step 3: Write minimal implementation**

```js
// shared/passwordPolicy.js
// Single source of truth for the password policy. Plain ESM JS (like
// shared/diff.js) so both the server hook and the React client import it.

export const MIN_PASSWORD_LENGTH = 12;

const CLASS_PATTERNS = [
    /\p{Ll}/u,          // lowercase letter (unicode-aware)
    /\p{Lu}/u,          // uppercase letter (unicode-aware)
    /\d/,               // digit
    /[^\p{L}\p{N}\s]/u, // symbol: not a letter, not a number, not whitespace
];

export function validatePassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    const classes = CLASS_PATTERNS.reduce((n, re) => n + (re.test(password) ? 1 : 0), 0);
    if (classes < 3) {
        return { ok: false, message: 'Password must use at least 3 of: lowercase, uppercase, digits, symbols' };
    }
    return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/shared/passwordPolicy.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/passwordPolicy.js tests/unit/shared/passwordPolicy.test.js
git commit -m "feat(auth): shared password policy validator (12 chars, 3 of 4 classes)"
```

---

### Task 2: Server enforcement

**Files:**
- Modify: `server/auth.js` (add hook + `minPasswordLength`)
- Modify: `tests/unit/server/helpers.js:43-57` (compliant fixture password)
- Test: `tests/unit/server/passwordPolicy.test.js`

**Interfaces:**
- Consumes: `validatePassword` from Task 1.
- Produces: `TEST_PASSWORD = 'Password-1234!'` exported from `tests/unit/server/helpers.js` — later tasks and the email-verification plan rely on this exact export.

- [ ] **Step 1: Update the shared test helpers first** (the old fixture `password1234` violates the new policy and would break the whole server suite)

In `tests/unit/server/helpers.js`, add the export and use it in both signup helpers:

```js
// Compliant with shared/passwordPolicy.js (12+ chars, 3+ classes). Exported so
// tests that sign in as a helper-created user use the same value.
export const TEST_PASSWORD = 'Password-1234!';
```

Replace `'password1234'` with `TEST_PASSWORD` in `signUpUser` and `signUpUserNoUsername`.

Then: `grep -rn "password1234" tests/ server/` — update any other literal to `TEST_PASSWORD` (import it; never re-export fixtures from a `*.test.js` file, per the warning comment already in helpers.js).

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/server/passwordPolicy.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, TEST_PASSWORD } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('password policy enforcement', () => {
    it('rejects sign-up with a too-short password', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email: 'short@test.dev', password: 'Aa1!Aa1!Aa1', name: 'short', username: 'shortpw' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password must be at least 12 characters');
    });

    it('rejects sign-up with only 2 character classes', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email: 'weak@test.dev', password: 'password1234', name: 'weak', username: 'weakpw' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password must use at least 3 of: lowercase, uppercase, digits, symbols');
    });

    it('accepts a compliant sign-up', async () => {
        const res = await request(app).post('/api/auth/sign-up/email')
            .send({ email: 'strong@test.dev', password: TEST_PASSWORD, name: 'strong', username: 'strongpw' });
        expect(res.status).toBe(200);
    });

    it('does not police sign-IN (pre-existing weak passwords keep working)', async () => {
        // Simulate a legacy account: create it while the hook allows it by using
        // a compliant password, then verify sign-in itself is never rejected by
        // the policy hook (only /sign-up/email, /change-password, /reset-password are).
        const email = 'legacy@test.dev';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'legacy', username: 'legacypw' });
        const res = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(res.status).toBe(200);
    });

    it('rejects change-password with a weak NEW password', async () => {
        const email = 'changer@test.dev';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'changer', username: 'changerpw' });
        const signin = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        const cookie = signin.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        const res = await request(app).post('/api/auth/change-password')
            .set('Cookie', cookie)
            .send({ currentPassword: TEST_PASSWORD, newPassword: 'password1234' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password must use at least 3 of: lowercase, uppercase, digits, symbols');
    });

    it('accepts change-password with a compliant new password, old password stops working', async () => {
        const email = 'rotator@test.dev';
        const NEW_PW = 'Rotated-Pass-99!';
        await request(app).post('/api/auth/sign-up/email')
            .send({ email, password: TEST_PASSWORD, name: 'rotator', username: 'rotatorpw' });
        const signin = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        const cookie = signin.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');

        const change = await request(app).post('/api/auth/change-password')
            .set('Cookie', cookie)
            .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PW, revokeOtherSessions: true });
        expect(change.status).toBe(200);

        const oldTry = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: TEST_PASSWORD });
        expect(oldTry.status).not.toBe(200);

        const newTry = await request(app).post('/api/auth/sign-in/email')
            .send({ email, password: NEW_PW });
        expect(newTry.status).toBe(200);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/passwordPolicy.test.js`
Expected: FAIL — weak sign-ups return 200 (no policy hook yet)

- [ ] **Step 4: Implement the hook**

In `server/auth.js`:

```js
import { createAuthMiddleware, APIError } from "better-auth/api";
import { validatePassword } from "../shared/passwordPolicy.js";

// Paths where a password is being SET. Sign-in is deliberately absent:
// pre-existing weaker passwords must keep working until changed.
const PASSWORD_SETTING_PATHS = ["/sign-up/email", "/change-password", "/reset-password"];
```

Inside the `betterAuth({ ... })` options (sibling of `plugins`), add:

```js
hooks: {
    before: createAuthMiddleware(async (ctx) => {
        if (!PASSWORD_SETTING_PATHS.includes(ctx.path)) return;
        const password = ctx.body?.newPassword ?? ctx.body?.password;
        if (typeof password !== "string") return; // missing field: better-auth's own validation handles it
        const result = validatePassword(password);
        if (!result.ok) {
            throw new APIError("BAD_REQUEST", { message: result.message, code: "PASSWORD_POLICY" });
        }
    }),
},
```

And in the existing `emailAndPassword` block add `minPasswordLength: 12` (belt-and-suspenders under the hook):

```js
emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
},
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/passwordPolicy.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full server suite** (fixture password change touches everything)

Run: `npx vitest run tests/unit/server/`
Expected: all pass. If any test fails on 400 password policy, it's using a hardcoded weak password — switch it to `TEST_PASSWORD` from helpers.

- [ ] **Step 7: Commit**

```bash
git add server/auth.js tests/unit/server/
git commit -m "feat(auth): enforce password policy on all password-setting endpoints"
```

---

### Task 3: Signup form inline validation

**Files:**
- Modify: `pages/LoginPage.tsx` (signup path only; sign-in untouched)
- Test: `tests/unit/loginPasswordPolicy.test.tsx`

**Interfaces:**
- Consumes: `validatePassword` from `shared/passwordPolicy.js` (Task 1).

- [ ] **Step 1: Read the existing mock pattern**

Read `tests/unit/loginRedirect.test.tsx` and mirror its mocking of `../../lib/auth-client` and router setup exactly. The new test must not duplicate-register that file's suites (import nothing from it).

- [ ] **Step 2: Write the failing test**

```tsx
// tests/unit/loginPasswordPolicy.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

const signUpEmail = vi.fn(async () => ({ data: {}, error: null }));
vi.mock('../../lib/auth-client', () => ({
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: (...args: any[]) => signUpEmail(...args) },
    useSession: () => ({ data: null, isPending: false }),
    signOut: vi.fn(),
    authClient: {},
}));

const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);

describe('signup password policy UI', () => {
    beforeEach(() => signUpEmail.mockClear());

    it('shows the policy message and does not call signUp for a weak password', async () => {
        renderPage();
        // switch to the signup mode of the form (the page has a sign-up toggle;
        // use whatever accessible control loginRedirect.test.tsx uses)
        fireEvent.click(screen.getByText(/sign up/i));
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.dev' } });
        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'someuser' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password1234' } });
        fireEvent.click(screen.getByRole('button', { name: /sign up|create account/i }));
        await waitFor(() => {
            expect(screen.getByText(/at least 3 of: lowercase, uppercase, digits, symbols/i)).toBeTruthy();
        });
        expect(signUpEmail).not.toHaveBeenCalled();
    });

    it('submits when the password satisfies the policy', async () => {
        renderPage();
        fireEvent.click(screen.getByText(/sign up/i));
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.dev' } });
        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'someuser' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /sign up|create account/i }));
        await waitFor(() => expect(signUpEmail).toHaveBeenCalled());
    });
});
```

Adjust selectors (labels/roles/toggle) to the page's real markup after reading it — the behavioral assertions (message shown, `signUp` not called / called) are the contract. If inputs lack label associations, add `aria-label`s to the page's inputs as part of this task.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/loginPasswordPolicy.test.tsx`
Expected: FAIL — no policy message rendered; signUp called with weak password

- [ ] **Step 4: Implement**

In `pages/LoginPage.tsx`:

```tsx
import { validatePassword } from '../shared/passwordPolicy.js';
```

Add state `const [passwordError, setPasswordError] = useState<string | null>(null);`

In the submit handler's signup branch, before calling `signUp.email(...)`:

```tsx
const policy = validatePassword(password);
if (!policy.ok) {
    setPasswordError(policy.message);
    return;
}
setPasswordError(null);
```

Under the password input (signup mode only), render:

```tsx
{isSignUp && passwordError && (
    <p className="text-sm text-red-600 mt-1">{passwordError}</p>
)}
```

Also clear `passwordError` when the password input changes. Sign-in submits must never run the validator.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/loginPasswordPolicy.test.tsx`
Expected: PASS (2 tests)

Also run: `npx vitest run tests/unit/loginRedirect.test.tsx` — must still pass.

- [ ] **Step 6: Commit**

```bash
git add pages/LoginPage.tsx tests/unit/loginPasswordPolicy.test.tsx
git commit -m "feat(auth): inline password policy validation on signup form"
```

---

### Task 4: Change Password section on Account settings

**Files:**
- Modify: `pages/AccountSettingsPage.tsx` (36 lines today — section slots under the existing username form)
- Test: `tests/unit/changePassword.test.tsx`

**Interfaces:**
- Consumes: `validatePassword` (Task 1); `authClient.changePassword` and `authClient.listAccounts` from `lib/auth-client.ts` (both built into better-auth's client — no plugin needed).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/changePassword.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountSettingsPage } from '../../pages/AccountSettingsPage';

const changePassword = vi.fn(async () => ({ data: {}, error: null }));
let accounts: { provider: string }[] = [{ provider: 'credential' }];
vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: { user: { id: 'u1', email: 'a@b.dev', username: 'someuser' } }, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(),
    authClient: {
        changePassword: (...args: any[]) => changePassword(...args),
        listAccounts: vi.fn(async () => ({ data: accounts, error: null })),
    },
}));

const renderPage = () => render(<MemoryRouter><AccountSettingsPage /></MemoryRouter>);

describe('change password section', () => {
    beforeEach(() => { changePassword.mockClear(); accounts = [{ provider: 'credential' }]; });

    it('renders for credential accounts and submits a valid change with revokeOtherSessions', async () => {
        renderPage();
        await waitFor(() => screen.getByText(/change password/i));
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Old-Pass-1234!' } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'New-Pass-5678!' } });
        fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'New-Pass-5678!' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        await waitFor(() => expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({
            currentPassword: 'Old-Pass-1234!',
            newPassword: 'New-Pass-5678!',
            revokeOtherSessions: true,
        })));
        await waitFor(() => screen.getByText(/password updated/i));
    });

    it('blocks submit when the new password fails policy', async () => {
        renderPage();
        await waitFor(() => screen.getByText(/change password/i));
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Old-Pass-1234!' } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'password1234' } });
        fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'password1234' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(await screen.findByText(/at least 3 of/i)).toBeTruthy();
        expect(changePassword).not.toHaveBeenCalled();
    });

    it('blocks submit when confirmation does not match', async () => {
        renderPage();
        await waitFor(() => screen.getByText(/change password/i));
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Old-Pass-1234!' } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'New-Pass-5678!' } });
        fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'Different-99!' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(await screen.findByText(/do not match/i)).toBeTruthy();
        expect(changePassword).not.toHaveBeenCalled();
    });

    it('is hidden for Google-only accounts', async () => {
        accounts = [{ provider: 'google' }];
        renderPage();
        await waitFor(() => expect(screen.queryByText(/change password/i)).toBeNull());
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/changePassword.test.tsx`
Expected: FAIL — no "Change password" section exists

- [ ] **Step 3: Implement**

In `pages/AccountSettingsPage.tsx` add a `ChangePasswordSection` component (same file — page is tiny) rendered below the existing username form:

```tsx
import { useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';
import { validatePassword } from '../shared/passwordPolicy.js';

function ChangePasswordSection() {
    const [hasCredential, setHasCredential] = useState(false);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        authClient.listAccounts().then(({ data }) => {
            // Only accounts with a credential provider have a password to change.
            // On lookup failure, stay hidden (no password-less account should see it).
            setHasCredential(!!data?.some((a: any) => a.provider === 'credential'));
        }).catch(() => setHasCredential(false));
    }, []);

    if (!hasCredential) return null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setDone(false);
        const policy = validatePassword(next);
        if (!policy.ok) { setError(policy.message); return; }
        if (next !== confirm) { setError('New passwords do not match'); return; }
        setError(null);
        setBusy(true);
        try {
            const { error: apiError } = await authClient.changePassword({
                currentPassword: current,
                newPassword: next,
                revokeOtherSessions: true,
            });
            if (apiError) { setError(apiError.message || 'Password change failed'); return; }
            setDone(true);
            setCurrent(''); setNext(''); setConfirm('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-8 border-t pt-6 space-y-3">
            <h2 className="font-bold text-slate-900">Change password</h2>
            <label className="block text-sm">Current password
                <input type="password" aria-label="Current password" value={current} onChange={e => setCurrent(e.target.value)} className="w-full border rounded px-2 py-1 mt-1" />
            </label>
            <label className="block text-sm">New password
                <input type="password" aria-label="New password" value={next} onChange={e => { setNext(e.target.value); setError(null); }} className="w-full border rounded px-2 py-1 mt-1" />
            </label>
            <label className="block text-sm">Confirm new password
                <input type="password" aria-label="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full border rounded px-2 py-1 mt-1" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {done && <p className="text-sm text-green-600">Password updated</p>}
            <button type="submit" disabled={busy} className="px-3 py-1.5 bg-slate-900 text-white rounded text-sm">
                Update password
            </button>
        </form>
    );
}
```

Match the page's existing styling conventions when integrating (read the file first; adjust classes to blend in).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/changePassword.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add pages/AccountSettingsPage.tsx tests/unit/changePassword.test.tsx
git commit -m "feat(auth): change-password section on account settings"
```

---

### Task 5: Real-browser verification (mandatory, not committed)

- [ ] **Step 1:** Start the app (`npx vite --port 5199 --strictPort` + `node server/index.js` with a throwaway SQLite db: `SQLITE_PATH=/tmp/pwpolicy.db BETTER_AUTH_URL=http://localhost:3001/api/auth node server/index.js`).
- [ ] **Step 2:** Drive with Playwright (throwaway script in the session scratchpad, not committed):
  1. Sign up with `password1234` → inline policy message appears, no account created.
  2. Sign up with `Password-1234!` → succeeds.
  3. Go to `/account` → Change password section visible; change to `New-Pass-5678!` → success message.
  4. Sign out, sign in with old password → fails; with new password → succeeds.
- [ ] **Step 3:** Report results in the session (screenshots or probe output). Fix anything found test-first before closing the plan.

---

## Self-review notes

- Spec coverage: validator (T1), server hook + minPasswordLength (T2), signup UI (T3), change-password UI incl. Google-only hiding + revokeOtherSessions (T4), real-browser check (T5). Sign-in exemption tested in T2. Fixture bump in T2 Step 1.
- `authClient.changePassword` / `authClient.listAccounts` are core better-auth client methods (server exports `changePassword` and `listUserAccounts` endpoints; both verified present in better-auth 1.4.10's API surface).
- T3/T4 selectors are contracts, not gospel — implementers adjust to real markup but keep behavioral assertions.
