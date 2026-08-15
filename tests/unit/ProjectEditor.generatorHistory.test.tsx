import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../types';

const snapshotDocumentSpy = vi.hoisted(() => vi.fn());

vi.mock('../../services/projectDocumentSnapshot', async importOriginal => {
    const actual = await importOriginal<typeof import('../../services/projectDocumentSnapshot')>();
    snapshotDocumentSpy.mockImplementation(actual.snapshotDocument);
    return { ...actual, snapshotDocument: snapshotDocumentSpy };
});

vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));

vi.mock('../../components/Sidebar', () => ({
    Sidebar: ({ state, onUpdateNode }: { state: AppState; onUpdateNode: (id: string, updates: Partial<AppState['nodes'][string]>) => void }) => (
        <div>
            <pre data-testid="editor-state">{JSON.stringify(state)}</pre>
            <button onClick={() => onUpdateNode(state.rootId, { title: 'Renamed Root' })}>Rename root</button>
        </div>
    ),
}));
vi.mock('../../components/Canvas', () => ({ Canvas: () => <div /> }));
vi.mock('../../components/PropertiesPanel', () => ({ PropertiesPanel: () => <div /> }));
vi.mock('../../components/LayersPanel', () => ({ LayersPanel: () => <div /> }));
vi.mock('../../components/CollapsibleSection', () => ({ CollapsibleSection: () => <div /> }));
vi.mock('../../components/JsonModal', () => ({ JsonModal: () => null }));
vi.mock('../../components/NodeSelectorModal', () => ({ NodeSelectorModal: () => null }));
vi.mock('../../components/DeleteConfirmModal', () => ({ DeleteConfirmModal: () => null }));
vi.mock('../../components/SavePresetModal', () => ({
    SavePresetModal: (props: any) => props.isOpen ? (
        <button onClick={() => { void props.onSave('Saved Preset', 'Reusable layout'); }}>
            Confirm preset save
        </button>
    ) : null,
}));
vi.mock('../../components/NewVariantModal', () => ({ NewVariantModal: () => null }));
vi.mock('../../components/EditorToolbar', () => ({
    EditorToolbar: ({ onOpenScriptGen, onSavePreset }: { onOpenScriptGen: () => void; onSavePreset: () => void }) => (
        <>
            <button onClick={onOpenScriptGen}>Open generator</button>
            <button onClick={onSavePreset}>Open preset save</button>
        </>
    ),
}));

const generatedProject = {
    nodes: {
        generated: { id: 'generated', parentId: null, type: 'generated-page', title: 'Generated', data: {}, children: [] },
    },
    rootId: 'generated',
    variants: {
        generated: {
            id: 'generated',
            name: 'Generated Variant',
            templates: {
                'generated-page': {
                    id: 'generated-page',
                    name: 'Generated Page',
                    width: 595,
                    height: 842,
                    layers: [
                        { id: 'generated-back', name: 'Back', order: 0, visible: true, locked: false },
                        { id: 'generated-front', name: 'Front', order: 1, visible: true, locked: false },
                    ],
                    elements: [],
                },
            },
        },
    },
    activeVariantId: 'generated',
    schemaVersion: 11 as const,
};

const source = {
    formatVersion: 1 as const,
    templateScript: 'return generatedTemplates;',
    hierarchyScript: 'return generatedHierarchy;',
};

vi.mock('../../components/HierarchyGeneratorModal', () => ({
    HierarchyGeneratorModal: (props: any) => props.isOpen ? (
        <div>
            <button onClick={() => {
                if (props.onApplyGenerated(generatedProject, source)) props.onClose();
            }}>Apply test project</button>
        </div>
    ) : null,
}));

import { ProjectEditor } from '../../components/ProjectEditor';

const initialState = (): AppState => ({
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Original', data: {}, children: [] },
    },
    rootId: 'root',
    variants: {
        original: {
            id: 'original',
            name: 'Original Variant',
            templates: {
                page: {
                    id: 'page',
                    name: 'Page',
                    width: 509,
                    height: 679,
                    layers: [{ id: 'original-layer', name: 'Original', order: 0, visible: true, locked: false }],
                    elements: [],
                },
            },
        },
    },
    activeVariantId: 'original',
    viewMode: 'hierarchy',
    selectedNodeId: 'root',
    selectedNodeIds: ['root'],
    selectedTemplateId: '',
    selectedTemplateIds: [],
    selectedElementIds: ['original-element'],
    activeLayerId: 'original-layer',
    scale: 1,
    tool: 'select',
    showJsonModal: false,
    sidebarWidth: 280,
    propertiesPanelWidth: 320,
    snapToGrid: true,
    showGrid: false,
    showNodeSelector: false,
    nodeSelectorMode: 'grid_source',
    editingElementId: null,
    clipboard: [],
    schemaVersion: 11,
    generator: {
        formatVersion: 1,
        templateScript: 'return originalTemplates;',
        hierarchyScript: 'return originalHierarchy;',
        generatedAt: '2026-07-14T10:00:00.000Z',
    },
});

