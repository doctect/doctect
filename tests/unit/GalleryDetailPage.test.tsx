import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryDetailPage } from '../../pages/GalleryDetailPage';
import { cloudApi, ApiError, GalleryDetail } from '../../services/cloudApi';
import * as importProject from '../../services/importProject';
import { deferred } from '../helpers/fakeLocalWorkspaceStore';

vi.mock('../../services/importProject', () => ({
    IMPORT_STAGE_ERROR_MESSAGE: 'Could not prepare this project for the editor. Nothing was removed; try again.',
    stageImport: vi.fn(),
}));

const resetStageImport = () => {
    vi.mocked(importProject.stageImport).mockReset();
    vi.mocked(importProject.stageImport).mockResolvedValue('import-test');
};

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

const detail: GalleryDetail = {
    id: 'proj-1', name: 'Test Project', description: 'desc', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', ownerId: 'owner-1',
    headCommitId: 'commit-1', thumbnailIds: [], previews: [], forkedFrom: null,
    ratingAvg: null, ratingCount: 0,
};

const generator = {
    formatVersion: 1 as const,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};

const galleryState = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: {} } },
    activeVariantId: 'default',
    schemaVersion: 10,
    generator,
};

const rawGalleryState = {
    ...galleryState,
    schemaVersion: 8,
    generator: { ...generator, formatVersion: 2, legacyNote: 'keep raw until EditorPage' },
};

const renderAt = () => render(
    <MemoryRouter initialEntries={['/gallery/proj-1']}>
        <Routes>
            <Route path="/gallery/:id" element={<GalleryDetailPage />} />
            <Route path="/welcome" element={<div>WELCOME_MARKER</div>} />
            <Route path="/app" element={<div>APP_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryDetailPage fork gating', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetStageImport();
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

describe('GalleryDetailPage version history', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetStageImport();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
        mockUseSession.mockReturnValue({ data: null });
        localStorage.clear();
    });

    it('opens the version history modal and lists commits', async () => {
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue([
            { id: 'c2', parentCommitId: 'c1', message: 'Second save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-02-01T00:00:00.000Z' },
            { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-01-01T00:00:00.000Z' },
        ]);
        renderAt();
        fireEvent.click(await screen.findByRole('button', { name: /version history/i }));
        expect(await screen.findByText(/Second save/)).toBeInTheDocument();
        expect(screen.getByText(/Initial save/)).toBeInTheDocument();
    });

    it('opening a past version stages it as a local import and navigates to the editor', async () => {
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue([
            { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-01-01T00:00:00.000Z' },
        ]);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'c1', message: 'Initial save', createdAt: '2026-01-01T00:00:00.000Z',
            state: galleryState,
        });
        renderAt();
        fireEvent.click(await screen.findByRole('button', { name: /version history/i }));
        const messageEl = await screen.findByText(/Initial save/);
        const row = messageEl.parentElement!.parentElement!;
        fireEvent.click(within(row).getByRole('button', { name: 'Open in editor' }));
        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
        expect(importProject.stageImport).toHaveBeenCalledWith(
            { name: 'Test Project', state: galleryState },
            { sourceKey: 'gallery-history:proj-1:c1' },
        );
    });

    it('keeps version history open and announces an exact staging failure', async () => {
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue([
            { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-01-01T00:00:00.000Z' },
        ]);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'c1', message: 'Initial save', createdAt: '2026-01-01T00:00:00.000Z',
            state: galleryState,
        });
        const failure = Promise.reject(new Error('quota'));
        void failure.catch(() => {});
        vi.mocked(importProject.stageImport).mockReturnValue(failure);
        renderAt();
        fireEvent.click(await screen.findByRole('button', { name: /version history/i }));
        const messageEl = await screen.findByText(/Initial save/);
        fireEvent.click(within(messageEl.parentElement!.parentElement!).getByRole('button', {
            name: 'Open in editor',
        }));

        const importError = await screen.findByText(
            'Could not prepare this project for the editor. Nothing was removed; try again.',
        );
        expect(importError.closest('[role="alert"]')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Version history' })).toBeVisible();
        expect(screen.queryByText('APP_MARKER')).not.toBeInTheDocument();
    });
});

