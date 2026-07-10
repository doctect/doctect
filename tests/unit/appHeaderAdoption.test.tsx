import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(),
    authClient: { listAccounts: vi.fn(async () => ({ data: [], error: null })) },
}));
vi.mock('../../services/cloudApi', async (importOriginal) => {
    const mod: any = await importOriginal();
    return {
        ...mod,
        cloudApi: {
            ...mod.cloudApi,
            gallery: vi.fn(async () => ({ items: [], page: 0, hasMore: false })),
            galleryTags: vi.fn(async () => []),
        },
    };
});

// Representative subset per spec: gallery, docs, merge-request page.
describe('AppHeader adoption', () => {
    it('GalleryPage renders the shared header', async () => {
        const { GalleryPage } = await import('../../pages/GalleryPage');
        render(<MemoryRouter><GalleryPage /></MemoryRouter>);
        await waitFor(() => expect(screen.getByRole('link', { name: /^docs$/i })).toBeTruthy());
        expect(screen.getByRole('link', { name: /^editor$/i })).toBeTruthy();
    });

    it('DocsPage renders the shared header', async () => {
        const { DocsPage } = await import('../../pages/DocsPage');
        render(<MemoryRouter><DocsPage /></MemoryRouter>);
        expect(screen.getByRole('link', { name: /^gallery$/i })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^editor$/i })).toBeTruthy();
    });
});
