import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RollingPreview } from '../../components/gallery/RollingPreview';
import { API_BASE } from '../../services/cloudApi';

const setReducedMotion = (matches: boolean) => {
    (window as any).matchMedia = vi.fn().mockReturnValue({
        matches, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
};

beforeEach(() => { vi.useFakeTimers(); setReducedMotion(false); });
afterEach(() => { vi.useRealTimers(); delete (window as any).matchMedia; });

// Read the attribute, not the .src property: jsdom resolves the property
// against the document base URL, which breaks exact-match assertions when
// API_BASE is '' (relative URLs) in the test environment.
const src = () => screen.getByRole('img').getAttribute('src') as string;

describe('RollingPreview', () => {
    it('shows the first image and cycles on hover', () => {
        render(<RollingPreview thumbnailIds={['t1', 't2', 't3']} alt="Proj" />);
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t1`);
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t2`);
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t3`);
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t1`); // wraps
    });

    it('resets to the first image on mouse leave', () => {
        render(<RollingPreview thumbnailIds={['t1', 't2']} alt="Proj" />);
        const el = screen.getByTestId('rolling-preview');
        fireEvent.mouseEnter(el);
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toContain('t2');
        fireEvent.mouseLeave(el);
        expect(src()).toContain('t1');
    });

    it('single image: no dots, hover does nothing', () => {
        render(<RollingPreview thumbnailIds={['only']} alt="Proj" />);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(2100); });
        expect(src()).toContain('only');
    });

    it('empty: renders placeholder, no img', () => {
        render(<RollingPreview thumbnailIds={[]} alt="Proj" />);
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByTestId('rolling-preview')).toBeInTheDocument();
    });

    it('undefined thumbnailIds: renders placeholder, no img', () => {
        render(<RollingPreview thumbnailIds={undefined as any} alt="Proj" />);
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByTestId('rolling-preview')).toBeInTheDocument();
    });

    it('autoPlay cycles without hover at the given interval', () => {
        render(<RollingPreview thumbnailIds={['t1', 't2']} alt="Proj" autoPlay intervalMs={2000} />);
        act(() => { vi.advanceTimersByTime(2000); });
        expect(src()).toContain('t2');
    });

    it('reduced motion: no auto-cycling, dots step manually', () => {
        setReducedMotion(true);
        render(<RollingPreview thumbnailIds={['t1', 't2', 't3']} alt="Proj" autoPlay />);
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(src()).toContain('t1');
        fireEvent.click(screen.getByRole('button', { name: /preview page 3/i }));
        expect(src()).toContain('t3');
    });

    it('dot clicks do not bubble to a surrounding link', () => {
        const onClick = vi.fn();
        render(
            <a href="/nowhere" onClick={e => { e.preventDefault(); onClick(); }}>
                <RollingPreview thumbnailIds={['t1', 't2']} alt="Proj" />
            </a>);
        fireEvent.click(screen.getByRole('button', { name: /preview page 2/i }));
        expect(onClick).not.toHaveBeenCalled();
        expect(src()).toContain('t2');
    });
});
