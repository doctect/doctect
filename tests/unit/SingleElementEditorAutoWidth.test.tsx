import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SingleElementEditor } from '../../components/properties/SingleElementEditor';
import * as autoWidthText from '../../services/autoWidthText';
import type { AppNode, AppState, TemplateElement } from '../../types';

const activeNode: AppNode = {
    id: 'root', parentId: null, type: 'page', title: 'Root',
    data: { label: 'Bound preview' }, children: [],
};

const state = {
    nodes: { root: activeNode }, rootId: 'root', variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] },
        } },
    },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds: ['text'], scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 240, propertiesPanelWidth: 300, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [],
} as AppState;

const element: TemplateElement = {
    id: 'text', type: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'Literal',
    autoWidth: true, fontSize: 12,
};

afterEach(() => vi.restoreAllMocks());

describe('SingleElementEditor auto-width text edits', () => {
    it('resolves the next preview value and delegates dimensions to the shared helper', () => {
        const measure = vi.spyOn(autoWidthText, 'measureAutoWidthText')
            .mockReturnValue({ w: 151, h: 24 });
        const onUpdate = vi.fn();
        render(<SingleElementEditor
            element={element}
            onUpdate={onUpdate}
            onOpenNodeSelector={vi.fn()}
            state={state}
            selectionIsTextOnly={element.type === 'text'}
            autoWidthSelection={element.autoWidth === true}
            activeNode={activeNode}
        />);

        fireEvent.change(screen.getByPlaceholderText('Text content or {{field}}'), {
            target: { value: '{{label}}' },
        });

        expect(measure).toHaveBeenCalledWith(
            'Bound preview',
            expect.objectContaining({ dataBinding: 'label', text: '', fontSize: 12 }),
        );
        expect(onUpdate).toHaveBeenCalledWith({
            text: '', dataBinding: 'label', w: 151, h: 24,
        });
    });
});
