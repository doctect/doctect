import { describe, it, expect, vi } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

const pdfDocHook = vi.hoisted(() => ({
    onCreate: null as ((doc: any) => void) | null,
}));

vi.mock('jspdf', async () => {
    const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
    const ActualJsPDF = actual.jsPDF;
    const WrappedJsPDF = function (this: unknown, ...args: any[]) {
        const doc = new ActualJsPDF(...args as ConstructorParameters<typeof ActualJsPDF>);
        pdfDocHook.onCreate?.(doc);
        return doc;
    } as unknown as typeof ActualJsPDF;
    Object.assign(WrappedJsPDF, ActualJsPDF);
    WrappedJsPDF.prototype = ActualJsPDF.prototype;
    return { ...actual, jsPDF: WrappedJsPDF };
});

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

    it('keeps clipped fixed-text opacity nested and balanced when decoration styling fails', async () => {
        let failDecoration = true;
        pdfDocHook.onCreate = doc => {
            const originalSetDrawColor = doc.setDrawColor;
            doc.setDrawColor = function (this: any, ...args: any[]) {
                if (failDecoration) {
                    failDecoration = false;
                    throw new Error('decoration color failed');
                }
                return originalSetDrawColor.apply(this, args);
            };
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        let pdf = '';
        let warningCalls: unknown[][] = [];

        try {
            pdf = await exportBytes(makeState([
                {
                    id: 'opacity-text', type: 'text', text: 'OPACITY_CLIPPED_TEXT',
                    x: 20, y: 20, w: 180, h: 40, rotation: 0,
                    fill: '', stroke: '', strokeWidth: 0, opacity: 0.5,
                    fontSize: 12, fontFamily: '__builtin_fallback__', textColor: '#000000',
                    textOverflow: 'clip', textWrap: false, textDecoration: 'underline',
                    layerId: 'main', zIndex: 0,
                },
                {
                    id: 'opacity-control', type: 'text', text: 'OPACITY_CONTROL',
                    x: 20, y: 100, w: 180, h: 40, rotation: 0,
                    fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                    fontSize: 12, fontFamily: '__builtin_fallback__', textColor: '#000000',
                    textOverflow: 'visible', textWrap: false,
                    layerId: 'main', zIndex: 1,
                },
            ]));
        } finally {
            warningCalls = [...warn.mock.calls];
            pdfDocHook.onCreate = null;
            warn.mockRestore();
        }

        const stream = pdf.match(/\bstream\r?\n([\s\S]*?)\r?\nendstream\b/)?.[1] || '';
        const opacityState = stream.search(/\/GS\d+ gs/);
        const clip = stream.indexOf('\nW\nn');
        const innerRestore = stream.indexOf('\nQ', clip);
        const outerRestore = stream.indexOf('\nQ', innerRestore + 2);
        const control = stream.indexOf('OPACITY_CONTROL');

        expect(opacityState).toBeGreaterThan(-1);
        expect(clip).toBeGreaterThan(opacityState);
        expect(stream).not.toContain('OPACITY_CLIPPED_TEXT');
        expect(innerRestore).toBeGreaterThan(clip);
        expect(outerRestore).toBeGreaterThan(innerRestore);
        expect(control).toBeGreaterThan(outerRestore);
        expect(stream.match(/^q$/gm) || []).toHaveLength((stream.match(/^Q$/gm) || []).length);
        expect(warningCalls).toHaveLength(1);
        expect(warningCalls[0][0]).toBe('[PDFTextLayout] Skipped text opacity-text');
    });
});
