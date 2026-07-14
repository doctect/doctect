import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishModal } from '../../components/cloud/PublishModal';
import { ApiError, cloudApi } from '../../services/cloudApi';

const computePageOrder = vi.hoisted(() => vi.fn((projectState: any) => [projectState.rootId]));
vi.mock('../../services/pdfService', () => ({ computePageOrder }));
const generateThumbnails = vi.hoisted(() => vi.fn());
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails }));

const generator = {
    formatVersion: 1 as const,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};

const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 9,
};

const nextState = {
    ...state,
    nodes: { next: { id: 'next', parentId: null, type: 'page', title: 'Next Project Page', data: {}, children: [] } },
    rootId: 'next',
};

const cloudHeadState = {
    ...state,
    nodes: { cloud: { id: 'cloud', parentId: null, type: 'page', title: 'Cloud Head Page', data: {}, children: [] } },
    rootId: 'cloud',
    activeVariantId: 'print',
    variants: {
        ...state.variants,
        print: { id: 'print', name: 'Print', templates: state.variants.default.templates },
    },
};

const cloudProject = { id: 'cloud-1', name: 'Cloud Project', headCommitId: 'head-1' } as any;

const modal = (cloudProjectId = 'cloud-1', withLocalGenerator = false) => (
    <PublishModal
        project={{
            id: `local-${cloudProjectId}`,
            name: 'Project',
            initialState: { ...(cloudProjectId === 'cloud-2' ? nextState : state), ...(withLocalGenerator ? { generator } : {}) } as any,
        }}
        cloudProjectId={cloudProjectId}
        onClose={vi.fn()}
        onPublished={vi.fn()}
    />
);

const renderModal = (withLocalGenerator: boolean) => {
    const props = { onClose: vi.fn(), onPublished: vi.fn() };
    const result = render(<PublishModal
        project={{ id: 'local-1', name: 'Project', initialState: { ...state, ...(withLocalGenerator ? { generator } : {}) } as any }}
        cloudProjectId="cloud-1"
        {...props}
    />);
    return { ...props, ...result };
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
};

