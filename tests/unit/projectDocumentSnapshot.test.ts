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
                page: {
                    id: 'page',
                    name: 'Page',
                    width: 509,
                    height: 679,
                    elements: [{
                        id: 'fixed-text', type: 'text', x: 10, y: 10, w: 80, h: 20,
                        rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                        autoWidth: false, textOverflow: 'shrink', textWrap: false,
                        textPadding: { top: 1, right: 2, bottom: 3, left: 4 },
                    }],
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
    schemaVersion: 11,
    generator: {
        formatVersion: 1,
        templateScript: 'return originalTemplates;',
        hierarchyScript: 'return originalHierarchy;',
        generatedAt: '2026-07-14T10:00:00.000Z',
    },
});

describe('project document snapshots', () => {
    it('omits absent optional generator metadata', () => {
        const state = makeState();
        delete state.generator;

        const snapshot = snapshotDocument(state);
        const restored = restoreDocument(state, snapshot);

        expect(snapshot).not.toHaveProperty('generator');
        expect(restored).not.toHaveProperty('generator');
    });

    it('deeply snapshots generated document fields and provenance', () => {
        const state = makeState();
        const snapshot = snapshotDocument(state);

        state.nodes.root.title = 'Mutated';
        state.variants.original.name = 'Mutated';
        state.variants.original.templates.page.elements[0].autoWidth = true;
        state.variants.original.templates.page.elements[0].textOverflow = 'visible';
        state.variants.original.templates.page.elements[0].textPadding!.left = 99;
        state.generator!.templateScript = 'mutated';

        expect(snapshot.nodes.root.title).toBe('Before');
        expect(snapshot.variants.original.name).toBe('Original');
        expect(snapshot.variants.original.templates.page.elements[0]).toMatchObject({
            autoWidth: false, textOverflow: 'shrink', textWrap: false,
            textPadding: { top: 1, right: 2, bottom: 3, left: 4 },
        });
        expect(snapshot).not.toHaveProperty('elementPropertySections');
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
            schemaVersion: 12,
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
            schemaVersion: 11,
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
