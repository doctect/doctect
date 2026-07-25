import { AppState } from '../types';
import { MAX_PREVIEWS } from '../constants/previews';
import { generatePDF, computePageOrder } from './pdfService';
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves the worker as an asset URL:
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_THUMB_WIDTH = 480;

// Re-exported so the renderer's cap and the picker's cap stay visibly the same constant;
// import it from ../constants/previews unless you already depend on this module.
export { MAX_PREVIEWS };

export interface RenderedPreview {
    nodeId: string;
    dataUrl: string;
}

/**
 * Renders up to 6 pages of the project to compressed image data URLs.
 * WebP where the browser supports canvas.toDataURL('image/webp'), else PNG.
 *
 * Returns page/image PAIRS, not bare images: the loop below skips any node id
 * missing from the page order or any canvas without a 2d context, so a caller
 * zipping its own selection against a bare image array would mislabel every
 * preview after the first skip.
 */
export async function generateThumbnails(
    state: AppState,
    nodeIds: string[],
    variantId?: string
): Promise<RenderedPreview[]> {
    const data = (await generatePDF(state, { variantId, output: 'arraybuffer' })) as ArrayBuffer;
    const order = computePageOrder(state);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const out: RenderedPreview[] = [];
    try {
        for (const nodeId of nodeIds.slice(0, MAX_PREVIEWS)) {
            const idx = order.indexOf(nodeId);
            if (idx === -1) continue;
            const page = await pdf.getPage(idx + 1);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(1, MAX_THUMB_WIDTH / base.width);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            const webp = canvas.toDataURL('image/webp', 0.8);
            out.push({
                nodeId,
                dataUrl: webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'),
            });
        }
    } finally {
        // `destroy()` lives on the loading task (terminates the worker); the
        // resolved PDFDocumentProxy itself only exposes `cleanup()`.
        await loadingTask.destroy();
    }
    return out;
}
