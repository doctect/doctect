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

describe('transform handles respect locked/hidden layers', () => {
    // The Layers panel can select an element on a locked/hidden layer (escape hatch),
    // but the canvas must not offer resize/rotate/move affordances for it.
    it('renders no selection handles for a single element on a locked layer', () => {
        const layers = [makeLayer('lock', 0, { locked: true })];
        const elements = [makeEl('lockedEl', { layerId: 'lock' })];
        const { container } = renderCanvas(elements, layers, { selectedElementIds: ['lockedEl'] });
        expect(container.querySelector('[data-rotate-handle]')).toBeNull();
        expect(container.querySelector('[data-resize-handle]')).toBeNull();
    });

    it('renders no selection handles for a single element on a hidden layer', () => {
        const layers = [makeLayer('hid', 0, { visible: false })];
        const elements = [makeEl('hiddenEl', { layerId: 'hid' })];
        const { container } = renderCanvas(elements, layers, { selectedElementIds: ['hiddenEl'] });
        expect(container.querySelector('[data-rotate-handle]')).toBeNull();
        expect(container.querySelector('[data-resize-handle]')).toBeNull();
    });

    it('still renders selection handles for a single element on a normal layer', () => {
        const layers = [makeLayer('open', 0)];
        const elements = [makeEl('openEl', { layerId: 'open' })];
        const { container } = renderCanvas(elements, layers, { selectedElementIds: ['openEl'] });
        expect(container.querySelector('[data-rotate-handle]')).not.toBeNull();
        expect(container.querySelector('[data-resize-handle]')).not.toBeNull();
    });

    it('renders selection handles for a legacy element (no layerId / no layers)', () => {
        const elements = [makeEl('legacy')];
        const { container } = renderCanvas(elements, [], { selectedElementIds: ['legacy'] });
        expect(container.querySelector('[data-rotate-handle]')).not.toBeNull();
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

describe('plain-click cycle through an overlapping stack', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    // Same bounds, so all three overlap at (50,50). Stack top -> bottom = [top, middle, bottom].
    const stack = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('middle', { layerId: 'back', zIndex: 2 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
    ];
    const clickAt = (node: Element, outer: HTMLElement) => {
        fireEvent.mouseDown(node, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseUp(outer, { clientX: 50, clientY: 50 });
    };

    it('a plain click (no drag) with the top element selected cycles one step down', () => {
        const { container, outer, onSelectElements } = renderCanvas(stack, layers, { selectedElementIds: ['top'] });
        clickAt(container.querySelector('[data-element-id="top"]')!, outer);
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['middle']);
    });

    it('wraps from the bottom of the stack back to the top', () => {
        const { container, outer, onSelectElements } = renderCanvas(stack, layers, { selectedElementIds: ['bottom'] });
        clickAt(container.querySelector('[data-element-id="bottom"]')!, outer);
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['top']);
    });

    it('a first click with nothing selected picks the topmost and does not cycle', () => {
        const { container, outer, onSelectElements } = renderCanvas(stack, layers, { selectedElementIds: [] });
        clickAt(container.querySelector('[data-element-id="top"]')!, outer);
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual([['top']]);
    });

    it('dragging the selected (covered) element moves it and does not cycle', () => {
        const els = [
            makeEl('bottom', { layerId: 'back', zIndex: 1, x: 0, y: 0, w: 100, h: 100 }),
            makeEl('top', { layerId: 'front', zIndex: 1, x: 0, y: 0, w: 100, h: 100 }),
        ];
        const { container, outer, onSelectElements, onUpdateElements } = renderCanvas(els, layers, { selectedElementIds: ['bottom'] });
        // Press on the foreground 'top', drag past threshold, release.
        fireEvent.mouseDown(container.querySelector('[data-element-id="top"]')!, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 80, clientY: 80 });
        fireEvent.mouseUp(outer, { clientX: 80, clientY: 80 });

        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        expect(updated.find(e => e.id === 'bottom')!.x).toBe(30); // moved
        expect(updated.find(e => e.id === 'top')!.x).toBe(0);     // foreground untouched
        // no cycle: selection never switched to the foreground
        expect(onSelectElements.mock.calls.flatMap(c => c[0])).not.toContain('top');
    });
});

describe('shift-click cycle for multi-select over stacks', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    // Stack of three at (0,0)-(100,100); 'aside' sits elsewhere and stays selected throughout.
    const els = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('middle', { layerId: 'back', zIndex: 2 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
        makeEl('aside', { layerId: 'back', zIndex: 3, x: 300, y: 300 }),
    ];
    const shiftClickStack = (container: HTMLElement, outer: HTMLElement) => {
        fireEvent.mouseDown(container.querySelector('[data-element-id="top"]')!,
            { clientX: 50, clientY: 50, button: 0, shiftKey: true });
        fireEvent.mouseUp(outer, { clientX: 50, clientY: 50, shiftKey: true });
    };

    it('adds the topmost stack element when none of the stack is selected', () => {
        const { container, outer, onSelectElements } = renderCanvas(els, layers, { selectedElementIds: ['aside'] });
        shiftClickStack(container, outer);
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['aside', 'top']);
    });

    it('swaps the selected stack member for the next one down on a repeated shift-click', () => {
        const { container, outer, onSelectElements } = renderCanvas(els, layers, { selectedElementIds: ['aside', 'top'] });
        shiftClickStack(container, outer);
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['aside', 'middle']);
    });

    it('removes the stack member after cycling past the bottom (deselect state)', () => {
        const { container, outer, onSelectElements } = renderCanvas(els, layers, { selectedElementIds: ['aside', 'bottom'] });
        shiftClickStack(container, outer);
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['aside']);
    });

    it('shift-drag with a stack member selected moves the whole selection without cycling', () => {
        const { container, outer, onSelectElements, onUpdateElements } = renderCanvas(els, layers, { selectedElementIds: ['aside', 'middle'] });
        fireEvent.mouseDown(container.querySelector('[data-element-id="top"]')!,
            { clientX: 50, clientY: 50, button: 0, shiftKey: true });
        fireEvent.mouseMove(outer, { clientX: 80, clientY: 80, shiftKey: true });
        fireEvent.mouseUp(outer, { clientX: 80, clientY: 80, shiftKey: true });

        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        expect(updated.find(e => e.id === 'middle')!.x).toBe(30);
        expect(updated.find(e => e.id === 'aside')!.x).toBe(330);
        expect(updated.find(e => e.id === 'top')!.x).toBe(0); // unselected foreground untouched
        // no cycle happened
        expect(onSelectElements.mock.calls.flatMap(c => c[0])).not.toContain('bottom');
    });

    it('still plain-toggles when the click point has no stack (single element)', () => {
        const { container, outer, onSelectElements } = renderCanvas(els, layers, { selectedElementIds: ['aside'] });
        fireEvent.mouseDown(container.querySelector('[data-element-id="aside"]')!,
            { clientX: 350, clientY: 350, button: 0, shiftKey: true });
        fireEvent.mouseUp(outer, { clientX: 350, clientY: 350, shiftKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual([]);
    });
});

describe('drag with a multi-selection over a stack', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    const els = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
        makeEl('aside', { layerId: 'back', zIndex: 2, x: 300, y: 300 }),
    ];

    it('dragging from a point over a selected (covered) member moves the whole selection', () => {
        const { container, outer, onSelectElements, onUpdateElements } =
            renderCanvas(els, layers, { selectedElementIds: ['bottom', 'aside'] });
        // Press lands on the unselected foreground 'top'.
        fireEvent.mouseDown(container.querySelector('[data-element-id="top"]')!, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 80, clientY: 80 });
        fireEvent.mouseUp(outer, { clientX: 80, clientY: 80 });

        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        expect(updated.find(e => e.id === 'bottom')!.x).toBe(30);
        expect(updated.find(e => e.id === 'aside')!.x).toBe(330);
        expect(updated.find(e => e.id === 'top')!.x).toBe(0); // foreground untouched
        // selection was never collapsed to the foreground
        expect(onSelectElements.mock.calls.flatMap(c => c[0])).not.toContain('top');
    });

    it('clicking a foreground element with no selected member beneath still selects it', () => {
        const { container, outer, onSelectElements } =
            renderCanvas(els, layers, { selectedElementIds: ['aside'] });
        fireEvent.mouseDown(container.querySelector('[data-element-id="top"]')!, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseUp(outer, { clientX: 50, clientY: 50 });
        expect(onSelectElements.mock.calls[0][0]).toEqual(['top']);
    });
});

describe('shift+alt-click cycle-add', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    const els = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('middle', { layerId: 'back', zIndex: 2 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
        makeEl('aside', { layerId: 'back', zIndex: 3, x: 300, y: 300 }),
    ];

    it('each shift+alt-click adds the next stack member down to the selection', () => {
        const { outer, onSelectElements } = renderCanvas(els, layers, { selectedElementIds: ['aside'] });
        const ev = { clientX: 50, clientY: 50, button: 0, altKey: true, shiftKey: true };
        fireEvent.mouseDown(outer, ev);
        fireEvent.mouseDown(outer, ev);
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual(
            [['aside', 'top'], ['aside', 'middle']]
        );
    });

    it('does not duplicate an already-selected member', () => {
        const { outer, onSelectElements } = renderCanvas(els, layers, { selectedElementIds: ['aside', 'top'] });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true, shiftKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['aside', 'top']);
    });
});
