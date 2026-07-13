import { describe, expect, it } from 'vitest';
import { generatePDF } from '../../../services/pdfService';
import {
    collectGallerySampleSlugs,
    loadGallerySample,
    validateSharedGalleryInvariants,
} from '../../helpers/gallerySampleHarness';

const EXPECTED_SLUGS = [
    '01-academic-success-system',
    '02-work-project-hub',
    '03-personal-finance-planner',
    '04-wellness-fitness-journal',
    '05-seasonal-kitchen',
    '06-travel-field-journal',
    '07-novel-story-studio',
    '08-ttrpg-campaign-codex',
];

const descendants = (sample: ReturnType<typeof loadGallerySample>, rootId: string) => {
    const nodeIds: string[] = [];
    const pending = [rootId];
    while (pending.length > 0) {
        const nodeId = pending.shift()!;
        nodeIds.push(nodeId);
        pending.push(...sample.nodes[nodeId].children);
    }
    return nodeIds;
};

const resolveAncestorField = (
    sample: ReturnType<typeof loadGallerySample>,
    nodeId: string,
    field: string,
) => {
    let node = sample.nodes[nodeId];
    while (node) {
        if (node.data?.[field] !== undefined) return node.data[field];
        node = node.parentId ? sample.nodes[node.parentId] : undefined;
    }
    return undefined;
};

describe('gallery sample collection', () => {
    it('contains exactly the eight approved products', () => {
        expect(collectGallerySampleSlugs()).toEqual(EXPECTED_SLUGS);
    });

    it.each(EXPECTED_SLUGS)('%s has no structural contract errors', slug => {
        const sample = loadGallerySample(slug);
        expect(validateSharedGalleryInvariants(sample)).toEqual([]);
    });

    it.each(EXPECTED_SLUGS)('%s shadows example chrome throughout the blank workspace', slug => {
        const sample = loadGallerySample(slug);

        descendants(sample, 'blank_workspace').forEach(nodeId => {
            expect(resolveAncestorField(sample, nodeId, 'example_label'), `${nodeId} example`).toBe('');
            expect(resolveAncestorField(sample, nodeId, 'skip_label'), `${nodeId} skip`).toBe('');
        });
    });

    it.each(EXPECTED_SLUGS)('%s emits no PDF annotation for its empty blank Skip binding', async slug => {
        const sample = loadGallerySample(slug);
        const blankWorkspace = sample.nodes.blank_workspace;
        const template = sample.templates[blankWorkspace.type];
        const skip = template.elements.find((element: any) =>
            element.type === 'text'
            && element.dataBinding === 'skip_label'
            && element.linkTarget === 'specific_node'
            && element.linkValue === 'blank_workspace',
        );
        expect(skip).toBeTruthy();

        const state = {
            rootId: 'blank_workspace',
            nodes: {
                ...sample.nodes,
                blank_workspace: { ...blankWorkspace, children: [] },
            },
            activeVariantId: 'default',
            variants: {
                default: {
                    id: 'default',
                    name: 'Default',
                    templates: {
                        [blankWorkspace.type]: { ...template, elements: [skip] },
                    },
                },
            },
        } as any;
        const buffer = await generatePDF(state, { output: 'arraybuffer' }) as ArrayBuffer;
        const pdf = new TextDecoder('latin1').decode(new Uint8Array(buffer));

        expect(pdf).not.toContain('/Dest');
    });

    it.each(EXPECTED_SLUGS)('%s emits no Skip annotation from a non-root blank descendant', async slug => {
        const sample = loadGallerySample(slug);
        const blankWorkspace = sample.nodes.blank_workspace;
        const descendantId = blankWorkspace.children.find((nodeId: string) => {
            const node = sample.nodes[nodeId];
            const template = node && sample.templates[node.type];
            return !node?.referenceId && template?.elements.some((element: any) =>
                element.type === 'text'
                && element.dataBinding === 'skip_label'
                && element.linkTarget === 'specific_node'
                && element.linkValue === 'blank_workspace',
            );
        });
        expect(descendantId).toBeTruthy();

        const descendant = sample.nodes[descendantId!];
        const descendantTemplate = sample.templates[descendant.type];
        const skip = descendantTemplate.elements.find((element: any) =>
            element.type === 'text'
            && element.dataBinding === 'skip_label'
            && element.linkTarget === 'specific_node'
            && element.linkValue === 'blank_workspace',
        );
        const blankRootType = '__blank_annotation_root__';
        const state = {
            rootId: 'blank_workspace',
            nodes: {
                blank_workspace: {
                    ...blankWorkspace,
                    type: blankRootType,
                    children: [descendantId],
                },
                [descendantId!]: { ...descendant, parentId: 'blank_workspace', children: [] },
            },
            activeVariantId: 'default',
            variants: {
                default: {
                    id: 'default',
                    name: 'Default',
                    templates: {
                        [blankRootType]: { ...descendantTemplate, id: blankRootType, elements: [] },
                        [descendant.type]: { ...descendantTemplate, elements: [skip] },
                    },
                },
            },
        } as any;
        const buffer = await generatePDF(state, { output: 'arraybuffer' }) as ArrayBuffer;
        const pdf = new TextDecoder('latin1').decode(new Uint8Array(buffer));

        expect(pdf).not.toContain('/Dest');
    });
});
