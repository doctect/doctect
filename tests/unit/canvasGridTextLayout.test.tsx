import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import type { CanvasTextLayoutSession } from '../../services/canvasTextLayout';
import type { TextLayoutRequest, TextLayoutResult } from '../../services/textLayout';
import type { AppNode, TemplateElement } from '../../types';

const nodes: Record<string, AppNode> = {
    root: {
        id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['group'],
    },
    group: {
        id: 'group', parentId: 'root', type: 'page', title: 'Group', data: {}, children: ['short', 'long', 'empty'],
    },
    short: {
        id: 'short', parentId: 'group', type: 'page', title: 'Short', data: { label: 'SHORT' }, children: [],
    },
    long: {
        id: 'long', parentId: 'group', type: 'page', title: 'Long', data: { label: 'A MUCH LONGER LABEL' }, children: [],
    },
    empty: {
        id: 'empty', parentId: 'group', type: 'page', title: 'Empty', data: { label: '' }, children: [],
    },
};

const gridElement = (overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id: 'grid',
    type: 'grid',
    x: 12,
    y: 14,
    w: 100,
    h: 40,
    rotation: 23,
    fill: '#111111',
    stroke: '#123456',
    strokeWidth: 4,
    borderStyle: 'solid',
    borderRadius: 8,
    opacity: 0.8,
    fontSize: 16,
    fontFamily: 'open-sans',
    fontWeight: 'normal',
    fontStyle: 'italic',
    textDecoration: 'underline',
    textColor: '#101010',
    align: 'right',
    verticalAlign: 'bottom',
    linkTarget: 'url',
    linkValue: 'https://example.com',
    textOverflow: 'shrink',
    textWrap: false,
    gridConfig: {
        cols: 2,
        gapX: 2,
        gapY: 1,
        sourceType: 'current',
        displayField: 'label',
        traversalPath: [{}, {}],
        offsetStart: 1,
        showEmptyCellBorders: true,
        gridBorderMode: 'all',
        gridBorderWidth: 2,
        gridBorderColor: '#00aa00',
        gridBorderStyle: 'dashed',
        gridBorderRadius: 6,
        headerRow: true,
        headerRowFill: '#222222',
        headerRowTextColor: '#aaaaaa',
        headerRowFontWeight: 'bold',
        firstColumn: true,
        firstColumnFill: '#333333',
        firstColumnTextColor: '#bbbbbb',
        firstColumnFontWeight: 'normal',
        alternateRows: true,
        alternateRowFill: '#444444',
        alternateColumns: true,
        alternateColumnFill: '#555555',
    },
    ...overrides,
});

const props = {
    selected: false,
    nodes,
    currentNodeId: 'root',
    tool: 'select',
    showHandles: false,
};

function layoutResult(request: TextLayoutRequest): TextLayoutResult {
    const effectiveFontSize = request.text === 'SHORT' ? 11 : 7;
    return {
        lines: [{ text: request.text, width: 30, x: 4, top: 5, baseline: 13 }],
        effectiveFontSize,
        lineHeight: effectiveFontSize * 1.2,
        blockHeight: effectiveFontSize * 1.2,
        truncated: request.textOverflow === 'ellipsis',
        requiresClip: request.textOverflow !== 'visible',
    };
}

function createLayoutSession() {
    const layout = vi.fn((request: TextLayoutRequest) => layoutResult(request));
    const session: CanvasTextLayoutSession = { layout, clear: vi.fn() };
    return { layout, session };
}

