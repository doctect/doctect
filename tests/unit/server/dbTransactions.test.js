// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';

const deferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
};

describe('SQLite transactions', () => {
    let database;
    let query;
    let withTransaction;

    beforeAll(async () => {
        process.env.DATABASE_URL = '';
        process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-transactions-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
        vi.resetModules();
        const module = await import('../../../server/db.js');
        database = module.default;
        query = module.query;
        withTransaction = module.withTransaction;
        await query('CREATE TABLE transaction_events (id INTEGER PRIMARY KEY, label TEXT NOT NULL)');
    });

    afterAll(() => database.close());

    it('rolls back callback and helper writes on failure', async () => {
        await expect(withTransaction(async txQuery => {
            await txQuery('INSERT INTO transaction_events (id, label) VALUES ($1, $2)', [1, 'scoped']);
            await query('INSERT INTO transaction_events (id, label) VALUES ($1, $2)', [2, 'helper']);
            throw new Error('rollback');
        })).rejects.toThrow('rollback');

        expect(await query('SELECT id FROM transaction_events ORDER BY id')).toEqual([]);
    });

    it('serializes unrelated queries outside an active transaction', async () => {
        const entered = deferred();
        const release = deferred();
        const transaction = withTransaction(async txQuery => {
            await txQuery('INSERT INTO transaction_events (id, label) VALUES ($1, $2)', [3, 'inside']);
            entered.resolve();
            await release.promise;
            await query('INSERT INTO transaction_events (id, label) VALUES ($1, $2)', [4, 'helper']);
        });
        await entered.promise;

        let outsideFinished = false;
        const outside = query('INSERT INTO transaction_events (id, label) VALUES ($1, $2)', [5, 'outside'])
            .then(() => { outsideFinished = true; });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(outsideFinished).toBe(false);

        release.resolve();
        await Promise.all([transaction, outside]);
        expect(await query('SELECT id FROM transaction_events ORDER BY id')).toEqual([{ id: 3 }, { id: 4 }, { id: 5 }]);
    });
});

describe('PostgreSQL transactions', () => {
    let client;
    let pool;

    beforeEach(() => {
        process.env.DATABASE_URL = 'postgres://transaction-test';
        client = {
            query: vi.fn(async text => ({ rows: /^\s*select/i.test(text) ? [{ source: 'client' }] : [] })),
            release: vi.fn(),
        };
        pool = {
            connect: vi.fn(async () => client),
            query: vi.fn(async () => ({ rows: [{ source: 'pool' }] })),
        };
        vi.resetModules();
        vi.doMock('pg', () => ({
            default: { Pool: class { constructor() { return pool; } } },
        }));
    });

    afterEach(() => {
        process.env.DATABASE_URL = '';
        vi.doUnmock('pg');
        vi.resetModules();
    });

    it('pins callback and helper queries through commit', async () => {
        const { query, withTransaction } = await import('../../../server/db.js');

        const rows = await withTransaction(async txQuery => {
            expect(await txQuery('SELECT $1 AS value', ['direct'])).toEqual([{ source: 'client' }]);
            return query('SELECT $1 AS value', ['helper']);
        });

        expect(rows).toEqual([{ source: 'client' }]);
        expect(client.query.mock.calls.map(([text]) => text)).toEqual([
            'BEGIN',
            'SELECT $1 AS value',
            'SELECT $1 AS value',
            'COMMIT',
        ]);
        expect(pool.query).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledOnce();
    });

    it('rolls back and releases the pinned client on failure', async () => {
        const { withTransaction } = await import('../../../server/db.js');

        await expect(withTransaction(async txQuery => {
            await txQuery('INSERT INTO events (type) VALUES ($1)', ['failure']);
            throw new Error('postgres rollback');
        })).rejects.toThrow('postgres rollback');

        expect(client.query.mock.calls.map(([text]) => text)).toEqual([
            'BEGIN',
            'INSERT INTO events (type) VALUES ($1)',
            'ROLLBACK',
        ]);
        expect(client.release).toHaveBeenCalledOnce();
    });
});
