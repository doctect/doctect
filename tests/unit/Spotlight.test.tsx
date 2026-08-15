import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Spotlight } from '../../components/gallery/Spotlight';
import { cloudApi, GalleryItem } from '../../services/cloudApi';
import * as importProject from '../../services/importProject';
import { deferred } from '../helpers/fakeLocalWorkspaceStore';

vi.mock('../../services/importProject', () => ({
    IMPORT_STAGE_ERROR_MESSAGE: 'Could not prepare this project for the editor. Nothing was removed; try again.',
    stageImport: vi.fn(),
}));

const item: GalleryItem = {
    id: 'p1', name: 'Novel Story Studio', description: 'Plot and draft a novel.', tags: ['writing'],
    author: 'doctect', forkCount: 0, downloadCount: 5, updatedAt: '2026-01-01',
    thumbnailId: 't1', thumbnailIds: ['t1', 't2'], ratingAvg: 5, ratingCount: 3,
};

const renderIt = () => render(
    <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
            <Route path="/gallery" element={<Spotlight item={item} />} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
            <Route path="/app" element={<div>EDITOR_MARKER</div>} />
        </Routes>
    </MemoryRouter>);

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(importProject.stageImport).mockReset();
    vi.mocked(importProject.stageImport).mockResolvedValue('spotlight-import');
});

describe('Spotlight', () => {
    it('renders name, author, description and rating', () => {
        renderIt();
        expect(screen.getByText('Novel Story Studio')).toBeInTheDocument();
        expect(screen.getByText(/doctect/)).toBeInTheDocument();
        expect(screen.getByText(/plot and draft a novel/i)).toBeInTheDocument();
    });

    it('"Open in editor" waits for durable staging before navigating to /app', async () => {
        vi.spyOn(cloudApi, 'galleryState').mockResolvedValue({ name: 'Novel Story Studio', state: { nodes: [] } });
        const staged = deferred<string>();
        vi.mocked(importProject.stageImport).mockReturnValue(staged.promise);
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
        await waitFor(() => expect(importProject.stageImport).toHaveBeenCalledWith({ name: 'Novel Story Studio', state: { nodes: [] } }));
        expect(screen.queryByText('EDITOR_MARKER')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /open in editor/i })).toBeDisabled();

        await act(async () => staged.resolve('spotlight-import'));
        expect(await screen.findByText('EDITOR_MARKER')).toBeInTheDocument();
        expect(cloudApi.galleryState).toHaveBeenCalledWith('p1');
    });

    it('failed staging shows the exact alert and preserves the spotlight', async () => {
        vi.spyOn(cloudApi, 'galleryState').mockResolvedValue({ name: 'Novel Story Studio', state: { nodes: [] } });
        vi.mocked(importProject.stageImport).mockRejectedValue(new Error('quota'));
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not prepare this project for the editor. Nothing was removed; try again.',
        );
        expect(screen.getByText('Novel Story Studio')).toBeVisible();
        expect(screen.queryByText('EDITOR_MARKER')).toBeNull();
        expect(screen.getByRole('button', { name: /open in editor/i })).toBeEnabled();
    });

    it('"See details" links to the project', () => {
        renderIt();
        fireEvent.click(screen.getByRole('link', { name: /see details/i }));
        expect(screen.getByText('DETAIL_MARKER')).toBeInTheDocument();
    });
});
