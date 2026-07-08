import { Layer, PageTemplate, TemplateElement } from '../types';

export const createLayerId = () => `layer_${Math.random().toString(36).substr(2, 9)}`;

export const createDefaultLayer = (): Layer => ({
    id: createLayerId(),
    name: 'Layer 1',
    order: 0,
    visible: true,
    locked: false,
});

/**
 * Idempotent Shape-B repair: guarantees template.layers is a non-empty array and every
 * element carries a layerId that exists in template.layers. Untagged/dangling elements are
 * assigned to the lowest-order layer. Never touches zIndex. Returns the SAME reference when
 * nothing needed fixing (safe to call on every load without causing state churn).
 */
export function ensureTemplateLayers(template: PageTemplate): PageTemplate {
    const existing = Array.isArray(template.layers) ? template.layers : [];
    const layers = existing.length > 0 ? existing : [createDefaultLayer()];
    const layerIds = new Set(layers.map(l => l.id));
    const fallbackId = [...layers].sort((a, b) => a.order - b.order)[0].id;
    const elements = template.elements || [];
    const needsElementFix = elements.some(el => !el.layerId || !layerIds.has(el.layerId));
    if (existing.length > 0 && !needsElementFix) return template;
    return {
        ...template,
        layers,
        elements: elements.map(el =>
            el.layerId && layerIds.has(el.layerId) ? el : { ...el, layerId: fallbackId }
        ),
    };
}

/**
 * The single stacking rule for canvas render AND pdf export:
 * filter out elements on hidden layers, then sort (layer.order asc, zIndex asc).
 * Elements with a missing/unknown layerId are treated as visible with layer order 0
 * (legacy safety — pre-migration data must keep rendering).
 * Returns a NEW array (never mutates the input, unlike the old in-place `.sort`).
 */
export function sortElementsForRender(elements: TemplateElement[], layers?: Layer[]): TemplateElement[] {
    const layerMap = new Map((layers ?? []).map(l => [l.id, l]));
    const layerOf = (el: TemplateElement) => (el.layerId ? layerMap.get(el.layerId) : undefined);
    return elements
        .filter(el => (layerOf(el)?.visible ?? true) !== false)
        .sort((a, b) => {
            const orderDiff = (layerOf(a)?.order ?? 0) - (layerOf(b)?.order ?? 0);
            if (orderDiff !== 0) return orderDiff;
            return (a.zIndex || 0) - (b.zIndex || 0);
        });
}

/** The layer new elements go into: activeLayerId if it exists on this template, else the frontmost layer. */
export function resolveActiveLayerId(template: PageTemplate, activeLayerId?: string): string {
    const layers = template.layers ?? [];
    if (activeLayerId && layers.some(l => l.id === activeLayerId)) return activeLayerId;
    const frontmost = [...layers].sort((a, b) => b.order - a.order)[0];
    return frontmost ? frontmost.id : '';
}

/** Within-layer top: max zIndex among that layer's elements + 1 (empty layer -> 1). */
export function nextZIndexInLayer(elements: TemplateElement[], layerId: string): number {
    return elements.reduce((max, el) => (el.layerId === layerId ? Math.max(max, el.zIndex || 0) : max), 0) + 1;
}

/** Reassign the given element ids to layerId, placing them (in order) on top of that layer. */
export function moveElementsToLayer(elements: TemplateElement[], ids: string[], layerId: string): TemplateElement[] {
    let z = nextZIndexInLayer(elements, layerId);
    return elements.map(el => (ids.includes(el.id) ? { ...el, layerId, zIndex: z++ } : el));
}

/** Display label for panel/menu rows: element text (trimmed, max 24 chars) or capitalized type. */
export function getElementLabel(el: TemplateElement): string {
    if (el.type === 'text' && el.text && el.text.trim()) {
        const t = el.text.trim();
        return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    }
    return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}
