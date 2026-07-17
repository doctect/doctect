import { Router } from 'express';
import { dbType, withTransaction } from '../db.js';
import { requireOwner } from '../middleware/guards.js';
import {
    accountDto,
    lockUser,
    suspensionStatus,
    validateExpiry,
    validateProjectIds,
    validateVersion,
} from '../moderationSupport.js';
import { effectiveRole } from '../ownerAuthority.js';
import { insertPlatformAudit, validateReason } from '../platformAudit.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();

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
