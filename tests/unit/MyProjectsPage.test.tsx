import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyProjectsPage } from '../../pages/MyProjectsPage';

const mockListProjects = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock('../../services/cloudApi', () => ({
    cloudApi: {
        listProjects: (...args: any[]) => mockListProjects(...args),
        deleteProject: (...args: any[]) => mockDeleteProject(...args),
    },
}));

const project = (over: any = {}) => ({
    id: 'p1', ownerId: 'u1', name: 'Weekly Planner', description: '', tags: [],
    visibility: 'private', headCommitId: 'c1', forkedFromProjectId: null, forkedFromCommitId: null,
    downloadCount: 0, forkCount: 0, createdAt: '2026-07-01', updatedAt: '2026-07-02',
    storedBytes: 2 * 1024 * 1024, commitCount: 7, ...over,
});

const renderPage = () => render(
    <MemoryRouter initialEntries={['/projects']}>
        <MyProjectsPage />
    </MemoryRouter>
);

describe('MyProjectsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListProjects.mockResolvedValue({
            projects: [project()],
            usage: { usedBytes: 2 * 1024 * 1024, quotaBytes: 50 * 1024 * 1024 },
        });
        mockDeleteProject.mockResolvedValue({ success: true });
    });

    it('lists projects with size, commit count and visibility', async () => {
        renderPage();
        expect(await screen.findByText('Weekly Planner')).toBeInTheDocument();
        // NB: /2\.0 MB/ alone would also match the usage bar ("2.0 MB of 50.0 MB used")
        // and fail with a multiple-match error — keep the matcher scoped to the row text.
        expect(screen.getByText(/2\.0 MB · 7 versions/)).toBeInTheDocument();
        expect(screen.getByText('private')).toBeInTheDocument();
    });

    it('shows overall storage usage against the quota', async () => {
        renderPage();
        expect(await screen.findByText(/2\.0 MB of 50\.0 MB used/)).toBeInTheDocument();
    });

    it('deletes a project after confirmation and refreshes the list', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
        await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith('p1'));
        expect(mockListProjects).toHaveBeenCalledTimes(2);
    });

    it('does not delete when confirmation is declined', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
        expect(mockDeleteProject).not.toHaveBeenCalled();
    });

    it('shows an empty state when there are no projects', async () => {
        mockListProjects.mockResolvedValue({ projects: [], usage: { usedBytes: 0, quotaBytes: 50 * 1024 * 1024 } });
        renderPage();
        expect(await screen.findByText(/no cloud projects yet/i)).toBeInTheDocument();
    });
});
