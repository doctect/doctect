import { jsPDF } from 'jspdf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import type { PdfTextLayoutSession } from '../../services/pdfTextLayout';
import type { TextLayoutResult } from '../../services/textLayout';
import type { AppState, TemplateElement, TextOverflow } from '../../types';

const hooks = vi.hoisted(() => ({
    createSession: null as ((doc: any) => any) | null,
    onPdfCreate: null as ((doc: any) => void) | null,
}));

vi.mock('../../services/pdfTextLayout', async () => {
    const actual = await vi.importActual<typeof import('../../services/pdfTextLayout')>('../../services/pdfTextLayout');
    return {
        ...actual,
        createPdfTextLayoutSession: (...args: Parameters<typeof actual.createPdfTextLayoutSession>) => (
            hooks.createSession?.(args[0]) ?? actual.createPdfTextLayoutSession(...args)
        ),
    };
});

vi.mock('jspdf', async () => {
    const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
    const ActualJsPDF = actual.jsPDF;
    const WrappedJsPDF = function (this: unknown, ...args: any[]) {
        const doc = new ActualJsPDF(...args as ConstructorParameters<typeof ActualJsPDF>);
        hooks.onPdfCreate?.(doc);
        return doc;
    } as unknown as typeof ActualJsPDF;
    Object.assign(WrappedJsPDF, ActualJsPDF);
    WrappedJsPDF.prototype = ActualJsPDF.prototype;
    return { ...actual, jsPDF: WrappedJsPDF };
});

const PAGE_HEIGHT = 900;
type PdfLayoutArgs = Parameters<PdfTextLayoutSession['layout']>;

const gridElement = (overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id: 'grid',
    type: 'grid',
    x: 20,
    y: 20,
    w: 100,
    h: 40,
    rotation: 0,
    fill: '#eeeeee',
    stroke: '#123456',
    strokeWidth: 2,
    borderStyle: 'solid',
    borderRadius: 5,
    opacity: 1,
    fontSize: 16,
    fontFamily: 'courier',
    fontWeight: 'normal',
    fontStyle: 'italic',
    textColor: '#111111',
    align: 'left',
    verticalAlign: 'top',
    textOverflow: 'clip',
    textWrap: false,
    layerId: 'main',
    zIndex: 0,
    gridConfig: {
        cols: 2,
        gapX: 2,
        gapY: 0,
        sourceType: 'current',
        displayField: 'label',
        gridBorderMode: 'all',
        gridBorderWidth: 1,
        gridBorderColor: '#654321',
        gridBorderStyle: 'solid',
        gridBorderRadius: 4,
    },
    ...overrides,
} as TemplateElement);

const makeState = (
    elements: TemplateElement[],
    labels: string[] = ['SHORT', 'A MUCH LONGER LABEL'],
): AppState => {
    const childIds = labels.map((_, index) => `cell-${index}`);
    return {
        schemaVersion: 10,
        nodes: {
            root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: childIds },
            ...Object.fromEntries(labels.map((label, index) => [childIds[index], {
                id: childIds[index],
                parentId: 'root',
                type: 'cell',
                title: `Cell ${index}`,
                data: { label },
                children: [],
            }])),
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
                        width: 600,
                        height: PAGE_HEIGHT,
                        layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
                        elements,
                    },
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
    } as unknown as AppState;
};

const exportPdf = async (elements: TemplateElement[], labels?: string[]): Promise<string> => {
    const buffer = await generatePDF(makeState(elements, labels), { output: 'arraybuffer' }) as ArrayBuffer;
    return new TextDecoder('latin1').decode(new Uint8Array(buffer));
};

const firstStream = (pdf: string): string => {
    const match = pdf.match(/\bstream\r?\n([\s\S]*?)\r?\nendstream\b/);
    if (!match) throw new Error('PDF content stream missing');
    return match[1];
};

const resultFor = (text: string, effectiveFontSize: number): TextLayoutResult => ({
    lines: [{ text, width: 20, x: 0, top: 0, baseline: effectiveFontSize * 0.9 }],
    effectiveFontSize,
    lineHeight: effectiveFontSize * 1.2,
    blockHeight: effectiveFontSize * 1.2,
    truncated: false,
    requiresClip: true,
});

afterEach(() => {
    hooks.createSession = null;
    hooks.onPdfCreate = null;
});

