import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchyGeneratorModal } from '../../components/HierarchyGeneratorModal';
import type { GeneratorProvenance } from '../../types';

const runGeneratorSandbox = vi.hoisted(() => vi.fn());

vi.mock('../../services/generatorSandbox', () => ({ runGeneratorSandbox }));

const saved: GeneratorProvenance = {
    formatVersion: 1,
    templateScript: 'return { page: { id: "page", name: "Saved Page", width: 509, height: 679, elements: [] } };',
    hierarchyScript: 'return { nodes: {}, rootId: "saved-root" };',
    generatedAt: '2026-07-14T10:00:00.000Z',
};

const validSandboxValue = {
    templates: {
        page: { id: 'page', name: 'Page', width: 509, height: 679, elements: [] },
    },
    hierarchy: {
        nodes: {
            root: { id: 'root', parentId: null, type: 'page', title: 'Preview Root', data: {}, children: [] },
        },
        rootId: 'root',
    },
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
};

const renderModal = (overrides: Record<string, unknown> = {}) => {
    const props = {
        isOpen: true,
        savedGenerator: saved,
        onClose: vi.fn(),
        onApplyGenerated: vi.fn(() => true),
        onDetachSavedGenerator: vi.fn(() => true),
        ...overrides,
    };
    render(<HierarchyGeneratorModal {...props} />);
    return props;
};

