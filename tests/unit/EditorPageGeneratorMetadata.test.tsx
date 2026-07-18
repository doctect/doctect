import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from '../../pages/EditorPage';
import { stageImport } from '../../services/importProject';

vi.mock('../../components/ProjectEditor', () => ({
    ProjectEditor: ({ initialState }: any) => <pre data-testid="project-state">{JSON.stringify(initialState)}</pre>,
}));

vi.mock('../../components/TabBar', () => ({
    TabBar: ({ projects, activeProjectId, onClose }: any) => (
        <div>
            {projects.map((project: any) => <span key={project.id}>{project.name}</span>)}
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
    schemaVersion: 10,
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

const renderEditor = () => render(<MemoryRouter><EditorPage /></MemoryRouter>);

describe('EditorPage generator metadata loads', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('opens a local project with malformed metadata detached and one dismissible warning', async () => {
        localStorage.setItem('hype_projects', JSON.stringify([
            { id: 'local-1', name: 'Local Project', initialState: { ...stateWithOverflow(), generator: { ...generator, formatVersion: 2 } } },
        ]));
        renderEditor();

        expect(await screen.findByRole('alert')).toHaveTextContent('Saved generator was detached');
        const loaded = JSON.parse(screen.getByTestId('project-state').textContent || '{}');
        expect(loaded.generator).toBeUndefined();
        expect(projectElement(loaded, 'valid-text')).toMatchObject({ textOverflow: 'shrink', textWrap: false });
        expect(projectElement(loaded, 'malformed-text')).toMatchObject({ textOverflow: 'clip', textWrap: true });
        expect(projectElement(loaded, 'valid-grid')).toMatchObject({ textOverflow: 'visible', textWrap: true });
        expect(projectElement(loaded, 'malformed-grid')).toMatchObject({ textOverflow: 'clip', textWrap: false });
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss project load warnings' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([
        ['gallery open', undefined],
        ['gallery fork', { projectId: 'fork-1', lastSyncedCommitId: 'commit-1' }],
    ])('normalizes a malformed current-v10 staged %s before ProjectEditor receives it', async (_label, cloud) => {
        stageImport({ name: 'Current Gallery Project', state: stateWithOverflow() as any, ...(cloud ? { cloud } : {}) });

        renderEditor();

        await screen.findByText('Current Gallery Project');
        const imported = JSON.parse(screen.getAllByTestId('project-state').at(-1)?.textContent || '{}');
        expect(imported.schemaVersion).toBe(10);
        expect(projectElement(imported, 'valid-text')).toMatchObject({ textOverflow: 'shrink', textWrap: false });
        expect(projectElement(imported, 'malformed-text')).toMatchObject({ textOverflow: 'clip', textWrap: true });
        expect(projectElement(imported, 'valid-grid')).toMatchObject({ textOverflow: 'visible', textWrap: true });
        expect(projectElement(imported, 'malformed-grid')).toMatchObject({ textOverflow: 'clip', textWrap: false });
    });

    it('normalizes a staged gallery import exactly once and appends its warning banner', async () => {
        stageImport({
            name: 'Gallery Project',
            state: { ...state, schemaVersion: 8, generator: { ...generator, secret: true, formatVersion: 2 } },
        });
        renderEditor();

        expect(await screen.findByRole('alert')).toHaveTextContent('Saved generator was detached');
        await screen.findByText('Gallery Project');
        const imported = JSON.parse(screen.getAllByTestId('project-state').at(-1)?.textContent || '{}');
        expect(imported.schemaVersion).toBe(10);
        expect(imported.generator).toBeUndefined();
    });

    it('downloads the exact nested generator object', async () => {
        localStorage.setItem('hype_projects', JSON.stringify([
            { id: 'local-1', name: 'Generated Project', initialState: { ...state, generator } },
        ]));
        localStorage.setItem('hype_active_project', 'local-1');
        let href: string | null = null;
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
            href = this.getAttribute('href');
        });
        renderEditor();

        fireEvent.click(screen.getByRole('button', { name: 'Close active project' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Save JSON and close' }));
        await waitFor(() => expect(href).not.toBeNull());
        const downloaded = JSON.parse(decodeURIComponent(href!.split(',')[1]));
        expect(downloaded.generator).toEqual(generator);
    });
});
