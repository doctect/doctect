import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
        <Routes><Route path="/gallery" element={<AccountMenu />} /></Routes>
    </MemoryRouter>,
);

const user = (role: 'user' | 'admin' | 'owner', username: string | null = role) => ({
    id: `${role}-1`, email: `${role}@test.dev`, username, role,
});

describe('AccountMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(auth.signOut).toHaveBeenCalledTimes(1);

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
});
