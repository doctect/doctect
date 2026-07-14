import { describe, expect, it } from 'vitest';
import { validateGeneratedProject } from '../../services/validateGeneratedProject';

const template = (id = 'page', elements: unknown[] = []) => ({
    id,
    name: id,
    width: 509,
    height: 679,
    elements,
});

const validTemplates = () => ({ page: template() });
const validHierarchy = () => ({
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root' },
    },
    rootId: 'root',
});

describe('validateGeneratedProject', () => {
    it('accepts flat output, normalizes nodes, migrates to v9, and leaves input unchanged', () => {
        const raw = { templates: validTemplates(), hierarchy: validHierarchy() };
        const before = structuredClone(raw);

        const validation = validateGeneratedProject(raw);

        expect(validation).toMatchObject({
            ok: true,
            project: {
                rootId: 'root',
                activeVariantId: 'default',
                schemaVersion: 9,
                nodes: { root: { data: {}, children: [] } },
            },
            summary: {
                variantCount: 1,
                variantNames: ['Default'],
                templateCount: 1,
                nodeCount: 1,
                estimatedPageCount: 1,
                warnings: [],
            },
        });
        expect(raw).toEqual(before);
    });

    it('accepts variant output and preserves its active variant', () => {
        const templates = {
            variants: {
                eink: { id: 'eink', name: 'E-ink', templates: validTemplates() },
                tablet: { id: 'tablet', name: 'Tablet', templates: validTemplates() },
            },
            activeVariantId: 'tablet',
        };

        const validation = validateGeneratedProject({ templates, hierarchy: validHierarchy() });

        expect(validation).toMatchObject({
            ok: true,
            project: { activeVariantId: 'tablet' },
            summary: { variantCount: 2, variantNames: ['E-ink', 'Tablet'], templateCount: 2 },
        });
    });

    it('rejects a missing hierarchy root', () => {
        const hierarchy = { ...validHierarchy(), rootId: 'missing' };
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'hierarchy' });
    });

    it.each([
        ['a cycle', () => ({
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: ['child'] },
                child: { id: 'child', parentId: 'root', type: 'page', title: 'Child', children: ['root'] },
            },
            rootId: 'root',
        })],
        ['repeated child ownership', () => ({
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: ['child', 'child'] },
                child: { id: 'child', parentId: 'root', type: 'page', title: 'Child', children: [] },
            },
            rootId: 'root',
        })],
        ['a missing child', () => ({
            nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: ['missing'] } },
            rootId: 'root',
        })],
        ['a parent mismatch', () => ({
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: ['child'] },
                child: { id: 'child', parentId: 'other', type: 'page', title: 'Child', children: [] },
            },
            rootId: 'root',
        })],
        ['an orphan node', () => ({
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: [] },
                orphan: { id: 'orphan', parentId: 'root', type: 'page', title: 'Orphan', children: [] },
            },
            rootId: 'root',
        })],
    ])('rejects ownership hierarchy containing %s', (_name, hierarchy) => {
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy: hierarchy() })).toMatchObject({ ok: false, category: 'hierarchy' });
    });

    it('rejects fan-out beyond the node ceiling before traversal expansion', () => {
        const hierarchy = {
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: Array(20_001).fill('child') },
                child: { id: 'child', parentId: 'root', type: 'page', title: 'Child', children: [] },
            },
            rootId: 'root',
        };

        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'limits' });
    });

    it('accepts and counts a 20,000-deep ownership hierarchy iteratively', () => {
        const nodes: Record<string, any> = Object.create(null);
        for (let index = 0; index < 20_000; index += 1) {
            const id = `node_${index}`;
            nodes[id] = {
                id,
                parentId: index === 0 ? null : `node_${index - 1}`,
                type: 'page',
                title: id,
                children: index === 19_999 ? [] : [`node_${index + 1}`],
            };
        }

        expect(validateGeneratedProject({
            templates: validTemplates(),
            hierarchy: { nodes, rootId: 'node_0' },
        })).toMatchObject({ ok: true, summary: { nodeCount: 20_000, estimatedPageCount: 20_000 } });
    });

    it('rejects node types absent from any generated variant', () => {
        const hierarchy = validHierarchy();
        hierarchy.nodes.root.type = 'missing';
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'hierarchy' });
    });

    it('rejects references to missing nodes', () => {
        const hierarchy = {
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: ['ref'] },
                ref: { id: 'ref', parentId: 'root', type: 'page', title: 'Ref', children: [], referenceId: 'missing' },
            },
            rootId: 'root',
        };

        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({
            ok: false,
            category: 'hierarchy',
            message: expect.stringContaining("reference 'missing'"),
        });
    });

    it('rejects reference cycles', () => {
        const hierarchy = {
            nodes: {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: ['a', 'b'] },
                a: { id: 'a', parentId: 'root', type: 'page', title: 'A', children: [], referenceId: 'b' },
                b: { id: 'b', parentId: 'root', type: 'page', title: 'B', children: [], referenceId: 'a' },
            },
            rootId: 'root',
        };

        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({
            ok: false,
            category: 'hierarchy',
            message: expect.stringMatching(/reference cycle/i),
        });
    });

    it('rejects reference chains deeper than 100 hops and accepts the boundary', () => {
        const makeHierarchy = (hops: number) => {
            const nodes: Record<string, any> = {
                root: { id: 'root', parentId: null, type: 'page', title: 'Root', children: [] },
            };
            for (let index = 0; index <= hops; index += 1) {
                const id = `ref_${index}`;
                nodes.root.children.push(id);
                nodes[id] = {
                    id,
                    parentId: 'root',
                    type: 'page',
                    title: id,
                    children: [],
                    ...(index < hops ? { referenceId: `ref_${index + 1}` } : {}),
                };
            }
            return { nodes, rootId: 'root' };
        };

        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy: makeHierarchy(100) })).toMatchObject({ ok: true });
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy: makeHierarchy(101) })).toMatchObject({
            ok: false,
            category: 'limits',
            message: expect.stringMatching(/reference depth/i),
        });
    });

    it.each([
        ['non-array path', { traversalPath: {} }],
        ['negative slice start', { traversalPath: [{ sliceStart: -1 }] }],
        ['fractional slice count', { traversalPath: [{ sliceCount: 1.5 }] }],
        ['unknown step fields', { traversalPath: [{ sliceStart: 0, extra: true }] }],
        ['excessive depth', { traversalPath: Array.from({ length: 101 }, () => ({ sliceStart: 0 })) }],
    ])('rejects invalid grid traversal: %s', (_name, gridConfig) => {
        expect(validateGeneratedProject({
            templates: { page: template('page', [{ id: 'grid', type: 'grid', gridConfig }]) },
            hierarchy: validHierarchy(),
        })).toMatchObject({ ok: false, category: expect.stringMatching(/template|limits/) });
    });

    it('accepts a bounded traversal path', () => {
        expect(validateGeneratedProject({
            templates: {
                page: template('page', [{
                    id: 'grid',
                    type: 'grid',
                    gridConfig: { traversalPath: [{ sliceStart: 0, sliceCount: 2 }] },
                }]),
            },
            hierarchy: validHierarchy(),
        })).toMatchObject({ ok: true });
    });

    it('rejects inherited object keys as unknown node types', () => {
        const hierarchy = validHierarchy();
        hierarchy.nodes.root.type = 'toString';

        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'hierarchy' });
    });

    it('keeps prototype-named node ids as own nodes', () => {
        const nodes = JSON.parse('{"__proto__":{"id":"__proto__","parentId":null,"type":"page","title":"Root"}}');
        const validation = validateGeneratedProject({
            templates: validTemplates(),
            hierarchy: { nodes, rootId: '__proto__' },
        });

        expect(validation).toMatchObject({ ok: true, project: { rootId: '__proto__' } });
        if (validation.ok) expect(Object.hasOwn(validation.project.nodes, '__proto__')).toBe(true);
    });

    it.each([
        ['function values', () => ({ templates: { page: { ...template(), extra: () => undefined } }, hierarchy: validHierarchy() })],
        ['custom prototypes', () => ({ templates: { page: Object.assign(Object.create({ inherited: true }), template()) }, hierarchy: validHierarchy() })],
        ['cyclic values', () => {
            const hierarchy: any = validHierarchy();
            hierarchy.loop = hierarchy;
            return { templates: validTemplates(), hierarchy };
        }],
    ])('rejects non-plain JSON: %s', (_name, makeRaw) => {
        expect(validateGeneratedProject(makeRaw())).toMatchObject({ ok: false });
    });

    it('accepts repeated references when they do not form a cycle', () => {
        const sharedElement = { type: 'rect' };
        const templates = { page: template('page', [sharedElement, sharedElement]) };

        expect(validateGeneratedProject({ templates, hierarchy: validHierarchy() })).toMatchObject({ ok: true });
    });

    it('rejects 20,001 nodes', () => {
        const hierarchy = validHierarchy();
        for (let index = 0; index < 20_000; index += 1) {
            const id = `node_${index}`;
            (hierarchy.nodes as Record<string, any>)[id] = { id, parentId: 'root', type: 'page', title: id, data: {}, children: [] };
        }
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'limits' });
    });

    it('rejects 51 variants', () => {
        const variants = Object.fromEntries(Array.from({ length: 51 }, (_, index) => {
            const id = `variant_${index}`;
            return [id, { id, name: id, templates: validTemplates() }];
        }));
        expect(validateGeneratedProject({
            templates: { variants, activeVariantId: 'variant_0' },
            hierarchy: validHierarchy(),
        })).toMatchObject({ ok: false, category: 'limits' });
    });

    it('rejects 50,001 elements', () => {
        const elements = Array.from({ length: 50_001 }, (_, index) => ({ id: `element_${index}`, type: 'rect' }));
        expect(validateGeneratedProject({
            templates: { page: template('page', elements) },
            hierarchy: validHierarchy(),
        })).toMatchObject({ ok: false, category: 'limits' });
    });

    it.each([
        ['zero width', { ...template(), width: 0 }],
        ['oversized height', { ...template(), height: 20_001 }],
        ['non-array layers', { ...template(), layers: {} }],
        ['too many layers', { ...template(), layers: Array.from({ length: 201 }, (_, index) => ({ id: `layer_${index}` })) }],
        ['non-string layerId', { ...template(), elements: [{ id: 'element', type: 'rect', layerId: 42 }] }],
    ])('rejects server-incompatible template data: %s', (_name, invalidTemplate) => {
        expect(validateGeneratedProject({
            templates: { page: invalidTemplate },
            hierarchy: validHierarchy(),
        })).toMatchObject({ ok: false, category: 'template' });
    });

    it('rejects output larger than 5 MiB', () => {
        const hierarchy = validHierarchy();
        (hierarchy.nodes.root as any).data = { large: 'x'.repeat(5 * 1024 * 1024) };
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'limits' });
    });
});
