import { dbType, withTransaction } from './db.js';
import { insertPlatformAudit } from './platformAudit.js';

export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export const parseOwnerEmails = raw => new Set(
    String(raw ?? '').split(',').map(normalizeEmail).filter(Boolean),
);

export const getOwnerEmails = (env = process.env) => parseOwnerEmails(env.OWNER_EMAILS);

export const assertOwnerConfiguration = (env = process.env) => {
    if (env.NODE_ENV === 'production' && getOwnerEmails(env).size === 0) {
        throw new Error('OWNER_EMAILS must contain at least one email in production');
    }
};

export const effectiveRole = role => role === 'owner' || role === 'admin' ? role : 'user';

export const isConfiguredOwner = (user, env = process.env) =>
    effectiveRole(user?.role) === 'owner' && getOwnerEmails(env).has(normalizeEmail(user?.email));

export const canModerateRole = (actorRole, targetRole) => {
    const actor = effectiveRole(actorRole);
    const target = effectiveRole(targetRole);
    return target !== 'owner' && (actor === 'owner' || (actor === 'admin' && target === 'user'));
};

export const reconcileOwnerAuthority = async ({ userId } = {}) => withTransaction(async txQuery => {
    const fields = `id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`;
    const lock = dbType === 'postgres' ? ' FOR UPDATE' : '';
    const users = userId === undefined
        ? await txQuery(`SELECT ${fields} FROM "user" ORDER BY id${lock}`)
        : await txQuery(`SELECT ${fields} FROM "user" WHERE id = $1${lock}`, [userId]);
    const configuredOwners = getOwnerEmails();
    const actions = [];

    for (const row of users) {
        const previousRole = effectiveRole(row.role);
        const desiredRole = configuredOwners.has(normalizeEmail(row.email))
            ? 'owner'
            : previousRole === 'owner' ? 'user' : previousRole;
        if (desiredRole === previousRole) continue;

        const now = new Date().toISOString();
        await txQuery(`UPDATE "user"
            SET role = $1, "moderationVersion" = "moderationVersion" + 1, "updatedAt" = $2
            WHERE id = $3
            RETURNING id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"`,
        [desiredRole, now, row.id]);
        await txQuery('DELETE FROM session WHERE "userId" = $1', [row.id]);
        actions.push(await insertPlatformAudit(txQuery, {
            actorKind: 'system',
            actorUserId: null,
            actorEmail: 'OWNER_EMAILS reconciliation',
            targetUserId: row.id,
            targetEmail: row.email,
            projectId: null,
            reviewId: null,
            action: desiredRole === 'owner' ? 'owner_granted' : 'owner_removed',
            reason: 'Synchronize account role with OWNER_EMAILS configuration',
            expiresAt: null,
            createdAt: now,
            metadata: { source: 'owner_emails_reconciliation', previousRole, newRole: desiredRole },
        }));
    }

    return actions;
});
