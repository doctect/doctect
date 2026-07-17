import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigationType } from 'react-router-dom';
import { AccountMenu } from '../../components/AccountMenu';

const api = vi.hoisted(() => ({ me: vi.fn() }));
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
const sessionState = vi.hoisted(() => ({ value: { data: null as any, isPending: false } }));

vi.mock('../../services/cloudApi', () => ({ cloudApi: api }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => sessionState.value,
    signOut: auth.signOut,
}));

const renderAt = () => render(
    <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
            <Route path="/gallery" element={<AccountMenu />} />
            <Route path="/login" element={<LoginDestination />} />
        </Routes>
    </MemoryRouter>,
);

function LoginDestination() {
    return <div>LOGIN_PAGE:{useNavigationType()}</div>;
}

const deferred = <T,>() => {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

const user = (role: 'user' | 'admin' | 'owner', username: string | null = role) => ({
    id: `${role}-1`, email: `${role}@test.dev`, username, role,
});

describe('AccountMenu', () => {
    beforeEach(() => {
        api.me.mockReset();
        auth.signOut.mockReset();
        sessionState.value = { data: null, isPending: false };
    });

    it('shows a sign-in link when fresh account lookup is signed out', async () => {
        api.me.mockResolvedValue(null);
        renderAt();
        expect(await screen.findByText('Sign in')).toBeInTheDocument();
    });

    it('shows authority failure controls instead of sign-in and retries safely', async () => {
        api.me.mockRejectedValueOnce(new Error('Authority unavailable'));
        renderAt();

        expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify account authority.');
        expect(screen.queryByText('Sign in')).toBeNull();
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

        api.me.mockResolvedValueOnce(user('admin', 'recovered-admin'));
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByTitle('Account')).toHaveTextContent('recovered-admin');
    });

    it('uses fresh username for profile routing', async () => {
        api.me.mockResolvedValue(user('user', 'planner_pro'));
        renderAt();
        fireEvent.click(await screen.findByTitle('Account'));
        expect(screen.getByText('planner_pro')).toBeInTheDocument();
        expect(screen.getByText('My profile').closest('a')).toHaveAttribute('href', '/u/planner_pro');
    });

    it('routes a fresh account without username through welcome', async () => {
        api.me.mockResolvedValue(user('user', null));
        renderAt();
        fireEvent.click(await screen.findByTitle('Account'));
        expect(screen.getByText('Set username')).toBeInTheDocument();
        expect(screen.getByText('My profile').closest('a')).toHaveAttribute('href', '/welcome');
    });

    it.each(['admin', 'owner'] as const)('shows Moderation to fresh %s authority', async role => {
        api.me.mockResolvedValue(user(role));
        renderAt();
        fireEvent.click(await screen.findByTitle('Account'));
        expect(screen.getByText('Moderation').closest('a')).toHaveAttribute('href', '/admin/moderation');
    });

    it('hides Moderation from a fresh user despite stale session admin role', async () => {
        sessionState.value = { data: { user: { role: 'admin', username: 'stale-admin' } }, isPending: false };
        api.me.mockResolvedValue(user('user', 'ordinary'));
        renderAt();
        fireEvent.click(await screen.findByTitle('Account'));
        expect(screen.queryByText('Moderation')).toBeNull();
        expect(screen.getByText('ordinary')).toBeInTheDocument();
    });

    it('awaits sign-out, refreshes fresh authority, then routes to login', async () => {
        const logout = deferred<void>();
        const authority = deferred<ReturnType<typeof user> | null>();
        auth.signOut.mockReturnValueOnce(logout.promise);
        api.me.mockResolvedValueOnce(user('admin')).mockReturnValueOnce(authority.promise);
        renderAt();
        fireEvent.click(await screen.findByTitle('Account'));

        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

        expect(api.me).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('LOGIN_PAGE')).toBeNull();
        await act(async () => {
            logout.resolve();
            await logout.promise;
        });
        await waitFor(() => expect(api.me).toHaveBeenCalledTimes(2));
        expect(screen.queryByText(/LOGIN_PAGE/)).toBeNull();
        await act(async () => {
            authority.resolve(null);
            await authority.promise;
        });
        expect(await screen.findByText('LOGIN_PAGE:REPLACE')).toBeInTheDocument();
    });

    it('handles sign-out failure without navigating away', async () => {
        auth.signOut.mockRejectedValueOnce(new Error('Sign-out unavailable'));
        api.me.mockResolvedValueOnce(user('admin'));
        renderAt();
        fireEvent.click(await screen.findByTitle('Account'));

        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign out. Try again.');
        expect(screen.queryByText(/LOGIN_PAGE/)).toBeNull();
        expect(api.me).toHaveBeenCalledTimes(1);
    });
});
