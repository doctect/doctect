import { describe, expect, it } from 'vitest';
import { buildVariantPreviews, fitTemplateScale, nodesForTemplatePreview } from '../../services/generatorVisualPreview';
import type { GeneratedProject } from '../../services/validateGeneratedProject';
import type { AppNode, PageTemplate } from '../../types';

const project: GeneratedProject = {
    schemaVersion: 9,
    rootId: 'root',
    activeVariantId: 'remarkable',
    nodes: {
        root: { id: 'root', parentId: null, type: 'cover', title: 'Cover page', data: {}, children: ['chapter'] },
        chapter: { id: 'chapter', parentId: 'root', type: 'body', title: 'First chapter', data: {}, children: ['body-2'] },
        'body-2': { id: 'body-2', parentId: 'chapter', type: 'body', title: 'Second body', data: {}, children: [] },
    },
    variants: {
        remarkable: {
            id: 'remarkable', name: 'reMarkable',
            templates: {
                cover: { id: 'cover', name: 'Cover', width: 1404, height: 1872, layers: [], elements: [] },
                body: { id: 'body', name: 'Body', width: 1404, height: 1872, layers: [], elements: [] },
                appendix: { id: 'appendix', name: 'Appendix', width: 1404, height: 1872, layers: [], elements: [] },
            },
        },
        a4: {
            id: 'a4', name: 'A4',
            templates: {
                cover: { id: 'cover', name: 'Cover A4', width: 595, height: 842, layers: [], elements: [] },
                body: { id: 'body', name: 'Body A4', width: 595, height: 842, layers: [], elements: [] },
            },
        },
    },
};

describe('generator visual preview descriptors', () => {
    it('uses first page-order node, counts all uses, and adds unused synthetic nodes without mutation', () => {
        const before = structuredClone(project);
        let sequence = 0;
        const variants = buildVariantPreviews(project, () => `synthetic-${++sequence}`);
        const remarkable = variants[0];
        expect(remarkable.variantName).toBe('reMarkable');
        expect(remarkable.templates.map(item => item.templateId)).toEqual(['cover', 'body', 'appendix']);
        expect(remarkable.templates[1]).toMatchObject({ nodeId: 'chapter', nodeTitle: 'First chapter', usageCount: 2, unused: false });
        expect(remarkable.templates[2]).toMatchObject({ nodeId: 'synthetic-1', usageCount: 0, unused: true });
        expect(nodesForTemplatePreview(project.nodes, remarkable.templates[2])['synthetic-1']).toMatchObject({ type: 'appendix', parentId: null, children: [] });
        expect(project).toEqual(before);
    });

    it('keeps variants isolated and returns a bounded positive scale', () => {
        const variants = buildVariantPreviews(project, () => 'unused');
        expect(variants[1].templates.map(item => item.template.name)).toEqual(['Cover A4', 'Body A4']);
        expect(fitTemplateScale({ width: 1404, height: 1872 }, 220, 240)).toBeCloseTo(240 / 1872);
    });

    it('requests another synthetic ID when one collides with a real node', () => {
        const createId = ['root', 'synthetic-appendix'][Symbol.iterator]();
        const variants = buildVariantPreviews(project, () => createId.next().value!);

        expect(variants[0].templates[2].nodeId).toBe('synthetic-appendix');
    });

    it('indexes node types in bounded passes at the 20,000-node limit', () => {
        const nodeCount = 20_000;
        const templateCount = 100;
        const nodes: Record<string, AppNode> = {};
        const templates: Record<string, PageTemplate> = {};
        const rootChildren: string[] = [];
        let typeReads = 0;

        for (let index = 0; index < templateCount; index += 1) {
            const templateId = `template-${index}`;
            templates[templateId] = { id: templateId, name: templateId, width: 100, height: 100, layers: [], elements: [] };
        }
        for (let index = 0; index < nodeCount; index += 1) {
            const id = `node-${index}`;
            const templateId = `template-${index % templateCount}`;
            const node: AppNode = { id, parentId: index === 0 ? null : 'node-0', type: templateId, title: id, data: {}, children: [] };
            Object.defineProperty(node, 'type', {
                enumerable: true,
                get: () => {
                    typeReads += 1;
                    return templateId;
                },
            });
            nodes[id] = node;
            if (index > 0) rootChildren.push(id);
        }
        nodes['node-0'].children = rootChildren;

        const variants = buildVariantPreviews({
            schemaVersion: 9,
            rootId: 'node-0',
            activeVariantId: 'limit',
            nodes,
            variants: { limit: { id: 'limit', name: 'Limit', templates } },
        });

        expect(variants[0].templates).toHaveLength(templateCount);
        expect(variants[0].templates.every(item => item.usageCount === nodeCount / templateCount)).toBe(true);
        expect(typeReads).toBeLessThanOrEqual(nodeCount * 2);
    });
});
