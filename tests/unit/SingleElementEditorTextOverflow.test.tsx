import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SingleElementEditor } from '../../components/properties/SingleElementEditor';
import { resolveTextPadding } from '../../services/textPadding';
import type { AppState, TemplateElement } from '../../types';

const baseElement = (overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id: 'element', type: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'Content', fontSize: 12,
    ...overrides,
});

const state: AppState = {
    nodes: {}, rootId: '', variants: {
        default: {
            id: 'default', name: 'Default', templates: {
                page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] },
            },
        },
    },
    activeVariantId: 'default', viewMode: 'templates', selectedNodeId: '', selectedNodeIds: [],
    selectedTemplateId: 'page', selectedTemplateIds: [], selectedElementIds: ['element'], scale: 1,
    tool: 'select', showJsonModal: false, sidebarWidth: 240, propertiesPanelWidth: 300,
    snapToGrid: false, showGrid: false, showNodeSelector: false, nodeSelectorMode: 'grid_source',
    editingElementId: null, clipboard: [],
};

const sectionExpanded = {
    grid: true, geometry: true, appearance: true,
    typography: true, interaction: true, svgSource: true,
};

function renderEditor(element: TemplateElement) {
    const onUpdate = vi.fn();
    const result = render(
        <SingleElementEditor
            element={element}
            onUpdate={onUpdate}
            onOpenNodeSelector={vi.fn()}
            state={state}
            selectionIsTextOnly={element.type === 'text'}
            autoWidthSelection={element.autoWidth === true}
            textPaddingSelection={element.type === 'text' ? resolveTextPadding(element) : null}
            textPaddingSelectionKey={element.id}
            sectionExpanded={sectionExpanded}
            onToggleSection={vi.fn()}
        />,
    );
    return { ...result, onUpdate };
}

function optionLabels(select: HTMLElement) {
    return within(select).getAllByRole('option').map(option => option.textContent);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SingleElementEditor text overflow controls', () => {
    it('renders fixed-text controls in exact order and sends one normalized field per change', () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const { onUpdate } = renderEditor(baseElement({ textOverflow: 'ellipsis', textWrap: true }));
        const overflow = screen.getByLabelText('Overflow');
        const wrap = screen.getByLabelText('Wrap');

        expect(optionLabels(overflow)).toEqual(['Clip', 'Ellipsis', 'Shrink', 'Visible']);
        expect(overflow).toHaveValue('ellipsis');
        expect(wrap).toBeChecked();
        expect(overflow.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.change(overflow, { target: { value: 'shrink' } });
        expect(onUpdate).toHaveBeenLastCalledWith({ textOverflow: 'shrink' });
        fireEvent.click(wrap);
        expect(onUpdate).toHaveBeenLastCalledWith({ textWrap: false });
        expect(onUpdate).toHaveBeenCalledTimes(2);
        expect(setItem).not.toHaveBeenCalled();
    });

    it('uses grid-specific accessible labels and canonical grid defaults', () => {
        const malformedGrid = baseElement({
            type: 'grid', text: undefined, textOverflow: 'bad' as any, textWrap: 'false' as any,
            gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
        });
        const { onUpdate } = renderEditor(malformedGrid);
        const overflow = screen.getByLabelText('Cell text overflow');
        const wrap = screen.getByLabelText('Wrap cell text');

        expect(optionLabels(overflow)).toEqual(['Clip', 'Ellipsis', 'Shrink', 'Visible']);
        expect(overflow).toHaveValue('clip');
        expect(wrap).not.toBeChecked();
        fireEvent.change(overflow, { target: { value: 'visible' } });
        fireEvent.click(wrap);
        expect(onUpdate.mock.calls).toEqual([
            [{ textOverflow: 'visible' }],
            [{ textWrap: true }],
        ]);
    });

    it('resolves missing fixed-text fields without an undefined option', () => {
        renderEditor(baseElement({ textOverflow: undefined, textWrap: undefined }));

        expect(screen.getByLabelText('Overflow')).toHaveValue('clip');
        expect(screen.getByLabelText('Wrap')).toBeChecked();
        expect(screen.queryByRole('option', { name: /undefined/i })).toBeNull();
    });

    it('disables auto-width controls and shows the exact explanation', () => {
        renderEditor(baseElement({ autoWidth: true, textOverflow: 'visible', textWrap: false }));

        expect(screen.getByLabelText('Overflow')).toBeDisabled();
        expect(screen.getByLabelText('Wrap')).toBeDisabled();
        expect(screen.getByText(
            'Auto-width text sizes to content; overflow and wrap apply only to fixed-size text.',
        )).toBeVisible();
    });

    it('does not expose overflow controls for shape captions', () => {
        renderEditor(baseElement({ type: 'rect', text: 'Shape caption' }));

        expect(screen.queryByLabelText('Overflow')).toBeNull();
        expect(screen.queryByLabelText('Wrap')).toBeNull();
        expect(screen.queryByLabelText('Cell text overflow')).toBeNull();
        expect(screen.queryByLabelText('Wrap cell text')).toBeNull();
    });
});
