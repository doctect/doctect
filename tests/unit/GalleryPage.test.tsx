import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryPage } from '../../pages/GalleryPage';
import { cloudApi, GalleryItem } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    signOut: vi.fn(),
}));

const mkItem = (id: string, name: string): GalleryItem => ({
    id, name, description: 'desc', tags: ['planner'], author: 'maker',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', thumbnailId: null,
    ratingAvg: 4.0, ratingCount: 2,
});

const renderAt = (entry = '/gallery') => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes>
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryPage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryTags').mockResolvedValue([{ tag: 'planner', count: 3 }, { tag: 'weekly', count: 1 }]);
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [mkItem('p1', 'Alpha')], page: 0, hasMore: false });
    });

    it('default view renders the hero, tag chips and three sections', async () => {
        renderAt();
        expect(await screen.findByText(/discover planner & notebook templates/i)).toBeInTheDocument();
        expect(await screen.findByRole('heading', { name: /top rated/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /popular/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /recently updated/i })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /planner \(3\)/i })).toBeInTheDocument();
        await waitFor(() => {
            const sorts = (cloudApi.gallery as any).mock.calls.map((c: any[]) => c[0]?.sort);
            expect(sorts).toContain('rating');
            expect(sorts).toContain('popular');
            expect(sorts).toContain('recent');
        });
        // section fetches are limit-capped
        expect((cloudApi.gallery as any).mock.calls.every((c: any[]) => c[0]?.limit === 8)).toBe(true);
    });

    it('?tag= URL param opens the filtered grid directly', async () => {
        renderAt('/gallery?tag=planner');
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ tag: 'planner' })));
        expect(screen.queryByRole('heading', { name: /top rated/i })).toBeNull();
        expect(await screen.findByText('Alpha')).toBeInTheDocument();
        // dismissible active-tag chip
        expect(screen.getByRole('button', { name: /remove tag filter/i })).toBeInTheDocument();
    });

    it('typing a search switches to grid mode with the q param', async () => {
        renderAt();
        await screen.findByRole('heading', { name: /top rated/i });
        fireEvent.change(screen.getByPlaceholderText(/search planners/i), { target: { value: 'alp' } });
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ q: 'alp' })), { timeout: 2000 });
        expect(screen.queryByRole('heading', { name: /top rated/i })).toBeNull();
    });

    it('"See all" enters grid mode with that sort', async () => {
        renderAt();
        await screen.findByRole('heading', { name: /top rated/i });
        fireEvent.click(screen.getAllByRole('button', { name: /see all/i })[0]);
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ sort: 'rating', page: 0 })));
    });

    it('clearing filters returns to sections mode', async () => {
        renderAt('/gallery?tag=planner');
        await screen.findByText('Alpha');
        fireEvent.click(screen.getByRole('button', { name: /all projects/i }));
        expect(await screen.findByRole('heading', { name: /top rated/i })).toBeInTheDocument();
    });

    it('grid mode keeps the sort select with a Top rated option', async () => {
        renderAt('/gallery?q=x');
        await screen.findByText('Alpha');
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /top rated/i })).toBeInTheDocument();
        fireEvent.change(select, { target: { value: 'rating' } });
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ sort: 'rating' })));
    });

    it('shows an empty state with a clear-filters action when nothing matches', async () => {
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [], page: 0, hasMore: false });
        renderAt('/gallery?q=zzz');
        expect(await screen.findByText(/no projects match/i)).toBeInTheDocument();
    });
});
