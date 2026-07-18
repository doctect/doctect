import { describe, expect, it } from 'vitest';
import type { TextOverflow } from '../../types';
import { segmentGraphemes } from '../../services/graphemes';
import { createTextLayoutEngine } from '../../services/textLayout';
import { monoMeasurer, request } from './textLayoutTestUtils';

describe('text overflow modes', () => {
    it.each([
        ['clip', false, ['AB CD', 'EF'], true],
        ['clip', true, ['AB ', 'CD', 'EF'], true],
        ['visible', false, ['AB CD', 'EF'], false],
        ['visible', true, ['AB ', 'CD', 'EF'], false],
        ['ellipsis', false, ['AB…'], true],
        ['ellipsis', true, ['AB ', 'CD…'], true],
        ['shrink', false, ['AB CD', 'EF'], true],
        ['shrink', true, ['AB ', 'CD', 'EF'], true],
    ] as const)(
        'applies %s with wrapping %s',
        (textOverflow, textWrap, lines, requiresClip) => {
            const result = createTextLayoutEngine().layout(request({
                text: 'AB CD\nEF',
                contentWidth: 3,
                contentHeight: 2.4,
                textOverflow,
                textWrap,
            }), monoMeasurer())!;

            expect(result.lines.map(line => line.text)).toEqual(lines);
            expect(result.requiresClip).toBe(requiresClip);
            expect(result.truncated).toBe(textOverflow === 'ellipsis');
            if (textOverflow === 'clip' || textOverflow === 'visible') {
                expect(result.effectiveFontSize).toBe(1);
            }
        },
    );

    it('makes visible layout identical to clip except for the clip flag', () => {
        const engine = createTextLayoutEngine();
        const base = request({ text: 'AB CD\nEF', contentHeight: 1.5 });
        const clip = engine.layout(base, monoMeasurer())!;
        const visible = engine.layout({ ...base, textOverflow: 'visible' }, monoMeasurer())!;

        expect({ ...visible, requiresClip: true }).toEqual(clip);
    });

    it('ellipsizes an unwrapped first hard line when later hard content is hidden', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A\nB',
            contentWidth: 3,
            textOverflow: 'ellipsis',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['A…']);
        expect(result.truncated).toBe(true);
    });

    it('ellipsizes an overflowing unwrapped first hard line', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'ABCD',
            contentWidth: 3,
            textOverflow: 'ellipsis',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['AB…']);
    });

    it('uses only complete wrapped lines and ellipsizes the final retained line', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB CD EF',
            contentWidth: 3,
            contentHeight: 2.5,
            textOverflow: 'ellipsis',
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['AB ', 'CD…']);
        expect(result.blockHeight).toBe(2.4);
        expect(result.truncated).toBe(true);
    });

    it('draws no line when wrapped ellipsis has zero complete-line capacity', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB',
            contentHeight: 1,
            textOverflow: 'ellipsis',
        }), monoMeasurer())!;

        expect(result.lines).toEqual([]);
        expect(result.blockHeight).toBe(0);
        expect(result.truncated).toBe(true);
    });

    it('forces an ellipsis when a narrow final candidate has hidden later lines', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A B',
            contentWidth: 2,
            contentHeight: 1.2,
            textOverflow: 'ellipsis',
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['A…']);
    });

    it('uses an empty final line when the ellipsis glyph alone is too wide', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB',
            contentWidth: 0.5,
            textOverflow: 'ellipsis',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.lines.map(line => [line.text, line.width])).toEqual([['', 0]]);
        expect(result.truncated).toBe(true);
    });

    it('does not add an ellipsis when every wrapped line fits', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB CD',
            contentHeight: 2.4,
            textOverflow: 'ellipsis',
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['AB ', 'CD']);
        expect(result.truncated).toBe(false);
        expect(result.requiresClip).toBe(true);
    });

    it('removes graphemes from the end without assuming monotonic prefix widths', () => {
        const widths: Record<string, number> = {
            'ABCD': 4,
            'ABCD…': 5,
            'ABC…': 3,
            'AB…': 4,
            'A…': 2,
            '…': 1,
        };
        const measurer = {
            cacheKey: 'nonmonotonic-prefix-v1',
            measureWidth(text: string) {
                return widths[text] ?? text.length;
            },
        };

        const result = createTextLayoutEngine().layout(request({
            text: 'ABCD\nhidden',
            contentWidth: 3,
            textOverflow: 'ellipsis',
            textWrap: false,
        }), measurer)!;

        expect(result.lines.map(line => [line.text, line.width])).toEqual([['ABC…', 3]]);
        expect(result.truncated).toBe(true);
    });

    it('bounds ellipsis removal to one measurement per removed grapheme', () => {
        const calls: string[] = [];
        const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        createTextLayoutEngine().layout(request({
            text,
            contentWidth: 3,
            textOverflow: 'ellipsis',
            textWrap: false,
        }), monoMeasurer(calls));

        expect(calls.length).toBeLessThanOrEqual([...text].length + 3);
    });

    it('tests each whole-grapheme ellipsis candidate boundary at most once', () => {
        const cluster = '👍🏽';
        const graphemeCount = 1_024;
        const text = cluster.repeat(graphemeCount);
        const measuredCandidates: string[] = [];
        const measurer = {
            cacheKey: 'long-grapheme-work-v1',
            measureWidth(candidate: string, font: { size: number }) {
                measuredCandidates.push(candidate);
                return segmentGraphemes(candidate).length * font.size;
            },
        };

        const result = createTextLayoutEngine().layout(request({
            text,
            contentWidth: 3,
            textOverflow: 'ellipsis',
            textWrap: false,
        }), measurer)!;

        expect(result.lines.map(line => line.text)).toEqual([`${cluster}${cluster}…`]);
        expect(measuredCandidates.length).toBeLessThanOrEqual(graphemeCount + 2);
        expect(new Set(measuredCandidates).size).toBe(measuredCandidates.length);
    });
});

