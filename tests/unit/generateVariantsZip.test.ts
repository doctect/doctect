import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateVariantsZip } from '../../services/pdfService';

const baseTemplate = { id: 'page', name: 'Page', width: 400, height: 300, elements: [] };

const twoVariantState: any = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: {
        rm: { id: 'rm', name: 'reMarkable', templates: { page: baseTemplate } },
        ipad: { id: 'ipad', name: 'iPad', templates: { page: baseTemplate } },
    },
    activeVariantId: 'rm',
};

describe('generateVariantsZip', () => {
    it('produces a zip with one PDF entry per variant, named after the variant', async () => {
        const blob = await generateVariantsZip(twoVariantState, 'My Planner');
        const zip = await JSZip.loadAsync(blob);
        expect(Object.keys(zip.files).sort()).toEqual(['iPad.pdf', 'reMarkable.pdf']);
        const bytes = await zip.file('reMarkable.pdf')!.async('uint8array');
        expect(bytes.length).toBeGreaterThan(0);
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    });

    it('throws a clear error instead of silently producing an empty zip when there are no variants', async () => {
        const emptyState: any = { ...twoVariantState, variants: {} };
        await expect(generateVariantsZip(emptyState, 'Empty')).rejects.toThrow(/no variants/i);
    });

    it('sanitizes filesystem-unsafe characters and dedupes names that would collide', async () => {
        const collidingState: any = {
            ...twoVariantState,
            variants: {
                a: { id: 'a', name: 'A/B Test', templates: { page: baseTemplate } },
                b: { id: 'b', name: 'A:B Test', templates: { page: baseTemplate } },
            },
        };
        const blob = await generateVariantsZip(collidingState, 'Proj');
        const zip = await JSZip.loadAsync(blob);
        expect(Object.keys(zip.files).sort()).toEqual(['A_B Test.pdf', 'A_B Test_2.pdf']);
    });
});
