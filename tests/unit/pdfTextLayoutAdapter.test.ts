import { describe, expect, it, vi } from 'vitest';
import { createPdfTextLayoutSession } from '../../services/pdfTextLayout';
import type { TextLayoutRequest, TextLayoutResult } from '../../services/textLayout';

describe('PDF text layout adapter', () => {
    const request = (overrides: Partial<TextLayoutRequest> = {}): TextLayoutRequest => ({
        text: 'cache me',
        contentWidth: 100,
        contentHeight: 40,
        fontSize: 12,
        fontFamily: 'resolved-family',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textOverflow: 'visible',
        textWrap: false,
        align: 'left',
        verticalAlign: 'top',
        ...overrides,
    });

    const layoutResult = (overrides: Partial<TextLayoutResult> = {}): TextLayoutResult => ({
        lines: [
            { text: 'first', width: 24, x: 0, top: 0, baseline: 10.8 },
            { text: 'second', width: 36, x: 0, top: 14.4, baseline: 25.2 },
        ],
        effectiveFontSize: 12,
        lineHeight: 14.4,
        blockHeight: 28.8,
        truncated: false,
        requiresClip: true,
        ...overrides,
    });

    const makeDoc = (calls: string[] = []) => {
        let selectedSize = 12;
        return {
            setSelectedSize(size: number) {
                selectedSize = size;
            },
            getTextWidth: vi.fn((text: string) => {
                calls.push(`width:${selectedSize}:${text}`);
                return text.length * selectedSize * 0.5;
            }),
            saveGraphicsState: vi.fn(() => calls.push('save')),
            rect: vi.fn((x: number, y: number, w: number, h: number) => calls.push(`rect:${x},${y},${w},${h}`)),
            clip: vi.fn(() => calls.push('clip')),
            discardPath: vi.fn(() => calls.push('discard')),
            text: vi.fn((text: string, x: number, y: number) => calls.push(`text:${text}@${x},${y}`)),
            setDrawColor: vi.fn((r: number, g: number, b: number) => calls.push(`color:${r},${g},${b}`)),
            setLineWidth: vi.fn((width: number) => calls.push(`lineWidth:${width}`)),
            setLineDashPattern: vi.fn(() => calls.push('dash:solid')),
            setLineCap: vi.fn((cap: string) => calls.push(`cap:${cap}`)),
            line: vi.fn((x1: number, y1: number, x2: number, y2: number) => calls.push(`line:${x1},${y1}-${x2},${y2}`)),
            restoreGraphicsState: vi.fn(() => calls.push('restore')),
            internal: { write: vi.fn((operator: string) => calls.push(operator)) },
        };
    };

    it('selects exact font before each layout cache lookup and remeasures after clear', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'export-1' });
        const selectFont = vi.fn((size: number) => {
            calls.push(`font:resolved-family:bolditalic:${size}`);
            doc.setSelectedSize(size);
            return {
                family: 'resolved-family',
                style: 'bolditalic',
                rendererIdentity: 'renderer-font-17',
            };
        });

        expect(session.layout(request(), 'registered:family:normal', selectFont, 'text one')).not.toBeNull();
        expect(calls).toEqual(['font:resolved-family:bolditalic:12', 'width:12:cache me']);

        expect(session.layout(request(), 'registered:family:normal', selectFont, 'text one')).not.toBeNull();
        expect(calls).toEqual([
            'font:resolved-family:bolditalic:12', 'width:12:cache me',
            'font:resolved-family:bolditalic:12',
        ]);

        session.clear();
        expect(session.layout(request(), 'registered:family:normal', selectFont, 'text one')).not.toBeNull();
        expect(calls).toEqual([
            'font:resolved-family:bolditalic:12', 'width:12:cache me',
            'font:resolved-family:bolditalic:12',
            'font:resolved-family:bolditalic:12', 'width:12:cache me',
        ]);
    });

    it('keys complete layouts by actual selected renderer identity before cache lookup', () => {
        const doc = makeDoc();
        let widthScale = 1;
        let selectionIndex = 0;
        doc.getTextWidth.mockImplementation((text: string) => text.length * widthScale);
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'fallback-export' });
        const selectFont = vi.fn((size: number) => {
            const useFallback = selectionIndex++ > 0;
            widthScale = useFallback ? 2 : 1;
            doc.setSelectedSize(size);
            return {
                family: useFallback ? 'fallback-family' : 'requested-family',
                style: useFallback ? 'normal' : 'bold',
                rendererIdentity: useFallback ? 'renderer:fallback' : 'renderer:requested',
            };
        });

        const requested = session.layout(request(), 'same-requested-font', selectFont, 'text requested');
        const fallback = session.layout(request(), 'same-requested-font', selectFont, 'text fallback');

        expect(requested?.lines[0].width).toBe(8);
        expect(fallback?.lines[0].width).toBe(16);
        expect(selectFont).toHaveBeenCalledTimes(2);
        expect(doc.getTextWidth).toHaveBeenCalledTimes(2);
    });

    it('keys widths by export identity, resolved font descriptor, size, and string', () => {
        const doc = makeDoc();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'export-identity' });
        const variants: TextLayoutRequest[] = [
            request(),
            request({ fontFamily: 'other-family' }),
            request({ fontWeight: 'bold' }),
            request({ fontStyle: 'italic' }),
            request({ fontSize: 13 }),
            request({ text: 'other text' }),
        ];

        variants.forEach(input => {
            const selectFont = (size: number) => {
                doc.setSelectedSize(size);
                return {
                    family: input.fontFamily,
                    style: `${input.fontWeight}:${input.fontStyle}`,
                    rendererIdentity: `renderer:${input.fontFamily}:${input.fontWeight}:${input.fontStyle}`,
                };
            };
            expect(session.layout(input, 'same-caller-identity', selectFont, 'text key')).not.toBeNull();
        });

        expect(doc.getTextWidth).toHaveBeenCalledTimes(variants.length);
    });

    it('evicts least-recently-used widths after 20,000 entries', () => {
        const doc = makeDoc();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'bounded-export' });
        const selectFont = (size: number) => {
            doc.setSelectedSize(size);
            return { family: 'font', style: 'normal', rendererIdentity: 'renderer:font:normal' };
        };

        for (let index = 0; index <= 20_000; index += 1) {
            session.layout(request({ text: `entry-${index}` }), 'font', selectFont, 'bounded text');
        }
        expect(doc.getTextWidth).toHaveBeenCalledTimes(20_001);

        session.layout(request({ text: 'entry-0' }), 'font', selectFont, 'bounded text');
        expect(doc.getTextWidth).toHaveBeenCalledTimes(20_002);
    });

    it('draws clipped explicit lines in one balanced graphics state', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'draw-export' });
        const selectFont = (size: number) => {
            calls.push(`font:family:bold:${size}`);
            return { family: 'family', style: 'bold', rendererIdentity: 'renderer:family:bold' };
        };

        expect(session.draw(
            layoutResult(),
            { x: 10, y: 20, width: 100, height: 40, yOffset: 0 },
            { selectFont, context: 'text clipped' },
        )).toBe(true);

        expect(calls).toEqual([
            'save', 'rect:10,20,100,40', 'clip', 'discard',
            'font:family:bold:12', 'text:first@10,30.8', 'text:second@10,45.2',
            'restore',
        ]);
        expect(doc.text).toHaveBeenNthCalledWith(1, 'first', 10, 30.8, { align: 'left', baseline: 'alphabetic' });
    });

    it('skips local graphics state for visible text', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'visible-export' });

        expect(session.draw(
            layoutResult({ requiresClip: false, lines: [layoutResult().lines[0]] }),
            { x: 10, y: 20, width: 100, height: 40, yOffset: 700 },
            {
                selectFont: size => {
                    calls.push(`font:family:normal:${size}`);
                    return { family: 'family', style: 'normal', rendererIdentity: 'renderer:family:normal' };
                },
                context: 'text visible',
            },
        )).toBe(true);

        expect(calls).toEqual(['font:family:normal:12', 'text:first@10,730.8']);
        expect(doc.saveGraphicsState).not.toHaveBeenCalled();
        expect(doc.rect).not.toHaveBeenCalled();
        expect(doc.restoreGraphicsState).not.toHaveBeenCalled();
    });

    it('uses effective font geometry and returned line bounds for underlines', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'underline-export' });
        const underlined = layoutResult({
            lines: [{ text: 'under', width: 30, x: 5, top: 0, baseline: 10.8 }],
            requiresClip: false,
        });

        expect(session.draw(
            underlined,
            { x: 10, y: 20, width: 100, height: 40, yOffset: 0 },
            {
                selectFont: size => {
                    calls.push(`font:family:italic:${size}`);
                    return { family: 'family', style: 'italic', rendererIdentity: 'renderer:family:italic' };
                },
                textDecoration: 'underline',
                decorationColor: { r: 10, g: 20, b: 30 },
                context: 'text underline',
            },
        )).toBe(true);

        expect(calls).toEqual([
            'save',
            'color:10,20,30',
            'lineWidth:0.6000000000000001',
            'dash:solid',
            'cap:butt',
            'font:family:italic:12',
            'text:under@15,30.8',
            'line:15,32.6-45,32.6',
            'restore',
        ]);
        expect(doc.rect).not.toHaveBeenCalled();
        expect(doc.setLineWidth).toHaveBeenCalledWith(0.6000000000000001);
        expect(doc.line).toHaveBeenCalledWith(15, 32.6, 45, 32.6);
    });

    it('restores visible decoration state when styling throws', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        doc.setDrawColor.mockImplementationOnce(() => {
            calls.push('color:failed');
            throw new Error('decoration color failed');
        });
        const warn = vi.fn();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'failed-decoration-export', warn });

        const result = session.draw(
            layoutResult({ requiresClip: false, lines: [layoutResult().lines[0]] }),
            { x: 10, y: 20, width: 100, height: 40, yOffset: 0 },
            {
                selectFont: size => {
                    calls.push(`font:family:normal:${size}`);
                    return { family: 'family', style: 'normal', rendererIdentity: 'renderer:family:normal' };
                },
                textDecoration: 'underline',
                decorationColor: { r: 10, g: 20, b: 30 },
                context: 'text decoration failure',
            },
        );

        expect(result).toBe(false);
        expect(calls).toEqual([
            'save',
            'color:failed',
            'restore',
        ]);
        expect(doc.rect).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();
    });

    it('warns once for measurement failures and continues later layouts', () => {
        const doc = makeDoc();
        doc.getTextWidth
            .mockImplementationOnce(() => Number.NaN)
            .mockImplementationOnce(() => { throw new Error('measure failed'); })
            .mockImplementation((text: string) => text.length * 6);
        const warn = vi.fn();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'failed-measure-export', warn });
        const selectFont = (size: number) => {
            doc.setSelectedSize(size);
            return { family: 'font', style: 'normal', rendererIdentity: 'renderer:font:normal' };
        };

        expect(session.layout(request({ text: 'invalid' }), 'font', selectFont, 'text invalid')).toBeNull();
        expect(session.layout(request({ text: 'throws' }), 'font', selectFont, 'text throws')).toBeNull();
        expect(session.layout(request({ text: 'later' }), 'font', selectFont, 'text later')).not.toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('[PDFTextLayout] Skipped text invalid');
    });

    it('restores clipped state after draw failure and allows the next draw', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        doc.text.mockImplementationOnce((text: string, x: number, y: number) => {
            calls.push(`text:${text}@${x},${y}`);
            throw new Error('draw failed');
        });
        const warn = vi.fn();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'failed-draw-export', warn });
        const box = { x: 10, y: 20, width: 100, height: 40, yOffset: 0 };
        const options = {
            selectFont: (size: number) => {
                calls.push(`font:family:normal:${size}`);
                return { family: 'family', style: 'normal', rendererIdentity: 'renderer:family:normal' };
            },
            context: 'text draw',
        };

        expect(session.draw(layoutResult(), box, options)).toBe(false);
        expect(doc.restoreGraphicsState).toHaveBeenCalledTimes(1);
        expect(session.draw(layoutResult(), box, options)).toBe(true);
        expect(doc.restoreGraphicsState).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('[PDFTextLayout] Skipped text draw');
    });

});
