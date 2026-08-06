import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryDirectory, sortItems } from '../../components/gallery/GalleryDirectory';
import { GalleryItem } from '../../services/cloudApi';

const item = (over: Partial<GalleryItem>): GalleryItem => ({
    id: 'x', name: 'X', description: '', tags: [], author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-08-01 10:00:00',
    thumbnailId: null, thumbnailIds: [], ratingAvg: null, ratingCount: 0,
    ...over,
});

const items = [
    item({ id: 'p1', name: 'Beta', author: 'zoe', downloadCount: 5, updatedAt: '2026-08-03 10:00:00', ratingAvg: 3.5, ratingCount: 2, thumbnailIds: ['t1'], thumbnailId: 't1' }),
    item({ id: 'p2', name: 'Alpha', author: 'amy', downloadCount: 9, updatedAt: '2026-08-01 10:00:00', ratingAvg: null, ratingCount: 0 }),
    item({ id: 'p3', name: 'Gamma', author: 'mel', downloadCount: 1, updatedAt: '2026-08-05 10:00:00', ratingAvg: 5, ratingCount: 1 }),
];

const renderIt = () => render(
    <MemoryRouter initialEntries={['/gallery?view=all']}>
        <Routes>
            <Route path="/gallery" element={<GalleryDirectory items={items} />} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>);

const rowNames = () => screen.getAllByTestId('directory-row').map(r => within(r).getByRole('link').textContent);

describe('sortItems', () => {
    it('sorts null ratings last in both directions', () => {
        expect(sortItems(items, 'rating', 'desc').map(i => i.id)).toEqual(['p3', 'p1', 'p2']);
        expect(sortItems(items, 'rating', 'asc').map(i => i.id)).toEqual(['p1', 'p3', 'p2']);
    });
    it('does not mutate its input', () => {
        const before = items.map(i => i.id);
        sortItems(items, 'name', 'asc');
        expect(items.map(i => i.id)).toEqual(before);
    });
});

describe('GalleryDirectory', () => {
    it('renders one row per item, default-sorted by Updated descending', () => {
        renderIt();
        expect(rowNames()).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('shows author, downloads, forks and sliced date per row', () => {
        renderIt();
        const beta = screen.getAllByTestId('directory-row')[1];
        expect(within(beta).getByText('zoe')).toBeInTheDocument();
        expect(within(beta).getByText('2026-08-03')).toBeInTheDocument();
    });

    it('name header sorts ascending by name, second click flips to descending', () => {
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /^name$/i }));
        expect(rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
        fireEvent.click(screen.getByRole('button', { name: /^name$/i }));
        expect(rowNames()).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('downloads header sorts descending first (numeric natural default)', () => {
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /downloads/i }));
        expect(rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('active column carries aria-sort', () => {
        renderIt();
        expect(screen.getByRole('columnheader', { name: /updated/i })).toHaveAttribute('aria-sort', 'descending');
        fireEvent.click(screen.getByRole('button', { name: /^name$/i }));
        expect(screen.getByRole('columnheader', { name: /^name$/i })).toHaveAttribute('aria-sort', 'ascending');
    });

    it('row name links to the project detail', () => {
        renderIt();
        fireEvent.click(within(screen.getAllByTestId('directory-row')[0]).getByRole('link'));
        expect(screen.getByText('DETAIL_MARKER')).toBeInTheDocument();
    });

    it('thumbnail cell links to the project without adding a second tab stop', () => {
        renderIt();
        const row = screen.getAllByTestId('directory-row')[0];
        // exactly one link in the accessibility tree per row: the thumb link is aria-hidden
        expect(within(row).getAllByRole('link')).toHaveLength(1);
        const links = within(row).getAllByRole('link', { hidden: true });
        expect(links).toHaveLength(2);
        const thumbLink = links[0]; // thumbnail cell comes first in DOM order
        expect(thumbLink).toHaveAttribute('aria-hidden', 'true');
        expect(thumbLink).toHaveAttribute('tabindex', '-1');
        fireEvent.click(thumbLink);
        expect(screen.getByText('DETAIL_MARKER')).toBeInTheDocument();
    });
});
