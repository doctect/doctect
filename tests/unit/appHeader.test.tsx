import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';

vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(), authClient: {},
}));

describe('AppHeader', () => {
    const renderHeader = () => render(<MemoryRouter><AppHeader /></MemoryRouter>);

    it('renders logo link home and the three section links', () => {
        renderHeader();
        expect(screen.getByRole('link', { name: /pdf architect/i })).toHaveProperty('pathname', '/');
        expect(screen.getByRole('link', { name: /^editor$/i })).toHaveProperty('pathname', '/app');
        expect(screen.getByRole('link', { name: /^gallery$/i })).toHaveProperty('pathname', '/gallery');
        expect(screen.getByRole('link', { name: /^docs$/i })).toHaveProperty('pathname', '/docs');
    });

    it('cannot be squashed by overflowing flex-col parents (shrink-0)', () => {
        const { container } = renderHeader();
        expect(container.querySelector('header')!.className).toContain('shrink-0');
    });

    it('renders the account menu (signed-out state shows Sign in)', () => {
        renderHeader();
        expect(screen.getByText(/sign in/i)).toBeTruthy();
    });
});

describe('landing nav stacking', () => {
    it('keeps the nav above the hero so the account dropdown is clickable', async () => {
        const { LandingPage } = await import('../../pages/LandingPage');
        const { container } = render(<MemoryRouter><LandingPage /></MemoryRouter>);
        const nav = container.querySelector('nav')!;
        const main = container.querySelector('main')!;
        // Both are positioned siblings; the nav (which hosts the dropdown's
        // stacking context) must have the strictly higher z-index.
        const zOf = (el: Element) => parseInt((el.className.match(/z-(\d+)/) || [])[1] ?? '0', 10);
        expect(zOf(nav)).toBeGreaterThan(zOf(main));
    });
});
