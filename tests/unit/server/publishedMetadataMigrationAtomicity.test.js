// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';

const migrationFault = vi.hoisted(() => ({ mode: null }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (migrationFault.mode === 'second-statement'
            && /ALTER TABLE projects ADD COLUMN(?: IF NOT EXISTS)? published_description/.test(text)) {
            migrationFault.mode = null;
            throw new Error('Injected 010 failure after first statement');
        }
        if (migrationFault.mode === 'ledger'
            && /INSERT INTO app_migrations/.test(text)
            && params[0] === '010_published_metadata') {
            migrationFault.mode = null;
            throw new Error('Injected 010 ledger failure');
        }
        return baseQuery(text, params);
    };
    return {
        ...actual,
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

let database;
let query;
let runMigrations;

beforeAll(async () => {
    process.env.DATABASE_URL = '';
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-published-metadata-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    vi.resetModules();
    ({ default: database, query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));

    await query('CREATE TABLE app_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    for (const id of [
        '001_auth_tables',
        '002_events',
        '003_username',
        '004_projects_commits',
        '005_thumbnails_reports',
        '006_merge_requests',
        '007_commit_storage',
        '008_reviews',
        '009_published_snapshots',
    ]) {
        await query('INSERT INTO app_migrations (id) VALUES ($1)', [id]);
    }
    await query(`CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_commit_id TEXT
    )`);
    await query(
        'INSERT INTO projects (id, name, description, tags, published_commit_id) VALUES ($1, $2, $3, $4, $5)',
        ['published-project', 'Published name', 'Published description', '["published"]', 'published-head'],
    );
});

afterAll(() => database.close());

describe('published metadata migration atomicity', () => {
    it('rolls back statement and ledger failures, then succeeds on restart', async () => {
        migrationFault.mode = 'second-statement';
        await expect(runMigrations()).rejects.toThrow('Injected 010 failure after first statement');
        expect((await query('PRAGMA table_info(projects)')).map(column => column.name)).not.toContain('published_name');
        expect(await query('SELECT id FROM app_migrations WHERE id = $1', ['010_published_metadata'])).toEqual([]);

        migrationFault.mode = 'ledger';
        await expect(runMigrations()).rejects.toThrow('Injected 010 ledger failure');
        const afterLedgerFailure = (await query('PRAGMA table_info(projects)')).map(column => column.name);
        expect(afterLedgerFailure).not.toContain('published_name');
        expect(afterLedgerFailure).not.toContain('published_description');
        expect(afterLedgerFailure).not.toContain('published_tags');
        expect(afterLedgerFailure).not.toContain('published_at');
        expect(await query('SELECT id FROM app_migrations WHERE id = $1', ['010_published_metadata'])).toEqual([]);

        await runMigrations();
        expect(await query('SELECT id FROM app_migrations WHERE id = $1', ['010_published_metadata'])).toEqual([
            { id: '010_published_metadata' },
        ]);
        expect(await query('SELECT published_name, published_description, published_tags FROM projects')).toEqual([{
            published_name: 'Published name',
            published_description: 'Published description',
            published_tags: '["published"]',
        }]);
    });
});
