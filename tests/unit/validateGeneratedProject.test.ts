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

    it('rejects node types absent from any generated variant', () => {
        const hierarchy = validHierarchy();
        hierarchy.nodes.root.type = 'missing';
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'hierarchy' });
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

    it('rejects output larger than 5 MiB', () => {
        const hierarchy = validHierarchy();
        (hierarchy.nodes.root as any).data = { large: 'x'.repeat(5 * 1024 * 1024) };
        expect(validateGeneratedProject({ templates: validTemplates(), hierarchy })).toMatchObject({ ok: false, category: 'limits' });
    });
});
