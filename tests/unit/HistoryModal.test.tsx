import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HistoryModal } from '../../components/cloud/HistoryModal';
import { cloudApi, CommitMeta } from '../../services/cloudApi';
import { deferred } from '../helpers/fakeLocalWorkspaceStore';

const commits: CommitMeta[] = [
    { id: 'c2', parentCommitId: 'c1', message: 'Second save', schemaVersion: 1, createdBy: 'u1', createdAt: '2026-02-01T00:00:00.000Z' },
    { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z' },
];

const generator = {
    formatVersion: 1 as const,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};

const commitState = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: {} } },
    activeVariantId: 'default',
    schemaVersion: 10,
    generator,
};

const rawCloneState = {
    ...commitState,
    schemaVersion: 8,
    generator: { ...generator, formatVersion: 2, legacyNote: 'keep raw until EditorPage' },
};

const malformedOverflowState = {
    ...commitState,
    variants: {
        default: {
            id: 'default',
            name: 'Default',
            templates: {
                page: {
                    id: 'page',
                    name: 'Page',
                    width: 500,
                    height: 700,
                    elements: [
                        { id: 'valid-text', type: 'text', textOverflow: 'visible', textWrap: false },
                        { id: 'malformed-text', type: 'text', textOverflow: 'truncate', textWrap: 'true' },
                        { id: 'valid-grid', type: 'grid', textOverflow: 'shrink', textWrap: true },
                        { id: 'malformed-grid', type: 'grid', textOverflow: null, textWrap: 0 },
                    ],
                },
            },
        },
    },
};

const overflowElement = (state: any, id: string) => (
    state.variants.default.templates.page.elements.find((item: any) => item.id === id)
);

