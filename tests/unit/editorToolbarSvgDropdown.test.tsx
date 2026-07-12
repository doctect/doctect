import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorToolbar } from '../../components/EditorToolbar';
import { AppState } from '../../types';

// EditorToolbar only reads these fields; cast keeps the fixture honest about
// what the component actually consumes.
const state = {
    tool: 'select',
    selectedElementIds: [],
    selectedTemplateId: 'tpl1',
    activeVariantId: 'v1',
    variants: { v1: { id: 'v1', name: 'V', templates: {} } },
    viewMode: 'templates',
    templatePreviewNodeId: null,
    selectedNodeId: 'root',
    nodes: {},
    rootId: 'root',
    snapToGrid: false,
    showGrid: false,
    scale: 1,
} as unknown as AppState;

describe('EditorToolbar SVG dropdown', () => {
    it('opens a menu with both SVG actions', () => {
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        expect(screen.getByText('Import SVG file…')).toBeTruthy();
        expect(screen.getByText('Insert placeholder SVG')).toBeTruthy();
    });

    it('fires onInsertSvgPlaceholder and closes the menu', () => {
        const onInsert = vi.fn();
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={onInsert} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        fireEvent.click(screen.getByText('Insert placeholder SVG'));
        expect(onInsert).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Insert placeholder SVG')).toBeNull();
    });

    it('clicks the hidden file input for the import action', () => {
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        fireEvent.click(screen.getByText('Import SVG file…'));
        expect(clickSpy).toHaveBeenCalled();
        clickSpy.mockRestore();
    });

    it('closes on outside click', () => {
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByText('Insert placeholder SVG')).toBeNull();
    });

    it('omits the placeholder item when onInsertSvgPlaceholder is not provided', () => {
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        expect(screen.getByText('Import SVG file…')).toBeTruthy();
        expect(screen.queryByText('Insert placeholder SVG')).toBeNull();
    });
});
