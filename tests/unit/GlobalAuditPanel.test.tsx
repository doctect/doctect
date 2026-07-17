import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalAuditPanel } from '../../components/moderation/GlobalAuditPanel';

const api = vi.hoisted(() => ({
    getGlobalAudit: vi.fn(),
}));

vi.mock('../../services/cloudApi', async importOriginal => ({
    ...(await importOriginal()),
    cloudApi: api,
}));

const auditAction = (overrides: Record<string, unknown> = {}) => ({
    id: 'audit-1',
    actorKind: 'user' as const,
    actorUserId: 'actor-1',
    actorEmail: 'actor@test.dev',
    targetUserId: 'target-1',
    targetEmail: 'target@test.dev',
    projectId: null,
    reviewId: null,
    action: 'admin_promoted' as const,
    reason: 'Trusted reviewer',
    expiresAt: null,
    createdAt: '2026-07-16T12:00:00.000Z',
    metadata: { source: 'owner_role_workflow' as const, previousRole: 'user' as const, newRole: 'admin' as const },
    ...overrides,
});

const renderPanel = () => render(<GlobalAuditPanel actorRole="owner" />);

describe('GlobalAuditPanel global audit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.getGlobalAudit.mockResolvedValue({ items: [], nextCursor: null });
    });

    it('submits exact ISO filters and appends a cursor page using the frozen filter snapshot', async () => {
        api.getGlobalAudit
            .mockResolvedValueOnce({ items: [auditAction()], nextCursor: 'audit-cursor' })
            .mockResolvedValueOnce({
                items: [auditAction({ id: 'audit-2', reason: 'Access rotated', action: 'admin_demoted' })],
                nextCursor: null,
            });
        renderPanel();

        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'actor@test.dev' } });
        fireEvent.change(screen.getByLabelText('Audit target email'), { target: { value: 'target@test.dev' } });
        fireEvent.change(screen.getByLabelText('Audit action'), { target: { value: 'admin_promoted' } });
        fireEvent.change(screen.getByLabelText('Audit from'), { target: { value: '2026-07-01T08:30' } });
        fireEvent.change(screen.getByLabelText('Audit to'), { target: { value: '2026-07-16T18:45' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));

        await waitFor(() => expect(api.getGlobalAudit).toHaveBeenCalledWith({
            actorEmail: 'actor@test.dev',
            targetEmail: 'target@test.dev',
            action: 'admin_promoted',
            from: new Date('2026-07-01T08:30').toISOString(),
            to: new Date('2026-07-16T18:45').toISOString(),
        }));
        expect(await screen.findByText('Trusted reviewer')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'changed@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'More audit actions' }));

        expect(await screen.findByText('Access rotated')).toBeInTheDocument();
        expect(screen.getByText('Trusted reviewer')).toBeInTheDocument();
        expect(api.getGlobalAudit).toHaveBeenLastCalledWith({
            actorEmail: 'actor@test.dev',
            targetEmail: 'target@test.dev',
            action: 'admin_promoted',
            from: new Date('2026-07-01T08:30').toISOString(),
            to: new Date('2026-07-16T18:45').toISOString(),
            cursor: 'audit-cursor',
        });
    });

    it('renders system and nullable identities plus whitelisted metadata only', async () => {
        api.getGlobalAudit.mockResolvedValueOnce({
            items: [
                auditAction({
                    id: 'system-action', actorKind: 'system', actorUserId: null,
                    actorEmail: 'OWNER_EMAILS reconciliation', targetUserId: null, targetEmail: null,
                    action: 'owner_granted', reason: 'Configured owner',
                    metadata: {
                        source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner',
                        unsafeSecret: 'must-not-render',
                    },
                }),
                auditAction({
                    id: 'project-action', projectId: 'project-1', action: 'project_unpublished',
                    reason: 'Policy violation', metadata: {
                        source: 'standalone_project', previousProjectVisibility: 'public',
                    },
                }),
                auditAction({
                    id: 'review-action', reviewId: 'review-1', action: 'review_deleted',
                    reason: 'Harassment', metadata: { source: 'standalone_review', deletedReviewRating: 4 },
                }),
            ],
            nextCursor: null,
        });
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));

        const items = await screen.findAllByRole('listitem');
        expect(within(items[0]).getByText('Actor: System (OWNER_EMAILS reconciliation)')).toBeInTheDocument();
        expect(within(items[0]).getByText('Actor ID: None')).toBeInTheDocument();
        expect(within(items[0]).getByText('Target: None')).toBeInTheDocument();
        expect(within(items[0]).getByText('Target ID: None')).toBeInTheDocument();
        expect(within(items[0]).getByText('Project ID: None')).toBeInTheDocument();
        expect(within(items[0]).getByText('Review ID: None')).toBeInTheDocument();
        expect(within(items[0]).getByText('Role: user -> owner')).toBeInTheDocument();
        expect(within(items[1]).getByText('Previous project visibility: public')).toBeInTheDocument();
        expect(within(items[2]).getByText('Deleted review rating: 4')).toBeInTheDocument();
        expect(screen.getByText('Source: owner emails reconciliation')).toBeInTheDocument();
        expect(screen.queryByText('must-not-render')).toBeNull();
        expect(screen.queryByText(/unsafeSecret/)).toBeNull();
    });

    it('blocks invalid and reversed date ranges before requesting global audit', () => {
        renderPanel();
        fireEvent.change(screen.getByLabelText('Audit from'), { target: { value: '999999-01-01T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid audit date range.');
        expect(api.getGlobalAudit).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Audit from'), { target: { value: '2026-07-17T00:00' } });
        fireEvent.change(screen.getByLabelText('Audit to'), { target: { value: '2026-07-16T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Audit from must be before or equal to audit to.');
        expect(api.getGlobalAudit).not.toHaveBeenCalled();
    });

    it('resets filters, errors, results, and pagination', async () => {
        api.getGlobalAudit.mockResolvedValueOnce({ items: [auditAction()], nextCursor: 'audit-cursor' });
        renderPanel();
        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'actor@test.dev' } });
        fireEvent.change(screen.getByLabelText('Audit target email'), { target: { value: 'target@test.dev' } });
        fireEvent.change(screen.getByLabelText('Audit action'), { target: { value: 'admin_promoted' } });
        fireEvent.change(screen.getByLabelText('Audit to'), { target: { value: '2026-07-16T18:45' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        expect(await screen.findByText('Trusted reviewer')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Audit from'), { target: { value: '999999-01-01T00:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid audit date range.');

        fireEvent.click(screen.getByRole('button', { name: 'Reset global audit' }));

        expect(screen.getByLabelText('Audit actor email')).toHaveValue('');
        expect(screen.getByLabelText('Audit target email')).toHaveValue('');
        expect(screen.getByLabelText('Audit action')).toHaveValue('');
        expect(screen.getByLabelText('Audit from')).toHaveValue('');
        expect(screen.getByLabelText('Audit to')).toHaveValue('');
        expect(screen.queryByText('Trusted reviewer')).toBeNull();
        expect(screen.queryByRole('button', { name: 'More audit actions' })).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('keeps old cursor filters after a replacement search fails', async () => {
        api.getGlobalAudit
            .mockResolvedValueOnce({ items: [auditAction()], nextCursor: 'old-cursor' })
            .mockRejectedValueOnce(new Error('Replacement unavailable'))
            .mockResolvedValueOnce({
                items: [auditAction({ id: 'old-page-2', reason: 'Old page two' })],
                nextCursor: null,
            });
        renderPanel();
        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'old@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        expect(await screen.findByText('Trusted reviewer')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'new@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Replacement unavailable');
        expect(screen.getByText('Trusted reviewer')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'More audit actions' }));

        expect(await screen.findByText('Old page two')).toBeInTheDocument();
        expect(api.getGlobalAudit).toHaveBeenLastCalledWith({
            actorEmail: 'old@test.dev',
            cursor: 'old-cursor',
        });
    });

    it('ignores a stale global audit response after a newer filter response', async () => {
        let resolveOld: (value: unknown) => void = () => {};
        let resolveNew: (value: unknown) => void = () => {};
        api.getGlobalAudit
            .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
            .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
        renderPanel();

        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'old@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));
        fireEvent.change(screen.getByLabelText('Audit actor email'), { target: { value: 'new@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search global audit' }));

        resolveNew({ items: [auditAction({ id: 'new', reason: 'New response' })], nextCursor: null });
        expect(await screen.findByText('New response')).toBeInTheDocument();
        resolveOld({ items: [auditAction({ id: 'old', reason: 'Old response' })], nextCursor: null });
        await waitFor(() => expect(screen.queryByText('Old response')).toBeNull());
        expect(screen.getByText('New response')).toBeInTheDocument();
    });
});
