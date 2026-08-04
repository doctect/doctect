import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';

const api = vi.hoisted(() => ({ me: vi.fn(), gallery: vi.fn() }));

vi.mock('../../services/cloudApi', () => ({ cloudApi: api, API_BASE: '' }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(), authClient: {},
}));

beforeEach(() => {
    vi.clearAllMocks();
    api.me.mockResolvedValue(null);
    api.gallery.mockResolvedValue({ items: [], page: 0, hasMore: false });
});

describe('AppHeader', () => {
    const renderHeader = async () => {
        const rendered = render(<MemoryRouter><AppHeader /></MemoryRouter>);
        await screen.findByText('Sign in');
        return rendered;
    };

    it('renders logo link home and the three section links', async () => {
        await renderHeader();
        expect(screen.getByRole('link', { name: /pdf architect/i })).toHaveProperty('pathname', '/');
        expect(screen.getByRole('link', { name: /^editor$/i })).toHaveProperty('pathname', '/app');
        expect(screen.getByRole('link', { name: /^gallery$/i })).toHaveProperty('pathname', '/gallery');
        expect(screen.getByRole('link', { name: /^docs$/i })).toHaveProperty('pathname', '/docs');
    });

    it('cannot be squashed by overflowing flex-col parents (shrink-0)', async () => {
        const { container } = await renderHeader();
        expect(container.querySelector('header')!.className).toContain('shrink-0');
    });

    it('renders a Ko-fi support link opening in a new tab', async () => {
        await renderHeader();
        const link = screen.getByRole('link', { name: /support/i }) as HTMLAnchorElement;
        expect(link.href).toBe('https://ko-fi.com/anoopr');
        expect(link.target).toBe('_blank');
        expect(link.rel).toContain('noopener');
    });

    it('renders the account menu (signed-out state shows Sign in)', async () => {
        await renderHeader();
        expect(screen.getByText(/sign in/i)).toBeTruthy();
    });
});

describe('landing support link', () => {
    it('carries the Ko-fi link in the marketing nav', async () => {
        const { LandingPage } = await import('../../pages/LandingPage');
        render(<MemoryRouter><LandingPage /></MemoryRouter>);
        await screen.findByText('Sign in');
        const links = screen.getAllByRole('link', { name: /support/i }) as HTMLAnchorElement[];
        expect(links.some(l => l.href === 'https://ko-fi.com/anoopr' && l.target === '_blank')).toBe(true);
    });
});

describe('landing nav stacking', () => {
    it('keeps the nav above the hero so the account dropdown is clickable', async () => {
        const { LandingPage } = await import('../../pages/LandingPage');
        const { container } = render(<MemoryRouter><LandingPage /></MemoryRouter>);
        await screen.findByText('Sign in');
        const nav = container.querySelector('nav')!;
        const main = container.querySelector('main')!;
        // Both are positioned siblings; the nav (which hosts the dropdown's
        // stacking context) must have the strictly higher z-index.
        const zOf = (el: Element) => parseInt((el.className.match(/z-(\d+)/) || [])[1] ?? '0', 10);
        expect(zOf(nav)).toBeGreaterThan(zOf(main));
    });
});
