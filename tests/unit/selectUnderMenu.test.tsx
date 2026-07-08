import { describe, it, expect } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderCanvas, makeEl, makeLayer } from './canvasTestUtils';

describe('right-click "select under" menu', () => {
    const layers = [
        makeLayer('back', 0),
        makeLayer('front', 1),
        makeLayer('hid', 2, { visible: false }),
        makeLayer('lock', 3, { locked: true }),
    ];
    const elements = [
        makeEl('bottom', { layerId: 'back', zIndex: 1, type: 'ellipse' }),
        makeEl('top', { layerId: 'front', zIndex: 1, type: 'text', text: 'Title text' }),
        makeEl('hiddenEl', { layerId: 'hid' }),
        makeEl('lockedEl', { layerId: 'lock' }),
    ];

    it('lists the stack top->bottom with label, type and layer name, skipping hidden + locked layers', () => {
        const { outer, getByTestId, queryByText } = renderCanvas(elements, layers);
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        const menu = getByTestId('select-under-menu');
        const rows = Array.from(menu.querySelectorAll('[data-menu-element-id]'))
            .map(n => n.getAttribute('data-menu-element-id'));
        expect(rows).toEqual(['top', 'bottom']);
        expect(menu.textContent).toContain('Title text'); // label
        expect(menu.textContent).toContain('front');      // layer name
        expect(queryByText(/hiddenEl|lockedEl/)).toBeNull();
    });

    it('selects the clicked row and closes', () => {
        const { outer, getByTestId, queryByTestId, onSelectElements } = renderCanvas(elements, layers);
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        fireEvent.click(getByTestId('select-under-menu').querySelector('[data-menu-element-id="bottom"]')!);
        expect(onSelectElements).toHaveBeenCalledWith(['bottom']);
        expect(queryByTestId('select-under-menu')).toBeNull();
    });

    it('does not open when nothing is under the cursor', () => {
        const { outer, queryByTestId } = renderCanvas(elements, layers);
        fireEvent.contextMenu(outer, { clientX: 480, clientY: 690 });
        expect(queryByTestId('select-under-menu')).toBeNull();
    });
});

describe('shift-click in the select-under menu adds to the selection', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    const elements = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
        makeEl('aside', { layerId: 'back', zIndex: 2, x: 300, y: 300 }),
    ];

    it('shift-clicking an entry adds it to the current selection and keeps the menu open', () => {
        const { outer, getByTestId, queryByTestId, onSelectElements } =
            renderCanvas(elements, layers, { selectedElementIds: ['aside'] });
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        const row = getByTestId('select-under-menu').querySelector('[data-menu-element-id="bottom"]')!;
        fireEvent.click(row, { shiftKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['aside', 'bottom']);
        expect(queryByTestId('select-under-menu')).not.toBeNull(); // stays open
    });

    it('shift-clicking an already-selected entry removes it (toggle) and keeps the menu open', () => {
        const { outer, getByTestId, queryByTestId, onSelectElements } =
            renderCanvas(elements, layers, { selectedElementIds: ['aside', 'top'] });
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        const row = getByTestId('select-under-menu').querySelector('[data-menu-element-id="top"]')!;
        fireEvent.click(row, { shiftKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['aside']);
        expect(queryByTestId('select-under-menu')).not.toBeNull();
    });

    it('plain click still replaces the selection and closes the menu', () => {
        const { outer, getByTestId, queryByTestId, onSelectElements } =
            renderCanvas(elements, layers, { selectedElementIds: ['aside'] });
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        fireEvent.click(getByTestId('select-under-menu').querySelector('[data-menu-element-id="bottom"]')!);
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['bottom']);
        expect(queryByTestId('select-under-menu')).toBeNull();
    });
});
