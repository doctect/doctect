import type { TemplateElement } from '../types';
import { resolveCanvasFontFamily } from './canvasTextLayout';
import { resolveTextFontSize } from './textVisibility';

export interface AutoWidthMeasurement {
    w: number;
    h: number;
}

export function measureAutoWidthText(
    text: string,
    element: Pick<TemplateElement,
        'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle'>,
    documentRef?: Document,
): AutoWidthMeasurement | null {
    const doc = documentRef ?? (typeof document === 'undefined' ? undefined : document);
    const fontSize = resolveTextFontSize(element.fontSize);
    if (!doc?.body || !Number.isFinite(fontSize) || fontSize <= 0) return null;

    let probe: HTMLElement | null = null;
    let result: AutoWidthMeasurement | null = null;
    let cleanupSafe = true;
    try {
        probe = doc.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.display = 'inline-block';
        probe.style.whiteSpace = 'pre';
        probe.style.padding = '0';
        probe.style.fontSize = `${fontSize}px`;
        probe.style.fontFamily = resolveCanvasFontFamily(element.fontFamily || 'helvetica');
        probe.style.fontWeight = element.fontWeight || 'normal';
        probe.style.fontStyle = element.fontStyle || 'normal';
        probe.style.lineHeight = '1.2';
        probe.textContent = text.length > 0 ? text : ' ';
        doc.body.appendChild(probe);

        const w = Math.ceil(probe.offsetWidth + 25);
        const h = Math.max(20, Math.ceil(probe.offsetHeight));
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
            result = { w, h };
        }
    } catch {
        result = null;
    } finally {
        if (probe) {
            try {
                probe.remove();
            } catch {
                try {
                    probe.parentNode?.removeChild(probe);
                } catch {
                    cleanupSafe = false;
                }
            }
            try {
                if (probe.parentNode) cleanupSafe = false;
            } catch {
                cleanupSafe = false;
            }
        }
    }
    return cleanupSafe ? result : null;
}
