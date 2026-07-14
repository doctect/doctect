import type { AppNode, Variant } from '../types';
import {
    MAX_ELEMENTS,
    MAX_LAYERS_PER_TEMPLATE,
    MAX_NODES,
    MAX_REFERENCE_DEPTH,
    MAX_STATE_BYTES,
    MAX_TEMPLATE_DIMENSION,
    MAX_TRAVERSAL_DEPTH,
    MAX_VARIANTS,
} from '../shared/projectLimits.js';
import type { GeneratorSandboxRawResult } from './generatorSandbox';
import { normalizeGeneratedTemplates } from './generatorTemplates';
import { migrateState } from './migration';
import { computePageOrder } from './pdfService';

export interface GeneratedProject {
    nodes: Record<string, AppNode>;
    rootId: string;
    variants: Record<string, Variant>;
    activeVariantId: string;
    schemaVersion: 9;
}

export interface GeneratedProjectSummary {
    variantCount: number;
    variantNames: string[];
    templateCount: number;
    nodeCount: number;
    estimatedPageCount: number;
    warnings: string[];
}

export type GeneratedProjectValidation =
    | { ok: true; project: GeneratedProject; summary: GeneratedProjectSummary }
    | { ok: false; category: 'template' | 'hierarchy' | 'limits' | 'migration'; message: string };

type FailureCategory = Extract<GeneratedProjectValidation, { ok: false }>['category'];

const fail = (category: FailureCategory, message: string): GeneratedProjectValidation => ({ ok: false, category, message });
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const jsonIssue = (root: unknown): string | undefined => {
    const active = new WeakSet<object>();
    const stack: Array<{ value: unknown; path: string; exit?: boolean }> = [{ value: root, path: 'output' }];
    while (stack.length > 0) {
        const { value, path, exit } = stack.pop()!;
        if (exit) {
            active.delete(value as object);
            continue;
        }
        if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return `${path} contains a non-finite number`;
            continue;
        }
        if (typeof value !== 'object') return `${path} contains a non-JSON value`;
        if (active.has(value)) return `${path} contains a cycle`;
        active.add(value);
        stack.push({ value, path, exit: true });

        if (Array.isArray(value)) {
            if (Object.getPrototypeOf(value) !== Array.prototype) return `${path} has a custom prototype`;
            const ownKeys = Reflect.ownKeys(value);
            if (ownKeys.some(key => typeof key === 'symbol' || (key !== 'length' && !/^\d+$/.test(key)))) {
                return `${path} has non-JSON array properties`;
            }
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.hasOwn(value, index)) return `${path} contains a sparse array`;
                stack.push({ value: value[index], path: `${path}[${index}]` });
            }
            continue;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) return `${path} has a custom prototype`;
        for (const key of Reflect.ownKeys(value)) {
            if (typeof key !== 'string') return `${path} has symbol properties`;
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return `${path}.${key} is not plain data`;
            stack.push({ value: descriptor.value, path: `${path}.${key}` });
        }
    }
    return undefined;
};

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

type RawTemplateIssue = { category: 'template' | 'limits'; message: string };

const validateTraversalPath = (value: unknown, context: string): RawTemplateIssue | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return { category: 'template', message: `${context} traversalPath must be an array.` };
    if (value.length > MAX_TRAVERSAL_DEPTH) {
        return { category: 'limits', message: `${context} traversal depth exceeds ${MAX_TRAVERSAL_DEPTH}.` };
    }
    for (let index = 0; index < value.length; index += 1) {
        const step = value[index];
        if (!isRecord(step) || Object.keys(step).some(key => key !== 'sliceStart' && key !== 'sliceCount')) {
            return { category: 'template', message: `${context} traversal step ${index} is malformed.` };
        }
        for (const field of ['sliceStart', 'sliceCount'] as const) {
            if (step[field] !== undefined && (!Number.isSafeInteger(step[field]) || (step[field] as number) < 0)) {
                return { category: 'template', message: `${context} traversal step ${index} ${field} must be a non-negative safe integer.` };
            }
        }
    }
    return undefined;
};

