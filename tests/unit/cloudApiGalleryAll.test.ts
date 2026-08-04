import { describe, it, expect, vi, afterEach } from 'vitest';
import { cloudApi, GalleryItem } from '../../services/cloudApi';

const item = (id: string): GalleryItem => ({
    id, name: id, description: '', tags: [], author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01',
    thumbnailId: null, thumbnailIds: [], ratingAvg: null, ratingCount: 0,
});

afterEach(() => vi.restoreAllMocks());

describe('cloudApi.galleryAll', () => {
    it('pages until hasMore is false and concatenates in order', async () => {
        const spy = vi.spyOn(cloudApi, 'gallery')
            .mockResolvedValueOnce({ items: [item('a'), item('b')], page: 0, hasMore: true })
            .mockResolvedValueOnce({ items: [item('c')], page: 1, hasMore: false });
        const all = await cloudApi.galleryAll();
        expect(all.map(i => i.id)).toEqual(['a', 'b', 'c']);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenNthCalledWith(1, { sort: 'recent', page: 0 });
        expect(spy).toHaveBeenNthCalledWith(2, { sort: 'recent', page: 1 });
    });

    it('stops at the page cap even if hasMore stays true', async () => {
        const spy = vi.spyOn(cloudApi, 'gallery')
            .mockResolvedValue({ items: [item('x')], page: 0, hasMore: true });
        const all = await cloudApi.galleryAll(3);
        expect(spy).toHaveBeenCalledTimes(3);
        expect(all).toHaveLength(3);
    });
});
