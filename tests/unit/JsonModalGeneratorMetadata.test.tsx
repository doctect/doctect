import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonModal } from '../../components/JsonModal';

const generator = {
    formatVersion: 1 as const,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};

const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 9,
};

const renderModal = (currentState: any) => {
    const props = { isOpen: true, currentState, onSave: vi.fn(), onClose: vi.fn() };
    render(<JsonModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    return props;
};

describe('JsonModal generator metadata imports', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves valid scripts byte-for-byte', () => {
        const props = renderModal({ ...state, generator });
        fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

        expect(props.onSave).toHaveBeenCalledOnce();
        expect(props.onSave.mock.calls[0][0].generator).toEqual(generator);
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('detaches malformed metadata, saves and closes, then alerts once', () => {
        const props = renderModal(state);
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const malformed = { ...state, generator: { ...generator, formatVersion: 2 } };
        fireEvent.change(screen.getByRole('textbox'), { target: { value: JSON.stringify(malformed) } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

        expect(props.onSave).toHaveBeenCalledOnce();
        expect(props.onSave.mock.calls[0][0].generator).toBeUndefined();
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(alert).toHaveBeenCalledOnce();
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('Saved generator was detached'));
        expect(props.onSave.mock.invocationCallOrder[0]).toBeLessThan(props.onClose.mock.invocationCallOrder[0]);
        expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(alert.mock.invocationCallOrder[0]);
    });
});
