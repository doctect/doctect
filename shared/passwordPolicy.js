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
