// server/middleware/limits.js
// Storage/abuse limits. All env values are read at call time (never cached at module
// load) so they are tunable per-deploy and overridable per-test-file. Fractional MB
// values are intentionally allowed — tests use tiny quotas to trip limits cheaply.
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';

const envNum = (name, dflt) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : dflt;
};

export class LimitError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Responds with the LimitError and returns true, or returns false for anything else.
// Usage: catch (e) { if (sendLimitError(res, e)) return; throw e; }
export const sendLimitError = (res, e) => {
    if (e instanceof LimitError) {
        res.status(e.status).json({ error: e.message, code: e.code });
        return true;
    }
    return false;
};

export const userStorageQuotaBytes = () => Math.round(envNum('USER_STORAGE_QUOTA_MB', 50) * 1024 * 1024);
const globalCeilingBytes = () => Math.round(envNum('MAX_TOTAL_STORAGE_MB', 20480) * 1024 * 1024);
const maxProjectsPerUser = () => envNum('MAX_PROJECTS_PER_USER', 25);
const maxPublicProjectsPerUser = () => envNum('MAX_PUBLIC_PROJECTS_PER_USER', 20);

export const getUserStoredBytes = async (userId, queryFn = query) => {
    const rows = await queryFn(
        `SELECT COALESCE(SUM(c.state_bytes), 0) AS used
         FROM commits c JOIN projects p ON c.project_id = p.id
         WHERE p.owner_id = $1`, [userId]);
    return Number(rows[0].used);
};

export const assertGlobalCeiling = async (incomingBytes, queryFn = query) => {
    const total = await queryFn('SELECT COALESCE(SUM(state_bytes), 0) AS used FROM commits');
    if (Number(total[0].used) + incomingBytes > globalCeilingBytes()) {
        throw new LimitError(507, 'SERVICE_STORAGE_FULL',
            'Cloud storage is temporarily full. Please try again later.');
    }
};

export const assertStorageAllowance = async (userId, incomingBytes, queryFn = query) => {
    // Global ceiling first: a hard cost kill-switch that holds even if per-user
    // accounting is ever wrong. Checked on every content write.
    await assertGlobalCeiling(incomingBytes, queryFn);
    if (await getUserStoredBytes(userId, queryFn) + incomingBytes > userStorageQuotaBytes()) {
        throw new LimitError(413, 'STORAGE_QUOTA_EXCEEDED',
            'Storage quota exceeded. Delete old projects from the My Projects page to free up space.');
    }
};

export const assertProjectAllowance = async (userId, queryFn = query) => {
    const rows = await queryFn('SELECT COUNT(*) AS n FROM projects WHERE owner_id = $1', [userId]);
    if (Number(rows[0].n) >= maxProjectsPerUser()) {
        throw new LimitError(403, 'PROJECT_LIMIT_REACHED',
            `Project limit reached (max ${maxProjectsPerUser()}). Delete a project from the My Projects page to make room.`);
    }
};

export const assertPublishAllowance = async (userId, queryFn = query) => {
    const rows = await queryFn(`SELECT COUNT(*) AS n FROM projects WHERE owner_id = $1 AND visibility = 'public'`, [userId]);
    if (Number(rows[0].n) >= maxPublicProjectsPerUser()) {
        throw new LimitError(403, 'PUBLIC_LIMIT_REACHED',
            `Published project limit reached (max ${maxPublicProjectsPerUser()}). Unpublish one to publish another.`);
    }
};

// Per-USER write throttle for content-creating routes. Must run AFTER requireAuth
// (it keys on req.user.id). One shared instance across projects/commits/fork so the
// budget is a total, not per-route. `max` is a function so tests can tune it via env.
export const userWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: () => envNum('USER_COMMITS_PER_HOUR', 60),
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    message: { error: 'Too many saves in the last hour. Please slow down and try again later.', code: 'RATE_LIMITED' }
});
