import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from '../../components/PropertiesPanel';
import type { AppState, TemplateElement } from '../../types';

const text: TemplateElement = {
    id: 'text', type: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'Text',
    autoWidth: false, fontSize: 12,
};
const autoWidthText: TemplateElement = {
    ...text, id: 'auto-width-text', autoWidth: true,
};
const emptyText: TemplateElement = {
    ...text, id: 'empty-text', text: '',
};
const grid: TemplateElement = {
    ...text, id: 'grid', type: 'grid', text: undefined,
    gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
};
const svg: TemplateElement = {
    ...text, id: 'svg', type: 'svg', text: undefined,
    svgContent: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

const stateFor = (selectedElementIds: string[]): AppState => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root', variants: { default: { id: 'default', name: 'Default', templates: {
        page: {
            id: 'page', name: 'Page', width: 500, height: 700,
            elements: [text, autoWidthText, emptyText, grid, svg],
        },
    } } },
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

afterEach(() => vi.restoreAllMocks());

describe('PropertiesPanel element section disclosure', () => {
    it('starts every applicable section expanded and hides only the activated body', () => {
        const props = callbacks();
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        for (const title of ['Geometry', 'Appearance', 'Typography', 'Interaction']) {
            expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'true');
        }

        const geometry = screen.getByRole('button', { name: 'Geometry' });
        geometry.focus();
        fireEvent.click(geometry);
        expect(geometry).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('geometry-section-body')).toBeNull();
        expect(screen.getByTestId('appearance-section-body')).toBeVisible();
        expect(geometry).toHaveFocus();
        expect(props.onUpdateElements).not.toHaveBeenCalled();
        expect(props.onUpdateNode).not.toHaveBeenCalled();
        expect(props.onUpdateTemplate).not.toHaveBeenCalled();
        expect(props.onOpenNodeSelector).not.toHaveBeenCalled();
        expect(props.onDeleteElements).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
    });

    it('retains ordinary and conditional choices across selection changes', () => {
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor(['grid'])} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Geometry' }));
        fireEvent.click(screen.getByRole('button', { name: 'Grid Configuration' }));

        view.rerender(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        expect(screen.getByRole('button', { name: 'Geometry' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: 'Grid Configuration' })).toBeNull();

        view.rerender(<PropertiesPanel state={stateFor(['grid'])} {...props} />);
        expect(screen.getByRole('button', { name: 'Grid Configuration' })).toHaveAttribute('aria-expanded', 'false');

        view.rerender(<PropertiesPanel state={stateFor(['svg'])} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));
        view.rerender(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        expect(screen.queryByRole('button', { name: 'SVG Source' })).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor(['svg'])} {...props} />);
        expect(screen.getByRole('button', { name: 'SVG Source' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('restores the native mixed auto-width state after Typography reopens', () => {
        const props = callbacks();
        render(<PropertiesPanel state={stateFor(['text', 'auto-width-text'])} {...props} />);
        expect(screen.getByLabelText('Auto width')).toHaveProperty('indeterminate', true);

        const typography = screen.getByRole('button', { name: 'Typography' });
        fireEvent.click(typography);
        fireEvent.click(typography);

        const checkbox = screen.getByLabelText('Auto width') as HTMLInputElement;
        expect(checkbox.indeterminate).toBe(true);
        expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
        expect(props.onUpdateElements).not.toHaveBeenCalled();
    });

    it('autofocuses newly selected empty text once and keeps focus on Typography when reopened', () => {
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([])} {...props} />);
        expect(screen.queryByPlaceholderText('Text content or {{field}}')).toBeNull();

        view.rerender(<PropertiesPanel state={stateFor(['empty-text'])} {...props} />);
        expect(screen.getByPlaceholderText('Text content or {{field}}')).toHaveFocus();

        const typography = screen.getByRole('button', { name: 'Typography' });
        typography.focus();
        fireEvent.click(typography);
        fireEvent.click(typography);

        expect(screen.getByPlaceholderText('Text content or {{field}}')).not.toHaveFocus();
        expect(typography).toHaveFocus();
        expect(props.onUpdateElements).not.toHaveBeenCalled();
    });

    it('keeps focus on collapsed Typography when an empty text selection is opened', () => {
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        const typography = screen.getByRole('button', { name: 'Typography' });
        typography.focus();
        fireEvent.click(typography);

        view.rerender(<PropertiesPanel state={stateFor(['empty-text'])} {...props} />);
        const selectedTypography = screen.getByRole('button', { name: 'Typography' });
        expect(selectedTypography).toHaveAttribute('aria-expanded', 'false');
        selectedTypography.focus();

        fireEvent.click(selectedTypography);
        expect(screen.getByPlaceholderText('Text content or {{field}}')).not.toHaveFocus();
        expect(selectedTypography).toHaveFocus();
        expect(props.onUpdateElements).not.toHaveBeenCalled();
    });

    it('resets all choices when PropertiesPanel remounts', () => {
        const props = callbacks();
        const first = render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
        expect(screen.getByRole('button', { name: 'Typography' })).toHaveAttribute('aria-expanded', 'false');
        first.unmount();

        render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        expect(screen.getByRole('button', { name: 'Typography' })).toHaveAttribute('aria-expanded', 'true');
    });
});
