// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { migrations } from '../../../server/migrations/index.js';

let query;
let runMigrations;

beforeAll(async () => {
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-moderation-migration-${Date.now()}.db`);
    process.env.DATABASE_URL = '';
    ({ query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));
    await runMigrations();
});

describe('011 account moderation migration', () => {
    it('uses statement arrays so trigger bodies remain intact on both databases', () => {
        const migration = migrations.find(item => item.id === '011_account_moderation');
        expect(migration).toBeDefined();
        expect(Array.isArray(migration.pg)).toBe(true);
        expect(Array.isArray(migration.sqlite)).toBe(true);
        expect(migration.pg.some(sql => sql.includes('CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()'))).toBe(true);
        expect(migration.sqlite.some(sql => sql.includes("RAISE(ABORT, 'moderation_actions is append-only')"))).toBe(true);
    });

    it('declares equivalent PostgreSQL and SQLite fields, indexes, and guards', () => {
        const migration = migrations.find(item => item.id === '011_account_moderation');
        for (const dialect of ['pg', 'sqlite']) {
            const sql = migration[dialect].join('\n');
            for (const field of ['banReason', 'banExpires', 'moderationVersion', 'actor_user_id',
                'actor_email', 'target_user_id', 'target_email', 'action', 'reason', 'expires_at',
                'project_id', 'created_at']) {
                expect(sql).toContain(field);
            }
            expect(sql).toContain('idx_moderation_actions_target_time');
            expect(sql).toContain('idx_moderation_actions_actor_time');
            expect(sql).toContain('moderation_actions_no_update');
            expect(sql).toContain('moderation_actions_no_delete');
        }
    });

    it('migrates a pre-011 ordinary user without changing access state', () => {
        const legacyDb = new Database(':memory:');
        const moderationIndex = migrations.findIndex(item => item.id === '011_account_moderation');
        for (const migration of migrations.slice(0, moderationIndex)) {
            const sql = migration.sqlite ?? migration.pg;
            for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
                legacyDb.exec(statement);
            }
        }
        legacyDb.prepare(`INSERT INTO "user"
            (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            'legacy-user', 'Legacy', 'legacy@test.dev', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, 0,
        );
        const migration = migrations.find(item => item.id === '011_account_moderation');
        legacyDb.transaction(() => {
            for (const statement of migration.sqlite) legacyDb.exec(statement);
        })();
        const user = legacyDb.prepare('SELECT banned, "banReason", "banExpires", "moderationVersion" FROM "user" WHERE id = ?').get('legacy-user');
        expect(Number(user.banned)).toBe(0);
        expect(user.banReason).toBeNull();
        expect(user.banExpires).toBeNull();
        expect(user.moderationVersion).toBe(0);
        legacyDb.close();
    });

    it('adds compatible user fields with a non-null version default', async () => {
        const columns = await query('PRAGMA table_info("user")');
        const byName = Object.fromEntries(columns.map(column => [column.name, column]));
        expect(byName.banReason).toBeDefined();
        expect(byName.banExpires).toBeDefined();
        expect(byName.moderationVersion).toBeDefined();
        expect(byName.moderationVersion.notnull).toBe(1);
        expect(byName.moderationVersion.dflt_value).toBe('0');
    });

    it('creates audit columns and target/actor time indexes', async () => {
        const columns = await query('PRAGMA table_info(moderation_actions)');
        expect(columns.map(column => column.name)).toEqual([
            'id', 'actor_user_id', 'actor_email', 'target_user_id', 'target_email',
            'action', 'reason', 'expires_at', 'project_id', 'created_at',
        ]);
        const indexes = await query('PRAGMA index_list(moderation_actions)');
        expect(indexes.map(index => index.name)).toEqual(expect.arrayContaining([
            'idx_moderation_actions_target_time',
            'idx_moderation_actions_actor_time',
        ]));
    });

    it('accepts inserts and rejects direct updates and deletes', async () => {
        const values = [
            'audit-1', 'admin-1', 'admin@test.dev', 'legacy-user', 'legacy@test.dev',
            'account_suspended', 'Confirmed abuse', null, null, '2026-07-16T12:00:00.000Z',
        ];
        await query(`INSERT INTO moderation_actions
            (id, actor_user_id, actor_email, target_user_id, target_email, action, reason, expires_at, project_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, values);
        await expect(query('UPDATE moderation_actions SET reason = $1 WHERE id = $2', ['changed', 'audit-1']))
            .rejects.toThrow('moderation_actions is append-only');
        await expect(query('DELETE FROM moderation_actions WHERE id = $1', ['audit-1']))
            .rejects.toThrow('moderation_actions is append-only');
        expect((await query('SELECT reason FROM moderation_actions WHERE id = $1', ['audit-1']))[0].reason)
            .toBe('Confirmed abuse');
    });
});

describe('012 session suspension guard migration', () => {
    it('uses intact statement arrays for both trigger dialects', () => {
        const migration = migrations.find(item => item.id === '012_session_suspension_guard');
        expect(migration).toBeDefined();
        expect(Array.isArray(migration.pg)).toBe(true);
        expect(Array.isArray(migration.sqlite)).toBe(true);
        expect(migration.pg.some(sql => sql.includes('CREATE OR REPLACE FUNCTION guard_session_insert_for_suspension()'))).toBe(true);
        expect(migration.sqlite.some(sql => sql.includes('CREATE TRIGGER session_suspension_guard'))).toBe(true);
    });

    it('allows unbanned and expired users but rejects active session inserts on SQLite', async () => {
        const timestamp = '2026-01-01T00:00:00.000Z';
        const users = [
            ['session-unbanned', 0, null],
            ['session-active-indefinite', 1, null],
            ['session-active-future', 1, '2999-01-01T00:00:00.000Z'],
            ['session-expired', 1, '2000-01-01T00:00:00.000Z'],
        ];
        for (const [id, banned, banExpires] of users) {
            await query(`INSERT INTO "user"
                (id, name, email, "emailVerified", "createdAt", "updatedAt", banned, "banExpires")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, id, `${id}@test.dev`, 1, timestamp, timestamp, banned, banExpires]);
        }
        const insertSession = userId => query(`INSERT INTO session
            (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
            VALUES ($1, $2, $3, $4, $5, $6)`,
        [`session-for-${userId}`, '2999-01-01T00:00:00.000Z', `token-${userId}`, timestamp, timestamp, userId]);

        await expect(insertSession('session-unbanned')).resolves.toEqual([]);
        await expect(insertSession('session-active-indefinite')).rejects.toThrow('session creation blocked for suspended user');
        await expect(insertSession('session-active-future')).rejects.toThrow('session creation blocked for suspended user');
        await expect(insertSession('session-expired')).resolves.toEqual([]);
    });
});
