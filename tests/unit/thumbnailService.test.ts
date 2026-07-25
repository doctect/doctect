import { describe, expect, it, vi, beforeEach } from 'vitest';

const generatePDF = vi.hoisted(() => vi.fn());
const computePageOrder = vi.hoisted(() => vi.fn());
vi.mock('../../services/pdfService', () => ({ generatePDF, computePageOrder }));

const getPage = vi.hoisted(() => vi.fn());
const destroy = vi.hoisted(() => vi.fn());
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({ getPage }), destroy }),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));

import { generateThumbnails } from '../../services/thumbnailService';

const state: any = { nodes: {}, rootId: 'a', variants: {}, activeVariantId: 'default' };

beforeEach(() => {
    vi.clearAllMocks();
    generatePDF.mockResolvedValue(new ArrayBuffer(8));
    computePageOrder.mockReturnValue(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    getPage.mockResolvedValue({
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: Promise.resolve() }),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        fillStyle: '', fillRect: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,AAAA');
});

describe('generateThumbnails', () => {
    it('pairs each rendered image with the page it came from', async () => {
        const out = await generateThumbnails(state, ['b', 'c']);
        expect(out).toEqual([
            { nodeId: 'b', dataUrl: 'data:image/webp;base64,AAAA' },
            { nodeId: 'c', dataUrl: 'data:image/webp;base64,AAAA' },
        ]);
    });

    it('drops unknown pages without shifting the remaining pairings', async () => {
        const out = await generateThumbnails(state, ['b', 'not-a-page', 'c']);
        expect(out.map(o => o.nodeId)).toEqual(['b', 'c']);
        // The other half of the alignment: each surviving pair must also have rasterized the page
        // its nodeId names. 'b' and 'c' are at order indices 1 and 2, so 1-based pages 2 and 3 --
        // an implementation that skipped the unknown id but kept counting would fetch 2 and 4.
        expect(getPage.mock.calls.flat()).toEqual([2, 3]);
    });

    it('renders at most six pages', async () => {
        const out = await generateThumbnails(state, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
        expect(out.length).toBe(6);
        expect(out.map(o => o.nodeId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });
});
