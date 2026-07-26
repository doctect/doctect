import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditListingModal } from '../../components/cloud/EditListingModal';
import { ApiError, cloudApi, GalleryDetail, GalleryPreview } from '../../services/cloudApi';
// Type-only (erased at compile time, so it does not defeat the vi.mock below): pins the
// stubbed renderer to its real return shape instead of a hand-copied guess.
import type { RenderedPreview } from '../../services/thumbnailService';

const computePageOrder = vi.hoisted(() => vi.fn(() => ['p1', 'p2', 'p3']));
vi.mock('../../services/pdfService', () => ({ computePageOrder }));
const generateThumbnails = vi.hoisted(() => vi.fn());
// Stubbed wholesale because the real module loads pdfjs-dist at module scope, which touches
// DOMMatrix and crashes under jsdom. MAX_PREVIEWS is deliberately NOT restated here: the cap
// lives in constants/previews (which is not mocked), and re-declaring it in this mock would
// leave a hardcoded 6 behind to disagree with the shipped constant the day it changes.
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails }));

const state = {
    nodes: {
        p1: { id: 'p1', parentId: null, type: 'page', title: 'Cover', data: {}, children: [] },
        p2: { id: 'p2', parentId: null, type: 'page', title: 'Week', data: {}, children: [] },
        p3: { id: 'p3', parentId: null, type: 'page', title: 'Notes', data: {}, children: [] },
    },
    rootId: 'p1',
    variants: { default: { id: 'default', name: 'Default', templates: {} } },
    activeVariantId: 'default',
    schemaVersion: 10,
};

const listing = (previews: GalleryPreview[]): GalleryDetail => ({
    id: 'proj-1', name: 'Planner', description: 'old description', tags: ['old'],
    author: 'someone', ownerId: 'user-1', forkCount: 0, downloadCount: 0,
    updatedAt: '', headCommitId: 'commit-1', thumbnailIds: previews.map(p => p.id),
    previews, forkedFrom: null, ratingAvg: null, ratingCount: 0,
});

const renderModal = () => {
    const props = { onClose: vi.fn(), onSaved: vi.fn() };
    return { ...props, ...render(<EditListingModal projectId="proj-1" {...props} />) };
};

beforeEach(() => {
    vi.restoreAllMocks();
    generateThumbnails.mockReset();
    vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
        id: 'commit-1', message: 'm', createdAt: '', state,
    });
});

describe('EditListingModal', () => {
    it('opens with the published description, tags and preview pages already selected', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        renderModal();

        expect(await screen.findByDisplayValue('old description')).toBeTruthy();
        expect(screen.getByDisplayValue('old')).toBeTruthy();
        const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
        expect(boxes.map(b => b.checked)).toEqual([false, true, false]);
    });

    it('saves tags without re-rendering previews when the selection is untouched', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        const { onSaved } = renderModal();

        const tags = await screen.findByDisplayValue('old');
        fireEvent.change(tags, { target: { value: 'fresh, tags' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(generateThumbnails).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith('proj-1', {
            description: 'old description', tags: ['fresh', 'tags'],
            thumbnails: undefined, previewNodeIds: undefined,
        });
    });

    it('re-renders and sends previews when the selection changes', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        generateThumbnails.mockImplementation(async (_s: any, ids: string[]): Promise<RenderedPreview[]> =>
            ids.map(id => ({ nodeId: id, dataUrl: `data:image/webp;base64,${id}` })));
        renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[2]);   // add "Notes"
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(save.mock.calls[0][1]).toEqual({
            description: 'old description', tags: ['old'],
            thumbnails: ['data:image/webp;base64,p2', 'data:image/webp;base64,p3'],
            previewNodeIds: ['p2', 'p3'],
        });
    });

    it('sends each preview with the page it rendered from, not the page that was picked', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p1' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        // The renderer drops any page it cannot rasterize, so what comes back is not always one
        // image per selected page. Sending `selected` alongside these images would record p3's
        // image as having come from p2 -- and every preview after a skip with the wrong page.
        generateThumbnails.mockImplementation(async (_s: any, ids: string[]): Promise<RenderedPreview[]> =>
            ids.filter(id => id !== 'p2').map(id => ({ nodeId: id, dataUrl: `data:image/webp;base64,${id}` })));
        renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[1]);   // add "Week", the page the renderer will skip
        fireEvent.click(boxes[2]);   // add "Notes"
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(generateThumbnails).toHaveBeenCalledWith(state, ['p1', 'p2', 'p3'], 'default');
        expect(save.mock.calls[0][1]).toMatchObject({
            thumbnails: ['data:image/webp;base64,p1', 'data:image/webp;base64,p3'],
            previewNodeIds: ['p1', 'p3'],
        });
    });

    it('opens a legacy listing unchecked and keeps its previews when left alone', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: null }, { id: 't2', nodeId: null }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        renderModal();

        const boxes = await screen.findAllByRole('checkbox') as HTMLInputElement[];
        expect(boxes.some(b => b.checked)).toBe(false);
        expect(screen.getByText(/current previews/i)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(generateThumbnails).not.toHaveBeenCalled();
        expect(save.mock.calls[0][1].thumbnails).toBeUndefined();
    });

    it('shows a failed load, keeps saving disabled, and reloads on retry', async () => {
        const detail = vi.spyOn(cloudApi, 'galleryDetail')
            .mockRejectedValueOnce(new ApiError(404, 'Project not found'))
            .mockResolvedValue(listing([{ id: 't1', nodeId: 'p2' }]));
        renderModal();

        expect(await screen.findByRole('alert')).toHaveTextContent('Project not found');
        expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
        expect(cloudApi.getCommit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByDisplayValue('old description')).toBeTruthy();
        expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
        expect(detail).toHaveBeenCalledTimes(2);
    });

    it('refuses to save when every preview page has been unticked', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[1]);   // untick the only selected page
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(save).not.toHaveBeenCalled();
    });
});
