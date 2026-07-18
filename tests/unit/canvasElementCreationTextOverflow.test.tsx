import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import type { TemplateElement } from '../../types';
import { makeLayer, renderCanvas } from './canvasTestUtils';

describe('canvas element creation text overflow defaults', () => {
    beforeEach(() => localStorage.clear());

    const createElement = (tool: string, end: { x: number; y: number }): TemplateElement => {
        const { outer, onUpdateElements } = renderCanvas([], [makeLayer('content', 0)], {
            tool,
            activeLayerId: 'content',
        });
        fireEvent.mouseDown(outer, { clientX: 100, clientY: 100, button: 0 });
        fireEvent.mouseMove(outer, { clientX: end.x, clientY: end.y });
        fireEvent.mouseUp(outer, { clientX: end.x, clientY: end.y });
        return onUpdateElements.mock.calls.at(-1)![0].at(-1)!;
    };

    it('uses canonical defaults for click-created text', () => {
        const clickText = createElement('text', { x: 104, y: 104 });

        expect(clickText).toMatchObject({
            type: 'text', autoWidth: true, textOverflow: 'clip', textWrap: true,
        });
        expect(localStorage.getItem('doctect_last_textOverflow')).toBeNull();
    });

    it('uses canonical defaults for drag-created text', () => {
        const dragText = createElement('text', { x: 200, y: 200 });

        expect(dragText).toMatchObject({
            type: 'text', textOverflow: 'clip', textWrap: true,
        });
    });

    it('uses canonical defaults for drag-created grids', () => {
        const dragGrid = createElement('grid', { x: 200, y: 200 });

        expect(dragGrid).toMatchObject({
            type: 'grid', textOverflow: 'clip', textWrap: false,
        });
    });

    it('does not add text overflow settings to shape elements', () => {
        const dragRect = createElement('rect', { x: 200, y: 200 });

        expect(dragRect).not.toHaveProperty('textOverflow');
        expect(dragRect).not.toHaveProperty('textWrap');
    });
});
