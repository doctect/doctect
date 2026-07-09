import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

const signUpEmail = vi.fn(async () => ({ data: { user: {} }, error: null }));
const signInEmail = vi.fn(async () => ({ data: null, error: { status: 403, message: 'Email not verified' } }));
const sendVerificationEmail = vi.fn(async () => ({ data: {}, error: null }));
vi.mock('../../lib/auth-client', () => ({
    signIn: { email: (...a: any[]) => signInEmail(...a), social: vi.fn() },
    signUp: { email: (...a: any[]) => signUpEmail(...a) },
    useSession: () => ({ data: null, isPending: false }),
    signOut: vi.fn(),
    authClient: { sendVerificationEmail: (...a: any[]) => sendVerificationEmail(...a) },
}));

const renderAt = (path = '/login') => render(
    <MemoryRouter initialEntries={[path]}><LoginPage /></MemoryRouter>
);

describe('email verification UX', () => {
    beforeEach(() => { signUpEmail.mockClear(); signInEmail.mockClear(); sendVerificationEmail.mockClear(); });

    it('shows the verify panel after signup and can resend', async () => {
        renderAt();
        fireEvent.click(screen.getByText(/sign up/i));
        fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'New User' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@user.dev' } });
        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'newuser' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /sign up|create account/i }));

        await waitFor(() => screen.getByText(/verify your email/i));
        expect(screen.getByText(/new@user.dev/)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /resend/i }));
        await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'new@user.dev' })
        ));
    });

    it('shows the verify panel when sign-in is refused as unverified', async () => {
        renderAt();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'old@user.dev' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
        await waitFor(() => screen.getByText(/verify your email/i));
    });

    it('acknowledges ?verified=1', async () => {
        renderAt('/login?verified=1');
        expect(await screen.findByText(/email verified/i)).toBeTruthy();
    });
});
