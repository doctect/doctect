import { describe, it, expect } from 'vitest';
import { makeEl, makeLayer, renderCanvas } from './canvasTestUtils';

// Regression: element zIndex is user-editable and unbounded. Elements used to share
// a stacking context with the selection overlay (z-100) and the select-under hover
// highlight (z-101), so any element with zIndex >= ~100 painted OVER the blue
// selection box / indigo hover outline of anything selected underneath it.
// Elements must render inside their own isolated stacking context (isolation:
// isolate) that precedes the overlays, so user zIndex values can never compete.
describe('canvas stacking isolation', () => {
    it('renders elements inside an isolated stacking context that precedes the selection overlay', () => {
        const layers = [makeLayer('main', 0)];
        const big = makeEl('big', { x: 0, y: 0, w: 400, h: 400, zIndex: 150, layerId: 'main' });
        const small = makeEl('small', { x: 100, y: 100, w: 100, h: 80, zIndex: 1, layerId: 'main' });

        const { container } = renderCanvas([big, small], layers, { selectedElementIds: ['small'] });

        // the high-z element's DOM node
        const bigDiv = [...container.querySelectorAll<HTMLElement>('div')]
            .find(d => d.style.zIndex === '150');
        expect(bigDiv).toBeTruthy();

        // it must live inside an isolation:isolate wrapper
        let wrapper: HTMLElement | null = bigDiv!.parentElement;
        while (wrapper && wrapper.style.isolation !== 'isolate') wrapper = wrapper.parentElement;
        expect(wrapper, 'elements must be wrapped in an isolation:isolate container').toBeTruthy();

        // the selection overlay must NOT be inside that wrapper, and must come after it
        const overlay = container.querySelector<HTMLElement>('[class*="z-[100]"]');
        expect(overlay).toBeTruthy();
        expect(wrapper!.contains(overlay!)).toBe(false);
        // eslint-disable-next-line no-bitwise
        expect(wrapper!.compareDocumentPosition(overlay!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
