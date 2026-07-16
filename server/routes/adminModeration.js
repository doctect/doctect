import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dbType, query, withTransaction } from '../db.js';
import { requireAdmin } from '../middleware/guards.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();
const PAGE_SIZE = 25;
const MAX_CURSOR_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})([ T])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z)?$/;

const asIso = value => value == null ? null : new Date(value).toISOString();
const isBanned = value => value === true || value === 1 || value === '1';

const suspensionStatus = (row, now = Date.now()) => {
    if (!isBanned(row.banned)) return 'none';
    if (row.banExpires == null) return 'active';
    return new Date(row.banExpires).getTime() > now ? 'active' : 'expired';
};

const searchUserDto = row => ({
    id: row.id,
    email: row.email,
    username: row.username ?? null,
    role: row.role ?? null,
    createdAt: asIso(row.createdAt),
    suspensionStatus: suspensionStatus(row),
    banExpires: asIso(row.banExpires),
    moderationVersion: Number(row.moderationVersion),
});

const accountDto = row => ({
    ...searchUserDto(row),
    banReason: row.banReason ?? null,
});

const actionDto = row => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email,
    action: row.action,
    reason: row.reason,
    expiresAt: asIso(row.expires_at),
    projectId: row.project_id ?? null,
    createdAt: asIso(row.created_at),
});

const encodeCursor = values => Buffer.from(JSON.stringify(values)).toString('base64url');
const escapeLike = value => value.replace(/\\/g, '\\\\').replace(/[%_]/g, character => `\\${character}`);
const isCursorPart = value => typeof value === 'string' && value.length > 0 && value.length <= 320;
const isTimestampCursor = value => {
    if (!isCursorPart(value)) return false;
    const match = TIMESTAMP_PATTERN.exec(value);
    if (!match) return false;
    const [, yearText, monthText, dayText, separator, hourText, minuteText, secondText, , zone] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if ((separator === 'T') !== (zone === 'Z')) return false;
    if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > daysInMonth[month - 1]) return false;
    return true;
};
const decodeCursor = (raw, validators) => {
    if (typeof raw !== 'string' || raw.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(raw)) return null;
    try {
        const decoded = Buffer.from(raw, 'base64url');
        if (decoded.toString('base64url') !== raw) return null;
        const values = JSON.parse(decoded.toString('utf8'));
        if (!Array.isArray(values) || values.length !== validators.length
            || values.some((value, index) => !validators[index](value))
            || encodeCursor(values) !== raw) {
            return null;
        }
        return values;
    } catch {
        return null;
    }
};

router.use('/api/admin/users', requireAdmin);

router.get('/api/admin/users', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length > 100) return res.status(400).json({ error: 'q must be 1 to 100 characters' });
    const cursor = req.query.cursor === undefined
        ? []
        : decodeCursor(req.query.cursor, [isCursorPart, isCursorPart]);
    if (cursor === null) return res.status(400).json({ error: 'cursor is invalid' });

    const escapedQuery = escapeLike(q.toLowerCase());
    const params = [`%${escapedQuery}%`, `%${escapedQuery}%`];
    let after = '';
    if (cursor.length) {
        params.push(cursor[0], cursor[0], cursor[1]);
        after = 'AND (LOWER(email) > $3 OR (LOWER(email) = $4 AND id > $5))';
    }
    const rows = await query(
        `SELECT id, email, username, role, "createdAt", banned, "banExpires", "moderationVersion"
         FROM "user"
         WHERE (LOWER(email) LIKE $1 ESCAPE '\\' OR LOWER(COALESCE(username, '')) LIKE $2 ESCAPE '\\')
         ${after}
         ORDER BY LOWER(email), id
         LIMIT ${PAGE_SIZE + 1}`,
        params,
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    res.json({
        users: page.map(searchUserDto),
        nextCursor: rows.length > PAGE_SIZE ? encodeCursor([last.email.toLowerCase(), last.id]) : null,
    });
});

router.get('/api/admin/users/:id', async (req, res) => {
    const cursor = req.query.historyCursor === undefined
        ? []
        : decodeCursor(req.query.historyCursor, [isTimestampCursor, isCursorPart]);
    if (cursor === null) return res.status(400).json({ error: 'historyCursor is invalid' });
    const users = await query(
        `SELECT id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"
         FROM "user" WHERE id = $1`,
        [req.params.id],
    );
    if (!users[0]) return res.status(404).json({ error: 'User not found' });

    const projects = await query(
        `SELECT id, COALESCE(published_name, name) AS name, published_at
         FROM projects
         WHERE owner_id = $1 AND visibility = 'public' AND published_commit_id IS NOT NULL
         ORDER BY published_at DESC, id`,
        [req.params.id],
    );
    const params = [req.params.id];
    let before = '';
    if (cursor.length) {
        params.push(cursor[0], cursor[0], cursor[1]);
        before = dbType === 'postgres'
            ? 'AND (created_at < CAST($2 AS TIMESTAMP) OR (created_at = CAST($3 AS TIMESTAMP) AND id < $4))'
            : 'AND (created_at < $2 OR (created_at = $3 AND id < $4))';
    }
    const actions = await query(
        `SELECT id, actor_user_id, actor_email, target_user_id, target_email,
                action, reason, expires_at, project_id, created_at,
                CAST(created_at AS TEXT) AS created_at_cursor
         FROM moderation_actions
         WHERE target_user_id = $1 ${before}
         ORDER BY created_at DESC, id DESC
         LIMIT ${PAGE_SIZE + 1}`,
        params,
    );
    const historyPage = actions.slice(0, PAGE_SIZE);
    const last = historyPage[historyPage.length - 1];
    res.json({
        account: accountDto(users[0]),
        projects: projects.map(project => ({
            id: project.id,
            name: project.name,
            publishedAt: asIso(project.published_at),
        })),
        history: {
            items: historyPage.map(actionDto),
            nextCursor: actions.length > PAGE_SIZE
                ? encodeCursor([last.created_at_cursor, last.id])
                : null,
        },
    });
});

export default router;
