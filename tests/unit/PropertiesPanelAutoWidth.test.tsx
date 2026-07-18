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
    clipboard: [], schemaVersion: 10,
});

const callbacks = () => ({
    onUpdateElements: vi.fn(), onUpdateNode: vi.fn(), onDeleteElements: vi.fn(),
    onOpenNodeSelector: vi.fn(), onUpdateTemplate: vi.fn(),
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('PropertiesPanel Auto width', () => {
    it('disables auto-width without changing geometry or unrelated fields', () => {
        const element = text('auto', {
            autoWidth: true, w: 187.5, h: 32.25,
            textPadding: { top: 1, right: 2, bottom: 3, left: 4 },
        });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([element], ['auto'])} activePreviewNode={activeNode} {...props} />);

        fireEvent.click(screen.getByLabelText('Auto width'));

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...element, autoWidth: false },
        ], true);
    });

    it('measures active-node preview text independently in one history update', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
            return (this.textContent || '').length * 10;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
        const literal = text('literal', { text: 'A', autoWidth: false, w: 300, h: 80 });
        const bound = text('bound', {
            text: 'ignored', dataBinding: 'label', autoWidth: false, w: 20, h: 10,
            fontFamily: 'open-sans', fontWeight: 'bold',
        });
        const props = callbacks();
        render(<PropertiesPanel
            state={stateFor([literal, bound], ['literal', 'bound'])}
            activePreviewNode={activeNode}
            {...props}
        />);

        fireEvent.click(screen.getByLabelText('Auto width'));

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...literal, autoWidth: true, w: 35, h: 20 },
            { ...bound, autoWidth: true, w: 155, h: 20 },
        ], true);
    });

    it('exposes native mixed state and one activation enables every text element', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(20);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(15);
        const enabled = text('enabled', { autoWidth: true });
        const disabled = text('disabled', { autoWidth: undefined });
        const props = callbacks();
        render(<PropertiesPanel
            state={stateFor([enabled, disabled], ['enabled', 'disabled'])}
            activePreviewNode={activeNode}
            {...props}
        />);
        const checkbox = screen.getByLabelText('Auto width') as HTMLInputElement;

        expect(checkbox.indeterminate).toBe(true);
        expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
        fireEvent.click(checkbox);

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements.mock.calls[0][0]).toEqual([
            { ...enabled, autoWidth: true, w: 45, h: 20 },
            { ...disabled, autoWidth: true, w: 45, h: 20 },
        ]);
        expect(props.onUpdateElements.mock.calls[0][1]).toBe(true);
    });

    it('enables mode after failures while preserving or repairing each prior box', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => {
            throw new Error('measurement unavailable');
        });
        const valid = text('valid', { autoWidth: false, w: 88, h: 33 });
        const invalid = text('invalid', { autoWidth: false, w: Number.NaN, h: 0, fontSize: 14 });
        const props = callbacks();
        render(<PropertiesPanel
            state={stateFor([valid, invalid], ['valid', 'invalid'])}
            activePreviewNode={activeNode}
            {...props}
        />);

        fireEvent.click(screen.getByLabelText('Auto width'));

        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...valid, autoWidth: true, w: 88, h: 33 },
            { ...invalid, autoWidth: true, w: 14, h: 21 },
        ], true);
    });

    it('hides the toggle for grids, shape captions, SVG, and mixed types', () => {
        const rectangle = text('caption', { type: 'rect', text: 'caption' });
        const grid = text('grid', {
            type: 'grid', text: undefined,
            gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
        });
        const svg = text('svg', { type: 'svg', text: undefined, svgContent: '<svg></svg>' });
        const literal = text('literal');
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([grid], ['grid'])} {...props} />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor([rectangle], ['caption'])} {...props} />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor([svg], ['svg'])} {...props} />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
        view.rerender(<PropertiesPanel
            state={stateFor([literal, rectangle], ['literal', 'caption'])}
            {...props}
        />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
    });

    it('immediately follows parent state for checkbox and overflow controls', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(20);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(15);
        const fixed = text('fixed', { autoWidth: false });
        const props = callbacks();
        const view = render(<PropertiesPanel
            state={stateFor([fixed], ['fixed'])}
            activePreviewNode={activeNode}
            {...props}
        />);
        fireEvent.click(screen.getByLabelText('Auto width'));
        const [updated] = props.onUpdateElements.mock.calls[0][0];
        view.rerender(<PropertiesPanel
            state={stateFor([updated], ['fixed'])}
            activePreviewNode={activeNode}
            {...props}
        />);

        expect(screen.getByLabelText('Auto width')).toBeChecked();
        expect(screen.getByLabelText('Overflow')).toBeDisabled();
        expect(screen.getByLabelText('Wrap')).toBeDisabled();
    });
});
