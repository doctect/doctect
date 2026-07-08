import { AppNode, Layer, TemplateElement } from '../types';
import { getElementBounds } from '../components/canvas/elementBounds';
import { sortElementsForRender } from './layers';

/**
 * Shared hit-test powering Alt-click cycling and the right-click "select under" menu.
 * Returns the stack of elements under `point` (template coordinates), ordered TOP -> BOTTOM,
 * considering only elements on visible + unlocked layers. Rotation-aware: the point is
 * un-rotated around each element's transform anchor before the axis-aligned bounds check.
 * Untagged/unknown-layer elements are treated as hittable (legacy safety).
 */
export function hitTestPoint(
    point: { x: number; y: number },
    elements: TemplateElement[],
    layers: Layer[] | undefined,
    nodes: Record<string, AppNode>,
    currentNodeId: string
): TemplateElement[] {
    const layerMap = new Map((layers ?? []).map(l => [l.id, l]));

    const selectable = elements.filter(el => {
        const layer = el.layerId ? layerMap.get(el.layerId) : undefined;
        if (!layer) return true;
        return layer.visible !== false && !layer.locked;
    });

    const hits = selectable.filter(el => {
        const bounds = getElementBounds(el, nodes, currentNodeId);
        const ox = el.transformOrigin ? el.transformOrigin.x : 0.5;
        const oy = el.transformOrigin ? el.transformOrigin.y : 0.5;
        const anchorX = el.x + bounds.w * ox;
        const anchorY = el.y + bounds.h * oy;
        const rad = -(el.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = point.x - anchorX;
        const dy = point.y - anchorY;
        const lx = anchorX + dx * cos - dy * sin;
        const ly = anchorY + dx * sin + dy * cos;
        return lx >= el.x && lx <= el.x + bounds.w && ly >= el.y && ly <= el.y + bounds.h;
    });

    return sortElementsForRender(hits, layers).reverse();
}
