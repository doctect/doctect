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
    it('accepts only nodes and rootId while preserving reference-safe depth-first order', () => {
        expect(computePageOrder({ nodes: state.nodes, rootId: state.rootId })).toEqual(['root', 'a', 'b']);
    });

    it('returns depth-first page order, skipping reference nodes', () => {
        expect(computePageOrder(state)).toEqual(['root', 'a', 'b']);
    });

    it('handles a 20,000-deep hierarchy without recursive stack growth', () => {
        const nodes: Record<string, any> = Object.create(null);
        for (let index = 0; index < 20_000; index += 1) {
            const id = `node_${index}`;
            nodes[id] = {
                id,
                children: index === 19_999 ? [] : [`node_${index + 1}`],
            };
        }

        expect(computePageOrder({ rootId: 'node_0', nodes } as any)).toHaveLength(20_000);
    });

    it('bounds repeated and cyclic ownership edges', () => {
        const nodes = {
            root: { id: 'root', children: ['child', 'child'] },
            child: { id: 'child', children: ['root'] },
        };

        expect(computePageOrder({ rootId: 'root', nodes } as any)).toEqual(['root', 'child']);
    });
});
