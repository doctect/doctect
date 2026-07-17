import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';

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

const transactionContext = new AsyncLocalStorage();
let sqliteQueue = Promise.resolve();

const runSqliteQuery = async (text, params) => {
    const sqliteText = text.replace(/\$(\d+)/g, '?');
    const stmt = db.prepare(sqliteText);
    const returnsRows = /^\s*(select|pragma)/i.test(text) || /\breturning\b/i.test(text);
    if (returnsRows) return stmt.all(...params);
    stmt.run(...params);
    return [];
};

const withSqliteLock = async (callback) => {
    const previous = sqliteQueue;
    let release;
    sqliteQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
        return await callback();
    } finally {
        release();
    }
};

// Unified query. ALWAYS use $1..$n placeholders, each number exactly once,
// params in order. Returns array of rows (SELECT / RETURNING), else [].
export const query = async (text, params = []) => {
    const transaction = transactionContext.getStore();
    if (transaction) return transaction.query(text, params);
    if (type === 'postgres') {
        const res = await db.query(text, params);
        return res.rows ?? [];
    }
    return withSqliteLock(() => runSqliteQuery(text, params));
};

export const withTransaction = async (callback) => {
    const existing = transactionContext.getStore();
    if (existing) return callback(existing.query);

    if (type === 'postgres') {
        const client = await db.connect();
        const context = {
            active: true,
            query: async (text, params = []) => {
                if (!context.active) throw new Error('Transaction is no longer active.');
                const res = await client.query(text, params);
                return res.rows ?? [];
            },
        };
        let releaseError;
        try {
            await client.query('BEGIN');
            const result = await transactionContext.run(context, () => callback(context.query));
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
            throw error;
        } finally {
            context.active = false;
            client.release(releaseError);
        }
    }

    return withSqliteLock(async () => {
        const context = {
            active: true,
            query: (text, params = []) => {
                if (!context.active) throw new Error('Transaction is no longer active.');
                return runSqliteQuery(text, params);
            },
        };
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = await transactionContext.run(context, () => callback(context.query));
            db.exec('COMMIT');
            return result;
        } catch (error) {
            try { db.exec('ROLLBACK'); } catch { /* Preserve original failure. */ }
            throw error;
        } finally {
            context.active = false;
        }
    });
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
