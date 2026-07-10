# Shared Header Nav + Merge-Request UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared header across non-editor pages, a fixed landing-page account dropdown, status guidance on the merge-request page, and an owner email when a merge request is created.

**Architecture:** New `components/AppHeader.tsx` adopted by 8 pages (replacing their ad-hoc `<header>` bars); a one-class z-index fix on the landing nav; copy-only additions to `MergeRequestPage`; a fire-and-forget `sendEmail` call in the existing MR-create route.

**Tech Stack:** React 19 + react-router 6, vitest + @testing-library/react, supertest, `server/email.js` (Resend/console fallback, `setSendEmailImpl` injection).

**Spec:** `docs/superpowers/specs/2026-07-10-nav-and-mr-ux-design.md`

## Global Constraints

- Work on branch `fix/nav-and-mr-ux` (create from main: `git checkout -b fix/nav-and-mr-ux`).
- Non-adopters stay untouched: `LandingPage` (except the nav z-index class), `EditorPage`/editor toolbar, `LoginPage`, `AnalyticsDashboard`, and the gallery overlay modal (`components/gallery/GalleryDetailModal.tsx`).
- Email failures must never change the MR-create response (fire-and-forget, `.catch` + `console.error`).
- No email when the MR author IS the target project owner.
- Run single test files with `npx vitest run <path>`; full suite `npm test`. Server test files need `// @vitest-environment node` at the top.

---

### Task 1: `AppHeader` component + landing z-index fix

**Files:**
- Create: `components/AppHeader.tsx`
- Modify: `pages/LandingPage.tsx:28` (nav z class only)
- Test: `tests/unit/appHeader.test.tsx`

**Interfaces:**
- Produces: `<AppHeader />` (no props) — sticky top bar with logo→`/`, links Editor→`/app`, Gallery→`/gallery`, Docs→`/docs`, and `<AccountMenu />`. Later tasks import it from `../components/AppHeader`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/appHeader.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';

vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(), authClient: {},
}));

describe('AppHeader', () => {
    const renderHeader = () => render(<MemoryRouter><AppHeader /></MemoryRouter>);

    it('renders logo link home and the three section links', () => {
        renderHeader();
        expect(screen.getByRole('link', { name: /pdf architect/i })).toHaveProperty('pathname', '/');
        expect(screen.getByRole('link', { name: /^editor$/i })).toHaveProperty('pathname', '/app');
        expect(screen.getByRole('link', { name: /^gallery$/i })).toHaveProperty('pathname', '/gallery');
        expect(screen.getByRole('link', { name: /^docs$/i })).toHaveProperty('pathname', '/docs');
    });

    it('renders the account menu (signed-out state shows Sign in)', () => {
        renderHeader();
        expect(screen.getByText(/sign in/i)).toBeTruthy();
    });
});
```

(If `AccountMenu`'s signed-out control isn't literally "Sign in", read `components/AccountMenu.tsx` and adjust that one assertion — presence of the menu is the contract.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/appHeader.test.tsx`
Expected: FAIL — cannot resolve `../../components/AppHeader`

- [ ] **Step 3: Implement `components/AppHeader.tsx`**

```tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Layers } from 'lucide-react';
import clsx from 'clsx';
import { AccountMenu } from './AccountMenu';

const NavLink: React.FC<{ to: string; label: string }> = ({ to, label }) => {
    const { pathname } = useLocation();
    const active = to === '/app' ? pathname.startsWith('/app') : pathname.startsWith(to);
    return (
        <Link
            to={to}
            className={clsx(
                'text-sm font-medium transition-colors',
                active ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'
            )}
        >
            {label}
        </Link>
    );
};

/**
 * Shared top bar for all non-editor pages. Sticky + z-50 so the AccountMenu
 * dropdown can never be occluded by page content (the landing page's hero
 * once painted over it — see 2026-07-10 spec §2).
 */
export const AppHeader: React.FC = () => (
    <header className="h-14 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Layers size={16} />
            </div>
            <span>PDF Architect</span>
        </Link>
        <div className="flex items-center gap-5">
            <NavLink to="/app" label="Editor" />
            <NavLink to="/gallery" label="Gallery" />
            <NavLink to="/docs" label="Docs" />
            <AccountMenu />
        </div>
    </header>
);
```

- [ ] **Step 4: Fix the landing nav stacking**

In `pages/LandingPage.tsx` line 28, change the nav's `relative z-10` to `relative z-20`:

```tsx
<nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
```