describe('PublishModal generator source warning', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        generateThumbnails.mockReset();
        computePageOrder.mockImplementation((projectState: any) => [projectState.rootId]);
        vi.spyOn(cloudApi, 'getProject').mockResolvedValue(cloudProject);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'head-1', message: 'Head', createdAt: '2026-07-14T12:40:00.000Z', state,
        });
    });

    it('warns from cloud head source when local source is detached', async () => {
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'head-1', message: 'Head', createdAt: '2026-07-14T12:40:00.000Z', state: { ...state, generator },
        });
        renderModal(false);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information. To exclude source, cancel, use “Detach Saved Generator” in Hierarchy Generator, and save to cloud before publishing.',
        );
        expect(cloudApi.getProject).toHaveBeenCalledWith('cloud-1');
        expect(cloudApi.getCommit).toHaveBeenCalledWith('cloud-1', 'head-1');
    });

    it('does not warn when local source exists but cloud head source is absent', async () => {
        renderModal(true);

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('disables publish while loading and after a missing-head error, then allows retry', async () => {
        const pending = deferred<any>();
        vi.spyOn(cloudApi, 'getProject')
            .mockReturnValueOnce(pending.promise)
            .mockResolvedValue(cloudProject);
        renderModal(false);

        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('Checking cloud source disclosure');
        pending.resolve({ ...cloudProject, headCommitId: null });

        expect(await screen.findByRole('alert')).toHaveTextContent('Cloud project has no head commit');
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        expect(cloudApi.getCommit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
    });

    it('publishes normally after cloud disclosure loads', async () => {
        generateThumbnails.mockResolvedValue(['data:image/png;base64,preview']);
        const publish = vi.spyOn(cloudApi, 'publish').mockResolvedValue({} as any);
        const props = renderModal(false);
        const button = screen.getByRole('button', { name: 'Publish' });
        await waitFor(() => expect(button).toBeEnabled());

        fireEvent.click(button);

        await waitFor(() => expect(publish).toHaveBeenCalledWith('cloud-1', 'head-1', {
            description: '',
            tags: [],
            thumbnails: ['data:image/png;base64,preview'],
        }));
        expect(props.onPublished).toHaveBeenCalledOnce();
    });

    it('derives pages, selection, active variant, and thumbnails from the cloud head', async () => {
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'head-1', message: 'Head', createdAt: '2026-07-14T12:40:00.000Z', state: cloudHeadState,
        });
        generateThumbnails.mockResolvedValue(['data:image/png;base64,preview']);
        vi.spyOn(cloudApi, 'publish').mockResolvedValue({} as any);
        renderModal(false);

        expect(await screen.findByRole('checkbox', { name: 'Cloud Head Page' })).toBeChecked();
        expect(screen.queryByRole('checkbox', { name: 'Root' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

        await waitFor(() => expect(generateThumbnails).toHaveBeenCalledWith(
            cloudHeadState,
            ['cloud'],
            'print',
        ));
    });

    it('reloads changed head disclosure after a conditional publish conflict', async () => {
        vi.spyOn(cloudApi, 'getProject')
            .mockResolvedValueOnce(cloudProject)
            .mockResolvedValueOnce({ ...cloudProject, headCommitId: 'head-2' });
        vi.spyOn(cloudApi, 'getCommit').mockImplementation(async (_projectId, commitId) => ({
            id: commitId,
            message: 'Head',
            createdAt: '2026-07-14T12:40:00.000Z',
            state: commitId === 'head-2' ? { ...state, generator } : state,
        }));
        generateThumbnails.mockResolvedValue(['data:image/png;base64,preview']);
        const publish = vi.spyOn(cloudApi, 'publish').mockRejectedValue(
            new ApiError(409, 'Project changed since disclosure was inspected.', 'PROJECT_HEAD_CHANGED'),
        );
        const props = renderModal(false);
        const button = screen.getByRole('button', { name: 'Publish' });
        await waitFor(() => expect(button).toBeEnabled());

        fireEvent.click(button);

        expect(await screen.findByText(/Publishing makes both scripts public/)).toBeInTheDocument();
        expect(cloudApi.getCommit).toHaveBeenLastCalledWith('cloud-1', 'head-2');
        expect(publish).toHaveBeenCalledOnce();
        expect(publish).toHaveBeenCalledWith('cloud-1', 'head-1', expect.any(Object));
        expect(props.onPublished).not.toHaveBeenCalled();
        expect(button).toBeEnabled();
    });

    it('immediately disables old disclosure when the cloud project changes', async () => {
        const nextProject = deferred<any>();
        vi.spyOn(cloudApi, 'getProject').mockImplementation(projectId => (
            projectId === 'cloud-1'
                ? Promise.resolve(cloudProject)
                : nextProject.promise
        ));
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'head-1', message: 'Head', createdAt: '2026-07-14T12:40:00.000Z', state: { ...state, generator },
        });
        const { rerender } = render(modal('cloud-1'));
        expect(await screen.findByRole('alert')).toHaveTextContent('Publishing makes both scripts public');
        expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();

        rerender(modal('cloud-2'));

        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        expect(screen.queryByText(/Publishing makes both scripts public/)).not.toBeInTheDocument();
    });

    it('resets project-specific form state when the cloud project changes', async () => {
        const nextProject = deferred<any>();
        vi.spyOn(cloudApi, 'getProject').mockImplementation(projectId => (
            projectId === 'cloud-1'
                ? Promise.resolve(cloudProject)
                : nextProject.promise
        ));
        vi.spyOn(cloudApi, 'getCommit').mockImplementation(async (projectId, commitId) => ({
            id: commitId,
            message: 'Head',
            createdAt: '2026-07-14T12:40:00.000Z',
            state: projectId === 'cloud-1' ? { ...state, generator } : nextState,
        }));
        generateThumbnails.mockResolvedValue(['data:image/png;base64,old-preview']);
        vi.spyOn(cloudApi, 'publish').mockRejectedValue(new Error('Old project publish failed'));
        const { rerender } = render(modal('cloud-1'));
        const publishButton = screen.getByRole('button', { name: 'Publish' });
        await waitFor(() => expect(publishButton).toBeEnabled());
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Old description' } });
        fireEvent.change(screen.getByLabelText('Tags (comma-separated)'), { target: { value: 'old, tags' } });
        fireEvent.click(publishButton);
        expect(await screen.findByText('Old project publish failed')).toBeInTheDocument();
        expect(screen.getByAltText('Preview 1')).toHaveAttribute('src', 'data:image/png;base64,old-preview');

        rerender(modal('cloud-2'));

        await waitFor(() => {
            expect(screen.getByLabelText('Description')).toHaveValue('');
            expect(screen.getByLabelText('Tags (comma-separated)')).toHaveValue('');
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
            expect(screen.queryByAltText('Preview 1')).not.toBeInTheDocument();
            expect(screen.queryByText('Old project publish failed')).not.toBeInTheDocument();
        });
        expect(screen.queryByText(/Publishing makes both scripts public/)).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Checking cloud source disclosure');
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

        nextProject.resolve({ ...cloudProject, id: 'cloud-2', headCommitId: 'head-2' });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
        expect(screen.getByRole('checkbox', { name: 'Next Project Page' })).toBeChecked();
    });

    it('does not let an operation started for the old project publish after rerender', async () => {
        const thumbnails = deferred<string[]>();
        generateThumbnails.mockReturnValue(thumbnails.promise);
        const publish = vi.spyOn(cloudApi, 'publish').mockResolvedValue({} as any);
        const { rerender } = render(modal('cloud-1'));
        const button = screen.getByRole('button', { name: 'Publish' });
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        await waitFor(() => expect(generateThumbnails).toHaveBeenCalledOnce());

        rerender(modal('cloud-2'));
        thumbnails.resolve(['data:image/png;base64,preview']);

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled());
        expect(publish).not.toHaveBeenCalled();
    });

    it('provides labelled modal semantics, initial focus, and an accessible close name', async () => {
        const props = renderModal(false);

        expect(screen.getByRole('dialog', { name: 'Publish to gallery' })).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByLabelText('Description')).toHaveFocus();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Close publish dialog' }));

        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('contains Tab focus and closes on Escape', async () => {
        const props = renderModal(false);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
        const dialog = screen.getByRole('dialog');
        const close = screen.getByRole('button', { name: 'Close publish dialog' });
        const publish = screen.getByRole('button', { name: 'Publish' });

        publish.focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(close).toHaveFocus();

        close.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(publish).toHaveFocus();

        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('restores focus after unmount and announces publish errors', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        generateThumbnails.mockRejectedValue(new Error('Thumbnail rendering failed'));
        const result = renderModal(false);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());

        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Thumbnail rendering failed');

        result.unmount();
        expect(trigger).toHaveFocus();
        trigger.remove();
    });
});
