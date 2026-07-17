import { randomUUID } from 'crypto';
import { validateIsoTimestamp } from './moderationSupport.js';

const PLATFORM_ROLES = new Set(['owner', 'admin', 'user']);
const EVENT_KEYS = [
    'actorKind', 'actorUserId', 'actorEmail', 'targetUserId', 'targetEmail', 'projectId',
    'reviewId', 'action', 'reason', 'expiresAt', 'createdAt', 'metadata',
];

const metadataRules = {
    owner_granted: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_emails_reconciliation'] },
    owner_removed: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_emails_reconciliation'] },
    admin_promoted: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_role_workflow'] },
    admin_demoted: { keys: ['source', 'previousRole', 'newRole'], sources: ['owner_role_workflow'] },
    account_suspended: { keys: ['source'], sources: ['account_workflow', 'owner_role_workflow'] },
    account_restored: { keys: ['source'], sources: ['account_workflow'] },
    project_unpublished: { keys: ['source', 'previousProjectVisibility'], sources: ['account_workflow', 'owner_role_workflow', 'standalone_project'] },
    review_deleted: { keys: ['source', 'deletedReviewRating'], sources: ['standalone_review'] },
};

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isNullableString = value => value === null || typeof value === 'string';
const asIso = value => value == null ? null : new Date(value).toISOString();

export const validateReason = raw => {
    if (typeof raw !== 'string') return null;
    const reason = raw.trim();
    return reason.length >= 1 && reason.length <= 1000 ? reason : null;
};

const validateMetadata = (action, raw) => {
    const rule = metadataRules[action];
    if (!rule || !isPlainObject(raw)) throw new Error('Invalid audit metadata');
    const keys = Object.keys(raw);
    if (keys.length !== rule.keys.length || rule.keys.some(key => !Object.hasOwn(raw, key))
        || !rule.sources.includes(raw.source)) throw new Error('Invalid audit metadata');
    if (rule.keys.includes('previousRole')
        && (!PLATFORM_ROLES.has(raw.previousRole) || !PLATFORM_ROLES.has(raw.newRole))) {
        throw new Error('Invalid audit metadata');
    }
    if (rule.keys.includes('previousProjectVisibility') && raw.previousProjectVisibility !== 'public') {
        throw new Error('Invalid audit metadata');
    }
    if (rule.keys.includes('deletedReviewRating')
        && (!Number.isInteger(raw.deletedReviewRating) || raw.deletedReviewRating < 1 || raw.deletedReviewRating > 5)) {
        throw new Error('Invalid audit metadata');
    }
    return Object.fromEntries(rule.keys.map(key => [key, raw[key]]));
};

const validateAuditEvent = raw => {
    if (!isPlainObject(raw) || Object.keys(raw).length !== EVENT_KEYS.length
        || EVENT_KEYS.some(key => !Object.hasOwn(raw, key))) throw new Error('Invalid audit event');
    const reason = validateReason(raw.reason);
    const createdAt = validateIsoTimestamp(raw.createdAt);
    const expiresAt = raw.expiresAt === null ? { ok: true, value: null } : validateIsoTimestamp(raw.expiresAt);
    if (!reason || !createdAt.ok || !expiresAt.ok
        || (raw.actorKind !== 'user' && raw.actorKind !== 'system')
        || (raw.actorKind === 'user' ? typeof raw.actorUserId !== 'string' : raw.actorUserId !== null)
        || typeof raw.actorEmail !== 'string' || !raw.actorEmail
        || !isNullableString(raw.targetUserId) || !isNullableString(raw.targetEmail)
        || !isNullableString(raw.projectId) || !isNullableString(raw.reviewId)) {
        throw new Error('Invalid audit event');
    }
    return {
        ...raw,
        reason,
        expiresAt: expiresAt.value,
        createdAt: createdAt.value,
        metadata: validateMetadata(raw.action, raw.metadata),
    };
};

export const platformAuditActionDto = row => ({
    id: row.id,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id ?? null,
    actorEmail: row.actor_email,
    targetUserId: row.target_user_id ?? null,
    targetEmail: row.target_email ?? null,
    projectId: row.project_id ?? null,
    reviewId: row.review_id ?? null,
    action: row.action,
    reason: row.reason,
    expiresAt: asIso(row.expires_at),
    createdAt: asIso(row.created_at),
    metadata: typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json,
});

export const insertPlatformAudit = async (txQuery, raw) => {
    const event = validateAuditEvent(raw);
    const id = randomUUID();
    await txQuery(
        `INSERT INTO platform_audit_actions
         (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, project_id, review_id, action, reason, expires_at, created_at, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, event.actorKind, event.actorUserId, event.actorEmail, event.targetUserId, event.targetEmail,
            event.projectId, event.reviewId, event.action, event.reason, event.expiresAt,
            event.createdAt, JSON.stringify(event.metadata)],
    );
    return platformAuditActionDto({
        id,
        actor_kind: event.actorKind,
        actor_user_id: event.actorUserId,
        actor_email: event.actorEmail,
        target_user_id: event.targetUserId,
        target_email: event.targetEmail,
        project_id: event.projectId,
        review_id: event.reviewId,
        action: event.action,
        reason: event.reason,
        expires_at: event.expiresAt,
        created_at: event.createdAt,
        metadata_json: event.metadata,
    });
};
