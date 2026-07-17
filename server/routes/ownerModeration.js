import { Router } from 'express';
import { dbType, query, withTransaction } from '../db.js';
import { requireOwner } from '../middleware/guards.js';
import {
    accountDto,
    lockUser,
    suspensionStatus,
    validateExpiry,
    validateIsoTimestamp,
    validateProjectIds,
    validateVersion,
} from '../moderationSupport.js';
import { effectiveRole, normalizeEmail } from '../ownerAuthority.js';
import { insertPlatformAudit, platformAuditActionDto, validateReason } from '../platformAudit.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();
const PAGE_SIZE = 25;
const MAX_CURSOR_LENGTH = 512;
const MAX_EMAIL_LENGTH = 320;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})([ T])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z)?$/;
const AUDIT_ACTIONS = new Set([
    'owner_granted',
    'owner_removed',
    'admin_promoted',
    'admin_demoted',
    'account_suspended',
    'account_restored',
    'project_unpublished',
    'review_deleted',
]);

const encodeCursor = values => Buffer.from(JSON.stringify(values)).toString('base64url');
const isCursorPart = value => typeof value === 'string' && value.length > 0 && value.length <= MAX_EMAIL_LENGTH;
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
    return day >= 1 && day <= daysInMonth[month - 1];
};
const decodeCursor = raw => {
    if (typeof raw !== 'string' || raw.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(raw)) return null;
    try {
        const decoded = Buffer.from(raw, 'base64url');
        if (decoded.toString('base64url') !== raw) return null;
        const values = JSON.parse(decoded.toString('utf8'));
        if (!Array.isArray(values) || values.length !== 2
            || !isTimestampCursor(values[0]) || !isCursorPart(values[1])
            || encodeCursor(values) !== raw) return null;
        return values;
    } catch {
        return null;
    }
};
const emailFilter = raw => {
    if (raw === undefined) return { ok: true, value: null };
    if (typeof raw !== 'string') return { ok: false };
    const value = normalizeEmail(raw);
    return value && value.length <= MAX_EMAIL_LENGTH ? { ok: true, value } : { ok: false };
};

