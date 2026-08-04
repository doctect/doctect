import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { GalleryPage } from '../../pages/GalleryPage';
import { GalleryDetailPage } from '../../pages/GalleryDetailPage';
import { GalleryDetailModal } from '../../components/gallery/GalleryDetailModal';
import { cloudApi, GalleryItem, GalleryDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

// A minimal stand-in for App.tsx's own AppRoutes (see App.tsx) -- exercises the
// real GalleryPage / GalleryDetailPage / GalleryDetailModal / GalleryLink together
// without importing the actual App.tsx, which transitively pulls in EditorPage
// and, through it, pdfjs-dist -- see the note in tests/unit/CloudMenu.test.tsx
// about that crashing module load under jsdom.
function TestAppRoutes() {
    const location = useLocation();
    const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
    return (
        <>
            <Routes location={backgroundLocation || location}>
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/gallery/:id" element={<GalleryDetailPage />} />
            </Routes>
            {backgroundLocation && (
                <Routes>
                    <Route path="/gallery/:id" element={<GalleryDetailModal />} />
                </Routes>
            )}
        </>
    );
}

const item: GalleryItem = {
    id: 'proj-1', name: 'Cool Planner', description: '', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', thumbnailId: null,
    thumbnailIds: [],
    ratingAvg: null, ratingCount: 0,
};
const detail: GalleryDetail = {
    ...item, ownerId: 'owner-1', headCommitId: 'commit-1', thumbnailIds: [], previews: [], forkedFrom: null,
};

describe('gallery card click opens an overlay modal; direct hits still get the full page', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [item], page: 0, hasMore: false });
        vi.spyOn(cloudApi, 'galleryTags').mockResolvedValue([]);
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('clicking a card shows the modal without unmounting the grid behind it', async () => {
        render(<MemoryRouter initialEntries={['/gallery']}><TestAppRoutes /></MemoryRouter>);
        // The one-item catalog shows the project in the daily spotlight AND as a card
        // in the leftover grid. Only the card is a link, and the spotlight has its own
        // "Open in editor" button, so target the card by role and scope the modal
        // assertion with within().
        fireEvent.click(await screen.findByRole('link', { name: /cool planner/i }));
        const modal = await screen.findByTestId('modal-backdrop');
        expect(await within(modal).findByRole('button', { name: /open in editor/i })).toBeInTheDocument();
        // The grid's own search input proves GalleryPage never unmounted underneath the modal.
        expect(screen.getByPlaceholderText(/search planners/i)).toBeInTheDocument();
    });

    it('a direct hit on /gallery/:id (no background state) renders the full page instead', async () => {
        render(<MemoryRouter initialEntries={['/gallery/proj-1']}><TestAppRoutes /></MemoryRouter>);
        // Only the full-page shell has this "back to gallery" header link; the modal has none.
        expect(await screen.findByRole('link', { name: /gallery/i })).toBeInTheDocument();
    });
});
