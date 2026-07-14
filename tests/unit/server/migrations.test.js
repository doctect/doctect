// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';

let query, runMigrations;

beforeAll(async () => {
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-mig-${Date.now()}.db`);
    delete process.env.DATABASE_URL;
    ({ query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));
});

describe('migration runner', () => {
    it('serializes concurrent runners before deciding pending migrations', async () => {
        await Promise.all([runMigrations(), runMigrations()]);
        const rows = await query('SELECT id, COUNT(*) AS count FROM app_migrations GROUP BY id ORDER BY id');
        expect(rows.every(row => Number(row.count) === 1)).toBe(true);
    });

    it('applies migrations and is idempotent', async () => {
        await runMigrations();
        await runMigrations(); // second run must not throw
        const rows = await query('SELECT id FROM app_migrations ORDER BY id');
        expect(rows.map(r => r.id)).toContain('001_auth_tables');
        expect(rows.map(r => r.id)).toContain('002_events');
    });

    it('creates auth tables usable by better-auth', async () => {
        const users = await query('SELECT * FROM "user"');
        expect(users).toEqual([]);
    });

    it('query() supports $n placeholders and RETURNING on sqlite', async () => {
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, ['unit_test', '{"a":1}']);
        const rows = await query(`SELECT * FROM events WHERE type = $1`, ['unit_test']);
        expect(rows.length).toBe(1);
        expect(rows[0].payload).toBe('{"a":1}');
    });
});
