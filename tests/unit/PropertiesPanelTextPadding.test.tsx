import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from '../../components/PropertiesPanel';
import type { AppNode, AppState, TemplateElement } from '../../types';

const activeNode: AppNode = {
    id: 'root', parentId: null, type: 'page', title: 'Root',
    data: { label: 'BOUND PREVIEW' }, children: [],
};

const text = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'text', x: 5, y: 7, w: 100, h: 40, rotation: 13,
    transformOrigin: { x: 0.25, y: 0.75 }, fill: '', stroke: '', strokeWidth: 0,
    opacity: 0.8, text: id, fontSize: 14, fontFamily: 'helvetica',
    textOverflow: 'clip', textWrap: true, ...overrides,
});

const stateFor = (elements: TemplateElement[], selectedElementIds: string[]): AppState => ({
    nodes: { root: activeNode }, rootId: 'root', variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements },
        } },
    },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds, scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 240, propertiesPanelWidth: 300, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [], schemaVersion: 11,
});

const callbacks = () => ({
    onUpdateElements: vi.fn(), onUpdateNode: vi.fn(), onDeleteElements: vi.fn(),
    onOpenNodeSelector: vi.fn(), onUpdateTemplate: vi.fn(),
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('PropertiesPanel text padding', () => {
    it('applies one linked decimal to all sides in one saved update', () => {
        const source = text('one', { autoWidth: false, textPadding: { top: 0, right: 0, bottom: 0, left: 0 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

        expect(screen.getByLabelText('Link padding sides')).toBeChecked();
        fireEvent.change(screen.getByLabelText('Padding top'), { target: { value: '7.5' } });

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements).toHaveBeenCalledWith([{
            ...source,
            textPadding: { top: 7.5, right: 7.5, bottom: 7.5, left: 7.5 },
        }], true);
    });

    it('applies a linked mixed multi-selection edit to every side in one saved update', () => {
        const first = text('first', { autoWidth: false, textPadding: { top: 1, right: 2, bottom: 3, left: 4 } });
        const second = text('second', { autoWidth: false, textPadding: { top: 5, right: 6, bottom: 7, left: 8 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);

        fireEvent.change(screen.getByLabelText('Padding left'), { target: { value: '9.25' } });

        const linked = { top: 9.25, right: 9.25, bottom: 9.25, left: 9.25 };
        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...first, textPadding: linked },
            { ...second, textPadding: linked },
        ], true);
        expect(props.onUpdateElements).toHaveBeenCalledOnce();
    });

    it('shows per-side mixed values and preserves every unedited side when unlinked', () => {
        const first = text('first', { autoWidth: false, textPadding: { top: 1, right: 2, bottom: 3, left: 4 } });
        const second = text('second', { autoWidth: false, textPadding: { top: 1, right: 8, bottom: 9, left: 4 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);

        expect(screen.getByLabelText('Padding top')).toHaveValue(1);
        expect(screen.getByLabelText('Padding right')).toHaveValue(null);
        expect(screen.getByLabelText('Padding right')).toHaveAttribute('placeholder', 'Mixed');
        expect(screen.getByLabelText('Padding bottom')).toHaveValue(null);

        fireEvent.click(screen.getByLabelText('Link padding sides'));
        fireEvent.change(screen.getByLabelText('Padding right'), { target: { value: '6.5' } });

        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...first, textPadding: { top: 1, right: 6.5, bottom: 3, left: 4 } },
            { ...second, textPadding: { top: 1, right: 6.5, bottom: 9, left: 4 } },
        ], true);
    });

    it('disables padding for all-auto and mixed fixed/auto text selections', () => {
        const fixed = text('fixed', { autoWidth: false });
        const auto = text('auto', { autoWidth: true });
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([auto], ['auto'])} {...props} />);
        expect(screen.getByLabelText('Padding top')).toBeDisabled();
        expect(screen.getByText('Padding applies only to fixed-size text.')).toBeVisible();

        view.rerender(<PropertiesPanel state={stateFor([fixed, auto], ['fixed', 'auto'])} {...props} />);
        expect(screen.getByLabelText('Padding top')).toBeDisabled();
    });

    it('ignores blank drafts and clamps accepted negative values to zero', () => {
        const source = text('one', { autoWidth: false, textPadding: { top: 2, right: 2, bottom: 2, left: 2 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);
        const top = screen.getByLabelText('Padding top');

        fireEvent.change(top, { target: { value: '' } });
        expect(props.onUpdateElements).not.toHaveBeenCalled();
        fireEvent.change(top, { target: { value: '-3' } });
        expect(props.onUpdateElements).toHaveBeenCalledWith([{
            ...source,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        }], true);
    });

    it('resets linked UI state when the selected ID set changes without recording history', () => {
        const first = text('first', { autoWidth: false });
        const second = text('second', { autoWidth: false });
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([first, second], ['first'])} {...props} />);
        const link = screen.getByLabelText('Link padding sides');
        fireEvent.click(link);
        expect(link).not.toBeChecked();

        view.rerender(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);
        expect(screen.getByLabelText('Link padding sides')).toBeChecked();
        expect(props.onUpdateElements).not.toHaveBeenCalled();
    });

    it('does not expose padding controls for grids, shape captions, or mixed types', () => {
        const literal = text('text');
        const caption = text('caption', { type: 'rect' });
        const grid = text('grid', {
            type: 'grid',
            text: undefined,
            gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
        });
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([grid], ['grid'])} {...props} />);
        expect(screen.queryByTestId('text-padding-controls')).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor([caption], ['caption'])} {...props} />);
        expect(screen.queryByTestId('text-padding-controls')).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor([literal, caption], ['text', 'caption'])} {...props} />);
        expect(screen.queryByTestId('text-padding-controls')).toBeNull();
    });
});