describe('PDF grid shared text layout', () => {
    it('lays out and draws each resolved cell independently after style priority', async () => {
        const firstResult = resultFor('FIRST_RESOLVED', 12);
        const secondResult = resultFor('SECOND_RESOLVED', 6);
        const layout = vi.fn((
            request: PdfLayoutArgs[0],
            _metricIdentity: PdfLayoutArgs[1],
            _selectFont: PdfLayoutArgs[2],
            _context: PdfLayoutArgs[3],
        ) => (
            request.text === 'FIRST_RESOLVED' ? firstResult : secondResult
        ));
        const draw = vi.fn(() => true);
        const clear = vi.fn();
        const session: PdfTextLayoutSession = {
            identity: 'mock-grid-export',
            layout,
            draw,
            clear,
        };
        hooks.createSession = () => session;
        const element = gridElement({
            gridConfig: {
                ...gridElement().gridConfig!,
                headerRow: true,
                headerRowTextColor: '#ff0000',
                headerRowFontWeight: 'bold',
                firstColumn: true,
                firstColumnTextColor: '#0000ff',
                firstColumnFontWeight: 'normal',
            },
        });

        await exportPdf([element], ['FIRST_RESOLVED', 'SECOND_RESOLVED']);

        expect(layout).toHaveBeenCalledTimes(2);
        expect(layout.mock.calls.map(([request]) => request)).toEqual([
            {
                text: 'FIRST_RESOLVED',
                contentWidth: 98,
                contentHeight: 40,
                fontSize: 16,
                fontFamily: 'courier',
                fontWeight: 'normal',
                fontStyle: 'italic',
                textOverflow: 'clip',
                textWrap: false,
                align: 'left',
                verticalAlign: 'top',
            },
            {
                text: 'SECOND_RESOLVED',
                contentWidth: 98,
                contentHeight: 40,
                fontSize: 16,
                fontFamily: 'courier',
                fontWeight: 'bold',
                fontStyle: 'italic',
                textOverflow: 'clip',
                textWrap: false,
                align: 'left',
                verticalAlign: 'top',
            },
        ]);
        expect(layout.mock.calls.map(([, metricIdentity]) => metricIdentity)).toEqual([
            'mock-grid-export:courier:normal:italic',
            'mock-grid-export:courier:bold:italic',
        ]);
        expect(draw).toHaveBeenNthCalledWith(
            1,
            firstResult,
            { x: 21, y: 20, width: 98, height: 40, yOffset: 0 },
            expect.objectContaining({ context: 'grid grid cell cell-0' }),
        );
        expect(draw).toHaveBeenNthCalledWith(
            2,
            secondResult,
            { x: 123, y: 20, width: 98, height: 40, yOffset: 0 },
            expect.objectContaining({ context: 'grid grid cell cell-1' }),
        );
        expect(element).toMatchObject({ fontSize: 16, fontWeight: 'normal', textColor: '#111111' });
        expect(clear).toHaveBeenCalledOnce();
    });

    it('uses exact inset clips for every contained mode/wrap pair and no visible clip', async () => {
        const modes: TextOverflow[] = ['clip', 'ellipsis', 'shrink', 'visible'];
        const combinations = modes.flatMap(mode => [false, true].map(textWrap => ({ mode, textWrap })));
        const rects: Array<[number, number, number, number, unknown]> = [];
        const drawnText: string[] = [];
        hooks.onPdfCreate = doc => {
            const originalRect = doc.rect;
            const originalText = doc.text;
            doc.rect = function (this: any, ...args: any[]) {
                rects.push(args as [number, number, number, number, unknown]);
                return originalRect.apply(this, args);
            };
            doc.text = function (this: any, ...args: any[]) {
                drawnText.push(String(args[0]));
                return originalText.apply(this, args);
            };
        };
        const split = vi.spyOn((jsPDF as any).API, 'splitTextToSize');
        const elements = combinations.map(({ mode, textWrap }, index) => gridElement({
            id: `grid-${mode}-${textWrap}`,
            y: 20 + index * 60,
            w: 80,
            h: 40,
            fill: '',
            stroke: '',
            strokeWidth: 0,
            textOverflow: mode,
            textWrap,
            gridConfig: {
                ...gridElement().gridConfig!,
                cols: 1,
                gapX: 0,
                gridBorderMode: 'none',
                gridBorderWidth: 0,
                gridBorderColor: '',
                gridBorderStyle: 'none',
            },
        }));

        try {
            await exportPdf(elements, ['LONG FIRST LINE\nHARD SECOND WORD']);

            expect(rects).toEqual(combinations
                .filter(({ mode }) => mode !== 'visible')
                .map(({ mode, textWrap }) => {
                    const index = combinations.findIndex(candidate => candidate.mode === mode && candidate.textWrap === textWrap);
                    return [21, 20 + index * 60, 78, 40, null];
                }));
            expect(drawnText.length).toBeGreaterThanOrEqual(combinations.length);
            expect(drawnText.every(text => !text.includes('\n'))).toBe(true);
            expect(split).not.toHaveBeenCalled();
        } finally {
            split.mockRestore();
        }
    });

    it('clamps narrower-than-inset cells to zero content width without drawing', async () => {
        const layout = vi.fn((
            _request: PdfLayoutArgs[0],
            _metricIdentity: PdfLayoutArgs[1],
            _selectFont: PdfLayoutArgs[2],
            _context: PdfLayoutArgs[3],
        ) => null);
        const draw = vi.fn(() => true);
        hooks.createSession = () => ({
            identity: 'narrow-grid-export',
            layout,
            draw,
            clear: vi.fn(),
        } satisfies PdfTextLayoutSession);

        await exportPdf([gridElement({
            w: 1,
            gridConfig: { ...gridElement().gridConfig!, cols: 1 },
        })], ['NARROW_CELL']);

        expect(layout).toHaveBeenCalledOnce();
        expect(layout.mock.calls[0][0]).toMatchObject({ contentWidth: 0, contentHeight: 40 });
        expect(draw).not.toHaveBeenCalled();
    });

    it('keeps shrink sizes, metric styles, and text colors independent per cell', async () => {
        const measurements: Array<{ text: string; style: string; size: number }> = [];
        const draws: Array<{ text: string; style: string; size: number; color: string }> = [];
        hooks.onPdfCreate = doc => {
            const originalWidth = doc.getTextWidth;
            const originalText = doc.text;
            doc.getTextWidth = function (this: any, text: string) {
                measurements.push({ text, style: this.getFont().fontStyle, size: this.getFontSize() });
                return originalWidth.call(this, text);
            };
            doc.text = function (this: any, ...args: any[]) {
                draws.push({
                    text: String(args[0]),
                    style: this.getFont().fontStyle,
                    size: this.getFontSize(),
                    color: this.getTextColor(),
                });
                return originalText.apply(this, args);
            };
        };
        const element = gridElement({
            w: 80,
            fontSize: 20,
            textOverflow: 'shrink',
            gridConfig: {
                ...gridElement().gridConfig!,
                gapX: 0,
                headerRow: true,
                headerRowTextColor: '#ff0000',
                headerRowFontWeight: 'bold',
                firstColumn: true,
                firstColumnTextColor: '#0000ff',
                firstColumnFontWeight: 'normal',
            },
        });

        await exportPdf([element], ['SHORT', 'A_LABEL_THAT_MUST_SHRINK']);

        const shortDraw = draws.find(entry => entry.text === 'SHORT');
        const longDraw = draws.find(entry => entry.text === 'A_LABEL_THAT_MUST_SHRINK');
        expect(shortDraw).toMatchObject({ style: 'italic', size: 20, color: '#0000ff' });
        expect(longDraw).toMatchObject({ style: 'bold', color: '#ff0000' });
        expect(longDraw!.size).toBeGreaterThan(0);
        expect(longDraw!.size).toBeLessThan(shortDraw!.size);
        expect(measurements.find(entry => entry.text === 'SHORT' && entry.size === shortDraw!.size)?.style).toBe(shortDraw!.style);
        expect(measurements.find(entry => entry.text === 'A_LABEL_THAT_MUST_SHRINK' && entry.size === longDraw!.size)?.style).toBe(longDraw!.style);
        expect(element.fontSize).toBe(20);
    });

    it('positions top, middle, and bottom cell lines from full cell height', async () => {
        const positions: number[] = [];
        hooks.onPdfCreate = doc => {
            const originalText = doc.text;
            doc.text = function (this: any, ...args: any[]) {
                if (String(args[0]) === 'ANCHOR') positions.push(Number(args[2]));
                return originalText.apply(this, args);
            };
        };
        const verticalAlignments = ['top', 'middle', 'bottom'] as const;
        const elements = verticalAlignments.map((verticalAlign, index) => gridElement({
            id: `grid-${verticalAlign}`,
            y: 100 + index * 100,
            h: 60,
            fontSize: 12,
            verticalAlign,
            textOverflow: 'visible',
            gridConfig: {
                ...gridElement().gridConfig!,
                cols: 1,
                gridBorderMode: 'none',
                gridBorderWidth: 0,
                gridBorderColor: '',
                gridBorderStyle: 'none',
            },
        }));

        await exportPdf(elements, ['ANCHOR']);

        expect(positions).toHaveLength(3);
        expect(positions[0]).toBeCloseTo(110.8, 5);
        expect(positions[1]).toBeCloseTo(233.6, 5);
        expect(positions[2]).toBeCloseTo(356.4, 5);
    });

    it.each(['measurement', 'draw'] as const)(
        'isolates first-cell %s failure and still draws later text, outer border, and solid dash reset',
        async failureStage => {
            const events: string[] = [];
            const dashPatterns: number[][] = [];
            const links: Array<[number, number, number, number]> = [];
            hooks.onPdfCreate = doc => {
                const originalWidth = doc.getTextWidth;
                const originalText = doc.text;
                const originalRoundedRect = doc.roundedRect;
                const originalDash = doc.setLineDashPattern;
                const originalLink = doc.link;
                doc.getTextWidth = function (this: any, text: string) {
                    if (failureStage === 'measurement' && text === 'FAIL_FIRST') throw new Error('measure failed');
                    return originalWidth.call(this, text);
                };
                doc.text = function (this: any, ...args: any[]) {
                    const text = String(args[0]);
                    events.push(`text:${text}`);
                    if (failureStage === 'draw' && text === 'FAIL_FIRST') throw new Error('draw failed');
                    return originalText.apply(this, args);
                };
                doc.roundedRect = function (this: any, ...args: any[]) {
                    events.push(`rounded:${args.join(',')}`);
                    return originalRoundedRect.apply(this, args);
                };
                doc.setLineDashPattern = function (this: any, pattern: number[], phase: number) {
                    dashPatterns.push([...pattern]);
                    return originalDash.call(this, pattern, phase);
                };
                doc.link = function (this: any, x: number, y: number, width: number, height: number, options: any) {
                    links.push([x, y, width, height]);
                    return originalLink.call(this, x, y, width, height, options);
                };
            };
            const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            let pdf = '';
            let warningCalls: unknown[][] = [];
            try {
                pdf = await exportPdf([gridElement({
                    w: 80,
                    fill: '',
                    stroke: '#123456',
                    strokeWidth: 2,
                    borderStyle: 'dashed',
                    borderRadius: 6,
                    fontFamily: '__builtin_fallback__',
                    textOverflow: 'clip',
                    gridConfig: {
                        ...gridElement().gridConfig!,
                        cols: 2,
                        gapX: 0,
                        gridBorderMode: 'none',
                        gridBorderWidth: 0,
                        gridBorderColor: '',
                        gridBorderStyle: 'none',
                    },
                })], ['FAIL_FIRST', 'SECOND_SURVIVES']);
            } finally {
                warningCalls = [...warning.mock.calls];
                warning.mockRestore();
            }

            const stream = firstStream(pdf);
            const sessionWarnings = warningCalls.filter(call => call[0] === '[PDFTextLayout] Skipped grid grid cell cell-0');
            expect(sessionWarnings).toHaveLength(1);
            expect(stream).not.toContain('(FAIL_FIRST) Tj');
            expect(stream).toContain('(SECOND_SURVIVES) Tj');
            expect(stream.match(/^q$/gm) || []).toHaveLength((stream.match(/^Q$/gm) || []).length);
            expect(events.indexOf('text:SECOND_SURVIVES')).toBeGreaterThan(-1);
            expect(links).toEqual([[20, 20, 80, 40], [100, 20, 80, 40]]);
            expect(events.at(-1)).toBe('rounded:21,21,158,38,6,6,D');
            expect(dashPatterns.at(-1)).toEqual([]);
        },
    );

    it('balances rotated pattern, cell-text clip, outer border, and following element state', async () => {
        const pdf = await exportPdf([
            gridElement({
                id: 'rotated-grid',
                w: 100,
                rotation: 17,
                fill: '#ff0000',
                fillType: 'pattern',
                patternType: 'lines-d',
                patternSpacing: 8,
                patternWeight: 0.5,
                fontFamily: '__builtin_fallback__',
                textOverflow: 'clip',
                gridConfig: {
                    ...gridElement().gridConfig!,
                    cols: 1,
                    gridBorderRadius: 7,
                },
            }),
            {
                id: 'following', type: 'text', x: 20, y: 160, w: 200, h: 40,
                rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                text: 'FOLLOWING_AFTER_GRID', fontSize: 12, fontFamily: '__builtin_fallback__',
                textColor: '#000000', align: 'left', verticalAlign: 'top',
                textOverflow: 'visible', textWrap: false, layerId: 'main', zIndex: 1,
            } as TemplateElement,
        ], ['ROTATED_GRID_TEXT']);
        const stream = firstStream(pdf);
        const matrixIndex = stream.indexOf(' cm');
        const patternIndex = stream.indexOf('1. 0. 0. RG');
        const gridTextIndex = stream.indexOf('(ROTATED_GRID_TEXT) Tj');
        const followingIndex = stream.indexOf('(FOLLOWING_AFTER_GRID) Tj');
        const restores = stream.match(/^Q$/gm) || [];

        expect(matrixIndex).toBeGreaterThan(-1);
        expect(patternIndex).toBeGreaterThan(matrixIndex);
        expect(gridTextIndex).toBeGreaterThan(patternIndex);
        expect(followingIndex).toBeGreaterThan(gridTextIndex);
        expect(stream).toMatch(/re\nW\nn/);
        expect(stream.match(/^q$/gm) || []).toHaveLength(restores.length);
        const outerRestore = stream.lastIndexOf('\nQ', followingIndex);
        expect(outerRestore).toBeGreaterThan(gridTextIndex);
        expect(outerRestore).toBeLessThan(followingIndex);
    });
});
