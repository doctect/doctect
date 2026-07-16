// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({}));

vi.mock('../../../server/authRequest.js', () => ({
    getAuthForRequest: () => ({
        api: {
            getSession: async () => ({ user: { id: 'target-user', email: 'target@test.dev' } }),
        },
    }),
}));

vi.mock('../../../server/db.js', () => ({
    dbType: 'postgres',
    query: vi.fn((text, params = []) => state.executeSql(text, params)),
    withTransaction: vi.fn(callback => state.runLocked(() => callback(state.executeSql))),
}));

import { optionalAuth, requireAuth } from '../../../server/middleware/guards.js';
import { query, withTransaction } from '../../../server/db.js';

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

const response = () => {
    const res = {
        statusCode: 200,
        body: null,
        status: vi.fn(code => {
            res.statusCode = code;
            return res;
        }),
        json: vi.fn(body => {
            res.body = body;
            return res;
        }),
    };
    return res;
};

beforeEach(() => {
    vi.clearAllMocks();
    state.user = { banned: true, banExpires: null };
    state.sessions = new Set(['old-session']);
    state.events = [];
    state.selectTexts = [];
    state.checkStarted = deferred();
    state.allowCheck = deferred();
    let lockTail = Promise.resolve();
    state.runLocked = async callback => {
        const previous = lockTail;
        let release;
        lockTail = new Promise(done => { release = done; });
        await previous;
        try {
            return await callback();
        } finally {
            release();
        }
    };
    state.executeSql = async text => {
        if (/SELECT banned, "banExpires" FROM "user"/.test(text)) {
            const snapshot = { ...state.user };
            state.events.push('guard-check');
            state.selectTexts.push(text);
            state.checkStarted.resolve();
            await state.allowCheck.promise;
            return [snapshot];
        }
        if (/DELETE FROM session/.test(text)) {
            state.events.push('guard-delete');
            state.sessions.clear();
            return [];
        }
        throw new Error(`Unexpected SQL: ${text}`);
    };
});

const restoreAndSignIn = async () => {
    await state.runLocked(async () => {
        state.events.push('restore-clear');
        state.user = { banned: false, banExpires: null };
        state.sessions.clear();
    });
    state.events.push('sign-in');
    state.sessions.add('post-restore-session');
};

describe('auth guard and restoration serialization', () => {
    it('commits active cleanup before restoration so the post-restore session survives', async () => {
        const req = { headers: {} };
        const res = response();
        const next = vi.fn();
        const guard = requireAuth(req, res, next);
        await state.checkStarted.promise;

        const restoration = restoreAndSignIn();
        await new Promise(resolve => setImmediate(resolve));
        state.allowCheck.resolve();
        await Promise.all([guard, restoration]);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
        expect(state.events).toEqual(['guard-check', 'guard-delete', 'restore-clear', 'sign-in']);
        expect([...state.sessions]).toEqual(['post-restore-session']);
        expect(state.selectTexts[0]).toMatch(/FOR UPDATE$/);
        expect(withTransaction).toHaveBeenCalledTimes(1);
        expect(query).not.toHaveBeenCalled();
    });

    it('rechecks after restoration and never deletes the new valid session', async () => {
        await restoreAndSignIn();
        state.allowCheck.resolve();
        const req = { headers: {} };
        const res = response();
        const next = vi.fn();

        await optionalAuth(req, res, next);

        expect(req.user).toMatchObject({ id: 'target-user' });
        expect(next).toHaveBeenCalledTimes(1);
        expect(state.events).toEqual(['restore-clear', 'sign-in', 'guard-check']);
        expect([...state.sessions]).toEqual(['post-restore-session']);
        expect(state.selectTexts[0]).toMatch(/FOR UPDATE$/);
        expect(withTransaction).toHaveBeenCalledTimes(1);
        expect(query).not.toHaveBeenCalled();
    });
});
