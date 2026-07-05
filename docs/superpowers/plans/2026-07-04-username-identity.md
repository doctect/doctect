# Public Username Identity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three related bugs — the "My profile" link 404ing, gallery cards not showing the publisher's username, and no way to set a pseudonym — all caused by accounts that can exist with `username = NULL` and no way to set/change one.

**Architecture:** A required, blocking `/welcome` onboarding step and a new `/account` settings page, both backed by better-auth's existing `update-user`/`is-username-available` endpoints (no new server endpoints for the username mechanism itself). A new `requireUsername` server middleware gates the 5 routes that create/attach cloud content, mirrored by client-side gating so the UI never lets a signed-in-without-a-username user reach a button that would 403.

**Tech Stack:** React + TypeScript + react-router-dom (client), Express + better-auth + SQLite/Postgres (server), Vitest + Testing Library (unit), Playwright (e2e) — all pre-existing, no new dependencies.

**Design doc:** `docs/superpowers/specs/2026-07-04-username-identity-design.md`

## Global Constraints

- Username format (client and reused everywhere): `^[a-zA-Z0-9_]{3,30}$` — the exact regex already used in `pages/LoginPage.tsx`.
- `requireUsername` is applied to exactly 5 routes and no others: `POST /api/projects`, `POST /api/projects/:id/commits`, `POST /api/projects/:id/publish`, `POST /api/projects/:id/fork`, `POST /api/merge-requests`.
- No new server endpoints for setting/checking a username — reuse better-auth's existing, already-mounted `/api/auth/update-user` and `/api/auth/is-username-available` (confirmed working via reproduction tests during design).
- No new npm dependencies.
- Static copy (verbatim, appears under the username input in both `/welcome` and `/account`): *"This is shown publicly on the gallery. It doesn't have to be your real name, and you can change it any time in Account settings."*
- `/welcome` and `/account` are both wrapped in the existing `AuthGuard` component already defined in `App.tsx` (used today by `/analytics`) — do not duplicate its "redirect to `/login` if signed out" logic inside the new pages.
- **Testing gotcha (confirmed during design investigation):** any test touching `lib/auth-client` (i.e. `authClient`, `useSession`) MUST mock the whole module with `vi.mock('../../lib/auth-client', () => ({ ... }))` (exactly the pattern already used in `tests/unit/loginRedirect.test.tsx`). Mocking `global.fetch` does **not** work for this — better-auth's internal `$fetch` captures the `fetch` reference once, at module-import time, before any per-test mock assignment can take effect. `services/cloudApi.ts`'s own `api()` function is different — it calls the global `fetch` fresh on every call, so mocking `global.fetch` (Task 2) or `vi.spyOn(cloudApi, '<method>')` (Tasks 7–8) both work fine there.
- `authClient.isUsernameAvailable(...)` and `authClient.updateUser(...)` are real, already-typed methods on the existing `authClient` (from `lib/auth-client.ts`) — confirmed both at runtime and under `tsc --noEmit` during design investigation. Call them directly; no `as any` casts needed.

---

### Task 1: Server — `requireUsername` middleware, applied to the 5 gating routes

**Files:**
- Modify: `server/middleware/guards.js`
- Modify: `server/routes/projects.js`
- Modify: `server/routes/mergeRequests.js`
- Test: `tests/unit/server/requireUsername.test.js` (create)
- Test: `tests/unit/server/username.test.js` (extend)
- Test: `tests/unit/server/helpers.js` (extend)

