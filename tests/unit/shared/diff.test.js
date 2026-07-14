// tests/unit/shared/diff.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stableStringify, computeChangeSet, threeWayDiff } from '../../../shared/diff.js';
import { applyChangeSet } from '../../../shared/diff.js';

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
const generator = (overrides = {}) => ({
    formatVersion: 1,
    templateScript: 'return { elements: [] };',
    hierarchyScript: 'return { nodes: {} };',
    generatedAt: '2026-07-14T10:00:00.000Z',
    ...overrides,
});

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

    it('classifies generator provenance additions, modifications, and removals', () => {
        const withoutGenerator = mkState();
        const withGenerator = { ...mkState(), generator: generator() };
        const changedGenerator = {
            ...withGenerator,
            generator: generator({ generatedAt: '2026-07-14T11:00:00.000Z' }),
        };

        expect(computeChangeSet(withoutGenerator, withGenerator).generatorChange).toBe('added');
        expect(computeChangeSet(withGenerator, changedGenerator).generatorChange).toBe('modified');
        expect(computeChangeSet(withGenerator, withoutGenerator).generatorChange).toBe('removed');
        expect(computeChangeSet(withoutGenerator, clone(withoutGenerator)).generatorChange).toBeNull();
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

    it.each([
        ['different additions', undefined, generator(), generator({ templateScript: 'return 2;' })],
        ['different timestamp modifications', generator(), generator({ generatedAt: '2026-07-14T11:00:00.000Z' }), generator({ generatedAt: '2026-07-14T12:00:00.000Z' })],
        ['source modification vs target removal', generator(), generator({ templateScript: 'return 2;' }), undefined],
        ['source removal vs target modification', generator(), undefined, generator({ templateScript: 'return 2;' })],
    ])('flags generator conflicts for %s', (_label, baseGenerator, sourceGenerator, targetGenerator) => {
        const base = { ...mkState(), ...(baseGenerator ? { generator: baseGenerator } : {}) };
        const source = { ...mkState(), ...(sourceGenerator ? { generator: sourceGenerator } : {}) };
        const target = { ...mkState(), ...(targetGenerator ? { generator: targetGenerator } : {}) };

        expect(threeWayDiff(base, source, target).conflicts).toContainEqual({
            kind: 'generator',
            id: 'generator',
            description: 'Generator source changed differently on both branches.',
        });
    });

    it.each([
        ['same addition', undefined, generator()],
        ['same modification', generator(), generator({ templateScript: 'return 2;' })],
        ['same removal', generator(), undefined],
    ])('accepts convergent generator changes for %s', (_label, baseGenerator, changedGenerator) => {
        const base = { ...mkState(), ...(baseGenerator ? { generator: baseGenerator } : {}) };
        const source = { ...mkState(), ...(changedGenerator ? { generator: changedGenerator } : {}) };
        const target = clone(source);

        expect(threeWayDiff(base, source, target).conflicts).toEqual([]);
    });
});

describe('applyChangeSet', () => {
    it('applies template edits and additions onto target', () => {
        const base = mkState();
        const source = clone(base);
        source.variants.rm.templates.day.name = 'Fancy Day';
        source.variants.ipad = { id: 'ipad', name: 'iPad', templates: {} };
        const target = clone(base);
        target.variants.rm.templates.week.name = 'Upstream Week'; // target's own change is preserved
        target.activeVariantId = 'rm';

        const merged = applyChangeSet(base, source, target);
        expect(merged.variants.rm.templates.day.name).toBe('Fancy Day');
        expect(merged.variants.rm.templates.week.name).toBe('Upstream Week');
        expect(merged.variants.ipad.name).toBe('iPad');
        expect(merged.activeVariantId).toBe('rm');
    });

    it('applies removals and repairs activeVariantId', () => {
        const base = mkState();
        base.variants.extra = { id: 'extra', name: 'Extra', templates: {} };
        const source = clone(base);
        delete source.variants.extra;
        delete source.variants.rm.templates.week;
        const target = clone(base);
        target.activeVariantId = 'extra';

        const merged = applyChangeSet(base, source, target);
        expect(merged.variants.extra).toBeUndefined();
        expect(merged.variants.rm.templates.week).toBeUndefined();
        expect(merged.variants[merged.activeVariantId]).toBeDefined();
    });

    it('applies node changes when only source changed them', () => {
        const base = mkState();
        const source = clone(base);
        source.nodes.child = { id: 'child', parentId: 'root', type: 'day', title: 'Child', data: {}, children: [] };
        source.nodes.root.children = ['child'];
        const merged = applyChangeSet(base, source, clone(base));
        expect(merged.nodes.child.title).toBe('Child');
    });

    it('applies variant renames', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.name = 'RM Pro Max';
        const merged = applyChangeSet(base, source, clone(base));
        expect(merged.variants.rm.name).toBe('RM Pro Max');
    });

    it('applies source generator provenance as one atomic value', () => {
        const base = { ...mkState(), generator: generator() };
        const source = {
            ...mkState(),
            generator: generator({
                templateScript: 'return sourceTemplate;',
                hierarchyScript: 'return sourceHierarchy;',
                generatedAt: '2026-07-14T12:00:00.000Z',
            }),
        };

        const merged = applyChangeSet(base, source, clone(base));

        expect(merged.generator).toEqual(source.generator);
        expect(merged.generator).not.toBe(source.generator);
    });

    it('preserves target generator provenance when source is unchanged', () => {
        const base = { ...mkState(), generator: generator() };
        const target = {
            ...mkState(),
            generator: generator({
                hierarchyScript: 'return upstreamHierarchy;',
                generatedAt: '2026-07-14T13:00:00.000Z',
            }),
        };

        expect(applyChangeSet(base, clone(base), target).generator).toEqual(target.generator);
    });

    it('removes generator provenance when source removed it', () => {
        const base = { ...mkState(), generator: generator() };

        expect(applyChangeSet(base, mkState(), clone(base)).generator).toBeUndefined();
    });
});
