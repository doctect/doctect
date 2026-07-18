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
            setDrawColor: vi.fn(),
            setLineWidth: vi.fn((width: number) => calls.push(`lineWidth:${width}`)),
            setLineDashPattern: vi.fn(),
            setLineCap: vi.fn(),
            line: vi.fn((x1: number, y1: number, x2: number, y2: number) => calls.push(`line:${x1},${y1}-${x2},${y2}`)),
            restoreGraphicsState: vi.fn(() => calls.push('restore')),
            internal: { write: vi.fn((operator: string) => calls.push(operator)) },
        };
    };

    it('selects exact font before each uncached measurement and remeasures after clear', () => {
        const calls: string[] = [];
        const doc = makeDoc(calls);
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'export-1' });
        const selectFont = vi.fn((size: number) => {
            calls.push(`font:${size}`);
            doc.setSelectedSize(size);
        });

        expect(session.layout(request(), 'registered:family:normal', selectFont, 'text one')).not.toBeNull();
        expect(calls).toEqual(['font:12', 'width:12:cache me']);

        expect(session.layout(request(), 'registered:family:normal', selectFont, 'text one')).not.toBeNull();
        expect(calls).toEqual(['font:12', 'width:12:cache me']);

        session.clear();
        expect(session.layout(request(), 'registered:family:normal', selectFont, 'text one')).not.toBeNull();
        expect(calls).toEqual([
            'font:12', 'width:12:cache me',
            'font:12', 'width:12:cache me',
        ]);
    });

    it('keys widths by export identity, resolved font descriptor, size, and string', () => {
        const doc = makeDoc();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'export-identity' });
        const selectFont = (size: number) => doc.setSelectedSize(size);
        const variants: TextLayoutRequest[] = [
            request(),
            request({ fontFamily: 'other-family' }),
            request({ fontWeight: 'bold' }),
            request({ fontStyle: 'italic' }),
            request({ fontSize: 13 }),
            request({ text: 'other text' }),
        ];

        variants.forEach(input => {
            expect(session.layout(input, 'same-caller-identity', selectFont, 'text key')).not.toBeNull();
        });

        expect(doc.getTextWidth).toHaveBeenCalledTimes(variants.length);
    });

    it('evicts least-recently-used widths after 20,000 entries', () => {
        const doc = makeDoc();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'bounded-export' });
        const selectFont = (size: number) => doc.setSelectedSize(size);

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
        const selectFont = (size: number) => calls.push(`font:${size}`);

        expect(session.draw(
            layoutResult(),
            { x: 10, y: 20, width: 100, height: 40, yOffset: 0 },
            { selectFont, context: 'text clipped' },
        )).toBe(true);

        expect(calls).toEqual([
            'save', 'rect:10,20,100,40', 'clip', 'discard',
            'font:12', 'text:first@10,30.8', 'text:second@10,45.2',
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
            { selectFont: size => calls.push(`font:${size}`), context: 'text visible' },
        )).toBe(true);

        expect(calls).toEqual(['font:12', 'text:first@10,730.8']);
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
        });

        expect(session.draw(
            underlined,
            { x: 10, y: 20, width: 100, height: 40, yOffset: 0 },
            { selectFont: size => calls.push(`font:${size}`), textDecoration: 'underline', context: 'text underline' },
        )).toBe(true);

        expect(doc.setLineWidth).toHaveBeenCalledWith(0.6000000000000001);
        expect(doc.line).toHaveBeenCalledWith(15, 32.6, 45, 32.6);
    });

    it('warns once for measurement failures and continues later layouts', () => {
        const doc = makeDoc();
        doc.getTextWidth
            .mockImplementationOnce(() => Number.NaN)
            .mockImplementationOnce(() => { throw new Error('measure failed'); })
            .mockImplementation((text: string) => text.length * 6);
        const warn = vi.fn();
        const session = createPdfTextLayoutSession(doc as any, { sessionIdentity: 'failed-measure-export', warn });
        const selectFont = (size: number) => doc.setSelectedSize(size);

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
        const options = { selectFont: (size: number) => calls.push(`font:${size}`), context: 'text draw' };

        expect(session.draw(layoutResult(), box, options)).toBe(false);
        expect(doc.restoreGraphicsState).toHaveBeenCalledTimes(1);
        expect(session.draw(layoutResult(), box, options)).toBe(true);
        expect(doc.restoreGraphicsState).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('[PDFTextLayout] Skipped text draw');
    });

});
