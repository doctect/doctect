// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../../../server/migrations/index.js';

const dbCalls = vi.hoisted(() => []);
vi.mock('../../../server/db.js', () => ({
    dbType: 'postgres',
    query: vi.fn(async () => { throw new Error('Migration query escaped transaction'); }),
    withTransaction: vi.fn(async callback => callback(async (text, params = []) => {
        dbCalls.push({ text, params });
        if (text === 'SELECT id FROM app_migrations') {
            return migrations.filter(migration => migration.id !== '010_published_metadata').map(migration => ({ id: migration.id }));
        }
        return [];
    })),
}));

describe('PostgreSQL migration contract', () => {
    beforeEach(() => {
        dbCalls.length = 0;
        vi.resetModules();
    });

    it('locks before re-reading applied IDs and uses PostgreSQL SQL in one transaction', async () => {
        const { runMigrations } = await import('../../../server/migrations.js');
        await runMigrations();

        const texts = dbCalls.map(call => call.text);
        const lockIndex = texts.indexOf('SELECT pg_advisory_xact_lock($1)');
        const appliedIndex = texts.indexOf('SELECT id FROM app_migrations');
        expect(lockIndex).toBeGreaterThanOrEqual(0);
        expect(dbCalls[lockIndex].params).toHaveLength(1);
        expect(appliedIndex).toBeGreaterThan(lockIndex);
        expect(texts).toContain('ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_name TEXT');
        expect(texts).not.toContain('ALTER TABLE projects ADD COLUMN published_name TEXT');
        expect(dbCalls).toContainEqual({
            text: 'INSERT INTO app_migrations (id) VALUES ($1)',
            params: ['010_published_metadata'],
        });
    });
});
