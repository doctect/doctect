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

export interface PdfTextDrawBox {
    x: number;
    y: number;
    width: number;
    height: number;
    yOffset: number;
}

export interface PdfTextDrawOptions {
    selectFont(size: number): void;
    textDecoration?: string;
    context: string;
}

export interface PdfTextLayoutSession {
    readonly identity: string;
    layout(
        request: TextLayoutRequest,
        metricIdentity: string,
        selectFont: (size: number) => void,
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

    const warnOnce = (context: string, error: unknown) => {
        if (warned) return;
        warned = true;
        warn(`[PDFTextLayout] Skipped ${context}`, error);
    };

    return {
        identity,

        layout(request, metricIdentity, selectFont, context) {
            const measurer = {
                cacheKey: JSON.stringify([identity, metricIdentity]),
                measureWidth(text: string, font: FontDescriptor): number {
                    const key = JSON.stringify([
                        identity,
                        metricIdentity,
                        font.family,
                        font.weight,
                        font.style,
                        font.size,
                        text,
                    ]);
                    const cached = widthCache.get(key);
                    if (cached !== undefined) return cached;

                    selectFont(font.size);
                    const width = doc.getTextWidth(text);
                    if (Number.isFinite(width) && width >= 0) widthCache.set(key, width);
                    return width;
                },
            };

            try {
                return engine.layout(request, measurer);
            } catch (error) {
                warnOnce(context, error);
                return null;
            }
        },

        draw(layout, box, drawOptions) {
            let saved = false;
            let succeeded = true;

            try {
                if (layout.requiresClip) {
                    doc.saveGraphicsState();
                    saved = true;
                    (doc as any).rect(box.x, box.y + box.yOffset, box.width, box.height, null);
                    doc.clip();
                    if (typeof doc.discardPath === 'function') doc.discardPath();
                    else (doc as any).internal.write('n');
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

                if (drawOptions.textDecoration === 'underline') {
                    doc.setLineWidth(Math.max(0.5, layout.effectiveFontSize * 0.05));
                    doc.setLineDashPattern([], 0);
                    doc.setLineCap('butt');
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
