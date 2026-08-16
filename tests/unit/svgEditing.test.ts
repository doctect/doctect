import { describe, it, expect } from 'vitest';
import { validateSvgMarkup, createPlacedSvgElement, PLACEHOLDER_SVG } from '../../services/svgEditing';
import { PageTemplate, TemplateElement } from '../../types';

const existingElement: TemplateElement = {
    id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1,
    layerId: 'layer1', zIndex: 3,
};

const template: PageTemplate = {
    id: 'tpl1', name: 'Test', width: 400, height: 300,
    elements: [existingElement],
    layers: [
        { id: 'layer1', name: 'Layer 1', order: 0, visible: true, locked: false },
        { id: 'layer2', name: 'Layer 2', order: 1, visible: true, locked: false },
    ],
};

describe('validateSvgMarkup', () => {
    it('accepts well-formed SVG', () => {
        expect(validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>').ok).toBe(true);
    });

    it('rejects malformed XML', () => {
        const result = validateSvgMarkup('<svg><rect</svg>');
        expect(result.ok).toBe(false);
    });

    it('rejects markup whose root is not <svg>', () => {
        const result = validateSvgMarkup('<div>not svg</div>');
        expect(result.ok).toBe(false);
        if (result.ok === false) expect(result.error).toMatch(/root/i);
    });

    it('rejects empty or whitespace-only text', () => {
        expect(validateSvgMarkup('').ok).toBe(false);
        expect(validateSvgMarkup('   \n ').ok).toBe(false);
    });

    it('rejects an uppercase <SVG> root (XML is case-sensitive; the render regex only matches lowercase)', () => {
        const result = validateSvgMarkup('<SVG xmlns="http://www.w3.org/2000/svg"></SVG>');
        expect(result.ok).toBe(false);
    });
});

describe('PLACEHOLDER_SVG', () => {
    it('is valid SVG with a viewBox', () => {
        expect(validateSvgMarkup(PLACEHOLDER_SVG).ok).toBe(true);
        expect(PLACEHOLDER_SVG).toContain('viewBox');
        expect(PLACEHOLDER_SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
});

describe('createPlacedSvgElement', () => {
    it('creates an svg element at (20,20) with the given size and markup', () => {
        const el = createPlacedSvgElement('<svg viewBox="0 0 1 1"/>', 120, 80, template, 'layer1');
        expect(el.type).toBe('svg');
        expect(el.x).toBe(20);
        expect(el.y).toBe(20);
        expect(el.w).toBe(120);
        expect(el.h).toBe(80);
        expect(el.rotation).toBe(0);
        expect(el.opacity).toBe(1);
        expect(el.svgContent).toBe('<svg viewBox="0 0 1 1"/>');
        expect(el.id).toMatch(/^el_/);
    });

    it('places on the requested active layer with next zIndex in that layer', () => {
        const el = createPlacedSvgElement('<svg viewBox="0 0 1 1"/>', 100, 100, template, 'layer1');
        expect(el.layerId).toBe('layer1');
        expect(el.zIndex).toBe(4); // existing element in layer1 has zIndex 3
    });

    it('falls back to the frontmost layer when activeLayerId is missing or unknown', () => {
        const el = createPlacedSvgElement('<svg viewBox="0 0 1 1"/>', 100, 100, template, 'nope');
        expect(el.layerId).toBe('layer2'); // order 1 = frontmost
        expect(el.zIndex).toBe(1); // no elements yet in layer2
    });
});
