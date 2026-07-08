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
