import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    thumbnailIds: [],
    ratingAvg: 4.0, ratingCount: 2,
});

const catalogItem = (id: string, name: string, tags: string[]): GalleryItem => ({
    ...mkItem(id, name), tags,
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
        // GalleryExplainer's dismissal flag persists in jsdom localStorage across tests.
        localStorage.clear();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryTags').mockResolvedValue([{ tag: 'planner', count: 3 }, { tag: 'weekly', count: 1 }]);
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [mkItem('p1', 'Alpha')], page: 0, hasMore: false });
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([mkItem('p1', 'Alpha')]);
        // Pin the date: pickSpotlight keys off dateKey(new Date()), so an unpinned
        // clock makes the daily pick — and any name-collision assertions — drift by
        // calendar day. 2026-08-04 hashes to p1 for the five-item catalog below.
        // Without vi.useFakeTimers() this mocks Date only; setTimeout stays real,
        // which the search-debounce test below depends on.
        vi.setSystemTime(new Date('2026-08-04T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('sections view: explainer, spotlight, use-case strips, leftover grid, bottom tag chips', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([
            catalogItem('p1', 'Alpha Planner', ['planner']),
            catalogItem('p2', 'Beta Budget', ['finance']),
            catalogItem('p3', 'Gamma Game', ['games']),
            catalogItem('p4', 'Delta Dice', ['adventure']),
            catalogItem('p5', 'Omega Misc', ['misc']),
        ]);
        renderAt();
        // explainer (signed out by default in these tests)
        expect(await screen.findByText(/make it yours/i)).toBeInTheDocument();
        // spotlight is one of the catalog
        expect(screen.getByText(/in the spotlight/i)).toBeInTheDocument();
        // strips: plan claims p1+p2, play claims p3+p4
        expect(screen.getByRole('heading', { name: /plan & organize/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /play & explore/i })).toBeInTheDocument();
        // thin/unmatched strips absent
        expect(screen.queryByRole('heading', { name: /track & improve/i })).toBeNull();
        // leftover grid — scoped to its section: the daily spotlight can
        // legitimately repeat a project name elsewhere on the page
        const leftover = screen.getByRole('heading', { name: /more to explore/i }).closest('section');
        expect(leftover).not.toBeNull();
        expect(within(leftover as HTMLElement).getByText('Omega Misc')).toBeInTheDocument();
        // old hero gone
        expect(screen.queryByText(/discover planner & notebook templates/i)).toBeNull();
        // tag chips still work (now at the bottom)
        expect(screen.getByRole('button', { name: /planner \(3\)/i })).toBeInTheDocument();
    });

    it('sections view: empty catalog shows the empty state', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([]);
        renderAt();
        expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
    });

    it('sections view: fetch failure shows the error message', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockRejectedValue(new Error('down'));
        renderAt();
        expect(await screen.findByText(/could not load the gallery/i)).toBeInTheDocument();
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
        await screen.findByRole('heading', { name: /more to explore/i });
        fireEvent.change(screen.getByPlaceholderText(/search planners/i), { target: { value: 'alp' } });
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ q: 'alp' })), { timeout: 2000 });
        expect(screen.queryByRole('heading', { name: /more to explore/i })).toBeNull();
    });

    it('bottom tag chips enter grid mode with that tag', async () => {
        renderAt();
        await screen.findByRole('heading', { name: /more to explore/i });
        fireEvent.click(screen.getByRole('button', { name: /planner \(3\)/i }));
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ tag: 'planner', page: 0 })));
    });

    it('clearing filters returns to sections mode', async () => {
        renderAt('/gallery?tag=planner');
        await screen.findByText('Alpha');
        fireEvent.click(screen.getByRole('button', { name: /all projects/i }));
        expect(await screen.findByRole('heading', { name: /more to explore/i })).toBeInTheDocument();
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

    const directoryCatalog = () => [
        { ...mkItem('p1', 'Alpha Planner'), tags: ['planner'] },
        { ...mkItem('p2', 'Beta Budget'), tags: ['finance'] },
        { ...mkItem('p3', 'Omega Misc'), tags: ['misc'] },
    ];

    describe('directory mode (?view=all)', () => {
        it('renders the directory table with a count heading', async () => {
            vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue(directoryCatalog());
            renderAt('/gallery?view=all');
            expect(await screen.findByText(/all projects \(3\)/i)).toBeInTheDocument();
            expect(screen.getAllByTestId('directory-row')).toHaveLength(3);
            // sections chrome absent
            expect(screen.queryByText(/in the spotlight/i)).toBeNull();
        });

        it('filtered params win over view=all', async () => {
            renderAt('/gallery?q=alpha&view=all');
            await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ q: 'alpha' })));
            expect(screen.queryByTestId('directory-row')).toBeNull();
        });

        it('all three sections-view entry points open the directory', async () => {
            vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue(directoryCatalog());
            renderAt();
            await screen.findByText(/in the spotlight/i);
            expect(screen.getByRole('button', { name: /^all projects$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /see all/i })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: /browse all 3 projects/i }));
            expect(await screen.findByText(/all projects \(3\)/i)).toBeInTheDocument();
        });

        it('Gallery back link returns to the sections view', async () => {
            vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue(directoryCatalog());
            renderAt('/gallery?view=all');
            fireEvent.click(await screen.findByRole('button', { name: /gallery/i }));
            expect(await screen.findByText(/in the spotlight/i)).toBeInTheDocument();
        });

        it('empty catalog shows the shared empty state', async () => {
            vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([]);
            renderAt('/gallery?view=all');
            expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
        });

        it('sweep failure shows the shared error message', async () => {
            vi.spyOn(cloudApi, 'galleryAll').mockRejectedValue(new Error('down'));
            renderAt('/gallery?view=all');
            expect(await screen.findByText(/could not load the gallery/i)).toBeInTheDocument();
        });
    });
});
