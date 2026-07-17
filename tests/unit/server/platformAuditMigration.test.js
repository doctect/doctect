// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import { migrations } from '../../../server/migrations/index.js';

let query;
let runMigrations;

beforeAll(async () => {
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-platform-audit-${Date.now()}.db`);
    process.env.DATABASE_URL = '';
    ({ query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));

    const platformAuditIndex = migrations.findIndex(migration => migration.id === '014_platform_audit_actions');
    const pendingMigrations = migrations.splice(platformAuditIndex === -1 ? migrations.length : platformAuditIndex);
    try {
        await runMigrations();
        const rows = [
            ['legacy-suspended', 'admin-1', 'admin@test.dev', 'user-1', 'user1@test.dev', 'account_suspended', 'Confirmed abuse', '2026-08-01T00:00:00.000Z', null, '2026-07-16T10:00:00.000Z'],
            ['legacy-restored', 'admin-2', 'admin2@test.dev', 'user-2', 'user2@test.dev', 'account_restored', 'Appeal accepted', null, null, '2026-07-16T11:00:00.000Z'],
            ['legacy-unpublished', 'admin-3', 'admin3@test.dev', 'user-3', 'user3@test.dev', 'project_unpublished', 'Unsafe project', null, 'project-1', '2026-07-16T12:00:00.000Z'],
        ];
        for (const values of rows) {
            await query(`INSERT INTO moderation_actions
                (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, expires_at, project_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, values);
        }
    } finally {
        migrations.push(...pendingMigrations);
    }
    await runMigrations();
});

describe('014 platform audit actions migration', () => {
    it('backfills each legacy moderation action exactly once without changing the source table', async () => {
        expect((await query('SELECT COUNT(*) AS count FROM platform_audit_actions'))[0].count).toBe(3);
        expect(await query(`SELECT id, actor_kind, review_id, action, metadata_json
            FROM platform_audit_actions ORDER BY id`)).toEqual([
            { id: 'legacy-restored', actor_kind: 'user', review_id: null, action: 'account_restored', metadata_json: '{"source":"account_workflow"}' },
            { id: 'legacy-suspended', actor_kind: 'user', review_id: null, action: 'account_suspended', metadata_json: '{"source":"account_workflow"}' },
            { id: 'legacy-unpublished', actor_kind: 'user', review_id: null, action: 'project_unpublished', metadata_json: '{"source":"account_workflow","previousProjectVisibility":"public"}' },
        ]);

        await runMigrations();
        expect((await query('SELECT COUNT(*) AS count FROM platform_audit_actions'))[0].count).toBe(3);
        expect((await query('SELECT COUNT(*) AS count FROM moderation_actions'))[0].count).toBe(3);
        expect(await query('SELECT id, reason FROM moderation_actions ORDER BY id')).toEqual([
            { id: 'legacy-restored', reason: 'Appeal accepted' },
            { id: 'legacy-suspended', reason: 'Confirmed abuse' },
            { id: 'legacy-unpublished', reason: 'Unsafe project' },
        ]);
    });

    it('creates standalone JSON-backed audit storage with query indexes', async () => {
        expect((await query('PRAGMA table_info(platform_audit_actions)')).map(column => column.name)).toEqual([
            'id', 'actor_kind', 'actor_user_id', 'actor_email', 'target_user_id', 'target_email',
            'project_id', 'review_id', 'action', 'reason', 'expires_at', 'created_at', 'metadata_json',
        ]);
        expect(await query('PRAGMA foreign_key_list(platform_audit_actions)')).toEqual([]);
        expect((await query('SELECT json_valid(metadata_json) AS valid FROM platform_audit_actions'))
            .every(row => row.valid === 1)).toBe(true);
        expect((await query('PRAGMA index_list(platform_audit_actions)')).map(index => index.name)).toEqual(expect.arrayContaining([
            'idx_platform_audit_target_time',
            'idx_platform_audit_actor_email_time',
            'idx_platform_audit_target_email_time',
            'idx_platform_audit_action_time',
        ]));
    });

    it('allows inserts and rejects direct updates and deletes', async () => {
        await expect(query(`INSERT INTO platform_audit_actions
            (id, actor_kind, actor_user_id, actor_email, review_id, action, reason, created_at, metadata_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            'new-review-delete', 'system', null, 'system@doctect.local', 'review-1',
            'review_deleted', 'Policy violation', '2026-07-16T13:00:00.000Z', '{"source":"review_workflow"}',
        ])).resolves.toEqual([]);
        await expect(query(`UPDATE platform_audit_actions SET reason = $1 WHERE id = $2`, ['changed', 'legacy-restored']))
            .rejects.toThrow('platform_audit_actions is append-only');
        await expect(query('DELETE FROM platform_audit_actions WHERE id = $1', ['legacy-restored']))
            .rejects.toThrow('platform_audit_actions is append-only');
        expect((await query('SELECT reason FROM platform_audit_actions WHERE id = $1', ['legacy-restored']))[0].reason)
            .toBe('Appeal accepted');
    });
});
