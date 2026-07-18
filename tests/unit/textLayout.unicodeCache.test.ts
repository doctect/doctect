import { describe, expect, it, vi } from 'vitest';
import { BoundedLruCache } from '../../services/boundedLruCache';
import { segmentGraphemes } from '../../services/graphemes';
import {
    createTextLayoutEngine,
    TEXT_LAYOUT_CACHE_LIMIT,
} from '../../services/textLayout';
import { monoMeasurer, request } from './textLayoutTestUtils';

describe('grapheme segmentation', () => {
    it.each([
        ['e\u0301', ['e\u0301']],
        ['👍🏽', ['👍🏽']],
        ['🇮🇳', ['🇮🇳']],
        ['👨‍👩‍👧‍👦', ['👨‍👩‍👧‍👦']],
        ['𝄞', ['𝄞']],
    ])('matches native segmentation in the fallback for %s', (text, expected) => {
        expect(segmentGraphemes(text, null)).toEqual(expected);
        expect(segmentGraphemes(text)).toEqual(expected);
    });

    it.each(['e\u0301', '👍🏽', '🇮🇳', '👨‍👩‍👧‍👦', '𝄞'])(
        'ellipsizes without splitting the %s cluster',
        cluster => {
            const measurer = {
                cacheKey: 'fallback-grapheme-width-v1',
                measureWidth(text: string, font: { size: number }) {
                    return segmentGraphemes(text, null).length * font.size;
                },
            };
            const result = createTextLayoutEngine().layout(request({
                text: `${cluster}Z\nhidden`,
                contentWidth: 2,
                textOverflow: 'ellipsis',
                textWrap: false,
            }), measurer)!;

            expect(result.lines.map(line => line.text)).toEqual([`${cluster}…`]);
        },
    );
});

describe('BoundedLruCache', () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects invalid capacity %s',
        capacity => {
            expect(() => new BoundedLruCache(capacity)).toThrow(RangeError);
        },
    );

    it('refreshes entries on read and evicts the oldest entry', () => {
        const cache = new BoundedLruCache<string, number>(2);
        cache.set('a', 1);
        cache.set('b', 2);

        expect(cache.get('a')).toBe(1);
        cache.set('c', 3);

        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('a')).toBe(1);
        expect(cache.get('c')).toBe(3);
        expect(cache.size).toBe(2);
    });

    it('refreshes replacement entries and clears all entries', () => {
        const cache = new BoundedLruCache<string, number>(2);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('a', 3);
        cache.set('c', 4);

        expect(cache.get('a')).toBe(3);
        expect(cache.get('b')).toBeUndefined();
        cache.clear();
        expect(cache.size).toBe(0);
    });
});