Add a regression test to the same test file:

```tsx
describe('landing nav stacking', () => {
    it('keeps the nav above the hero so the account dropdown is clickable', async () => {
        const { LandingPage } = await import('../../pages/LandingPage');
        const { container } = render(<MemoryRouter><LandingPage /></MemoryRouter>);
        const nav = container.querySelector('nav')!;
        const main = container.querySelector('main')!;
        // Both are positioned siblings; the nav (which hosts the dropdown's
        // stacking context) must have the strictly higher z-index.
        const zOf = (el: Element) => parseInt((el.className.match(/z-(\d+)/) || [])[1] ?? '0', 10);
        expect(zOf(nav)).toBeGreaterThan(zOf(main));
    });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/appHeader.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add components/AppHeader.tsx pages/LandingPage.tsx tests/unit/appHeader.test.tsx
git commit -m "feat(nav): shared AppHeader component; fix landing dropdown stacking"
```

---

### Task 2: Adopt `AppHeader` across the eight pages

**Files:**
- Modify: `pages/DocsPage.tsx` (replace its custom `<header>` block), `pages/GalleryPage.tsx:106-127`, `pages/GalleryDetailPage.tsx:18-22`, `pages/ProfilePage.tsx:25-29`, `pages/MyProjectsPage.tsx:47-49`, `pages/AccountSettingsPage.tsx:121-123`, `pages/MergeRequestPage.tsx:95-101`, `pages/WelcomePage.tsx` (no header today — add one above its content)
- Test: `tests/unit/appHeaderAdoption.test.tsx`

**Interfaces:**
- Consumes: `AppHeader` from Task 1.

Rules for every page:
- Replace the existing `<header>…</header>` block with `<AppHeader />`; delete now-unused imports (`AccountMenu`, icons) from the page.
- KEEP page-specific content that lived inside old headers by moving it to the top of the page body (e.g. `GalleryPage`'s search box/controls; `MergeRequestPage`'s back-to-project `GalleryLink`). Read each page before editing; preserve behavior, only relocate.
- `DocsPage`: its fixed header is also its sidebar's offset anchor (`pt-16`, `top-16`); AppHeader is `h-14` sticky — adjust those offsets (`pt-14`/`top-14`) so the sidebar still aligns. Drop the "Go to App →" button (Editor link covers it).
- `GalleryDetailPage` only in its standalone page form — `components/gallery/GalleryDetailModal.tsx` untouched.
- Existing page tests (`GalleryPage.test.tsx`, `GalleryDetailPage.test.tsx`, `ProfilePage.test.tsx`, `MyProjectsPage.test.tsx`, `AccountSettingsPage.test.tsx`, `MergeRequestPage.test.tsx`, `WelcomePage.test.tsx`) must stay green — if one asserts on old header markup, update that assertion to the new header, never weaken behavioral assertions.

- [ ] **Step 1: Write the failing adoption test**

```tsx
// tests/unit/appHeaderAdoption.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(),
    authClient: { listAccounts: vi.fn(async () => ({ data: [], error: null })) },
}));
vi.mock('../../services/cloudApi', async (importOriginal) => {
    const mod: any = await importOriginal();
    return { ...mod, galleryList: vi.fn(async () => ({ items: [], total: 0 })), galleryTags: vi.fn(async () => ({ tags: [] })) };
});

// Representative subset per spec: gallery, docs, merge-request page.
describe('AppHeader adoption', () => {
    it('GalleryPage renders the shared header', async () => {
        const { GalleryPage } = await import('../../pages/GalleryPage');
        render(<MemoryRouter><GalleryPage /></MemoryRouter>);
        await waitFor(() => expect(screen.getByRole('link', { name: /^docs$/i })).toBeTruthy());
        expect(screen.getByRole('link', { name: /^editor$/i })).toBeTruthy();
    });

    it('DocsPage renders the shared header', async () => {
        const { DocsPage } = await import('../../pages/DocsPage');
        render(<MemoryRouter><DocsPage /></MemoryRouter>);
        expect(screen.getByRole('link', { name: /^gallery$/i })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^editor$/i })).toBeTruthy();
    });
});
```

