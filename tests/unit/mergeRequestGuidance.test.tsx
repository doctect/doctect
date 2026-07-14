import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MergeRequestPage } from '../../pages/MergeRequestPage';
import { cloudApi, MrDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

// See tests/unit/MergeRequestPage.test.tsx for why thumbnailService must be stubbed here too
// (pdfjs-dist touches DOMMatrix at module-evaluation time, which jsdom doesn't provide).
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails: vi.fn() }));

const emptyChangeSet = {
    variantsAdded: [], variantsRemoved: [], variantsRenamed: {},
    templatesAdded: {}, templatesModified: {}, templatesRemoved: {}, nodesChanged: false,
    generatorChange: null,
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

describe('MergeRequestPage status guidance', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: { user: { id: 'viewer-id' } } });
    });

    it('tells a non-owner the MR is waiting for the project owner to review it', async () => {
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ status: 'open' }, false));
        renderAt();
        expect(await screen.findByText(/waiting for the project owner to review this merge request\./i)).toBeInTheDocument();
    });

    it('tells the target owner to review, then merge or close, when open', async () => {
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ status: 'open' }, true));
        renderAt();
        expect(await screen.findByText(/you own the target project — review the changes below, then merge or close\./i)).toBeInTheDocument();
    });

    it('explains a conflicted MR cannot be merged as-is', async () => {
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ status: 'conflicted' }, true));
        renderAt();
        expect(await screen.findByText(/the target project has changed since this was proposed — it can't be merged as-is\. update your fork and propose the changes again\./i)).toBeInTheDocument();
    });

    it('confirms a merged MR was merged into the target project', async () => {
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ status: 'merged' }, false));
        renderAt();
        expect(await screen.findByText(/this merge request was merged into the target project\./i)).toBeInTheDocument();
    });

    it('confirms a closed MR was closed without merging', async () => {
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue(makeDetail({ status: 'closed' }, false));
        renderAt();
        expect(await screen.findByText(/this merge request was closed without merging\./i)).toBeInTheDocument();
    });
});