describe('HistoryModal', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue(commits);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({ id: 'c2', message: 'Second save', createdAt: '2026-02-01T00:00:00.000Z', state: commitState });
    });

    it('lists commits with a HEAD tag on the newest one', async () => {
        render(<HistoryModal cloudProjectId="proj-1" onRestore={vi.fn()} onClose={vi.fn()} />);
        expect(await screen.findByText(/Second save/)).toBeInTheDocument();
        expect(screen.getByText(/Initial save/)).toBeInTheDocument();
        expect(screen.getByText('HEAD')).toBeInTheDocument();
    });

    describe('default (restore) mode', () => {
        it('shows "Restore" buttons', async () => {
            render(<HistoryModal cloudProjectId="proj-1" onRestore={vi.fn()} onClose={vi.fn()} />);
            expect(await screen.findAllByRole('button', { name: 'Restore' })).toHaveLength(2);
        });

        it('does not call onRestore if the confirm dialog is cancelled', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(false);
            const onRestore = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            expect(window.confirm).toHaveBeenCalled();
            expect(cloudApi.getCommit).not.toHaveBeenCalled();
            expect(onRestore).not.toHaveBeenCalled();
        });

        it('restores generator scripts byte-for-byte when confirmed', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onRestore = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            await waitFor(() => expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({
                schemaVersion: 11,
                generator,
            })));
            expect(onRestore.mock.calls[0][0].generator).toEqual(generator);
        });

        it('detaches malformed generator metadata, restores the document, then warns once', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
                id: 'c2', message: 'Second save', createdAt: '2026-02-01T00:00:00.000Z',
                state: { ...commitState, generator: { ...generator, formatVersion: 2 } as any },
            });
            const onRestore = vi.fn();
            const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);

            await waitFor(() => expect(onRestore).toHaveBeenCalled());
            expect(onRestore.mock.calls[0][0].generator).toBeUndefined();
            expect(alert).toHaveBeenCalledOnce();
            expect(alert).toHaveBeenCalledWith(expect.stringContaining('Saved generator was detached'));
            expect(onRestore.mock.invocationCallOrder[0]).toBeLessThan(alert.mock.invocationCallOrder[0]);
        });

        it('normalizes v10 overflow settings before restoring into the editor', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
                id: 'c2', message: 'Second save', createdAt: '2026-02-01T00:00:00.000Z',
                state: malformedOverflowState as any,
            });
            const onRestore = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);

            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);

            await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
            const restored = onRestore.mock.calls[0][0];
            expect(restored.schemaVersion).toBe(11);
            expect(overflowElement(restored, 'valid-text')).toMatchObject({
                textOverflow: 'visible', textWrap: false,
                textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
            });
            expect(overflowElement(restored, 'malformed-text')).toMatchObject({
                textOverflow: 'clip', textWrap: true,
                textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
            });
            expect(overflowElement(restored, 'valid-grid')).toMatchObject({ textOverflow: 'shrink', textWrap: true });
            expect(overflowElement(restored, 'malformed-grid')).toMatchObject({ textOverflow: 'clip', textWrap: false });
        });

        it('shows a fallback error message when restoring fails', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            vi.spyOn(cloudApi, 'getCommit').mockRejectedValue(new Error('boom'));
            render(<HistoryModal cloudProjectId="proj-1" onRestore={vi.fn()} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            expect(await screen.findByText('Restore failed')).toBeInTheDocument();
        });
    });

    describe('clone mode', () => {
        it('shows "Open in editor" buttons instead of "Restore"', async () => {
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={vi.fn()} onClose={vi.fn()} />);
            expect(await screen.findAllByRole('button', { name: 'Open in editor' })).toHaveLength(2);
            expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
        });

        it('does not show a confirm dialog before cloning', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onClone = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            await waitFor(() => expect(onClone).toHaveBeenCalled());
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('keeps clone controls busy until durable staging finishes', async () => {
            const staged = deferred<void>();
            const onClone = vi.fn(() => staged.promise);
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            await waitFor(() => expect(onClone).toHaveBeenCalledWith({
                state: commitState,
                commitId: 'c2',
            }));

            expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
            expect(screen.getAllByRole('button', { name: 'Open in editor' })[0]).toBeDisabled();

            staged.resolve();
            await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open in editor' })[0]).toBeEnabled());
        });

        it('announces an exact staging failure without closing the modal', async () => {
            const failure = Promise.reject(new Error('quota'));
            void failure.catch(() => {});
            const onClone = vi.fn(() => failure);
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Could not prepare this project for the editor. Nothing was removed; try again.',
            );
            expect(screen.getByRole('heading', { name: 'Version history' })).toBeVisible();
            expect(screen.getAllByRole('button', { name: 'Open in editor' })[0]).toBeEnabled();
        });

        it('blocks same-tick close paths until a deferred staging rejection is visible', async () => {
            const staged = deferred<void>();
            const onClone = vi.fn(() => staged.promise);
            const onClose = vi.fn();
            const outsideEscape = vi.fn();
            document.addEventListener('keydown', outsideEscape);
            try {
                const view = render(
                    <HistoryModal
                        cloudProjectId="proj-1"
                        mode="clone"
                        onClone={onClone}
                        onClose={onClose}
                    />,
                );
                const open = (await screen.findAllByRole('button', { name: 'Open in editor' }))[0];

                fireEvent.click(open);
                fireEvent.click(view.container.querySelector('button')!);
                fireEvent.click(view.container.firstElementChild!);
                fireEvent.keyDown(document, { key: 'Escape' });

                expect(onClose).not.toHaveBeenCalled();
                expect(outsideEscape).not.toHaveBeenCalled();
                await waitFor(() => expect(onClone).toHaveBeenCalledWith({
                    state: commitState,
                    commitId: 'c2',
                }));

                await act(async () => staged.reject(new Error('post-commit readback failed')));
                expect(await screen.findByRole('alert')).toHaveTextContent(
                    'Could not prepare this project for the editor. Nothing was removed; try again.',
                );
                expect(onClose).not.toHaveBeenCalled();
            } finally {
                document.removeEventListener('keydown', outsideEscape);
            }
        });

        it('keeps legacy malformed metadata raw for EditorPage to normalize once', async () => {
            vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
                id: 'c2', message: 'Second save', createdAt: '2026-02-01T00:00:00.000Z', state: rawCloneState,
            });
            const onClone = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            await waitFor(() => expect(onClone).toHaveBeenCalledWith({
                state: rawCloneState,
                commitId: 'c2',
            }));
            expect(onClone.mock.calls[0][0].state.schemaVersion).toBe(8);
            expect(onClone.mock.calls[0][0].state.generator).toEqual(rawCloneState.generator);
        });

        it('keeps malformed current-v10 overflow raw for the staged EditorPage load boundary', async () => {
            vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
                id: 'c2', message: 'Second save', createdAt: '2026-02-01T00:00:00.000Z',
                state: malformedOverflowState as any,
            });
            const onClone = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);

            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);

            await waitFor(() => expect(onClone).toHaveBeenCalledWith({
                state: malformedOverflowState,
                commitId: 'c2',
            }));
            expect(onClone.mock.calls[0][0].state.schemaVersion).toBe(10);
            expect(overflowElement(onClone.mock.calls[0][0].state, 'malformed-text')).toMatchObject({
                textOverflow: 'truncate', textWrap: 'true',
            });
            expect(overflowElement(onClone.mock.calls[0][0].state, 'malformed-grid')).toMatchObject({
                textOverflow: null, textWrap: 0,
            });
        });

        it('shows a fallback error message when opening a version fails', async () => {
            vi.spyOn(cloudApi, 'getCommit').mockRejectedValue(new Error('boom'));
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={vi.fn()} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            expect(await screen.findByText('Could not open this version')).toBeInTheDocument();
        });
    });
});
