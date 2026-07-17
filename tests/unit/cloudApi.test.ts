import { describe, it, expect, vi, afterEach } from 'vitest';
import { cloudApi, ApiError } from '../../services/cloudApi';

describe('cloudApi error handling', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('ApiError carries the code field from the response body', async () => {
        global.fetch = (async () => ({
            ok: false,
            status: 403,
            json: async () => ({ error: 'Set a public username before using cloud/gallery features.', code: 'USERNAME_REQUIRED' }),
        })) as any;

        try {
            await cloudApi.createProject({ name: 'X', state: {} as any });
            throw new Error('expected to throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).status).toBe(403);
            expect((e as ApiError).code).toBe('USERNAME_REQUIRED');
        }
    });

    it('ApiError.code is undefined when the server does not send one', async () => {
        global.fetch = (async () => ({
            ok: false,
            status: 400,
            json: async () => ({ error: 'name is required (max 100 chars)' }),
        })) as any;

        try {
            await cloudApi.createProject({ name: '', state: {} as any });
            throw new Error('expected to throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).code).toBeUndefined();
        }
    });
});

describe('cloudApi publish', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sends the inspected head as a quoted strong entity tag without changing the body', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ project: {} }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const body = {
            description: 'Description',
            tags: ['planner'],
            thumbnails: ['data:image/png;base64,preview'],
        };

        await cloudApi.publish('project-1', 'head-1', body);

        const [, options] = fetchMock.mock.calls[0];
        expect(options.headers).toMatchObject({ 'If-Match': '"head-1"' });
        expect(JSON.parse(options.body)).toEqual(body);
        expect(Object.keys(JSON.parse(options.body))).toEqual(['description', 'tags', 'thumbnails']);
    });
});

describe('cloudApi save', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sends last synced commit as a quoted strong entity tag', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ commit: { id: 'head-2' } }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const body = { state: {} as any, message: 'save' };

        await cloudApi.saveCommit('project-1', 'head-1', body);

        const [, options] = fetchMock.mock.calls[0];
        expect(options.headers).toMatchObject({ 'If-Match': '"head-1"' });
        expect(JSON.parse(options.body)).toEqual(body);
    });
});

describe('gallery v2 api methods', () => {
    const okJson = (body: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    afterEach(() => vi.unstubAllGlobals());

    it('gallery() serializes tag, limit and rating sort', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ items: [], page: 0, hasMore: false }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.gallery({ q: 'x', sort: 'rating', tag: 'planner', limit: 8, page: 2 });
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('/api/gallery?');
        expect(url).toContain('q=x');
        expect(url).toContain('sort=rating');
        expect(url).toContain('tag=planner');
        expect(url).toContain('limit=8');
        expect(url).toContain('page=2');
    });

    it('galleryTags() unwraps the tags array', async () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({ tags: [{ tag: 'planner', count: 3 }] })));
        const tags = await cloudApi.galleryTags();
        expect(tags).toEqual([{ tag: 'planner', count: 3 }]);
    });

    it('listReviews() returns reviews and myReview', async () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({ reviews: [], myReview: null })));
        const res = await cloudApi.listReviews('p1');
        expect(res).toEqual({ reviews: [], myReview: null });
    });

    it('putReview() PUTs to the review endpoint', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ review: { id: 'r1' } }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.putReview('p1', { rating: 4, body: 'good' });
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toContain('/api/gallery/p1/review');
        expect(opts.method).toBe('PUT');
        expect(JSON.parse(opts.body)).toEqual({ rating: 4, body: 'good' });
    });

    it('deleteReview() DELETEs; reportReview() POSTs to the nested route', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ success: true }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.deleteReview('p1');
        expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
        await cloudApi.reportReview('p1', 'r9', 'spam');
        const [url, opts] = fetchMock.mock.calls[1];
        expect(url).toContain('/api/gallery/p1/reviews/r9/report');
        expect(JSON.parse(opts.body)).toEqual({ reason: 'spam' });
    });
});

