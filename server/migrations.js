import { query, dbType } from './db.js';
import { migrations } from './migrations/index.js';

export const runMigrations = async () => {
    await query(`CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const appliedRows = await query('SELECT id FROM app_migrations');
    const applied = new Set(appliedRows.map(r => r.id));
    for (const m of migrations) {
        if (applied.has(m.id)) continue;
        const sql = dbType === 'postgres' ? m.pg : (m.sqlite ?? m.pg);
        const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
            await query(stmt);
        }
        await query('INSERT INTO app_migrations (id) VALUES ($1)', [m.id]);
        console.log(`[migrations] applied ${m.id}`);
    }
};
