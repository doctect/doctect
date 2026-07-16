// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../../../server/migrations/index.js';

const dbCalls = vi.hoisted(() => []);
const migrationState = vi.hoisted(() => ({ pendingId: '010_published_metadata' }));
vi.mock('../../../server/db.js', () => ({
    dbType: 'postgres',
    query: vi.fn(async () => { throw new Error('Migration query escaped transaction'); }),
    withTransaction: vi.fn(async callback => callback(async (text, params = []) => {
        dbCalls.push({ text, params });
        if (text === 'SELECT id FROM app_migrations') {
            return migrations
                .filter(migration => migration.id !== migrationState.pendingId)
                .map(migration => ({ id: migration.id }));
        }
        return [];
    })),
}));

describe('PostgreSQL migration contract', () => {
    beforeEach(() => {
        dbCalls.length = 0;
        migrationState.pendingId = '010_published_metadata';
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

    it('executes PostgreSQL moderation trigger bodies as intact array statements', async () => {
        migrationState.pendingId = '011_account_moderation';
        const { runMigrations } = await import('../../../server/migrations.js');
        await runMigrations();

        const texts = dbCalls.map(call => call.text);
        expect(texts).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" TEXT');
        expect(texts).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP');
        expect(texts).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "moderationVersion" INTEGER NOT NULL DEFAULT 0');
        const functionStatement = texts.find(text => text.includes('CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()'));
        expect(functionStatement).toBe(`CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()
             RETURNS trigger AS $$
             BEGIN
                 RAISE EXCEPTION 'moderation_actions is append-only';
             END;
             $$ LANGUAGE plpgsql`);
        expect(texts).toContain(`CREATE TRIGGER moderation_actions_no_update
                BEFORE UPDATE ON moderation_actions
                FOR EACH ROW EXECUTE FUNCTION reject_moderation_action_mutation()`);
        expect(texts).toContain(`CREATE TRIGGER moderation_actions_no_delete
                BEFORE DELETE ON moderation_actions
                FOR EACH ROW EXECUTE FUNCTION reject_moderation_action_mutation()`);
        expect(dbCalls).toContainEqual({
            text: 'INSERT INTO app_migrations (id) VALUES ($1)',
            params: ['011_account_moderation'],
        });
    });
});
