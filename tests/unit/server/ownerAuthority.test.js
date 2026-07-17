// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestApp } from './helpers.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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
    await query('DROP TRIGGER IF EXISTS fail_second_owner_reconciliation_audit');
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

describe('repository configuration', () => {
    it('uses owner authority as the production root of trust', () => {
        const readRepositoryFile = relativePath => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
        const retiredAdminVariable = ['ADMIN', 'EMAILS'].join('_');
        const retiredAdminHelper = ['makeUser', 'Admin'].join('');
        const activeFiles = [
            '.env.example',
            'deploy.sh',
            'Dockerfile',
            'README.md',
            'docs/8-cloud-and-gallery.md',
            'playwright.config.cjs',
            'server/auth.js',
            'server/db.js',
            'tests/unit/server/helpers.js',
        ].map(readRepositoryFile).join('\n');
        const dockerfile = readRepositoryFile('Dockerfile');
        const envExample = readRepositoryFile('.env.example');
        const deployScript = readRepositoryFile('deploy.sh');
        const playwrightConfig = readRepositoryFile('playwright.config.cjs');
        const unitHelpers = readRepositoryFile('tests/unit/server/helpers.js');
        const readme = readRepositoryFile('README.md');
        const cloudDocs = readRepositoryFile('docs/8-cloud-and-gallery.md');
        const rolloutRunbook = readRepositoryFile('docs/9-owner-moderator-rollout.md');

        expect(activeFiles).not.toContain(retiredAdminVariable);
        expect(activeFiles).not.toContain(retiredAdminHelper);
        const retiredAdminScript = ['make', 'admin.js'].join('_');
        const activeRepositorySearch = spawnSync('git', [
            'grep', '-n', '-E', `${retiredAdminVariable}|${retiredAdminHelper}|${retiredAdminScript}`,
            '--', '.', ':!docs/superpowers/plans/**', ':!docs/superpowers/specs/**',
        ], { cwd: repositoryRoot, encoding: 'utf8' });
        expect(activeRepositorySearch.stderr).toBe('');
        expect(activeRepositorySearch.stdout).toBe('');
        expect(activeRepositorySearch.status).toBe(1);
        expect(fs.existsSync(path.join(repositoryRoot, 'server/scripts', retiredAdminScript))).toBe(false);
        expect(fs.existsSync(path.join(repositoryRoot, 'server/scripts/setup_db.js'))).toBe(false);
        expect(dockerfile).toContain('ENV NODE_ENV=production');
        expect(envExample).toContain('OWNER_EMAILS=owner@example.com,backup-owner@example.com');
        expect(envExample).toMatch(/sole deployment-controlled owner root of trust/i);
        expect(deployScript.match(/--set-env-vars "\^;\^OWNER_EMAILS=\$\{OWNER_EMAILS\}"/g)).toHaveLength(2);
        expect(deployScript).toContain('OWNER_EMAILS_NORMALIZED');
        expect(playwrightConfig).toContain('OWNER_EMAILS: e2eOwnerEmail');
        expect(unitHelpers).toContain("process.env.OWNER_EMAILS = ''");
        expect(readme).toContain('npm run server');
        expect(readme).toContain('npm run dev');
        expect(readme).toMatch(/migrations at startup/i);
        expect(cloudDocs).toContain('actor kind `system`, null actor user ID, actor label `OWNER_EMAILS reconciliation`, and fixed reason `Synchronize account role with OWNER_EMAILS configuration`');
        expect(rolloutRunbook).toContain('changed_sessions_zero');
        expect(rolloutRunbook).toContain('DISPOSABLE_ADMIN_EMAIL');
        expect(rolloutRunbook).toContain('Expected at least one matching `admin_demoted` action');
        expect(rolloutRunbook).toContain('seq 1 26');
        expect(rolloutRunbook).toContain('page1Ids.some(id => page2Ids.has(id))');
        expect(rolloutRunbook).toContain('CREATE TRIGGER :"trigger_name"');
        expect(rolloutRunbook).toContain('trap cleanup_audit_failure_probe EXIT INT TERM');
        expect(rolloutRunbook.match(/--path-as-is/g)).toHaveLength(3);
        expect(rolloutRunbook).toContain('mktemp -d /tmp/opencode/doctect-owner-rollout.XXXXXX');
        expect(rolloutRunbook).toContain('ROLLOUT_SERVER_PID=$!');
        expect(rolloutRunbook).toContain('ROLLOUT_SERVER_LOG');
        expect(rolloutRunbook).toContain('${BASE_URL}/api/me');
        expect(rolloutRunbook).toContain('read -r ROLLOUT_STARTED_AT < "$ROLLOUT_MARKER_FILE"');
        expect(rolloutRunbook).toContain('trap cleanup_rollout_server EXIT');
        expect(rolloutRunbook).toContain('inspect restricted log');
        expect(rolloutRunbook).toContain('assert_rollout_port_free');
        expect(rolloutRunbook).toContain('net.createServer()');
        expect(rolloutRunbook).toContain('EADDRINUSE');
        expect(rolloutRunbook).toContain('ROLLOUT_LISTEN_MARKER="Server running on http://localhost:${ROLLOUT_PORT}"');
        expect(rolloutRunbook).toContain('log.split(/\\r?\\n/).includes(marker)');
        expect(rolloutRunbook).toContain('managed_rollout_server_alive');
    });
});

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

    it('rolls back every user when the second full-reconciliation audit fails', async () => {
        const users = [
            { id: '00-reconcile-batch-a', email: 'batch-a@test.dev', role: 'user', moderationVersion: 10 },
            { id: '00-reconcile-batch-b', email: 'batch-b@test.dev', role: 'admin', moderationVersion: 20 },
        ];
        for (const user of users) {
            await insertUser(user);
            await insertSession(user.id);
        }
        process.env.OWNER_EMAILS = users.map(user => user.email).join(',');
        const beforeUsers = await query(`SELECT id, role, "moderationVersion", "updatedAt" FROM "user"
            WHERE id IN ($1, $2) ORDER BY id`, users.map(user => user.id));
        const beforeSessions = await query(`SELECT id, "userId" FROM session
            WHERE "userId" IN ($1, $2) ORDER BY id`, users.map(user => user.id));
        const beforeAudits = await query('SELECT * FROM platform_audit_actions ORDER BY id');
        await query(`CREATE TRIGGER fail_second_owner_reconciliation_audit
            BEFORE INSERT ON platform_audit_actions
            WHEN NEW.target_user_id LIKE '00-reconcile-batch-%'
                AND (SELECT COUNT(*) FROM platform_audit_actions
                    WHERE target_user_id LIKE '00-reconcile-batch-%') = 1
            BEGIN SELECT RAISE(ABORT, 'injected second owner audit failure'); END`);

        await expect(reconcileOwnerAuthority()).rejects.toThrow('injected second owner audit failure');

        expect(await query(`SELECT id, role, "moderationVersion", "updatedAt" FROM "user"
            WHERE id IN ($1, $2) ORDER BY id`, users.map(user => user.id))).toEqual(beforeUsers);
        expect(await query(`SELECT id, "userId" FROM session
            WHERE "userId" IN ($1, $2) ORDER BY id`, users.map(user => user.id))).toEqual(beforeSessions);
        expect(await query('SELECT * FROM platform_audit_actions ORDER BY id')).toEqual(beforeAudits);
    });
});