describe('Canvas grid text layout', () => {
    it.each([
        ['clip', false],
        ['clip', true],
        ['ellipsis', false],
        ['ellipsis', true],
        ['shrink', false],
        ['shrink', true],
        ['visible', false],
        ['visible', true],
    ] as const)('lays out each visible cell independently for %s with wrap=%s', (textOverflow, textWrap) => {
        const fake = createLayoutSession();
        const element = gridElement({ textOverflow, textWrap });
        const { container } = render(
            <CanvasElement element={element} textLayoutSession={fake.session} {...props} />,
        );

        expect(fake.layout).toHaveBeenCalledTimes(2);
        expect(fake.layout.mock.calls.map(([request]) => request)).toEqual([
            {
                text: 'SHORT',
                contentWidth: 98,
                contentHeight: 40,
                fontSize: 16,
                fontFamily: 'open-sans',
                fontWeight: 'bold',
                fontStyle: 'italic',
                textOverflow,
                textWrap,
                align: 'right',
                verticalAlign: 'bottom',
            },
            {
                text: 'A MUCH LONGER LABEL',
                contentWidth: 98,
                contentHeight: 40,
                fontSize: 16,
                fontFamily: 'open-sans',
                fontWeight: 'normal',
                fontStyle: 'italic',
                textOverflow,
                textWrap,
                align: 'right',
                verticalAlign: 'bottom',
            },
        ]);

        const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-grid-cell]'));
        expect(cells).toHaveLength(3);
        const shortBox = cells[0].querySelector<HTMLElement>('[data-grid-cell-text]')!;
        const longBox = cells[1].querySelector<HTMLElement>('[data-grid-cell-text]')!;
        expect(shortBox).toHaveStyle({
            left: '1px', top: '0px', width: '98px', height: '40px',
            overflow: textOverflow === 'visible' ? 'visible' : 'hidden',
            color: '#aaaaaa', fontWeight: 'bold', pointerEvents: 'none',
        });
        expect(longBox).toHaveStyle({ color: '#bbbbbb', fontWeight: 'normal' });
        expect(shortBox.querySelector('[data-text-layout-line]')).toHaveStyle({
            left: '4px', top: '5px', fontSize: '11px', lineHeight: '13.2px', whiteSpace: 'pre',
        });
        expect(longBox.querySelector('[data-text-layout-line]')).toHaveStyle({
            fontSize: '7px', lineHeight: '8.4px',
        });
        expect(cells[2].querySelector('[data-grid-cell-text]')).toBeNull();
        expect(element.fontSize).toBe(16);
        expect(container.querySelector('.truncate')).toBeNull();
    });

    it('keeps traversal, style priority, full-cell geometry, empty cells, links, rotation, and outer-border order', () => {
        const fake = createLayoutSession();
        const element = gridElement();
        const { container } = render(
            <CanvasElement element={element} textLayoutSession={fake.session} {...props} />,
        );

        const outer = container.querySelector<HTMLElement>('[data-element-id="grid"]')!;
        const cells = Array.from(outer.querySelectorAll<HTMLElement>('[data-grid-cell]'));
        expect(outer).toHaveStyle({
            width: '202px', height: '81px',
            transform: 'translate(12px, 14px) rotate(23deg)',
        });
        expect(container.querySelectorAll('[style*="rotate(23deg)"]')).toHaveLength(1);

        const offsetCell = outer.firstElementChild as HTMLElement;
        expect(offsetCell).toHaveStyle({
            left: '0px', top: '0px', width: '100px', height: '40px',
        });
        expect(offsetCell.style.backgroundColor).toBe('transparent');
        expect(offsetCell.style.borderRadius).toBe('6px');
        expect(offsetCell.style.borderTop).toContain('2px dashed');
        expect(cells[0]).toHaveStyle({
            left: '102px', top: '0px', width: '100px', height: '40px',
            backgroundColor: '#222222', borderRadius: '6px',
            borderTop: '2px dashed #00aa00',
        });
        expect(cells[1]).toHaveStyle({
            left: '0px', top: '41px', width: '100px', height: '40px',
            backgroundColor: '#333333',
        });
        expect(cells[2]).toHaveStyle({ backgroundColor: '#555555' });
        expect(cells[0].style.pointerEvents).not.toBe('none');
        expect(cells[0].querySelector<HTMLElement>('[data-grid-cell-text]')).toHaveStyle({ pointerEvents: 'none' });

        const outerBorder = outer.lastElementChild as HTMLElement;
        expect(outerBorder).toHaveStyle({
            position: 'absolute', width: '100%', height: '100%',
            border: '4px solid #123456', borderRadius: '8px', pointerEvents: 'none',
        });
        expect(outerBorder.previousElementSibling).toBe(cells[2]);
        expect(fake.layout.mock.calls.map(([request]) => request.text)).toEqual(['SHORT', 'A MUCH LONGER LABEL']);
    });

    it('retains mock cells while laying out each generated label explicitly', () => {
        const fake = createLayoutSession();
        const mockNodes: Record<string, AppNode> = {
            root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
        };
        const element = gridElement({
            gridConfig: {
                cols: 3, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title',
                gridBorderMode: 'none', gridBorderWidth: 0, gridBorderColor: '', gridBorderStyle: 'none',
            },
        });
        const { container } = render(
            <CanvasElement
                element={element}
                textLayoutSession={fake.session}
                {...props}
                nodes={mockNodes}
            />,
        );

        expect(fake.layout.mock.calls.map(([request]) => request.text)).toEqual([
            'Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6',
        ]);
        expect(container.querySelectorAll('[data-grid-cell]')).toHaveLength(6);
        expect(container.querySelectorAll('[data-text-layout-line]')).toHaveLength(6);
    });
});
