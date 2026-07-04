// tests/unit/shared/diff.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stableStringify, computeChangeSet, threeWayDiff } from '../../../shared/diff.js';

const mkState = () => ({
    nodes: { root: { id: 'root', parentId: null, type: 'day', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: {
        rm: { id: 'rm', name: 'reMarkable', templates: {
            day: { id: 'day', name: 'Day', width: 509, height: 679, elements: [] },
            week: { id: 'week', name: 'Week', width: 509, height: 679, elements: [] }
        } }
    }
});
const clone = (s) => JSON.parse(JSON.stringify(s));

describe('stableStringify', () => {
    it('is key-order independent', () => {
        expect(stableStringify({ a: 1, b: { c: 2, d: 3 } }))
            .toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
    });
});

describe('computeChangeSet', () => {
    it('reports no changes for identical states', () => {
        const cs = computeChangeSet(mkState(), mkState());
        expect(cs.nodesChanged).toBe(false);
        expect(cs.variantsAdded).toEqual([]);
        expect(cs.templatesModified).toEqual({});
    });

    it('detects node hierarchy changes', () => {
        const side = mkState();
        side.nodes.root.title = 'Renamed';
        expect(computeChangeSet(mkState(), side).nodesChanged).toBe(true);
    });

    it('detects added/removed variants', () => {
        const side = mkState();
        side.variants.ipad = { id: 'ipad', name: 'iPad', templates: {} };
        delete side.variants.rm;
        const cs = computeChangeSet(mkState(), side);
        expect(cs.variantsAdded).toEqual(['ipad']);
        expect(cs.variantsRemoved).toEqual(['rm']);
    });

    it('detects renamed variants without flagging templates', () => {
        const side = mkState();
        side.variants.rm.name = 'RM Pro';
        const cs = computeChangeSet(mkState(), side);
        expect(cs.variantsRenamed).toEqual({ rm: 'RM Pro' });
        expect(cs.templatesModified).toEqual({});
    });

    it('detects template add/modify/remove within a variant', () => {
        const side = mkState();
        side.variants.rm.templates.day.elements = [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }];
        side.variants.rm.templates.month = { id: 'month', name: 'Month', width: 509, height: 679, elements: [] };
        delete side.variants.rm.templates.week;
        const cs = computeChangeSet(mkState(), side);
        expect(cs.templatesModified).toEqual({ rm: ['day'] });
        expect(cs.templatesAdded).toEqual({ rm: ['month'] });
        expect(cs.templatesRemoved).toEqual({ rm: ['week'] });
    });

    it('ignores key-order differences', () => {
        const side = clone(mkState());
        // Rebuild a template with different key order but equal content
        const t = side.variants.rm.templates.day;
        side.variants.rm.templates.day = { elements: t.elements, height: t.height, width: t.width, name: t.name, id: t.id };
        const cs = computeChangeSet(mkState(), side);
        expect(cs.templatesModified).toEqual({});
    });
});

describe('threeWayDiff', () => {
    it('no conflicts when sides touch different templates', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.templates.day.name = 'Day v2';
        const target = clone(base); target.variants.rm.templates.week.name = 'Week v2';
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts).toEqual([]);
        expect(d.source.templatesModified).toEqual({ rm: ['day'] });
    });

    it('flags same-template conflicts', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.templates.day.name = 'Source Day';
        const target = clone(base); target.variants.rm.templates.day.name = 'Target Day';
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts.some(c => c.kind === 'template' && c.templateId === 'day')).toBe(true);
    });

    it('does not flag identical convergent edits', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.templates.day.name = 'Same';
        const target = clone(base); target.variants.rm.templates.day.name = 'Same';
        expect(threeWayDiff(base, source, target).conflicts).toEqual([]);
    });

    it('flags nodes conflicts only when both changed differently', () => {
        const base = mkState();
        const source = clone(base); source.nodes.root.title = 'S';
        const target = clone(base); target.nodes.root.title = 'T';
        expect(threeWayDiff(base, source, target).conflicts.some(c => c.kind === 'nodes')).toBe(true);

        const target2 = clone(base); target2.nodes.root.title = 'S';
        expect(threeWayDiff(base, source, target2).conflicts).toEqual([]);
    });

    it('flags variant removed vs modified', () => {
        const base = mkState();
        const source = clone(base); delete source.variants.rm;
        const target = clone(base); target.variants.rm.templates.day.name = 'Edited';
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts.some(c => c.kind === 'variant' && c.variantId === 'rm')).toBe(true);
    });

    it('flags variant added on both sides with different content', () => {
        const base = mkState();
        const source = clone(base); source.variants.ipad = { id: 'ipad', name: 'iPad', templates: {} };
        const target = clone(base); target.variants.ipad = { id: 'ipad', name: 'iPad Pro', templates: {} };
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts.some(c => c.kind === 'variant' && c.variantId === 'ipad')).toBe(true);
    });
});
