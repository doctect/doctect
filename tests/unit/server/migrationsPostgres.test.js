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

    it('executes exact PostgreSQL session suspension guard statements intact', async () => {
        migrationState.pendingId = '012_session_suspension_guard';
        const { runMigrations } = await import('../../../server/migrations.js');
        await runMigrations();

        const texts = dbCalls.map(call => call.text);
        expect(texts).toContain(`CREATE OR REPLACE FUNCTION guard_session_insert_for_suspension()
             RETURNS trigger AS $$
             DECLARE
                 referenced_banned BOOLEAN;
                 referenced_ban_expires TIMESTAMP;
             BEGIN
                 SELECT banned, "banExpires"
                 INTO referenced_banned, referenced_ban_expires
                 FROM "user"
                 WHERE id = NEW."userId"
                 FOR UPDATE;
                 IF referenced_banned AND (referenced_ban_expires IS NULL OR referenced_ban_expires > CURRENT_TIMESTAMP) THEN
                     RAISE EXCEPTION 'session creation blocked for suspended user';
                 END IF;
                 RETURN NEW;
             END;
             $$ LANGUAGE plpgsql`);
        expect(texts).toContain('DROP TRIGGER IF EXISTS session_suspension_guard ON session');
        expect(texts).toContain(`CREATE TRIGGER session_suspension_guard
                BEFORE INSERT ON session
                FOR EACH ROW EXECUTE FUNCTION guard_session_insert_for_suspension()`);
        expect(dbCalls).toContainEqual({
            text: 'INSERT INTO app_migrations (id) VALUES ($1)',
            params: ['012_session_suspension_guard'],
        });
    });

    it('keeps 012 unchanged and appends a SQLite-safe 013 wall-clock migration', () => {
        const guardIndex = migrations.findIndex(migration => migration.id === '012_session_suspension_guard');
        const wallClockIndex = migrations.findIndex(migration => migration.id === '013_session_suspension_wall_clock');
        expect(wallClockIndex).toBe(guardIndex + 1);
        expect(migrations[guardIndex].pg[0]).toContain('referenced_ban_expires > CURRENT_TIMESTAMP');
        expect(migrations[guardIndex].pg.join('\n')).not.toContain('clock_timestamp()');
        expect(migrations[wallClockIndex].sqlite).toEqual(['SELECT 1']);
    });

    it('replaces the PostgreSQL trigger function with UTC wall-clock expiry evaluation', async () => {
        migrationState.pendingId = '013_session_suspension_wall_clock';
        const { runMigrations } = await import('../../../server/migrations.js');
        await runMigrations();

        const texts = dbCalls.map(call => call.text);
        expect(texts).toContain(`CREATE OR REPLACE FUNCTION guard_session_insert_for_suspension()
             RETURNS trigger AS $$
             DECLARE
                 referenced_banned BOOLEAN;
                 referenced_ban_expires TIMESTAMP;
             BEGIN
                 SELECT banned, "banExpires"
                 INTO referenced_banned, referenced_ban_expires
                 FROM "user"
                 WHERE id = NEW."userId"
                 FOR UPDATE;
                 IF referenced_banned AND (
                     referenced_ban_expires IS NULL
                     OR referenced_ban_expires > (clock_timestamp() AT TIME ZONE 'UTC')
                 ) THEN
                     RAISE EXCEPTION 'session creation blocked for suspended user';
                 END IF;
                 RETURN NEW;
             END;
             $$ LANGUAGE plpgsql`);
        expect(dbCalls).toContainEqual({
            text: 'INSERT INTO app_migrations (id) VALUES ($1)',
            params: ['013_session_suspension_wall_clock'],
        });
    });

    it('executes exact PostgreSQL platform audit statements intact', async () => {
        migrationState.pendingId = '014_platform_audit_actions';
        const { runMigrations } = await import('../../../server/migrations.js');
        await runMigrations();

        expect(migrations.slice(-4).map(({ id }) => id)).toEqual([
            '011_account_moderation',
            '012_session_suspension_guard',
            '013_session_suspension_wall_clock',
            '014_platform_audit_actions',
        ]);
        const texts = dbCalls.map(call => call.text);
        expect(texts).toContain(`CREATE TABLE IF NOT EXISTS platform_audit_actions (
      id TEXT PRIMARY KEY,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'system')),
      actor_user_id TEXT,
      actor_email TEXT NOT NULL,
      target_user_id TEXT,
      target_email TEXT,
      project_id TEXT,
      review_id TEXT,
      action TEXT NOT NULL CHECK (action IN ('owner_granted', 'owner_removed', 'admin_promoted', 'admin_demoted', 'account_suspended', 'account_restored', 'project_unpublished', 'review_deleted')),
      reason TEXT NOT NULL,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json JSONB NOT NULL,
      CHECK ((actor_kind = 'system' AND actor_user_id IS NULL) OR (actor_kind = 'user' AND actor_user_id IS NOT NULL))
    )`);
        expect(texts).toContain(`INSERT INTO platform_audit_actions
      (id, actor_kind, actor_user_id, actor_email, target_user_id, target_email, project_id, review_id, action, reason, expires_at, created_at, metadata_json)
     SELECT id, 'user', actor_user_id, actor_email, target_user_id, target_email, project_id, NULL,
            action, reason, expires_at, created_at,
            CASE action
              WHEN 'project_unpublished' THEN jsonb_build_object('source', 'account_workflow', 'previousProjectVisibility', 'public')
              ELSE jsonb_build_object('source', 'account_workflow')
            END
     FROM moderation_actions
     ON CONFLICT (id) DO NOTHING`);
        for (const indexStatement of [
            'CREATE INDEX IF NOT EXISTS idx_platform_audit_time ON platform_audit_actions(created_at DESC, id DESC)',
            'CREATE INDEX IF NOT EXISTS idx_platform_audit_target_time ON platform_audit_actions(target_user_id, created_at DESC, id DESC)',
            'CREATE INDEX IF NOT EXISTS idx_platform_audit_actor_email_time ON platform_audit_actions(LOWER(actor_email), created_at DESC, id DESC)',
            'CREATE INDEX IF NOT EXISTS idx_platform_audit_target_email_time ON platform_audit_actions(LOWER(target_email), created_at DESC, id DESC)',
            'CREATE INDEX IF NOT EXISTS idx_platform_audit_action_time ON platform_audit_actions(action, created_at DESC, id DESC)',
        ]) {
            expect(texts).toContain(indexStatement);
        }
        expect(texts).toContain(`CREATE OR REPLACE FUNCTION reject_platform_audit_action_mutation()
     RETURNS trigger AS $$
     BEGIN
       RAISE EXCEPTION 'platform_audit_actions is append-only';
     END;
     $$ LANGUAGE plpgsql`);
        expect(texts).toContain('CREATE TRIGGER platform_audit_actions_no_update BEFORE UPDATE ON platform_audit_actions FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_action_mutation()');
        expect(texts).toContain('CREATE TRIGGER platform_audit_actions_no_delete BEFORE DELETE ON platform_audit_actions FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_action_mutation()');
        expect(dbCalls).toContainEqual({
            text: 'INSERT INTO app_migrations (id) VALUES ($1)',
            params: ['014_platform_audit_actions'],
        });
    });
});
