import { describe, it, expect } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

// Regression: element-level opacity was applied as GState({ opacity }) which
// only sets /ca (fill alpha) in the PDF. Strokes kept /CA 1, so a low-opacity
// element (e.g. a 6% watermark SVG) rendered invisible fills under fully
// opaque strokes — "just a thick black outline". Both /ca and /CA must carry
// the element's opacity.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g stroke="#2b2118" stroke-width="2.4"><rect x="10" y="10" width="80" height="80" fill="#cfc8b6"/></g>
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

const exportBytes = async (state: AppState) => {
    const buf = (await generatePDF(state, { output: 'arraybuffer' })) as ArrayBuffer;
    return new TextDecoder('latin1').decode(new Uint8Array(buf));
};

describe('PDF element-level opacity', () => {
    it('applies element opacity to strokes (/CA) as well as fills (/ca) for svg elements', async () => {
        const pdf = await exportBytes(makeState([
            { id: 's1', type: 'svg', svgContent: SVG, x: 50, y: 50, w: 200, h: 200, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 0.06, layerId: 'main', zIndex: 1 },
        ]));
        // the element-opacity graphics state must set both fill and stroke alpha
        expect(pdf).toMatch(/\/ca 0\.06[\s\S]{0,40}\/CA 0\.06|\/CA 0\.06[\s\S]{0,40}\/ca 0\.06/);
    });

    it('applies element opacity to strokes for plain shapes too', async () => {
        const pdf = await exportBytes(makeState([
            { id: 'r1', type: 'rect', x: 50, y: 50, w: 100, h: 100, rotation: 0, fill: '#cfc8b6', stroke: '#2b2118', strokeWidth: 2, opacity: 0.5, layerId: 'main', zIndex: 1 },
        ]));
        expect(pdf).toMatch(/\/ca 0\.5[\s\S]{0,40}\/CA 0\.5|\/CA 0\.5[\s\S]{0,40}\/ca 0\.5/);
    });
});
