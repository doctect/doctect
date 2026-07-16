// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';

const migrationFault = vi.hoisted(() => ({ failAfterPublishedCommitColumn: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (migrationFault.failAfterPublishedCommitColumn
            && /CREATE TABLE IF NOT EXISTS project_publications/.test(text)) {
            migrationFault.failAfterPublishedCommitColumn = false;
            throw new Error('Injected 009 failure after first statement');
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
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-published-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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
    ]) {
        await query('INSERT INTO app_migrations (id) VALUES ($1)', [id]);
    }
    await query(`CREATE TABLE "user" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
        image TEXT,
        "createdAt" TIMESTAMP NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL,
        role TEXT,
        banned BOOLEAN,
        username TEXT,
        "displayUsername" TEXT
    )`);
    await query(`CREATE TABLE session (
        id TEXT PRIMARY KEY,
        "expiresAt" TIMESTAMP NOT NULL,
        token TEXT NOT NULL UNIQUE,
        "createdAt" TIMESTAMP NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    )`);
    await query(`CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        visibility TEXT NOT NULL,
        head_commit_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE commits (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL
    )`);
    await query('INSERT INTO projects (id, name, description, tags, visibility, head_commit_id) VALUES ($1, $2, $3, $4, $5, $6)',
        ['public-project', 'Public name', 'Public description', '["public"]', 'public', 'public-head']);
    await query('INSERT INTO projects (id, name, description, tags, visibility, head_commit_id) VALUES ($1, $2, $3, $4, $5, $6)',
        ['private-project', 'Private name', 'Private description', '["private"]', 'private', 'private-head']);
    await query('INSERT INTO commits (id, project_id) VALUES ($1, $2)', ['public-head', 'public-project']);
    await query('INSERT INTO commits (id, project_id) VALUES ($1, $2)', ['private-head', 'private-project']);
});

afterAll(() => database.close());

describe('published snapshot migration', () => {
    it('rolls back a partial 009 migration and succeeds on restart', async () => {
        migrationFault.failAfterPublishedCommitColumn = true;
        await expect(runMigrations()).rejects.toThrow('Injected 009 failure after first statement');

        const columns = await query('PRAGMA table_info(projects)');
        expect(columns.map(column => column.name)).not.toContain('published_commit_id');
        expect(await query('SELECT id FROM app_migrations WHERE id = $1', ['009_published_snapshots'])).toEqual([]);

        await runMigrations();
        await runMigrations();

        const projects = await query('SELECT id, published_commit_id FROM projects ORDER BY id');
        expect(projects).toEqual([
            { id: 'private-project', published_commit_id: null },
            { id: 'public-project', published_commit_id: 'public-head' },
        ]);
        expect(await query('SELECT project_id, commit_id FROM project_publications')).toEqual([
            { project_id: 'public-project', commit_id: 'public-head' },
        ]);
        expect(await query(`SELECT published_name, published_description, published_tags
            FROM projects WHERE id = $1`, ['public-project'])).toEqual([{
            published_name: 'Public name',
            published_description: 'Public description',
            published_tags: '["public"]',
        }]);
    });
});
