import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProjectCard } from '../../components/gallery/ProjectCard';
import { GalleryItem } from '../../services/cloudApi';

const item: GalleryItem = {
    id: 'p1', name: 'Weekly Planner', description: 'A tidy weekly spread for busy people',
    tags: ['planner', 'weekly', 'minimal', 'extra'], author: 'maker',
    forkCount: 2, downloadCount: 9, updatedAt: '2026-01-01', thumbnailId: null,
    thumbnailIds: [],
    ratingAvg: 4.5, ratingCount: 3,
};

function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

const renderCard = (it: GalleryItem = item) => render(
    <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
            <Route path="/gallery" element={<><ProjectCard item={it} /><LocationProbe /></>} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('ProjectCard', () => {
    it('renders name, author, description, rating and counts', () => {
        renderCard();
        expect(screen.getByText('Weekly Planner')).toBeInTheDocument();
        expect(screen.getByText('by maker')).toBeInTheDocument();
        expect(screen.getByText(/4\.5/)).toBeInTheDocument();
        expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
    });

    it('caps tag chips at 3', () => {
        renderCard();
        expect(screen.getByRole('button', { name: 'planner' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'extra' })).toBeNull();
    });

    it('hides the rating when there are no reviews', () => {
        renderCard({ ...item, ratingAvg: null, ratingCount: 0 });
        expect(screen.queryByText('No ratings yet')).toBeNull();
        expect(screen.queryByLabelText(/rated/i)).toBeNull();
    });

    it('tag chip navigates to the tag filter instead of the project', () => {
        renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'weekly' }));
        expect(screen.getByTestId('loc')).toHaveTextContent('/gallery?tag=weekly');
        expect(screen.queryByText('DETAIL_MARKER')).toBeNull();
    });
});
