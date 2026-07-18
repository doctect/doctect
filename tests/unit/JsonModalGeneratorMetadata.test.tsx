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
    schemaVersion: 10,
};

const stateWithOverflow = () => ({
    ...state,
    variants: {
        default: {
            ...state.variants.default,
            templates: {
                page: {
                    ...state.variants.default.templates.page,
                    elements: [
                        { id: 'valid-text', type: 'text', textOverflow: 'ellipsis', textWrap: false },
                        { id: 'malformed-text', type: 'text', textOverflow: 'truncate', textWrap: 'false' },
                        { id: 'valid-grid', type: 'grid', textOverflow: 'shrink', textWrap: true },
                        { id: 'malformed-grid', type: 'grid', textOverflow: null, textWrap: 1 },
                    ],
                },
            },
        },
    },
});

const savedElement = (saved: any, id: string) => (
    saved.variants.default.templates.page.elements.find((item: any) => item.id === id)
);

const renderModal = (currentState: any, mode: 'visual' | 'text' = 'text') => {
    const props = { isOpen: true, currentState, onSave: vi.fn(), onClose: vi.fn() };
    render(<JsonModal {...props} />);
    if (mode === 'text') fireEvent.click(screen.getByRole('button', { name: 'Text' }));
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

    it.each(['text', 'visual'] as const)('%s Apply preserves valid v10 settings and defaults malformed values', mode => {
        const props = renderModal(stateWithOverflow(), mode);

        fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

        expect(props.onSave).toHaveBeenCalledOnce();
        const saved = props.onSave.mock.calls[0][0];
        expect(saved.schemaVersion).toBe(11);
        expect(savedElement(saved, 'valid-text')).toMatchObject({
            textOverflow: 'ellipsis', textWrap: false,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expect(savedElement(saved, 'malformed-text')).toMatchObject({
            textOverflow: 'clip', textWrap: true,
            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        expect(savedElement(saved, 'valid-grid')).toMatchObject({ textOverflow: 'shrink', textWrap: true });
        expect(savedElement(saved, 'malformed-grid')).toMatchObject({ textOverflow: 'clip', textWrap: false });
        expect(props.onClose).toHaveBeenCalledOnce();
    });
});
