import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import type { TemplateElement } from '../../types';
import { makeLayer, renderCanvas } from './canvasTestUtils';

describe('canvas element creation text overflow defaults', () => {
    beforeEach(() => localStorage.clear());

    const seedLastUsed = (textWrap: string) => {
        localStorage.setItem('doctect_last_textOverflow', 'visible');
        localStorage.setItem('doctect_last_textWrap', textWrap);
    };

    const expectLastUsedUnchanged = (textWrap: string) => {
        expect(localStorage.getItem('doctect_last_textOverflow')).toBe('visible');
        expect(localStorage.getItem('doctect_last_textWrap')).toBe(textWrap);
    };

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
        seedLastUsed('false');
        const clickText = createElement('text', { x: 104, y: 104 });

        expect(clickText).toMatchObject({
            type: 'text', autoWidth: true, textOverflow: 'clip', textWrap: true,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expectLastUsedUnchanged('false');
    });

    it('uses canonical defaults for drag-created text', () => {
        seedLastUsed('false');
        const dragText = createElement('text', { x: 200, y: 200 });

        expect(dragText).toMatchObject({
            type: 'text', textOverflow: 'clip', textWrap: true,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expectLastUsedUnchanged('false');
    });

    it('uses canonical defaults for drag-created grids', () => {
        seedLastUsed('true');
        const dragGrid = createElement('grid', { x: 200, y: 200 });

        expect(dragGrid).toMatchObject({
            type: 'grid', textOverflow: 'clip', textWrap: false,
        });
        expect(dragGrid).not.toHaveProperty('textPadding');
        expectLastUsedUnchanged('true');
    });

    it('does not add text overflow settings to shape elements', () => {
        seedLastUsed('true');
        const dragRect = createElement('rect', { x: 200, y: 200 });

        expect(dragRect).not.toHaveProperty('textOverflow');
        expect(dragRect).not.toHaveProperty('textWrap');
        expect(dragRect).not.toHaveProperty('textPadding');
        expectLastUsedUnchanged('true');
    });
});
