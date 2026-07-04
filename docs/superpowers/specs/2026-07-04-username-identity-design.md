# Public Username Identity Fixes — Design

**Status:** Approved (interactive brainstorming, 2026-07-04)

## Context

User-reported bugs, filed after first real use of the gallery/fork/merge-request feature (`docs/superpowers/plans/2026-07-02-gallery-fork-merge-requests.md`):

1. Clicking "My profile" after signing in leads to a "User not found" page.
2. A published gallery project doesn't show the username of the person who published it.
3. There's no way to use a pseudonym instead of your real name.

### Root cause (confirmed via reproduction test against a real server + SQLite)

All three trace back to one gap: an account can exist with `username = NULL`, and the app has **no way to set or change a username after sign-up**. This is guaranteed to happen for:

- Anyone who signs in with **"Sign in with Google"** — the social OAuth path never collects a username (only the custom email/password signup form in `LoginPage.tsx` asks for one).
- Any account created before the username plugin existed (this app had accounts — a hidden admin analytics dashboard — before the gallery feature added usernames; the migration that added the `username` column never backfilled existing rows).

Reproduced end-to-end with a throwaway test hitting the real (SQLite-backed) app:

| Step | Result |
|---|---|
| Sign up with no username (what Google OAuth produces) | `user.username: null` — allowed, server never requires it |
| `AccountMenu.tsx`: `session.user.username \|\| session.user.name` | Falls back to real name → builds link `/u/Real Full Name` |
| Visit that link → `GET /api/users/Real Full Name` | **404 "User not found"** → issue 1 |
| Publish a project as that user → `GET /api/gallery` | `"author": null` → gallery card renders "by " (blank) → issue 2 |
| Try to fix it | No account-settings endpoint or UI exists anywhere → issue 3 |

Because `GET /api/gallery`, `GET /api/users/:username`, and the merge-request author lookup all join the **current** `username` live off the `user` table (never a denormalized copy), no data backfill/migration is needed — once every acting user has a username, past and future reads all resolve correctly with no historical patch-up required.

### A note on "real name" vs. username

Nothing in the app currently renders `user.name` (the required "Name" field from signup) publicly *except* `AccountMenu`'s buggy fallback being fixed here. The public identity is already meant to be the separate `username` field — issue 3 isn't a request for a new concept, it's the missing ability to ever set/change that field once you have an account (or to get one at all via Google sign-in).

## Approach

**Chosen: centralized guard, enforced on both client and server, with dedicated onboarding/settings pages.** Two alternatives considered and rejected:

- *Auto-assign a random default username at account creation* (e.g. `user_x7f2a`) — rejected; contradicts the explicit decision (below) to force a deliberate choice rather than silently paper over it.
- *Client-side-only gating* — rejected; trivially bypassed with a direct API call, and inconsistent with this codebase's existing defense-in-depth posture (`checkOrigin`, `validateAppState`, rate limits are all enforced server-side even though the client also checks each of them).

### Decisions locked in during brainstorming

