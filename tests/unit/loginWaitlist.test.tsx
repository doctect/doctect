import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

const mocks = vi.hoisted(() => ({
    getSignupStatus: vi.fn(),
    joinWaitlist: vi.fn(),
    signUpEmail: vi.fn(),
    signInSocial: vi.fn(),
}));

vi.mock('../../lib/auth-client', () => ({
    signIn: { email: vi.fn(), social: mocks.signInSocial },
    signUp: { email: mocks.signUpEmail },
    authClient: { sendVerificationEmail: vi.fn() },
    useSession: () => ({ data: null, isPending: false }),
}));

vi.mock('../../services/cloudApi', async importOriginal => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        cloudApi: { ...actual.cloudApi, getSignupStatus: mocks.getSignupStatus, joinWaitlist: mocks.joinWaitlist },
    };
});

const renderLogin = (entry: string = '/login') => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/login" element={<LoginPage />} /></Routes>
    </MemoryRouter>
);

const openSignUpView = () => fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

describe('LoginPage waitlist behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.joinWaitlist.mockResolvedValue({ ok: true });
    });

    it('replaces the signup form with the waitlist panel when signups are closed', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        renderLogin();
        openSignUpView();
        expect(await screen.findByText(/Free accounts are full/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
        expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument();
    });

    it('joins the waitlist and confirms', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        renderLogin();
        openSignUpView();
        await screen.findByText(/Free accounts are full/);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'waitfan@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
        expect(await screen.findByText(/You're on the list/)).toBeInTheDocument();
        expect(mocks.joinWaitlist).toHaveBeenCalledWith('waitfan@test.dev');
    });

    it('surfaces a join failure', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        mocks.joinWaitlist.mockRejectedValue(new Error('Enter a valid email address.'));
        renderLogin();
        openSignUpView();
        await screen.findByText(/Free accounts are full/);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad@test.dev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
        expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    });

    it('leaves the Sign In view untouched when signups are closed', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: false });
        renderLogin();
        await waitFor(() => expect(mocks.getSignupStatus).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
        expect(screen.queryByText(/Free accounts are full/)).not.toBeInTheDocument();
    });

    it('falls back to the signup form when the status fetch fails', async () => {
        mocks.getSignupStatus.mockRejectedValue(new Error('network down'));
        renderLogin();
        openSignUpView();
        expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    });

    it('switches to the waitlist panel when signup submit hits the cap', async () => {
        mocks.getSignupStatus.mockResolvedValue({ open: true });
        mocks.signUpEmail.mockImplementation((_creds: any, handlers: any) => {
            handlers.onError({ error: { code: 'SIGNUP_CAP_REACHED', message: 'Signups are temporarily closed' } });
            return Promise.resolve();
        });
        renderLogin();
        openSignUpView();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Late Arrival' } });
        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'late_arrival' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'late@test.dev' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password-1234!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
        expect(await screen.findByText(/Free accounts are full/)).toBeInTheDocument();
    });
});
