import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountSettingsPage } from '../../pages/AccountSettingsPage';

const mockUseSession = vi.fn();
const mockUpdateUser = vi.fn();
const mockIsUsernameAvailable = vi.fn();

vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    authClient: {
        updateUser: (...args: any[]) => mockUpdateUser(...args),
        isUsernameAvailable: (...args: any[]) => mockIsUsernameAvailable(...args),
    },
}));

const renderPage = () => render(
    <MemoryRouter initialEntries={['/account']}>
        <AccountSettingsPage />
    </MemoryRouter>
);

describe('AccountSettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); });
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: true } });
    });

    it('pre-fills the current username', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'current_handle', email: 'a@b.com' } }, isPending: false });
        renderPage();
        expect(screen.getByDisplayValue('current_handle')).toBeInTheDocument();
    });

    it('shows a confirmation after a successful change, without navigating away', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'current_handle', email: 'a@b.com' } }, isPending: false });
        renderPage();
        fireEvent.change(screen.getByDisplayValue('current_handle'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('Username updated.')).toBeInTheDocument();
    });
});
