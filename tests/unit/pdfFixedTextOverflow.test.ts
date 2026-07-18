import { jsPDF } from 'jspdf';
import { describe, expect, it, vi } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import type { AppState, TemplateElement, TextOverflow } from '../../types';

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

const PAGE_HEIGHT = 800;

const baseElement = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id,
    type: 'text',
    x: 20,
    y: 20,
    w: 100,
    h: 40,
    rotation: 0,
    fill: '',
    stroke: '',
    strokeWidth: 0,
    opacity: 1,
    text: id,
    fontSize: 12,
    fontFamily: '__builtin_fallback__',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#000000',
    align: 'left',
    verticalAlign: 'top',
    layerId: 'main',
    zIndex: 0,
    ...overrides,
} as TemplateElement);

const makeState = (elements: TemplateElement[], withSecondPage = false): AppState => ({
    schemaVersion: 10,
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: withSecondPage ? ['second'] : [] },
        ...(withSecondPage ? {
            second: { id: 'second', parentId: 'root', type: 'page2', title: 'Second', data: {}, children: [] },
        } : {}),
    },
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: {
            id: 'default',
            name: 'Default',
            templates: {
                page: {
                    id: 'page',
                    name: 'Page',
                    width: 500,
                    height: PAGE_HEIGHT,
                    layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
                    elements,
                },
                ...(withSecondPage ? {
                    page2: {
                        id: 'page2',
                        name: 'Page 2',
                        width: 500,
                        height: PAGE_HEIGHT,
                        layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
                        elements: [],
                    },
                } : {}),
            },
        },
    },
    viewMode: 'hierarchy',
    selectedNodeId: 'root',
    selectedNodeIds: ['root'],
    selectedTemplateId: 'page',
    selectedTemplateIds: ['page'],
    selectedElementIds: [],
    scale: 1,
    tool: 'select',
    showJsonModal: false,
    sidebarWidth: 288,
    propertiesPanelWidth: 320,
    snapToGrid: false,
    showGrid: false,
    showNodeSelector: false,
    nodeSelectorMode: 'grid_source',
    editingElementId: null,
    clipboard: [],
} as unknown as AppState);

const exportPdf = async (elements: TemplateElement[]): Promise<string> => {
    const buffer = await generatePDF(makeState(elements), { output: 'arraybuffer' }) as ArrayBuffer;
    return new TextDecoder('latin1').decode(new Uint8Array(buffer));
};

const firstStream = (pdf: string): string => {
    const match = pdf.match(/\bstream\r?\n([\s\S]*?)\r?\nendstream\b/);
    if (!match) throw new Error('PDF content stream missing');
    return match[1];
};

const textY = (stream: string, marker: string): number => {
    const markerIndex = stream.indexOf(`(${marker}) Tj`);
    if (markerIndex < 0) throw new Error(`Text operator missing for ${marker}`);
    const positions = stream.slice(0, markerIndex).match(/[-\d.]+ ([-\d.]+) Td/g) || [];
    const match = positions.at(-1)?.match(/ ([-\d.]+) Td/);
    if (!match) throw new Error(`Text position missing for ${marker}`);
    return Number(match[1]);
};

