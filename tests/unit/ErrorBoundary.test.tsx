import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

function Bomb() {
    throw new Error('kaboom');
    return null;
}

describe('ErrorBoundary', () => {
    afterEach(() => vi.restoreAllMocks());

    it('renders children normally when nothing throws', () => {
        render(<ErrorBoundary><div>All good</div></ErrorBoundary>);
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('catches a render error and shows a fallback instead of crashing', () => {
        // React logs the error to console.error itself (twice, in dev); silence it
        // so this test's own output stays pristine while still asserting behavior.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<ErrorBoundary><Bomb /></ErrorBoundary>);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('kaboom')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    });

    it('reload button calls window.location.reload', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const reloadSpy = vi.fn();
        // JSDOM doesn't implement navigation; stub reload directly.
        Object.defineProperty(window, 'location', {
            value: { ...window.location, reload: reloadSpy },
            writable: true,
        });
        render(<ErrorBoundary><Bomb /></ErrorBoundary>);
        fireEvent.click(screen.getByRole('button', { name: /reload/i }));
        expect(reloadSpy).toHaveBeenCalled();
    });
});
