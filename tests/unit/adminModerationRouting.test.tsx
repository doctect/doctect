import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import App, { AdminGuard } from '../../App';

const sessionState = vi.hoisted(() => ({ value: { data: null as any, isPending: false } }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => sessionState.value,
    signOut: vi.fn(), signIn: {}, signUp: {}, authClient: {},
}));
vi.mock('../../pages/AdminModerationPage', () => ({
    AdminModerationPage: () => <div>MODERATION_PAGE_MARKER</div>,
}));
vi.mock('../../pages/EditorPage', () => ({
    EditorPage: () => <div>EDITOR_PAGE_MARKER</div>,
}));
vi.mock('../../pages/LandingPage', () => ({ LandingPage: () => null }));
vi.mock('../../pages/DocsPage', () => ({ DocsPage: () => null }));
vi.mock('../../pages/AnalyticsDashboard', () => ({ AnalyticsDashboard: () => null }));
vi.mock('../../pages/LoginPage', () => ({ LoginPage: () => null }));
vi.mock('../../pages/GalleryPage', () => ({ GalleryPage: () => null }));
vi.mock('../../pages/GalleryDetailPage', () => ({ GalleryDetailPage: () => null }));
vi.mock('../../components/gallery/GalleryDetailModal', () => ({ GalleryDetailModal: () => null }));
vi.mock('../../pages/ProfilePage', () => ({ ProfilePage: () => null }));
vi.mock('../../pages/MergeRequestPage', () => ({ MergeRequestPage: () => null }));
vi.mock('../../pages/WelcomePage', () => ({ WelcomePage: () => null }));
vi.mock('../../pages/AccountSettingsPage', () => ({ AccountSettingsPage: () => null }));
vi.mock('../../pages/MyProjectsPage', () => ({ MyProjectsPage: () => null }));

function LoginLocationState() {
    const location = useLocation();
    return <div>LOGIN_FROM:{(location.state as { from?: string } | null)?.from}</div>;
}

describe('AdminGuard', () => {
    beforeEach(() => { sessionState.value = { data: null, isPending: false }; });

    it('shows loading state while session resolves', () => {
        sessionState.value = { data: null, isPending: true };
        render(<MemoryRouter><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.getByLabelText('Loading session')).toBeInTheDocument();
    });

    it('redirects signed-out users to login and preserves the source path', () => {
        render(
            <MemoryRouter initialEntries={['/admin/moderation']}>
                <Routes>
                    <Route path="/admin/moderation" element={<AdminGuard><div>SECRET</div></AdminGuard>} />
                    <Route path="/login" element={<LoginLocationState />} />
                </Routes>
            </MemoryRouter>,
        );
        expect(screen.queryByText('SECRET')).toBeNull();
        expect(screen.getByText('LOGIN_FROM:/admin/moderation')).toBeInTheDocument();
    });

    it('shows access denied to a signed-in non-admin', () => {
        sessionState.value = { data: { user: { role: null } }, isPending: false };
        render(<MemoryRouter><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.getByText('Access denied. Administrators only.')).toBeInTheDocument();
    });

    it('renders children for an admin', () => {
        sessionState.value = { data: { user: { role: 'admin' } }, isPending: false };
        render(<MemoryRouter><AdminGuard><div>SECRET</div></AdminGuard></MemoryRouter>);
        expect(screen.getByText('SECRET')).toBeInTheDocument();
    });

    it('wires /admin/moderation through AdminGuard', () => {
        sessionState.value = { data: { user: { role: 'admin' } }, isPending: false };
        window.history.pushState({}, '', '/admin/moderation');
        render(<App />);
        expect(screen.getByText('MODERATION_PAGE_MARKER')).toBeInTheDocument();
    });
});