describe('shrink overflow', () => {
    it('keeps the base size when width and height already fit', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB',
            contentWidth: 4,
            contentHeight: 2.4,
            fontSize: 2,
            textOverflow: 'shrink',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.effectiveFontSize).toBe(2);
        expect(result.lines[0].width).toBe(4);
        expect(result.truncated).toBe(false);
    });

    it('selects the largest bounded width fit', () => {
        const result = createTextLayoutEngine().layout(request({
            text: '1234',
            contentWidth: 2,
            contentHeight: 1.2,
            fontSize: 2,
            textOverflow: 'shrink',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.effectiveFontSize).toBeCloseTo(0.5, 2);
        expect(result.lines[0].width).toBeLessThanOrEqual(2);
        expect(result.blockHeight).toBeLessThanOrEqual(1.2);
        expect(result.requiresClip).toBe(true);
    });

    it('shrinks explicit hard lines to fit complete line-box height', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A\nB',
            contentWidth: 10,
            contentHeight: 2.4,
            fontSize: 2,
            textOverflow: 'shrink',
            textWrap: false,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['A', 'B']);
        expect(result.effectiveFontSize).toBeCloseTo(1, 2);
        expect(result.blockHeight).toBeLessThanOrEqual(2.4);
    });

    it('reflows wrapped multiline content at the retained size', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'AB CD\nEF GH',
            contentWidth: 3,
            contentHeight: 2.4,
            fontSize: 1,
            textOverflow: 'shrink',
            textWrap: true,
        }), monoMeasurer())!;

        expect(result.lines.map(line => line.text)).toEqual(['AB CD', 'EF GH']);
        expect(result.lines.every(line => line.width <= 3)).toBe(true);
        expect(result.blockHeight).toBeLessThanOrEqual(2.4);
    });

    it('returns null when no positive candidate is found within the bounded search', () => {
        const result = createTextLayoutEngine().layout(request({
            text: 'A',
            contentWidth: 0.000001,
            contentHeight: 1,
            fontSize: 1,
            textOverflow: 'shrink',
            textWrap: false,
        }), monoMeasurer());

        expect(result).toBeNull();
    });

    it.each([
        ['contentWidth', 0],
        ['contentHeight', Number.NaN],
    ] as const)('rejects invalid shrink %s before measurement', (field, value) => {
        const calls: string[] = [];

        expect(createTextLayoutEngine().layout(request({
            [field]: value,
            textOverflow: 'shrink',
        }), monoMeasurer(calls))).toBeNull();
        expect(calls).toEqual([]);
    });

    it('is deterministic and never mutates the original request', () => {
        const engine = createTextLayoutEngine();
        const input = request({
            text: '1234',
            contentWidth: 2,
            fontSize: 2,
            textOverflow: 'shrink',
            textWrap: false,
        });
        const original = structuredClone(input);

        const first = engine.layout(input, monoMeasurer());
        const second = engine.layout(input, monoMeasurer());

        expect(first).toEqual(second);
        expect(input).toEqual(original);
        expect(input.fontSize).toBe(2);
    });

    it('uses no more than the base check plus 16 candidate measurements', () => {
        const calls: string[] = [];

        createTextLayoutEngine().layout(request({
            text: '123456789',
            contentWidth: 3,
            contentHeight: 2,
            fontSize: 10,
            textOverflow: 'shrink',
            textWrap: false,
        }), monoMeasurer(calls));

        expect(calls.length).toBeLessThanOrEqual(17);
    });

    it.each(['clip', 'ellipsis', 'shrink', 'visible'] satisfies TextOverflow[])(
        'does not mutate source text in %s mode',
        textOverflow => {
            const input = request({ text: 'AB CD', textOverflow });

            createTextLayoutEngine().layout(input, monoMeasurer());

            expect(input.text).toBe('AB CD');
        },
    );
});
