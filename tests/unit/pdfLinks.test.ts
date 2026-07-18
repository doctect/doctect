import { describe, it, expect, vi } from 'vitest';
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

const makeState = (elements: any[], extraNodesChildren = false, rootData: Record<string, string> = {}): AppState => ({
    schemaVersion: 8,
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: rootData, children: extraNodesChildren ? ['second'] : [] },
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

const firstPageTextOperatorCount = (pdf: string) =>
    (pdf.slice(0, pdf.indexOf('endstream')).match(/\sTj\s/g) || []).length;

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

    it('omits internal link annotations for text with an empty resolved binding', async () => {
        const pdf = await exportBytes(makeState([
            { ...baseEl('t1', 0), type: 'text', dataBinding: 'skipLabel', linkTarget: 'specific_node', linkValue: 'second' },
        ], true));
        expect(pdf).not.toContain('/Dest');
    });

    it('writes internal link annotations for text with a non-empty resolved binding', async () => {
        const pdf = await exportBytes(makeState([
            { ...baseEl('t1', 0), type: 'text', dataBinding: 'skipLabel', linkTarget: 'specific_node', linkValue: 'second' },
        ], true, { skipLabel: 'Skip' }));
        expect(pdf).toContain('/Dest');
    });

    it.each([
        ['numeric zero', 0],
        ['string zero', '0'],
        ['negative', -1],
        ['NaN', Number.NaN],
        ['positive infinity', Number.POSITIVE_INFINITY],
        ['negative infinity', Number.NEGATIVE_INFINITY],
    ])('omits text glyphs and links for explicit %s font size', async (_, fontSize) => {
        const pdf = await exportBytes(makeState([
            {
                ...baseEl('hidden-text', 0), type: 'text', text: 'ZERO_FONT_GLYPH', fontSize,
                linkTarget: 'specific_node', linkValue: 'second',
            },
        ], true));

        expect(firstPageTextOperatorCount(pdf)).toBe(0);
        expect(pdf).not.toContain('/Dest');
    });

    it('defaults missing font size to visible linked 12pt text', async () => {
        const pdf = await exportBytes(makeState([
            {
                ...baseEl('default-text', 0), type: 'text', text: 'DEFAULT_FONT_GLYPH',
                linkTarget: 'specific_node', linkValue: 'second',
            },
        ], true));

        expect(firstPageTextOperatorCount(pdf)).toBeGreaterThan(0);
        expect(pdf).toContain('/Dest');
    });

    it('keeps whole-element URL and internal links when ellipsis draws zero glyphs', async () => {
        const fontWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const pdf = await exportBytes(makeState([
            {
                ...baseEl('zero-glyph-url', 0), type: 'text', text: 'URL_LINK_SOURCE',
                w: 0.1, fontSize: 12, fontFamily: '__builtin_fallback__',
                textOverflow: 'ellipsis', textWrap: false,
                linkTarget: 'url', linkValue: 'https://example.com/ZEROGLYPH',
            },
            {
                ...baseEl('zero-glyph-internal', 1), type: 'text', text: 'INTERNAL_LINK_SOURCE',
                w: 0.1, fontSize: 12, fontFamily: '__builtin_fallback__',
                textOverflow: 'ellipsis', textWrap: false,
                linkTarget: 'specific_node', linkValue: 'second',
            },
        ], true));
        fontWarning.mockRestore();

        expect(firstPageTextOperatorCount(pdf)).toBe(0);
        expect(pdf).toContain('https://example.com/ZEROGLYPH');
        expect(pdf).toContain('/Dest');
    });

    it('keeps an unrotated grid link on the full cell instead of its inset text box', async () => {
        const pdf = await exportBytes(makeState([{
            ...baseEl('linked-grid', 0),
            type: 'grid',
            fontFamily: '__builtin_fallback__',
            fontSize: 18,
            textColor: '#000000',
            textOverflow: 'shrink',
            textWrap: false,
            gridConfig: {
                cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title',
                gridBorderMode: 'none', gridBorderWidth: 0, gridBorderColor: '', gridBorderStyle: 'none',
            },
        }], true));
        const linkedRects = [...pdf.matchAll(/\/Rect \[([^\]]+)\][\s\S]*?\/Dest/g)]
            .map(match => match[1].trim().split(/\s+/).map(Number));

        expect(pdf).toContain('/Dest');
        expect(linkedRects).toContainEqual([20, 680, 120, 640]);
    });

    it('retains existing zero-angle eligibility for grid cell links', async () => {
        const pdf = await exportBytes(makeState([{
            ...baseEl('rotated-grid', 0),
            type: 'grid',
            rotation: 10,
            fontFamily: '__builtin_fallback__',
            fontSize: 12,
            textColor: '#000000',
            textOverflow: 'clip',
            textWrap: false,
            gridConfig: {
                cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title',
                gridBorderMode: 'none', gridBorderWidth: 0, gridBorderColor: '', gridBorderStyle: 'none',
            },
        }], true));

        expect(pdf).not.toContain('/Dest');
    });

    it('omits text glyphs and links for whitespace-only resolved text', async () => {
        const pdf = await exportBytes(makeState([
            {
                ...baseEl('blank-text', 0), type: 'text', dataBinding: 'skipLabel',
                linkTarget: 'specific_node', linkValue: 'second',
            },
        ], true, { skipLabel: '  \n\t  ' }));

        expect(pdf).not.toContain('/Dest');
        expect(firstPageTextOperatorCount(pdf)).toBe(0);
    });

    it('preserves surrounding whitespace in visible resolved text', async () => {
        const fontWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const pdf = await exportBytes(makeState([
            {
                ...baseEl('spaced-text', 0), type: 'text', dataBinding: 'label',
                fontFamily: '__builtin_fallback__',
            },
        ], false, { label: '  PADDED_TEXT  ' }));
        fontWarning.mockRestore();

        expect(pdf).toContain('(  PADDED_TEXT  ) Tj');
    });
});
