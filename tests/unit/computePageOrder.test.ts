// tests/unit/computePageOrder.test.ts
import { describe, it, expect } from 'vitest';
import { computePageOrder } from '../../services/pdfService';

const state: any = {
    rootId: 'root',
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['a', 'ref', 'b'] },
        a: { id: 'a', parentId: 'root', type: 'page', title: 'A', data: {}, children: [] },
        b: { id: 'b', parentId: 'root', type: 'page', title: 'B', data: {}, children: [] },
        target: { id: 'target', parentId: null, type: 'page', title: 'T', data: {}, children: [] },
        ref: { id: 'ref', parentId: 'root', type: 'page', title: 'Ref', data: {}, children: [], referenceId: 'target' }
    },
    variants: {}, activeVariantId: 'default'
};

describe('computePageOrder', () => {
    it('returns depth-first page order, skipping reference nodes', () => {
        expect(computePageOrder(state)).toEqual(['root', 'a', 'b']);
    });
});
