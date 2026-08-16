import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

const signUpEmail = vi.fn(async (..._args: any[]) => ({ data: { user: {} }, error: null }));
const signInEmail = vi.fn(async (..._args: any[]) => ({ data: null, error: { status: 403, message: 'Email not verified' } }));
const sendVerificationEmail = vi.fn(async (..._args: any[]) => ({ data: {}, error: null }));
let sessionData: any = null;
vi.mock('../../lib/auth-client', () => ({
    signIn: { email: (...a: any[]) => signInEmail(...a), social: vi.fn() },
    signUp: { email: (...a: any[]) => signUpEmail(...a) },
    useSession: () => ({ data: sessionData, isPending: false }),
    signOut: vi.fn(),
    authClient: { sendVerificationEmail: (...a: any[]) => sendVerificationEmail(...a) },
}));

const renderAt = (path: any = '/login') => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/gallery/xyz" element={<div>GALLERY_DETAIL_MARKER</div>} />
            <Route path="/app" element={<div>APP_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('email verification UX', () => {
    beforeEach(() => {
        signUpEmail.mockClear(); signInEmail.mockClear(); sendVerificationEmail.mockClear();
        sessionData = null;
    });

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

    it('does NOT show the verify panel for a banned user, even though the status is also 403', async () => {
        signInEmail.mockImplementationOnce(async () => ({
            data: null,
            error: { status: 403, code: 'BANNED_USER', message: 'You have been banned from this application.' },
        }));
        renderAt();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'banned@user.dev' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
        await waitFor(() => screen.getByText(/banned/i));
        expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
    });

    it('acknowledges ?verified=1', async () => {
        renderAt('/login?verified=1');
        expect(await screen.findByText(/email verified/i)).toBeTruthy();
    });

    it('continues to the default destination when landing on ?verified=1 with a session', async () => {
        sessionData = { user: { id: 'u1', email: 'new@user.dev' } };
        renderAt('/login?verified=1');
        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
    });

    it('continues to the "from" destination when landing on ?verified=1 with a session', async () => {
        sessionData = { user: { id: 'u1', email: 'new@user.dev' } };
        renderAt({ pathname: '/login', search: '?verified=1', state: { from: '/gallery/xyz' } });
        expect(await screen.findByText('GALLERY_DETAIL_MARKER')).toBeInTheDocument();
    });
});
