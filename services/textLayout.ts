import type { TextOverflow } from '../types';
import { BoundedLruCache } from './boundedLruCache';
import { segmentGraphemes } from './graphemes';

export const TEXT_LINE_HEIGHT = 1.2;
export const TEXT_LAYOUT_CACHE_LIMIT = 20_000;

const ELLIPSIS = '\u2026';
const SHRINK_ITERATIONS = 16;
const SHRINK_EPSILON = 0.01;

export interface FontDescriptor {
    family: string;
    weight: 'normal' | 'bold';
    style: 'normal' | 'italic';
    size: number;
}

export interface TextMeasurer {
    cacheKey: string;
    measureWidth(text: string, font: FontDescriptor): number;
}

export interface TextLayoutRequest {
    text: string;
    contentWidth: number;
    contentHeight: number;
    fontSize: number;
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textOverflow: TextOverflow;
    textWrap: boolean;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
}

export interface TextLayoutLine {
    text: string;
    width: number;
    x: number;
    top: number;
    baseline: number;
}

export interface TextLayoutResult {
    lines: readonly TextLayoutLine[];
    effectiveFontSize: number;
    lineHeight: number;
    blockHeight: number;
    truncated: boolean;
    requiresClip: boolean;
}

export interface TextLayoutEngine {
    layout(request: TextLayoutRequest, measurer: TextMeasurer): TextLayoutResult | null;
    clear(): void;
}

interface RawLine {
    text: string;
    width: number;
}

type MeasureWidth = (text: string, fontSize: number) => number;
type GraphemeLookup = (text: string) => readonly string[];

export class TextMeasurementError extends Error {
    constructor(width: number) {
        super(`Text measurer returned invalid width: ${String(width)}`);
        this.name = 'TextMeasurementError';
    }
}

const isWhitespace = (grapheme: string): boolean => /^\s+$/u.test(grapheme);

function normalizeRequest(request: TextLayoutRequest): TextLayoutRequest {
    return {
        text: request.text.replace(/\r\n?/g, '\n'),
        contentWidth: request.contentWidth,
        contentHeight: request.contentHeight,
        fontSize: request.fontSize,
        fontFamily: request.fontFamily,
        fontWeight: request.fontWeight,
        fontStyle: request.fontStyle,
        textOverflow: request.textOverflow,
        textWrap: request.textWrap,
        align: request.align,
        verticalAlign: request.verticalAlign,
    };
}

function wrapHardLine(
    text: string,
    contentWidth: number,
    fontSize: number,
    measureWidth: MeasureWidth,
    graphemesFor: GraphemeLookup,
): RawLine[] {
    if (text.length === 0) return [{ text: '', width: 0 }];

    const graphemes = graphemesFor(text);
    const lines: RawLine[] = [];
    let lineStart = 0;
    let cursor = 0;
    let candidate = '';
    let lastFitWidth = 0;
    let latestWhitespaceEnd = -1;
    let latestWhitespaceWidth = 0;
    let suffixAfterWhitespace = '';

    for (const grapheme of graphemes) {
        const graphemeStart = cursor;
        cursor += grapheme.length;
        candidate += grapheme;
        const candidateWidth = measureWidth(candidate, fontSize);

        if (candidateWidth <= contentWidth) {
            lastFitWidth = candidateWidth;
            if (isWhitespace(grapheme)) {
                latestWhitespaceEnd = cursor;
                latestWhitespaceWidth = candidateWidth;
                suffixAfterWhitespace = '';
            } else if (latestWhitespaceEnd >= lineStart) {
                suffixAfterWhitespace += grapheme;
            }
            continue;
        }

        if (latestWhitespaceEnd >= lineStart) {
            lines.push({
                text: text.slice(lineStart, latestWhitespaceEnd),
                width: latestWhitespaceWidth,
            });
            lineStart = latestWhitespaceEnd;
            candidate = suffixAfterWhitespace + grapheme;
            const carriedPrefixWidth = suffixAfterWhitespace.length === 0
                ? 0
                : measureWidth(suffixAfterWhitespace, fontSize);
            const carriedWidth = measureWidth(candidate, fontSize);
            latestWhitespaceEnd = -1;
            suffixAfterWhitespace = '';

            if (carriedWidth <= contentWidth) {
                lastFitWidth = carriedWidth;
                if (isWhitespace(grapheme)) {
                    latestWhitespaceEnd = cursor;
                    latestWhitespaceWidth = carriedWidth;
                }
                continue;
            }

            if (graphemeStart > lineStart) {
                lines.push({
                    text: text.slice(lineStart, graphemeStart),
                    width: carriedPrefixWidth,
                });
                lineStart = graphemeStart;
                candidate = grapheme;
                const graphemeWidth = measureWidth(grapheme, fontSize);
                if (graphemeWidth <= contentWidth) {
                    lastFitWidth = graphemeWidth;
                    if (isWhitespace(grapheme)) {
                        latestWhitespaceEnd = cursor;
                        latestWhitespaceWidth = graphemeWidth;
                    }
                    continue;
                }
                lines.push({ text: grapheme, width: graphemeWidth });
            } else {
                lines.push({ text: grapheme, width: carriedWidth });
            }
        } else if (graphemeStart > lineStart) {
            lines.push({
                text: text.slice(lineStart, graphemeStart),
                width: lastFitWidth,
            });
            lineStart = graphemeStart;
            candidate = grapheme;
            const graphemeWidth = measureWidth(grapheme, fontSize);
            if (graphemeWidth <= contentWidth) {
                lastFitWidth = graphemeWidth;
                if (isWhitespace(grapheme)) {
                    latestWhitespaceEnd = cursor;
                    latestWhitespaceWidth = graphemeWidth;
                }
                continue;
            }
            lines.push({ text: grapheme, width: graphemeWidth });
        } else {
            lines.push({ text: grapheme, width: candidateWidth });
        }

        lineStart = cursor;
        candidate = '';
        lastFitWidth = 0;
        latestWhitespaceEnd = -1;
        suffixAfterWhitespace = '';
    }

    if (lineStart < text.length) {
        lines.push({ text: text.slice(lineStart), width: lastFitWidth });
    }

    return lines;
}

