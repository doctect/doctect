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