describe('account moderation api methods', () => {
    const okJson = (body: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    afterEach(() => vi.unstubAllGlobals());

    it('serializes bounded search and opaque cursor', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ users: [], nextCursor: null }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.searchModerationUsers('user+tag@test.dev', 'opaque/cursor');
        expect(fetchMock.mock.calls[0][0]).toContain('/api/admin/users?q=user%2Btag%40test.dev&cursor=opaque%2Fcursor');
    });

    it('loads detail with an optional history cursor', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ account: {}, projects: [], history: { items: [], nextCursor: null } }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.getModerationUser('user/1', 'history+cursor');
        expect(fetchMock.mock.calls[0][0]).toContain('/api/admin/users/user%2F1?historyCursor=history%2Bcursor');
    });

    it('posts exact suspend and restore bodies', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ account: {}, actions: [] }));
        vi.stubGlobal('fetch', fetchMock);
        const suspend = {
            reason: 'Confirmed abuse', expiresAt: null,
            projectIdsToUnpublish: ['project-1'], expectedModerationVersion: 3,
        };
        await cloudApi.suspendAccount('user-1', suspend);
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(suspend);
        await cloudApi.restoreAccount('user-1', { reason: 'Appeal accepted', expectedModerationVersion: 4 });
        expect(fetchMock.mock.calls[1][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
            reason: 'Appeal accepted', expectedModerationVersion: 4,
        });
    });

    it('posts exact owner lifecycle bodies to encoded target paths', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ account: {}, actions: [] }));
        vi.stubGlobal('fetch', fetchMock);

        await cloudApi.promoteAdmin('user/1', {
            reason: 'Coverage', expectedModerationVersion: 3,
        });
        await cloudApi.revokeAdmin('admin-1', {
            reason: 'Abuse', expectedModerationVersion: 8,
            suspension: { expiresAt: null }, projectIdsToUnpublish: ['project-1'],
        });

        expect(fetchMock.mock.calls[0][0]).toBe('/api/owner/users/user%2F1/promote-admin');
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            reason: 'Coverage', expectedModerationVersion: 3,
        });
        expect(fetchMock.mock.calls[1][0]).toBe('/api/owner/users/admin-1/revoke-admin');
        expect(fetchMock.mock.calls[1][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
            reason: 'Abuse', expectedModerationVersion: 8,
            suspension: { expiresAt: null }, projectIdsToUnpublish: ['project-1'],
        });
    });

    it('posts exact standalone content moderation bodies to encoded paths', async () => {
        const projectAction = { id: 'project-action' };
        const reviewAction = { id: 'review-action' };
        const fetchMock = vi.fn()
            .mockReturnValueOnce(okJson({ success: true, action: projectAction }))
            .mockReturnValueOnce(okJson({ success: true, action: reviewAction }));
        vi.stubGlobal('fetch', fetchMock);

        const projectResult = await cloudApi.moderatorUnpublishProject('p/1', 'Policy violation');
        const reviewResult = await cloudApi.moderatorDeleteReview('r/1', 'Harassment');

        expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/projects/p%2F1/unpublish');
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: 'Policy violation' });
        expect(projectResult).toEqual({ success: true, action: projectAction });
        expect(projectResult.success).toBe(true);
        expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/reviews/r%2F1');
        expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ reason: 'Harassment' });
        expect(reviewResult).toEqual({ success: true, action: reviewAction });
        expect(reviewResult.success).toBe(true);
    });

    it('serializes only defined global audit filters without a GET body', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ items: [], nextCursor: null }));
        vi.stubGlobal('fetch', fetchMock);

        await cloudApi.getGlobalAudit({
            actorEmail: 'Owner+tag@test.dev',
            targetEmail: undefined,
            action: 'admin_demoted',
            from: '2026-07-01T00:00:00.000Z',
            to: '2026-07-16T23:59:59.999Z',
            cursor: 'a/b',
        });

        expect(fetchMock.mock.calls[0][0]).toBe(
            '/api/owner/audit?actorEmail=Owner%2Btag%40test.dev&action=admin_demoted&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-16T23%3A59%3A59.999Z&cursor=a%2Fb',
        );
        expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
        expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });
});
