import { Router } from 'express';
import { dbType, query, withTransaction } from '../db.js';
import { requireAdmin } from '../middleware/guards.js';
import {
    accountDto,
    lockUser,
    suspensionStatus,
    validateExpiry,
    validateProjectIds,
    validateVersion,
} from '../moderationSupport.js';
import { canModerateRole } from '../ownerAuthority.js';
import { insertPlatformAudit, platformAuditActionDto, validateReason } from '../platformAudit.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();
const PAGE_SIZE = 25;
const MAX_CURSOR_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})([ T])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z)?$/;

const asIso = value => value == null ? null : new Date(value).toISOString();

const searchUserDto = row => {
    const { banReason: _banReason, ...dto } = accountDto(row);
    return dto;
};

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
        `SELECT id, actor_kind, actor_user_id, actor_email, target_user_id, target_email,
                project_id, review_id, action, reason, expires_at, created_at, metadata_json,
                CAST(created_at AS TEXT) AS created_at_cursor
         FROM platform_audit_actions
         WHERE target_user_id = $1 AND actor_kind = 'user' ${before}
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
            items: historyPage.map(platformAuditActionDto),
            nextCursor: actions.length > PAGE_SIZE
                ? encodeCursor([last.created_at_cursor, last.id])
                : null,
        },
    });
});

router.post('/api/admin/users/:id/suspend', requireAdmin, async (req, res) => {
    const reason = validateReason(req.body?.reason);
    const expiry = validateExpiry(req.body?.expiresAt);
    const projectIds = validateProjectIds(req.body?.projectIdsToUnpublish);
    const expectedVersion = req.body?.expectedModerationVersion;
    if (!reason || !expiry.ok || projectIds === null || !validateVersion(expectedVersion)) {
        return res.status(400).json({ error: 'Invalid suspension request' });
    }

    try {
        const result = await withTransaction(async txQuery => {
            const target = await lockUser(req.params.id, txQuery);
            if (!target) return { status: 404 };
            if (!canModerateRole(req.user.role, target.role)) return { status: 403 };
            if (Number(target.moderationVersion) !== expectedVersion || suspensionStatus(target) === 'active') {
                return { status: 409 };
            }

            const projects = await lockProjectRows(projectIds, txQuery);
            const selected = new Map(projects.map(project => [project.id, project]));
            const validProjects = projects.length === projectIds.length && projectIds.every(id => {
                const project = selected.get(id);
                return project?.owner_id === target.id
                    && project.visibility === 'public'
                    && project.published_commit_id != null;
            });
            if (!validProjects) return { status: 409 };

            const nowMs = Date.now();
            if (expiry.value !== null && Date.parse(expiry.value) <= nowMs) return { status: 400 };
            const now = new Date(nowMs).toISOString();
            const updated = await txQuery(
                `UPDATE "user"
                 SET banned = $1, "banReason" = $2, "banExpires" = $3,
                     "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $4
                 WHERE id = $5 AND "moderationVersion" = $6
                 RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
                [dbType === 'postgres' ? true : 1, reason, expiry.value, now, target.id, expectedVersion],
            );
            if (!updated[0]) return { status: 409 };
            await txQuery('DELETE FROM session WHERE "userId" = $1', [target.id]);

            for (const projectId of projectIds) {
                await txQuery(
                    `UPDATE projects SET visibility = 'private', published_commit_id = NULL WHERE id = $1`,
                    [projectId],
                );
            }

            const common = {
                actorKind: 'user',
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                reviewId: null,
                reason,
                expiresAt: expiry.value,
                createdAt: now,
            };
            const actions = [await insertPlatformAudit(txQuery, {
                ...common,
                action: 'account_suspended',
                projectId: null,
                metadata: { source: 'account_workflow' },
            })];
            for (const projectId of projectIds) {
                actions.push(await insertPlatformAudit(txQuery, {
                    ...common,
                    action: 'project_unpublished',
                    projectId,
                    metadata: { source: 'account_workflow', previousProjectVisibility: 'public' },
                }));
            }
            return { status: 200, account: accountDto(updated[0]), actions };
        });
        if (result.status === 403) return res.status(403).json({ error: 'Target is protected by role hierarchy' });
        if (result.status === 404) return res.status(404).json({ error: 'User not found' });
        if (result.status === 400) return res.status(400).json({ error: 'Invalid suspension request' });
        if (result.status === 409) return res.status(409).json({ error: 'Moderation state changed; refresh and try again' });
        return res.json({ account: result.account, actions: result.actions });
    } catch (error) {
        console.error('Account suspension failed:', error);
        return res.status(500).json({ error: 'Account suspension failed' });
    }
});

router.post('/api/admin/users/:id/restore', requireAdmin, async (req, res) => {
    const reason = validateReason(req.body?.reason);
    const expectedVersion = req.body?.expectedModerationVersion;
    if (!reason || !validateVersion(expectedVersion)) {
        return res.status(400).json({ error: 'Invalid restoration request' });
    }

    try {
        const result = await withTransaction(async txQuery => {
            const target = await lockUser(req.params.id, txQuery);
            if (!target) return { status: 404 };
            if (!canModerateRole(req.user.role, target.role)) return { status: 403 };
            if (Number(target.moderationVersion) !== expectedVersion || suspensionStatus(target) === 'none') {
                return { status: 409 };
            }
            const now = new Date().toISOString();
            const updated = await txQuery(
                `UPDATE "user"
                 SET banned = $1, "banReason" = NULL, "banExpires" = NULL,
                     "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $2
                 WHERE id = $3 AND "moderationVersion" = $4
                 RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
                [dbType === 'postgres' ? false : 0, now, target.id, expectedVersion],
            );
            if (!updated[0]) return { status: 409 };
            await txQuery('DELETE FROM session WHERE "userId" = $1', [target.id]);
            const action = await insertPlatformAudit(txQuery, {
                actorKind: 'user',
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                reviewId: null,
                action: 'account_restored',
                reason,
                expiresAt: null,
                projectId: null,
                createdAt: now,
                metadata: { source: 'account_workflow' },
            });
            return { status: 200, account: accountDto(updated[0]), actions: [action] };
        });
        if (result.status === 403) return res.status(403).json({ error: 'Target is protected by role hierarchy' });
        if (result.status === 404) return res.status(404).json({ error: 'User not found' });
        if (result.status === 409) return res.status(409).json({ error: 'Moderation state changed; refresh and try again' });
        return res.json({ account: result.account, actions: result.actions });
    } catch (error) {
        console.error('Account restoration failed:', error);
        return res.status(500).json({ error: 'Account restoration failed' });
    }
});

export default router;
