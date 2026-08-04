import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
// Static imports on purpose: vi.mock is hoisted above them, so the mocks still
// apply, and the heavy module graphs (DocsSection pulls react-markdown plus the
// bundled docs content) load during collection instead of inside a test's 5s
// budget — importing them dynamically inside the `it` made this file time out
// under full-suite CPU contention.
import { GalleryPage } from '../../pages/GalleryPage';
import { DocsSection } from '../../pages/docs/DocsSection';

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
            // The real galleryAll closes over the unmocked module object, so spreading
            // it would hit the real fetch -- mock it explicitly.
            galleryAll: vi.fn(async () => []),
            galleryTags: vi.fn(async () => []),
        },
    };
});

// Representative subset per spec: gallery, docs, merge-request page.
describe('AppHeader adoption', () => {
    it('GalleryPage renders the shared header', async () => {
        render(<MemoryRouter><GalleryPage /></MemoryRouter>);
        await waitFor(() => expect(screen.getByRole('link', { name: /^docs$/i })).toBeTruthy());
        expect(screen.getByRole('link', { name: /^editor$/i })).toBeTruthy();
    });

    it('DocsSection renders the shared header', () => {
        render(
            <MemoryRouter initialEntries={['/docs']}>
                <Routes><Route path="/docs/*" element={<DocsSection />} /></Routes>
            </MemoryRouter>
        );
        expect(screen.getByRole('link', { name: /^gallery$/i })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^editor$/i })).toBeTruthy();
    });
});
