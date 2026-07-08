import { describe, it, expect } from 'vitest';
import { Layer, PageTemplate, TemplateElement } from '../../types';
import {
    createDefaultLayer, ensureTemplateLayers, sortElementsForRender,
    resolveActiveLayerId, nextZIndexInLayer, moveElementsToLayer, getElementLabel
} from '../../services/layers';

const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});

const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});

const makeTemplate = (elements: TemplateElement[], layers?: Layer[]): PageTemplate => ({
    id: 'page', name: 'Page', width: 500, height: 700, elements, ...(layers ? { layers } : {})
});

describe('createDefaultLayer', () => {
    it('produces a visible, unlocked "Layer 1" at order 0 with a unique id', () => {
        const a = createDefaultLayer();
        const b = createDefaultLayer();
        expect(a).toMatchObject({ name: 'Layer 1', order: 0, visible: true, locked: false });
        expect(a.id).not.toBe(b.id);
    });
});

describe('ensureTemplateLayers', () => {
    it('adds one default layer and tags every element when the template has no layers', () => {
        const tpl = makeTemplate([makeEl('a', { zIndex: 5 }), makeEl('b', { zIndex: 2 })]);
        const out = ensureTemplateLayers(tpl);
        expect(out.layers).toHaveLength(1);
        expect(out.layers![0].name).toBe('Layer 1');
        out.elements.forEach(el => expect(el.layerId).toBe(out.layers![0].id));
        // zIndex preserved untouched
        expect(out.elements.map(e => e.zIndex)).toEqual([5, 2]);
    });
    it('re-tags elements whose layerId does not exist in template.layers (lowest-order layer)', () => {
        const layers = [makeLayer('top', 1), makeLayer('bottom', 0)];
        const tpl = makeTemplate([makeEl('a', { layerId: 'ghost' }), makeEl('b', { layerId: 'top' })], layers);
        const out = ensureTemplateLayers(tpl);
        expect(out.elements.find(e => e.id === 'a')!.layerId).toBe('bottom');
        expect(out.elements.find(e => e.id === 'b')!.layerId).toBe('top');
    });
    it('is idempotent and returns the same reference when nothing needs fixing', () => {
        const first = ensureTemplateLayers(makeTemplate([makeEl('a')]));
        const second = ensureTemplateLayers(first);
        expect(second).toBe(first);
    });
});

describe('sortElementsForRender', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1), makeLayer('hidden', 2, { visible: false })];
    it('sorts by (layer.order asc, zIndex asc) and filters hidden-layer elements', () => {
        const els = [
            makeEl('f1', { layerId: 'front', zIndex: 1 }),
            makeEl('b9', { layerId: 'back', zIndex: 9 }),
            makeEl('h1', { layerId: 'hidden', zIndex: 1 }),
            makeEl('b2', { layerId: 'back', zIndex: 2 }),
        ];
        expect(sortElementsForRender(els, layers).map(e => e.id)).toEqual(['b2', 'b9', 'f1']);
    });
    it('does not mutate the input array', () => {
        const els = [makeEl('f1', { layerId: 'front', zIndex: 1 }), makeEl('b1', { layerId: 'back', zIndex: 1 })];
        const snapshot = els.map(e => e.id);
        sortElementsForRender(els, layers);
        expect(els.map(e => e.id)).toEqual(snapshot);
    });
    it('treats untagged elements and missing layers as visible with layer order 0 (legacy safety)', () => {
        const els = [makeEl('legacy', { zIndex: 3 }), makeEl('f1', { layerId: 'front', zIndex: 1 })];
        expect(sortElementsForRender(els, layers).map(e => e.id)).toEqual(['legacy', 'f1']);
        expect(sortElementsForRender(els, undefined).map(e => e.id)).toEqual(['f1', 'legacy']);
    });
});

describe('resolveActiveLayerId', () => {
    const tpl = makeTemplate([], [makeLayer('back', 0), makeLayer('front', 1)]);
    it('returns activeLayerId when it exists on the template', () => {
        expect(resolveActiveLayerId(tpl, 'back')).toBe('back');
    });
    it('falls back to the frontmost layer (highest order) when missing or stale', () => {
        expect(resolveActiveLayerId(tpl, undefined)).toBe('front');
        expect(resolveActiveLayerId(tpl, 'deleted')).toBe('front');
    });
});

describe('nextZIndexInLayer', () => {
    it('returns max zIndex within that layer + 1, ignoring other layers', () => {
        const els = [
            makeEl('a', { layerId: 'L1', zIndex: 7 }),
            makeEl('b', { layerId: 'L2', zIndex: 99 }),
        ];
        expect(nextZIndexInLayer(els, 'L1')).toBe(8);
        expect(nextZIndexInLayer(els, 'empty')).toBe(1);
    });
});

describe('moveElementsToLayer', () => {
    it('retags the given ids and stacks them on top of the target layer', () => {
        const els = [
            makeEl('a', { layerId: 'L1', zIndex: 1 }),
            makeEl('b', { layerId: 'L1', zIndex: 2 }),
            makeEl('c', { layerId: 'L2', zIndex: 5 }),
        ];
        const out = moveElementsToLayer(els, ['a', 'b'], 'L2');
        expect(out.find(e => e.id === 'a')!.layerId).toBe('L2');
        expect(out.find(e => e.id === 'a')!.zIndex).toBe(6);
        expect(out.find(e => e.id === 'b')!.zIndex).toBe(7);
        expect(out.find(e => e.id === 'c')).toEqual(els[2]); // untouched
    });
});

describe('getElementLabel', () => {
    it('uses trimmed text (truncated to 24 chars) for text elements, capitalized type otherwise', () => {
        expect(getElementLabel(makeEl('a', { type: 'text', text: '  Hello  ' }))).toBe('Hello');
        expect(getElementLabel(makeEl('b', { type: 'text', text: 'x'.repeat(40) }))).toBe('x'.repeat(24) + '…');
        expect(getElementLabel(makeEl('c', { type: 'ellipse' }))).toBe('Ellipse');
        expect(getElementLabel(makeEl('d', { type: 'text', text: '' }))).toBe('Text');
    });
});
