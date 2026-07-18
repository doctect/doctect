import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import type { AppNode, TemplateElement } from '../../types';
import { createTestCanvasTextLayoutSession } from './canvasTestUtils';

const nodes: Record<string, AppNode> = {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
};

const makeElement = (type: TemplateElement['type'], fontSize?: number): TemplateElement => {
    const element: TemplateElement = {
        id: `${type}-element`, type, x: 0, y: 0, w: 100, h: 40, rotation: 0,
        fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'VISIBLE_TEXT',
        gridConfig: type === 'grid'
            ? { cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title' }
            : undefined,
    };
    if (fontSize !== undefined) element.fontSize = fontSize;
    return element;
};

const renderElement = (element: TemplateElement) => render(
    <CanvasElement
        element={element}
        selected={false}
        nodes={nodes}
        currentNodeId="root"
        tool="select"
        showHandles={false}
        textLayoutSession={createTestCanvasTextLayoutSession()}
    />,
);

describe.each(['text', 'triangle'] as const)('CanvasElement %s font visibility', type => {
    it('renders missing font size at 12px', () => {
        const { getByText } = renderElement(makeElement(type));

        expect(getByText('VISIBLE_TEXT')).toHaveStyle({ fontSize: '12px' });
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['NaN', Number.NaN],
        ['positive infinity', Number.POSITIVE_INFINITY],
        ['negative infinity', Number.NEGATIVE_INFINITY],
    ])('does not render text for explicit %s font size', (_, fontSize) => {
        const { queryByText } = renderElement(makeElement(type, fontSize));

        expect(queryByText('VISIBLE_TEXT')).toBeNull();
    });
});

describe('CanvasElement grid label font visibility', () => {
    it('renders missing font size at 12px', () => {
        const { getAllByText } = renderElement(makeElement('grid'));

        expect(getAllByText('Item 1')[0].parentElement).toHaveStyle({ fontSize: '12px' });
    });

    it('does not pass an invalid font size to React styles', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        renderElement(makeElement('grid', Number.POSITIVE_INFINITY));

        expect(consoleError).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['NaN', Number.NaN],
        ['positive infinity', Number.POSITIVE_INFINITY],
        ['negative infinity', Number.NEGATIVE_INFINITY],
    ])('does not render labels for explicit %s font size', (_, fontSize) => {
        const { queryByText } = renderElement(makeElement('grid', fontSize));

        expect(queryByText('Item 1')).toBeNull();
    });
});
