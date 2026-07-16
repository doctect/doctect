// Ordered list of migrations. NEVER edit an applied migration — append a new one.
export const migrations = [
    {
        id: '001_auth_tables',
        pg: `
            CREATE TABLE IF NOT EXISTS "user" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
                image TEXT,
                "createdAt" TIMESTAMP NOT NULL,
                "updatedAt" TIMESTAMP NOT NULL,
                role TEXT,
                banned BOOLEAN
            );
            CREATE TABLE IF NOT EXISTS session (
                id TEXT PRIMARY KEY,
                "expiresAt" TIMESTAMP NOT NULL,
                token TEXT NOT NULL UNIQUE,
                "createdAt" TIMESTAMP NOT NULL,
                "updatedAt" TIMESTAMP NOT NULL,
                "ipAddress" TEXT,
                "userAgent" TEXT,
                "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS account (
                id TEXT PRIMARY KEY,
                "accountId" TEXT NOT NULL,
                "providerId" TEXT NOT NULL,
                "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                "accessToken" TEXT,
                "refreshToken" TEXT,
                "idToken" TEXT,
                "accessTokenExpiresAt" TIMESTAMP,
                "refreshTokenExpiresAt" TIMESTAMP,
                scope TEXT,
                password TEXT,
                "createdAt" TIMESTAMP NOT NULL,
                "updatedAt" TIMESTAMP NOT NULL
            );
            CREATE TABLE IF NOT EXISTS verification (
                id TEXT PRIMARY KEY,
                identifier TEXT NOT NULL,
                value TEXT NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,
                "createdAt" TIMESTAMP,
                "updatedAt" TIMESTAMP
            )
        `
        // sqlite: same DDL works on better-sqlite3 (BOOLEAN/TIMESTAMP degrade to NUMERIC/TEXT affinity)
    },
    {
        id: '002_events',
        pg: `
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `,
        sqlite: `
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    {
        id: '003_username',
        pg: `
            ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username TEXT;
            ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "displayUsername" TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username)
        `,
        sqlite: `
            ALTER TABLE "user" ADD COLUMN username TEXT;
            ALTER TABLE "user" ADD COLUMN "displayUsername" TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username)
        `
    },
    {
        id: '004_projects_commits',
        pg: `
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                visibility TEXT NOT NULL DEFAULT 'private',
                head_commit_id TEXT,
                forked_from_project_id TEXT,
                forked_from_commit_id TEXT,
                download_count INTEGER NOT NULL DEFAULT 0,
                fork_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS commits (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                parent_commit_id TEXT,
                message TEXT NOT NULL,
                state_json TEXT NOT NULL,
                schema_version INTEGER,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
            CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility);
            CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id)
        `
        // sqlite: same DDL works on better-sqlite3 — no override needed.
    },
    {
        id: '005_thumbnails_reports',
        pg: `
            CREATE TABLE IF NOT EXISTS thumbnails (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                mime TEXT NOT NULL,
                image BYTEA NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                reporter_user_id TEXT,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_thumbnails_project ON thumbnails(project_id)
        `,
        sqlite: `
            CREATE TABLE IF NOT EXISTS thumbnails (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                mime TEXT NOT NULL,
                image BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                reporter_user_id TEXT,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_thumbnails_project ON thumbnails(project_id)
        `
    },
    {
        id: '006_merge_requests',
        pg: `
            CREATE TABLE IF NOT EXISTS merge_requests (
                id TEXT PRIMARY KEY,
                source_project_id TEXT NOT NULL,
                source_commit_id TEXT NOT NULL,
                target_project_id TEXT NOT NULL,
                base_commit_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                created_by TEXT NOT NULL,
                resolved_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_mr_target ON merge_requests(target_project_id);
            CREATE INDEX IF NOT EXISTS idx_mr_author ON merge_requests(created_by)
        `
        // sqlite: same DDL works on better-sqlite3 (TIMESTAMP degrades to NUMERIC affinity) — no override needed.
    },
    {
        id: '007_commit_storage',
        pg: `
            ALTER TABLE commits ADD COLUMN IF NOT EXISTS state_gzip BYTEA;
            ALTER TABLE commits ADD COLUMN IF NOT EXISTS state_bytes INTEGER;
            ALTER TABLE commits ADD COLUMN IF NOT EXISTS state_hash TEXT;
            UPDATE commits SET state_bytes = OCTET_LENGTH(state_json) WHERE state_bytes IS NULL
        `,
        sqlite: `
            ALTER TABLE commits ADD COLUMN state_gzip BLOB;
            ALTER TABLE commits ADD COLUMN state_bytes INTEGER;
            ALTER TABLE commits ADD COLUMN state_hash TEXT;
            UPDATE commits SET state_bytes = LENGTH(CAST(state_json AS BLOB)) WHERE state_bytes IS NULL
        `
    },
    {
        id: '008_reviews',
        // No REFERENCES clauses: SQLite runs without PRAGMA foreign_keys here, so FK
        // cascades would silently not fire — related-row cleanup is manual, matching
        // the reports/commits precedent. The non-idempotent ALTER is deliberately the
        // LAST statement (the runner re-runs an unrecorded migration from the top;
        // everything before it is IF NOT EXISTS — see spec §1 partial-failure note).
        pg: `
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                body TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE (project_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
            ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_id TEXT
        `,
        sqlite: `
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                body TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE (project_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
            ALTER TABLE reports ADD COLUMN review_id TEXT
        `
    },
    {
        id: '009_published_snapshots',
        pg: `
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_commit_id TEXT;
            CREATE TABLE IF NOT EXISTS project_publications (
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                commit_id TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
                published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, commit_id)
            );
            UPDATE projects
            SET published_commit_id = head_commit_id
            WHERE visibility = 'public' AND published_commit_id IS NULL;
            INSERT INTO project_publications (project_id, commit_id)
            SELECT p.id, p.published_commit_id
            FROM projects p
            WHERE p.published_commit_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM project_publications pp
                  WHERE pp.project_id = p.id AND pp.commit_id = p.published_commit_id
              );
            CREATE INDEX IF NOT EXISTS idx_project_publications_project
                ON project_publications(project_id, published_at DESC)
        `,
        sqlite: `
            ALTER TABLE projects ADD COLUMN published_commit_id TEXT;
            CREATE TABLE IF NOT EXISTS project_publications (
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                commit_id TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
                published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, commit_id)
            );
            UPDATE projects
            SET published_commit_id = head_commit_id
            WHERE visibility = 'public' AND published_commit_id IS NULL;
            INSERT INTO project_publications (project_id, commit_id)
            SELECT p.id, p.published_commit_id
            FROM projects p
            WHERE p.published_commit_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM project_publications pp
                  WHERE pp.project_id = p.id AND pp.commit_id = p.published_commit_id
              );
            CREATE INDEX IF NOT EXISTS idx_project_publications_project
                ON project_publications(project_id, published_at DESC)
        `
    },
    {
        id: '010_published_metadata',
        pg: `
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_name TEXT;
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_description TEXT;
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_tags TEXT;
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
            UPDATE projects
            SET published_name = name,
                published_description = description,
                published_tags = tags,
                published_at = updated_at
            WHERE published_commit_id IS NOT NULL AND published_name IS NULL
        `,
        sqlite: `
            ALTER TABLE projects ADD COLUMN published_name TEXT;
            ALTER TABLE projects ADD COLUMN published_description TEXT;
            ALTER TABLE projects ADD COLUMN published_tags TEXT;
            ALTER TABLE projects ADD COLUMN published_at TIMESTAMP;
            UPDATE projects
            SET published_name = name,
                published_description = description,
                published_tags = tags,
                published_at = updated_at
            WHERE published_commit_id IS NOT NULL AND published_name IS NULL
        `
    },
    {
        id: '011_account_moderation',
        pg: [
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" TEXT',
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP',
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "moderationVersion" INTEGER NOT NULL DEFAULT 0',
            `CREATE TABLE IF NOT EXISTS moderation_actions (
                id TEXT PRIMARY KEY,
                actor_user_id TEXT NOT NULL,
                actor_email TEXT NOT NULL,
                target_user_id TEXT NOT NULL,
                target_email TEXT NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('account_suspended', 'account_restored', 'project_unpublished')),
                reason TEXT NOT NULL,
                expires_at TIMESTAMP,
                project_id TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_time
                ON moderation_actions(target_user_id, created_at DESC, id DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_actions_actor_time
                ON moderation_actions(actor_user_id, created_at DESC, id DESC)`,
            `CREATE OR REPLACE FUNCTION reject_moderation_action_mutation()
             RETURNS trigger AS $$
             BEGIN
                 RAISE EXCEPTION 'moderation_actions is append-only';
             END;
             $$ LANGUAGE plpgsql`,
            'DROP TRIGGER IF EXISTS moderation_actions_no_update ON moderation_actions',
            `CREATE TRIGGER moderation_actions_no_update
                BEFORE UPDATE ON moderation_actions
                FOR EACH ROW EXECUTE FUNCTION reject_moderation_action_mutation()`,
            'DROP TRIGGER IF EXISTS moderation_actions_no_delete ON moderation_actions',
            `CREATE TRIGGER moderation_actions_no_delete
                BEFORE DELETE ON moderation_actions
                FOR EACH ROW EXECUTE FUNCTION reject_moderation_action_mutation()`,
        ],
        sqlite: [
            'ALTER TABLE "user" ADD COLUMN "banReason" TEXT',
            'ALTER TABLE "user" ADD COLUMN "banExpires" TIMESTAMP',
            'ALTER TABLE "user" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0',
            `CREATE TABLE IF NOT EXISTS moderation_actions (
                id TEXT PRIMARY KEY,
                actor_user_id TEXT NOT NULL,
                actor_email TEXT NOT NULL,
                target_user_id TEXT NOT NULL,
                target_email TEXT NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('account_suspended', 'account_restored', 'project_unpublished')),
                reason TEXT NOT NULL,
                expires_at TIMESTAMP,
                project_id TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_time
                ON moderation_actions(target_user_id, created_at DESC, id DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_actions_actor_time
                ON moderation_actions(actor_user_id, created_at DESC, id DESC)`,
            `CREATE TRIGGER IF NOT EXISTS moderation_actions_no_update
                BEFORE UPDATE ON moderation_actions
                BEGIN
                    SELECT RAISE(ABORT, 'moderation_actions is append-only');
                END`,
            `CREATE TRIGGER IF NOT EXISTS moderation_actions_no_delete
                BEFORE DELETE ON moderation_actions
                BEGIN
                    SELECT RAISE(ABORT, 'moderation_actions is append-only');
                END`,
        ],
    }
];