**Interfaces:**
- Produces: `requireUsername(req, res, next)` — Express middleware exported from `server/middleware/guards.js`. Returns `403 { error: string, code: 'USERNAME_REQUIRED' }` if `req.user.username` is falsy, otherwise calls `next()`. Must run after `requireAuth` (relies on `req.user` already being set) and should run *before* `loadProject`/any route-specific validation (fail fast, and — deliberately — a nonexistent `:id` still gets `403 USERNAME_REQUIRED` rather than `404`, which Step 1's tests assert directly).
- Produces: `signUpUserNoUsername(app, { email, name })` — new test helper in `tests/unit/server/helpers.js`, returns a cookie string for a session with no username (simulates what Google OAuth produces — the real server never requires a username at sign-up, only the custom client-side form does).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/server/helpers.js` (after the existing `signUpUser` export):

```js
export const signUpUserNoUsername = async (app, { email, name }) => {
    const res = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: 'password1234', name });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
};
```

Create `tests/unit/server/requireUsername.test.js`:

```js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUserNoUsername, minimalState, PNG_1X1 } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('requireUsername gate', () => {
    it('blocks creating a cloud project without a username', async () => {
        const cookie = await signUpUserNoUsername(app, { email: 'nouser1@test.dev', name: 'No User' });
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Blocked Project', state: minimalState() });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks saving a commit without a username', async () => {
        const cookie = await signUpUserNoUsername(app, { email: 'nouser2@test.dev', name: 'No User Two' });
        // requireUsername must fire before loadProject -- a nonexistent id still 403s, not 404s.
        const res = await request(app).post('/api/projects/nonexistent-id/commits').set('Cookie', cookie)
            .send({ state: minimalState(), message: 'Update' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks publishing without a username', async () => {
        const cookie = await signUpUserNoUsername(app, { email: 'nouser3@test.dev', name: 'No User Three' });
        const res = await request(app).post('/api/projects/nonexistent-id/publish').set('Cookie', cookie)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks forking without a username', async () => {
        const cookie = await signUpUserNoUsername(app, { email: 'nouser4@test.dev', name: 'No User Four' });
        const res = await request(app).post('/api/projects/nonexistent-id/fork').set('Cookie', cookie);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('blocks opening a merge request without a username', async () => {
        const cookie = await signUpUserNoUsername(app, { email: 'nouser5@test.dev', name: 'No User Five' });
        const res = await request(app).post('/api/merge-requests').set('Cookie', cookie)
            .send({ sourceProjectId: 'nonexistent-id', title: 'Propose it' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it('allows creating a cloud project once a username is set', async () => {
        const cookie = await signUpUserNoUsername(app, { email: 'nouser6@test.dev', name: 'No User Six' });
        const update = await request(app).post('/api/auth/update-user').set('Cookie', cookie).send({ username: 'now_has_one' });
        expect(update.status).toBe(200);
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Now Allowed', state: minimalState() });
        expect(res.status).toBe(201);
    });
});
```

Append to `tests/unit/server/username.test.js` (new `describe` block, same file, after the existing `describe('username plugin', ...)`):

```js
describe('is-username-available', () => {
    it('reports an existing username as unavailable', async () => {
        await signUpUser(app, { email: 'avail1@test.dev', username: 'taken_handle' });
        const res = await request(app).post('/api/auth/is-username-available').send({ username: 'taken_handle' });
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(false);
    });
    it('reports a new username as available', async () => {
        const res = await request(app).post('/api/auth/is-username-available').send({ username: 'brand_new_handle_xyz' });
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(true);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/requireUsername.test.js tests/unit/server/username.test.js`
Expected: `requireUsername.test.js` fails (every gated route currently returns 201/200, not 403 — `requireUsername` doesn't exist yet). `username.test.js`'s new tests should already pass (the endpoint pre-exists) — only the new gate tests should fail.

- [ ] **Step 3: Implement `requireUsername`**

In `server/middleware/guards.js`, add after `requireAdmin`:

```js
export const requireUsername = (req, res, next) => {
    if (!req.user?.username) {
        return res.status(403).json({ error: 'Set a public username before using cloud/gallery features.', code: 'USERNAME_REQUIRED' });
    }
    next();
};
```

- [ ] **Step 4: Apply the middleware in `server/routes/projects.js`**

Change the import line:

```js
import { requireAuth, optionalAuth } from '../middleware/guards.js';
```
to:
```js
import { requireAuth, optionalAuth, requireUsername } from '../middleware/guards.js';
```

Change these four route registrations (insert `requireUsername` immediately after `requireAuth`, before any other middleware):

```js
router.post('/api/projects', requireAuth, async (req, res) => {
```
→
```js
router.post('/api/projects', requireAuth, requireUsername, async (req, res) => {
```

```js
router.post('/api/projects/:id/commits', requireAuth, loadProject(true), async (req, res) => {
```
→
```js
router.post('/api/projects/:id/commits', requireAuth, requireUsername, loadProject(true), async (req, res) => {
```

```js
router.post('/api/projects/:id/publish', requireAuth, loadProject(true), async (req, res) => {
```
→
```js
router.post('/api/projects/:id/publish', requireAuth, requireUsername, loadProject(true), async (req, res) => {
```

```js
router.post('/api/projects/:id/fork', requireAuth, loadProject(false), async (req, res) => {
```
→
```js
router.post('/api/projects/:id/fork', requireAuth, requireUsername, loadProject(false), async (req, res) => {
```

Leave every other route in this file (`GET /api/projects`, `GET /api/projects/:id`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`, `GET .../commits`, `GET .../commits/:commitId`, `POST .../unpublish`) unchanged.

- [ ] **Step 5: Apply the middleware in `server/routes/mergeRequests.js`**

Change the import line:
```js
import { requireAuth } from '../middleware/guards.js';
```
to:
```js
import { requireAuth, requireUsername } from '../middleware/guards.js';
```

Change:
```js
router.post('/api/merge-requests', requireAuth, async (req, res) => {
```
→
```js
router.post('/api/merge-requests', requireAuth, requireUsername, async (req, res) => {
```

Leave every other route in this file (`GET /api/projects/:id/merge-requests`, `GET /api/merge-requests/mine`, `GET /api/merge-requests/:id`, `POST /api/merge-requests/:id/merge`, `POST /api/merge-requests/:id/close`) unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/requireUsername.test.js tests/unit/server/username.test.js`
Expected: PASS (all tests, both files).

- [ ] **Step 7: Run the full server test suite to check for regressions**

Run: `npx vitest run tests/unit/server`
Expected: PASS — every existing test already signs up users with a username via the pre-existing `signUpUser` helper, so none should be affected.

- [ ] **Step 8: Commit**

```bash
git add server/middleware/guards.js server/routes/projects.js server/routes/mergeRequests.js tests/unit/server/requireUsername.test.js tests/unit/server/username.test.js tests/unit/server/helpers.js
git commit -m "feat(auth): require a username for cloud/gallery write actions

New requireUsername middleware, applied to the 5 routes that create or
attach content as the acting user: create/save/publish/fork a project,
and open a merge request. Returns 403 { code: 'USERNAME_REQUIRED' }.

This is server-side defense-in-depth; the client-side gate (later
tasks) is what most users will actually see."
```

---

### Task 2: Client — `ApiError` carries a `code` field

**Files:**
- Modify: `services/cloudApi.ts`
- Test: `tests/unit/cloudApi.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ApiError` now has a public `code?: string` property, set from the JSON error body's `code` field (e.g. `'USERNAME_REQUIRED'`, matching Task 1's server response). Tasks 7 and 8 construct/inspect `ApiError` instances with this field directly.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cloudApi.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/cloudApi.test.ts`
Expected: FAIL on the first test (`(e as ApiError).code` is `undefined`, not `'USERNAME_REQUIRED'` — the constructor doesn't accept/store a `code` yet).

- [ ] **Step 3: Implement the `code` field**

In `services/cloudApi.ts`, change:

```ts
export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}
```
to:
```ts
export class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
```

And change:
```ts
    if (!res.ok) throw new ApiError(res.status, body?.error || `Request failed (${res.status})`);
```
to:
```ts
    if (!res.ok) throw new ApiError(res.status, body?.error || `Request failed (${res.status})`, body?.code);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/cloudApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/cloudApi.ts tests/unit/cloudApi.test.ts
git commit -m "feat(cloud): ApiError carries the server's error code

Lets call sites branch on a specific failure (e.g. USERNAME_REQUIRED)
instead of string-matching the human-readable message."
```

---

### Task 3: Client — shared `UsernameForm` component

**Files:**
- Create: `components/UsernameForm.tsx`
- Test: `tests/unit/UsernameForm.test.tsx` (create)

**Interfaces:**
- Consumes: `authClient.isUsernameAvailable({ username: string }) => Promise<{ data: { available: boolean } | null, error: ... }>` and `authClient.updateUser({ username: string }, { onSuccess, onError }) => Promise<...>`, both from `lib/auth-client.ts` (pre-existing, unmodified).
- Produces: `UsernameForm({ initialValue?: string, submitLabel?: string, onSuccess: (username: string) => void })` — a React component. Tasks 4 and 5 render this directly.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/UsernameForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsernameForm } from '../../components/UsernameForm';

const mockUpdateUser = vi.fn();
const mockIsUsernameAvailable = vi.fn();

vi.mock('../../lib/auth-client', () => ({
    authClient: {
        updateUser: (...args: any[]) => mockUpdateUser(...args),
        isUsernameAvailable: (...args: any[]) => mockIsUsernameAvailable(...args),
    },
}));

describe('UsernameForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: true } });
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); });
    });

    it('rejects an invalid format before ever checking availability', () => {
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'ab' } });
        expect(screen.getByText(/3–30 characters/)).toBeInTheDocument();
        expect(mockIsUsernameAvailable).not.toHaveBeenCalled();
    });

    it('shows an available indicator for a free username', async () => {
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'brand_new' } });
        await waitFor(() => expect(screen.getByText('✓ Available')).toBeInTheDocument());
    });

    it('shows a taken indicator and blocks submit for an unavailable username', async () => {
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: false } });
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'already_taken' } });
        await waitFor(() => expect(screen.getByText('✗ Already taken')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('calls updateUser and onSuccess on submit', async () => {
        const onSuccess = vi.fn();
        render(<UsernameForm onSuccess={onSuccess} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('new_handle'));
        expect(mockUpdateUser).toHaveBeenCalledWith({ username: 'new_handle' }, expect.any(Object));
    });

    it('shows a fallback error message when submit fails', async () => {
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onError({ error: {} }); return Promise.resolve(); });
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.getByText(/may already be taken, or something went wrong/)).toBeInTheDocument());
    });

    it('pre-fills an existing username', () => {
        render(<UsernameForm initialValue="current_handle" onSuccess={vi.fn()} />);
        expect(screen.getByDisplayValue('current_handle')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/UsernameForm.test.tsx`
Expected: FAIL with "Failed to resolve import ../../components/UsernameForm" (file doesn't exist yet).

- [ ] **Step 3: Implement `UsernameForm`**

Create `components/UsernameForm.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { authClient } from '../lib/auth-client';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

type Availability = 'unknown' | 'checking' | 'available' | 'taken';

interface UsernameFormProps {
    initialValue?: string;
    submitLabel?: string;
    onSuccess: (username: string) => void;
}

export function UsernameForm({ initialValue = '', submitLabel = 'Save', onSuccess }: UsernameFormProps) {
    const [value, setValue] = useState(initialValue);
    const [availability, setAvailability] = useState<Availability>('unknown');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const checkToken = useRef(0);

    const formatValid = USERNAME_RE.test(value);

    useEffect(() => {
        if (!formatValid || value === initialValue) {
            setAvailability('unknown');
            return;
        }
        const token = ++checkToken.current;
        setAvailability('checking');
        const t = setTimeout(async () => {
            try {
                const res = await authClient.isUsernameAvailable({ username: value });
                if (checkToken.current !== token) return;
                setAvailability(res.data?.available ? 'available' : 'taken');
            } catch {
                if (checkToken.current !== token) return;
                setAvailability('unknown');
            }
        }, 300);
        return () => clearTimeout(t);
    }, [value, initialValue, formatValid]);

    const canSubmit = formatValid && availability !== 'taken' && !busy;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        await authClient.updateUser(
            { username: value },
            {
                onSuccess: () => { setBusy(false); onSuccess(value); },
                onError: (ctx) => {
                    setBusy(false);
                    setError(ctx.error.message || 'That username may already be taken, or something went wrong — try another.');
                },
            }
        );
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. planner_pro"
            />
            {!formatValid && value.length > 0 && (
                <p className="text-xs text-red-600">3–30 characters, letters/numbers/underscores only.</p>
            )}
            {formatValid && availability === 'checking' && <p className="text-xs text-slate-400">Checking availability…</p>}
            {formatValid && availability === 'available' && <p className="text-xs text-green-600">✓ Available</p>}
            {formatValid && availability === 'taken' && <p className="text-xs text-red-600">✗ Already taken</p>}
            <p className="text-xs text-gray-500">
                This is shown publicly on the gallery. It doesn't have to be your real name, and you can change it any time in Account settings.
            </p>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
                {busy ? 'Saving…' : submitLabel}
            </button>
        </form>
    );
}
```

Note deliberately **not** passing `displayUsername` to `updateUser`: the server's username plugin already mirrors `username` into `displayUsername` (preserving typed case) whenever the latter is omitted — confirmed during design investigation.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/UsernameForm.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/UsernameForm.tsx tests/unit/UsernameForm.test.tsx
git commit -m "feat(auth): add shared UsernameForm component

Format validation, debounced availability check, and submit via
better-auth's existing update-user endpoint. Used by the /welcome and
/account pages added in the next two tasks."
```

---

### Task 4: Client — `WelcomePage` (`/welcome`)

**Files:**
- Create: `pages/WelcomePage.tsx`
- Modify: `App.tsx`
- Test: `tests/unit/WelcomePage.test.tsx` (create)

**Interfaces:**
- Consumes: `UsernameForm` (Task 3), `useSession()` from `lib/auth-client.ts`, the existing `AuthGuard` component defined in `App.tsx`.
- Produces: route `/welcome`. Tasks 6, 7, 8 link to this route (with `state: { from: <pathname> }`) whenever a signed-in session has no username.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/WelcomePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WelcomePage } from '../../pages/WelcomePage';

const mockUseSession = vi.fn();
const mockUpdateUser = vi.fn();
const mockIsUsernameAvailable = vi.fn();

vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    authClient: {
        updateUser: (...args: any[]) => mockUpdateUser(...args),
        isUsernameAvailable: (...args: any[]) => mockIsUsernameAvailable(...args),
    },
}));

const renderAt = (initialEntries: any[]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/gallery" element={<div>GALLERY_MARKER</div>} />
            <Route path="/gallery/xyz" element={<div>GALLERY_DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('WelcomePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); });
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: true } });
    });

    it('redirects onward immediately if a username is already set', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'already_set' } }, isPending: false });
        renderAt([{ pathname: '/welcome', state: { from: '/gallery/xyz' } }]);
        expect(await screen.findByText('GALLERY_DETAIL_MARKER')).toBeInTheDocument();
    });

    it('defaults onward to /gallery when there is no "from" state', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'already_set' } }, isPending: false });
        renderAt(['/welcome']);
        expect(await screen.findByText('GALLERY_MARKER')).toBeInTheDocument();
    });

    it('shows the username form when there is no username yet', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null } }, isPending: false });
        renderAt(['/welcome']);
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    it('continues to "from" after successfully choosing a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null } }, isPending: false });
        renderAt([{ pathname: '/welcome', state: { from: '/gallery/xyz' } }]);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(await screen.findByText('GALLERY_DETAIL_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/WelcomePage.test.tsx`
Expected: FAIL with "Failed to resolve import ../../pages/WelcomePage" (file doesn't exist yet).

- [ ] **Step 3: Implement `WelcomePage`**

Create `pages/WelcomePage.tsx`:

```tsx
import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/auth-client';
import { UsernameForm } from '../components/UsernameForm';

export function WelcomePage() {
    const { data: session, isPending } = useSession();
    const location = useLocation();
    const navigate = useNavigate();
    const from = (location.state as { from?: string } | null)?.from;

    // AuthGuard (in App.tsx) already guarantees a session by the time this renders;
    // this is a defensive fallback only (e.g. a brief render race), not a redirect-to-login.
    if (isPending || !session?.user) {
        return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
    }
    if ((session.user as any).username) {
        return <Navigate to={from ?? '/gallery'} replace />;
    }

    return (
        <div className="h-screen overflow-y-auto flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
                <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">Choose a username</h2>
                <p className="text-sm text-gray-500 text-center mb-6">
                    You need a public username to save to the cloud, publish, fork, or propose changes.
                </p>
                <UsernameForm submitLabel="Continue" onSuccess={() => navigate(from ?? '/gallery', { replace: true })} />
            </div>
        </div>
    );
}
```

Modify `App.tsx` — add the import (alongside the other page imports):

```tsx
import { ProfilePage } from './pages/ProfilePage';
```
becomes:
```tsx
import { ProfilePage } from './pages/ProfilePage';
import { WelcomePage } from './pages/WelcomePage';
```

And add the route (inside `<Routes>`, right after the `/analytics` route which is the last one):

```tsx
        <Route
          path="/analytics"
          element={
            <AuthGuard>
              <AnalyticsDashboard />
            </AuthGuard>
          }
        />
      </Routes>
```
becomes:
```tsx
        <Route
          path="/analytics"
          element={
            <AuthGuard>
              <AnalyticsDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/welcome"
          element={
            <AuthGuard>
              <WelcomePage />
            </AuthGuard>
          }
        />
      </Routes>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/WelcomePage.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full client unit suite to check for regressions**

Run: `npx vitest run tests/unit --exclude tests/unit/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pages/WelcomePage.tsx App.tsx tests/unit/WelcomePage.test.tsx
git commit -m "feat(auth): add /welcome onboarding page for choosing a username

Wrapped in the existing AuthGuard. Auto-continues past itself (to
state.from, defaulting to /gallery) once a username is set, so it
never 'sticks' once satisfied."
```

---

### Task 5: Client — `AccountSettingsPage` (`/account`)

**Files:**
- Create: `pages/AccountSettingsPage.tsx`
- Modify: `App.tsx`
- Test: `tests/unit/AccountSettingsPage.test.tsx` (create)

**Interfaces:**
- Consumes: `UsernameForm` (Task 3), `useSession()`.
- Produces: route `/account`. Task 6's `AccountMenu` links here.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/AccountSettingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountSettingsPage } from '../../pages/AccountSettingsPage';

const mockUseSession = vi.fn();
const mockUpdateUser = vi.fn();
const mockIsUsernameAvailable = vi.fn();

vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    authClient: {
        updateUser: (...args: any[]) => mockUpdateUser(...args),
        isUsernameAvailable: (...args: any[]) => mockIsUsernameAvailable(...args),
    },
}));

const renderPage = () => render(
    <MemoryRouter initialEntries={['/account']}>
        <AccountSettingsPage />
    </MemoryRouter>
);

describe('AccountSettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); });
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: true } });
    });

    it('pre-fills the current username', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'current_handle', email: 'a@b.com' } }, isPending: false });
        renderPage();
        expect(screen.getByDisplayValue('current_handle')).toBeInTheDocument();
    });

    it('shows a confirmation after a successful change, without navigating away', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'current_handle', email: 'a@b.com' } }, isPending: false });
        renderPage();
        fireEvent.change(screen.getByDisplayValue('current_handle'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('Username updated.')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/AccountSettingsPage.test.tsx`
Expected: FAIL with "Failed to resolve import ../../pages/AccountSettingsPage" (file doesn't exist yet).

- [ ] **Step 3: Implement `AccountSettingsPage`**

Create `pages/AccountSettingsPage.tsx`:

```tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '../lib/auth-client';
import { UsernameForm } from '../components/UsernameForm';

export function AccountSettingsPage() {
    const { data: session, isPending } = useSession();
    const [saved, setSaved] = useState(false);

    // AuthGuard (in App.tsx) already guarantees a session by the time this renders;
    // this is a defensive fallback only, not a redirect-to-login.
    if (isPending || !session?.user) {
        return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
    }

    const user = session.user as any;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
            </header>
            <main className="max-w-md mx-auto p-6">
                <h1 className="text-xl font-bold text-slate-800 mb-1">Account settings</h1>
                <p className="text-sm text-slate-500 mb-6">Signed in as {user.email}</p>
                {saved && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">Username updated.</div>}
                <UsernameForm
                    initialValue={user.username ?? ''}
                    submitLabel="Save changes"
                    onSuccess={() => setSaved(true)}
                />
            </main>
        </div>
    );
}
```

Modify `App.tsx` — add the import:

```tsx
import { WelcomePage } from './pages/WelcomePage';
```
becomes:
```tsx
import { WelcomePage } from './pages/WelcomePage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
```

And add the route (right after the `/welcome` route added in Task 4):

```tsx
        <Route
          path="/welcome"
          element={
            <AuthGuard>
              <WelcomePage />
            </AuthGuard>
          }
        />
      </Routes>
```
becomes:
```tsx
        <Route
          path="/welcome"
          element={
            <AuthGuard>
              <WelcomePage />
            </AuthGuard>
          }
        />
        <Route
          path="/account"
          element={
            <AuthGuard>
              <AccountSettingsPage />
            </AuthGuard>
          }
        />
      </Routes>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/AccountSettingsPage.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add pages/AccountSettingsPage.tsx App.tsx tests/unit/AccountSettingsPage.test.tsx
git commit -m "feat(auth): add /account settings page for changing username any time

Wrapped in the existing AuthGuard. Pre-fills the current username;
success shows an inline confirmation rather than navigating away."
```

---

### Task 6: Client — fix `AccountMenu`

**Files:**
- Modify: `components/AccountMenu.tsx`
- Test: `tests/unit/AccountMenu.test.tsx` (create)

**Interfaces:**
- Consumes: `/welcome` (Task 4), `/account` (Task 5) as plain route strings.
- Produces: no new exports — same `AccountMenu` component, same call sites (`LandingPage.tsx`, `EditorPage.tsx`, `GalleryPage.tsx`, `GalleryDetailPage.tsx`, `ProfilePage.tsx` all render `<AccountMenu />` with no props; none need changes).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/AccountMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AccountMenu } from '../../components/AccountMenu';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    signOut: vi.fn(),
}));

const renderAt = (initialEntries: any[]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <Routes>
            <Route path="/gallery" element={<AccountMenu />} />
        </Routes>
    </MemoryRouter>
);

describe('AccountMenu', () => {
    it('shows a sign-in link when signed out', () => {
        mockUseSession.mockReturnValue({ data: null, isPending: false });
        renderAt(['/gallery']);
        expect(screen.getByText('Sign in')).toBeInTheDocument();
    });

    it('shows the username and links My profile to /u/<username> when set', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro', name: 'Real Name' } }, isPending: false });
        renderAt(['/gallery']);
        fireEvent.click(screen.getByTitle('Account'));
        expect(screen.getByText('planner_pro')).toBeInTheDocument();
        expect(screen.getByText('My profile').closest('a')).toHaveAttribute('href', '/u/planner_pro');
    });

    it('shows "Set username" and links My profile to /welcome when no username is set', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null, name: 'Real Name' } }, isPending: false });
        renderAt(['/gallery']);
        fireEvent.click(screen.getByTitle('Account'));
        expect(screen.getByText('Set username')).toBeInTheDocument();
        expect(screen.getByText('My profile').closest('a')).toHaveAttribute('href', '/welcome');
    });

    it('includes an Account settings link to /account', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro', name: 'Real Name' } }, isPending: false });
        renderAt(['/gallery']);
        fireEvent.click(screen.getByTitle('Account'));
        expect(screen.getByText('Account settings').closest('a')).toHaveAttribute('href', '/account');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/AccountMenu.test.tsx`
Expected: FAIL — the real name ("Real Name") currently leaks into the button/link instead of "Set username" / `/welcome`, and there's no "Account settings" link yet.

- [ ] **Step 3: Fix `AccountMenu`**

Replace the whole file `components/AccountMenu.tsx` with:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, LogOut, Image, Settings } from 'lucide-react';
import { useSession, signOut } from '../lib/auth-client';

export function AccountMenu() {
    const { data: session, isPending } = useSession();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const location = useLocation();

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (isPending) return null;
    if (!session?.user) {
        return <Link to="/login" state={{ from: location.pathname }} className="text-xs font-medium text-slate-500 hover:text-blue-600">Sign in</Link>;
    }
    const username = (session.user as any).username as string | null;
    const profileTo = username ? `/u/${username}` : '/welcome';
    const profileState = username ? undefined : { from: location.pathname };
    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
                title="Account"
            >
                <User size={14} /> <span className="hidden md:inline">{username || 'Set username'}</span>
            </button>
            {open && (
                <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    <Link to={profileTo} state={profileState} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">My profile</Link>
                    <Link to="/gallery" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Image size={12} /> Gallery</Link>
                    <Link to="/account" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Settings size={12} /> Account settings</Link>
                    <button onClick={() => { setOpen(false); signOut(); }} className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <LogOut size={12} /> Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/AccountMenu.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/AccountMenu.tsx tests/unit/AccountMenu.test.tsx
git commit -m "fix(auth): AccountMenu no longer falls back to real name for profile link

session.user.username || session.user.name meant anyone without a
username (guaranteed for Google sign-in) got a 'My profile' link built
from their real name, which 404s (GET /api/users/<name> matches
nothing). Now links to /welcome instead when there's no username, and
adds an 'Account settings' item linking to /account."
```

---

### Task 7: Client — gate `CloudMenu` on having a username

**Files:**
- Modify: `components/cloud/CloudMenu.tsx`
- Test: `tests/unit/CloudMenu.test.tsx` (create)

**Interfaces:**
- Consumes: `/welcome` (Task 4) as a route string; `ApiError.code` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/CloudMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CloudMenu } from '../../components/cloud/CloudMenu';
import { cloudApi, ApiError } from '../../services/cloudApi';
import type { Project } from '../../pages/EditorPage';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

