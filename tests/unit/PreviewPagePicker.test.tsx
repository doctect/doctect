import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewPagePicker } from '../../components/cloud/PreviewPagePicker';
import { MAX_PREVIEWS } from '../../constants/previews';

const pages = Array.from({ length: MAX_PREVIEWS + 2 }, (_, i) => ({ id: `p${i + 1}`, title: `Page ${i + 1}` }));
const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];

describe('PreviewPagePicker', () => {
    it('shows an over-long selection in full, refusing additions but allowing removals', () => {
        // A host can hand the picker more pages than the cap allows -- a listing published
        // under a larger cap, say. Silently unticking boxes would misreport what is currently
        // published, so the picker tells the truth, blocks growth, and lets the user shrink
        // back under the cap. Nothing over-long can reach the server either way, because
        // generateThumbnails renders at most MAX_PREVIEWS pages and the hosts publish the
        // pages it actually rendered.
        const onChange = vi.fn();
        const overLong = pages.slice(0, MAX_PREVIEWS + 1).map(p => p.id);
        render(<PreviewPagePicker pages={pages} selected={overLong} onChange={onChange} />);

        expect(boxes().filter(b => b.checked)).toHaveLength(MAX_PREVIEWS + 1);

        fireEvent.click(boxes()[MAX_PREVIEWS + 1]);   // the one page still unticked
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(boxes()[0]);
        expect(onChange).toHaveBeenCalledWith(overLong.slice(1));
    });

    it('lets the last ticked page be unticked, leaving the selection empty', () => {
        // No lower bound here on purpose: an empty picker is a legal intermediate state while
        // the user swaps one page for another. Each host enforces "at least one" when it submits.
        const onChange = vi.fn();
        render(<PreviewPagePicker pages={pages} selected={['p2']} onChange={onChange} />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Page 2' }));

        expect(onChange).toHaveBeenCalledWith([]);
    });
});
