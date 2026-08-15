import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from '../../pages/EditorPage';
import { loadProjectState } from '../../services/loadProjectState';
import type {
    LocalWorkspaceStore,
    WorkspaceProject,
    WorkspaceSnapshot,
} from '../../services/localWorkspace/index';

const downloadJson = vi.hoisted(() => vi.fn());

vi.mock('../../components/ProjectEditor', () => ({
    ProjectEditor: ({ initialState }: any) => <pre data-testid="project-state">{JSON.stringify(initialState)}</pre>,
}));
vi.mock('../../components/TabBar', () => ({
    TabBar: ({ projects, activeProjectId, onClose }: any) => (
        <div>
            {projects.map((project: WorkspaceProject) => <span key={project.id}>{project.name}</span>)}
            <button onClick={() => onClose(activeProjectId)}>Close active project</button>
        </div>
    ),
}));
vi.mock('../../components/NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../../components/AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('../../components/cloud/CloudMenu', () => ({ CloudMenu: () => null }));
vi.mock('../../components/CloseProjectConfirmModal', () => ({
    CloseProjectConfirmModal: ({ isOpen, onSaveAndClose }: any) => isOpen
        ? <button onClick={onSaveAndClose}>Save JSON and close</button>
        : null,
}));
vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../services/browserDownload', () => ({ downloadJson, downloadBlob: vi.fn() }));

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
    schemaVersion: 11,
};

const stateWithOverflow = () => ({
    ...state,
    variants: {
        default: {
            ...state.variants.default,
            templates: {
                page: {
                    ...state.variants.default.templates.page,
                    elements: [
                        { id: 'valid-text', type: 'text', textOverflow: 'shrink', textWrap: false },
                        { id: 'malformed-text', type: 'text', textOverflow: 'truncate', textWrap: 'true' },
                        { id: 'valid-grid', type: 'grid', textOverflow: 'visible', textWrap: true },
                        { id: 'malformed-grid', type: 'grid', textOverflow: null, textWrap: 0 },
                    ],
                },
            },
        },
    },
});

const projectElement = (projectState: any, id: string) => (
    projectState.variants.default.templates.page.elements.find((item: any) => item.id === id)
);

const workspace = (project: WorkspaceProject): WorkspaceSnapshot => ({
    projects: [project],
    activeProjectId: project.id,
    customPresets: [],
    pendingImports: [],
});

const renderEditor = (initialWorkspace: WorkspaceSnapshot, initialWarnings: string[] = []) => {
    const store: LocalWorkspaceStore = {
        bootstrap: vi.fn(),
        commit: vi.fn(async command => {
            if (command.type === 'close-project' && command.successor) {
                return workspace(command.successor);
            }
            return initialWorkspace;
        }),
        exportRecoveryBundle: vi.fn(),
    };
    const router = createMemoryRouter([{
        path: '/app',
        element: (
            <EditorPage
                store={store}
                initialWorkspace={initialWorkspace}
                initialWarnings={initialWarnings}
            />
        ),
    }], { initialEntries: ['/app'] });
    return render(<RouterProvider router={router} />);
};

describe('EditorPage generator metadata loads', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        downloadJson.mockReset();
    });

    it('renders the verified snapshot and supplied migration warning without reloading legacy storage', () => {
        const loaded = loadProjectState({
            ...stateWithOverflow(),
            generator: { ...generator, formatVersion: 2 },
        });
        renderEditor(workspace({
            id: 'local-1',
            name: 'Local Project',
            initialState: loaded.state,
        }), loaded.warnings);

        expect(screen.getByRole('alert')).toHaveTextContent('Saved generator was detached');
        const rendered = JSON.parse(screen.getByTestId('project-state').textContent || '{}');
        expect(rendered.generator).toBeUndefined();
        expect(rendered.schemaVersion).toBe(11);
        expect(projectElement(rendered, 'valid-text')).toMatchObject({
            textOverflow: 'shrink', textWrap: false,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expect(projectElement(rendered, 'malformed-text')).toMatchObject({
            textOverflow: 'clip', textWrap: true,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss project load warnings' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('downloads the exact nested generator object from the verified working project', async () => {
        const initialState = loadProjectState({ ...state, generator }).state;
        renderEditor(workspace({ id: 'local-1', name: 'Generated Project', initialState }));

        fireEvent.click(screen.getByRole('button', { name: 'Close active project' }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Save JSON and close' }));
            await Promise.resolve();
        });

        expect(downloadJson).toHaveBeenCalledWith(
            expect.objectContaining({ generator }),
            expect.stringMatching(/^Generated_Project_\d{4}-\d{2}-\d{2}\.json$/),
        );
    });
});
