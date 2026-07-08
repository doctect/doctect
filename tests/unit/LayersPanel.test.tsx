import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayersPanel } from '../../components/LayersPanel';
import { Layer, PageTemplate, TemplateElement } from '../../types';

const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});
const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});

export const renderPanel = (elements: TemplateElement[], layers: Layer[], extra: Record<string, any> = {}) => {
    const template: PageTemplate = { id: 'page', name: 'Page', width: 500, height: 700, elements, layers };
    const onUpdateTemplate = vi.fn();
    const onUpdateElements = vi.fn();
    const onSelectElements = vi.fn();
    const onSetActiveLayer = vi.fn();
    const utils = render(
        <LayersPanel
            template={template}
            selectedElementIds={[]}
            activeLayerId={layers[0]?.id}
            onUpdateTemplate={onUpdateTemplate}
            onUpdateElements={onUpdateElements}
            onSelectElements={onSelectElements}
            onSetActiveLayer={onSetActiveLayer}
            {...extra}
        />
    );
    return { ...utils, onUpdateTemplate, onUpdateElements, onSelectElements, onSetActiveLayer };
};

describe('LayersPanel layer rows', () => {
    const layers = [makeLayer('back', 0, { name: 'Background' }), makeLayer('front', 1, { name: 'Foreground' })];

    it('renders layers frontmost-first', () => {
        const { container } = renderPanel([], layers);
        const ids = Array.from(container.querySelectorAll('[data-testid^="layer-row-"]'))
            .map(n => n.getAttribute('data-testid'));
        expect(ids).toEqual(['layer-row-front', 'layer-row-back']);
    });

    it('eye toggle flips visible via onUpdateTemplate', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Toggle visibility"]')!);
        const updated: Layer[] = onUpdateTemplate.mock.calls[0][0].layers;
        expect(updated.find(l => l.id === 'front')!.visible).toBe(false);
        expect(updated.find(l => l.id === 'back')!.visible).toBe(true);
    });

    it('lock toggle flips locked', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-back').querySelector('[title="Toggle lock"]')!);
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'back').locked).toBe(true);
    });

    it('double-click renames via inline input', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.doubleClick(getByTestId('layer-row-front').querySelector('[data-testid="layer-name"]')!);
        const input = getByTestId('layer-row-front').querySelector('input')!;
        fireEvent.change(input, { target: { value: 'Header art' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'front').name).toBe('Header art');
    });

    it('color chip sets color', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Layer color"]')!);
        fireEvent.click(getByTestId('layer-color-swatch-#ef4444'));
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'front').color).toBe('#ef4444');
    });

    it('collapse toggle sets collapsed', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Collapse layer"]')!);
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'front').collapsed).toBe(true);
    });

    it('clicking the row sets the active layer', () => {
        const { getByTestId, onSetActiveLayer } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[data-testid="layer-name"]')!);
        expect(onSetActiveLayer).toHaveBeenCalledWith('front');
    });

    it('drag-reordering emits renumbered orders', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.dragStart(getByTestId('layer-row-back'), { dataTransfer: { setData: vi.fn(), getData: vi.fn() } });
        fireEvent.dragOver(getByTestId('layer-row-front'));
        fireEvent.drop(getByTestId('layer-row-front'));
        const updated: Layer[] = onUpdateTemplate.mock.calls[0][0].layers;
        expect(updated.find(l => l.id === 'back')!.order).toBeGreaterThan(updated.find(l => l.id === 'front')!.order);
    });

    it('add-layer appends Layer N; delete is disabled for the last layer', () => {
        const single = [makeLayer('only', 0, { name: 'Layer 1' })];
        const { getByTitle, getByTestId, onUpdateTemplate } = renderPanel([], single);
        expect((getByTestId('layer-row-only').querySelector('[title="Delete layer"]') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(getByTitle('Add layer'));
        expect(onUpdateTemplate.mock.calls[0][0].layers).toHaveLength(2);
    });

    it('delete re-tags the doomed layer elements (via layers AND elements updates)', () => {
        const els = [makeEl('x', { layerId: 'front', zIndex: 1 })];
        const { getByTestId, onUpdateTemplate, onUpdateElements } = renderPanel(els, layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Delete layer"]')!);
        expect(onUpdateTemplate.mock.calls[0][0].layers.map((l: Layer) => l.id)).toEqual(['back']);
        expect(onUpdateElements.mock.calls[0][0][0]).toMatchObject({ id: 'x', layerId: 'back' });
    });
});

describe('LayersPanel element rows', () => {
    const layers = [makeLayer('back', 0, { name: 'Back' }), makeLayer('front', 1, { name: 'Front' })];
    const elements = [
        makeEl('r1', { layerId: 'back', zIndex: 1 }),
        makeEl('t1', { layerId: 'back', zIndex: 2, type: 'text', text: 'Big title' }),
        makeEl('e1', { layerId: 'front', zIndex: 1, type: 'ellipse' }),
    ];

    it('lists each layer\'s elements frontmost-first under its layer row', () => {
        const { container } = renderPanel(elements, layers);
        const ids = Array.from(container.querySelectorAll('[data-testid^="element-row-"]'))
            .map(n => n.getAttribute('data-testid'));
        // front layer first (frontmost), then back layer's elements zIndex desc
        expect(ids).toEqual(['element-row-e1', 'element-row-t1', 'element-row-r1']);
    });

    it('click selects the element — even one fully covered on canvas', () => {
        const { getByTestId, onSelectElements } = renderPanel(elements, layers);
        fireEvent.click(getByTestId('element-row-r1'));
        expect(onSelectElements).toHaveBeenCalledWith(['r1']);
    });

    it('highlights the current selection', () => {
        const { getByTestId } = renderPanel(elements, layers, { selectedElementIds: ['t1'] });
        expect(getByTestId('element-row-t1').getAttribute('aria-selected')).toBe('true');
        expect(getByTestId('element-row-r1').getAttribute('aria-selected')).toBe('false');
    });

    it('hides element rows of collapsed layers', () => {
        const collapsed = [makeLayer('back', 0, { collapsed: true }), makeLayer('front', 1)];
        const { queryByTestId } = renderPanel(elements, collapsed);
        expect(queryByTestId('element-row-r1')).toBeNull();
        expect(queryByTestId('element-row-e1')).not.toBeNull();
    });

    it('search filters element rows by label or type', () => {
        const { getByPlaceholderText, queryByTestId } = renderPanel(elements, layers);
        fireEvent.change(getByPlaceholderText('Filter elements…'), { target: { value: 'big' } });
        expect(queryByTestId('element-row-t1')).not.toBeNull();
        expect(queryByTestId('element-row-r1')).toBeNull();
        expect(queryByTestId('element-row-e1')).toBeNull();
    });

    it('dragging an element row onto a layer row retags it on top of that layer', () => {
        const { getByTestId, onUpdateElements } = renderPanel(elements, layers);
        fireEvent.dragStart(getByTestId('element-row-r1'));
        fireEvent.dragOver(getByTestId('layer-row-front'));
        fireEvent.drop(getByTestId('layer-row-front'));
        const updated: TemplateElement[] = onUpdateElements.mock.calls[0][0];
        expect(updated.find(e => e.id === 'r1')).toMatchObject({ layerId: 'front', zIndex: 2 });
    });

    it('an aborted element drag (dragEnd without drop) does not hijack a later layer reorder', () => {
        const { getByTestId, onUpdateElements, onUpdateTemplate } = renderPanel(elements, layers);
        // Start dragging an element row, then release OUTSIDE any layer row (abort).
        fireEvent.dragStart(getByTestId('element-row-r1'));
        fireEvent.dragEnd(getByTestId('element-row-r1'));
        // Now a normal layer reorder: drag 'back' onto 'front'.
        fireEvent.dragStart(getByTestId('layer-row-back'));
        fireEvent.dragOver(getByTestId('layer-row-front'));
        fireEvent.drop(getByTestId('layer-row-front'));
        // The stale element must NOT be retagged...
        expect(onUpdateElements).not.toHaveBeenCalled();
        // ...and the layers MUST have been reordered.
        const updated: Layer[] = onUpdateTemplate.mock.calls[0][0].layers;
        expect(updated.find(l => l.id === 'back')!.order).toBeGreaterThan(updated.find(l => l.id === 'front')!.order);
    });

    it('"move selection to layer" reassigns the whole canvas selection', () => {
        const { getByTestId, onUpdateElements } = renderPanel(elements, layers, { selectedElementIds: ['r1', 't1'] });
        fireEvent.change(getByTestId('move-selection-select'), { target: { value: 'front' } });
        const updated: TemplateElement[] = onUpdateElements.mock.calls[0][0];
        expect(updated.find(e => e.id === 'r1')!.layerId).toBe('front');
        expect(updated.find(e => e.id === 't1')!.layerId).toBe('front');
    });
});

describe('color popover outside-click dismiss', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];

    it('closes when clicking outside without picking a color', () => {
        const { getByTestId, queryByTestId } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Layer color"]')!);
        expect(queryByTestId('layer-color-swatch-none')).not.toBeNull();
        fireEvent.mouseDown(document.body);
        expect(queryByTestId('layer-color-swatch-none')).toBeNull();
    });

    it('stays open when the mousedown lands inside the popover', () => {
        const { getByTestId, queryByTestId } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Layer color"]')!);
        fireEvent.mouseDown(getByTestId('layer-color-swatch-none'));
        expect(queryByTestId('layer-color-swatch-none')).not.toBeNull();
    });
});

