import type { AppNode, PageTemplate } from '../types';
import type { GeneratedProject, GeneratedProjectSummary } from './validateGeneratedProject';
import { computePageOrder } from './pdfService';

export const PREVIEW_BATCH_SIZE = 24;

export interface GeneratorSourceDraft {
    formatVersion: 1;
    templateScript: string;
    hierarchyScript: string;
}

export interface GeneratorPreviewPayload {
    project: GeneratedProject;
    summary: GeneratedProjectSummary;
    source: GeneratorSourceDraft;
}

export interface TemplatePreviewDescriptor {
    variantId: string;
    variantName: string;
    templateId: string;
    template: PageTemplate;
    nodeId: string;
    nodeTitle: string;
    usageCount: number;
    unused: boolean;
    syntheticNode?: AppNode;
}

export interface VariantPreviewDescriptor {
    variantId: string;
    variantName: string;
    templates: TemplatePreviewDescriptor[];
}

const defaultCreateId = () => `generator-preview-${crypto.randomUUID()}`;

export function buildVariantPreviews(project: GeneratedProject, createId = defaultCreateId): VariantPreviewDescriptor[] {
    const pageOrder = computePageOrder(project);
    const orderedNodes = pageOrder.map(id => project.nodes[id]).filter((node): node is AppNode => Boolean(node));
    const allNodes = Object.values(project.nodes);

    return Object.entries(project.variants).map(([variantId, variant]) => ({
        variantId,
        variantName: variant.name || variantId,
        templates: Object.entries(variant.templates).map(([templateId, template]) => {
            const matching = allNodes.filter(node => node.type === templateId);
            const representative = orderedNodes.find(node => node.type === templateId) ?? matching[0];
            if (representative) {
                return {
                    variantId,
                    variantName: variant.name || variantId,
                    templateId,
                    template,
                    nodeId: representative.id,
                    nodeTitle: representative.title || representative.id,
                    usageCount: matching.length,
                    unused: false,
                };
            }

            let syntheticId = createId();
            while (Object.hasOwn(project.nodes, syntheticId)) syntheticId = createId();
            const syntheticNode: AppNode = {
                id: syntheticId,
                parentId: null,
                type: templateId,
                title: template.name || templateId,
                data: {},
                children: [],
            };
            return {
                variantId,
                variantName: variant.name || variantId,
                templateId,
                template,
                nodeId: syntheticId,
                nodeTitle: syntheticNode.title,
                usageCount: 0,
                unused: true,
                syntheticNode,
            };
        }),
    }));
}

export function nodesForTemplatePreview(nodes: Record<string, AppNode>, descriptor: TemplatePreviewDescriptor) {
    return descriptor.syntheticNode ? { ...nodes, [descriptor.syntheticNode.id]: descriptor.syntheticNode } : nodes;
}

export function fitTemplateScale(template: Pick<PageTemplate, 'width' | 'height'>, maxWidth: number, maxHeight: number) {
    if (!(template.width > 0) || !(template.height > 0) || !(maxWidth > 0) || !(maxHeight > 0)) return 1;
    return Math.min(maxWidth / template.width, maxHeight / template.height);
}
