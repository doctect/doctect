import { describe, it, expect } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

// End-to-end: svg2pdf's own color parser only understands named colors,
// 3/6-digit hex, rgb() and rgba(). Fills in hsl()/hsla()/#rgba/#rrggbbaa used
// to be silently dropped (shape drawn stroke-only, or discarded entirely) and
// 8-digit-hex alpha was lost. pdfService now normalizes those colors before
// handing the tree to svg2pdf, so the output stream must contain real fill
// operators (rg) and alpha graphics states (gs).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="30" height="30" fill="hsla(200, 50%, 50%, 0.5)" stroke="#000000" stroke-width="1"/>
  <rect x="35" y="0" width="30" height="30" fill="#ff000080"/>
  <rect x="70" y="0" width="30" height="30" fill="#f008"/>
</svg>`;

const state = {
    schemaVersion: 8,
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root', activeVariantId: 'default',
    variants: { default: { id: 'default', name: 'Default', templates: {
        page: { id: 'page', name: 'Page', width: 500, height: 700,
            layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
            elements: [{ id: 's1', type: 'svg', svgContent: SVG, x: 50, y: 50, w: 200, h: 200, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, layerId: 'main', zIndex: 1 }],
        },
    }}},
    viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
    selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
    scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null, clipboard: [],
} as unknown as AppState;

describe('PDF export of SVGs with CSS color formats svg2pdf cannot parse', () => {
    it('renders hsla/#rgba/#rrggbbaa fills as real fills with alpha, not stroke-only ghosts', async () => {
        const buf = (await generatePDF(state, { output: 'arraybuffer' })) as ArrayBuffer;
        const pdf = new TextDecoder('latin1').decode(new Uint8Array(buf));

        // both red rects (#ff000080, #f008) must set a red fill color
        expect(pdf).toContain('1. 0. 0. rg');
        // the hsla rect must set its converted rgb fill (64,149,191; jsPDF rounds to 2dp)
        expect(pdf).toMatch(/0\.25 0\.58 0\.75 rg/);
        // alpha must survive as graphics states (one per distinct opacity)
        expect(pdf).toMatch(/\/GS\d+ gs/);
        // and no path may end as a discarded no-op: every rect subpath is filled
        // (the old behavior emitted "h\nS" for the hsla rect and "h\nn" for #f008)
        expect(pdf.match(/h\nf/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(pdf).toContain('h\nB'); // hsla rect: fill + its black stroke
    });
});