function layoutCommonLines(
    request: TextLayoutRequest,
    fontSize: number,
    measureWidth: MeasureWidth,
    graphemesFor: GraphemeLookup,
): RawLine[] {
    const hardLines = request.text.split('\n');

    if (!request.textWrap) {
        return hardLines.map(text => ({
            text,
            width: text.length === 0 ? 0 : measureWidth(text, fontSize),
        }));
    }

    return hardLines.flatMap(text => wrapHardLine(
        text,
        request.contentWidth,
        fontSize,
        measureWidth,
        graphemesFor,
    ));
}

function ellipsizeLine(
    line: RawLine,
    contentWidth: number,
    fontSize: number,
    measureWidth: MeasureWidth,
    graphemesFor: GraphemeLookup,
): RawLine {
    const ellipsisWidth = measureWidth(ELLIPSIS, fontSize);
    if (ellipsisWidth > contentWidth) return { text: '', width: 0 };

    const graphemes = graphemesFor(line.text);
    const graphemeEnds = new Array<number>(graphemes.length + 1);
    graphemeEnds[0] = 0;
    let codeUnitEnd = 0;
    for (let index = 0; index < graphemes.length; index += 1) {
        codeUnitEnd += graphemes[index].length;
        graphemeEnds[index + 1] = codeUnitEnd;
    }

    for (let candidateCount = graphemes.length; candidateCount > 0; candidateCount -= 1) {
        const text = `${line.text.slice(0, graphemeEnds[candidateCount])}${ELLIPSIS}`;
        const width = measureWidth(text, fontSize);
        if (width <= contentWidth) return { text, width };
    }

    return { text: ELLIPSIS, width: ellipsisWidth };
}

function positionLines(
    rawLines: readonly RawLine[],
    request: TextLayoutRequest,
    fontSize: number,
    truncated: boolean,
    requiresClip: boolean,
): TextLayoutResult {
    const lineHeight = fontSize * TEXT_LINE_HEIGHT;
    const blockHeight = rawLines.length * lineHeight;
    const blockTop = request.verticalAlign === 'top'
        ? 0
        : request.verticalAlign === 'bottom'
            ? request.contentHeight - blockHeight
            : (request.contentHeight - blockHeight) / 2;
    const lines = rawLines.map((line, index): TextLayoutLine => {
        const x = request.align === 'left'
            ? 0
            : request.align === 'right'
                ? request.contentWidth - line.width
                : (request.contentWidth - line.width) / 2;
        const top = blockTop + index * lineHeight;

        return Object.freeze({
            text: line.text,
            width: line.width,
            x,
            top,
            baseline: top + (lineHeight - fontSize) / 2 + fontSize * 0.8,
        });
    });

    return Object.freeze({
        lines: Object.freeze(lines),
        effectiveFontSize: fontSize,
        lineHeight,
        blockHeight,
        truncated,
        requiresClip,
    });
}

