import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchyGeneratorModal } from '../../components/HierarchyGeneratorModal';
import type { GeneratorProvenance } from '../../types';

const runGeneratorSandbox = vi.hoisted(() => vi.fn());
const previewPayload = vi.hoisted(() => ({ current: null as any }));

vi.mock('../../services/generatorSandbox', () => ({ runGeneratorSandbox }));
vi.mock('../../components/GeneratorVisualPreviewModal', () => ({
    GeneratorVisualPreviewModal: (props: any) => {
        previewPayload.current = props.payload;
        return (
            <div role="dialog" aria-label="Generated Project Preview">
                <button onClick={props.onBack}>Back to Scripts</button>
                <button onClick={props.onReplace}>Replace Current Project</button>
                <button onClick={() => props.onCreateProject('Separate Generated')}>Create Test Project</button>
            </div>
        );
    },
}));

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

const lastPreviewSignal = (): AbortSignal => {
    const call = runGeneratorSandbox.mock.calls.at(-1);
    if (!(call?.[2] instanceof AbortSignal)) throw new Error('Preview did not pass an AbortSignal.');
    return call[2];
};

const renderModal = (overrides: Record<string, unknown> = {}) => {
    const props = {
        isOpen: true,
        projectName: 'Current Project',
        savedGenerator: saved,
        onClose: vi.fn(),
        onApplyGenerated: vi.fn(() => true),
        onCreateGeneratedProject: vi.fn(() => true),
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

    it('explains visual preview decisions and retained source safety without detach guidance', () => {
        renderModal();
        const workflow = 'Preview opens live canvas template previews. Back keeps your scripts, Create New Project preserves the original, and Replace Current Project creates one undo checkpoint.';
        expect(screen.getByText(workflow, { exact: true })).toBeVisible();
        expect(screen.getByRole('dialog')).toHaveTextContent('Saved generator source is retained with the project and becomes public when published.');
        expect(screen.getByRole('dialog')).toHaveTextContent('Opening source never runs it; Preview uses the sandbox.');
        expect(screen.getByRole('dialog')).toHaveTextContent('Manual edits are not written back to JavaScript.');

        fireEvent.click(screen.getByRole('button', { name: 'LLM Helper & Schema Documentation' }));

        expect(screen.getAllByText(workflow, { exact: true })).toHaveLength(2);
        expect(screen.getByRole('dialog')).not.toHaveTextContent('Detach Saved Generator');
        expect(screen.getByRole('dialog')).not.toHaveTextContent(/remove source before publishing/i);
        expect(screen.queryByRole('button', { name: 'Detach Saved Generator' })).not.toBeInTheDocument();
    });

    it('previews without applying, then replaces with exact preview source after confirmation', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const props = renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByRole('dialog', { name: 'Generated Project Preview' })).toBeVisible();
        expect(props.onApplyGenerated).not.toHaveBeenCalled();
        expect(runGeneratorSandbox).toHaveBeenCalledWith(
            {
                templateScript: saved.templateScript,
                hierarchyScript: saved.hierarchyScript,
                constants: expect.objectContaining({ RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679 }),
            },
            undefined,
            expect.any(AbortSignal),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Replace Current Project' }));

        expect(confirm).toHaveBeenCalled();
        expect(props.onApplyGenerated).toHaveBeenCalledWith(
            expect.objectContaining({ rootId: 'root' }),
            { formatVersion: 1, templateScript: saved.templateScript, hierarchyScript: saved.hierarchyScript },
        );
        expect(props.onClose).toHaveBeenCalled();
    });

    it('Back preserves exact drafts and leaves project callbacks untouched', async () => {
        const props = renderModal();
        fireEvent.change(screen.getByLabelText('Template script'), { target: { value: '  exact template draft\n' } });
        fireEvent.change(screen.getByLabelText('Hierarchy script'), { target: { value: '\texact hierarchy draft  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });

        fireEvent.click(screen.getByRole('button', { name: 'Back to Scripts' }));

        expect(screen.getByLabelText('Template script')).toHaveValue('  exact template draft\n');
        expect(screen.getByLabelText('Hierarchy script')).toHaveValue('\texact hierarchy draft  ');
        expect(props.onApplyGenerated).not.toHaveBeenCalled();
        expect(props.onCreateGeneratedProject).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('reopens an immutable ready preview without rerunning the sandbox', async () => {
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });
        const before = structuredClone(previewPayload.current);
        fireEvent.click(screen.getByRole('button', { name: 'Back to Scripts' }));

        fireEvent.click(screen.getByRole('button', { name: 'View Preview' }));

        expect(await screen.findByRole('dialog', { name: 'Generated Project Preview' })).toBeVisible();
        expect(runGeneratorSandbox).toHaveBeenCalledOnce();
        expect(previewPayload.current).toEqual(before);
    });

    it('creates from the exact immutable ready payload and closes both dialogs', async () => {
        const props = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });
        const before = structuredClone(previewPayload.current);

        fireEvent.click(screen.getByRole('button', { name: 'Create Test Project' }));

        expect(props.onCreateGeneratedProject).toHaveBeenCalledWith(
            'Separate Generated',
            before.project,
            before.source,
        );
        expect(before.source).toEqual({
            formatVersion: 1,
            templateScript: saved.templateScript,
            hierarchyScript: saved.hierarchyScript,
        });
        expect(previewPayload.current).toEqual(before);
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(screen.queryByRole('dialog', { name: 'Generated Project Preview' })).not.toBeInTheDocument();
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
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });
        fireEvent.click(screen.getByRole('button', { name: 'Back to Scripts' }));

        const templateEditor = screen.getByLabelText('Template script');
        fireEvent.change(templateEditor, { target: { value: '  return customTemplates;\n' } });

        expect(screen.queryByRole('dialog', { name: 'Generated Project Preview' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await waitFor(() => expect(runGeneratorSandbox).toHaveBeenLastCalledWith(
            expect.objectContaining({
                templateScript: '  return customTemplates;\n',
                hierarchyScript: saved.hierarchyScript,
            }),
            undefined,
            expect.any(AbortSignal),
        ));
    });

    it('ignores a deferred preview result after the draft changes', async () => {
        const pending = deferred<any>();
        runGeneratorSandbox.mockReturnValueOnce(pending.promise);
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        fireEvent.change(screen.getByLabelText('Template script'), { target: { value: 'changed while running' } });
        await act(async () => pending.resolve({ ok: true, value: validSandboxValue }));

        expect(screen.queryByRole('dialog', { name: 'Generated Project Preview' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
    });

    it('aborts a running preview when source changes and before its replacement starts', async () => {
        const first = deferred<any>();
        const second = deferred<any>();
        runGeneratorSandbox.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        const firstSignal = lastPreviewSignal();

        fireEvent.change(screen.getByLabelText('Template script'), { target: { value: 'changed' } });
        expect(firstSignal.aborted).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        const secondSignal = lastPreviewSignal();

        expect(secondSignal).not.toBe(firstSignal);
        expect(secondSignal.aborted).toBe(false);
        await act(async () => second.resolve({ ok: true, value: validSandboxValue }));
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });
        fireEvent.click(screen.getByRole('button', { name: 'Back to Scripts' }));
        fireEvent.click(screen.getByRole('button', { name: 'View Preview' }));
        expect(secondSignal.aborted).toBe(false);
        expect(runGeneratorSandbox).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['preset switch', (view: ReturnType<typeof render>) => {
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'blank' } });
        }],
        ['reset', () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        }],
        ['close', () => fireEvent.click(screen.getByRole('button', { name: 'Close generator' }))],
        ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
        ['unmount', (view: ReturnType<typeof render>) => view.unmount()],
    ])('aborts a running preview on %s', async (_name, action) => {
        const pending = deferred<any>();
        runGeneratorSandbox.mockReturnValueOnce(pending.promise);
        const props = {
            isOpen: true,
            projectName: 'Current Project',
            savedGenerator: saved,
            onClose: vi.fn(),
            onApplyGenerated: vi.fn(() => true),
            onCreateGeneratedProject: vi.fn(() => true),
        };
        const view = render(<HierarchyGeneratorModal {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        const signal = lastPreviewSignal();

        action(view);

        expect(signal.aborted).toBe(true);
    });

    it('aborts the preview controller when a ready preview is applied', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        const signal = lastPreviewSignal();
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });

        fireEvent.click(screen.getByRole('button', { name: 'Replace Current Project' }));

        expect(signal.aborted).toBe(true);
    });

    it('starts a reopened session from current saved source and ignores the prior deferred result', async () => {
        const pending = deferred<any>();
        runGeneratorSandbox.mockReturnValueOnce(pending.promise);
        const props = {
            isOpen: true,
            projectName: 'Current Project',
            savedGenerator: saved,
            onClose: vi.fn(),
            onApplyGenerated: vi.fn(() => true),
            onCreateGeneratedProject: vi.fn(() => true),
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
        expect(screen.queryByRole('dialog', { name: 'Generated Project Preview' })).not.toBeInTheDocument();
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
                projectName="Current Project"
                savedGenerator={saved}
                onClose={vi.fn()}
                onApplyGenerated={vi.fn(() => true)}
                onCreateGeneratedProject={vi.fn(() => true)}
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
        await screen.findByRole('dialog', { name: 'Generated Project Preview' });

        fireEvent.click(screen.getByRole('button', { name: 'Replace Current Project' }));

        expect(props.onApplyGenerated).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
    });

});
