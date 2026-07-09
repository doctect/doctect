# Email Verification for Email/Password Signups — Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation planning

## Problem

Email/password signup (better-auth `emailAndPassword`) creates a fully usable account without
ever confirming the address exists or belongs to the person registering. Fake or mistyped
emails get working accounts that consume auth rows, cloud storage quota, and gallery
identity. Google sign-in is unaffected — Google only issues verified addresses.

## Chosen solution

Use better-auth's built-in **verification-link** flow, delivered through **Resend**:

- `emailAndPassword.requireEmailVerification: true` — sign-in with an unverified email is
  refused (403, `EMAIL_NOT_VERIFIED`) and better-auth auto-sends a fresh verification email.
- `emailVerification`: `sendOnSignUp: true` (signup immediately sends the link),
  `autoSignInAfterVerification: true` (clicking the link both verifies and signs in),
  `expiresIn: 3600` (1-hour links).
- Verification proves mailbox ownership by construction; undeliverable domains bounce at
  Resend. No third-party "email validity" API needed.

Rejected alternatives:
- **Email OTP plugin** (typed 6-digit code): same delivery dependency, extra code-entry UI,
  no additional guarantee over a link.
- **Soft gate** (sign in allowed, only cloud writes blocked, like `requireUsername`): more
  code paths to gate, and unverified accounts still accumulate.
- **Grace period**: timestamp checks on every request, delays the anti-abuse benefit.

## Scope boundaries

- **Google sign-in: untouched.** Already verified upstream.
- **Signed-out usage untouched.** The app is local-first: editor, gallery browsing, and
  anonymous "Open in editor" never required a session and still don't.
- **Existing email/password accounts: force-verified, no migration.** They have
  `emailVerified = false`; at next sign-in they hit the standard unverified path (403 +
  auto-sent email), click the link once, and continue. Every email account ends up genuinely
  verified.

## Server changes

### `server/email.js` (new)

One exported `sendEmail({ to, subject, html })` that POSTs to Resend's HTTP API
(`https://api.resend.com/emails`) with plain `fetch` — no SDK dependency.

Environment:

| Var | Meaning |
|-----|---------|
| `RESEND_API_KEY` | Resend API key. Unset ⇒ dev fallback (below). |
| `EMAIL_FROM` | Sender address, e.g. `PDF Architect <auth@yourdomain>`. |

**Fail-safe dev fallback:** when `RESEND_API_KEY` is unset, `sendEmail` logs the message
(including the verification URL) to the server console and resolves — dev works with no
account. Sign-in blocking stays ON regardless; a missing key in production produces a loud
error log per attempt, never a silently-disabled check. (Same fail-safe principle as the
`DISABLE_AUTH_RATE_LIMIT` toggle.)

The sender must be **injectable** (module-level override or config hook) so tests can capture
outbound mail instead of hitting the network.

### `server/auth.js`

```js
emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
},
emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, subject: ..., html: ...url... });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
},
```

Verification-send and sign-in endpoints are already covered by better-auth's built-in rate
limiting (including its special 3-per-10s rule on `/sign-in*`/`/sign-up*`).

The verification link's `callbackURL` points back at the client (existing `from`-redirect
pattern) with a marker (`?verified=1`) so the UI can acknowledge success.

## Client changes

`pages/LoginPage.tsx` only:

- **Post-signup:** instead of entering the app, render a "Verify your email" state — the
  address just registered, "check your inbox", and a **Resend email** button (calls
  better-auth's resend/send-verification endpoint).
- **Sign-in 403 `EMAIL_NOT_VERIFIED`:** same "Verify your email" state (better-auth has
  already re-sent the link).
- **Return from link:** on `?verified=1`, show a success note and continue to the `from`
  redirect target (the user is already signed in via `autoSignInAfterVerification`).

No other surface changes: `AccountMenu`, cloud gating, username onboarding all sit behind
sign-in already.

## Testing

- **Existing suite protection:** server tests create users via real sign-up and then act on
  their sessions; requiring verification would break them wholesale. The shared test helper
  (`tests/unit/server/helpers.js`) marks users verified with a direct DB `UPDATE` immediately
  after signup. Existing tests stay untouched.
- **New tests (real flow, injected sender):**
  1. Signup captures an outbound email containing a verification URL; no usable session
     until verified.
  2. Sign-in before verification → 403 + a fresh captured email.
  3. Visiting the captured verification URL → `emailVerified` set; sign-in succeeds.
  4. Resend endpoint sends another valid link.
  5. No `RESEND_API_KEY` ⇒ `sendEmail` falls back to console logging, and sign-in blocking
     is still enforced.
- **Real-browser verification (final task):** sign up in the actual app, pull the
  verification URL from the dev-fallback console log, complete the flow end-to-end.

## Ops (one-time)

1. Create a Resend account; verify the sending domain (or use Resend's dev sender initially).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` on the deploy.
3. Existing users see a one-time verify step at next sign-in — no announcement or migration
   required.
