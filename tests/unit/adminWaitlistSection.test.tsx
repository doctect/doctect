import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminWaitlistSection } from '../../components/AdminWaitlistSection';

const mocks = vi.hoisted(() => ({ getAdminWaitlist: vi.fn() }));

vi.mock('../../services/cloudApi', async importOriginal => {
    const actual: any = await importOriginal();
    return { ...actual, cloudApi: { ...actual.cloudApi, getAdminWaitlist: mocks.getAdminWaitlist } };
});

describe('AdminWaitlistSection', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists waitlist entries with a count', async () => {
        mocks.getAdminWaitlist.mockResolvedValue({
            count: 2,
            entries: [
                { email: 'b@test.dev', createdAt: '2026-07-19T10:00:00.000Z' },
                { email: 'a@test.dev', createdAt: '2026-07-18T10:00:00.000Z' },
            ],
        });
        render(<AdminWaitlistSection />);
        expect(await screen.findByText('Waitlist (2)')).toBeInTheDocument();
        expect(screen.getByText('b@test.dev')).toBeInTheDocument();
        expect(screen.getByText('a@test.dev')).toBeInTheDocument();
    });

    it('shows an empty state', async () => {
        mocks.getAdminWaitlist.mockResolvedValue({ count: 0, entries: [] });
        render(<AdminWaitlistSection />);
        expect(await screen.findByText('No one is waiting.')).toBeInTheDocument();
    });

    it('surfaces a load failure', async () => {
        mocks.getAdminWaitlist.mockRejectedValue(new Error('Forbidden: Admins only'));
        render(<AdminWaitlistSection />);
        expect(await screen.findByText('Forbidden: Admins only')).toBeInTheDocument();
    });
});
