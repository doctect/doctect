import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HistoryModal } from '../../components/cloud/HistoryModal';
import { cloudApi, CommitMeta } from '../../services/cloudApi';

vi.mock('../../services/migration', () => ({
    migrateState: vi.fn((s: any) => ({ ...s, migrated: true })),
}));

const commits: CommitMeta[] = [
    { id: 'c2', parentCommitId: 'c1', message: 'Second save', schemaVersion: 1, createdBy: 'u1', createdAt: '2026-02-01T00:00:00.000Z' },
    { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z' },
];

const commitState = { nodes: {}, rootId: 'root', variants: {}, activeVariantId: 'default' };

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

        it('calls onRestore with the migrated state when confirmed', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onRestore = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            await waitFor(() => expect(onRestore).toHaveBeenCalledWith({ ...commitState, migrated: true }));
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

        it('calls onClone with the raw (non-migrated) state', async () => {
            const onClone = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            await waitFor(() => expect(onClone).toHaveBeenCalledWith({ state: commitState }));
        });

        it('shows a fallback error message when opening a version fails', async () => {
            vi.spyOn(cloudApi, 'getCommit').mockRejectedValue(new Error('boom'));
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={vi.fn()} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            expect(await screen.findByText('Could not open this version')).toBeInTheDocument();
        });
    });
});
