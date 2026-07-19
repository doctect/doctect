import { query } from './db.js';

const DEFAULT_CAP = 500;

// Read per call, not at import: dotenv loads during server import, and tests
// flip SIGNUP_CAP between requests.
export const getSignupCap = () => {
    // Trim first: whitespace-only must mean "unset" (default), not Number(' ')
    // === 0, which would silently close signups.
    const raw = process.env.SIGNUP_CAP?.trim();
    if (raw === undefined || raw === '') return DEFAULT_CAP;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_CAP;
    return parsed;
};

// Verified accounts only (spec): unverified rows never consume slots, accepting
// that under-cap signups may verify later and overshoot the cap.
export const isSignupOpen = async () => {
    const rows = await query('SELECT COUNT(*) AS count FROM "user" WHERE "emailVerified" = TRUE');
    return parseInt(rows[0].count, 10) < getSignupCap();
};
