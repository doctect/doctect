import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import App, { appRouter } from '../../App';
import { AccountMenu } from '../../components/AccountMenu';

const api = vi.hoisted(() => ({ me: vi.fn() }));
const sessionState = vi.hoisted(() => ({ value: { data: null as any, isPending: false } }));
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('../../services/cloudApi', () => ({ cloudApi: api }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => sessionState.value,
    signOut: auth.signOut, signIn: {}, signUp: {}, authClient: {},
}));
vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../pages/AdminModerationPage', () => ({
    AdminModerationPage: ({ actorRole }: { actorRole: string }) => (
        <div>MODERATION_PAGE:{actorRole}<AccountMenu /></div>
    ),
}));
vi.mock('../../pages/EditorPage', () => ({
    EditorPage: ({ initialWorkspace, initialWarnings }: any) => (
        <div>EDITOR_READY:{initialWorkspace.activeProjectId}:{initialWarnings.join('|')}</div>
    ),
}));
vi.mock('../../components/workspace/WorkspaceBootstrapGate', () => ({
    WorkspaceBootstrapGate: ({ store, renderEditor }: any) => (
        <div data-testid="workspace-bootstrap-gate">
            {renderEditor({
                store,
                initialWorkspace: {
                    projects: [{ id: 'verified-project', name: 'Verified', initialState: {} }],
                    activeProjectId: 'verified-project',
                    customPresets: [],
                    pendingImports: [],
                },
                initialWarnings: ['verified warning'],
            })}
        </div>
    ),
}));
vi.mock('../../pages/LandingPage', () => ({ LandingPage: () => null }));
vi.mock('../../pages/docs/DocsSection', () => ({ DocsSection: () => null }));
vi.mock('../../pages/AnalyticsDashboard', () => ({ AnalyticsDashboard: () => null }));
vi.mock('../../pages/LoginPage', () => ({ LoginPage: () => <LoginLocationState /> }));
vi.mock('../../pages/GalleryPage', () => ({ GalleryPage: () => <div>GALLERY_PAGE</div> }));
vi.mock('../../pages/GalleryDetailPage', () => ({ GalleryDetailPage: () => <div>GALLERY_DETAIL_PAGE</div> }));
vi.mock('../../components/gallery/GalleryDetailModal', () => ({ GalleryDetailModal: () => <div>GALLERY_DETAIL_MODAL</div> }));
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

const deferred = <T,>() => {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
};

const renderRoute = async (path: string) => {
    await act(async () => { await appRouter.navigate(path); });
    let view!: ReturnType<typeof render>;
    await act(async () => {
        view = render(<App />);
        await Promise.resolve();
        await Promise.resolve();
    });
    return view;
};

const renderModerationRoute = () => renderRoute('/admin/moderation');

describe('moderator routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionState.value = { data: null, isPending: false };
    });

    it('shows loading state while fresh account authority resolves', async () => {
        api.me.mockReturnValue(new Promise(() => {}));
        await renderModerationRoute();
        expect(screen.getByLabelText('Loading account authority')).toBeInTheDocument();
    });

    it('redirects a fresh signed-out account to login with source path', async () => {
        api.me.mockResolvedValue(null);
        await renderModerationRoute();
        expect(await screen.findByText('LOGIN_FROM:/admin/moderation')).toBeInTheDocument();
    });

    it('denies a fresh user even when stale Better Auth session says admin', async () => {
        sessionState.value = { data: { user: { role: 'admin' } }, isPending: false };
        api.me.mockResolvedValue(user('user'));
        await renderModerationRoute();
        expect(await screen.findByText('Access denied. Moderators only.')).toBeInTheDocument();
        expect(screen.queryByText(/MODERATION_PAGE/)).toBeNull();
    });

    it.each(['admin', 'owner'] as const)('renders moderation for fresh %s authority', async role => {
        api.me.mockResolvedValue(user(role));
        await renderModerationRoute();
        expect(await screen.findByText(`MODERATION_PAGE:${role}`)).toBeInTheDocument();
    });

    it('unmounts loaded moderation data only after logout completes and replaces with login', async () => {
        const logout = deferred<void>();
        auth.signOut.mockReturnValueOnce(logout.promise);
        api.me.mockResolvedValue(user('admin'));
        await renderModerationRoute();
        expect(await screen.findByText('MODERATION_PAGE:admin')).toBeInTheDocument();
        fireEvent.click(await screen.findByTitle('Account'));
        api.me.mockResolvedValueOnce(null);

        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

        expect(screen.getByText('MODERATION_PAGE:admin')).toBeInTheDocument();
        await act(async () => {
            logout.resolve();
            await logout.promise;
        });
        await waitFor(() => expect(screen.queryByText('MODERATION_PAGE:admin')).toBeNull());
        expect(await screen.findByText('LOGIN_FROM:')).toBeInTheDocument();
    });

    it('routes /app through workspace bootstrap before mounting the editor', async () => {
        await renderRoute('/app');

        expect(screen.getByTestId('workspace-bootstrap-gate')).toBeVisible();
        expect(screen.getByText('EDITOR_READY:verified-project:verified warning')).toBeVisible();
    });

    it('preserves gallery background content under a data-router modal location', async () => {
        await act(async () => { await appRouter.navigate('/gallery'); });
        const backgroundLocation = appRouter.state.location;
        await act(async () => {
            await appRouter.navigate('/gallery/project-1', { state: { backgroundLocation } });
        });
        render(<App />);

        expect(screen.getByText('GALLERY_PAGE')).toBeVisible();
        expect(screen.getByText('GALLERY_DETAIL_MODAL')).toBeVisible();
        expect(screen.queryByText('GALLERY_DETAIL_PAGE')).not.toBeInTheDocument();
    });
});
