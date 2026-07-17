import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminModerationPage } from '../../pages/AdminModerationPage';
import { ApiError } from '../../services/cloudApi';

const api = vi.hoisted(() => ({
    me: vi.fn(),
    searchModerationUsers: vi.fn(),
    getModerationUser: vi.fn(),
    suspendAccount: vi.fn(),
    restoreAccount: vi.fn(),
    promoteAdmin: vi.fn(),
    revokeAdmin: vi.fn(),
}));

vi.mock('../../services/cloudApi', async importOriginal => ({
    ...(await importOriginal()),
    cloudApi: api,
}));

const account = {
    id: 'user-1', email: 'target@test.dev', username: 'target', role: 'user' as const,
    createdAt: '2026-01-01T00:00:00.000Z', suspensionStatus: 'none' as const,
    banExpires: null, banReason: null, moderationVersion: 3,
};

const detail = {
    account,
    projects: [
        { id: 'project-1', name: 'One', publishedAt: '2026-07-15T00:00:00.000Z' },
        { id: 'project-2', name: 'Two', publishedAt: '2026-07-14T00:00:00.000Z' },
    ],
    history: { items: [], nextCursor: null },
};

const renderPage = (actorRole: 'admin' | 'owner' = 'admin') =>
    render(<MemoryRouter><AdminModerationPage actorRole={actorRole} /></MemoryRouter>);

const searchAndOpen = async (actorRole: 'admin' | 'owner' = 'admin') => {
    renderPage(actorRole);
    fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'target' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('target@test.dev');
    fireEvent.click(screen.getByRole('button', { name: 'Review target@test.dev' }));
    await screen.findByRole('heading', { name: 'target@test.dev' });
};

