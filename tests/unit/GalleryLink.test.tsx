import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { GalleryLink } from '../../components/gallery/GalleryLink';

// Renders whatever ends up in the current location's state.backgroundLocation,
// so tests can assert on the navigation's resulting state without reaching
// into MemoryRouter/history internals.
function StateProbe() {
    const location = useLocation();
    const bg = (location.state as any)?.backgroundLocation;
    return <div data-testid="probe">{bg ? bg.pathname : 'none'}</div>;
}

describe('GalleryLink', () => {
    it('attaches the current location as backgroundLocation when none is already set', () => {
        render(
            <MemoryRouter initialEntries={['/gallery']}>
                <Routes>
                    <Route path="/gallery" element={<GalleryLink projectId="abc">Open</GalleryLink>} />
                    <Route path="/gallery/:id" element={<StateProbe />} />
                </Routes>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('link', { name: 'Open' }));
        expect(screen.getByTestId('probe')).toHaveTextContent('/gallery');
    });

    it('inherits an existing backgroundLocation instead of nesting a new one', () => {
        render(
            <MemoryRouter initialEntries={[{
                pathname: '/somewhere',
                state: { backgroundLocation: { pathname: '/original-grid', search: '', hash: '', state: null, key: 'bg1' } },
            }]}>
                <Routes>
                    <Route path="/somewhere" element={<GalleryLink projectId="fork-source">forked from</GalleryLink>} />
                    <Route path="/gallery/fork-source" element={<StateProbe />} />
                </Routes>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('link', { name: 'forked from' }));
        expect(screen.getByTestId('probe')).toHaveTextContent('/original-grid');
    });
});
