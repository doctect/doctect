// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestApp } from './helpers.js';

let assertOwnerConfiguration;
let canModerateRole;
let effectiveRole;
let getOwnerEmails;
let isConfiguredOwner;
let normalizeEmail;
let parseOwnerEmails;
let query;
let reconcileOwnerAuthority;

const originalOwnerEmails = process.env.OWNER_EMAILS;

beforeAll(async () => {
    await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    ({
        assertOwnerConfiguration,
        canModerateRole,
        effectiveRole,
        getOwnerEmails,
        isConfiguredOwner,
        normalizeEmail,
        parseOwnerEmails,
        reconcileOwnerAuthority,
    } = await import('../../../server/ownerAuthority.js'));
});

afterEach(async () => {
    if (originalOwnerEmails === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = originalOwnerEmails;
    await query('DROP TRIGGER IF EXISTS fail_owner_reconciliation_audit');
});

const insertUser = async ({ id, email, role, moderationVersion = 0 }) => {
    const now = new Date().toISOString();
    await query(`INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt", role, "moderationVersion")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, id, email, 1, now, now, role, moderationVersion]);
};

const insertSession = async userId => {
    const now = new Date().toISOString();
    await query(`INSERT INTO session
        (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
        VALUES ($1, $2, $3, $4, $5, $6)`,
    [`session-${userId}`, new Date(Date.now() + 3600000).toISOString(), `token-${userId}`, now, now, userId]);
};

describe('owner authority policy', () => {
    it('normalizes and deduplicates configured owner emails', () => {
        expect(normalizeEmail(' Owner@Example.COM ')).toBe('owner@example.com');
        expect(normalizeEmail(null)).toBe('');
        expect([...parseOwnerEmails(' Owner@Example.COM, second@test.dev,owner@example.com, ,')])
            .toEqual(['owner@example.com', 'second@test.dev']);
        expect([...getOwnerEmails({ OWNER_EMAILS: 'First@Test.dev, SECOND@test.dev' })])
            .toEqual(['first@test.dev', 'second@test.dev']);
    });

    it('collapses unknown stored roles to user authority', () => {
        expect(effectiveRole(null)).toBe('user');
        expect(effectiveRole('unexpected')).toBe('user');
        expect(effectiveRole('user')).toBe('user');
        expect(effectiveRole('admin')).toBe('admin');
        expect(effectiveRole('owner')).toBe('owner');
    });

    it('requires both an owner role and a configured normalized email', () => {
        const env = { OWNER_EMAILS: ' OWNER@example.com ' };
        expect(isConfiguredOwner({ role: 'owner', email: 'Owner@Example.com' }, env)).toBe(true);
        expect(isConfiguredOwner({ role: 'admin', email: 'owner@example.com' }, env)).toBe(false);
        expect(isConfiguredOwner({ role: 'owner', email: 'other@example.com' }, env)).toBe(false);
    });

    it('enforces the owner and admin moderation hierarchy', () => {
        expect(canModerateRole('admin', 'user')).toBe(true);
        expect(canModerateRole('admin', 'admin')).toBe(false);
        expect(canModerateRole('admin', 'owner')).toBe(false);
        expect(canModerateRole('owner', 'user')).toBe(true);
        expect(canModerateRole('owner', 'admin')).toBe(true);
        expect(canModerateRole('owner', 'owner')).toBe(false);
        expect(canModerateRole('unexpected', 'user')).toBe(false);
    });

    it('requires at least one configured owner only in production', () => {
        expect(() => assertOwnerConfiguration({ NODE_ENV: 'production', OWNER_EMAILS: ' , ' }))
            .toThrow('OWNER_EMAILS must contain at least one email in production');
        expect(() => assertOwnerConfiguration({ NODE_ENV: 'production', OWNER_EMAILS: 'owner@test.dev' }))
            .not.toThrow();
        expect(() => assertOwnerConfiguration({ NODE_ENV: 'test', OWNER_EMAILS: '' })).not.toThrow();
    });
});

describe('owner authority reconciliation', () => {
    it('atomically synchronizes configured and stale owners in stable ID order', async () => {
        const users = [
            { id: 'reconcile-e-admin', email: 'ordinary-admin@test.dev', role: 'admin', moderationVersion: 5 },
            { id: 'reconcile-d-stale', email: 'stale-owner@test.dev', role: 'owner', moderationVersion: 4 },
            { id: 'reconcile-c-retained', email: 'retained-owner@test.dev', role: 'owner', moderationVersion: 3 },
            { id: 'reconcile-b-admin', email: 'configured-admin@test.dev', role: 'admin', moderationVersion: 2 },
            { id: 'reconcile-a-user', email: 'configured-user@test.dev', role: 'user', moderationVersion: 1 },
        ];
        for (const user of users) {
            await insertUser(user);
            await insertSession(user.id);
        }
        process.env.OWNER_EMAILS = [
            ' Configured-User@test.dev ',
            'configured-admin@test.dev',
            'retained-owner@test.dev',
            'absent-owner@test.dev',
        ].join(',');

        const actions = await reconcileOwnerAuthority();
        const rows = await query(`SELECT id, role, "moderationVersion" FROM "user"
            WHERE id LIKE 'reconcile-%' ORDER BY id`);
        expect(Object.fromEntries(rows.map(row => [row.id, { role: row.role, version: Number(row.moderationVersion) }])))
            .toEqual({
                'reconcile-a-user': { role: 'owner', version: 2 },
                'reconcile-b-admin': { role: 'owner', version: 3 },
                'reconcile-c-retained': { role: 'owner', version: 3 },
                'reconcile-d-stale': { role: 'user', version: 5 },
                'reconcile-e-admin': { role: 'admin', version: 5 },
            });
        expect(actions.map(action => action.targetUserId)).toEqual([
            'reconcile-a-user', 'reconcile-b-admin', 'reconcile-d-stale',
        ]);
        expect(await query(`SELECT "userId" FROM session
            WHERE "userId" IN ($1, $2, $3) ORDER BY "userId"`,
        ['reconcile-a-user', 'reconcile-b-admin', 'reconcile-d-stale'])).toEqual([]);
        expect(await query(`SELECT "userId" FROM session
            WHERE "userId" IN ($1, $2) ORDER BY "userId"`,
        ['reconcile-c-retained', 'reconcile-e-admin'])).toEqual([
            { userId: 'reconcile-c-retained' },
            { userId: 'reconcile-e-admin' },
        ]);

        const audits = await query(`SELECT actor_kind, actor_user_id, actor_email, target_user_id,
            action, reason, metadata_json FROM platform_audit_actions
            WHERE target_user_id LIKE 'reconcile-%' ORDER BY rowid`);
        expect(audits).toHaveLength(3);
        expect(audits[0]).toEqual(expect.objectContaining({
            actor_kind: 'system',
            actor_user_id: null,
            actor_email: 'OWNER_EMAILS reconciliation',
            target_user_id: 'reconcile-a-user',
            action: 'owner_granted',
            reason: 'Synchronize account role with OWNER_EMAILS configuration',
        }));
        expect(JSON.parse(audits[0].metadata_json)).toEqual({
            source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner',
        });
        expect(JSON.parse(audits[1].metadata_json)).toEqual({
            source: 'owner_emails_reconciliation', previousRole: 'admin', newRole: 'owner',
        });
        expect(audits[2]).toEqual(expect.objectContaining({
            target_user_id: 'reconcile-d-stale', action: 'owner_removed',
        }));
        expect(JSON.parse(audits[2].metadata_json)).toEqual({
            source: 'owner_emails_reconciliation', previousRole: 'owner', newRole: 'user',
        });

        expect(await reconcileOwnerAuthority()).toEqual([]);
        expect(await query(`SELECT id FROM platform_audit_actions
            WHERE target_user_id LIKE 'reconcile-%'`)).toHaveLength(3);
        expect(await query('SELECT id FROM "user" WHERE email = $1', ['absent-owner@test.dev'])).toEqual([]);
    });

    it('rolls back scoped role, version, and session changes when audit insertion fails', async () => {
        const user = {
            id: 'reconcile-rollback', email: 'rollback-owner@test.dev', role: 'user', moderationVersion: 7,
        };
        await insertUser(user);
        await insertSession(user.id);
        process.env.OWNER_EMAILS = user.email;
        const beforeUser = await query(`SELECT role, "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [user.id]);
        const beforeSessions = await query('SELECT id FROM session WHERE "userId" = $1', [user.id]);
        await query(`CREATE TRIGGER fail_owner_reconciliation_audit
            BEFORE INSERT ON platform_audit_actions
            BEGIN SELECT RAISE(ABORT, 'injected owner audit failure'); END`);

        await expect(reconcileOwnerAuthority({ userId: user.id }))
            .rejects.toThrow('injected owner audit failure');

        expect(await query(`SELECT role, "moderationVersion", "updatedAt"
            FROM "user" WHERE id = $1`, [user.id])).toEqual(beforeUser);
        expect(await query('SELECT id FROM session WHERE "userId" = $1', [user.id])).toEqual(beforeSessions);
        expect(await query('SELECT id FROM platform_audit_actions WHERE target_user_id = $1', [user.id]))
            .toEqual([]);
    });
});
