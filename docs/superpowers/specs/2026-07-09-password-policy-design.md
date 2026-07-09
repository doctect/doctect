# Password Policy + Change Password — Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation planning

## Problem

Email/password accounts accept any 8+ character password (better-auth default), and there is
no way to change a password after signup — no change-password UI exists anywhere.

## Chosen policy

**Minimum 12 characters, and at least 3 of 4 character classes** (lowercase, uppercase,
digit, symbol). Maximum stays at better-auth's default 128. Policy applies wherever a
password is *set* (signup, change-password, any future reset flow) — never to sign-*in*, so
existing accounts with weaker passwords keep working until they next change it.

(Noted during design: current NIST guidance favors length over composition rules; the house
call is length + 3-of-4 as a common standard.)

## Components

### `shared/passwordPolicy.js` (new)

Plain JS (same convention as `shared/diff.js`) so client and server share one source of
truth:

```js
validatePassword(password) // -> { ok: true } | { ok: false, message: string }
```

- Message is specific and human: "at least 12 characters", "use at least 3 of: lowercase,
  uppercase, digits, symbols".
- Character classes: lowercase letters, uppercase letters, digits, anything else non-space
  counts as symbol. Unicode letters count as letters where feasible; the rule must never
  *reject* a password for containing unicode.

### Server enforcement (authoritative)

- `server/auth.js`: `emailAndPassword.minPasswordLength: 12`.
- A better-auth `before` hook matching the password-setting paths (`/sign-up/email`,
  `/change-password`, `/reset-password`) runs `validatePassword` on the incoming
  password/newPassword and rejects with 400 + the policy message on failure.

### Change password (Account settings page)

- **Placement:** `/account` (`AccountSettingsPage.tsx`) — the user-owned settings page (the
  `/u/:username` "profile" page is public and read-only).
- **UI:** "Change password" section: current password, new password with live policy
  feedback from the shared validator, confirm-new-password; submit disabled until valid and
  matching; clear success and error states.
- **Backend:** better-auth's built-in `/change-password` (verifies the current password,
  rehashes with the existing salted-scrypt path). Called with `revokeOtherSessions: true` —
  other sessions are signed out on password change.
- **Google-only accounts:** section hidden. Detection via better-auth's list-accounts
  endpoint: no `credential` provider ⇒ no password to change.

## Interaction with email verification work

Independent of the email-verification spec (2026-07-09-email-verification-design.md); both
touch `server/auth.js` config but different keys. Either can land first.

## Testing

- **Validator unit tests:** boundaries (11 vs 12 chars), exactly 2 vs 3 classes, all-4
  classes, symbols, spaces, unicode letters never cause rejection by themselves.
- **Server tests:** weak signup → 400 with policy message; strong signup → succeeds;
  sign-in with a pre-existing weak-password account still works; change-password with wrong
  current password → error; with weak new password → 400; with valid input → succeeds, old
  password stops working, new one signs in.
- **Client tests:** signup form shows inline policy error and blocks submit; Account
  settings section renders for credential accounts, hidden for Google-only, live-validates,
  submits.
- **Existing suite:** test-helper fixture passwords bumped to compliant values where needed.
- **Real-browser verification (final task):** full change-password round trip in the running
  app.
