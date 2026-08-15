import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from '../../pages/EditorPage';
import {
    WorkspaceStoreError,
    type LocalWorkspaceStore,
    type WorkspaceCommand,
    type WorkspaceProject,
    type WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import { createBlankProject } from '../../services/presets';

const trackEvent = vi.hoisted(() => vi.fn());
const lastCreateResult = vi.hoisted(() => ({ current: undefined as boolean | undefined }));

const generatedProject = {
    schemaVersion: 11 as const,
    rootId: 'generated-root',
    activeVariantId: 'generated-variant',
    nodes: {
        'generated-root': { id: 'generated-root', parentId: null, type: 'generated-page', title: 'Generated', data: {}, children: [] },
    },
    variants: {
        'generated-variant': {
            id: 'generated-variant',
            name: 'Generated Variant',
            templates: {
                'generated-page': { id: 'generated-page', name: 'Generated Page', width: 500, height: 700, layers: [], elements: [] },
            },
        },
    },
};

const source = {
    formatVersion: 1 as const,
    templateScript: 'template source',
    hierarchyScript: 'hierarchy source',
};

vi.mock('../../components/ProjectEditor', () => ({
    ProjectEditor: ({ projectId, projectName, onCreateGeneratedProject }: any) => (
        <div data-testid={`editor-${projectId}`}>
            <span>{projectName}</span>
            <button onClick={async () => {
                lastCreateResult.current = await onCreateGeneratedProject('Separate Generated', generatedProject, source);
            }}>
                Create from {projectId}
            </button>
        </div>
    ),
}));
vi.mock('../../components/TabBar', () => ({
    TabBar: ({ projects }: { projects: WorkspaceProject[] }) => (
        <div>{projects.map(project => <span key={project.id}>{project.name}</span>)}</div>
    ),
}));
vi.mock('../../components/NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../../components/CloseProjectConfirmModal', () => ({ CloseProjectConfirmModal: () => null }));
vi.mock('../../components/AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('../../components/cloud/CloudMenu', () => ({ CloudMenu: () => null }));
vi.mock('../../services/analytics', () => ({ trackEvent }));

const originalProject = (): WorkspaceProject => {
    const initialState = createBlankProject();
    initialState.scale = 3;
    initialState.selectedElementIds = ['distinctive-selection'];
    return {
        id: 'source-project',
        name: 'Original Linked',
        initialState,
        cloud: { projectId: 'cloud-project', lastSyncedCommitId: 'cloud-commit' },
        revision: 7,
    };
};

const initialWorkspace = (): WorkspaceSnapshot => ({
    projects: [originalProject()],
    activeProjectId: 'source-project',
    customPresets: [],
    pendingImports: [],
});

const makeStore = (initial: WorkspaceSnapshot, fail = false) => {
    let durable = structuredClone(initial);
    const commit = vi.fn(async (command: WorkspaceCommand) => {
        if (fail) throw new WorkspaceStoreError('Generated project was not saved.', 'quota');
        if (command.type === 'create-and-activate-project') {
            durable = {
                ...durable,
                projects: [...durable.projects, structuredClone(command.project)],
                activeProjectId: command.project.id,
            };
        }
        return structuredClone(durable);
    });
    const store: LocalWorkspaceStore = {
        bootstrap: vi.fn(),
        commit,
        exportRecoveryBundle: vi.fn(),
    };
    return { store, commit };
};

const renderEditor = (store: LocalWorkspaceStore, workspace: WorkspaceSnapshot) => {
    const router = createMemoryRouter([{
        path: '/app',
        element: <EditorPage store={store} initialWorkspace={workspace} initialWarnings={[]} />,
    }], { initialEntries: ['/app'] });
    return render(<RouterProvider router={router} />);
};

describe('EditorPage generated project creation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        trackEvent.mockReset();
        lastCreateResult.current = undefined;
    });

    it('creates a separate durable project without changing source state, history, or cloud linkage', async () => {
        const initial = initialWorkspace();
        const originalBefore = structuredClone(initial.projects[0]);
        const { store, commit } = makeStore(initial);
        renderEditor(store, initial);

        fireEvent.click(screen.getByRole('button', { name: 'Create from source-project' }));

        await waitFor(() => expect(lastCreateResult.current).toBe(true));
        const command = commit.mock.calls[0][0];
        expect(command.type).toBe('create-and-activate-project');
        if (command.type !== 'create-and-activate-project') throw new Error('Unexpected command.');
        expect(initial.projects[0]).toEqual(originalBefore);
        expect(command.project).toMatchObject({
            name: 'Separate Generated',
            revision: 0,
            initialState: {
                rootId: 'generated-root',
                schemaVersion: 11,
                generator: {
                    formatVersion: 1,
                    templateScript: 'template source',
                    hierarchyScript: 'hierarchy source',
                    generatedAt: expect.any(String),
                },
            },
        });
        expect(command.project.cloud).toBeUndefined();
        expect(trackEvent).toHaveBeenCalledWith('project_created_from_generator', {
            sourceProjectId: 'source-project',
            nodeCount: 1,
        });
    });

    it('returns false and keeps source open when durable creation fails', async () => {
        const initial = initialWorkspace();
        const { store } = makeStore(initial, true);
        renderEditor(store, initial);

        fireEvent.click(screen.getByRole('button', { name: 'Create from source-project' }));

        await waitFor(() => expect(lastCreateResult.current).toBe(false));
        expect(screen.getAllByTestId(/^editor-/)).toHaveLength(1);
        expect(screen.getByTestId('editor-source-project')).toBeVisible();
        expect(trackEvent).not.toHaveBeenCalled();
    });
});
