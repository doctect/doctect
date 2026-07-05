import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WelcomePage } from '../../pages/WelcomePage';

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

const renderAt = (initialEntries: any[]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/gallery" element={<div>GALLERY_MARKER</div>} />
            <Route path="/gallery/xyz" element={<div>GALLERY_DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('WelcomePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); });
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: true } });
    });

    it('redirects onward immediately if a username is already set', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'already_set' } }, isPending: false });
        renderAt([{ pathname: '/welcome', state: { from: '/gallery/xyz' } }]);
        expect(await screen.findByText('GALLERY_DETAIL_MARKER')).toBeInTheDocument();
    });

    it('defaults onward to /gallery when there is no "from" state', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: 'already_set' } }, isPending: false });
        renderAt(['/welcome']);
        expect(await screen.findByText('GALLERY_MARKER')).toBeInTheDocument();
    });

    it('shows the username form when there is no username yet', () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null } }, isPending: false });
        renderAt(['/welcome']);
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    it('continues to "from" after successfully choosing a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { username: null } }, isPending: false });
        renderAt([{ pathname: '/welcome', state: { from: '/gallery/xyz' } }]);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(await screen.findByText('GALLERY_DETAIL_MARKER')).toBeInTheDocument();
    });
});
