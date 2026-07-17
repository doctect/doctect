// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbCalls = vi.hoisted(() => []);

vi.mock('../../../server/db.js', () => ({
    dbType: 'postgres',
    withTransaction: vi.fn(async callback => callback(async (text, params = []) => {
        dbCalls.push({ text, params });
        return [];
    })),
}));

const normalizedSql = text => text.replace(/\s+/g, ' ').trim();

describe('PostgreSQL owner reconciliation lock contract', () => {
    beforeEach(() => {
        dbCalls.length = 0;
        vi.resetModules();
    });

    it('locks all users in deterministic ID order', async () => {
        const { reconcileOwnerAuthority } = await import('../../../server/ownerAuthority.js');

        await reconcileOwnerAuthority();

        expect(normalizedSql(dbCalls[0].text)).toContain('FROM "user" ORDER BY id FOR UPDATE');
        expect(dbCalls[0].params).toEqual([]);
    });

    it('locks only the scoped user by ID', async () => {
        const { reconcileOwnerAuthority } = await import('../../../server/ownerAuthority.js');

        await reconcileOwnerAuthority({ userId: 'configured-owner' });

        expect(normalizedSql(dbCalls[0].text)).toContain('FROM "user" WHERE id = $1 FOR UPDATE');
        expect(dbCalls[0].params).toEqual(['configured-owner']);
    });
});
