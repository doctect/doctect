# Signup Cap and Waitlist Design

**Date:** 2026-07-19
**Status:** Approved

## Objective

Cap the number of accounts at a configurable limit (default 500) ahead of a public launch. Once the cap is reached, new signups are refused everywhere an account can be created, and the login page's Sign Up view is replaced by a waitlist panel that collects an email address. Existing users sign in unaffected; anonymous use of the editor and gallery is unaffected. The owner reviews collected waitlist emails on the admin dashboard.

## Goals

- Enforce one account cap across both account-creation paths: email/password signup and first-time Google sign-in.
- Count only **verified** accounts toward the cap (`"emailVerified" = TRUE`). Google accounts arrive verified and count immediately.
- Make the cap configurable via a `SIGNUP_CAP` environment variable, defaulting to 500.
- Expose a public `GET /api/signup-status` endpoint so the client can render the correct signup UI.
- Collect waitlist emails in a new `waitlist` table via a public `POST /api/waitlist` endpoint that only accepts entries while signups are closed.
- List waitlist entries (email, date, count) on the admin dashboard behind the existing `requireAdmin` guard.
- Keep sign-in, password reset, email verification of existing accounts, and all anonymous flows untouched.

## Non-Goals

- Automatic invitations or notification emails when slots free up. The admin list is read-only; acting on it is manual.
- Blocking email verification of accounts created while under the cap (see Accepted Limitations).
- Deleting or pruning unverified accounts.
- Waitlist entry management UI (delete/export). Direct database access covers this.
- Any change to anonymous editor/gallery functionality.

## Chosen Architecture

Enforce the cap in a better-auth `databaseHooks.user.create.before` hook. This hook runs immediately before **any** user row is inserted — email/password signup and first-time Google OAuth sign-in both pass through it — so it is the single choke point where enforcement cannot miss a path. When the cap is reached the hook throws `APIError("FORBIDDEN", { message, code: "SIGNUP_CAP_REACHED" })`, following the existing typed-error-code pattern (`USERNAME_REQUIRED`, `PASSWORD_POLICY`). Returning Google users sign in without creating a row, so the hook never fires for them.

Rejected alternatives:

1. **Path-based check in the existing `hooks.before` middleware** — social sign-in and social sign-up share the same request path, so distinguishing a new user from a returning one would duplicate better-auth's own account lookup. Fragile against future auth paths.
2. **Express middleware in front of `/api/auth/sign-up*`** — same OAuth blind spot, and it sits outside better-auth where it can drift from what actually creates user rows.

## Components

### `server/signupCap.js` (new)

- `getSignupCap()` — reads `SIGNUP_CAP` once per call. Unset, non-numeric, or negative values fall back to 500. `SIGNUP_CAP=0` is valid and means signups are closed.
- `isSignupOpen()` — `SELECT COUNT(*) FROM "user" WHERE "emailVerified" = TRUE`, compared against the cap. Runs identically on Postgres and SQLite.

### `server/auth.js` (modified)

Add a `user.create.before` databaseHook beside the existing `user.create.after` hook:

- Cap reached → throw `APIError("FORBIDDEN", { message: "Signups are temporarily closed — the free account limit has been reached. You can join the waitlist or keep using the app without an account.", code: "SIGNUP_CAP_REACHED" })`.
- If the count query itself throws, **fail open**: log the error and allow the signup. A broken counter must not lock the door; this matches the email module's fail-safe philosophy.

### Migration `015_waitlist` (new, appended to `server/migrations/index.js`)

```sql
CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMP NOT NULL
)
```

