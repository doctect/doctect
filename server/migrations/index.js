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
    }
];
