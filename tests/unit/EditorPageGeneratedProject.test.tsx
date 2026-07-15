import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage, type Project } from '../../pages/EditorPage';
import { createBlankProject } from '../../services/presets';

const trackEvent = vi.hoisted(() => vi.fn());
const lastCreateResult = vi.hoisted(() => ({ current: undefined as boolean | undefined }));

const generatedProject = {
    schemaVersion: 9 as const,
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
            <button onClick={() => {
                lastCreateResult.current = onCreateGeneratedProject('Separate Generated', generatedProject, source);
            }}>
                Create from {projectId}
            </button>
        </div>
    ),
}));
vi.mock('../../components/TabBar', () => ({
    TabBar: ({ projects }: any) => <div>{projects.map((project: any) => <span key={project.id}>{project.name}</span>)}</div>,
}));
vi.mock('../../components/NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../../components/CloseProjectConfirmModal', () => ({ CloseProjectConfirmModal: () => null }));
vi.mock('../../components/AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('../../components/cloud/CloudMenu', () => ({ CloudMenu: () => null }));
vi.mock('../../services/analytics', () => ({ trackEvent }));

const seedOriginal = () => {
    const state = createBlankProject();
    state.scale = 3;
    state.selectedElementIds = ['distinctive-selection'];
    const original: Project = {
        id: 'source-project',
        name: 'Original Linked',
        initialState: state,
        cloud: { projectId: 'cloud-project', lastSyncedCommitId: 'cloud-commit' },
        revision: 7,
    };
    localStorage.setItem('hype_projects', JSON.stringify([original]));
    localStorage.setItem('hype_active_project', original.id);
    return structuredClone(original);
};

const savedProjects = (): Project[] => JSON.parse(localStorage.getItem('hype_projects') || '[]');
const renderEditor = () => render(<MemoryRouter><EditorPage /></MemoryRouter>);

describe('EditorPage generated project creation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        trackEvent.mockReset();
        lastCreateResult.current = undefined;
        localStorage.clear();
    });

    it('creates a separate local project without changing original state, history, or cloud linkage', async () => {
        const originalBefore = seedOriginal();
        renderEditor();

        fireEvent.click(screen.getByRole('button', { name: 'Create from source-project' }));

        await waitFor(() => expect(savedProjects()).toHaveLength(2));
        const [originalAfter, created] = savedProjects();
        expect(originalAfter).toEqual(originalBefore);
        expect(created.name).toBe('Separate Generated');
        expect(created.cloud).toBeUndefined();
        expect(created.revision).toBe(0);
        expect(created.initialState.generator).toEqual({
            formatVersion: 1,
            templateScript: 'template source',
            hierarchyScript: 'hierarchy source',
            generatedAt: expect.any(String),
        });
        expect(created.initialState.rootId).toBe('generated-root');
        expect(localStorage.getItem('hype_active_project')).toBe(created.id);
        expect(trackEvent).toHaveBeenCalledWith('project_created_from_generator', {
            sourceProjectId: 'source-project',
            nodeCount: 1,
        });
    });

    it('accepts duplicate names and gives each generated project a distinct ID', async () => {
        seedOriginal();
        renderEditor();
        const create = screen.getByRole('button', { name: 'Create from source-project' });

        fireEvent.click(create);
        fireEvent.click(create);

        await waitFor(() => expect(savedProjects()).toHaveLength(3));
        const created = savedProjects().slice(1);
        expect(created.map(project => project.name)).toEqual(['Separate Generated', 'Separate Generated']);
        expect(new Set(created.map(project => project.id))).toHaveProperty('size', 2);
    });

    it('returns false and preserves memory and storage when generated project persistence exceeds quota', () => {
        const originalBefore = seedOriginal();
        renderEditor();
        const projectsBefore = localStorage.getItem('hype_projects');
        const activeBefore = localStorage.getItem('hype_active_project');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const originalSetItem = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (key === 'hype_projects') throw new DOMException('Storage quota exceeded.', 'QuotaExceededError');
            return originalSetItem.call(this, key, value);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Create from source-project' }));

        expect(lastCreateResult.current).toBe(false);
        expect(screen.getAllByTestId(/^editor-/)).toHaveLength(1);
        expect(screen.getByTestId('editor-source-project')).toBeVisible();
        expect(localStorage.getItem('hype_projects')).toBe(projectsBefore);
        expect(localStorage.getItem('hype_active_project')).toBe(activeBefore);
        expect(savedProjects()).toEqual([originalBefore]);
        expect(trackEvent).not.toHaveBeenCalled();
    });
});
