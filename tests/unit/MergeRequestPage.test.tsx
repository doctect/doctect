import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
// Preview tests assert this boundary's arguments; thumbnail rasterization remains covered by its own suite.
const generateThumbnails = vi.hoisted(() => vi.fn());
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails }));

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

const previewState = (kind: 'source' | 'target') => ({
    schemaVersion: 10,
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
    },
    rootId: 'root',
    variants: {
        default: {
            id: 'default',
            name: 'Default',
            templates: {
                page: {
                    id: 'page',
                    name: 'Page',
                    width: 500,
                    height: 700,
                    elements: kind === 'source'
                        ? [
                            { id: 'source-text', type: 'text', textOverflow: 'truncate', textWrap: 'true' },
                            { id: 'source-grid', type: 'grid', textOverflow: 'visible', textWrap: true },
                        ]
                        : [
                            { id: 'target-text', type: 'text', textOverflow: 'shrink', textWrap: false },
                            { id: 'target-grid', type: 'grid', textOverflow: null, textWrap: 1 },
                        ],
                },
            },
        },
    },
    activeVariantId: 'default',
});

const previewElement = (state: any, id: string) => (
    state.variants.default.templates.page.elements.find((item: any) => item.id === id)
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

describe('MergeRequestPage change summary', () => {
    beforeEach(() => vi.restoreAllMocks());

    it.each(['added', 'modified', 'removed'] as const)('shows one generator row when provenance was %s', async generatorChange => {
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue({
            ...makeDetail(),
            diff: {
                source: { ...emptyChangeSet, generatorChange },
                target: emptyChangeSet,
                conflicts: [],
            },
        });

        renderAt();

        expect(await screen.findAllByText('~ Generator source changed')).toHaveLength(1);
    });
});

describe('MergeRequestPage preview state loading', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        generateThumbnails.mockReset();
        generateThumbnails.mockResolvedValue([{ nodeId: 'page-1', dataUrl: 'data:image/png;base64,preview' }]);
        mockUseSession.mockReturnValue({ data: { user: { id: 'owner-id' } } });
    });

    it('normalizes v10 source and target through migrateState before thumbnail rendering', async () => {
        const sourceState = previewState('source');
        const targetState = previewState('target');
        const sourceBefore = structuredClone(sourceState);
        const targetBefore = structuredClone(targetState);
        vi.spyOn(cloudApi, 'getMr').mockResolvedValue({
            ...makeDetail(),
            sourceState,
            targetState,
            diff: {
                source: { ...emptyChangeSet, templatesModified: { default: ['page'] } },
                target: emptyChangeSet,
                conflicts: [],
            },
        } as any);
        renderAt();

        fireEvent.click(await screen.findByRole('button', { name: 'Render before/after preview' }));

        await waitFor(() => expect(generateThumbnails).toHaveBeenCalledTimes(2));
        const [normalizedSource] = generateThumbnails.mock.calls[0];
        const [normalizedTarget] = generateThumbnails.mock.calls[1];
        expect(normalizedSource.schemaVersion).toBe(11);
        expect(previewElement(normalizedSource, 'source-text')).toMatchObject({
            textOverflow: 'clip', textWrap: true,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expect(previewElement(normalizedSource, 'source-grid')).toMatchObject({ textOverflow: 'visible', textWrap: true });
        expect(normalizedTarget.schemaVersion).toBe(11);
        expect(previewElement(normalizedTarget, 'target-text')).toMatchObject({
            textOverflow: 'shrink', textWrap: false,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expect(previewElement(normalizedTarget, 'target-grid')).toMatchObject({ textOverflow: 'clip', textWrap: false });
        expect(sourceState).toEqual(sourceBefore);
        expect(targetState).toEqual(targetBefore);
    });
});
