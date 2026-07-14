import { dbType } from './db.js';

export const lockProjectRows = async (projectIds, queryFn) => {
    const ids = [...new Set(projectIds)].sort();
    if (ids.length === 0) return [];

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const lockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
    return queryFn(
        `SELECT * FROM projects WHERE id IN (${placeholders}) ORDER BY id${lockSuffix}`,
        ids,
    );
};