describe('GalleryDetailPage generator source staging', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetStageImport();
        localStorage.clear();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('stages gallery open source byte-for-byte before navigating', async () => {
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryState').mockResolvedValue({ name: 'Test Project', state: rawGalleryState });
        const staged = deferred<string>();
        vi.mocked(importProject.stageImport).mockReturnValue(staged.promise);
        renderAt();

        fireEvent.click(await screen.findByRole('button', { name: /open in editor/i }));
        await waitFor(() => expect(importProject.stageImport).toHaveBeenCalledWith(
            { name: 'Test Project', state: rawGalleryState },
            { sourceKey: 'gallery-open:proj-1' },
        ));
        expect(screen.queryByText('APP_MARKER')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

        await act(async () => staged.resolve('gallery-import'));
        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
    });

    it('stages fork first-commit source byte-for-byte with cloud linkage', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'user-2', username: 'planner_pro' } } });
        vi.spyOn(cloudApi, 'fork').mockResolvedValue({
            project: { id: 'fork-1', name: 'Forked Project', headCommitId: 'fork-commit-1' },
        } as any);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'fork-commit-1', message: 'Fork', createdAt: '2026-07-14T12:40:00.000Z', state: rawGalleryState,
        });
        renderAt();

        fireEvent.click(await screen.findByRole('button', { name: /fork this project/i }));
        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
        expect(importProject.stageImport).toHaveBeenCalledWith(
            {
                name: 'Forked Project',
                state: rawGalleryState,
                cloud: { projectId: 'fork-1', lastSyncedCommitId: 'fork-commit-1' },
            },
            { sourceKey: 'gallery-fork:fork-1:fork-commit-1' },
        );
    });

    it('retries compact fork metadata without repeating the remote fork POST', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'user-2', username: 'planner_pro' } } });
        const fork = vi.spyOn(cloudApi, 'fork').mockResolvedValue({
            project: { id: 'fork-retry', name: 'Retained Fork', headCommitId: 'fork-commit-retry' },
        } as any);
        const getCommit = vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'fork-commit-retry', message: 'Fork', createdAt: '2026-07-14T12:40:00.000Z',
            state: rawGalleryState,
        });
        vi.mocked(importProject.stageImport)
            .mockRejectedValueOnce(new Error('post-commit readback failed'))
            .mockResolvedValueOnce('retained-fork-import');
        renderAt();

        fireEvent.click(await screen.findByRole('button', { name: /fork this project/i }));
        await screen.findByText(
            'Could not prepare this project for the editor. Nothing was removed; try again.',
        );
        fireEvent.click(screen.getByRole('button', { name: /fork this project/i }));

        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
        expect(fork).toHaveBeenCalledOnce();
        expect(getCommit).toHaveBeenCalledTimes(2);
        expect(getCommit.mock.calls[1]).toEqual(getCommit.mock.calls[0]);
        expect(importProject.stageImport).toHaveBeenCalledTimes(2);
        expect(vi.mocked(importProject.stageImport).mock.calls[1])
            .toEqual(vi.mocked(importProject.stageImport).mock.calls[0]);
    });

    it('keeps the gallery project visible and announces an exact staging failure', async () => {
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryState').mockResolvedValue({ name: 'Test Project', state: rawGalleryState });
        vi.mocked(importProject.stageImport).mockRejectedValue(new Error('quota'));
        renderAt();

        fireEvent.click(await screen.findByRole('button', { name: /open in editor/i }));

        const importError = await screen.findByText(
            'Could not prepare this project for the editor. Nothing was removed; try again.',
        );
        expect(importError.closest('[role="alert"]')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Test Project' })).toBeVisible();
        expect(screen.queryByText('APP_MARKER')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /open in editor/i })).toBeEnabled();
    });
});

describe('GalleryDetailPage reviews', () => {
    const review = { id: 'r1', rating: 4, body: 'Great grid.', author: 'fan_one', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' };

    beforeEach(() => {
        vi.restoreAllMocks();
        resetStageImport();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue({ ...detail, ratingAvg: 4.0, ratingCount: 1 });
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
        vi.spyOn(cloudApi, 'listReviews').mockResolvedValue({ reviews: [review], myReview: null });
    });

    it('shows the rating summary and the review list', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Great grid.')).toBeInTheDocument();
        expect(screen.getByText('fan_one')).toBeInTheDocument();
        expect(screen.getAllByLabelText(/rated 4 out of 5/i).length).toBeGreaterThan(0);
    });

    it('signed out: shows "Sign in to review" and no star input', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Sign in to review')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Rating' })).toBeNull();
    });

    it('signed in without a username: shows the welcome link', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u9', username: null } } });
        renderAt();
        expect(await screen.findByText('Set a username to review')).toBeInTheDocument();
    });

    it('owner: sees reviews but no write box', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'owner-1', username: 'the_owner' } } });
        renderAt();
        expect(await screen.findByText('Great grid.')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Rating' })).toBeNull();
        expect(screen.queryByText('Sign in to review')).toBeNull();
    });

    it('signed in with a username: saves a review and refreshes', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u9', username: 'fan_two' } } });
        const put = vi.spyOn(cloudApi, 'putReview').mockResolvedValue({ review: { ...review, id: 'r2', author: 'fan_two', rating: 5, body: 'Mine' } });
        renderAt();
        fireEvent.click(await screen.findByLabelText('5 stars'));
        fireEvent.change(screen.getByPlaceholderText(/share what you think/i), { target: { value: 'Mine' } });
        fireEvent.click(screen.getByRole('button', { name: /save review/i }));
        await waitFor(() => expect(put).toHaveBeenCalledWith('proj-1', { rating: 5, body: 'Mine' }));
        // refresh: listReviews called again after save
        await waitFor(() => expect(cloudApi.listReviews).toHaveBeenCalledTimes(2));
    });

    it('editing: pre-fills my review and offers delete', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u9', username: 'fan_one' } } });
        const mine = { ...review, author: 'fan_one' };
        vi.spyOn(cloudApi, 'listReviews').mockResolvedValue({ reviews: [mine], myReview: mine });
        const del = vi.spyOn(cloudApi, 'deleteReview').mockResolvedValue({ success: true });
        renderAt();
        expect(await screen.findByDisplayValue('Great grid.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /delete review/i }));
        await waitFor(() => expect(del).toHaveBeenCalledWith('proj-1'));
    });
});
