import type { jsPDF } from 'jspdf';
import { BoundedLruCache } from './boundedLruCache';
import {
    createTextLayoutEngine,
    TEXT_LAYOUT_CACHE_LIMIT,
    type FontDescriptor,
    type TextLayoutRequest,
    type TextLayoutResult,
} from './textLayout';

interface PdfTextLayoutSessionOptions {
    sessionIdentity?: string;
    warn?: (message: string, error: unknown) => void;
}

interface PdfFontSelection {
    family: string;
    style: string;
    rendererIdentity: string;
}

type PdfFontSelector = (size: number) => PdfFontSelection;

export interface PdfTextDrawBox {
    x: number;
    y: number;
    width: number;
    height: number;
    yOffset: number;
}

export interface PdfTextDrawOptions {
    selectFont: PdfFontSelector;
    textDecoration?: string;
    decorationColor?: { r: number; g: number; b: number } | null;
    context: string;
}

export interface PdfTextLayoutSession {
    readonly identity: string;
    warnOnce(context: string, error: unknown, action?: string): void;
    layout(
        request: TextLayoutRequest,
        metricIdentity: string,
        selectFont: PdfFontSelector,
        context: string,
    ): TextLayoutResult | null;
    draw(layout: TextLayoutResult, box: PdfTextDrawBox, options: PdfTextDrawOptions): boolean;
    clear(): void;
}

let nextSessionIdentity = 1;

export function createPdfTextLayoutSession(
    doc: jsPDF,
    options: PdfTextLayoutSessionOptions = {},
): PdfTextLayoutSession {
    const identity = options.sessionIdentity ?? `pdf-${nextSessionIdentity++}`;
    const warn = options.warn ?? ((message: string, error: unknown) => console.warn(message, error));
    const widthCache = new BoundedLruCache<string, number>(TEXT_LAYOUT_CACHE_LIMIT);
    const engine = createTextLayoutEngine();
    let warned = false;

    const warnOnce = (context: string, error: unknown, action = 'Skipped') => {
        if (warned) return;
        warned = true;
        warn(`[PDFTextLayout] ${action} ${context}`, error);
    };

    return {
        identity,
        warnOnce,

        layout(request, metricIdentity, selectFont, context) {
            try {
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

                let selectedSize = request.fontSize;
                let selection = selectFont(selectedSize);
                const effectiveMetricIdentity = JSON.stringify([
                    identity,
                    metricIdentity,
                    selection.rendererIdentity,
                    selection.family,
                    selection.style,
                    request.fontFamily,
                    request.fontWeight,
                    request.fontStyle,
                    request.fontSize,
                ]);
                const measurer = {
                    cacheKey: effectiveMetricIdentity,
                    measureWidth(text: string, font: FontDescriptor): number {
                        if (font.size !== selectedSize) {
                            selectedSize = font.size;
                            selection = selectFont(selectedSize);
                        }
                        const key = JSON.stringify([
                            identity,
                            metricIdentity,
                            selection.rendererIdentity,
                            selection.family,
                            selection.style,
                            font.family,
                            font.weight,
                            font.style,
                            font.size,
                            text,
                        ]);
                        const cached = widthCache.get(key);
                        if (cached !== undefined) return cached;

                        const width = doc.getTextWidth(text);
                        if (Number.isFinite(width) && width >= 0) widthCache.set(key, width);
                        return width;
                    },
                };

                return engine.layout(request, measurer);
            } catch (error) {
                warnOnce(context, error);
                return null;
            }
        },

        draw(layout, box, drawOptions) {
            let saved = false;
            let succeeded = true;
            const hasDecoration = drawOptions.textDecoration === 'underline';

            try {
                if (layout.requiresClip || hasDecoration) {
                    doc.saveGraphicsState();
                    saved = true;
                }
                if (layout.requiresClip) {
                    (doc as any).rect(box.x, box.y + box.yOffset, box.width, box.height, null);
                    doc.clip();
                    if (typeof doc.discardPath === 'function') doc.discardPath();
                    else (doc as any).internal.write('n');
                }

                if (hasDecoration) {
                    if (drawOptions.decorationColor) {
                        const { r, g, b } = drawOptions.decorationColor;
                        doc.setDrawColor(r, g, b);
                    }
                    doc.setLineWidth(Math.max(0.5, layout.effectiveFontSize * 0.05));
                    doc.setLineDashPattern([], 0);
                    doc.setLineCap('butt');
                }

                drawOptions.selectFont(layout.effectiveFontSize);
                layout.lines.forEach(line => {
                    if (line.text.length === 0) return;
                    doc.text(
                        line.text,
                        box.x + line.x,
                        box.y + box.yOffset + line.baseline,
                        { align: 'left', baseline: 'alphabetic' },
                    );
                });

                if (hasDecoration) {
                    layout.lines.forEach(line => {
                        if (line.text.length === 0) return;
                        const x = box.x + line.x;
                        const y = box.y + box.yOffset + line.baseline + layout.effectiveFontSize * 0.15;
                        doc.line(x, y, x + line.width, y);
                    });
                }
            } catch (error) {
                succeeded = false;
                warnOnce(drawOptions.context, error);
            } finally {
                if (saved) {
                    try {
                        doc.restoreGraphicsState();
                    } catch (error) {
                        succeeded = false;
                        warnOnce(drawOptions.context, error);
                    }
                }
            }

            return succeeded;
        },

        clear() {
            widthCache.clear();
            engine.clear();
        },
    };
}