Same DDL on both databases, additive only. `id` is an app-generated UUID; `createdAt` is an app-generated millisecond-precision timestamp (same reasoning as commits — SQLite's `CURRENT_TIMESTAMP` has whole-second resolution).

### Public endpoints (added to `server/routes/me.js` — no new route file, per house convention)

- `GET /api/signup-status` → `{ open: boolean }`. Public, unauthenticated. Deliberately does not expose the account count or the cap value.
- `POST /api/waitlist` with body `{ email }`:
  - While signups are **open** → `409 { error, code: "SIGNUPS_OPEN" }`. Prevents the table from becoming a general-purpose email collector.
  - Invalid email format (server-side check, lowercased before storing) → `400`.
  - Valid email → insert; a duplicate email is treated as success without a second insert (idempotent, and does not reveal whether an address was already on the list). Response `{ ok: true }` in both cases.
  - Covered by the existing global rate limiter; no bespoke limiting.

### Admin endpoint (added to `server/routes/adminModeration.js`, which already owns account-related admin routes)

- `GET /api/admin/waitlist` behind `requireAdmin` → `{ count, entries: [{ email, createdAt }] }`, newest first.

### `services/cloudApi.ts` (modified)

Typed methods `getSignupStatus()`, `joinWaitlist(email)`, `getAdminWaitlist()`, following the existing wrapper patterns in that file.

### `pages/LoginPage.tsx` (modified)

- On mount, fetch signup status. While the fetch is pending or if it fails, assume signups are open — the server still enforces the cap, and failing toward the normal form never strands a legitimate user.
- Signups closed and the user is on the Sign Up view → render a waitlist panel in place of the signup form: a short message ("Free accounts are full — we cap accounts at launch. Leave your email and we'll let you know when spots open. You can keep using the editor and gallery without an account."), an email input, a Join button, and success/error states. The Sign In view is untouched.
- An email-signup submission that comes back with error code `SIGNUP_CAP_REACHED` (cap filled between page load and submit) switches the view to the same waitlist panel instead of showing a bare error string.
- The Google button remains visible in the Sign In view (existing Google users must still sign in). A **new** Google user hitting the cap is rejected server-side by the hook; better-auth surfaces hook errors on the OAuth path as an error query parameter on the redirect back to the app. The login page reads that parameter and shows the waitlist panel with the closed-signups message. The exact parameter name and value must be verified against real better-auth behavior as an implementation spike before the client code is written, not assumed.

### `pages/AdminModerationPage.tsx` (modified)

A read-only "Waitlist" section: entry count plus a table of emails and join dates. No actions.

## Data Flow

1. Visitor opens `/login` → client fetches `/api/signup-status`.
2. **Open:** signup form renders and works exactly as today. The hook re-checks at submission time, so a cap filled between page load and submit is still enforced (the form surfaces the `SIGNUP_CAP_REACHED` error message and the client switches to the waitlist panel when it sees that code).
3. **Closed:** Sign Up view shows the waitlist panel → `POST /api/waitlist` → confirmation message.
4. New Google user while closed: OAuth completes at Google, better-auth attempts user creation, hook throws, user lands back on the login page with an error parameter → waitlist panel.

## Accepted Limitations

- **Verified-only counting allows overshoot.** Accounts created while under the cap may verify after it fills and push the verified count past the cap. Blocking verification would strand people who signed up legitimately; accepted by design.
- **No transaction around check-then-insert.** Two simultaneous signups at 499 verified accounts can both pass the check, landing at 501. The cap is load protection, not a compliance boundary; same reasoning as the documented merge-endpoint limitation.
- **Fail-open on counter errors.** A database failure inside the cap check admits signups rather than refusing them. Deliberate.

## Testing

House style: test-first, supertest against a real SQLite-backed server via the existing app factory and helpers.

- **Cap enforcement:** signup succeeds under cap; blocked at cap with status 403 and code `SIGNUP_CAP_REACHED`; unverified rows do not consume slots (create N unverified + cap-1 verified → signup still succeeds); `SIGNUP_CAP=0` closes signups; unset/garbage env falls back to 500.
- **Signup status:** reflects open and closed states.
- **Waitlist endpoint:** valid email stored lowercased; duplicate email idempotent success with one row; invalid email 400; signups-open 409.
- **Admin endpoint:** admin sees count and entries newest-first; non-admin 403; unauthenticated 401/403 per existing guard behavior.
- **Client unit tests:** waitlist panel renders when status is closed; join flow success and error states; Sign In view unaffected; status-fetch failure falls back to the signup form.
- **Real-browser verification (mandatory final task):** run with a low `SIGNUP_CAP`, verify in a live browser: signup blocked at cap, waitlist join works, existing account still signs in, new Google user is turned away to the waitlist panel (or, if a second Google account is impractical, verify the error-parameter handling path with the spike's findings), and the admin page lists the entry.