(Adjust the `cloudApi` mock to the real exported names used by `GalleryPage` — read the page's imports first. The MR page is covered in Task 3's tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/appHeaderAdoption.test.tsx`
Expected: FAIL — no "Editor"/"Docs" links on those pages yet

- [ ] **Step 3: Adopt page by page**

For each of the eight pages: import `{ AppHeader } from '../components/AppHeader'`, replace the `<header>` block per the rules above. After each page, run its existing test file if it has one.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run tests/unit`
Expected: all pass (update any old-header assertions per the rules; document each in the commit body)

- [ ] **Step 5: Commit**

```bash
git add pages/ components/ tests/unit/appHeaderAdoption.test.tsx tests/unit/
git commit -m "feat(nav): adopt shared AppHeader on all non-editor pages"
```

---

### Task 3: Merge-request page status guidance

**Files:**
- Modify: `pages/MergeRequestPage.tsx` (below the title row; page is 161 lines)
- Test: `tests/unit/mergeRequestGuidance.test.tsx`

**Interfaces:**
- Consumes: the page's loaded MR payload — it already has `mr.status` and `isTargetOwner` from the server response (check the page's existing state variable names before writing).

Copy table (exact strings, spec §3):

| status | isTargetOwner | text |
|--------|--------------|------|
| open | false | Waiting for the project owner to review this merge request. |
| open | true | You own the target project — review the changes below, then merge or close. |
| conflicted | any | The target project has changed since this was proposed — it can't be merged as-is. Update your fork and propose the changes again. |
| merged | any | This merge request was merged into the target project. |
| closed | any | This merge request was closed without merging. |

- [ ] **Step 1: Write the failing test** — mirror `tests/unit/MergeRequestPage.test.tsx`'s existing fetch/api mocking pattern (read it first); one `it` per table row asserting the exact copy renders (`screen.getByText(/waiting for the project owner/i)` etc.).

- [ ] **Step 2: Run to verify it fails** (5 cases, all missing copy)

- [ ] **Step 3: Implement** — a small `statusGuidance(status, isTargetOwner)` helper in the page file returning the string, rendered as a muted sentence under the title/status row:

```tsx
const statusGuidance = (status: string, isTargetOwner: boolean): string | null => {
    switch (status) {
        case 'open':
            return isTargetOwner
                ? 'You own the target project — review the changes below, then merge or close.'
                : 'Waiting for the project owner to review this merge request.';
        case 'conflicted':
            return "The target project has changed since this was proposed — it can't be merged as-is. Update your fork and propose the changes again.";
        case 'merged':
            return 'This merge request was merged into the target project.';
        case 'closed':
            return 'This merge request was closed without merging.';
        default:
            return null;
    }
};
```

```tsx
{guidance && <p className="text-sm text-slate-500 mt-1">{guidance}</p>}
```

- [ ] **Step 4: Run new test + existing MergeRequestPage tests**

Run: `npx vitest run tests/unit/mergeRequestGuidance.test.tsx tests/unit/MergeRequestPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/MergeRequestPage.tsx tests/unit/mergeRequestGuidance.test.tsx
git commit -m "feat(mr): status- and role-aware guidance on the merge request page"
```

---

### Task 4: Owner email on merge-request creation

**Files:**
- Modify: `server/routes/mergeRequests.js` (create route, after the INSERT at ~line 100)
- Test: `tests/unit/server/mrNotification.test.js`

**Interfaces:**
- Consumes: `sendEmail` from `server/email.js`; `target.owner_id`, `req.user` (id + username) already in scope in the route; `query` for the owner-email lookup.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/mrNotification.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';
import { setSendEmailImpl } from '../../../server/email.js';

let app;
const sent = [];

beforeAll(async () => {
    setSendEmailImpl(async (msg) => { sent.push(msg); return { id: `t-${sent.length}` }; });
    app = await initTestApp();
});
afterAll(() => setSendEmailImpl(null));

// Builds the standard publish -> fork -> save -> propose chain. Mirror the
// exact request sequence used by tests/unit/server/mergeRequests.test.js
// (read it first) — only the assertions below are new.
const createMrBetween = async (ownerEmail, authorEmail) => {
    // ... owner signs up, creates + publishes a project;
    // ... author signs up, forks it, saves a change, POSTs /api/merge-requests
    // Return the create response.
};

