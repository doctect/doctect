import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import App from '../../App';

const api = vi.hoisted(() => ({ me: vi.fn() }));
const sessionState = vi.hoisted(() => ({ value: { data: null as any, isPending: false } }));

vi.mock('../../services/cloudApi', () => ({ cloudApi: api }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => sessionState.value,
    signOut: vi.fn(), signIn: {}, signUp: {}, authClient: {},
}));
vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../pages/AdminModerationPage', () => ({
    AdminModerationPage: ({ actorRole }: { actorRole: string }) => <div>MODERATION_PAGE:{actorRole}</div>,
}));
vi.mock('../../pages/EditorPage', () => ({ EditorPage: () => null }));
vi.mock('../../pages/LandingPage', () => ({ LandingPage: () => null }));
vi.mock('../../pages/DocsPage', () => ({ DocsPage: () => null }));
vi.mock('../../pages/AnalyticsDashboard', () => ({ AnalyticsDashboard: () => null }));
vi.mock('../../pages/LoginPage', () => ({ LoginPage: () => <LoginLocationState /> }));
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

const user = (role: 'user' | 'admin' | 'owner') => ({
    id: `${role}-1`, email: `${role}@test.dev`, username: role, role,
});

const renderModerationRoute = () => {
    window.history.pushState({}, '', '/admin/moderation');
    return render(<App />);
};

describe('moderator routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionState.value = { data: null, isPending: false };
    });

    it('shows loading state while fresh account authority resolves', () => {
        api.me.mockReturnValue(new Promise(() => {}));
        renderModerationRoute();
        expect(screen.getByLabelText('Loading account authority')).toBeInTheDocument();
    });

    it('redirects a fresh signed-out account to login with source path', async () => {
        api.me.mockResolvedValue(null);
        renderModerationRoute();
        expect(await screen.findByText('LOGIN_FROM:/admin/moderation')).toBeInTheDocument();
    });

    it('denies a fresh user even when stale Better Auth session says admin', async () => {
        sessionState.value = { data: { user: { role: 'admin' } }, isPending: false };
        api.me.mockResolvedValue(user('user'));
        renderModerationRoute();
        expect(await screen.findByText('Access denied. Moderators only.')).toBeInTheDocument();
        expect(screen.queryByText(/MODERATION_PAGE/)).toBeNull();
    });

    it.each(['admin', 'owner'] as const)('renders moderation for fresh %s authority', async role => {
        api.me.mockResolvedValue(user(role));
        renderModerationRoute();
        expect(await screen.findByText(`MODERATION_PAGE:${role}`)).toBeInTheDocument();
    });
});