const isSuspensionInput = value => {
    if (value === null) return true;
    if (value === undefined || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === 1 && keys[0] === 'expiresAt';
};

const lifecycleResult = (result, res) => {
    if (result.status === 403) return res.status(403).json({ error: 'Target is protected by role hierarchy' });
    if (result.status === 404) return res.status(404).json({ error: 'User not found' });
    if (result.status === 409) {
        return res.status(409).json({ error: 'Role or moderation state changed; refresh and try again' });
    }
    return res.json({ account: result.account, actions: result.actions });
};

router.use('/api/owner', requireOwner);

router.get('/api/owner/audit', async (req, res) => {
    const actorEmail = emailFilter(req.query.actorEmail);
    const targetEmail = emailFilter(req.query.targetEmail);
    const action = req.query.action;
    const from = req.query.from === undefined ? { ok: true, value: null } : validateIsoTimestamp(req.query.from);
    const to = req.query.to === undefined ? { ok: true, value: null } : validateIsoTimestamp(req.query.to);
    const cursor = req.query.cursor === undefined ? [] : decodeCursor(req.query.cursor);
    if (!actorEmail.ok || !targetEmail.ok
        || (action !== undefined && (typeof action !== 'string' || !AUDIT_ACTIONS.has(action)))
        || !from.ok || !to.ok || cursor === null
        || (from.value !== null && to.value !== null && Date.parse(from.value) > Date.parse(to.value))) {
        return res.status(400).json({ error: 'Invalid audit query' });
    }

    const predicates = [];
    const params = [];
    const bind = value => {
        params.push(value);
        return `$${params.length}`;
    };
    if (actorEmail.value !== null) predicates.push(`LOWER(actor_email) = ${bind(actorEmail.value)}`);
    if (targetEmail.value !== null) predicates.push(`LOWER(target_email) = ${bind(targetEmail.value)}`);
    if (action !== undefined) predicates.push(`action = ${bind(action)}`);
    if (from.value !== null) {
        const placeholder = bind(from.value);
        predicates.push(`created_at >= ${dbType === 'postgres' ? `CAST(${placeholder} AS TIMESTAMP)` : placeholder}`);
    }
    if (to.value !== null) {
        const placeholder = bind(to.value);
        predicates.push(`created_at <= ${dbType === 'postgres' ? `CAST(${placeholder} AS TIMESTAMP)` : placeholder}`);
    }
    if (cursor.length) {
        const before = bind(cursor[0]);
        const equal = bind(cursor[0]);
        const id = bind(cursor[1]);
        predicates.push(dbType === 'postgres'
            ? `(created_at < CAST(${before} AS TIMESTAMP) OR (created_at = CAST(${equal} AS TIMESTAMP) AND id < ${id}))`
            : `(created_at < ${before} OR (created_at = ${equal} AND id < ${id}))`);
    }

    const rows = await query(
        `SELECT id, actor_kind, actor_user_id, actor_email, target_user_id, target_email,
                project_id, review_id, action, reason, expires_at, created_at, metadata_json,
                CAST(created_at AS TEXT) AS created_at_cursor
         FROM platform_audit_actions
         ${predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC
         LIMIT ${PAGE_SIZE + 1}`,
        params,
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    return res.json({
        items: page.map(platformAuditActionDto),
        nextCursor: rows.length > PAGE_SIZE ? encodeCursor([last.created_at_cursor, last.id]) : null,
    });
});

router.post('/api/owner/users/:id/promote-admin', async (req, res) => {
    const reason = validateReason(req.body?.reason);
    const expectedVersion = req.body?.expectedModerationVersion;
    if (!reason || !validateVersion(expectedVersion)) {
        return res.status(400).json({ error: 'Invalid promotion request' });
    }

    try {
        const result = await withTransaction(async txQuery => {
            const target = await lockUser(req.params.id, txQuery);
            if (!target) return { status: 404 };
            if (target.role === 'owner') return { status: 403 };
            if (effectiveRole(target.role) !== 'user'
                || suspensionStatus(target) === 'active'
                || Number(target.moderationVersion) !== expectedVersion) {
                return { status: 409 };
            }

            const now = new Date().toISOString();
            const updated = await txQuery(
                `UPDATE "user"
                 SET role = 'admin', "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $1
                 WHERE id = $2 AND "moderationVersion" = $3
                 RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
                [now, target.id, expectedVersion],
            );
            if (!updated[0]) return { status: 409 };
            await txQuery('DELETE FROM session WHERE "userId" = $1', [target.id]);
            const action = await insertPlatformAudit(txQuery, {
                actorKind: 'user',
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                projectId: null,
                reviewId: null,
                action: 'admin_promoted',
                reason,
                expiresAt: null,
                createdAt: now,
                metadata: { source: 'owner_role_workflow', previousRole: 'user', newRole: 'admin' },
            });
            return { status: 200, account: accountDto(updated[0]), actions: [action] };
        });
        return lifecycleResult(result, res);
    } catch (error) {
        console.error('Admin promotion failed:', error);
        return res.status(500).json({ error: 'Admin promotion failed' });
    }
});

router.post('/api/owner/users/:id/revoke-admin', async (req, res) => {
    const reason = validateReason(req.body?.reason);
    const expectedVersion = req.body?.expectedModerationVersion;
    const rawSuspension = req.body?.suspension;
    const projectIds = validateProjectIds(req.body?.projectIdsToUnpublish);
    const expiry = isSuspensionInput(rawSuspension) && rawSuspension !== null
        ? validateExpiry(rawSuspension.expiresAt)
        : { ok: rawSuspension === null, value: null };
    if (!reason || !validateVersion(expectedVersion) || projectIds === null || !expiry.ok) {
        return res.status(400).json({ error: 'Invalid revocation request' });
    }

    try {
        const result = await withTransaction(async txQuery => {
            const target = await lockUser(req.params.id, txQuery);
            if (!target) return { status: 404 };
            if (target.role === 'owner') return { status: 403 };
            if (effectiveRole(target.role) !== 'admin'
                || Number(target.moderationVersion) !== expectedVersion
                || (rawSuspension !== null && suspensionStatus(target) === 'active')) {
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
            if (rawSuspension !== null && expiry.value !== null && Date.parse(expiry.value) <= Date.now()) {
                return { status: 400 };
            }

            const now = new Date().toISOString();
            const updated = rawSuspension === null
                ? await txQuery(
                    `UPDATE "user"
                     SET role = 'user', "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $1
                     WHERE id = $2 AND "moderationVersion" = $3
                     RETURNING id, email, username, role, "createdAt", "moderationVersion"`,
                    [now, target.id, expectedVersion],
                )
                : await txQuery(
                    `UPDATE "user"
                     SET role = 'user', banned = $1, "banReason" = $2, "banExpires" = $3,
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
                createdAt: now,
            };
            const actions = [await insertPlatformAudit(txQuery, {
                ...common,
                projectId: null,
                action: 'admin_demoted',
                expiresAt: null,
                metadata: { source: 'owner_role_workflow', previousRole: 'admin', newRole: 'user' },
            })];
            if (rawSuspension !== null) {
                actions.push(await insertPlatformAudit(txQuery, {
                    ...common,
                    projectId: null,
                    action: 'account_suspended',
                    expiresAt: expiry.value,
                    metadata: { source: 'owner_role_workflow' },
                }));
            }
            for (const projectId of projectIds) {
                actions.push(await insertPlatformAudit(txQuery, {
                    ...common,
                    projectId,
                    action: 'project_unpublished',
                    expiresAt: rawSuspension === null ? null : expiry.value,
                    metadata: { source: 'owner_role_workflow', previousProjectVisibility: 'public' },
                }));
            }
            const accountRow = rawSuspension === null ? { ...target, ...updated[0] } : updated[0];
            return { status: 200, account: accountDto(accountRow), actions };
        });
        if (result.status === 400) return res.status(400).json({ error: 'Invalid revocation request' });
        return lifecycleResult(result, res);
    } catch (error) {
        console.error('Admin revocation failed:', error);
        return res.status(500).json({ error: 'Admin revocation failed' });
    }
});

export default router;
