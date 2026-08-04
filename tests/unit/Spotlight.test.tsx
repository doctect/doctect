import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Spotlight } from '../../components/gallery/Spotlight';
import { cloudApi, GalleryItem } from '../../services/cloudApi';
import * as importProject from '../../services/importProject';

vi.mock('../../services/importProject', () => ({ stageImport: vi.fn() }));

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

beforeEach(() => vi.restoreAllMocks());

describe('Spotlight', () => {
    it('renders name, author, description and rating', () => {
        renderIt();
        expect(screen.getByText('Novel Story Studio')).toBeInTheDocument();
        expect(screen.getByText(/doctect/)).toBeInTheDocument();
        expect(screen.getByText(/plot and draft a novel/i)).toBeInTheDocument();
    });

    it('"Open in editor" stages the project state and navigates to /app', async () => {
        vi.spyOn(cloudApi, 'galleryState').mockResolvedValue({ name: 'Novel Story Studio', state: { nodes: [] } });
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
        await waitFor(() => expect(screen.getByText('EDITOR_MARKER')).toBeInTheDocument());
        expect(cloudApi.galleryState).toHaveBeenCalledWith('p1');
        expect(importProject.stageImport).toHaveBeenCalledWith({ name: 'Novel Story Studio', state: { nodes: [] } });
    });

    it('failed load shows an inline error and stays put', async () => {
        vi.spyOn(cloudApi, 'galleryState').mockRejectedValue(new Error('boom'));
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
        expect(await screen.findByText(/could not load project/i)).toBeInTheDocument();
        expect(screen.queryByText('EDITOR_MARKER')).toBeNull();
    });

    it('"See details" links to the project', () => {
        renderIt();
        fireEvent.click(screen.getByRole('link', { name: /see details/i }));
        expect(screen.getByText('DETAIL_MARKER')).toBeInTheDocument();
    });
});
