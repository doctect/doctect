// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: [], reconciliationError: null }));

vi.mock('../../../server/ownerAuthority.js', () => ({
    assertOwnerConfiguration: vi.fn(() => { state.calls.push('assert config'); }),
    reconcileOwnerAuthority: vi.fn(async () => {
        state.calls.push('reconcile owners');
        if (state.reconciliationError) throw state.reconciliationError;
    }),
}));

vi.mock('../../../server/migrations.js', () => ({
    runMigrations: vi.fn(async () => { state.calls.push('run migrations'); }),
}));

vi.mock('../../../server/app.js', () => ({
    createApp: vi.fn(() => {
        state.calls.push('create app');
        return {
            listen: vi.fn(() => { state.calls.push('listen'); }),
        };
    }),
}));

describe('server startup', () => {
    beforeEach(() => {
        state.calls.length = 0;
        state.reconciliationError = null;
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('asserts configuration, migrates, and reconciles before creating and listening', async () => {
        await import('../../../server/index.js');

        expect(state.calls).toEqual([
            'assert config',
            'run migrations',
            'reconcile owners',
            'create app',
            'listen',
        ]);
    });

    it('does not create or listen when reconciliation fails', async () => {
        state.reconciliationError = new Error('owner reconciliation failed');

        await expect(import('../../../server/index.js')).rejects.toThrow('owner reconciliation failed');

        expect(state.calls).toEqual(['assert config', 'run migrations', 'reconcile owners']);
    });
});
