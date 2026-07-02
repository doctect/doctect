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
} else {
    type = 'sqlite';
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'analytics.db');
    db = new Database(dbPath);
}

export const dbType = type;

// Unified query. ALWAYS use $1..$n placeholders, each number exactly once,
// params in order. Returns array of rows (SELECT / RETURNING), else [].
export const query = async (text, params = []) => {
    if (type === 'postgres') {
        const res = await db.query(text, params);
        return res.rows ?? [];
    }
    const sqliteText = text.replace(/\$(\d+)/g, '?');
    const stmt = db.prepare(sqliteText);
    const returnsRows = /^\s*(select|pragma)/i.test(text) || /\breturning\b/i.test(text);
    if (returnsRows) return stmt.all(...params);
    stmt.run(...params);
    return [];
};

export const makeUserAdmin = async (userId) => {
    await query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [userId]);
};

export const logEvent = async (eventType, payload) => {
    await query('INSERT INTO events (type, payload) VALUES ($1, $2)', [eventType, JSON.stringify(payload)]);
};

export const getStats = async () => {
    const totalRes = await query('SELECT COUNT(*) as count FROM events');
    const byType = await query('SELECT type, COUNT(*) as count FROM events GROUP BY type');
    const recent = await query('SELECT * FROM events ORDER BY timestamp DESC LIMIT 50');
    return { total: parseInt(totalRes[0].count, 10), byType, recent };
};

export default db;
