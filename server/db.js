import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;
let type;

if (process.env.DATABASE_URL) {
  type = 'postgres';
  const { Pool } = pg;
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon
  });

  // Initialize schema for Postgres
  const initPg = async () => {
    const client = await db.connect();
    try {
      // Drop tables to force schema refresh (fixing the snake_case vs camelCase mismatch)
      await client.query('DROP TABLE IF EXISTS verification, account, session, "user" CASCADE');

      await client.query(`
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
                );

                CREATE TABLE IF NOT EXISTS events (
                    id SERIAL PRIMARY KEY,
                    type TEXT NOT NULL,
                    payload TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
    } finally {
      client.release();
    }
  };
  initPg().catch(console.error);

} else {
  type = 'sqlite';
  const dbPath = path.join(__dirname, 'analytics.db');
  db = new Database(dbPath);

  // Initialize schema for SQLite
  db.exec(`
      CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
        `);
}

export const makeUserAdmin = async (userId) => {
  if (type === 'postgres') {
    await db.query("UPDATE \"user\" SET role = 'admin' WHERE id = $1", [userId]);
  } else {
    db.prepare("UPDATE user SET role = 'admin' WHERE id = ?").run(userId);
  }
};

export const logEvent = async (eventType, payload) => {
  const payloadStr = JSON.stringify(payload);
  if (type === 'postgres') {
    await db.query('INSERT INTO events (type, payload) VALUES ($1, $2)', [eventType, payloadStr]);
  } else {
    db.prepare('INSERT INTO events (type, payload) VALUES (?, ?)').run(eventType, payloadStr);
  }
};

export const getStats = async () => {
  if (type === 'postgres') {
    const totalRes = await db.query('SELECT COUNT(*) as count FROM events');
    const byTypeRes = await db.query('SELECT type, COUNT(*) as count FROM events GROUP BY type');
    const recentRes = await db.query('SELECT * FROM events ORDER BY timestamp DESC LIMIT 50');

    return {
      total: parseInt(totalRes.rows[0].count),
      byType: byTypeRes.rows,
      recent: recentRes.rows
    };
  } else {
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
    const byType = db.prepare('SELECT type, COUNT(*) as count FROM events GROUP BY type').all();
    const recent = db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT 50').all();
    return {
      total: totalEvents.count,
      byType,
      recent
    };
  }
};

export default db;