const validateRawTemplateMap = (raw: unknown, context: string): RawTemplateIssue | undefined => {
    if (!isRecord(raw)) return { category: 'template', message: `${context} templates must be an object.` };
    for (const [templateId, value] of Object.entries(raw)) {
        if (!isRecord(value)) return { category: 'template', message: `Template ${context}/${templateId} must be an object.` };
        if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0 || value.width > MAX_TEMPLATE_DIMENSION
            || typeof value.height !== 'number' || !Number.isFinite(value.height) || value.height <= 0 || value.height > MAX_TEMPLATE_DIMENSION) {
            return { category: 'template', message: `Template ${context}/${templateId} has invalid dimensions.` };
        }
        if (!Array.isArray(value.elements)) return { category: 'template', message: `Template ${context}/${templateId} elements must be an array.` };
        if (value.layers !== undefined) {
            if (!Array.isArray(value.layers)) return { category: 'template', message: `Template ${context}/${templateId} layers must be an array.` };
            if (value.layers.length > MAX_LAYERS_PER_TEMPLATE) return { category: 'template', message: `Template ${context}/${templateId} has too many layers.` };
        }
        for (let index = 0; index < value.elements.length; index += 1) {
            const element = value.elements[index];
            if (isRecord(element) && element.layerId !== undefined && typeof element.layerId !== 'string') {
                return { category: 'template', message: `Template ${context}/${templateId} has an element with a non-string layerId.` };
            }
            if (isRecord(element) && element.gridConfig !== undefined) {
                if (!isRecord(element.gridConfig)) {
                    return { category: 'template', message: `Template ${context}/${templateId} grid ${index} config must be an object.` };
                }
                const issue = validateTraversalPath(element.gridConfig.traversalPath, `Template ${context}/${templateId} grid ${index}`);
                if (issue) return issue;
            }
        }
    }
    return undefined;
};

const validateRawTemplates = (raw: unknown): RawTemplateIssue | undefined => {
    if (!isRecord(raw)) return { category: 'template', message: 'Templates must be an object.' };
    if (!Object.hasOwn(raw, 'variants')) return validateRawTemplateMap(raw, 'default');
    if (!isRecord(raw.variants)) return { category: 'template', message: 'Variants must be an object.' };
    for (const [variantId, variant] of Object.entries(raw.variants)) {
        if (!isRecord(variant)) return { category: 'template', message: `Variant ${variantId} must be an object.` };
        const issue = validateRawTemplateMap(variant.templates, variantId);
        if (issue) return issue;
    }
    return undefined;
};

