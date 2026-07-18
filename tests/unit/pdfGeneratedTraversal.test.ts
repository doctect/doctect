import { describe, expect, it } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import type { AppState } from '../../types';

const layer = { id: 'main', name: 'Main', order: 0, visible: true, locked: false };
const grid = (traversalPath: Array<{ sliceStart?: number; sliceCount?: number }>) => ({
    id: 'grid', type: 'grid', x: 20, y: 20, w: 150, h: 40, rotation: 0,
    fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1,
    layerId: 'main', fontSize: 12, textColor: '#000000',
    gridConfig: {
        cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title', traversalPath,
    },
});

const link = (target: string) => ({
    id: 'link', type: 'rect', x: 20, y: 80, w: 100, h: 40, rotation: 0,
    fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1,
    layerId: 'main', linkTarget: 'specific_node', linkValue: target,
});

const state = (nodes: Record<string, any>, elements: any[]): AppState => ({
    schemaVersion: 10,
    nodes,
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: {
            id: 'default', name: 'Default', templates: {
                page: { id: 'page', name: 'Page', width: 500, height: 700, layers: [layer], elements },
            },
        },
    },
    viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
    selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
    scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null, clipboard: [],
} as unknown as AppState);

const exportText = async (project: AppState) => {
    const output = await generatePDF(project, { output: 'arraybuffer' }) as ArrayBuffer;
    return new TextDecoder('latin1').decode(new Uint8Array(output));
};

describe('PDF generated reference and traversal safety', () => {
    it('resolves a valid multi-hop reference while traversing a grid', async () => {
        const project = state({
            root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['ref_a', 'ref_b', 'container'] },
            ref_a: { id: 'ref_a', parentId: 'root', type: 'page', title: 'Ref A', data: {}, children: [], referenceId: 'ref_b' },
            ref_b: { id: 'ref_b', parentId: 'root', type: 'page', title: 'Ref B', data: {}, children: [], referenceId: 'container' },
            container: { id: 'container', parentId: 'root', type: 'page', title: 'Container', data: {}, children: ['item'] },
            item: { id: 'item', parentId: 'container', type: 'page', title: 'GRID_CHAIN_TARGET', data: {}, children: [] },
        }, [grid([{ sliceStart: 0, sliceCount: 1 }, { sliceStart: 0 }])]);

        await expect(exportText(project)).resolves.toContain('/Dest');
    });

    it('terminates cyclic reference resolution without emitting a link', async () => {
        const project = state({
            root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
            ref_a: { id: 'ref_a', parentId: 'root', type: 'page', title: 'Ref A', data: {}, children: [], referenceId: 'ref_b' },
            ref_b: { id: 'ref_b', parentId: 'root', type: 'page', title: 'Ref B', data: {}, children: [], referenceId: 'ref_a' },
        }, [link('ref_a')]);

        const pdf = await exportText(project);
        expect(pdf).not.toContain('/Dest');
    });

    it('bounds excessive grid traversal without recursive overflow', async () => {
        const project = state({
            root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['root'] },
        }, [grid(Array.from({ length: 20_000 }, () => ({ sliceStart: 0 })))]);

        await expect(generatePDF(project, { output: 'arraybuffer' })).resolves.toBeInstanceOf(ArrayBuffer);
    });
});