const readState = (): AppState => JSON.parse(screen.getByTestId('editor-state').textContent || '{}');
const renderEditor = () => render(
    <ProjectEditor
        projectId="history-test"
        projectName="History Test"
        initialState={initialState()}
        isActive
        onNameChange={vi.fn()}
        onStateChange={vi.fn()}
        onCreateGeneratedProject={vi.fn(async () => true)}
        onSaveCustomPreset={vi.fn(async () => true)}
    />,
);

describe('ProjectEditor generator history integration', () => {
    beforeEach(() => {
        snapshotDocumentSpy.mockClear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T12:34:56.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('preserves requested project name on mount and syncs later root title edits', () => {
        const generatedState = initialState();
        generatedState.nodes.root.title = 'Generated Root';
        const NameHarness = () => {
            const [name, setName] = React.useState('Separate Generated');
            return (
                <>
                    <output data-testid="project-name">{name}</output>
                    <ProjectEditor
                        projectId="name-sync-test"
                        projectName={name}
                        initialState={generatedState}
                        isActive
                        onNameChange={setName}
                        onStateChange={vi.fn()}
                        onCreateGeneratedProject={vi.fn(async () => true)}
                        onSaveCustomPreset={vi.fn(async () => true)}
                    />
                </>
            );
        };
        render(<NameHarness />);

        expect(screen.getByTestId('project-name')).toHaveTextContent('Separate Generated');

        fireEvent.click(screen.getByRole('button', { name: 'Rename root' }));

        expect(screen.getByTestId('project-name')).toHaveTextContent('Renamed Root');
    });

    it('does not report initial state during StrictMode replay and reports edits immediately', () => {
        const onStateChange = vi.fn();
        render(
            <React.StrictMode>
                <ProjectEditor
                    projectId="strict-mode-test"
                    projectName="Strict Mode Test"
                    initialState={initialState()}
                    isActive
                    onNameChange={vi.fn()}
                    onStateChange={onStateChange}
                    onCreateGeneratedProject={vi.fn(async () => true)}
                    onSaveCustomPreset={vi.fn(async () => true)}
                />
            </React.StrictMode>,
        );

        act(() => vi.advanceTimersByTime(1000));
        expect(onStateChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Rename root' }));
        expect(onStateChange).toHaveBeenCalledOnce();
        expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
            nodes: expect.objectContaining({
                root: expect.objectContaining({ title: 'Renamed Root' }),
            }),
        }));
    });

    it('checkpoints Apply once and Undo/Redo restore all generated fields and provenance timestamp', () => {
        renderEditor();
        fireEvent.click(screen.getByRole('button', { name: 'Open generator' }));
        snapshotDocumentSpy.mockClear();

        fireEvent.click(screen.getByRole('button', { name: 'Apply test project' }));

        expect(snapshotDocumentSpy).toHaveBeenCalledOnce();
        expect(readState()).toMatchObject({
            nodes: generatedProject.nodes,
            rootId: 'generated',
            variants: generatedProject.variants,
            activeVariantId: 'generated',
            schemaVersion: 11,
            generator: { ...source, generatedAt: '2026-07-14T12:34:56.000Z' },
            selectedNodeId: 'generated',
            selectedNodeIds: ['generated'],
            selectedTemplateId: '',
            selectedTemplateIds: [],
            selectedElementIds: [],
            activeLayerId: 'generated-front',
        });

        fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
        expect(readState()).toMatchObject(initialState());

        fireEvent.click(screen.getByTitle('Redo (Ctrl+Y)'));
        expect(readState()).toMatchObject({
            nodes: generatedProject.nodes,
            rootId: 'generated',
            variants: generatedProject.variants,
            activeVariantId: 'generated',
            schemaVersion: 11,
            generator: { ...source, generatedAt: '2026-07-14T12:34:56.000Z' },
            activeLayerId: 'generated-front',
        });
    });

    it('passes an independent cleaned state to transactional preset saving', async () => {
        const source = initialState();
        source.clipboard = [{ id: 'copied', type: 'rect', x: 1, y: 1, w: 10, h: 10 } as any];
        let savedState: AppState | undefined;
        const onSaveCustomPreset = vi.fn(async (
            _title: string,
            _description: string,
            state: AppState,
        ) => {
            savedState = state;
            return false;
        });
        render(
            <ProjectEditor
                projectId="preset-test"
                projectName="Preset Test"
                initialState={source}
                isActive
                onNameChange={vi.fn()}
                onStateChange={vi.fn()}
                onCreateGeneratedProject={vi.fn(async () => true)}
                onSaveCustomPreset={onSaveCustomPreset}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open preset save' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm preset save' }));

        expect(onSaveCustomPreset).toHaveBeenCalledOnce();
        expect(onSaveCustomPreset).toHaveBeenCalledWith(
            'Saved Preset',
            'Reusable layout',
            expect.objectContaining({
                selectedElementIds: [],
                selectedNodeId: 'root',
                clipboard: [],
            }),
        );
        expect(savedState).not.toBe(source);
        expect(savedState?.nodes).not.toBe(source.nodes);
        expect(savedState?.variants).not.toBe(source.variants);
        savedState!.nodes.root.title = 'Mutated saved state';
        expect(readState().nodes.root.title).toBe('Original');
    });
});
