// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/db.js', () => ({ dbType: 'postgres' }));

import {
    insertPlatformAudit,
    platformAuditActionDto,
    validateReason,
} from '../../../server/platformAudit.js';
import {
    MAX_PROJECTS_TO_UNPUBLISH,
    accountDto,
    lockUser,
    suspensionStatus,
    validateExpiry,
    validateIsoTimestamp,
    validateProjectIds,
    validateVersion,
} from '../../../server/moderationSupport.js';

const reviewEvent = {
    actorKind: 'user',
    actorUserId: 'admin-1',
    actorEmail: 'admin@test.dev',
    targetUserId: 'user-1',
    targetEmail: 'user@test.dev',
    projectId: null,
    reviewId: 'review-1',
    action: 'review_deleted',
    reason: '  abusive review  ',
    expiresAt: null,
    createdAt: '2026-07-16T10:00:00.000Z',
    metadata: { source: 'standalone_review', deletedReviewRating: 2 },
};

const validMetadata = [
    ['owner_granted', { source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner' }],
    ['owner_removed', { source: 'owner_emails_reconciliation', previousRole: 'owner', newRole: 'user' }],
    ['admin_promoted', { source: 'owner_role_workflow', previousRole: 'user', newRole: 'admin' }],
    ['admin_demoted', { source: 'owner_role_workflow', previousRole: 'admin', newRole: 'user' }],
    ['account_suspended', { source: 'account_workflow' }],
    ['account_suspended', { source: 'owner_role_workflow' }],
    ['account_restored', { source: 'account_workflow' }],
    ['project_unpublished', { source: 'account_workflow', previousProjectVisibility: 'public' }],
    ['project_unpublished', { source: 'owner_role_workflow', previousProjectVisibility: 'public' }],
    ['project_unpublished', { source: 'standalone_project', previousProjectVisibility: 'public' }],
    ['review_deleted', { source: 'standalone_review', deletedReviewRating: 2 }],
];

describe('platform audit support', () => {
    it('writes one privacy-safe audit row with each placeholder used once', async () => {
        const calls = [];
        const txQuery = async (...args) => {
            calls.push(args);
            return [];
        };

        await expect(insertPlatformAudit(txQuery, reviewEvent)).resolves.toMatchObject({
            actorKind: 'user',
            actorUserId: 'admin-1',
            targetUserId: 'user-1',
            projectId: null,
            reviewId: 'review-1',
            reason: 'abusive review',
            expiresAt: null,
            createdAt: '2026-07-16T10:00:00.000Z',
            metadata: { source: 'standalone_review', deletedReviewRating: 2 },
        });

        expect(calls).toHaveLength(1);
        const [sql, params] = calls[0];
        expect(sql.match(/\$\d+/g)).toEqual(Array.from({ length: 13 }, (_, index) => `$${index + 1}`));
        expect(params).toHaveLength(13);
        expect(params.slice(1)).toEqual([
            'user', 'admin-1', 'admin@test.dev', 'user-1', 'user@test.dev', null, 'review-1',
            'review_deleted', 'abusive review', null, '2026-07-16T10:00:00.000Z',
            JSON.stringify({ source: 'standalone_review', deletedReviewRating: 2 }),
        ]);
        expect(JSON.stringify(calls)).not.toMatch(/password|token|session|ipAddress|reviewBody/i);
    });

    it('rejects unknown metadata before issuing SQL', async () => {
        const txQuery = vi.fn();
        await expect(insertPlatformAudit(txQuery, {
            ...reviewEvent,
            metadata: { ...reviewEvent.metadata, reviewBody: 'secret' },
        })).rejects.toThrow('Invalid audit metadata');
        expect(txQuery).not.toHaveBeenCalled();
    });

    it('rejects a past audit expiry before issuing SQL', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-17T10:00:00.000Z'));
        const txQuery = vi.fn();
        try {
            await expect(insertPlatformAudit(txQuery, {
                ...reviewEvent,
                expiresAt: '2026-07-16T10:00:00.000Z',
            })).rejects.toThrow('Invalid audit event');
            expect(txQuery).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it.each(validMetadata)('accepts exact %s metadata', async (action, metadata) => {
        const txQuery = vi.fn(async () => []);
        await expect(insertPlatformAudit(txQuery, { ...reviewEvent, action, metadata })).resolves.toMatchObject({
            action,
            metadata,
        });
        expect(txQuery).toHaveBeenCalledOnce();
    });

    it.each([
        ['owner_granted', { source: 'account_workflow', previousRole: 'user', newRole: 'owner' }],
        ['admin_promoted', { source: 'owner_role_workflow', previousRole: 'user' }],
        ['admin_demoted', { source: 'owner_role_workflow', previousRole: 'admin', newRole: 'moderator' }],
        ['account_restored', { source: 'owner_role_workflow' }],
        ['project_unpublished', { source: 'standalone_project', previousProjectVisibility: 'private' }],
        ['review_deleted', { source: 'standalone_review', deletedReviewRating: 0 }],
        ['review_deleted', { source: 'standalone_review', deletedReviewRating: 6 }],
        ['review_deleted', { source: 'standalone_review', deletedReviewRating: 2.5 }],
    ])('rejects invalid %s metadata', async (action, metadata) => {
        const txQuery = vi.fn();
        await expect(insertPlatformAudit(txQuery, { ...reviewEvent, action, metadata }))
            .rejects.toThrow('Invalid audit metadata');
        expect(txQuery).not.toHaveBeenCalled();
    });

    it('normalizes PostgreSQL objects and SQLite JSON strings into stable DTOs', () => {
        const row = {
            id: 'audit-1', actor_kind: 'system', actor_user_id: null, actor_email: 'system@doctect.local',
            target_user_id: null, target_email: null, project_id: null, review_id: null,
            action: 'account_restored', reason: 'Owner reconciliation', expires_at: null,
            created_at: new Date('2026-07-16T10:00:00.000Z'),
            metadata_json: JSON.stringify({ source: 'account_workflow' }),
        };
        expect(platformAuditActionDto(row)).toEqual({
            id: 'audit-1', actorKind: 'system', actorUserId: null, actorEmail: 'system@doctect.local',
            targetUserId: null, targetEmail: null, projectId: null, reviewId: null,
            action: 'account_restored', reason: 'Owner reconciliation', expiresAt: null,
            createdAt: '2026-07-16T10:00:00.000Z', metadata: { source: 'account_workflow' },
        });
        expect(platformAuditActionDto({
            ...row,
            metadata_json: { source: 'account_workflow' },
            expires_at: new Date('2026-08-01T01:02:03.000Z'),
        }).expiresAt).toBe('2026-08-01T01:02:03.000Z');
    });
});

describe('shared moderation validation', () => {
    it('accepts only trimmed reasons from 1 through 1,000 characters', () => {
        expect(validateReason(' x ')).toBe('x');
        expect(validateReason('x'.repeat(1000))).toBe('x'.repeat(1000));
        expect(validateReason('   ')).toBeNull();
        expect(validateReason('x'.repeat(1001))).toBeNull();
        expect(validateReason(1)).toBeNull();
    });

    it('strictly validates and normalizes calendar timestamps with zones', () => {
        expect(validateIsoTimestamp('2026-07-16T10:00:00Z')).toEqual({
            ok: true, value: '2026-07-16T10:00:00.000Z',
        });
        expect(validateIsoTimestamp('2026-07-16T10:00:00.123+05:30')).toEqual({
            ok: true, value: '2026-07-16T04:30:00.123Z',
        });
        for (const raw of [
            '2026-07-16',
            '2026-07-16T10:00:00',
            '2026-02-29T10:00:00Z',
            '2026-07-16T24:00:00Z',
            '2026-07-16T10:00:00.1234Z',
            '2026-07-16T10:00:00+14:01',
        ]) expect(validateIsoTimestamp(raw)).toEqual({ ok: false });
    });

    it('requires non-null expiries to be in the future', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
        try {
            expect(validateExpiry(null)).toEqual({ ok: true, value: null });
            expect(validateExpiry('2026-07-16T10:00:00.001Z')).toEqual({
                ok: true, value: '2026-07-16T10:00:00.001Z',
            });
            expect(validateExpiry('2026-07-16T10:00:00.000Z')).toEqual({ ok: false });
            expect(validateExpiry('2026-07-16T09:59:59.999Z')).toEqual({ ok: false });
        } finally {
            vi.useRealTimers();
        }
    });

    it('accepts only non-negative integer versions', () => {
        expect(validateVersion(0)).toBe(true);
        expect(validateVersion(10)).toBe(true);
        expect(validateVersion(-1)).toBe(false);
        expect(validateVersion(1.5)).toBe(false);
        expect(validateVersion('1')).toBe(false);
    });

    it('accepts at most 20 unique trimmed project IDs', () => {
        expect(MAX_PROJECTS_TO_UNPUBLISH).toBe(20);
        const twenty = Array.from({ length: 20 }, (_, index) => ` project-${index} `);
        expect(validateProjectIds(twenty)).toEqual(twenty.map(id => id.trim()));
        expect(validateProjectIds([...twenty, 'project-20'])).toBeNull();
        expect(validateProjectIds([' project-1 ', 'project-1'])).toBeNull();
        expect(validateProjectIds(['  '])).toBeNull();
    });

    it('normalizes account roles, dates, and effective suspension status', () => {
        const row = {
            id: 'user-1', email: 'user@test.dev', username: undefined, role: 'moderator',
            createdAt: new Date('2026-01-01T00:00:00.000Z'), banned: 1,
            banReason: undefined, banExpires: '2026-07-16T09:59:59.000Z', moderationVersion: '3',
        };
        expect(suspensionStatus(row, Date.parse('2026-07-16T10:00:00.000Z'))).toBe('expired');
        expect(accountDto(row)).toEqual({
            id: 'user-1', email: 'user@test.dev', username: null, role: 'user',
            createdAt: '2026-01-01T00:00:00.000Z', suspensionStatus: 'expired',
            banExpires: '2026-07-16T09:59:59.000Z', moderationVersion: 3, banReason: null,
        });
        expect(suspensionStatus({ banned: false, banExpires: null })).toBe('none');
        expect(suspensionStatus({ banned: true, banExpires: null })).toBe('active');
    });

    it('locks the target user on PostgreSQL with one parameter', async () => {
        const row = { id: 'user-1' };
        const txQuery = vi.fn(async () => [row]);
        await expect(lockUser('user-1', txQuery)).resolves.toBe(row);
        expect(txQuery).toHaveBeenCalledWith(
            `SELECT id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"
         FROM "user" WHERE id = $1 FOR UPDATE`,
            ['user-1'],
        );
    });
});
