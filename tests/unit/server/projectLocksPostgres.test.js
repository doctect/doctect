// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/db.js', () => ({ dbType: 'postgres' }));

describe('PostgreSQL project lock contract', () => {
    beforeEach(() => vi.resetModules());

    it('locks unique project IDs in deterministic sorted order', async () => {
        const queryFn = vi.fn(async () => [{ id: 'project-a' }, { id: 'project-b' }]);
        const { lockProjectRows } = await import('../../../server/projectLocks.js');

        const rows = await lockProjectRows(['project-b', 'project-a', 'project-b'], queryFn);

        expect(queryFn).toHaveBeenCalledWith(
            'SELECT * FROM projects WHERE id IN ($1, $2) ORDER BY id FOR UPDATE',
            ['project-a', 'project-b'],
        );
        expect(rows.map(row => row.id)).toEqual(['project-a', 'project-b']);
    });

    it('does not issue invalid SQL for an empty ID list', async () => {
        const queryFn = vi.fn();
        const { lockProjectRows } = await import('../../../server/projectLocks.js');

        await expect(lockProjectRows([], queryFn)).resolves.toEqual([]);
        expect(queryFn).not.toHaveBeenCalled();
    });
});