describe('merge request owner notification', () => {
    it('emails the target owner with a link to the MR', async () => {
        sent.length = 0;
        const res = await createMrBetween('owner@test.dev', 'author@test.dev');
        expect(res.status).toBe(201);
        // fire-and-forget: allow the microtask to flush
        await new Promise(r => setTimeout(r, 50));
        const msg = sent.find(m => m.to === 'owner@test.dev');
        expect(msg).toBeTruthy();
        expect(msg.subject).toMatch(/new merge request/i);
        expect(msg.text || msg.html).toContain(`/mr/${res.body.mergeRequest.id}`);
    });

    it('sends nothing for a self-MR (author owns the target)', async () => {
        sent.length = 0;
        const res = await createMrBetween('selfowner@test.dev', 'selfowner@test.dev'); // same account forks own project
        expect(res.status).toBe(201);
        await new Promise(r => setTimeout(r, 50));
        expect(sent.filter(m => m.to === 'selfowner@test.dev' && /merge request/i.test(m.subject))).toHaveLength(0);
    });

    it('a failing email send does not change the create response', async () => {
        setSendEmailImpl(async () => { throw new Error('smtp down'); });
        const res = await createMrBetween('owner2@test.dev', 'author2@test.dev');
        expect(res.status).toBe(201);
        setSendEmailImpl(async (msg) => { sent.push(msg); return { id: 'x' }; });
    });
});
```

Fill `createMrBetween` from the existing `mergeRequests.test.js` helper flow — copy its sequence, do not import from the spec file.

- [ ] **Step 2: Run to verify it fails** (no email captured)

- [ ] **Step 3: Implement** in the create route, immediately after the INSERT (before or after the `res.status(201)` line — send must not block or affect the response):

```js
// Notify the target project's owner — fire-and-forget: a delivery failure
// must never fail MR creation. Skipped for self-MRs (fork of your own project).
if (target.owner_id !== req.user.id) {
    (async () => {
        const ownerRows = await query('SELECT email FROM "user" WHERE id = $1', [target.owner_id]);
        const ownerEmail = ownerRows.rows?.[0]?.email ?? ownerRows[0]?.email;
        if (!ownerEmail) return;
        const mrUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/mr/${mr.id}`;
        await sendEmail({
            to: ownerEmail,
            subject: `New merge request for "${target.name}"`,
            html: `<p><strong>${req.user.username}</strong> proposed changes to your project "${target.name}".</p><p><a href="${mrUrl}">Review the merge request</a></p>`,
            text: `${req.user.username} proposed changes to your project "${target.name}". Review: ${mrUrl}`,
        });
    })().catch(err => console.error('[mr] owner notification failed:', err));
}
```

Adjust the `query` result shape (`.rows` vs array) to what `server/db.js` actually returns — check another usage in the same file. Import `sendEmail` at the top. Confirm the target project row's name field (`target.name` vs `target.title`) from `getProjectRow` usage.

- [ ] **Step 4: Run new test + existing MR server tests**

Run: `npx vitest run tests/unit/server/mrNotification.test.js tests/unit/server/mergeRequests.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/mergeRequests.js tests/unit/server/mrNotification.test.js
git commit -m "feat(mr): email the target owner when a merge request is created"
```

---

### Task 5: Real-browser verification (mandatory, not committed)

- [ ] **Step 1:** Start vite (`npx vite --port 5199 --strictPort`, `VITE_API_URL=http://localhost:3001/api/auth`) + API with a throwaway SQLite DB and no RESEND_API_KEY (console fallback), `TRUSTED_ORIGINS=http://localhost:5199 CLIENT_URL=http://localhost:5199`.
- [ ] **Step 2 (dropdown):** on `/` signed in (create a user + verify via the console link), open the account dropdown, click the LAST item (Sign out) — must work. Screenshot the open dropdown.
- [ ] **Step 3 (nav):** from `/gallery` click Docs → `/docs`; click Editor → `/app`; from a merge-request page confirm the header exists and leads out (no soft-lock).
- [ ] **Step 4 (MR flow):** two users, publish → fork → change → propose; author sees "Waiting for the project owner…"; owner sees "You own the target project…"; server console logs the owner-notification email with the `/mr/<id>` link.
- [ ] **Step 5:** report per-step pass/fail with evidence; fix real bugs test-first; kill servers.

---

## Self-review notes

- Spec coverage: AppHeader + z-fix (T1), 8 adopters incl. offsets/relocation rules + non-adopter list in constraints (T2), guidance copy table verbatim (T3), owner email with self-MR skip + failure isolation (T4), browser pass incl. the original two complaints (T5).
- T4's test scaffold intentionally references the existing mergeRequests.test.js flow rather than duplicating 60 lines of setup — the implementer copies the sequence in-place (never imports from a `*.test.js`).
- Names consistent: `AppHeader`, `sendEmail`, `setSendEmailImpl`, `statusGuidance`.
