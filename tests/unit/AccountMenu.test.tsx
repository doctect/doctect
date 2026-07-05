import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AccountMenu } from '../../components/AccountMenu';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    signOut: vi.fn(),
}));

const renderAt = (initialEntries: any[]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <Routes>
            <Route path="/gallery" element={<AccountMenu />} />
        </Routes>
    </MemoryRouter>
);

describe('AccountMenu', () => {
    it('shows a sign-in link when signed out', () => {
        mockUseSession.mockReturnValue({ data: null, isPending: false });
        renderAt(['/gallery']);
        expect(screen.getByText('Sign in')).toBeInTheDocument();
    });

    it('shows the username and links My profile to /u/<username> when set', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro', name: 'Real Name' } }, isPending: false });
        renderAt(['/gallery']);
        fireEvent.click(screen.getByTitle('Account'));
        expect(screen.getByText('planner_pro')).toBeInTheDocument();
        expect(screen.getByText('My profile').closest('a')).toHaveAttribute('href', '/u/planner_pro');
    });

    it('shows "Set username" and links My profile to /welcome when no username is set', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null, name: 'Real Name' } }, isPending: false });
        renderAt(['/gallery']);
        fireEvent.click(screen.getByTitle('Account'));
        expect(screen.getByText('Set username')).toBeInTheDocument();
        expect(screen.getByText('My profile').closest('a')).toHaveAttribute('href', '/welcome');
    });

    it('includes an Account settings link to /account', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'planner_pro', name: 'Real Name' } }, isPending: false });
        renderAt(['/gallery']);
        fireEvent.click(screen.getByTitle('Account'));
        expect(screen.getByText('Account settings').closest('a')).toHaveAttribute('href', '/account');
    });
});
