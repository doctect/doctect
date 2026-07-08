import { describe, it, expect } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { TemplateElement } from '../../types';
import { renderCanvas, makeEl, makeLayer } from './canvasTestUtils';

describe('element creation assigns the active layer', () => {
    it('drag-created elements get activeLayerId and a within-layer zIndex', () => {
        const layers = [makeLayer('back', 0), makeLayer('front', 1)];
        const existing = [makeEl('a', { layerId: 'front', zIndex: 3 }), makeEl('b', { layerId: 'back', zIndex: 9 })];
        const { outer, onUpdateElements } = renderCanvas(existing, layers, { tool: 'rect', activeLayerId: 'front' });

        fireEvent.mouseDown(outer, { clientX: 200, clientY: 200, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 300, clientY: 300 });
        fireEvent.mouseUp(outer, { clientX: 300, clientY: 300 });

        expect(onUpdateElements).toHaveBeenCalled();
        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        const created = updated.find(e => !['a', 'b'].includes(e.id))!;
        expect(created.layerId).toBe('front');
        expect(created.zIndex).toBe(4); // top of 'front' (3+1), NOT template-wide max (9)+1
    });

    it('falls back to the frontmost layer when activeLayerId is stale', () => {
        const layers = [makeLayer('back', 0), makeLayer('front', 1)];
        const { outer, onUpdateElements } = renderCanvas([], layers, { tool: 'rect', activeLayerId: 'deleted' });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 150, clientY: 150 });
        fireEvent.mouseUp(outer, { clientX: 150, clientY: 150 });
        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        expect(updated[0].layerId).toBe('front');
    });
});

describe('canvas render order and hidden-layer exclusion', () => {
    it('renders (layer.order asc, zIndex asc) and omits elements on hidden layers', () => {
        const layers = [
            makeLayer('back', 0),
            makeLayer('front', 1),
            makeLayer('hidden', 2, { visible: false }),
        ];
        const elements = [
            makeEl('f1', { layerId: 'front', zIndex: 1 }),
            makeEl('b9', { layerId: 'back', zIndex: 9 }),
            makeEl('h1', { layerId: 'hidden', zIndex: 1 }),
            makeEl('b2', { layerId: 'back', zIndex: 2 }),
        ];
        const { container } = renderCanvas(elements, layers);
        const ids = Array.from(container.querySelectorAll('[data-element-id]'))
            .map(n => n.getAttribute('data-element-id'));
        expect(ids).toEqual(['b2', 'b9', 'f1']); // no h1; back layer before front
    });
});
