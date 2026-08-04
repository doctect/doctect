import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GalleryExplainer } from '../../components/gallery/GalleryExplainer';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({ useSession: () => mockUseSession() }));

beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReturnValue({ data: null });
});

describe('GalleryExplainer', () => {
    it('shows the three steps to signed-out visitors', () => {
        render(<GalleryExplainer />);
        expect(screen.getByText(/browse/i)).toBeInTheDocument();
        expect(screen.getByText(/open in editor/i)).toBeInTheDocument();
        expect(screen.getByText(/make it yours/i)).toBeInTheDocument();
    });

    it('dismiss hides it and persists across renders', () => {
        const { unmount } = render(<GalleryExplainer />);
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(screen.queryByText(/make it yours/i)).toBeNull();
        unmount();
        render(<GalleryExplainer />);
        expect(screen.queryByText(/make it yours/i)).toBeNull();
        expect(localStorage.getItem('gallery-explainer-dismissed')).toBe('1');
    });

    it('hidden when signed in', () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } } });
        render(<GalleryExplainer />);
        expect(screen.queryByText(/make it yours/i)).toBeNull();
    });
});
