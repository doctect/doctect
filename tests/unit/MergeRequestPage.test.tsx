import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MergeRequestPage } from '../../pages/MergeRequestPage';
import { cloudApi, MrDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

// MergeRequestPage statically imports services/thumbnailService (for the before/after preview
// render), which statically imports pdfjs-dist -- pdfjs-dist touches DOMMatrix (a real-browser
// API) at module-evaluation time, which jsdom doesn't provide. Same gap already documented and
// worked around in tests/unit/CloudMenu.test.tsx (CloudMenu -> PublishModal -> thumbnailService).
// None of these tests trigger the preview render, so stubbing the module's sole export is safe.
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails: vi.fn() }));

const emptyChangeSet = {
    variantsAdded: [], variantsRemoved: [], variantsRenamed: {},
    templatesAdded: {}, templatesModified: {}, templatesRemoved: {}, nodesChanged: false,
};

const baseMr = {
    id: 'mr-1', sourceProjectId: 'src-1', sourceProjectName: 'Fork', sourceCommitId: 'c1',
    targetProjectId: 'tgt-1', targetProjectName: 'Upstream', baseCommitId: 'c0',
    title: 'Propose a change', description: '', status: 'open' as const,
    createdBy: 'author-id', authorUsername: 'some_author', createdAt: '2026-01-01', resolvedAt: null,
};

const makeDetail = (overrides: Partial<MrDetail['mergeRequest']> = {}, isTargetOwner = true): MrDetail => ({
    mergeRequest: { ...baseMr, ...overrides },
    diff: { source: emptyChangeSet, target: emptyChangeSet, conflicts: [] },
    sourceState: {}, targetState: {},
    isTargetOwner,
});

const renderAt = () => render(
    <MemoryRouter initialEntries={['/mr/mr-1']}>
        <Routes>
            <Route path="/mr/:id" element={<MergeRequestPage />} />
        </Routes>
    </MemoryRouter>
);

describe('MergeRequestPage merge-button visibility', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('shows the Merge button when the viewer is the target owner and the MR is open', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'owner-id' } } });
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ createdBy: 'author-id' }, true));
        renderAt();
        expect(await screen.findByRole('button', { name: /merge/i })).toBeInTheDocument();
    });

    it('hides the Merge button when the viewer is not the target owner', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'author-id' } } });
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ createdBy: 'author-id' }, false));
        renderAt();
        await screen.findByRole('button', { name: /close/i });
        expect(screen.queryByRole('button', { name: /merge/i })).not.toBeInTheDocument();
    });

    it('shows the Merge button for a self-fork MR (viewer is both the author and the target owner)', async () => {
        // This is exactly the bug scenario: the viewer IS the MR's author (createdBy matches their
        // own session id), which an "isOwner = not the author" heuristic would wrongly read as
        // "not the owner". isTargetOwner is server-computed and must be trusted directly instead.
        mockUseSession.mockReturnValue({ data: { user: { id: 'solo-id' } } });
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ createdBy: 'solo-id' }, true));
        renderAt();
        expect(await screen.findByRole('button', { name: /merge/i })).toBeInTheDocument();
    });

    it('hides the Merge button when the MR is conflicted, even for the target owner', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'owner-id' } } });
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ createdBy: 'author-id', status: 'conflicted' }, true));
        renderAt();
        await screen.findByRole('button', { name: /close/i });
        expect(screen.queryByRole('button', { name: /merge/i })).not.toBeInTheDocument();
    });

    it('always shows the Close button while the MR is actionable, regardless of ownership', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'author-id' } } });
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ createdBy: 'author-id' }, false));
        renderAt();
        expect(await screen.findByRole('button', { name: /close/i })).toBeInTheDocument();
    });
});
