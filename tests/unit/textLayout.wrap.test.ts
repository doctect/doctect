import { describe, expect, it } from 'vitest';
import {
    createTextLayoutEngine,
    TextMeasurementError,
} from '../../services/textLayout';
import { monoMeasurer, request } from './textLayoutTestUtils';

describe('common text layout', () => {
    it('normalizes CRLF and CR while preserving leading, repeated, and trailing hard lines', () => {
        const result = createTextLayoutEngine().layout(request({
            text: '\r\nA\rB\n\n',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['', 'A', 'B', '', '']);
        expect(result.lines.map(line => line.width)).toEqual([0, 1, 1, 0, 0]);
    });

    it('retains one unchanged line per hard line when wrapping is off', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB CD\nEF',
            contentWidth: 1,
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.lines.map(line => [line.text, line.width])).toEqual([
            ['AB CD', 5],
            ['EF', 2],
        ]);
    });

    it('wraps greedily after the latest fitting whitespace and preserves it', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB CD EF',
            contentWidth: 3,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['AB ', 'CD ', 'EF']);
    });

    it('preserves repeated whitespace across soft breaks', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A  B',
            contentWidth: 2,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['A ', ' B']);
    });

    it('breaks long tokens only at whole grapheme boundaries', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A👍🏽B',
            contentWidth: 1,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['A', '👍🏽', 'B']);
        expect(result.lines[1].width).toBe(2);
    });

    it('preserves explicit empty hard lines when wrapping is on', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A\n\nB\n',
            contentWidth: 1,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['A', '', 'B', '']);
    });

    it('keeps a candidate whose width exactly equals the box width', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'ABC',
            contentWidth: 3,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['ABC']);
        expect(result.lines[0].width).toBe(3);
    });

    it.each([
        ['left', 0],
        ['center', 2],
        ['right', 4],
    ] as const)('positions each line using %s horizontal alignment', (align, x) => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB',
            contentWidth: 6,
            textWrap: false,
            align,
        }), monoMeasurer())!;

        expect(result.lines[0].x).toBe(x);
    });

    it.each([
        ['top', 0],
        ['middle', 1.8],
        ['bottom', 3.6],
    ] as const)('positions the complete block using %s vertical alignment', (verticalAlign, top) => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A\nB',
            contentWidth: 6,
            contentHeight: 6,
            textWrap: false,
            verticalAlign,
        }), monoMeasurer())!;

        expect(result.lines[0].top).toBeCloseTo(top);
        expect(result.lines[1].top).toBeCloseTo(top + 1.2);
    });

    it('positions partially clipped lines with deterministic CSS-like baselines', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB CD',
            contentWidth: 3,
            contentHeight: 1.5,
            fontSize: 1,
            textWrap: true,
            align: 'right',
            verticalAlign: 'bottom',
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['AB ', 'CD']);
        expect(result.lineHeight).toBe(1.2);
        expect(result.blockHeight).toBe(2.4);
        expect(result.lines[0].top).toBeCloseTo(-0.9);
        expect(result.lines[0].baseline).toBeCloseTo(0);
        expect(result.lines[1].x).toBe(1);
        expect(result.requiresClip).toBe(true);
    });

    it('returns null for empty text without measuring', () => {
        const calls: string[] = [];

        expect(createTextLayoutEngine().layout(request({ text: '' }), monoMeasurer(calls))).toBeNull();
        expect(calls).toEqual([]);
    });

    it('lays out whitespace-only text', () => {
        const result = createTextLayoutEngine().layout(request({
            text: '   ',
            contentWidth: 2,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text).join('')).toBe('   ');
    });

    it.each([
        ['fontSize', 0],
        ['fontSize', -1],
        ['fontSize', Number.NaN],
        ['fontSize', Number.POSITIVE_INFINITY],
        ['contentWidth', 0],
        ['contentWidth', -1],
        ['contentWidth', Number.NaN],
        ['contentWidth', Number.POSITIVE_INFINITY],
        ['contentHeight', 0],
        ['contentHeight', -1],
        ['contentHeight', Number.NaN],
        ['contentHeight', Number.POSITIVE_INFINITY],
    ] as const)('returns null for invalid %s %s before measuring', (field, value) => {
        const calls: string[] = [];
        const result = createTextLayoutEngine().layout(request({ [field]: value }), monoMeasurer(calls));

        expect(result).toBeNull();
        expect(calls).toEqual([]);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
        'throws TextMeasurementError for invalid measured width %s',
        width => {
            const measurer = {
                cacheKey: `invalid-${width}`,
                measureWidth: () => width,
            };

            expect(() => createTextLayoutEngine().layout(request(), measurer)).toThrow(TextMeasurementError);
        },
    );

    it('bounds non-shrink measurements by a constant multiple of grapheme count', () => {
        const calls: string[] = [];
        const text = 'word '.repeat(80);

        createTextLayoutEngine().layout(request({ text, contentWidth: 7 }), monoMeasurer(calls));

        expect(calls.length).toBeLessThanOrEqual([...text].length * 3);
    });
});
