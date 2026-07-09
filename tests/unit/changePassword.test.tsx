import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountSettingsPage } from '../../pages/AccountSettingsPage';

const changePassword = vi.fn(async () => ({ data: {}, error: null }));
// better-auth's real /list-accounts endpoint returns objects keyed by `providerId`
// (verified against a live server: node_modules/better-auth/dist/api/routes/account.mjs
// maps `providerId: a.providerId` into the response) -- NOT `provider`. The mock must
// match the real wire shape or this test can pass while the app is broken against the
// actual API.
let accounts: { providerId: string }[] = [{ providerId: 'credential' }];
vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: { user: { id: 'u1', email: 'a@b.dev', username: 'someuser' } }, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(),
    authClient: {
        changePassword: (...args: any[]) => changePassword(...args),
        listAccounts: vi.fn(async () => ({ data: accounts, error: null })),
    },
}));

const renderPage = () => render(<MemoryRouter><AccountSettingsPage /></MemoryRouter>);

describe('change password section', () => {
    beforeEach(() => { changePassword.mockClear(); accounts = [{ providerId: 'credential' }]; });

    it('renders for credential accounts and submits a valid change with revokeOtherSessions', async () => {
        renderPage();
        await waitFor(() => screen.getByText(/change password/i));
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Old-Pass-1234!' } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'New-Pass-5678!' } });
        fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'New-Pass-5678!' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        await waitFor(() => expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({
            currentPassword: 'Old-Pass-1234!',
            newPassword: 'New-Pass-5678!',
            revokeOtherSessions: true,
        })));
        await waitFor(() => screen.getByText(/password updated/i));
    });

    it('blocks submit when the new password fails policy', async () => {
        renderPage();
        await waitFor(() => screen.getByText(/change password/i));
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Old-Pass-1234!' } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'password1234' } });
        fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'password1234' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(await screen.findByText(/at least 3 of/i)).toBeTruthy();
        expect(changePassword).not.toHaveBeenCalled();
    });

    it('blocks submit when confirmation does not match', async () => {
        renderPage();
        await waitFor(() => screen.getByText(/change password/i));
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Old-Pass-1234!' } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'New-Pass-5678!' } });
        fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'Different-99!' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(await screen.findByText(/do not match/i)).toBeTruthy();
        expect(changePassword).not.toHaveBeenCalled();
    });

    it('is hidden for Google-only accounts', async () => {
        accounts = [{ providerId: 'google' }];
        renderPage();
        await waitFor(() => expect(screen.queryByText(/change password/i)).toBeNull());
    });
});