describe('HierarchyGeneratorModal', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        runGeneratorSandbox.mockReset();
        runGeneratorSandbox.mockResolvedValue({ ok: true, value: validSandboxValue });
    });

    it('opens saved source exactly without executing it', () => {
        renderModal();

        expect(runGeneratorSandbox).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue(saved.templateScript)).toBeVisible();
        expect(screen.getByDisplayValue(saved.hierarchyScript)).toBeVisible();
        expect(screen.getByText('Saved Generator')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
    });

    it('previews without applying, shows summary, then applies exact preview source after confirmation', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const props = renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        await screen.findByText('1 template');
        expect(screen.getByText('1 variant')).toBeVisible();
        expect(screen.getByText('1 node')).toBeVisible();
        expect(screen.getByText('1 estimated page')).toBeVisible();
        expect(screen.getByText(/Applying replaces the current generated document/)).toBeVisible();
        expect(props.onApplyGenerated).not.toHaveBeenCalled();
        expect(runGeneratorSandbox).toHaveBeenCalledWith({
            templateScript: saved.templateScript,
            hierarchyScript: saved.hierarchyScript,
            constants: expect.objectContaining({ RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679 }),
        });

        fireEvent.click(screen.getByRole('button', { name: 'Apply Generated Project' }));

        expect(confirm).toHaveBeenCalled();
        expect(props.onApplyGenerated).toHaveBeenCalledWith(
            expect.objectContaining({ rootId: 'root' }),
            { templateScript: saved.templateScript, hierarchyScript: saved.hierarchyScript },
        );
        expect(props.onClose).toHaveBeenCalled();
    });

    it('shows failed previews and keeps Apply disabled', async () => {
        runGeneratorSandbox.mockResolvedValue({ ok: false, category: 'runtime', message: 'Script exploded.' });
        renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByText(/Runtime: Script exploded\./)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
    });

    it('invalidates a successful preview on source edits and previews exact draft source', async () => {
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByText('1 template');

        const templateEditor = screen.getByLabelText('Template script');
        fireEvent.change(templateEditor, { target: { value: '  return customTemplates;\n' } });

        expect(screen.queryByText('1 template')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await waitFor(() => expect(runGeneratorSandbox).toHaveBeenLastCalledWith(expect.objectContaining({
            templateScript: '  return customTemplates;\n',
            hierarchyScript: saved.hierarchyScript,
        })));
    });

    it('ignores a deferred preview result after the draft changes', async () => {
        const pending = deferred<any>();
        runGeneratorSandbox.mockReturnValueOnce(pending.promise);
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        fireEvent.change(screen.getByLabelText('Template script'), { target: { value: 'changed while running' } });
        await act(async () => pending.resolve({ ok: true, value: validSandboxValue }));

        expect(screen.queryByText('1 template')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
    });

    it('starts a reopened session from current saved source and ignores the prior deferred result', async () => {
        const pending = deferred<any>();
        runGeneratorSandbox.mockReturnValueOnce(pending.promise);
        const props = {
            isOpen: true,
            savedGenerator: saved,
            onClose: vi.fn(),
            onApplyGenerated: vi.fn(() => true),
            onDetachSavedGenerator: vi.fn(() => true),
        };
        const view = render(<HierarchyGeneratorModal {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        view.rerender(<HierarchyGeneratorModal {...props} isOpen={false} />);
        const reopened = {
            ...saved,
            templateScript: 'return reopenedTemplates;',
            hierarchyScript: 'return reopenedHierarchy;',
            generatedAt: '2026-07-14T12:00:00.000Z',
        };
        view.rerender(<HierarchyGeneratorModal {...props} isOpen savedGenerator={reopened} />);

        expect(screen.getByLabelText('Template script')).toHaveValue(reopened.templateScript);
        expect(screen.getByLabelText('Hierarchy script')).toHaveValue(reopened.hierarchyScript);
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
        await act(async () => pending.resolve({ ok: true, value: validSandboxValue }));
        expect(screen.queryByText('1 template')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
    });

    it('checks metadata size limits before entering the sandbox', async () => {
        renderModal();
        fireEvent.change(screen.getByLabelText('Template script'), { target: { value: 'x'.repeat(512 * 1024 + 1) } });

        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('Template script exceeds 512 KiB.')).toBeVisible();
        expect(runGeneratorSandbox).not.toHaveBeenCalled();
    });

    it('guards dirty close and lets cancellation keep the modal open', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const props = renderModal();
        fireEvent.change(screen.getByLabelText('Hierarchy script'), { target: { value: 'changed' } });

        fireEvent.click(screen.getByRole('button', { name: 'Close generator' }));

        expect(confirm).toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
        confirm.mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: 'Close generator' }));
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('exposes modal semantics, contains focus, and restores focus after unmount', () => {
        const opener = document.createElement('button');
        opener.textContent = 'Open generator';
        document.body.appendChild(opener);
        opener.focus();

        const view = render(
            <HierarchyGeneratorModal
                isOpen
                savedGenerator={saved}
                onClose={vi.fn()}
                onApplyGenerated={vi.fn(() => true)}
                onDetachSavedGenerator={vi.fn(() => true)}
            />,
        );
        const dialog = screen.getByRole('dialog', { name: 'Hierarchy Generator' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveFocus();
        expect(screen.getByRole('combobox', { name: 'Preset:' })).toBeVisible();
        screen.getAllByRole('button').forEach(button => expect(button).toHaveAccessibleName());

        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
        focusable[focusable.length - 1].focus();
        fireEvent.keyDown(focusable[focusable.length - 1], { key: 'Tab' });
        expect(focusable[0]).toHaveFocus();
        fireEvent.keyDown(focusable[0], { key: 'Tab', shiftKey: true });
        expect(focusable[focusable.length - 1]).toHaveFocus();

        view.unmount();
        expect(opener).toHaveFocus();
        opener.remove();
    });

    it('routes Escape through dirty-close confirmation', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const props = renderModal();
        fireEvent.change(screen.getByLabelText('Hierarchy script'), { target: { value: 'dirty' } });

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(confirm).toHaveBeenCalledOnce();
        expect(props.onClose).not.toHaveBeenCalled();

        confirm.mockReturnValue(true);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('announces preview errors as live alerts', async () => {
        runGeneratorSandbox.mockResolvedValue({ ok: false, category: 'runtime', message: 'Script exploded.' });
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Runtime: Script exploded.');
    });

    it('guards dirty preset switches and preserves drafts when cancelled', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        renderModal();
        const templateEditor = screen.getByLabelText('Template script');
        fireEvent.change(templateEditor, { target: { value: 'custom draft' } });

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'blank' } });

        expect(confirm).toHaveBeenCalled();
        expect(screen.getByDisplayValue('custom draft')).toBeVisible();
        expect(screen.getByRole('combobox')).toHaveValue('saved');
    });

    it('can return from a preset to the exact saved source', () => {
        renderModal();
        const preset = screen.getByRole('combobox');

        fireEvent.change(preset, { target: { value: 'blank' } });
        expect(preset).toHaveValue('blank');
        fireEvent.change(preset, { target: { value: 'saved' } });

        expect(preset).toHaveValue('saved');
        expect(screen.getByLabelText('Template script')).toHaveValue(saved.templateScript);
        expect(screen.getByLabelText('Hierarchy script')).toHaveValue(saved.hierarchyScript);
    });

    it('leaves project unchanged when Apply confirmation is cancelled', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const props = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByText('1 template');

        fireEvent.click(screen.getByRole('button', { name: 'Apply Generated Project' }));

        expect(props.onApplyGenerated).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('requires dirty-discard and separate detach confirmations', () => {
        const confirm = vi.spyOn(window, 'confirm');
        const props = renderModal();
        fireEvent.change(screen.getByLabelText('Hierarchy script'), { target: { value: 'dirty source' } });

        confirm.mockReturnValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: 'Detach Saved Generator' }));
        expect(props.onDetachSavedGenerator).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Hierarchy script')).toHaveValue('dirty source');

        confirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: 'Detach Saved Generator' }));
        expect(props.onDetachSavedGenerator).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Hierarchy script')).toHaveValue('dirty source');

        confirm.mockReturnValueOnce(true).mockReturnValueOnce(true);
        fireEvent.click(screen.getByRole('button', { name: 'Detach Saved Generator' }));
        expect(props.onDetachSavedGenerator).toHaveBeenCalledOnce();
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(confirm.mock.calls.map(([message]) => message)).toEqual([
            'Discard draft generator changes?',
            'Discard draft generator changes?',
            'Detach saved generator source? Generated document content will remain unchanged.',
            'Discard draft generator changes?',
            'Detach saved generator source? Generated document content will remain unchanged.',
        ]);
    });
});