describe('AdminModerationPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.me.mockResolvedValue(null);
        api.searchModerationUsers.mockResolvedValue({ users: [account], nextCursor: 'next-search' });
        api.getModerationUser.mockResolvedValue(detail);
        api.suspendAccount.mockResolvedValue({
            account: { ...account, suspensionStatus: 'active', banReason: 'Confirmed abuse', moderationVersion: 4 },
            actions: [],
        });
        api.restoreAccount.mockResolvedValue({
            account: { ...account, moderationVersion: 5 }, actions: [],
        });
        api.promoteAdmin.mockResolvedValue({
            account: { ...account, role: 'admin', moderationVersion: 4 }, actions: [],
        });
        api.revokeAdmin.mockResolvedValue({
            account: { ...account, role: 'user', moderationVersion: 4 }, actions: [],
        });
    });

    it('requires a query, searches, shows empty results, and appends the returned cursor page', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(screen.getByText('Enter an email or username.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'target' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await screen.findByText('target@test.dev');

        const secondAccount = { ...account, id: 'user-2', email: 'second@test.dev' };
        api.searchModerationUsers.mockResolvedValueOnce({ users: [secondAccount], nextCursor: null });
        fireEvent.click(screen.getByRole('button', { name: 'More accounts' }));
        expect(await screen.findByText('second@test.dev')).toBeInTheDocument();
        expect(screen.getByText('target@test.dev')).toBeInTheDocument();
        expect(api.searchModerationUsers).toHaveBeenLastCalledWith('target', 'next-search');

        api.searchModerationUsers.mockResolvedValueOnce({ users: [], nextCursor: null });
        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'nobody' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(await screen.findByText('No matching accounts.')).toBeInTheDocument();
    });

    it('loads safe detail, individual project controls, links, and append-only history pagination', async () => {
        api.getModerationUser.mockResolvedValueOnce({
            ...detail,
            history: { items: [{
                id: 'action-1', actorUserId: 'admin-1', actorEmail: 'admin@test.dev',
                targetUserId: 'user-1', targetEmail: 'target@test.dev', action: 'account_suspended' as const,
                reason: 'Prior reason', expiresAt: null, projectId: null, createdAt: '2026-07-15T00:00:00.000Z',
            }], nextCursor: 'next-history' },
        });
        api.getModerationUser.mockResolvedValueOnce({
            ...detail,
            history: { items: [{
                id: 'action-2', actorUserId: 'admin-2', actorEmail: 'second-admin@test.dev',
                targetUserId: 'user-1', targetEmail: 'target@test.dev', action: 'account_restored' as const,
                reason: 'Appeal accepted', expiresAt: null, projectId: null, createdAt: '2026-07-16T00:00:00.000Z',
            }], nextCursor: null },
        });

        await searchAndOpen();
        expect(screen.getByLabelText('Unpublish One (project-1)')).not.toBeChecked();
        expect(screen.getByLabelText('Unpublish Two (project-2)')).not.toBeChecked();
        expect(screen.getByRole('link', { name: 'Review One (project-1)' })).toHaveAttribute('href', '/gallery/project-1');
        expect(screen.getByText('Prior reason')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'More history' }));
        expect(await screen.findByText('Appeal accepted')).toBeInTheDocument();
        expect(screen.getByText('Prior reason')).toBeInTheDocument();
        expect(api.getModerationUser).toHaveBeenLastCalledWith('user-1', 'next-history');
        expect(screen.queryByText(/password|oauth|session token|ip address/i)).toBeNull();
    });

    it('distinguishes duplicate project names by stable ID in controls and confirmation', async () => {
        api.getModerationUser.mockResolvedValueOnce({
            ...detail,
            projects: [
                { id: 'project-1', name: 'Copy', publishedAt: '2026-07-15T00:00:00.000Z' },
                { id: 'project-2', name: 'Copy', publishedAt: '2026-07-14T00:00:00.000Z' },
            ],
        });
        await searchAndOpen();

        expect(screen.getByLabelText('Unpublish Copy (project-1)')).not.toBeChecked();
        fireEvent.click(screen.getByLabelText('Unpublish Copy (project-2)'));
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Duplicate project review' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Copy (project-2)')).toBeInTheDocument();
        expect(within(dialog).queryByText('Copy (project-1)')).toBeNull();
    });

    it('shows an account-detail loading state until selected account resolves', async () => {
        let resolveDetail: (value: typeof detail) => void = () => {};
        api.getModerationUser.mockReturnValueOnce(new Promise(resolve => { resolveDetail = resolve; }));
        renderPage();
        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'target' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await screen.findByText('target@test.dev');
        fireEvent.click(screen.getByRole('button', { name: 'Review target@test.dev' }));
        expect(screen.getByRole('status')).toHaveTextContent('Loading account details…');
        resolveDetail(detail);
        expect(await screen.findByRole('heading', { name: 'target@test.dev' })).toBeInTheDocument();
    });

    it.each([
        ['Indefinite', null],
        ['24 hours', 24],
        ['7 days', 7 * 24],
        ['30 days', 30 * 24],
    ])('builds %s expiry and confirms exact account, duration, reason, and projects', async (duration, expectedHours) => {
        await searchAndOpen();
        const now = Date.parse('2026-07-16T12:00:00.000Z');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: duration } });
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByLabelText('Unpublish One (project-1)'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Account: target@test.dev')).toBeInTheDocument();
        expect(within(dialog).getByText(`Duration: ${duration}`)).toBeInTheDocument();
        expect(within(dialog).getByText('Reason: Confirmed abuse')).toBeInTheDocument();
        expect(within(dialog).getByText('One (project-1)')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm suspension' }));

        await waitFor(() => expect(api.suspendAccount).toHaveBeenCalledTimes(1));
        const input = api.suspendAccount.mock.calls[0][1];
        expect(input.projectIdsToUnpublish).toEqual(['project-1']);
        expect(input.expectedModerationVersion).toBe(3);
        if (expectedHours === null) expect(input.expiresAt).toBeNull();
        else expect(input.expiresAt).toBe(new Date(now + expectedHours * 3600000).toISOString());
        nowSpy.mockRestore();
    });

    it('submits the exact suspension snapshot even when draft fields change after review', async () => {
        const reviewedAt = Date.parse('2026-07-16T12:00:00.000Z');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(reviewedAt);
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: '24 hours' } });
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Reviewed reason' } });
        fireEvent.click(screen.getByLabelText('Unpublish One (project-1)'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Account ID: user-1')).toBeInTheDocument();
        expect(within(dialog).getByText('Moderation version: 3')).toBeInTheDocument();
        expect(within(dialog).getByText(`Expiry: ${new Date(reviewedAt + 24 * 3600000).toISOString()}`)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Changed after review' } });
        fireEvent.click(screen.getByLabelText('Unpublish One (project-1)'));
        fireEvent.click(screen.getByLabelText('Unpublish Two (project-2)'));
        nowSpy.mockReturnValue(reviewedAt + 1000);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm suspension' }));

        await waitFor(() => expect(api.suspendAccount).toHaveBeenCalledWith('user-1', {
            reason: 'Reviewed reason',
            expiresAt: new Date(reviewedAt + 24 * 3600000).toISOString(),
            projectIdsToUnpublish: ['project-1'],
            expectedModerationVersion: 3,
        }));
        nowSpy.mockRestore();
    });

    it.each([
        ['preset', '24 hours', '', Date.parse('2026-07-16T12:00:00.000Z'), Date.parse('2026-07-17T12:00:00.000Z')],
        ['custom', 'Custom', '2999-01-01T00:00', Date.parse('2999-01-01T00:00') - 1000, Date.parse('2999-01-01T00:00')],
    ])('rejects an expired %s snapshot immediately before submission', async (_kind, duration, custom, reviewedAt, expiredAt) => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(reviewedAt);
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: duration } });
        if (custom) fireEvent.change(screen.getByLabelText('Custom expiry'), { target: { value: custom } });
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Keep this draft' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        nowSpy.mockReturnValue(expiredAt);
        fireEvent.click(screen.getByRole('button', { name: 'Confirm suspension' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Suspension expiry is no longer in the future. Choose a new duration and review again.',
        );
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByLabelText('Suspension reason')).toHaveValue('Keep this draft');
        expect(api.suspendAccount).not.toHaveBeenCalled();
        nowSpy.mockRestore();
    });

    it('validates mandatory reason and custom future expiry before opening confirmation', async () => {
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: 'Custom' } });
        fireEvent.change(screen.getByLabelText('Custom expiry'), { target: { value: '2020-01-01T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        expect(screen.getByText('Enter a reason from 1 to 1,000 characters.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        expect(screen.getByText('Custom expiry must be in the future.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Custom expiry'), { target: { value: '2999-01-01T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('focuses and traps the confirmation dialog, then Escape restores opener focus', async () => {
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        const opener = screen.getByRole('button', { name: 'Review suspension' });
        opener.focus();
        fireEvent.click(opener);

        const dialog = screen.getByRole('dialog');
        const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
        const confirm = within(dialog).getByRole('button', { name: 'Confirm suspension' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(cancel).toHaveFocus();

        confirm.focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(cancel).toHaveFocus();
        cancel.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(confirm).toHaveFocus();

        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(opener).toHaveFocus();
    });

    it('keeps the confirmation dialog open when Escape is pressed during submission', async () => {
        let resolveSuspend: (value: unknown) => void = () => {};
        api.suspendAccount.mockReturnValueOnce(new Promise(resolve => { resolveSuspend = resolve; }));
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm suspension' }));
        expect(within(dialog).getByRole('button', { name: 'Submitting…' })).toBeDisabled();

        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        resolveSuspend({ account: { ...account, suspensionStatus: 'active', moderationVersion: 4 }, actions: [] });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('submits once, refreshes status and history, then clears suspension draft', async () => {
        let resolveSuspend: (value: unknown) => void = () => {};
        api.suspendAccount.mockReturnValueOnce(new Promise(resolve => { resolveSuspend = resolve; }));
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByLabelText('Unpublish One (project-1)'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        const confirm = screen.getByRole('button', { name: 'Confirm suspension' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(api.suspendAccount).toHaveBeenCalledTimes(1);
        expect(confirm).toBeDisabled();

        resolveSuspend({ account: { ...account, suspensionStatus: 'active', moderationVersion: 4 }, actions: [] });
        await waitFor(() => expect(api.getModerationUser).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByLabelText('Suspension reason')).toHaveValue(''));
        expect(screen.getByLabelText('Unpublish One (project-1)')).not.toBeChecked();
    });

    it('treats suspension as successful when reload fails and refreshes detail without resubmitting', async () => {
        let rejectReload: (error: Error) => void = () => {};
        const activeDetail = {
            ...detail,
            account: { ...account, suspensionStatus: 'active' as const, banReason: 'Confirmed abuse', moderationVersion: 4 },
        };
        api.getModerationUser
            .mockResolvedValueOnce(detail)
            .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectReload = reject; }))
            .mockResolvedValueOnce(activeDetail);
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Confirmed abuse' } });
        fireEvent.click(screen.getByLabelText('Unpublish One (project-1)'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm suspension' }));

        await waitFor(() => expect(api.getModerationUser).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('heading', { name: 'target@test.dev' })).toBeNull();
        expect(screen.queryByLabelText('Suspension reason')).toBeNull();
        rejectReload(new Error('Network unavailable'));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Account changed successfully, but refresh failed. Refresh account details to continue.',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Refresh account details' }));

        expect(await screen.findByRole('heading', { name: 'target@test.dev' })).toBeInTheDocument();
        expect(screen.getByLabelText('Restoration reason')).toHaveValue('');
        expect(api.getModerationUser).toHaveBeenLastCalledWith('user-1', null);
        expect(api.suspendAccount).toHaveBeenCalledTimes(1);
    });

    it('treats restoration as successful when reload fails and refreshes detail without resubmitting', async () => {
        const activeDetail = {
            ...detail,
            account: { ...account, suspensionStatus: 'active' as const, banReason: 'Old', moderationVersion: 4 },
        };
        api.getModerationUser
            .mockResolvedValueOnce(activeDetail)
            .mockRejectedValueOnce(new Error('Network unavailable'))
            .mockResolvedValueOnce(detail);
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Restoration reason'), { target: { value: 'Appeal accepted' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review restoration' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm restoration' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Account changed successfully, but refresh failed. Refresh account details to continue.',
        );
        expect(screen.queryByRole('heading', { name: 'target@test.dev' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh account details' }));

        expect(await screen.findByRole('heading', { name: 'target@test.dev' })).toBeInTheDocument();
        expect(screen.getByLabelText('Suspension reason')).toHaveValue('');
        expect(api.restoreAccount).toHaveBeenCalledTimes(1);
    });

    it('retains complete draft after recoverable failure and gives refresh guidance on conflict', async () => {
        api.suspendAccount.mockRejectedValueOnce(new ApiError(409, 'Moderation state changed; refresh and try again'));
        await searchAndOpen();
        fireEvent.change(screen.getByLabelText('Suspension duration'), { target: { value: '7 days' } });
        fireEvent.change(screen.getByLabelText('Suspension reason'), { target: { value: 'Keep this reason' } });
        fireEvent.click(screen.getByLabelText('Unpublish Two (project-2)'));
        fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm suspension' }));

        expect(await screen.findByText('Account changed. Refresh account details before trying again.')).toBeInTheDocument();
        expect(screen.getByLabelText('Suspension reason')).toHaveValue('Keep this reason');
        expect(screen.getByLabelText('Suspension duration')).toHaveValue('7 days');
        expect(screen.getByLabelText('Unpublish Two (project-2)')).toBeChecked();
    });

    it('requires separate restoration reason, confirms it, refreshes, and offers no republish control', async () => {
        api.getModerationUser.mockResolvedValue({
            ...detail, account: { ...account, suspensionStatus: 'active', banReason: 'Old', moderationVersion: 4 },
        });
        await searchAndOpen();
        fireEvent.click(screen.getByRole('button', { name: 'Review restoration' }));
        expect(screen.getByText('Enter a restoration reason from 1 to 1,000 characters.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Restoration reason'), { target: { value: 'Appeal accepted' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review restoration' }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Reason: Appeal accepted')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm restoration' }));

        await waitFor(() => expect(api.restoreAccount).toHaveBeenCalledWith('user-1', {
            reason: 'Appeal accepted', expectedModerationVersion: 4,
        }));
        expect(screen.queryByRole('button', { name: /republish/i })).toBeNull();
        await waitFor(() => expect(api.getModerationUser).toHaveBeenCalledTimes(2));
    });

    it('allows a new suspension when prior suspension is expired', async () => {
        api.getModerationUser.mockResolvedValueOnce({
            ...detail,
            account: { ...account, suspensionStatus: 'expired', banExpires: '2026-07-15T00:00:00.000Z' },
        });
        await searchAndOpen();
        expect(screen.getByText(/Expired suspension/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Review suspension' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Restoration reason')).toBeNull();
    });

    it('shows administrator protection and suppresses all suspension controls', async () => {
        api.getModerationUser.mockResolvedValueOnce({
            ...detail,
            account: { ...account, role: 'admin' },
        });

        await searchAndOpen();

        expect(screen.getByText('Protected moderator account')).toBeInTheDocument();
        expect(screen.queryByLabelText('Suspension duration')).toBeNull();
        expect(screen.queryByLabelText('Suspension reason')).toBeNull();
        expect(screen.queryByLabelText('Restoration reason')).toBeNull();
        expect(screen.queryByRole('button', { name: /Review (suspension|restoration)/ })).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each([
        ['admin', 'user', true, false, false],
        ['admin', 'admin', false, false, false],
        ['admin', 'owner', false, false, false],
        ['owner', 'user', true, true, false],
        ['owner', 'admin', false, false, true],
        ['owner', 'owner', false, false, false],
    ] as const)(
        'enforces %s actor controls for a %s target',
        async (actorRole, targetRole, canSuspend, canPromote, canRevoke) => {
            api.getModerationUser.mockResolvedValueOnce({
                ...detail,
                account: { ...account, role: targetRole },
            });
            await searchAndOpen(actorRole);

            expect(Boolean(screen.queryByRole('button', { name: 'Review suspension' }))).toBe(canSuspend);
            expect(Boolean(screen.queryByRole('button', { name: 'Promote to moderator' }))).toBe(canPromote);
            expect(Boolean(screen.queryByRole('button', { name: 'Remove moderator access' }))).toBe(canRevoke);
            if (!canSuspend && !canPromote && !canRevoke) {
                expect(screen.getByText(/Protected (moderator|owner) account/)).toBeInTheDocument();
                expect(screen.queryByLabelText('Restoration reason')).toBeNull();
            }
        },
    );

    it('confirms and submits an immutable promotion snapshot, then refreshes detail', async () => {
        const promotedDetail = { ...detail, account: { ...account, role: 'admin' as const, moderationVersion: 4 } };
        api.getModerationUser.mockResolvedValueOnce(detail).mockResolvedValueOnce(promotedDetail);
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Trusted reviewer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Account: target@test.dev')).toBeInTheDocument();
        expect(within(dialog).getByText('Account ID: user-1')).toBeInTheDocument();
        expect(within(dialog).getByText('Role transition: user -> admin')).toBeInTheDocument();
        expect(within(dialog).getByText('Reason: Trusted reviewer')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Changed after review' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm promotion' }));

        await waitFor(() => expect(api.promoteAdmin).toHaveBeenCalledWith('user-1', {
            reason: 'Trusted reviewer', expectedModerationVersion: 3,
        }));
        expect(await screen.findByText('Role updated. Target sessions were signed out.')).toBeInTheDocument();
        await waitFor(() => expect(api.getModerationUser).toHaveBeenCalledTimes(2));
        expect(screen.getByText(/target · admin/)).toBeInTheDocument();
    });

    it('confirms demotion with exact suspension, reason, and project snapshots', async () => {
        const now = Date.parse('2026-07-16T12:00:00.000Z');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
        api.getModerationUser.mockResolvedValueOnce({
            ...detail, account: { ...account, role: 'admin' as const },
        });
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Access no longer required' } });
        fireEvent.click(screen.getByLabelText('Suspend account after removing moderator access'));
        fireEvent.change(screen.getByLabelText('Role suspension duration'), { target: { value: '7 days' } });
        fireEvent.click(screen.getByLabelText('Unpublish Two (project-2)'));
        fireEvent.click(screen.getByRole('button', { name: 'Remove moderator access' }));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Account: target@test.dev')).toBeInTheDocument();
        expect(within(dialog).getByText('Account ID: user-1')).toBeInTheDocument();
        expect(within(dialog).getByText('Role transition: admin -> user')).toBeInTheDocument();
        expect(within(dialog).getByText('Suspension: 7 days')).toBeInTheDocument();
        expect(within(dialog).getByText(`Expiry: ${new Date(now + 7 * 24 * 3600000).toISOString()}`)).toBeInTheDocument();
        expect(within(dialog).getByText('Reason: Access no longer required')).toBeInTheDocument();
        expect(within(dialog).getByText('Two (project-2)')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm removal' }));

        await waitFor(() => expect(api.revokeAdmin).toHaveBeenCalledWith('user-1', {
            reason: 'Access no longer required',
            expectedModerationVersion: 3,
            suspension: { expiresAt: new Date(now + 7 * 24 * 3600000).toISOString() },
            projectIdsToUnpublish: ['project-2'],
        }));
        nowSpy.mockRestore();
    });

    it('sends no demotion suspension unless explicitly selected', async () => {
        api.getModerationUser.mockResolvedValueOnce({
            ...detail, account: { ...account, role: 'admin' as const },
        });
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Routine rotation' } });
        fireEvent.click(screen.getByLabelText('Unpublish One (project-1)'));
        fireEvent.click(screen.getByRole('button', { name: 'Remove moderator access' }));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Suspension: None')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm removal' }));
        await waitFor(() => expect(api.revokeAdmin).toHaveBeenCalledWith('user-1', {
            reason: 'Routine rotation', expectedModerationVersion: 3,
            suspension: null, projectIdsToUnpublish: ['project-1'],
        }));
    });

    it('rejects an expired demotion suspension snapshot and preserves its draft', async () => {
        const reviewedAt = Date.parse('2026-07-16T12:00:00.000Z');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(reviewedAt);
        api.getModerationUser.mockResolvedValueOnce({
            ...detail, account: { ...account, role: 'admin' as const },
        });
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Keep role draft' } });
        fireEvent.click(screen.getByLabelText('Suspend account after removing moderator access'));
        fireEvent.change(screen.getByLabelText('Role suspension duration'), { target: { value: '24 hours' } });
        fireEvent.click(screen.getByRole('button', { name: 'Remove moderator access' }));
        nowSpy.mockReturnValue(reviewedAt + 24 * 3600000);
        fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Suspension expiry is no longer in the future. Choose a new duration and review again.',
        );
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByLabelText('Role change reason')).toHaveValue('Keep role draft');
        expect(api.revokeAdmin).not.toHaveBeenCalled();
        nowSpy.mockRestore();
    });

    it('preserves role draft after network failure', async () => {
        api.promoteAdmin.mockRejectedValueOnce(new Error('Network unavailable'));
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Keep promotion reason' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
        expect(screen.getByLabelText('Role change reason')).toHaveValue('Keep promotion reason');
    });

    it('resets owner role drafts when a different target is selected', async () => {
        const secondAccount = { ...account, id: 'user-2', email: 'second@test.dev' };
        api.searchModerationUsers.mockResolvedValueOnce({ users: [account, secondAccount], nextCursor: null });
        api.getModerationUser
            .mockResolvedValueOnce(detail)
            .mockResolvedValueOnce({ ...detail, account: secondAccount });
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'First target draft' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review second@test.dev' }));

        expect(await screen.findByRole('heading', { name: 'second@test.dev' })).toBeInTheDocument();
        expect(screen.getByLabelText('Role change reason')).toHaveValue('');
    });

    it('returns focus to search when a successful role action removes its opener', async () => {
        api.getModerationUser
            .mockResolvedValueOnce(detail)
            .mockReturnValueOnce(new Promise(() => {}));
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Trusted reviewer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));

        await waitFor(() => expect(api.promoteAdmin).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(screen.getByLabelText('Search accounts')).toHaveFocus());
    });

    it('blocks duplicate stale role actions after conflict and guides detail refresh', async () => {
        api.promoteAdmin.mockRejectedValueOnce(new ApiError(409, 'Role changed'));
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Keep conflict draft' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Account changed. Refresh account details before trying again.',
        );
        expect(screen.getByRole('button', { name: 'Refresh account details' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Promote to moderator' })).toBeNull();
        expect(screen.getByLabelText('Role change reason')).toHaveValue('Keep conflict draft');
        expect(api.promoteAdmin).toHaveBeenCalledTimes(1);
    });

    it('resets owner drafts when conflict refresh changes the target role', async () => {
        const promotedDetail = { ...detail, account: { ...account, role: 'admin' as const, moderationVersion: 4 } };
        api.getModerationUser.mockResolvedValueOnce(detail).mockResolvedValueOnce(promotedDetail);
        api.promoteAdmin.mockRejectedValueOnce(new ApiError(409, 'Role changed'));
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Stale promotion draft' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
        await screen.findByText('Account changed. Refresh account details before trying again.');

        fireEvent.click(screen.getByRole('button', { name: 'Refresh account details' }));
        expect(await screen.findByRole('button', { name: 'Remove moderator access' })).toBeInTheDocument();
        expect(screen.getByLabelText('Role change reason')).toHaveValue('');
        expect(screen.getByLabelText('Suspend account after removing moderator access')).not.toBeChecked();
        expect(screen.getByLabelText('Unpublish One (project-1)')).not.toBeChecked();
    });

    it('retains owner drafts when conflict refresh keeps the same target role', async () => {
        const refreshedDetail = { ...detail, account: { ...account, moderationVersion: 4 } };
        api.getModerationUser.mockResolvedValueOnce(detail).mockResolvedValueOnce(refreshedDetail);
        api.promoteAdmin.mockRejectedValueOnce(new ApiError(409, 'Version changed'));
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Still valid promotion draft' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
        await screen.findByText('Account changed. Refresh account details before trying again.');

        fireEvent.click(screen.getByRole('button', { name: 'Refresh account details' }));
        expect(await screen.findByRole('button', { name: 'Promote to moderator' })).toBeInTheDocument();
        expect(screen.getByLabelText('Role change reason')).toHaveValue('Still valid promotion draft');
    });

    it('clears a role-success notice when another target is selected', async () => {
        const secondAccount = { ...account, id: 'user-2', email: 'second@test.dev' };
        const promotedDetail = { ...detail, account: { ...account, role: 'admin' as const, moderationVersion: 4 } };
        api.searchModerationUsers.mockResolvedValueOnce({ users: [account, secondAccount], nextCursor: null });
        api.getModerationUser
            .mockResolvedValueOnce(detail)
            .mockResolvedValueOnce(promotedDetail)
            .mockResolvedValueOnce({ ...detail, account: secondAccount });
        await searchAndOpen('owner');
        fireEvent.change(screen.getByLabelText('Role change reason'), { target: { value: 'Trusted reviewer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Promote to moderator' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
        expect(await screen.findByText('Role updated. Target sessions were signed out.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Review second@test.dev' }));
        expect(await screen.findByRole('heading', { name: 'second@test.dev' })).toBeInTheDocument();
        expect(screen.queryByText('Role updated. Target sessions were signed out.')).toBeNull();
    });

    it('ignores stale search and detail responses instead of replacing newer state', async () => {
        let resolveOldSearch: (value: unknown) => void = () => {};
        const oldAccount = { ...account, id: 'old-user', email: 'old@test.dev' };
        const newAccount = { ...account, id: 'new-user', email: 'new@test.dev' };
        api.searchModerationUsers
            .mockReturnValueOnce(new Promise(resolve => { resolveOldSearch = resolve; }))
            .mockResolvedValueOnce({ users: [newAccount, oldAccount], nextCursor: null });
        renderPage();

        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'old' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'new' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(await screen.findByText('new@test.dev')).toBeInTheDocument();
        resolveOldSearch({ users: [oldAccount], nextCursor: null });
        await waitFor(() => expect(screen.getByText('new@test.dev')).toBeInTheDocument());

        let resolveOldDetail: (value: unknown) => void = () => {};
        api.getModerationUser
            .mockReturnValueOnce(new Promise(resolve => { resolveOldDetail = resolve; }))
            .mockResolvedValueOnce({ ...detail, account: newAccount });
        fireEvent.click(screen.getByRole('button', { name: 'Review old@test.dev' }));
        fireEvent.click(screen.getByRole('button', { name: 'Review new@test.dev' }));
        expect(await screen.findByRole('heading', { name: 'new@test.dev' })).toBeInTheDocument();
        resolveOldDetail({ ...detail, account: oldAccount });
        await waitFor(() => expect(screen.getByRole('heading', { name: 'new@test.dev' })).toBeInTheDocument());
        expect(screen.queryByRole('heading', { name: 'old@test.dev' })).toBeNull();
    });
});
