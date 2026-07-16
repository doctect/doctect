import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dbType, query, withTransaction } from '../db.js';
import { requireAdmin } from '../middleware/guards.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();
const PAGE_SIZE = 25;

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
const decodeCursor = (raw, expectedLength) => {
    if (!raw) return null;
    try {
        const values = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
        if (!Array.isArray(values) || values.length !== expectedLength
            || values.some(value => typeof value !== 'string' || !value)) {
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
    const cursor = req.query.cursor === undefined ? [] : decodeCursor(req.query.cursor, 2);
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
    const cursor = req.query.historyCursor === undefined ? [] : decodeCursor(req.query.historyCursor, 2);
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
        before = 'AND (created_at < $2 OR (created_at = $3 AND id < $4))';
    }
    const actions = await query(
        `SELECT id, actor_user_id, actor_email, target_user_id, target_email,
                action, reason, expires_at, project_id, created_at
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
                ? encodeCursor([typeof last.created_at === 'string' ? last.created_at : asIso(last.created_at), last.id])
                : null,
        },
    });
});

export default router;