const project: Project = {
    id: 'local-1',
    name: 'Test Project',
    initialState: {
        nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
        rootId: 'root',
        variants: { default: { id: 'default', name: 'Default', templates: {} } },
        activeVariantId: 'default',
    } as any,
};

const renderMenu = () => render(
    <MemoryRouter initialEntries={['/app']}>
        <Routes>
            <Route path="/app" element={<CloudMenu project={project} onLinkCloud={vi.fn()} onRestoreState={vi.fn()} />} />
            <Route path="/welcome" element={<div>WELCOME_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('CloudMenu', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('shows "Sign in to save to cloud" when signed out', () => {
        mockUseSession.mockReturnValue({ data: null });
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        expect(screen.getByText('Sign in to save to cloud')).toBeInTheDocument();
    });

    it('shows "Set a username to use cloud features" when signed in without a username', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null } } });
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        const link = screen.getByText('Set a username to use cloud features');
        expect(link.closest('a')).toHaveAttribute('href', '/welcome');
        expect(screen.queryByText('Save to cloud (new)')).not.toBeInTheDocument();
    });

    it('shows the full cloud menu when signed in with a username', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        expect(screen.getByText('Save to cloud (new)')).toBeInTheDocument();
    });

    it('redirects to /welcome if the server rejects a save as USERNAME_REQUIRED', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        vi.spyOn(cloudApi, 'createProject').mockRejectedValue(new ApiError(403, 'nope', 'USERNAME_REQUIRED'));
        vi.spyOn(window, 'prompt').mockReturnValue('Initial save');
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(screen.getByRole('button', { name: 'Save to cloud (new)' }));
        expect(await screen.findByText('WELCOME_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/CloudMenu.test.tsx`
Expected: FAIL — the second and fourth tests fail (today, a no-username session sees the full menu, not a "Set a username..." link, and there's no redirect-on-`USERNAME_REQUIRED` behavior).

- [ ] **Step 3: Update `CloudMenu`**

Change the import line:
```tsx
import { Link, useLocation } from 'react-router-dom';
```
to:
```tsx
import { Link, useLocation, useNavigate } from 'react-router-dom';
```

Add `const navigate = useNavigate();` right after the existing `const location = useLocation();` line.

Change the `saveToCloud` function from:
```tsx
    const saveToCloud = async () => {
        const message = window.prompt('Describe this save (commit message):', project.cloud ? 'Update' : 'Initial save');
        if (message === null) return;
        setBusy(true); setError(null);
        try {
            if (!project.cloud) {
                const res = await cloudApi.createProject({ name: project.name, state: project.initialState, message });
                onLinkCloud({ projectId: res.project.id, lastSyncedCommitId: res.commit.id });
            } else {
                const res = await cloudApi.saveCommit(project.cloud.projectId, { state: project.initialState, message });
                onLinkCloud({ projectId: project.cloud.projectId, lastSyncedCommitId: res.commit.id });
            }
            setOpen(false);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };
```
to:
```tsx
    const saveToCloud = async () => {
        const message = window.prompt('Describe this save (commit message):', project.cloud ? 'Update' : 'Initial save');
        if (message === null) return;
        setBusy(true); setError(null);
        try {
            if (!project.cloud) {
                const res = await cloudApi.createProject({ name: project.name, state: project.initialState, message });
                onLinkCloud({ projectId: res.project.id, lastSyncedCommitId: res.commit.id });
            } else {
                const res = await cloudApi.saveCommit(project.cloud.projectId, { state: project.initialState, message });
                onLinkCloud({ projectId: project.cloud.projectId, lastSyncedCommitId: res.commit.id });
            }
            setOpen(false);
        } catch (e) {
            if (e instanceof ApiError && e.code === 'USERNAME_REQUIRED') {
                navigate('/welcome', { state: { from: location.pathname } });
                return;
            }
            setError(e instanceof ApiError ? e.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };
```

Change the dropdown's outer conditional from:
```tsx
                    {!session?.user ? (
                        <Link to="/login" state={{ from: location.pathname }} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Sign in to save to cloud
                        </Link>
                    ) : (
                        <>
```
to:
```tsx
                    {!session?.user ? (
                        <Link to="/login" state={{ from: location.pathname }} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Sign in to save to cloud
                        </Link>
                    ) : !(session.user as any).username ? (
                        <Link to="/welcome" state={{ from: location.pathname }} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Set a username to use cloud features
                        </Link>
                    ) : (
                        <>
```

(The rest of the file — the full menu's `<>...</>` block, and its closing `)}`  — is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/CloudMenu.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full client unit suite to check for regressions**

Run: `npx vitest run tests/unit --exclude tests/unit/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/cloud/CloudMenu.tsx tests/unit/CloudMenu.test.tsx
git commit -m "feat(cloud): gate CloudMenu's save/publish/propose on having a username

Covers Save to cloud, Publish, and Propose changes in one place since
they all live in this same dropdown. Also redirects to /welcome (as a
fallback) if the server ever rejects a save with USERNAME_REQUIRED."
```

---

### Task 8: Client — gate the Fork button on `GalleryDetailPage`

**Files:**
- Modify: `pages/GalleryDetailPage.tsx`
- Test: `tests/unit/GalleryDetailPage.test.tsx` (create)

**Interfaces:**
- Consumes: `/welcome` (Task 4); `ApiError.code` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/GalleryDetailPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryDetailPage } from '../../pages/GalleryDetailPage';
import { cloudApi, ApiError, GalleryDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

const detail: GalleryDetail = {
    id: 'proj-1', name: 'Test Project', description: 'desc', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', ownerId: 'owner-1',
    headCommitId: 'commit-1', thumbnailIds: [], forkedFrom: null,
};

const renderAt = () => render(
    <MemoryRouter initialEntries={['/gallery/proj-1']}>
        <Routes>
            <Route path="/gallery/:id" element={<GalleryDetailPage />} />
            <Route path="/welcome" element={<div>WELCOME_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryDetailPage fork gating', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('shows "Sign in to fork" when signed out', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Sign in to fork')).toBeInTheDocument();
    });

    it('shows "Set a username to fork" when signed in without a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: null } } });
        renderAt();
        const link = await screen.findByText('Set a username to fork');
        expect(link.closest('a')).toHaveAttribute('href', '/welcome');
    });

    it('shows the Fork button when signed in with a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: 'planner_pro' } } });
        renderAt();
        expect(await screen.findByRole('button', { name: /fork this project/i })).toBeInTheDocument();
    });

    it('redirects to /welcome if the server rejects a fork as USERNAME_REQUIRED', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: 'planner_pro' } } });
        vi.spyOn(cloudApi, 'fork').mockRejectedValue(new ApiError(403, 'nope', 'USERNAME_REQUIRED'));
        renderAt();
        const forkBtn = await screen.findByRole('button', { name: /fork this project/i });
        fireEvent.click(forkBtn);
        expect(await screen.findByText('WELCOME_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx`
Expected: FAIL — the second and fourth tests fail (today, a no-username session sees the real Fork button, not a "Set a username to fork" link, and there's no redirect-on-`USERNAME_REQUIRED` behavior).

- [ ] **Step 3: Update `GalleryDetailPage`**

Change the `fork` function from:
```tsx
    const fork = async () => {
        if (!id) return;
        setBusy('fork');
        try {
            const res = await cloudApi.fork(id);
            const commit = await cloudApi.getCommit(res.project.id, res.project.headCommitId!);
            stageImport({
                name: res.project.name,
                state: commit.state,
                cloud: { projectId: res.project.id, lastSyncedCommitId: commit.id }
            });
            navigate('/app');
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Fork failed'); setBusy(null); }
    };
```
to:
```tsx
    const fork = async () => {
        if (!id) return;
        setBusy('fork');
        try {
            const res = await cloudApi.fork(id);
            const commit = await cloudApi.getCommit(res.project.id, res.project.headCommitId!);
            stageImport({
                name: res.project.name,
                state: commit.state,
                cloud: { projectId: res.project.id, lastSyncedCommitId: commit.id }
            });
            navigate('/app');
        } catch (e) {
            if (e instanceof ApiError && e.code === 'USERNAME_REQUIRED') {
                navigate('/welcome', { state: { from: location.pathname } });
                return;
            }
            setError(e instanceof ApiError ? e.message : 'Fork failed');
            setBusy(null);
        }
    };
```

Change the fork-button block from:
```tsx
                        {session?.user ? (
                            <button onClick={fork} disabled={busy !== null}
                                className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                                <GitFork size={14} /> {busy === 'fork' ? 'Forking…' : 'Fork this project'}
                            </button>
                        ) : (
                            <Link to="/login" state={{ from: location.pathname }} className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
                        )}
```
to:
```tsx
                        {!session?.user ? (
                            <Link to="/login" state={{ from: location.pathname }} className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
                        ) : !(session.user as any).username ? (
                            <Link to="/welcome" state={{ from: location.pathname }} className="text-center text-xs text-slate-500 hover:text-blue-600">Set a username to fork</Link>
                        ) : (
                            <button onClick={fork} disabled={busy !== null}
                                className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                                <GitFork size={14} /> {busy === 'fork' ? 'Forking…' : 'Fork this project'}
                            </button>
                        )}
```

(`navigate` and `location` are already imported/defined in this file — no new imports needed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full client unit suite to check for regressions**

Run: `npx vitest run tests/unit --exclude tests/unit/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pages/GalleryDetailPage.tsx tests/unit/GalleryDetailPage.test.tsx
git commit -m "feat(gallery): gate the Fork button on having a username

Same 3-way pattern as CloudMenu: signed out -> sign in; signed in, no
username -> set one first; else -> the real Fork button. Also
redirects to /welcome (as a fallback) on a USERNAME_REQUIRED rejection."
```

---

### Task 9: E2E coverage + stale assertion cleanup

**Files:**
- Create: `tests/e2e/username_identity.spec.js`
- Modify: `tests/e2e/gallery.spec.js`
- Modify: `tests/e2e/merge_requests.spec.js`
- Modify: `tests/e2e/fork.spec.js`

**Interfaces:**
- Consumes: everything from Tasks 1–8, exercised through a real browser against a real (locally-run) server.
- Produces: nothing consumed by later tasks (this is the last task).

**Correction found during execution (2026-07-04):** the original plan text below only named `gallery.spec.js` and `merge_requests.spec.js` for the stale `/analytics` cleanup. Actually running the pre-existing e2e suite as a baseline check before dispatching this task showed `tests/e2e/fork.spec.js` has the exact same stale assertion (confirmed via a real, reproducible `TimeoutError: page.waitForURL: Timeout 15000ms exceeded ... waiting for navigation to "**/analytics" ... navigated to "http://localhost:3000/app"` failure) — a plan gap, not a new bug. It needs the identical fix, at two call sites (both `pageA` and `pageB`'s sign-up flows).

- [ ] **Step 1: Fix the stale `/analytics` assertions (3 files, 4 call sites)**

In `tests/e2e/gallery.spec.js`, change:
```js
        await page.waitForURL('**/analytics', { timeout: 15000 });
```
to:
```js
        await page.waitForURL('**/app', { timeout: 15000 });
```

In `tests/e2e/merge_requests.spec.js`, change (inside the shared `signUp` helper near the top of the file):
```js
    await page.waitForURL('**/analytics', { timeout: 15000 });
```
to:
```js
    await page.waitForURL('**/app', { timeout: 15000 });
```

In `tests/e2e/fork.spec.js`, change **both** occurrences (User A's sign-up around line 31, and User B's sign-up around line 79):
```js
        await pageA.waitForURL('**/analytics', { timeout: 15000 });
```
to:
```js
        await pageA.waitForURL('**/app', { timeout: 15000 });
```
and:
```js
        await pageB.waitForURL('**/analytics', { timeout: 15000 });
```
to:
```js
        await pageB.waitForURL('**/app', { timeout: 15000 });
```

These were stale from before the earlier "sign-in returns to where you came from" fix (current `LoginPage.tsx` defaults to `/app`, not `/analytics`, when there's no `from` state — which is the case for a fresh `/login` visit in all three of these specs).

- [ ] **Step 2: Write the new E2E spec**

Create `tests/e2e/username_identity.spec.js`:

```js
import { test, expect } from '@playwright/test';

// The API server (server/index.js) listens on a different origin than the Vite
// dev server that Playwright's baseURL points at (see .env: VITE_API_BASE).
const API_BASE = 'http://localhost:3001';

const unique = Date.now();

const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const minimalState = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 7,
};

test.describe('Username identity', () => {
    test('changing username via Account settings updates the profile and gallery author', async ({ page }) => {
        test.setTimeout(120000);
        page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Initial save' : undefined));

        const oldUsername = `old_handle_${unique}`;
        const newUsername = `new_handle_${unique}`;

        await page.goto('/login');
        await page.getByRole('button', { name: 'Sign Up' }).click();
        await page.locator('label:text-is("Name") + input').fill('Identity Tester');
        await page.locator('label:text-is("Username") + input').fill(oldUsername);
        await page.locator('input[type="email"]').fill(`identity${unique}@test.dev`);
        await page.locator('input[type="password"]').fill('password1234');
        await page.getByRole('button', { name: 'Sign Up' }).click();
        await page.waitForURL('**/app', { timeout: 15000 });

        // Save + publish the default project.
        await page.getByTitle('Cloud').click();
        await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/projects') && res.request().method() === 'POST'),
            page.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        await page.getByTitle('Cloud').click();
        await page.getByRole('button', { name: /publish to gallery/i }).click();
        await page.getByPlaceholder('What is this planner for?').fill(`Identity test planner ${unique}`);
        const [publishRes] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/publish') && res.request().method() === 'POST', { timeout: 60000 }),
            page.getByRole('button', { name: /^publish$/i }).click(),
        ]);
        expect(publishRes.ok()).toBeTruthy();
        await expect(page.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });

        // Gallery card shows the original username.
        await page.goto('/gallery');
        await expect(page.getByText(`by ${oldUsername}`)).toBeVisible({ timeout: 10000 });

        // Old profile works and lists the project.
        await page.goto(`/u/${oldUsername}`);
        await expect(page.getByRole('heading', { name: oldUsername })).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Blank Project')).toBeVisible();

        // Change username via Account settings.
        await page.goto('/account');
        await page.getByPlaceholder('e.g. planner_pro').fill(newUsername);
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Username updated.')).toBeVisible({ timeout: 10000 });

        // Old profile URL now 404s.
        const oldProfileRes = await page.request.get(`${API_BASE}/api/users/${oldUsername}`);
        expect(oldProfileRes.status()).toBe(404);

        // New profile works and lists the project.
        await page.goto(`/u/${newUsername}`);
        await expect(page.getByRole('heading', { name: newUsername })).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Blank Project')).toBeVisible();

        // Gallery card now shows the new username.
        await page.goto('/gallery');
        await expect(page.getByText(`by ${newUsername}`)).toBeVisible({ timeout: 10000 });
    });

    test('a session with no username is redirected to /welcome before it can fork, and continues afterward', async ({ browser }) => {
        test.setTimeout(60000);

        // Upstream project + owner, set up entirely via direct API calls (no UI needed for this side).
        const ownerCtx = await browser.newContext();
        const ownerSignup = await ownerCtx.request.post(`${API_BASE}/api/auth/sign-up/email`, {
            data: { email: `owner${unique}@test.dev`, password: 'password1234', name: 'Owner', username: `owner_${unique}` },
        });
        expect(ownerSignup.ok()).toBeTruthy();
        const createRes = await ownerCtx.request.post(`${API_BASE}/api/projects`, {
            data: { name: 'Upstream For Fork Test', state: minimalState },
        });
        expect(createRes.ok()).toBeTruthy();
        const projectId = (await createRes.json()).project.id;
        const publishRes = await ownerCtx.request.post(`${API_BASE}/api/projects/${projectId}/publish`, {
            data: { description: '', tags: [], thumbnails: [PNG_1X1] },
        });
        expect(publishRes.ok()).toBeTruthy();
        await ownerCtx.close();

        // The actual subject: a session with NO username, created directly via the API --
        // this is exactly what Google OAuth sign-in produces in production (no username ever collected).
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const signupRes = await page.request.post(`${API_BASE}/api/auth/sign-up/email`, {
            data: { email: `nouser${unique}@test.dev`, password: 'password1234', name: 'No Username Person' },
        });
        expect(signupRes.ok()).toBeTruthy();

        await page.goto(`/gallery/${projectId}`);
        await expect(page.getByText('Set a username to fork')).toBeVisible({ timeout: 10000 });
        await page.getByText('Set a username to fork').click();
        await page.waitForURL('**/welcome', { timeout: 10000 });

        await page.getByPlaceholder('e.g. planner_pro').fill(`forker_${unique}`);
        await page.getByRole('button', { name: 'Continue' }).click();

        // Continues on to the original destination (the gallery detail page it came from).
        await page.waitForURL(`**/gallery/${projectId}`, { timeout: 10000 });
        await expect(page.getByRole('button', { name: /fork this project/i })).toBeVisible({ timeout: 10000 });

        await ctx.close();
    });
});
```

- [ ] **Step 3: Run the new and modified E2E specs**

Run: `npx playwright test tests/e2e/username_identity.spec.js tests/e2e/gallery.spec.js tests/e2e/merge_requests.spec.js tests/e2e/fork.spec.js`
Expected: PASS (all specs). This boots the real dev server (`npm run dev`, per `playwright.config.cjs`'s `webServer`) and runs against real Chromium/Firefox/WebKit.

- [ ] **Step 4: Run the complete test suite (unit + e2e) once, end to end**

Run: `npx vitest run && npx playwright test`
Expected: PASS across the board — this is the final regression check before committing.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/username_identity.spec.js tests/e2e/gallery.spec.js tests/e2e/merge_requests.spec.js tests/e2e/fork.spec.js
git commit -m "test(e2e): cover the username-change and no-username-forces-/welcome flows

Also fixes two stale waitForURL('**/analytics') assertions left over
from before the earlier sign-in-redirect fix (LoginPage now defaults
to /app) -- unrelated to this feature, found while in the area."
```

---

## Post-plan verification checklist

After Task 9, before considering this done:

- [ ] `npx vitest run` — full unit suite (server + client) passes.
- [ ] `npx tsc --noEmit` — no type errors.
- [ ] `npx playwright test` — full e2e suite passes.
- [ ] Manually sign in with a fresh account, click "My profile" — lands on your own `/u/<username>` page (not "User not found").
- [ ] Manually publish a project — its gallery card shows your username.
- [ ] Manually visit `/account` and change your username — gallery/profile reflect the new one immediately.
