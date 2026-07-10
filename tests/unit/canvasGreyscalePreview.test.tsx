import { describe, it, expect } from 'vitest';
import { makeEl, makeLayer, renderCanvas } from './canvasTestUtils';

// When greyscale export is toggled on, the canvas previews it: the elements
// layer gets a CSS grayscale filter. Selection chrome (overlays outside the
// elements wrapper) stays in color, and the filter is absent when off.
describe('canvas greyscale preview', () => {
    const layers = [makeLayer('main', 0)];
    const el = makeEl('r1', { layerId: 'main' });

    const elementsWrapper = (container: HTMLElement) =>
        [...container.querySelectorAll<HTMLElement>('div')]
            .find(d => d.style.isolation === 'isolate')!;

    it('applies a grayscale filter to the elements layer when enabled', () => {
        const { container } = renderCanvas([el], layers, { greyscalePreview: true });
        expect(elementsWrapper(container).style.filter).toContain('grayscale(1)');
    });

    it('applies no filter when disabled', () => {
        const { container } = renderCanvas([el], layers, {});
        expect(elementsWrapper(container).style.filter || '').not.toContain('grayscale');
    });
});
