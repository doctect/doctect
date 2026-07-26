import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Drives what the lazily-imported chunk does. 'hang' holds the Suspense fallback up
// indefinitely (a slow network); 'reject' is the stale-index.html failure after a deploy,
// where the hashed chunk the page asks for no longer exists.
const chunk = vi.hoisted(() => ({ mode: 'hang' as 'hang' | 'reject' }));
vi.mock('../../components/cloud/EditListingModal', async () => {
    if (chunk.mode === 'reject') throw new Error('Failed to fetch dynamically imported module');
    await new Promise(() => { /* never resolves */ });
    return {};
});

// React.lazy caches its payload — resolved or rejected — for the life of the module, so a
// test that wants a different outcome needs a fresh module graph rather than a fresh render.
const mount = async (props: { onClose: () => void; onSaved: () => void }) => {
    const { LazyEditListingModal } = await import('../../components/cloud/LazyEditListingModal');
    return render(<LazyEditListingModal projectId="proj-1" {...props} />);
};

const props = () => ({ onClose: vi.fn(), onSaved: vi.fn() });

beforeEach(() => {
    vi.resetModules();
    chunk.mode = 'hang';
});
afterEach(() => vi.restoreAllMocks());

describe('LazyEditListingModal', () => {
    it('dismisses the loading overlay when it is clicked', async () => {
        const p = props();
        await mount(p);

        fireEvent.click(await screen.findByRole('status'));

        expect(p.onClose).toHaveBeenCalledOnce();
    });

    it('dismisses the loading overlay on Escape without the key reaching the page behind it', async () => {
        // Stands in for GalleryDetailModal's document-level Escape handler, which calls
        // navigate(-1): the overlay sits inside that tree on the /gallery/:id route, so a key
        // it acts on must not also be seen there.
        const behind = vi.fn();
        document.addEventListener('keydown', behind);
        const p = props();
        await mount(p);
        await screen.findByRole('status');

        fireEvent.keyDown(document.body, { key: 'Escape' });

        expect(p.onClose).toHaveBeenCalledOnce();
        expect(behind).not.toHaveBeenCalled();
        document.removeEventListener('keydown', behind);
    });

    it('reports a failed chunk load inside the dialog instead of letting it reach the app', async () => {
        // React logs the caught error itself; silence it so this file's output stays readable.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        chunk.mode = 'reject';
        const p = props();

        // Without a local boundary this render throws out of the test: the rejection would
        // travel to the app-level ErrorBoundary and replace the entire app over one dialog.
        await mount(p);

        expect(await screen.findByRole('alert')).toHaveTextContent(/stopped working/i);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(p.onClose).toHaveBeenCalledOnce();
    });
});
