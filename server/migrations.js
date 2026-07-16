import { dbType, withTransaction } from './db.js';
import { migrations } from './migrations/index.js';

const MIGRATION_LOCK_KEY = 0x446f6374;

export const runMigrations = async () => {
    const appliedIds = await withTransaction(async txQuery => {
        if (dbType === 'postgres') {
            await txQuery('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
        }

        await txQuery(`CREATE TABLE IF NOT EXISTS app_migrations (
            id TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        const appliedRows = await txQuery('SELECT id FROM app_migrations');
        const applied = new Set(appliedRows.map(row => row.id));
        const newlyApplied = [];
        for (const migration of migrations) {
            if (applied.has(migration.id)) continue;
            const sql = dbType === 'postgres' ? migration.pg : (migration.sqlite ?? migration.pg);
            const statements = Array.isArray(sql)
                ? sql.map(statement => statement.trim()).filter(Boolean)
                : sql.split(';').map(statement => statement.trim()).filter(Boolean);
            for (const statement of statements) {
                await txQuery(statement);
            }
            await txQuery('INSERT INTO app_migrations (id) VALUES ($1)', [migration.id]);
            newlyApplied.push(migration.id);
        }
        return newlyApplied;
    });

    for (const id of appliedIds) {
        console.log(`[migrations] applied ${id}`);
    }
};