export function validateGeneratedProject(raw: GeneratorSandboxRawResult): GeneratedProjectValidation {
    if (!isRecord(raw) || !Object.hasOwn(raw, 'templates') || !Object.hasOwn(raw, 'hierarchy')) {
        return fail('template', 'Generator output must contain templates and hierarchy.');
    }
    const templateJsonIssue = jsonIssue(raw.templates);
    if (templateJsonIssue) return fail('template', `Templates ${templateJsonIssue}.`);
    const hierarchyJsonIssue = jsonIssue(raw.hierarchy);
    if (hierarchyJsonIssue) return fail('hierarchy', `Hierarchy ${hierarchyJsonIssue}.`);

    let serialized: string;
    try {
        serialized = JSON.stringify(raw);
    } catch {
        return fail('hierarchy', 'Generator output is not serializable.');
    }
    if (utf8Bytes(serialized) > MAX_STATE_BYTES) {
        return fail('limits', `Generated output exceeds ${MAX_STATE_BYTES} bytes.`);
    }

    const cloned = JSON.parse(serialized) as GeneratorSandboxRawResult;
    const rawTemplateIssue = validateRawTemplates(cloned.templates);
    if (rawTemplateIssue) return fail(rawTemplateIssue.category, rawTemplateIssue.message);
    let normalized;
    try {
        normalized = normalizeGeneratedTemplates(cloned.templates);
    } catch (error) {
        return fail('template', error instanceof Error ? error.message : 'Templates could not be normalized.');
    }

    const variants: Record<string, Variant> = normalized.variants ?? {
        default: { id: 'default', name: 'Default', templates: normalized.templates ?? {} },
    };
    const variantIds = Object.keys(variants);
    if (variantIds.length === 0) return fail('template', 'Template script produced no variants.');
    if (variantIds.length > MAX_VARIANTS) return fail('limits', `Generated project exceeds ${MAX_VARIANTS} variants.`);
    const activeVariantId = normalized.variants ? normalized.activeVariantId : 'default';
    if (!activeVariantId || !Object.hasOwn(variants, activeVariantId)) return fail('template', 'Generated project has no active variant.');

    let templateCount = 0;
    let elementCount = 0;
    for (const [variantId, variant] of Object.entries(variants)) {
        if (!variant || typeof variant.id !== 'string' || typeof variant.name !== 'string' || !isRecord(variant.templates)) {
            return fail('template', `Variant ${variantId} is malformed.`);
        }
        const templates = Object.entries(variant.templates);
        if (templates.length === 0) return fail('template', `Variant ${variantId} has no usable templates.`);
        templateCount += templates.length;
        for (const [templateId, template] of templates) {
            if (!template || typeof template.id !== 'string' || typeof template.name !== 'string') {
                return fail('template', `Template ${variantId}/${templateId} is missing id or name.`);
            }
            if (!Number.isFinite(template.width) || !Number.isFinite(template.height)
                || template.width <= 0 || template.height <= 0
                || template.width > MAX_TEMPLATE_DIMENSION || template.height > MAX_TEMPLATE_DIMENSION) {
                return fail('template', `Template ${variantId}/${templateId} has invalid dimensions.`);
            }
            if (!Array.isArray(template.elements)) return fail('template', `Template ${variantId}/${templateId} elements must be an array.`);
            if (template.layers !== undefined) {
                if (!Array.isArray(template.layers)) return fail('template', `Template ${variantId}/${templateId} layers must be an array.`);
                if (template.layers.length > MAX_LAYERS_PER_TEMPLATE) return fail('template', `Template ${variantId}/${templateId} has too many layers.`);
            }
            for (const element of template.elements) {
                if (element?.layerId !== undefined && typeof element.layerId !== 'string') {
                    return fail('template', `Template ${variantId}/${templateId} has an element with a non-string layerId.`);
                }
            }
            elementCount += template.elements.length;
            if (elementCount > MAX_ELEMENTS) return fail('limits', `Generated project exceeds ${MAX_ELEMENTS} elements.`);
        }
    }

    if (!isRecord(cloned.hierarchy) || !isRecord(cloned.hierarchy.nodes) || typeof cloned.hierarchy.rootId !== 'string') {
        return fail('hierarchy', 'Hierarchy script must return an object with { nodes, rootId }.');
    }
    const rawNodes = cloned.hierarchy.nodes;
    const nodeEntries = Object.entries(rawNodes);
    if (nodeEntries.length > MAX_NODES) return fail('limits', `Generated project exceeds ${MAX_NODES} nodes.`);
    if (!Object.hasOwn(rawNodes, cloned.hierarchy.rootId)) {
        return fail('hierarchy', `Root ID '${cloned.hierarchy.rootId}' was not found in nodes.`);
    }

    const nodes: Record<string, AppNode> = Object.create(null);
    for (const [nodeId, value] of nodeEntries) {
        if (!isRecord(value)) return fail('hierarchy', `Node ${nodeId} must be an object.`);
        if (value.id !== nodeId) return fail('hierarchy', `Node ${nodeId} has a mismatched id.`);
        if (value.parentId !== null && typeof value.parentId !== 'string') return fail('hierarchy', `Node ${nodeId} has an invalid parentId.`);
        if (typeof value.type !== 'string' || typeof value.title !== 'string') return fail('hierarchy', `Node ${nodeId} is missing type or title.`);
        if (value.data !== undefined && !isRecord(value.data)) return fail('hierarchy', `Node ${nodeId} data must be an object.`);
        if (value.children !== undefined && (!Array.isArray(value.children) || value.children.some(child => typeof child !== 'string'))) {
            return fail('hierarchy', `Node ${nodeId} children must be string ids.`);
        }
        if (value.referenceId !== undefined && typeof value.referenceId !== 'string') {
            return fail('hierarchy', `Node ${nodeId} referenceId must be a string.`);
        }
        for (const [variantId, variant] of Object.entries(variants)) {
            if (!Object.hasOwn(variant.templates, value.type)) {
                return fail('hierarchy', `Node ${nodeId} references unknown template type '${value.type}' in variant '${variantId}'.`);
            }
        }
        nodes[nodeId] = {
            ...value,
            id: nodeId,
            parentId: value.parentId as string | null,
            type: value.type,
            title: value.title,
            data: (value.data ?? {}) as Record<string, string>,
            children: (value.children ?? []) as string[],
        };
    }

    for (const nodeId of Object.keys(nodes)) {
        const visited = new Set<string>([nodeId]);
        let current = nodes[nodeId];
        let depth = 0;
        while (current.referenceId !== undefined) {
            const targetId = current.referenceId;
            if (!Object.hasOwn(nodes, targetId)) {
                return fail('hierarchy', `Node '${current.id}' reference '${targetId}' does not exist.`);
            }
            if (visited.has(targetId)) return fail('hierarchy', `Node '${nodeId}' has a reference cycle.`);
            depth += 1;
            if (depth > MAX_REFERENCE_DEPTH) return fail('limits', `Reference depth exceeds ${MAX_REFERENCE_DEPTH}.`);
            visited.add(targetId);
            current = nodes[targetId];
        }
    }

    const rootNode = nodes[cloned.hierarchy.rootId];
    if (rootNode.parentId !== null) return fail('hierarchy', 'Root node parentId must be null.');
    const owned = new Set<string>([cloned.hierarchy.rootId]);
    const pendingOwnership: Array<{ nodeId: string; depth: number }> = [{ nodeId: cloned.hierarchy.rootId, depth: 0 }];
    let ownershipEdges = 0;
    while (pendingOwnership.length > 0) {
        const { nodeId, depth } = pendingOwnership.pop()!;
        const node = nodes[nodeId];
        if (node.children.length > MAX_NODES) return fail('limits', `Node ${nodeId} exceeds ${MAX_NODES} children.`);
        for (const childId of node.children) {
            ownershipEdges += 1;
            if (ownershipEdges > MAX_NODES) return fail('limits', `Hierarchy exceeds ${MAX_NODES} ownership edges.`);
            if (!Object.hasOwn(nodes, childId)) return fail('hierarchy', `Node ${nodeId} references missing child '${childId}'.`);
            if (owned.has(childId)) return fail('hierarchy', `Node '${childId}' has repeated or cyclic ownership.`);
            if (nodes[childId].parentId !== nodeId) return fail('hierarchy', `Node '${childId}' parentId does not match owner '${nodeId}'.`);
            const childDepth = depth + 1;
            if (childDepth >= MAX_NODES) return fail('limits', `Hierarchy depth exceeds ${MAX_NODES}.`);
            owned.add(childId);
            pendingOwnership.push({ nodeId: childId, depth: childDepth });
        }
    }
    if (owned.size !== nodeEntries.length) return fail('hierarchy', 'Hierarchy contains nodes not owned by the root tree.');

    let project: GeneratedProject;
    try {
        const migrated = migrateState({
            nodes,
            rootId: cloned.hierarchy.rootId,
            variants,
            activeVariantId,
            schemaVersion: 8,
        });
        project = {
            nodes: migrated.nodes,
            rootId: migrated.rootId,
            variants: migrated.variants,
            activeVariantId: migrated.activeVariantId,
            schemaVersion: 9,
        };
    } catch (error) {
        return fail('migration', error instanceof Error ? error.message : 'Generated project migration failed.');
    }

    if (utf8Bytes(JSON.stringify(project)) > MAX_STATE_BYTES) {
        return fail('limits', `Generated project exceeds ${MAX_STATE_BYTES} bytes after normalization.`);
    }

    let estimatedPageCount: number;
    try {
        estimatedPageCount = computePageOrder(project as any).length;
    } catch {
        return fail('hierarchy', 'Hierarchy could not be traversed to estimate pages.');
    }

    return {
        ok: true,
        project,
        summary: {
            variantCount: variantIds.length,
            variantNames: variantIds.map(id => variants[id].name),
            templateCount,
            nodeCount: nodeEntries.length,
            estimatedPageCount,
            warnings: [],
        },
    };
}
