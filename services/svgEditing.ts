import { PageTemplate, TemplateElement } from '../types';
import { resolveActiveLayerId, nextZIndexInLayer } from './layers';

export type SvgValidation = { ok: true } | { ok: false; error: string };

// Parse-check raw SVG markup. Storage stays unsanitized by design: DOMPurify
// runs at the single render site (CanvasElement), so validity — not safety —
// is what gates a commit here.
export function validateSvgMarkup(text: string): SvgValidation {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, error: 'SVG markup is empty' };
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
    if (doc.querySelector('parsererror')) {
        return { ok: false, error: 'Markup does not parse as SVG' };
    }
    if (doc.documentElement.nodeName.toLowerCase() !== 'svg') {
        return { ok: false, error: 'Root element must be <svg>' };
    }
    return { ok: true };
}

export const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" rx="8" fill="#4f46e5" />
</svg>`;

// Shared placement rules for every path that adds an svg element (file
// import, placeholder insert): active-layer resolution + next zIndex within
// that layer, so the two paths cannot drift apart.
export function createPlacedSvgElement(
    svgText: string,
    w: number,
    h: number,
    template: PageTemplate,
    activeLayerId?: string,
): TemplateElement {
    const layerId = resolveActiveLayerId(template, activeLayerId);
    return {
        id: `el_${Math.random().toString(36).substr(2, 8)}`,
        type: 'svg',
        x: 20,
        y: 20,
        w,
        h,
        rotation: 0,
        fill: '',
        stroke: '',
        strokeWidth: 0,
        opacity: 1,
        svgContent: svgText,
        layerId,
        zIndex: nextZIndexInLayer(template.elements, layerId),
    };
}
