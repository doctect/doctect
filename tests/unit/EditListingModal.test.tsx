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
        // The published commit the dialog loaded travels with the save: the route refuses the
        // write if a publish has moved the listing on since.
        expect(save).toHaveBeenCalledWith('proj-1', 'commit-1', {
            description: 'old description', tags: ['fresh', 'tags'],
            thumbnails: undefined, previewNodeIds: undefined,
        });
        // Hosts close on save, but they close from within onSaved -- so the button must already
        // be live again by then rather than left dead for the tick before the dialog goes away.
        expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
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
        expect(save.mock.calls[0][2]).toEqual({
            description: 'old description', tags: ['old'],
            thumbnails: ['data:image/webp;base64,p2', 'data:image/webp;base64,p3'],
            previewNodeIds: ['p2', 'p3'],
        });
    });

    it('sends each preview with the page it rendered from, not the page that was picked', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p1' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        // generateThumbnails returns page/image PAIRS, and those pairs -- not `selected` -- are
        // what says which page produced which image. The renderer skipping a page is the
        // divergence that originally made that visible; it no longer reaches the PATCH, since
        // the modal's count guard refuses a short render outright (covered by the next test).
        // So this stands the pairs' order apart from the selection's instead: a caller zipping
        // `selected` against a bare image list would record every one of these images as having
        // come from the wrong page, exactly as it would have after a skip.
        generateThumbnails.mockImplementation(async (_s: any, ids: string[]): Promise<RenderedPreview[]> =>
            [...ids].reverse().map(id => ({ nodeId: id, dataUrl: `data:image/webp;base64,${id}` })));
        renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[1]);   // add "Week"
        fireEvent.click(boxes[2]);   // add "Notes"
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(generateThumbnails).toHaveBeenCalledWith(state, ['p1', 'p2', 'p3'], 'default');
        expect(save.mock.calls[0][2]).toMatchObject({
            thumbnails: [
                'data:image/webp;base64,p3', 'data:image/webp;base64,p2', 'data:image/webp;base64,p1',
            ],
            previewNodeIds: ['p3', 'p2', 'p1'],
        });
    });

    it('refuses a partial render instead of replacing live previews with fewer', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p1' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        // Sending whatever came back would be worse here than on publish: replaceThumbnails
        // deletes the whole published set before inserting, in one transaction, and nothing
        // snapshots thumbnails -- so a short render destroys live public images for good.
        generateThumbnails.mockImplementation(async (_s: any, ids: string[]): Promise<RenderedPreview[]> =>
            ids.filter(id => id !== 'p2').map(id => ({ nodeId: id, dataUrl: `data:image/webp;base64,${id}` })));
        const { onSaved } = renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[1]);   // add "Week", the page the renderer will skip
        fireEvent.click(boxes[2]);   // add "Notes"
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Only 2 of 3 previews rendered. Nothing was changed — try again.');
        expect(save).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
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
        expect(save.mock.calls[0][2].thumbnails).toBeUndefined();
    });

    it('surfaces a rejected save and leaves the form usable', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        vi.spyOn(cloudApi, 'updatePublication').mockRejectedValue(
            new ApiError(403, 'Only the owner can edit this listing.'));
        const { onSaved } = renderModal();

        await screen.findByDisplayValue('old description');
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Only the owner can edit this listing.');
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });

    // The server's own message names the cause but not the cure, and "reload the page" is the
    // wrong cure here: the dialog snapshots the listing at load, so only reopening it picks up
    // what was republished. The owner has to be told that, or they will just press Save again.
    it('tells the owner to reopen the dialog when the listing was republished under it', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        vi.spyOn(cloudApi, 'updatePublication').mockRejectedValue(
            new ApiError(409, 'This listing was republished after you loaded it.', 'PUBLICATION_CHANGED'));
        const { onSaved } = renderModal();

        await screen.findByDisplayValue('old description');
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/republished/i);
        expect(alert).toHaveTextContent(/reopen/i);
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });

    it('takes focus on mount so Escape closes it, and gives focus back on unmount', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        const { onClose, unmount } = renderModal();

        // Dispatched at whatever actually holds focus rather than at the dialog: a keydown
        // handler bound to a container only ever sees keys that bubble from inside it, so
        // firing at the dialog itself would pass even with nothing in the dialog focused.
        expect(screen.getByRole('dialog')).toHaveFocus();
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();

        await screen.findByDisplayValue('old description');
        unmount();
        expect(trigger).toHaveFocus();
        trigger.remove();
    });

    it('contains Tab focus within the dialog', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        renderModal();
        await screen.findByDisplayValue('old description');
        const dialog = screen.getByRole('dialog');
        const close = screen.getByRole('button', { name: 'Close edit listing dialog' });
        const save = screen.getByRole('button', { name: /save changes/i });

        save.focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(close).toHaveFocus();

        close.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(save).toHaveFocus();
    });

    it('contains Shift+Tab fired from the dialog itself, before focus reaches a child', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        renderModal();
        await screen.findByDisplayValue('old description');
        const dialog = screen.getByRole('dialog');
        const save = screen.getByRole('button', { name: /save changes/i });

        // Mount focus lands on the container, which is neither the first nor the last focusable
        // child -- so a trap that only reacts to those two lets the very first Shift+Tab fall
        // out of the dialog and into whatever precedes it in document order.
        expect(dialog).toHaveFocus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(save).toHaveFocus();
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