describe('text layout caches', () => {
    it('reuses normalized complete layouts and returns deeply immutable results', () => {
        const calls: string[] = [];
        const engine = createTextLayoutEngine();
        const first = engine.layout(request({ text: 'A\r\nB', textWrap: false }), monoMeasurer(calls))!;
        const afterFirst = calls.length;
        const second = engine.layout(request({ text: 'A\nB', textWrap: false }), monoMeasurer(calls))!;

        expect(second).toBe(first);
        expect(calls).toHaveLength(afterFirst);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.lines)).toBe(true);
        expect(first.lines.every(Object.isFrozen)).toBe(true);
    });

    it('includes every request field and the measurer cache key in the layout key', () => {
        const calls: string[] = [];
        const engine = createTextLayoutEngine();
        const base = request({ text: 'AB', contentWidth: 5 });
        const cases = [
            { text: 'AC' },
            { contentWidth: 6 },
            { contentHeight: 13 },
            { fontSize: 2 },
            { fontFamily: 'Other Mono' },
            { fontWeight: 'bold' as const },
            { fontStyle: 'italic' as const },
            { textOverflow: 'visible' as const },
            { textWrap: false },
            { align: 'center' as const },
            { verticalAlign: 'middle' as const },
        ];

        engine.layout(base, monoMeasurer(calls));
        for (const overrides of cases) {
            const before = calls.length;
            engine.layout({ ...base, ...overrides }, monoMeasurer(calls));
            expect(calls.length, JSON.stringify(overrides)).toBeGreaterThan(before);
        }

        const beforeDifferentMeasurer = calls.length;
        engine.layout(base, { ...monoMeasurer(calls), cacheKey: 'different-metrics' });
        expect(calls.length).toBeGreaterThan(beforeDifferentMeasurer);
    });

    it('refreshes complete layouts and evicts the least recently used key', () => {
        const calls: string[] = [];
        const engine = createTextLayoutEngine(2);
        const layout = (text: string) => engine.layout(request({ text }), monoMeasurer(calls));

        layout('A');
        layout('B');
        layout('A');
        const afterHit = calls.length;
        layout('C');
        layout('A');
        expect(calls).toHaveLength(afterHit + 1);
        layout('B');
        expect(calls).toHaveLength(afterHit + 2);
    });

    it('bounds both segmentation and complete-layout cache behavior by engine capacity', async () => {
        vi.resetModules();
        const actual = await import('../../services/graphemes');
        const segmentSpy = vi.fn(actual.segmentGraphemes);
        vi.doMock('../../services/graphemes', () => ({ segmentGraphemes: segmentSpy }));
        const { createTextLayoutEngine: createIsolatedEngine } = await import('../../services/textLayout');
        const engine = createIsolatedEngine(2);
        const measurer = monoMeasurer();

        engine.layout(request({ text: 'AB', align: 'left' }), measurer);
        engine.layout(request({ text: 'AB', align: 'center' }), measurer);
        engine.layout(request({ text: 'CD' }), measurer);
        engine.layout(request({ text: 'EF' }), measurer);
        engine.layout(request({ text: 'AB', align: 'right' }), measurer);

        expect(segmentSpy).toHaveBeenCalledTimes(4);
        vi.doUnmock('../../services/graphemes');
        vi.resetModules();
    });

    it('uses a 20,000-entry default maximum and evicts entry 20,001', () => {
        expect(TEXT_LAYOUT_CACHE_LIMIT).toBe(20_000);
        let calls = 0;
        const measurer = {
            cacheKey: 'cache-capacity-v1',
            measureWidth(text: string) {
                calls += 1;
                return text.length;
            },
        };
        const engine = createTextLayoutEngine();

        for (let index = 0; index <= TEXT_LAYOUT_CACHE_LIMIT; index += 1) {
            engine.layout(request({
                text: String(index),
                contentWidth: 100,
                textWrap: false,
            }), measurer);
        }
        engine.layout(request({ text: '0', contentWidth: 100, textWrap: false }), measurer);

        expect(calls).toBe(TEXT_LAYOUT_CACHE_LIMIT + 2);
    });

    it('clears complete layouts and segmented graphemes', async () => {
        vi.resetModules();
        const actual = await import('../../services/graphemes');
        const segmentSpy = vi.fn(actual.segmentGraphemes);
        vi.doMock('../../services/graphemes', () => ({ segmentGraphemes: segmentSpy }));
        const { createTextLayoutEngine: createIsolatedEngine } = await import('../../services/textLayout');
        const calls: string[] = [];
        const engine = createIsolatedEngine();
        const input = request({ text: 'AB' });

        const first = engine.layout(input, monoMeasurer(calls));
        const callsPerLayout = calls.length;
        engine.clear();
        const second = engine.layout(input, monoMeasurer(calls));

        expect(second).not.toBe(first);
        expect(calls).toHaveLength(callsPerLayout * 2);
        expect(segmentSpy).toHaveBeenCalledTimes(2);
        vi.doUnmock('../../services/graphemes');
        vi.resetModules();
    });
});
