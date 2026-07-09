import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

vi.mock('../../lib/auth-client', () => ({
    signIn: {
        email: vi.fn(),
        social: vi.fn(),
    },
    signUp: {
        email: vi.fn((_creds: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); }),
    },
    useSession: () => ({ data: null, isPending: false }),
}));

import { signUp } from '../../lib/auth-client';

const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);

const switchToSignUp = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
};

describe('signup password policy UI', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows the policy message and does not call signUp for a weak password', async () => {
        renderPage();
        switchToSignUp();
        fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Some User' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.dev' } });
        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'someuser' } });
        fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password1234' } });
        fireEvent.click(screen.getByRole('button', { name: /sign up|create account/i }));
        await waitFor(() => {
            expect(screen.getByText(/at least 3 of: lowercase, uppercase, digits, symbols/i)).toBeTruthy();
        });
        expect(signUp.email).not.toHaveBeenCalled();
    });

    it('submits when the password satisfies the policy', async () => {
        renderPage();
        switchToSignUp();
        fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Some User' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.dev' } });
        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'someuser' } });
        fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /sign up|create account/i }));
        await waitFor(() => expect(signUp.email).toHaveBeenCalled());
    });
});
