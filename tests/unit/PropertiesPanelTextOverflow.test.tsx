import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from '../../components/PropertiesPanel';
import type { AppState, TemplateElement } from '../../types';

const textElement: TemplateElement = {
    id: 'text', type: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'Content',
    textOverflow: 'clip', textWrap: true,
};

const state: AppState = {
    nodes: {}, rootId: '', variants: {
        default: {
            id: 'default', name: 'Default', templates: {
                page: {
                    id: 'page', name: 'Page', width: 500, height: 700,
                    elements: [textElement],
                },
            },
        },
    },
    activeVariantId: 'default', viewMode: 'templates', selectedNodeId: '', selectedNodeIds: [],
    selectedTemplateId: 'page', selectedTemplateIds: [], selectedElementIds: ['text'], scale: 1,
    tool: 'select', showJsonModal: false, sidebarWidth: 240, propertiesPanelWidth: 300,
    snapToGrid: false, showGrid: false, showNodeSelector: false, nodeSelectorMode: 'grid_source',
    editingElementId: null, clipboard: [],
};

describe('PropertiesPanel text overflow history', () => {
    it('sends one changed element and one history update per control change without creating fontSize', () => {
        const onUpdateElements = vi.fn();
        render(
            <PropertiesPanel
                state={state}
                onUpdateElements={onUpdateElements}
                onUpdateNode={vi.fn()}
                onDeleteElements={vi.fn()}
                onOpenNodeSelector={vi.fn()}
                onUpdateTemplate={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByLabelText('Overflow'), { target: { value: 'shrink' } });
        expect(onUpdateElements).toHaveBeenCalledTimes(1);
        expect(onUpdateElements).toHaveBeenLastCalledWith([
            { ...textElement, textOverflow: 'shrink' },
        ], true);

        fireEvent.click(screen.getByLabelText('Wrap'));
        expect(onUpdateElements).toHaveBeenCalledTimes(2);
        expect(onUpdateElements).toHaveBeenLastCalledWith([
            { ...textElement, textWrap: false },
        ], true);
        for (const [elements, saveHistory] of onUpdateElements.mock.calls) {
            expect(elements).toHaveLength(1);
            expect(elements[0]).not.toHaveProperty('fontSize');
            expect(saveHistory).toBe(true);
        }
    });

    it('preserves an existing fontSize exactly in one saved change per overflow control update', () => {
        const onUpdateElements = vi.fn();
        const sizedElement = { ...textElement, fontSize: 13.75 };
        const sizedState: AppState = {
            ...state,
            variants: {
                default: {
                    ...state.variants.default,
                    templates: {
                        page: {
                            ...state.variants.default.templates.page,
                            elements: [sizedElement],
                        },
                    },
                },
            },
        };
        render(
            <PropertiesPanel
                state={sizedState}
                onUpdateElements={onUpdateElements}
                onUpdateNode={vi.fn()}
                onDeleteElements={vi.fn()}
                onOpenNodeSelector={vi.fn()}
                onUpdateTemplate={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByLabelText('Overflow'), { target: { value: 'ellipsis' } });
        fireEvent.click(screen.getByLabelText('Wrap'));

        expect(onUpdateElements.mock.calls).toEqual([
            [[{ ...sizedElement, textOverflow: 'ellipsis' }], true],
            [[{ ...sizedElement, textWrap: false }], true],
        ]);
        for (const [elements] of onUpdateElements.mock.calls) {
            expect(elements[0].fontSize).toBe(13.75);
        }
    });
});