- **Enforcement is immediate and blocking**, not a dismissible nudge or lazy/just-in-time prompt.
- **Scope of enforcement:** any cloud/gallery action (not only the ones that literally display a username) — Save to cloud, Publish, Fork, and Propose changes (open MR) are all gated, in addition to viewing your own profile. Plain local editing while signed in is never affected.
- **Presentation:** a dedicated route, `/welcome`, reusing the existing `from`-redirect pattern already established for `/login` (see `App.tsx`'s `AuthGuard` and `LoginPage.tsx`) — not a modal.
- **Ongoing changes:** a new `/account` settings page lets a signed-in user change their username at any time afterward, not just once.

### Discovered implementation quirk (affects the design below)

Calling better-auth's generic `/api/auth/update-user` with a username already taken by someone else does **not** return the library's own clean `USERNAME_IS_ALREADY_TAKEN` error — it throws an unhandled SQLite unique-constraint violation (500). Confirmed with a reproduction test. The username plugin's own pre-write duplicate check appears to rely on session context that isn't populated yet when that particular hook runs for `/update-user` (it works fine for `/sign-up/email`, where the equivalent check doesn't depend on session at all). This is an upstream (`better-auth`) rough edge, not something to patch inside that dependency — the pragmatic workaround (consistent with how this codebase already handled an unrelated upstream `pdfjs-dist` bug by pinning/working around it rather than patching the library) is: the UI must pre-check availability via the separate, already-working `/api/auth/is-username-available` endpoint before ever submitting, rather than relying on a clean error after the fact. A residual TOCTOU race (two people submit the same free username in the same instant) is treated the same way this codebase already documents an analogous, accepted race in the merge endpoint (`docs/8-cloud-and-gallery.md`, "Known Limitations") — theoretically possible, self-correcting (the loser just tries another username), not worth a transaction for.

## Server-side design

New middleware in `server/middleware/guards.js`, used **after** `requireAuth`:

```js
export const requireUsername = (req, res, next) => {
    if (!req.user?.username) {
        return res.status(403).json({ error: 'Set a public username before using cloud/gallery features.', code: 'USERNAME_REQUIRED' });
    }
    next();
};
```

Applied to exactly the routes that create or attach new content to the cloud/gallery system as the acting user:

| Route | File |
|---|---|
| `POST /api/projects` (first cloud save) | `server/routes/projects.js` |
| `POST /api/projects/:id/commits` (subsequent saves) | `server/routes/projects.js` |
| `POST /api/projects/:id/publish` | `server/routes/projects.js` |
| `POST /api/projects/:id/fork` | `server/routes/projects.js` |
| `POST /api/merge-requests` (open MR) | `server/routes/mergeRequests.js` |

**Deliberately left ungated:** `PATCH`/`DELETE /api/projects/:id`, `unpublish`, `merge`, `close`. These only reduce exposure or act on something the caller already got past the gate to create — gating them would risk trapping a (possible, if rare) legacy no-username owner from deleting/unpublishing their own data, which is a hostile dead end rather than a safety measure.

No new endpoint is needed for setting/changing the username itself — better-auth's existing generic `/api/auth/update-user` and `/api/auth/is-username-available` (already reachable, since `server/app.js` mounts the whole auth handler at `/api/auth`) already do this, including the plugin's own format/length validation and normalization.

`ApiError` in `services/cloudApi.ts` gets a new optional `code` field parsed from the JSON error body, so client call sites can reliably branch on `e.code === 'USERNAME_REQUIRED'` instead of string-matching a message.

## Client-side design

**New shared component:** `components/UsernameForm.tsx` — used by both new pages below.

- Text input, same format validation already used at signup (`^[a-zA-Z0-9_]{3,30}$`).
- Debounced availability check via `authClient.isUsernameAvailable({ username })` as the user types; shows an inline available/taken indicator and disables submit while known-taken.
- On submit: calls `authClient.updateUser({ username })` — deliberately *not* also passing `displayUsername`; the username plugin's own `/update-user` hook already mirrors `username` into `displayUsername` whenever the latter is omitted, preserving the case the user typed (confirmed via reproduction test) — surfaces `onError` messages, and a generic fallback message ("That username may already be taken, or something went wrong — try another.") if the call fails for any reason not already caught by the availability check (covers the TOCTOU race from the quirk above). Calls an `onSuccess` prop on success.
- Static copy under the input: *"This is shown publicly on the gallery. It doesn't have to be your real name, and you can change it any time in Account settings."* — directly resolves the "no pseudonym" concern in-product.

**New page `pages/WelcomePage.tsx`, route `/welcome`:**
- Same `AuthGuard` used by `/analytics` today (redirects to `/login` with `state.from` if not signed in).
- If the session already has a username, immediately continues onward (see below) rather than showing the form — this page never "sticks" once satisfied.
- Renders `UsernameForm`; on success, `navigate(location.state?.from ?? '/gallery', { replace: true })`.

**New page `pages/AccountSettingsPage.tsx`, route `/account`:**
- Same `AuthGuard`.
- Shows the current `displayUsername` and email for context, plus the same `UsernameForm` pre-filled with the current username. No forced redirect on success — just a small confirmation.

**`components/AccountMenu.tsx`:**
- Remove the `|| session.user.name` fallback entirely.
- Button label shows the username if set, else "Set username".
- "My profile" links to `/u/${username}` if set; if not, links to `/welcome` with `state:{ from: location.pathname }`.
- New "Account settings" item linking to `/account`.

**`components/cloud/CloudMenu.tsx`:**
- The existing `!session?.user ? (sign-in link) : (full menu)` becomes a 3-way branch: signed out → unchanged; signed in without a username → a single link "Set a username to use cloud features" to `/welcome` (`state:{from: location.pathname}`); signed in with a username → today's full menu. This one change covers Save to cloud, Publish, and Propose changes together since they all live inside this same dropdown.

**`pages/GalleryDetailPage.tsx`:**
- The existing `session?.user ? (Fork button) : (Sign in to fork link)` gets the same 3-way branch around the Fork button.

**`App.tsx`:** register `/welcome` and `/account`, both wrapped in the existing `AuthGuard`.

## Unrelated cleanup bundled into this work

`tests/e2e/gallery.spec.js` and `tests/e2e/merge_requests.spec.js` still assert `waitForURL('**/analytics')` immediately after sign-up — stale from before the earlier "sign-in redirect" follow-up fix (current `LoginPage.tsx` defaults to `/app`). Update those 2–3 assertions to `**/app` while in the area. Not otherwise related to the username work.

## Testing approach

**Server** (vitest + supertest, following existing `tests/unit/server/*.test.js` conventions):
- `requireUsername`: each of the 5 gated routes returns `403 { code: 'USERNAME_REQUIRED' }` for a username-less session, and succeeds once `/api/auth/update-user` sets one.
- `/api/auth/is-username-available` correctly reports taken vs. free (already manually verified during investigation; commit it as a real test).

**Client** (vitest + testing-library, following the existing `tests/unit/loginRedirect.test.tsx` pattern — mock `lib/auth-client`, render with `MemoryRouter`):
- `AccountMenu` across all 3 session states (signed out / signed in no username / signed in with username).
- `CloudMenu`'s 3-way branch.
- `GalleryDetailPage`'s Fork-button 3-way branch.
- `WelcomePage`: auto-continues when a username already exists; on submit success, navigates to `state.from ?? '/gallery'`.
- `AccountSettingsPage`: pre-fills current username; success doesn't force-navigate away.
- `UsernameForm`: format validation, availability indicator, blocked submit while known-taken, graceful fallback message on a failed submit.

**E2E** (Playwright, following `tests/e2e/fork.spec.js` conventions — real browser, real server):
1. Sign up → publish a project → confirm the gallery card shows the username → go to `/account` → change the username → confirm the *old* `/u/<old>` now 404s, the *new* `/u/<new>` works and lists the project, and the gallery card now shows the new name. Proves issues 1, 2, and 3 fixed together, in a real browser.
2. Create a session with **no** username via a direct `page.request.post` call to the sign-up API (simulating what Google OAuth produces; reuses the cookie-sharing trick already used elsewhere in this suite) → visit `/gallery` → attempt to fork a public project → confirm redirect to `/welcome` → submit a username → confirm it continues on to complete the fork.

## Files touched (summary)

- `server/middleware/guards.js` — new `requireUsername`.
- `server/routes/projects.js`, `server/routes/mergeRequests.js` — apply `requireUsername` to the 5 routes listed above.
- `services/cloudApi.ts` — `ApiError` gains `code`.
- `components/UsernameForm.tsx` — new.
- `pages/WelcomePage.tsx`, `pages/AccountSettingsPage.tsx` — new.
- `components/AccountMenu.tsx`, `components/cloud/CloudMenu.tsx`, `pages/GalleryDetailPage.tsx` — gating/link fixes.
- `App.tsx` — new routes.
- `tests/unit/server/` — new/extended tests for `requireUsername` and username availability.
- `tests/unit/` — new tests for `AccountMenu`, `CloudMenu`, `GalleryDetailPage`, `WelcomePage`, `AccountSettingsPage`, `UsernameForm`.
- `tests/e2e/` — two new/extended scenarios; stale `/analytics` assertions fixed in `gallery.spec.js` and `merge_requests.spec.js`.
