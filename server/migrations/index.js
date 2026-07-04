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
    }
];
