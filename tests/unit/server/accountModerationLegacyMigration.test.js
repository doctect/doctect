// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { migrations } from '../../../server/migrations/index.js';

let query;
let runMigrations;

beforeAll(async () => {
    const sqlitePath = path.join(os.tmpdir(), `doctect-legacy-moderation-${Date.now()}.db`);
    const legacyDb = new Database(sqlitePath);
    legacyDb.exec(`CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER,
        image TEXT,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        role TEXT,
        banned INTEGER,
        banReason TEXT,
        banExpires DATETIME
    )`);
    legacyDb.prepare(`INSERT INTO user
        (id, name, email, emailVerified, createdAt, updatedAt, role, banned, banReason, banExpires)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'legacy-user', 'Legacy', 'legacy@test.dev', 1,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, 1,
        'Existing suspension', '2026-08-01T00:00:00.000Z',
    );
    legacyDb.close();

    process.env.SQLITE_PATH = sqlitePath;
    process.env.DATABASE_URL = '';
    ({ query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));
});

describe('011 legacy setup compatibility', () => {
    it('migrates setup_db users with existing suspension fields', async () => {
        await runMigrations();

        const user = (await query(`SELECT role, banned, "banReason", "banExpires", "moderationVersion"
            FROM "user" WHERE id = $1`, ['legacy-user']))[0];
        expect(user.role).toBeNull();
        expect(Number(user.banned)).toBe(1);
        expect(user.banReason).toBe('Existing suspension');
        expect(user.banExpires).toBe('2026-08-01T00:00:00.000Z');
        expect(user.moderationVersion).toBe(0);

        const applied = await query('SELECT id FROM app_migrations WHERE id = $1', ['011_account_moderation']);
        expect(applied).toEqual([{ id: '011_account_moderation' }]);
        const columns = await query('PRAGMA table_info(moderation_actions)');
        expect(columns.map(column => column.name)).toContain('actor_user_id');
        const indexes = await query('PRAGMA index_list(moderation_actions)');
        expect(indexes.map(index => index.name)).toEqual(expect.arrayContaining([
            'idx_moderation_actions_target_time',
            'idx_moderation_actions_actor_time',
        ]));
        const triggers = await query(`SELECT name FROM sqlite_master
            WHERE type = 'trigger' AND tbl_name = 'moderation_actions' ORDER BY name`);
        expect(triggers.map(trigger => trigger.name)).toEqual([
            'moderation_actions_no_delete',
            'moderation_actions_no_update',
        ]);
    });

    it('does not hide unrelated SQLite migration errors', async () => {
        const invalidMigration = {
            id: '999_invalid_sqlite_migration',
            pg: 'SELECT 1',
            sqlite: 'ALTER TABLE missing_table ADD COLUMN value TEXT',
        };
        migrations.push(invalidMigration);
        try {
            await expect(runMigrations()).rejects.toThrow('no such table: missing_table');
            const applied = await query('SELECT id FROM app_migrations WHERE id = $1', [invalidMigration.id]);
            expect(applied).toEqual([]);
        } finally {
            migrations.pop();
        }
    });
});
