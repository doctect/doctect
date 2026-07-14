import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../types';

const snapshotDocumentSpy = vi.hoisted(() => vi.fn());

vi.mock('../../services/projectDocumentSnapshot', async importOriginal => {
    const actual = await importOriginal<typeof import('../../services/projectDocumentSnapshot')>();
    snapshotDocumentSpy.mockImplementation(actual.snapshotDocument);
    return { ...actual, snapshotDocument: snapshotDocumentSpy };
});

vi.mock('../../components/Sidebar', () => ({
    Sidebar: ({ state }: { state: AppState }) => <pre data-testid="editor-state">{JSON.stringify(state)}</pre>,
}));
vi.mock('../../components/Canvas', () => ({ Canvas: () => <div /> }));
vi.mock('../../components/PropertiesPanel', () => ({ PropertiesPanel: () => <div /> }));
vi.mock('../../components/LayersPanel', () => ({ LayersPanel: () => <div /> }));
vi.mock('../../components/CollapsibleSection', () => ({ CollapsibleSection: () => <div /> }));
vi.mock('../../components/JsonModal', () => ({ JsonModal: () => null }));
vi.mock('../../components/NodeSelectorModal', () => ({ NodeSelectorModal: () => null }));
vi.mock('../../components/DeleteConfirmModal', () => ({ DeleteConfirmModal: () => null }));
vi.mock('../../components/SavePresetModal', () => ({ SavePresetModal: () => null }));
vi.mock('../../components/NewVariantModal', () => ({ NewVariantModal: () => null }));
vi.mock('../../components/EditorToolbar', () => ({
    EditorToolbar: ({ onOpenScriptGen }: { onOpenScriptGen: () => void }) => (
        <button onClick={onOpenScriptGen}>Open generator</button>
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
                'generated-page': { id: 'generated-page', name: 'Generated Page', width: 595, height: 842, elements: [] },
            },
        },
    },
    activeVariantId: 'generated',
    schemaVersion: 9 as const,
};

const source = {
    templateScript: 'return generatedTemplates;',
    hierarchyScript: 'return generatedHierarchy;',
};

vi.mock('../../components/HierarchyGeneratorModal', () => ({
    HierarchyGeneratorModal: (props: any) => props.isOpen ? (
        <div>
            <button onClick={() => {
                if (props.onApplyGenerated(generatedProject, source)) props.onClose();
            }}>Apply test project</button>
            <button onClick={() => {
                if (props.onDetachSavedGenerator()) props.onClose();
            }}>Detach test source</button>
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
                page: { id: 'page', name: 'Page', width: 509, height: 679, elements: [] },
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
    schemaVersion: 9,
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
        initialState={initialState()}
        isActive
        onNameChange={vi.fn()}
        onStateChange={vi.fn()}
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
            schemaVersion: 9,
            generator: { formatVersion: 1, ...source, generatedAt: '2026-07-14T12:34:56.000Z' },
            selectedNodeId: 'generated',
            selectedNodeIds: ['generated'],
            selectedTemplateId: '',
            selectedTemplateIds: [],
            selectedElementIds: [],
        });

        fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
        expect(readState()).toMatchObject(initialState());

        fireEvent.click(screen.getByTitle('Redo (Ctrl+Y)'));
        expect(readState()).toMatchObject({
            nodes: generatedProject.nodes,
            rootId: 'generated',
            variants: generatedProject.variants,
            activeVariantId: 'generated',
            schemaVersion: 9,
            generator: { formatVersion: 1, ...source, generatedAt: '2026-07-14T12:34:56.000Z' },
        });
    });

    it('checkpoints Detach once and Undo/Redo restore only provenance with its timestamp', () => {
        renderEditor();
        fireEvent.click(screen.getByRole('button', { name: 'Open generator' }));
        snapshotDocumentSpy.mockClear();

        fireEvent.click(screen.getByRole('button', { name: 'Detach test source' }));

        expect(snapshotDocumentSpy).toHaveBeenCalledOnce();
        expect(readState().generator).toBeUndefined();
        expect(readState()).toMatchObject({
            nodes: initialState().nodes,
            rootId: 'root',
            variants: initialState().variants,
            activeVariantId: 'original',
        });

        fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
        expect(readState().generator).toEqual(initialState().generator);
        expect(readState().rootId).toBe('root');

        fireEvent.click(screen.getByTitle('Redo (Ctrl+Y)'));
        expect(readState().generator).toBeUndefined();
        expect(readState().rootId).toBe('root');
    });
});
