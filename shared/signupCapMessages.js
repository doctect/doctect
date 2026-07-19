// Single source for the signup-cap refusal copy. The server throws it as an
// APIError message; better-auth's OAuth callback forwards that message to the
// client as a redirect ?error= param with spaces turned into underscores
// (dist/api/routes/callback.mjs redirectOnError + dist/oauth2/link-account.mjs,
// verified against better-auth 1.4.10), so the client matches on the stable
// prefix rather than the full transformed string.
export const SIGNUP_CAP_MESSAGE = 'Signups are temporarily closed — the free account limit has been reached. You can join the waitlist or keep using the app without an account.';

export const isSignupCapOAuthError = (errorParam) =>
    typeof errorParam === 'string' && errorParam.startsWith('Signups_are_temporarily_closed');
