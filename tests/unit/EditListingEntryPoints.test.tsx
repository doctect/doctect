import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryDetailBody } from '../../components/gallery/GalleryDetailBody';
import { MyProjectsPage } from '../../pages/MyProjectsPage';
import { CloudMenu } from '../../components/cloud/CloudMenu';
import { cloudApi } from '../../services/cloudApi';
import type { Project } from '../../pages/EditorPage';
// Type-only (erased before the hoisted vi.mock below runs, so it does not defeat it): pins the
// stand-in to the real wrapper's props instead of a hand-copied guess. A stand-in that quietly
// accepted a different shape is how this codebase once shipped a component that never rendered.
import type { LazyEditListingModalProps } from '../../components/cloud/LazyEditListingModal';

vi.mock('../../components/cloud/LazyEditListingModal', () => ({
    LazyEditListingModal: ({ projectId }: LazyEditListingModalProps) =>
        <div>{`edit listing modal for ${projectId}`}</div>,
}));
vi.mock('../../components/cloud/HistoryModal', () => ({ HistoryModal: () => null }));

const mockUseSession = vi.fn(() => ({ data: null } as any));
vi.mock('../../lib/auth-client', () => ({ useSession: () => mockUseSession() }));

// CloudMenu statically imports PublishModal, which imports thumbnailService, which loads
// pdfjs-dist at module scope; pdfjs-dist touches DOMMatrix as soon as it is evaluated, which
// jsdom does not provide. Nothing here exercises publishing, so stub the one function that
// pulls it in -- resolving to the real contract's shape (an array of { nodeId, dataUrl }).
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails: vi.fn(async () => []) }));

const detail = (isOwner: boolean): any => ({
    project: {
        id: 'p1', name: 'Planner', description: '', tags: [], author: 'me', ownerId: 'u1',
        forkCount: 0, downloadCount: 0, updatedAt: '', headCommitId: 'c1',
        thumbnailIds: [], previews: [], forkedFrom: null, ratingAvg: null, ratingCount: 0,
    },
    busy: null, mrs: [], isOwner, session: { user: { id: 'u1', username: 'me' } }, fromPath: '/gallery',
    openInEditor: vi.fn(), fork: vi.fn(), downloadAllVariants: vi.fn(), report: vi.fn(),
    showHistory: false, setShowHistory: vi.fn(), onCloneHistoryVersion: vi.fn(),
    reviews: [], myReview: null, saveReview: vi.fn(), deleteMyReview: vi.fn(), reportReview: vi.fn(),
});

const renderBody = (isOwner: boolean) => render(
    <MemoryRouter><GalleryDetailBody detail={detail(isOwner)} /></MemoryRouter>);

beforeEach(() => {
    vi.restoreAllMocks();
    mockUseSession.mockReturnValue({ data: null });
});

describe('gallery detail edit-listing entry point', () => {
    it('offers Edit listing to the owner', () => {
        renderBody(true);
        expect(screen.getByRole('button', { name: /edit listing/i })).toBeTruthy();
    });

    it('hides Edit listing from everyone else', () => {
        renderBody(false);
        expect(screen.queryByRole('button', { name: /edit listing/i })).toBeNull();
    });

    it('opens the listing editor for the project being viewed', () => {
        renderBody(true);
        fireEvent.click(screen.getByRole('button', { name: /edit listing/i }));
        expect(screen.getByText('edit listing modal for p1')).toBeTruthy();
    });
});

describe('my projects edit-listing entry point', () => {
    const myProject = (visibility: 'public' | 'private') => ({
        id: 'p1', ownerId: 'u1', name: 'Weekly Planner', description: '', tags: [],
        visibility, headCommitId: 'c1', publishedCommitId: null,
        forkedFromProjectId: null, forkedFromCommitId: null,
        downloadCount: 0, forkCount: 0, createdAt: '2026-07-01', updatedAt: '2026-07-02',
        storedBytes: 2 * 1024 * 1024, commitCount: 7,
    });

    const renderProjects = (visibility: 'public' | 'private') => {
        vi.spyOn(cloudApi, 'listProjects').mockResolvedValue({
            projects: [myProject(visibility)],
            usage: { usedBytes: 0, quotaBytes: 50 * 1024 * 1024 },
        });
        return render(<MemoryRouter><MyProjectsPage /></MemoryRouter>);
    };

    it('offers Edit listing on a published project and opens it for that row', async () => {
        renderProjects('public');
        fireEvent.click(await screen.findByRole('button', { name: /edit listing/i }));
        expect(screen.getByText('edit listing modal for p1')).toBeTruthy();
    });

    it('hides Edit listing on a project that was never published', async () => {
        renderProjects('private');
        // Wait for the row itself, so the absence below is a real gate rather than a list
        // that simply had not loaded yet.
        expect(await screen.findByText('Weekly Planner')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /edit listing/i })).toBeNull();
    });
});

describe('editor cloud menu edit-listing entry point', () => {
    const project: Project = {
        id: 'local-1', name: 'Test Project',
        initialState: {
            nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
            rootId: 'root',
            variants: { default: { id: 'default', name: 'Default', templates: {} } },
            activeVariantId: 'default',
        } as any,
        cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'head-1' },
    };

    const renderMenu = (visibility: 'public' | 'private') => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1', username: 'planner_pro' } } });
        // forkedFromProjectId is set on both so the upstream link below can be used as proof
        // that this fetch has landed.
        vi.spyOn(cloudApi, 'getProject').mockResolvedValue(
            { id: 'cloud-1', visibility, forkedFromProjectId: 'upstream-1' } as any);
        return render(
            <MemoryRouter>
                <CloudMenu project={project} onLinkCloud={vi.fn()} onRestoreState={vi.fn()} />
            </MemoryRouter>);
    };

    it('offers Edit gallery listing for a published project, opened on the cloud id', async () => {
        renderMenu('public');
        fireEvent.click(screen.getByTitle('Cloud'));
        fireEvent.click(await screen.findByRole('button', { name: /edit gallery listing/i }));
        // The cloud project id, not the local project's 'local-1'.
        expect(screen.getByText('edit listing modal for cloud-1')).toBeTruthy();
    });

    it('hides Edit gallery listing while the project is unpublished', async () => {
        renderMenu('private');
        fireEvent.click(screen.getByTitle('Cloud'));
        // The upstream link is rendered from the same fetched cloud project as the visibility
        // being asserted on, so waiting for it proves that fetch has landed -- otherwise a
        // missing menu item would only mean the request had not resolved yet.
        expect(await screen.findByText(/forked from upstream/i)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /edit gallery listing/i })).toBeNull();
    });
});
