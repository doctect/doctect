import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { GalleryDetailModal } from '../../components/gallery/GalleryDetailModal';
import { cloudApi, ApiError, GalleryDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

// The owner path below mounts the lazy edit-listing dialog, which statically imports the
// renderer -- and that module assigns pdf.js's worker at module scope, which touches
// DOMMatrix and crashes under jsdom. Nothing here renders a preview.
const generateThumbnails = vi.hoisted(() => vi.fn());
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails }));

const detail: GalleryDetail = {
    id: 'proj-1', name: 'Test Project', description: 'desc', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', ownerId: 'owner-1',
    headCommitId: 'commit-1', thumbnailIds: [], previews: [], forkedFrom: null,
    ratingAvg: null, ratingCount: 0,
};

// A minimal "page behind the modal" -- mirrors how App.tsx's dual-<Routes>
// pattern always has a real history entry (the background page) underneath
// the modal's own entry, so navigate(-1) has somewhere real to land.
function PreviousPage() {
    return (
        <div>
            <div>PREVIOUS_PAGE_MARKER</div>
            <Link to="/gallery/proj-1">Open</Link>
        </div>
    );
}

const renderAt = () => render(
    <MemoryRouter initialEntries={['/previous', '/gallery/proj-1']} initialIndex={1}>
        <Routes>
            <Route path="/previous" element={<PreviousPage />} />
            <Route path="/gallery/:id" element={<GalleryDetailModal />} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryDetailModal', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('renders the project content inside the modal', async () => {
        renderAt();
        expect(await screen.findByText('Test Project')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /open in editor/i })).toBeInTheDocument();
    });

    it('shows a loading state before the project loads', async () => {
        renderAt();
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
        // Let the mocked cloudApi.galleryDetail promise resolve before the test ends,
        // so the resulting state update isn't left dangling outside act(...).
        await screen.findByText('Test Project');
    });

    it('shows an error state if the project fails to load', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockRejectedValue(new ApiError(404, 'Not found'));
        renderAt();
        expect(await screen.findByText('Not found')).toBeInTheDocument();
    });

    it('clicking the close (X) button navigates back to the previous page', async () => {
        renderAt();
        await screen.findByText('Test Project');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(await screen.findByText('PREVIOUS_PAGE_MARKER')).toBeInTheDocument();
    });

    it('clicking the backdrop navigates back to the previous page', async () => {
        renderAt();
        await screen.findByText('Test Project');
        fireEvent.click(screen.getByTestId('modal-backdrop'));
        expect(await screen.findByText('PREVIOUS_PAGE_MARKER')).toBeInTheDocument();
    });

    it('pressing Escape navigates back to the previous page', async () => {
        renderAt();
        await screen.findByText('Test Project');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(await screen.findByText('PREVIOUS_PAGE_MARKER')).toBeInTheDocument();
    });

    // The edit-listing dialog mounts inside this modal's tree, but the Escape handler above
    // is bound to `document` -- below which React's own delegated listener sits. So unless
    // the dialog stops the native event, one Escape both closes the dialog and navigates the
    // page away, discarding whatever the owner had typed along with it.
    it('closes only the edit-listing dialog on Escape, without navigating away', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'owner-1', username: 'someone' } } });
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'commit-1', message: 'm', createdAt: '', state: {
                nodes: { p1: { id: 'p1', parentId: null, type: 'page', title: 'Cover', data: {}, children: [] } },
                rootId: 'p1',
                variants: { default: { id: 'default', name: 'Default', templates: {} } },
                activeVariantId: 'default',
                schemaVersion: 10,
            },
        });
        renderAt();

        fireEvent.click(await screen.findByRole('button', { name: /edit listing/i }));
        const dialog = await screen.findByRole('dialog');
        // Wait out the dialog's own load before pressing anything, so no state update is
        // still in flight when the assertions run.
        await screen.findByDisplayValue('desc');

        fireEvent.keyDown(dialog, { key: 'Escape' });

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.queryByText('PREVIOUS_PAGE_MARKER')).toBeNull();
        expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
});