function layoutEllipsis(
    request: TextLayoutRequest,
    measureWidth: MeasureWidth,
    graphemesFor: GraphemeLookup,
): TextLayoutResult {
    const fontSize = request.fontSize;

    if (!request.textWrap) {
        const hardLines = request.text.split('\n');
        const text = hardLines[0];
        const line = {
            text,
            width: text.length === 0 ? 0 : measureWidth(text, fontSize),
        };
        const truncated = hardLines.length > 1 || line.width > request.contentWidth;
        const lines = truncated
            ? [ellipsizeLine(line, request.contentWidth, fontSize, measureWidth, graphemesFor)]
            : [line];

        return positionLines(lines, request, fontSize, truncated, true);
    }

    const commonLines = layoutCommonLines(request, fontSize, measureWidth, graphemesFor);
    const capacity = Math.floor(request.contentHeight / (fontSize * TEXT_LINE_HEIGHT));
    if (capacity === 0) return positionLines([], request, fontSize, true, true);

    let retainedCount = Math.min(capacity, commonLines.length);
    let truncated = retainedCount < commonLines.length;
    const overflowingIndex = commonLines
        .slice(0, retainedCount)
        .findIndex(line => line.width > request.contentWidth);

    if (overflowingIndex >= 0) {
        retainedCount = overflowingIndex + 1;
        truncated = true;
    }

    const lines = commonLines.slice(0, retainedCount);
    if (truncated && lines.length > 0) {
        lines[lines.length - 1] = ellipsizeLine(
            lines[lines.length - 1],
            request.contentWidth,
            fontSize,
            measureWidth,
            graphemesFor,
        );
    }

    return positionLines(lines, request, fontSize, truncated, true);
}

function linesFit(lines: readonly RawLine[], request: TextLayoutRequest, fontSize: number): boolean {
    return lines.every(line => line.width <= request.contentWidth)
        && lines.length * fontSize * TEXT_LINE_HEIGHT <= request.contentHeight;
}

function layoutShrink(
    request: TextLayoutRequest,
    measureWidth: MeasureWidth,
    graphemesFor: GraphemeLookup,
): TextLayoutResult | null {
    const baseLines = layoutCommonLines(request, request.fontSize, measureWidth, graphemesFor);
    if (linesFit(baseLines, request, request.fontSize)) {
        return positionLines(baseLines, request, request.fontSize, false, true);
    }

    let low = 0;
    let high = request.fontSize;
    let retainedSize = 0;

    for (let iteration = 0; iteration < SHRINK_ITERATIONS; iteration += 1) {
        if (high - low <= SHRINK_EPSILON) break;

        const candidateSize = (low + high) / 2;
        const candidateLines = layoutCommonLines(request, candidateSize, measureWidth, graphemesFor);
        if (linesFit(candidateLines, request, candidateSize)) {
            low = candidateSize;
            retainedSize = candidateSize;
        } else {
            high = candidateSize;
        }
    }

    if (retainedSize <= 0) return null;

    const retainedLines = layoutCommonLines(request, retainedSize, measureWidth, graphemesFor);
    return positionLines(retainedLines, request, retainedSize, false, true);
}

function computeLayout(
    request: TextLayoutRequest,
    measurer: TextMeasurer,
    graphemesFor: GraphemeLookup,
): TextLayoutResult | null {
    const measuredWidths = new Map<string, number>();
    const measureWidth: MeasureWidth = (text, fontSize) => {
        if (text.length === 0) return 0;

        const key = JSON.stringify([fontSize, text]);
        const cached = measuredWidths.get(key);
        if (cached !== undefined) return cached;

        const width = measurer.measureWidth(text, {
            family: request.fontFamily,
            weight: request.fontWeight,
            style: request.fontStyle,
            size: fontSize,
        });
        if (!Number.isFinite(width) || width < 0) throw new TextMeasurementError(width);
        measuredWidths.set(key, width);
        return width;
    };

    if (request.textOverflow === 'ellipsis') {
        return layoutEllipsis(request, measureWidth, graphemesFor);
    }
    if (request.textOverflow === 'shrink') {
        return layoutShrink(request, measureWidth, graphemesFor);
    }

    const lines = layoutCommonLines(request, request.fontSize, measureWidth, graphemesFor);
    return positionLines(
        lines,
        request,
        request.fontSize,
        false,
        request.textOverflow === 'clip',
    );
}

export function createTextLayoutEngine(
    cacheLimit: number = TEXT_LAYOUT_CACHE_LIMIT,
): TextLayoutEngine {
    const layoutCache = new BoundedLruCache<string, TextLayoutResult | null>(cacheLimit);
    const graphemeCache = new BoundedLruCache<string, readonly string[]>(cacheLimit);
    const graphemesFor: GraphemeLookup = text => {
        const cached = graphemeCache.get(text);
        if (cached !== undefined) return cached;

        const graphemes = Object.freeze(segmentGraphemes(text));
        graphemeCache.set(text, graphemes);
        return graphemes;
    };

    return {
        layout(request, measurer) {
            if (
                request.text.length === 0
                || !Number.isFinite(request.fontSize)
                || request.fontSize <= 0
                || !Number.isFinite(request.contentWidth)
                || request.contentWidth <= 0
                || !Number.isFinite(request.contentHeight)
                || request.contentHeight <= 0
            ) {
                return null;
            }

            const normalizedRequest = normalizeRequest(request);
            const key = JSON.stringify([measurer.cacheKey, normalizedRequest]);
            const cached = layoutCache.get(key);
            if (cached !== undefined) return cached;

            const result = computeLayout(normalizedRequest, measurer, graphemesFor);
            layoutCache.set(key, result);
            return result;
        },

        clear() {
            layoutCache.clear();
            graphemeCache.clear();
        },
    };
}
