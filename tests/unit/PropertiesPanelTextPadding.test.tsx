import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('PropertiesPanel text padding', () => {
    it('renders one compact four-side row below the text alignment controls', () => {
        const source = text('one', { autoWidth: false });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

        const controls = screen.getByTestId('text-padding-controls');
        const alignLeft = screen.getByTitle('Align Left');
        const alignmentRow = alignLeft.parentElement?.parentElement;
        expect(alignLeft.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(alignmentRow?.nextElementSibling).toBe(controls);
        const inputs = within(controls).getAllByRole('spinbutton');
        expect(inputs).toHaveLength(4);
        inputs.forEach(input => expect(input).toHaveClass('pr-5'));
        expect(within(controls).getByText('T')).toBeVisible();
        expect(within(controls).getByText('R')).toBeVisible();
        expect(within(controls).getByText('B')).toBeVisible();
        expect(within(controls).getByText('L')).toBeVisible();
    });

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

    it('increments the selected side by one and applies it through linked mode', () => {
        const source = text('one', { autoWidth: false, textPadding: { top: 2, right: 4, bottom: 6, left: 8 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

        const increase = screen.getByLabelText('Increase top padding');
        fireEvent.mouseDown(increase);
        fireEvent.mouseUp(increase);

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements).toHaveBeenCalledWith([{
            ...source,
            textPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        }], true);
    });

    it('supports keyboard increments through the number input', () => {
        const source = text('one', { autoWidth: false, textPadding: { top: 2, right: 4, bottom: 6, left: 8 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

        fireEvent.keyDown(screen.getByLabelText('Padding top'), { key: 'ArrowUp' });

        expect(props.onUpdateElements).toHaveBeenCalledWith([{
            ...source,
            textPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        }], true);
    });

    it('supports click activation for assistive technology', () => {
        const source = text('one', { autoWidth: false, textPadding: { top: 2, right: 4, bottom: 6, left: 8 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

        fireEvent.click(screen.getByLabelText('Increase top padding'), { detail: 0 });

        expect(props.onUpdateElements).toHaveBeenCalledWith([{
            ...source,
            textPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        }], true);
    });

    it('treats a mixed value as zero when incrementing and clamps decrement at zero when unlinked', () => {
        const first = text('first', { autoWidth: false, textPadding: { top: 2, right: 0, bottom: 3, left: 4 } });
        const second = text('second', { autoWidth: false, textPadding: { top: 5, right: 0, bottom: 7, left: 8 } });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);
        fireEvent.click(screen.getByLabelText('Link padding sides'));

        fireEvent.mouseDown(screen.getByLabelText('Increase top padding'));
        fireEvent.mouseUp(screen.getByLabelText('Increase top padding'));
        expect(props.onUpdateElements).toHaveBeenLastCalledWith([
            { ...first, textPadding: { top: 1, right: 0, bottom: 3, left: 4 } },
            { ...second, textPadding: { top: 1, right: 0, bottom: 7, left: 8 } },
        ], true);

        fireEvent.mouseDown(screen.getByLabelText('Decrease right padding'));
        fireEvent.mouseUp(screen.getByLabelText('Decrease right padding'));
        expect(props.onUpdateElements).toHaveBeenLastCalledWith([first, second], true);
    });

    it('repeats increments while held and stops the timer when unmounted', () => {
        vi.useFakeTimers();
        const source = text('one', { autoWidth: false, textPadding: { top: 0, right: 0, bottom: 0, left: 0 } });
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

        fireEvent.mouseDown(screen.getByLabelText('Increase top padding'));
        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        act(() => vi.advanceTimersByTime(400));
        expect(props.onUpdateElements).toHaveBeenCalledTimes(3);
        expect(props.onUpdateElements).toHaveBeenLastCalledWith([{
            ...source,
            textPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        }], true);

        view.unmount();
        act(() => vi.advanceTimersByTime(500));
        expect(props.onUpdateElements).toHaveBeenCalledTimes(3);
    });

    it('uses the latest commit callback while a held increment repeats', () => {
        vi.useFakeTimers();
        const source = text('one', { autoWidth: false, textPadding: { top: 0, right: 0, bottom: 0, left: 0 } });
        const firstProps = callbacks();
        const nextProps = callbacks();
        const state = stateFor([source], ['one']);
        const view = render(<PropertiesPanel state={state} {...firstProps} />);

        fireEvent.mouseDown(screen.getByLabelText('Increase top padding'));
        expect(firstProps.onUpdateElements).toHaveBeenCalledOnce();
        view.rerender(<PropertiesPanel state={state} {...nextProps} />);
        act(() => vi.advanceTimersByTime(400));

        expect(firstProps.onUpdateElements).toHaveBeenCalledOnce();
        expect(nextProps.onUpdateElements).toHaveBeenCalledTimes(2);
        fireEvent.mouseUp(screen.getByLabelText('Increase top padding'));
    });

    it('stops held repeats on mouse release and mouse leave', () => {
        vi.useFakeTimers();
        const source = text('one', { autoWidth: false });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);
        const increase = screen.getByLabelText('Increase top padding');

        fireEvent.mouseDown(increase);
        fireEvent.mouseUp(increase);
        act(() => vi.advanceTimersByTime(500));
        expect(props.onUpdateElements).toHaveBeenCalledOnce();

        fireEvent.mouseDown(increase);
        fireEvent.mouseLeave(increase);
        act(() => vi.advanceTimersByTime(500));
        expect(props.onUpdateElements).toHaveBeenCalledTimes(2);
    });

    it('stops a held repeat when the selected element set changes', () => {
        vi.useFakeTimers();
        const first = text('first', { autoWidth: false });
        const second = text('second', { autoWidth: false });
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([first, second], ['first'])} {...props} />);

        fireEvent.mouseDown(screen.getByLabelText('Increase top padding'));
        view.rerender(<PropertiesPanel state={stateFor([first, second], ['second'])} {...props} />);
        act(() => vi.advanceTimersByTime(500));

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
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
        expect(screen.getByLabelText('Increase top padding')).toBeDisabled();
        expect(screen.getByLabelText('Decrease top padding')).toBeDisabled();
        const controls = screen.getByTestId('text-padding-controls');
        const tooltip = screen.getByRole('tooltip');
        expect(controls).toHaveAttribute('tabindex', '0');
        expect(controls).toHaveAttribute('aria-describedby', tooltip.id);
        expect(controls).toHaveClass('focus-visible:ring-2');
        expect(screen.getByText('T').closest('label')).toHaveClass('focus-within:ring-1');
        expect(tooltip).toHaveTextContent('Padding applies only to fixed-size text. Turn off Auto width to edit it.');
        expect(tooltip).toHaveClass('group-hover:opacity-100', 'group-focus:opacity-100');

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
