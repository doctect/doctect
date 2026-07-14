import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishModal } from '../../components/cloud/PublishModal';
import { cloudApi } from '../../services/cloudApi';

vi.mock('../../services/pdfService', () => ({ computePageOrder: () => ['root'] }));
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

const cloudProject = { id: 'cloud-1', name: 'Cloud Project', headCommitId: 'head-1' } as any;

const renderModal = (withLocalGenerator: boolean) => {
    const props = { onClose: vi.fn(), onPublished: vi.fn() };
    render(<PublishModal
        project={{ id: 'local-1', name: 'Project', initialState: { ...state, ...(withLocalGenerator ? { generator } : {}) } as any }}
        cloudProjectId="cloud-1"
        {...props}
    />);
    return props;
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

        await waitFor(() => expect(publish).toHaveBeenCalledWith('cloud-1', {
            description: '',
            tags: [],
            thumbnails: ['data:image/png;base64,preview'],
        }));
        expect(props.onPublished).toHaveBeenCalledOnce();
    });
});
