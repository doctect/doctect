import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GalleryCtaStrip } from '../../components/GalleryCtaStrip';
import { cloudApi, GalleryItem } from '../../services/cloudApi';

afterEach(() => vi.restoreAllMocks());

const item = (id: string, thumb: string | null): GalleryItem => ({
    id, name: id, description: '', tags: [], author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01',
    thumbnailId: thumb, thumbnailIds: thumb ? [thumb] : [], ratingAvg: null, ratingCount: 0,
});

describe('GalleryCtaStrip', () => {
    it('renders a thumbnail per project with one', async () => {
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({
            items: [item('a', 't1'), item('b', 't2'), item('c', null)], page: 0, hasMore: false,
        });
        render(<GalleryCtaStrip />);
        await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
        expect(cloudApi.gallery).toHaveBeenCalledWith({ limit: 4 });
    });

    it('renders nothing on fetch failure', async () => {
        vi.spyOn(cloudApi, 'gallery').mockRejectedValue(new Error('down'));
        const { container } = render(<GalleryCtaStrip />);
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalled());
        expect(container.innerHTML).toBe('');
    });
});
