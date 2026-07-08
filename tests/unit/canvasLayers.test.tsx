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

describe('locked-layer click-through', () => {
    it('does not select an element whose layer is locked when clicked directly', () => {
        const layers = [makeLayer('lock', 0, { locked: true })];
        const elements = [makeEl('lockedEl', { layerId: 'lock' })];
        const { container, onSelectElements } = renderCanvas(elements, layers);
        const node = container.querySelector('[data-element-id="lockedEl"]')!;
        fireEvent.mouseDown(node, { clientX: 50, clientY: 50, button: 0 });
        const selectedIds = onSelectElements.mock.calls.flatMap(c => c[0]);
        expect(selectedIds).not.toContain('lockedEl');
    });
});

describe('marquee selection respects locked and hidden layers', () => {
    it('a plain click (zero-area marquee) over a locked-layer element does not select it', () => {
        const layers = [makeLayer('lock', 0, { locked: true })];
        const elements = [makeEl('lockedEl', { layerId: 'lock', x: 0, y: 0, w: 100, h: 100 })];
        const { outer, onSelectElements } = renderCanvas(elements, layers);
        // mousedown on the container (not the element) starts a marquee; mouseup at the same
        // point closes a zero-area box whose bounds contain the click.
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseUp(outer, { clientX: 50, clientY: 50 });
        const selectedIds = onSelectElements.mock.calls.flatMap(c => c[0]);
        expect(selectedIds).not.toContain('lockedEl');
    });

    it('a drag-marquee over a hidden-layer element does not select it', () => {
        const layers = [makeLayer('vis', 0), makeLayer('hid', 1, { visible: false })];
        const elements = [
            makeEl('visEl', { layerId: 'vis', x: 0, y: 0, w: 100, h: 100 }),
            makeEl('hidEl', { layerId: 'hid', x: 0, y: 0, w: 100, h: 100 }),
        ];
        const { outer, onSelectElements } = renderCanvas(elements, layers);
        fireEvent.mouseDown(outer, { clientX: 5, clientY: 5, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 200, clientY: 200 });
        fireEvent.mouseUp(outer, { clientX: 200, clientY: 200 });
        const lastCall = onSelectElements.mock.calls.at(-1)![0];
        expect(lastCall).toContain('visEl');
        expect(lastCall).not.toContain('hidEl');
    });
});

describe('double-click inline text editing respects locked layers', () => {
    it('does not enter edit mode when the element is on a locked layer', () => {
        const layers = [makeLayer('lock', 0, { locked: true })];
        const elements = [makeEl('lockedText', { layerId: 'lock', type: 'text', text: 'Hi' })];
        const { container, queryByTestId } = renderCanvas(elements, layers);
        const node = container.querySelector('[data-element-id="lockedText"]')!;
        fireEvent.doubleClick(node);
        expect(queryByTestId('overlay-text-editor')).toBeNull();
    });

    it('still enters edit mode on an unlocked-layer element', () => {
        const layers = [makeLayer('open', 0)];
        const elements = [makeEl('openText', { layerId: 'open', type: 'text', text: 'Hi' })];
        const { container, queryByTestId } = renderCanvas(elements, layers);
        const node = container.querySelector('[data-element-id="openText"]')!;
        fireEvent.doubleClick(node);
        expect(queryByTestId('overlay-text-editor')).not.toBeNull();
    });
});

describe('Alt-click cycle', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    const stackOf3 = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('middle', { layerId: 'back', zIndex: 2 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
    ];

    it('selects the topmost element first, then steps one deeper per Alt+click on the same spot, wrapping', () => {
        const { outer, onSelectElements } = renderCanvas(stackOf3, layers);
        const alt = { clientX: 50, clientY: 50, button: 0, altKey: true };
        fireEvent.mouseDown(outer, alt);
        fireEvent.mouseDown(outer, alt);
        fireEvent.mouseDown(outer, alt);
        fireEvent.mouseDown(outer, alt); // wraps
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual(
            [['top'], ['middle'], ['bottom'], ['top']]
        );
    });

    it('restarts at the top when Alt+clicking a different spot', () => {
        const { outer, onSelectElements } = renderCanvas(stackOf3, layers);
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        fireEvent.mouseDown(outer, { clientX: 90, clientY: 90, button: 0, altKey: true });
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual([['top'], ['middle'], ['top']]);
    });

    it('skips hidden and locked layers while cycling', () => {
        const specialLayers = [
            makeLayer('ok', 0),
            makeLayer('hid', 1, { visible: false }),
            makeLayer('lock', 2, { locked: true }),
        ];
        const els = [
            makeEl('okEl', { layerId: 'ok' }),
            makeEl('hiddenEl', { layerId: 'hid' }),
            makeEl('lockedEl', { layerId: 'lock' }),
        ];
        const { outer, onSelectElements } = renderCanvas(els, specialLayers);
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual([['okEl'], ['okEl']]);
    });
});
