import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryDetailPage } from '../../pages/GalleryDetailPage';
import { cloudApi, ApiError, GalleryDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

const detail: GalleryDetail = {
    id: 'proj-1', name: 'Test Project', description: 'desc', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', ownerId: 'owner-1',
    headCommitId: 'commit-1', thumbnailIds: [], forkedFrom: null,
};

const renderAt = () => render(
    <MemoryRouter initialEntries={['/gallery/proj-1']}>
        <Routes>
            <Route path="/gallery/:id" element={<GalleryDetailPage />} />
            <Route path="/welcome" element={<div>WELCOME_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryDetailPage fork gating', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('shows "Sign in to fork" when signed out', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Sign in to fork')).toBeInTheDocument();
    });

    it('shows "Set a username to fork" when signed in without a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: null } } });
        renderAt();
        const link = await screen.findByText('Set a username to fork');
        expect(link.closest('a')).toHaveAttribute('href', '/welcome');
    });

    it('shows the Fork button when signed in with a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: 'planner_pro' } } });
        renderAt();
        expect(await screen.findByRole('button', { name: /fork this project/i })).toBeInTheDocument();
    });

    it('redirects to /welcome if the server rejects a fork as USERNAME_REQUIRED', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: 'planner_pro' } } });
        vi.spyOn(cloudApi, 'fork').mockRejectedValue(new ApiError(403, 'nope', 'USERNAME_REQUIRED'));
        renderAt();
        const forkBtn = await screen.findByRole('button', { name: /fork this project/i });
        fireEvent.click(forkBtn);
        expect(await screen.findByText('WELCOME_MARKER')).toBeInTheDocument();
    });
});
