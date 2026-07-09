import { describe, it, expect } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

// Real end-to-end export tests (same approach as pdfLayers.test.ts): run the
// actual generatePDF and assert on the output bytes. jsPDF serializes URL link
// annotations as `/URI (the-url)` and internal page links as `/Dest`, so both
// are directly observable in the decoded PDF.
const SVG_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>';

const baseEl = (id: string, zIndex: number) => ({
    id, x: 20, y: 20 + zIndex * 60, w: 100, h: 40, rotation: 0,
    fill: '#eeeeee', stroke: '#000000', strokeWidth: 1, opacity: 1,
    layerId: 'main', zIndex,
});

const makeState = (elements: any[], extraNodesChildren = false): AppState => ({
    schemaVersion: 8,
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: extraNodesChildren ? ['second'] : [] },
        ...(extraNodesChildren ? {
            second: { id: 'second', parentId: 'root', type: 'page2', title: 'Second', data: {}, children: [] },
        } : {}),
    },
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: {
            id: 'default', name: 'Default',
            templates: {
                page: {
                    id: 'page', name: 'Page', width: 500, height: 700,
                    layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
                    elements,
                },
                ...(extraNodesChildren ? {
                    page2: {
                        id: 'page2', name: 'Page 2', width: 500, height: 700,
                        layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
                        elements: [],
                    },
                } : {}),
            },
        },
    },
    viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
    selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
    scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [],
} as unknown as AppState);

const exportBytes = async (state: AppState) => {
    const buf = (await generatePDF(state, { output: 'arraybuffer' })) as ArrayBuffer;
    return new TextDecoder('latin1').decode(new Uint8Array(buf));
};

describe('PDF export link annotations', () => {
    it('writes URL link annotations for rect elements (control)', async () => {
        const pdf = await exportBytes(makeState([
            { ...baseEl('r1', 0), type: 'rect', linkTarget: 'url', linkValue: 'https://example.com/RECTLINK' },
        ]));
        expect(pdf).toContain('https://example.com/RECTLINK');
    });

    it('writes URL link annotations for svg elements', async () => {
        const pdf = await exportBytes(makeState([
            { ...baseEl('s1', 0), type: 'svg', svgContent: SVG_CONTENT, linkTarget: 'url', linkValue: 'https://example.com/SVGLINK' },
        ]));
        expect(pdf).toContain('https://example.com/SVGLINK');
    });

    it('writes URL link annotations for line elements', async () => {
        const pdf = await exportBytes(makeState([
            { ...baseEl('l1', 0), type: 'line', linkTarget: 'url', linkValue: 'https://example.com/LINELINK' },
        ]));
        expect(pdf).toContain('https://example.com/LINELINK');
    });

    it('writes internal page link annotations for svg elements', async () => {
        const pdf = await exportBytes(makeState([
            { ...baseEl('s2', 0), type: 'svg', svgContent: SVG_CONTENT, linkTarget: 'specific_node', linkValue: 'second' },
        ], true));
        // jsPDF serializes internal links as a /Dest entry in the annotation dict
        expect(pdf).toContain('/Dest');
    });
});
