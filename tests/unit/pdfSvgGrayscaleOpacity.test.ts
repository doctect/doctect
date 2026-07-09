import { describe, it, expect } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

// End-to-end byte assertions for two SVG export behaviors:
// 1. Greyscale export must desaturate SVG fills/strokes like every other
//    element type (they used to pass through in full color).
// 2. Element-level opacity must COMPOSE with the SVG's internal opacities.
//    svg2pdf's per-shape graphics states REPLACE the outer /ca, so the element
//    opacity is baked into the tree instead: every shape ends up at
//    internal-alpha x element-alpha (clobber fix). Overlap regions still
//    accumulate per-shape alpha — accepted, documented residual.
const COLOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="0" y="0" width="40" height="40" fill="#ff0000" stroke="#0000ff" stroke-width="2"/>
</svg>`;

const OPACITY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="0" y="0" width="40" height="40" fill="#ff0000"/>
<rect x="50" y="0" width="40" height="40" fill="#00ff00" fill-opacity="0.5"/>
</svg>`;

const makeState = (elements: any[]): AppState => ({
    schemaVersion: 8,
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root', activeVariantId: 'default',
    variants: { default: { id: 'default', name: 'Default', templates: {
        page: { id: 'page', name: 'Page', width: 500, height: 700,
            layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
            elements,
        },
    }}},
    viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
    selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
    scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null, clipboard: [],
} as unknown as AppState);

const svgEl = (svgContent: string, opacity = 1) => ({
    id: 's1', type: 'svg', svgContent, x: 50, y: 50, w: 200, h: 200, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity, layerId: 'main', zIndex: 1,
});

const exportBytes = async (state: AppState, options: Record<string, unknown> = {}) => {
    const buf = (await generatePDF(state, { output: 'arraybuffer', ...options })) as ArrayBuffer;
    return new TextDecoder('latin1').decode(new Uint8Array(buf));
};

describe('greyscale export of SVG elements', () => {
    it('desaturates SVG fills and strokes', async () => {
        const pdf = await exportBytes(makeState([svgEl(COLOR_SVG)]), { isGreyscale: true });
        // jsPDF collapses equal-component colors to the single-channel gray
        // operators: #ff0000 -> y=76 -> "0.3 g" ; #0000ff -> y=29 -> "0.11 G"
        expect(pdf).toMatch(/\b0\.3 g\b/);
        expect(pdf).toMatch(/\b0\.11 G\b/);
        expect(pdf).not.toContain('1. 0. 0. rg');
        expect(pdf).not.toContain('0. 0. 1. RG');
    });

    it('keeps SVG colors intact without the greyscale option', async () => {
        const pdf = await exportBytes(makeState([svgEl(COLOR_SVG)]));
        expect(pdf).toContain('1. 0. 0. rg');
    });
});

describe('element opacity composition with SVG-internal opacity', () => {
    it('bakes element opacity so internal fill-opacity multiplies instead of clobbering', async () => {
        const pdf = await exportBytes(makeState([svgEl(OPACITY_SVG, 0.06)]));
        // plain shape: 1 x 0.06 ; fill-opacity 0.5 shape: 0.5 x 0.06 = 0.03
        expect(pdf).toMatch(/\/ca 0\.06/);
        expect(pdf).toMatch(/\/ca 0\.03/);
        // the old clobber bug produced a bare /ca 0.5 for the second shape
        expect(pdf).not.toMatch(/\/ca 0\.5\b/);
    });

    it('leaves fully-opaque svg elements without opacity graphics states', async () => {
        const pdf = await exportBytes(makeState([svgEl(OPACITY_SVG, 1)]));
        // internal fill-opacity 0.5 still applies on its own
        expect(pdf).toMatch(/\/ca 0\.5\b/);
        expect(pdf).not.toMatch(/\/ca 0\.06/);
    });
});
