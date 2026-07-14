import { describe, expect, it } from 'vitest';
import type { AppState } from '../../types';
import { restoreDocument, snapshotDocument } from '../../services/projectDocumentSnapshot';

const makeState = (): AppState => ({
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Before', data: {}, children: [] },
    },
    rootId: 'root',
    variants: {
        original: {
            id: 'original',
            name: 'Original',
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
    selectedElementIds: ['old-element'],
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

describe('project document snapshots', () => {
    it('deeply snapshots generated document fields and provenance', () => {
        const state = makeState();
        const snapshot = snapshotDocument(state);

        state.nodes.root.title = 'Mutated';
        state.variants.original.name = 'Mutated';
        state.generator!.templateScript = 'mutated';

        expect(snapshot.nodes.root.title).toBe('Before');
        expect(snapshot.variants.original.name).toBe('Original');
        expect(snapshot.generator?.templateScript).toBe('return originalTemplates;');
    });

    it('restores root, variants, schema, generator, and document selections while retaining UI-only state', () => {
        const before = makeState();
        const snapshot = snapshotDocument(before);
        const current: AppState = {
            ...makeState(),
            nodes: {
                generated: { id: 'generated', parentId: null, type: 'generated', title: 'Generated', data: {}, children: [] },
            },
            rootId: 'generated',
            variants: {
                generated: {
                    id: 'generated',
                    name: 'Generated',
                    templates: {
                        generated: { id: 'generated', name: 'Generated', width: 595, height: 842, elements: [] },
                    },
                },
            },
            activeVariantId: 'generated',
            schemaVersion: 10,
            generator: {
                formatVersion: 1,
                templateScript: 'new templates',
                hierarchyScript: 'new hierarchy',
                generatedAt: '2026-07-14T11:00:00.000Z',
            },
            selectedNodeId: 'generated',
            selectedNodeIds: ['generated'],
            selectedTemplateId: 'generated',
            selectedTemplateIds: ['generated'],
            selectedElementIds: ['new-element'],
            viewMode: 'templates',
            scale: 1.75,
            tool: 'hand',
            sidebarWidth: 410,
            propertiesPanelWidth: 460,
            showGrid: true,
        };

        const restored = restoreDocument(current, snapshot);

        expect(restored).toMatchObject({
            nodes: snapshot.nodes,
            rootId: 'root',
            variants: snapshot.variants,
            activeVariantId: 'original',
            schemaVersion: 9,
            generator: before.generator,
            selectedNodeId: 'root',
            selectedNodeIds: ['root'],
            selectedTemplateId: '',
            selectedTemplateIds: [],
            selectedElementIds: ['old-element'],
            viewMode: 'templates',
            scale: 1.75,
            tool: 'hand',
            sidebarWidth: 410,
            propertiesPanelWidth: 460,
            showGrid: true,
        });
        expect(restored.nodes).not.toBe(snapshot.nodes);
        expect(restored.generator).not.toBe(snapshot.generator);
    });
});
