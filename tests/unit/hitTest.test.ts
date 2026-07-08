import { describe, it, expect } from 'vitest';
import { hitTestPoint } from '../../services/hitTest';
import { getElementBounds } from '../../components/canvas/elementBounds';
import { AppNode, Layer, TemplateElement } from '../../types';

const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});
const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});
const nodes: Record<string, AppNode> = {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
};

describe('getElementBounds (extracted)', () => {
    it('returns w/h for plain elements', () => {
        expect(getElementBounds(makeEl('a', { w: 40, h: 30 }), nodes, 'root')).toEqual({ w: 40, h: 30 });
    });
});

describe('hitTestPoint', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];

    it('returns the stack under the point ordered top -> bottom', () => {
        const els = [
            makeEl('bottom', { layerId: 'back', zIndex: 1 }),
            makeEl('middle', { layerId: 'back', zIndex: 2 }),
            makeEl('top', { layerId: 'front', zIndex: 1 }),
            makeEl('elsewhere', { layerId: 'front', x: 500, y: 500 }),
        ];
        expect(hitTestPoint({ x: 50, y: 50 }, els, layers, nodes, 'root').map(e => e.id))
            .toEqual(['top', 'middle', 'bottom']);
    });

    it('is rotation-aware (point inside the rotated box, outside the AABB corner)', () => {
        // 100x20 bar centered at (50,50), rotated 90deg: occupies x 40..60, y 0..100
        const bar = makeEl('bar', { x: 0, y: 40, w: 100, h: 20, rotation: 90, layerId: 'back' });
        expect(hitTestPoint({ x: 50, y: 5 }, [bar], layers, nodes, 'root').map(e => e.id)).toEqual(['bar']);
        expect(hitTestPoint({ x: 5, y: 45 }, [bar], layers, nodes, 'root')).toEqual([]); // inside unrotated box, outside rotated
    });

    it('excludes elements on hidden and locked layers', () => {
        const specialLayers = [
            makeLayer('ok', 0),
            makeLayer('hid', 1, { visible: false }),
            makeLayer('lock', 2, { locked: true }),
        ];
        const els = [
            makeEl('visible', { layerId: 'ok' }),
            makeEl('hiddenEl', { layerId: 'hid' }),
            makeEl('lockedEl', { layerId: 'lock' }),
        ];
        expect(hitTestPoint({ x: 50, y: 50 }, els, specialLayers, nodes, 'root').map(e => e.id))
            .toEqual(['visible']);
    });

    it('treats untagged elements as hittable (legacy safety)', () => {
        expect(hitTestPoint({ x: 50, y: 50 }, [makeEl('legacy')], layers, nodes, 'root').map(e => e.id))
            .toEqual(['legacy']);
    });
});
