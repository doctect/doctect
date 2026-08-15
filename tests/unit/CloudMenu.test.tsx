import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CloudMenu } from '../../components/cloud/CloudMenu';
import { cloudApi, ApiError } from '../../services/cloudApi';
import type { WorkspaceProject } from '../../services/localWorkspace/index';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));
// CloudMenu statically imports PublishModal, which imports thumbnailService, which loads
// pdfjs-dist at module scope; pdfjs-dist references DOMMatrix (a real-browser API) as soon as
// it's evaluated, which jsdom doesn't provide, crashing module load before any test can run.
// None of these tests exercise the Publish flow (project.cloud is always undefined here), so
// stub the one function that pulls in pdfjs-dist rather than touch CloudMenu or global setup.
// Resolves to the real contract's shape (an array of { nodeId, dataUrl } pairs) rather than
// undefined, so the stub can't drift from generateThumbnails' signature.
vi.mock('../../services/thumbnailService', () => ({
    generateThumbnails: vi.fn(async () => []),
}));

const project: WorkspaceProject = {
    id: 'local-1',
    name: 'Test Project',
    initialState: {
        nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
        rootId: 'root',
        variants: { default: { id: 'default', name: 'Default', templates: {} } },
        activeVariantId: 'default',
    } as any,
};

const menu = (
    menuProject: WorkspaceProject = project,
    onLinkCloud = vi.fn(async () => true),
    onRestoreState = vi.fn(async () => true),
) => (
    <MemoryRouter initialEntries={['/app']}>
        <Routes>
            <Route path="/app" element={<CloudMenu project={menuProject} onLinkCloud={onLinkCloud} onRestoreState={onRestoreState} />} />
            <Route path="/welcome" element={<div>WELCOME_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

const renderMenu = (
    menuProject: WorkspaceProject = project,
    onLinkCloud = vi.fn(async () => true),
    onRestoreState = vi.fn(async () => true),
) => render(menu(menuProject, onLinkCloud, onRestoreState));

describe('CloudMenu', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('shows "Sign in to save to cloud" when signed out', () => {
        mockUseSession.mockReturnValue({ data: null });
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        expect(screen.getByText('Sign in to save to cloud')).toBeInTheDocument();
    });

    it('shows "Set a username to use cloud features" when signed in without a username', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null } } });
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        const link = screen.getByText('Set a username to use cloud features');
        expect(link.closest('a')).toHaveAttribute('href', '/welcome');
        expect(screen.queryByText('Save to cloud (new)')).not.toBeInTheDocument();
    });

    it('shows the full cloud menu when signed in with a username', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        expect(screen.getByText('Save to cloud (new)')).toBeInTheDocument();
    });

    it('redirects to /welcome if the server rejects a save as USERNAME_REQUIRED', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        vi.spyOn(cloudApi, 'createProject').mockRejectedValue(new ApiError(403, 'nope', 'USERNAME_REQUIRED'));
        vi.spyOn(window, 'prompt').mockReturnValue('Initial save');
        renderMenu();
        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(screen.getByRole('button', { name: 'Save to cloud (new)' }));
        expect(await screen.findByText('WELCOME_MARKER')).toBeInTheDocument();
    });

    it('keeps local edits on conflict and reloads latest cloud state only when requested', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        const linked = { ...project, cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'head-1' } };
        const latestState = { ...project.initialState, rootId: 'latest' } as any;
        const onLinkCloud = vi.fn(async () => true);
        const onRestoreState = vi.fn(async () => true);
        vi.spyOn(cloudApi, 'getProject').mockResolvedValue({ id: 'cloud-1', headCommitId: 'head-2' } as any);
        vi.spyOn(cloudApi, 'saveCommit').mockRejectedValue(new ApiError(409, 'changed', 'PROJECT_HEAD_CHANGED'));
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({ id: 'head-2', state: latestState } as any);
        vi.spyOn(window, 'prompt').mockReturnValue('Update');
        renderMenu(linked, onLinkCloud, onRestoreState);

        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(screen.getByRole('button', { name: 'Save to cloud' }));

        expect(await screen.findByText(/changed since your last save/i)).toBeInTheDocument();
        expect(onRestoreState).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Reload cloud version' }));
        await waitFor(() => expect(onRestoreState).toHaveBeenCalledWith(
            latestState,
            { projectId: 'cloud-1', lastSyncedCommitId: 'head-2' },
        ));
        expect(onLinkCloud).not.toHaveBeenCalled();
    });

    it('retries a failed new-project local link without creating another remote project', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        const onLinkCloud = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const createProject = vi.spyOn(cloudApi, 'createProject').mockResolvedValue({
            project: { id: 'cloud-created' },
            commit: { id: 'head-created' },
        } as any);
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Initial save');
        renderMenu(project, onLinkCloud);

        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(screen.getByRole('button', { name: 'Save to cloud (new)' }));
        expect(await screen.findByText('Cloud save succeeded, but its local link was not saved.')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Retry local link' }));

        await waitFor(() => expect(onLinkCloud).toHaveBeenCalledTimes(2));
        expect(onLinkCloud).toHaveBeenNthCalledWith(1, {
            projectId: 'cloud-created',
            lastSyncedCommitId: 'head-created',
        });
        expect(onLinkCloud).toHaveBeenNthCalledWith(2, {
            projectId: 'cloud-created',
            lastSyncedCommitId: 'head-created',
        });
        expect(createProject).toHaveBeenCalledTimes(1);
        expect(prompt).toHaveBeenCalledTimes(1);
    });

    it('retries a failed updated-head local link without another cloud commit', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        const linked = { ...project, cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'head-1' } };
        const onLinkCloud = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        vi.spyOn(cloudApi, 'getProject').mockResolvedValue({ id: 'cloud-1', headCommitId: 'head-1' } as any);
        const saveCommit = vi.spyOn(cloudApi, 'saveCommit').mockResolvedValue({
            commit: { id: 'head-2' },
        } as any);
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Update');
        renderMenu(linked, onLinkCloud);

        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(screen.getByRole('button', { name: 'Save to cloud' }));
        expect(await screen.findByText('Cloud save succeeded, but its local link was not saved.')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Retry local link' }));

        await waitFor(() => expect(onLinkCloud).toHaveBeenCalledTimes(2));
        expect(onLinkCloud).toHaveBeenLastCalledWith({
            projectId: 'cloud-1',
            lastSyncedCommitId: 'head-2',
        });
        expect(saveCommit).toHaveBeenCalledTimes(1);
        expect(prompt).toHaveBeenCalledTimes(1);
    });

    it('keeps pending local links isolated by local project', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro' } } });
        const onLinkCloud = vi.fn().mockResolvedValue(false);
        vi.spyOn(cloudApi, 'createProject').mockResolvedValue({
            project: { id: 'cloud-created' },
            commit: { id: 'head-created' },
        } as any);
        vi.spyOn(window, 'prompt').mockReturnValue('Initial save');
        const view = renderMenu(project, onLinkCloud);

        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(screen.getByRole('button', { name: 'Save to cloud (new)' }));
        expect(await screen.findByRole('button', { name: 'Retry local link' })).toBeVisible();

        const secondProject = { ...project, id: 'local-2', name: 'Second Project' };
        view.rerender(menu(secondProject, onLinkCloud));
        expect(screen.getByRole('button', { name: 'Save to cloud (new)' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Retry local link' })).not.toBeInTheDocument();

        view.rerender(menu(project, onLinkCloud));
        expect(screen.getByRole('button', { name: 'Retry local link' })).toBeVisible();
    });
});