describe('fixed PDF text overflow rendering', () => {
    it('routes all mode and wrap combinations through shared lines only', async () => {
        const modes: TextOverflow[] = ['clip', 'ellipsis', 'shrink', 'visible'];
        const fixed = modes.flatMap((mode, modeIndex) => [false, true].map((wrap, wrapIndex) => {
            const marker = `FIXED_${mode.toUpperCase()}_${wrap ? 'WRAP' : 'NOWRAP'}`;
            return baseElement(marker, {
                y: 20 + (modeIndex * 2 + wrapIndex) * 50,
                w: 400,
                text: marker,
                textOverflow: mode,
                textWrap: wrap,
            });
        }));
        const auto = baseElement('AUTO_NATIVE', {
            y: 440,
            text: 'AUTO_NATIVE',
            autoWidth: true,
            textOverflow: 'shrink',
            textWrap: true,
        });
        const rect = baseElement('RECT_NATIVE', {
            type: 'rect',
            y: 500,
            text: 'RECT_NATIVE',
            fill: '#eeeeee',
        });
        const triangle = baseElement('TRIANGLE_NATIVE', {
            type: 'triangle',
            y: 560,
            text: 'TRIANGLE_NATIVE',
            fill: '#eeeeee',
        });
        const splitSpy = vi.spyOn((jsPDF as any).API, 'splitTextToSize');

        try {
            const pdf = await exportPdf([...fixed, auto, rect, triangle]);
            const splitInputs = splitSpy.mock.calls.map(call => String(call[0]));

            fixed.forEach(element => {
                expect(pdf).toContain(element.text);
                expect(splitInputs).not.toContain(element.text);
            });
            expect(splitInputs).toContain('AUTO_NATIVE');
            expect(splitInputs).toContain('RECT_NATIVE');
            expect(splitInputs).toContain('TRIANGLE_NATIVE');
        } finally {
            splitSpy.mockRestore();
        }
    });

    it('preserves hard newlines and ellipsizes hidden content with wrap off and on', async () => {
        const pdf = await exportPdf([
            baseElement('hard-newline', {
                text: 'FIRST\nSECOND',
                w: 100,
                h: 20,
                textOverflow: 'ellipsis',
                textWrap: false,
            }),
            baseElement('wrapped-ellipsis', {
                y: 70,
                text: 'ALPHA BETA GAMMA',
                w: 45,
                h: 14.4,
                textOverflow: 'ellipsis',
                textWrap: true,
            }),
        ]);
        const stream = firstStream(pdf);

        expect(stream).toContain('(FIRST…) Tj');
        expect(stream).not.toContain('(SECOND) Tj');
        expect(stream.match(/…/g)).toHaveLength(2);
        expect(stream).not.toContain('GAMMA');
    });

    it('uses a smaller effective Tf for shrink without changing source font size', async () => {
        const element = baseElement('shrink', {
            text: 'SHRINKME',
            fontSize: 20,
            w: 50,
            h: 30,
            textOverflow: 'shrink',
            textWrap: false,
        });
        const stream = firstStream(await exportPdf([element]));
        const markerIndex = stream.indexOf('(SHRINKME) Tj');
        const fontOperators = stream.slice(0, markerIndex).match(/\/F\d+ ([\d.]+) Tf/g) || [];
        const effectiveSize = Number(fontOperators.at(-1)?.match(/ ([\d.]+) Tf/)?.[1]);

        expect(markerIndex).toBeGreaterThan(-1);
        expect(effectiveSize).toBeGreaterThan(0);
        expect(effectiveSize).toBeLessThan(20);
        expect(element.fontSize).toBe(20);
    });

    it('selects exact production family, style, weight, and fallback before measurement and draw', async () => {
        const measuredFonts: Array<Record<string, unknown>> = [];
        const drawnFonts: Array<Record<string, unknown>> = [];
        const snapshot = (doc: any, text: string) => {
            const font = doc.getFont();
            return {
                text,
                family: font.fontName,
                style: font.fontStyle,
                rendererIdentity: `${font.id}:${font.postScriptName}:${font.encoding || ''}`,
                isStandardFont: font.isStandardFont,
            };
        };
        pdfDocHook.onCreate = doc => {
            const originalMeasure = doc.getTextWidth;
            const originalDraw = doc.text;
            doc.getTextWidth = function (this: any, text: string) {
                measuredFonts.push(snapshot(this, text));
                return originalMeasure.call(this, text);
            };
            doc.text = function (this: any, ...args: any[]) {
                drawnFonts.push(snapshot(this, String(args[0])));
                return originalDraw.apply(this, args);
            };
        };

        try {
            await exportPdf([
                baseElement('bold-font', {
                    text: 'EXACT_BOLD_FONT',
                    w: 200,
                    fontFamily: 'courier',
                    fontWeight: 'bold',
                    textOverflow: 'visible',
                    textWrap: false,
                }),
                baseElement('italic-font', {
                    y: 80,
                    text: 'EXACT_ITALIC_FONT',
                    w: 200,
                    fontFamily: 'courier',
                    fontStyle: 'italic',
                    textOverflow: 'visible',
                    textWrap: false,
                }),
                baseElement('fallback-font', {
                    y: 140,
                    text: 'EXACT_FALLBACK_FONT',
                    w: 200,
                    fontFamily: '__missing_font__',
                    fontWeight: 'bold',
                    fontStyle: 'italic',
                    textOverflow: 'visible',
                    textWrap: false,
                }),
            ]);
        } finally {
            pdfDocHook.onCreate = null;
        }

        const measuredBold = measuredFonts.find(entry => entry.text === 'EXACT_BOLD_FONT');
        const drawnBold = drawnFonts.find(entry => entry.text === 'EXACT_BOLD_FONT');
        const measuredItalic = measuredFonts.find(entry => entry.text === 'EXACT_ITALIC_FONT');
        const drawnItalic = drawnFonts.find(entry => entry.text === 'EXACT_ITALIC_FONT');
        const measuredFallback = measuredFonts.find(entry => entry.text === 'EXACT_FALLBACK_FONT');
        const drawnFallback = drawnFonts.find(entry => entry.text === 'EXACT_FALLBACK_FONT');

        expect(measuredBold).toMatchObject({ family: 'courier', style: 'bold' });
        expect(drawnBold).toMatchObject({
            family: 'courier',
            style: 'bold',
            rendererIdentity: measuredBold?.rendererIdentity,
        });
        expect(measuredItalic).toMatchObject({ family: 'courier', style: 'italic' });
        expect(drawnItalic).toMatchObject({
            family: 'courier',
            style: 'italic',
            rendererIdentity: measuredItalic?.rendererIdentity,
        });
        expect(measuredFallback).toMatchObject({ family: 'helvetica', style: 'normal', isStandardFont: true });
        expect(drawnFallback).toMatchObject({
            family: 'helvetica',
            style: 'normal',
            rendererIdentity: measuredFallback?.rendererIdentity,
            isStandardFont: true,
        });
    });

    it('guards initial fixed-font failure and restores the outer transform before continuing', async () => {
        let failNextSelection = true;
        pdfDocHook.onCreate = doc => {
            const originalSetFontSize = doc.setFontSize;
            doc.setFontSize = function (this: any, size: number) {
                if (failNextSelection) {
                    failNextSelection = false;
                    throw new Error('font selection failed');
                }
                return originalSetFontSize.call(this, size);
            };
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        let pdf = '';
        let warningCalls: unknown[][] = [];

        try {
            pdf = await exportPdf([
                baseElement('font-failure', {
                    text: 'FONT_FAILURE',
                    rotation: 17,
                    opacity: 0.5,
                    textOverflow: 'clip',
                    textWrap: false,
                }),
                baseElement('font-control', {
                    y: 100,
                    text: 'FONT_FAILURE_CONTROL',
                    textOverflow: 'visible',
                    textWrap: false,
                    zIndex: 1,
                }),
            ]);
        } finally {
            warningCalls = [...warn.mock.calls];
            pdfDocHook.onCreate = null;
            warn.mockRestore();
        }

        const stream = firstStream(pdf);
        expect(stream).not.toContain('(FONT_FAILURE) Tj');
        expect(stream).toContain('(FONT_FAILURE_CONTROL) Tj');
        expect(stream.match(/^q$/gm) || []).toHaveLength((stream.match(/^Q$/gm) || []).length);
        expect(warningCalls).toHaveLength(1);
        expect(warningCalls[0][0]).toBe('[PDFTextLayout] Skipped text font-failure');
    });

    it('positions explicit lines at top, middle, and bottom line-box anchors', async () => {
        const stream = firstStream(await exportPdf([
            baseElement('top', { text: 'TOP_ANCHOR', y: 100, h: 60, verticalAlign: 'top', textOverflow: 'visible', textWrap: false }),
            baseElement('middle', { text: 'MIDDLE_ANCHOR', y: 200, h: 60, verticalAlign: 'middle', textOverflow: 'visible', textWrap: false }),
            baseElement('bottom', { text: 'BOTTOM_ANCHOR', y: 300, h: 60, verticalAlign: 'bottom', textOverflow: 'visible', textWrap: false }),
        ]));

        const topBaseline = PAGE_HEIGHT - textY(stream, 'TOP_ANCHOR');
        const middleBaseline = PAGE_HEIGHT - textY(stream, 'MIDDLE_ANCHOR');
        const bottomBaseline = PAGE_HEIGHT - textY(stream, 'BOTTOM_ANCHOR');
        expect(topBaseline).toBeCloseTo(110.8, 5);
        expect(middleBaseline).toBeCloseTo(233.6, 5);
        expect(bottomBaseline).toBeCloseTo(356.4, 5);
    });

    it('draws fixed-text underline geometry after its explicit glyph line', async () => {
        const stream = firstStream(await exportPdf([
            baseElement('underline', {
                text: 'UNDERLINE_FIXED',
                w: 140,
                textOverflow: 'clip',
                textWrap: false,
                textDecoration: 'underline',
            }),
        ]));
        const glyphIndex = stream.indexOf('(UNDERLINE_FIXED) Tj');
        const styleIndex = stream.indexOf('0.6000000000000001 w');
        const underlineOperators = stream.slice(glyphIndex);

        expect(glyphIndex).toBeGreaterThan(-1);
        expect(styleIndex).toBeGreaterThan(-1);
        expect(styleIndex).toBeLessThan(glyphIndex);
        expect(underlineOperators).toMatch(/[-\d.]+ [-\d.]+ m\n[-\d.]+ [-\d.]+ l\nS/);
    });

    it('nests local clipping inside rotation and restores before the following element', async () => {
        const stream = firstStream(await exportPdf([
            baseElement('rotated', {
                text: 'ROTATED_CLIP',
                rotation: 17,
                textOverflow: 'clip',
                textWrap: false,
            }),
            baseElement('control', {
                y: 100,
                text: 'FOLLOWING_CONTROL',
                textOverflow: 'visible',
                textWrap: false,
                zIndex: 1,
            }),
        ]));
        const matrixIndex = stream.indexOf(' cm');
        const clipIndex = stream.indexOf('\nW\nn');
        const rotatedIndex = stream.indexOf('ROTATED_CLIP');
        const innerRestore = stream.indexOf('\nQ', rotatedIndex);
        const outerRestore = stream.indexOf('\nQ', innerRestore + 2);
        const controlIndex = stream.indexOf('FOLLOWING_CONTROL');
        const saves = stream.match(/^q$/gm) || [];
        const restores = stream.match(/^Q$/gm) || [];

        expect(matrixIndex).toBeGreaterThan(-1);
        expect(stream).toMatch(/re\nW\nn/);
        expect(clipIndex).toBeGreaterThan(matrixIndex);
        expect(rotatedIndex).toBeGreaterThan(clipIndex);
        expect(outerRestore).toBeGreaterThan(innerRestore);
        expect(controlIndex).toBeGreaterThan(outerRestore);
        expect(saves).toHaveLength(restores.length);
    });

    it('does not create a local clip for visible fixed text', async () => {
        const stream = firstStream(await exportPdf([
            baseElement('visible', {
                text: 'VISIBLE_UNCLIPPED',
                textOverflow: 'visible',
                textWrap: false,
            }),
        ]));

        expect(stream).toContain('VISIBLE_UNCLIPPED');
        expect(stream).not.toContain('\nW\nn');
    });

    it('skips zero-sized fixed boxes and renders a following control', async () => {
        const stream = firstStream(await exportPdf([
            baseElement('zero-width', { text: 'ZERO_WIDTH', w: 0, textOverflow: 'clip' }),
            baseElement('zero-height', { text: 'ZERO_HEIGHT', y: 80, h: 0, textOverflow: 'ellipsis' }),
            baseElement('control', { text: 'ZERO_CONTROL', y: 140, textOverflow: 'visible' }),
        ]));

        expect(stream).not.toContain('ZERO_WIDTH');
        expect(stream).not.toContain('ZERO_HEIGHT');
        expect(stream).toContain('ZERO_CONTROL');
    });
});