describe('element-row multi-select (ctrl/cmd toggle, shift range)', () => {
    const layers = [makeLayer('back', 0)];
    // Display order within the layer is zIndex desc: e1, t1, r1
    const elements = [
        makeEl('r1', { layerId: 'back', zIndex: 1 }),
        makeEl('t1', { layerId: 'back', zIndex: 2 }),
        makeEl('e1', { layerId: 'back', zIndex: 3 }),
    ];

    it('ctrl-click toggles a row into the selection', () => {
        const { getByTestId, onSelectElements } = renderPanel(elements, layers, { selectedElementIds: ['r1'] });
        fireEvent.click(getByTestId('element-row-t1'), { ctrlKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['r1', 't1']);
    });

    it('ctrl-click toggles an already-selected row out of the selection', () => {
        const { getByTestId, onSelectElements } = renderPanel(elements, layers, { selectedElementIds: ['r1', 't1'] });
        fireEvent.click(getByTestId('element-row-t1'), { ctrlKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['r1']);
    });

    it('shift-click selects the display-order range from the last clicked row', () => {
        const { getByTestId, onSelectElements } = renderPanel(elements, layers);
        fireEvent.click(getByTestId('element-row-e1'));            // anchor
        fireEvent.click(getByTestId('element-row-r1'), { shiftKey: true });
        expect(onSelectElements.mock.calls.at(-1)![0]).toEqual(['e1', 't1', 'r1']);
    });
});
