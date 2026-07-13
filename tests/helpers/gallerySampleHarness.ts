import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getElementBounds } from '../../components/canvas/elementBounds';
import { normalizeGeneratedTemplates } from '../../services/generatorTemplates';
import { computePageOrder } from '../../services/pdfService';
import { normalizeCssColor } from '../../services/svgColorNormalize';

export interface LoadedGallerySample {
    slug: string;
    templates: Record<string, any>;
    nodes: Record<string, any>;
    rootId: string;
    templateSource: string;
    hierarchySource: string;
}

export interface GallerySampleContract {
    slug: string;
    expectedTemplateIds: string[];
    pageCount: [number, number];
    palette: string[];
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'];
}

const GALLERY_SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../gallery-samples');
const PAGE_WIDTH = 509;
const PAGE_HEIGHT = 679;
const GRID_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'none']);
const GRID_MODES = new Set(['all', 'outside', 'inside', 'none']);
const LINK_TARGETS = new Set([
    'none', 'url', 'specific_node', 'child_index', 'parent', 'ancestor', 'sibling', 'referrer', 'child_referrer',
]);
const executionConfigs = new WeakMap<LoadedGallerySample, Record<string, unknown>>();

const isRecord = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const hasTextBinding = (element: any, field: string) =>
    element?.dataBinding === field || (typeof element?.text === 'string' && element.text.includes(`{{${field}}}`));

type SolidColor = { r: number; g: number; b: number; alpha: number };

const parseSolidColor = (value: unknown): SolidColor | null => {
    if (typeof value !== 'string') return null;
    const color = value.trim().toLowerCase();
    if (color === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };

    const normalized = normalizeCssColor(color);
    if (normalized) {
        const parsed = parseSolidColor(normalized.color);
        return parsed ? { ...parsed, alpha: normalized.alpha } : null;
    }

    const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const digits = hex[1].length === 3
            ? hex[1].split('').map(digit => digit + digit).join('')
            : hex[1];
        return {
            r: parseInt(digits.slice(0, 2), 16),
            g: parseInt(digits.slice(2, 4), 16),
            b: parseInt(digits.slice(4, 6), 16),
            alpha: 1,
        };
    }

    const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if (!rgb) return null;
    const channels = rgb.slice(1, 4).map(Number);
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (![...channels, alpha].every(Number.isFinite)) return null;
    return { r: channels[0], g: channels[1], b: channels[2], alpha };
};

const isVisibleTextBinding = (element: any, field: string, template: any) => {
    const textColor = parseSolidColor(element?.textColor || '#000000');
    const fillColor = element?.fillType === 'pattern' ? null : parseSolidColor(element?.fill);
    const effectiveFontSize = element?.fontSize === undefined ? 12 : Number(element.fontSize);
    const layer = Array.isArray(template?.layers)
        ? template.layers.find((candidate: any) => candidate.id === element?.layerId)
        : undefined;

    return element?.type === 'text'
        && hasTextBinding(element, field)
        && Number.isFinite(element.w)
        && element.w > 0
        && Number.isFinite(element.h)
        && element.h > 0
        && (element.opacity === undefined || (Number.isFinite(element.opacity) && element.opacity > 0))
        && layer?.visible !== false
        && Number.isFinite(effectiveFontSize)
        && effectiveFontSize > 0
        && textColor?.alpha !== 0
        && !(textColor && fillColor && fillColor.alpha === 1
            && textColor.r === fillColor.r && textColor.g === fillColor.g && textColor.b === fillColor.b);
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const parseInteger = (value: unknown): number | undefined => {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const text = String(value).trim();
    if (!/^-?\d+$/.test(text)) return undefined;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const evaluateIndex = (value: unknown, data: Record<string, unknown>): number | undefined => {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value !== 'string') return undefined;
    const expression = value.trim();
    const literal = parseInteger(expression);
    if (literal !== undefined) return literal;
    const operation = expression.match(/^([^+-]+)\s*([+-])\s*(\d+)$/);
    if (operation) {
        const base = evaluateIndex(operation[1], data);
        if (base === undefined) return undefined;
        const adjustment = Number(operation[3]);
        return operation[2] === '+' ? base + adjustment : base - adjustment;
    }
    return parseInteger(data[expression]);
};

const assertSafeSlug = (slug: string) => {
    if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
        throw new Error(`Invalid gallery sample slug '${slug}'`);
    }
};

export function executeGallerySample(
    templateSource: string,
    hierarchySource: string,
    config: Record<string, unknown> = {},
): LoadedGallerySample {
    const templateFn = new Function('consts', `with (consts) { ${templateSource} }`);
    const raw = templateFn({ RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679, A4_WIDTH: 595, A4_HEIGHT: 842 });
    const normalized = normalizeGeneratedTemplates(raw);
    const templates = normalized.templates ?? normalized.variants![normalized.activeVariantId!].templates;
    let sequence = 0;
    const createId = (prefix = 'node') => `${prefix}_${String(++sequence).padStart(4, '0')}`;
    const hierarchyFn = new Function('templates', 'createId', 'SAMPLE_CONFIG', hierarchySource);
    const result = hierarchyFn(templates, createId, config);

    if (!isRecord(result) || !isRecord(result.nodes) || typeof result.rootId !== 'string') {
        throw new Error('Hierarchy script must return an object with { nodes, rootId }.');
    }

    const sample: LoadedGallerySample = {
        slug: 'fixture',
        templates,
        nodes: result.nodes,
        rootId: result.rootId,
        templateSource,
        hierarchySource,
    };
    executionConfigs.set(sample, config);
    return sample;
}

export function loadGallerySample(slug: string, config: Record<string, unknown> = {}): LoadedGallerySample {
    assertSafeSlug(slug);
    const sampleDir = join(GALLERY_SAMPLES_DIR, slug);
    const templateSource = readFileSync(join(sampleDir, 'templates.js'), 'utf8');
    const hierarchySource = readFileSync(join(sampleDir, 'hierarchy.js'), 'utf8');
    const sample = executeGallerySample(templateSource, hierarchySource, config);
    sample.slug = slug;
    return sample;
}

export function collectGallerySampleSlugs(): string[] {
    return readdirSync(GALLERY_SAMPLES_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(slug => ['templates.js', 'hierarchy.js', 'README.md']
            .every(file => existsSync(join(GALLERY_SAMPLES_DIR, slug, file))))
        .sort();
}

const renderedNodes = (sample: LoadedGallerySample, templateId: string) =>
    Object.values(sample.nodes).filter(node => isRecord(node) && node.type === templateId);

const siblingDestination = (node: any, offset: number, nodes: Record<string, any>) => {
    if (typeof node.parentId !== 'string') return undefined;
    const parent = nodes[node.parentId];
    if (!isRecord(parent) || !Array.isArray(parent.children)) return undefined;
    const index = parent.children.indexOf(node.id);
    if (index < 0) return undefined;
    return nodes[parent.children[index + offset]];
};

const ancestorDestination = (node: any, levels: number, nodes: Record<string, any>) => {
    let current = node;
    for (let level = 0; level < levels; level += 1) {
        if (typeof current?.parentId !== 'string' || !nodes[current.parentId]) return undefined;
        current = nodes[current.parentId];
    }
    return current;
};

const referrerDestination = (node: any, nodes: Record<string, any>) => {
    const targetId = node.referenceId || node.id;
    const referrer = Object.values(nodes).find(candidate => isRecord(candidate) && candidate.referenceId === targetId);
    return isRecord(referrer) && typeof referrer.parentId === 'string' ? nodes[referrer.parentId] : undefined;
};

const childReferrerDestination = (element: any, node: any, nodes: Record<string, any>) => {
    const start = evaluateIndex(element.linkValue ?? '0', node.data || {});
    const count = evaluateIndex(element.linkValue === undefined ? '1' : (element.linkSecondaryValue ?? '1'), node.data || {});
    if (start === undefined || count === undefined) return undefined;
    const direction = count >= 0 ? 1 : -1;
    for (let step = 0; step < Math.abs(count); step += 1) {
        const childId = node.children?.[start + step * direction];
        if (!childId) continue;
        const referrers = Object.values(nodes).filter(candidate => isRecord(candidate) && candidate.referenceId === childId);
        const filtered = element.linkReferrerParentType
            ? referrers.filter(referrer => nodes[referrer.parentId]?.type === element.linkReferrerParentType)
            : referrers;
        const referrer = filtered[0] ?? referrers[0];
        if (isRecord(referrer) && typeof referrer.parentId === 'string' && nodes[referrer.parentId]) {
            return nodes[referrer.parentId];
        }
    }
    return undefined;
};

const validateElementLink = (
    element: any,
    templateId: string,
    node: any,
    nodes: Record<string, any>,
    errors: string[],
) => {
    const target = element.linkTarget;
    if (target === undefined || target === 'none' || target === 'url') return;
    const context = `template '${templateId}' element '${element.id}'`;
    if (!LINK_TARGETS.has(target)) {
        errors.push(`${context} has invalid link target '${target}'`);
        return;
    }

    if (target === 'specific_node') {
        if (typeof element.linkValue !== 'string' || !nodes[element.linkValue]) {
            errors.push(`${context} specific node '${element.linkValue ?? ''}' does not exist`);
        }
        return;
    }
    if (target === 'child_index') {
        const index = parseInteger(element.linkValue);
        if (index === undefined || index < 0 || !nodes[node.children?.[index]]) {
            errors.push(`${context} child index ${element.linkValue ?? ''} does not resolve for node '${node.id}'`);
        }
        return;
    }
    if (target === 'parent') {
        if (typeof node.parentId !== 'string' || !nodes[node.parentId]) {
            errors.push(`${context} parent link does not resolve for node '${node.id}'`);
        }
        return;
    }
    if (target === 'ancestor') {
        const levels = parseInteger(element.linkValue ?? '1');
        if (levels === undefined || levels < 1 || !ancestorDestination(node, levels, nodes)) {
            errors.push(`${context} ancestor depth ${element.linkValue ?? '1'} does not resolve for node '${node.id}'`);
        }
        return;
    }
    if (target === 'sibling') {
        const offset = parseInteger(element.linkValue ?? '1');
        if (offset === undefined || offset === 0 || !siblingDestination(node, offset, nodes)) {
            errors.push(`${context} sibling offset ${element.linkValue ?? '1'} does not resolve for node '${node.id}'`);
        }
        return;
    }
    if (target === 'referrer' && !referrerDestination(node, nodes)) {
        errors.push(`${context} referrer link does not resolve for node '${node.id}'`);
    }
    if (target === 'child_referrer' && !childReferrerDestination(element, node, nodes)) {
        errors.push(`${context} child referrer link does not resolve for node '${node.id}'`);
    }
};

const validateStructure = (sample: LoadedGallerySample, errors: string[]) => {
    const { nodes, templates, rootId } = sample;
    if (rootId !== 'root') errors.push(`rootId must be 'root', received '${rootId}'`);
    if (!nodes.root) errors.push("root 'root' does not exist");
    else if (nodes.root.parentId !== null) errors.push("root 'root' must have parentId null");

    Object.entries(nodes).forEach(([nodeId, node]) => {
        if (!isRecord(node)) {
            errors.push(`node '${nodeId}' must be an object`);
            return;
        }
        if (node.id !== nodeId) errors.push(`node key '${nodeId}' does not match id '${node.id}'`);
        if (!templates[node.type]) errors.push(`node '${nodeId}' uses unknown template '${node.type}'`);
        if (!Array.isArray(node.children)) {
            errors.push(`node '${nodeId}' children must be an array`);
        } else {
            node.children.forEach((childId: unknown) => {
                if (typeof childId !== 'string' || !nodes[childId]) {
                    errors.push(`node '${nodeId}' child '${String(childId)}' does not exist`);
                } else if (nodes[childId].parentId !== nodeId) {
                    errors.push(`node '${nodeId}' child '${childId}' has parent '${nodes[childId].parentId}'`);
                }
            });
        }
        if (node.parentId !== null) {
            if (typeof node.parentId !== 'string' || !nodes[node.parentId]) {
                errors.push(`node '${nodeId}' parent '${node.parentId}' does not exist`);
            } else if (!Array.isArray(nodes[node.parentId].children) || !nodes[node.parentId].children.includes(nodeId)) {
                errors.push(`node '${nodeId}' is absent from parent '${node.parentId}' children`);
            }
        }
        if (node.referenceId !== undefined) {
            if (typeof node.referenceId !== 'string' || !nodes[node.referenceId]) {
                errors.push(`node '${nodeId}' reference '${node.referenceId}' does not exist`);
            } else if (nodes[node.referenceId].type !== node.type) {
                errors.push(`node '${nodeId}' reference '${node.referenceId}' has type '${nodes[node.referenceId].type}', expected '${node.type}'`);
            }
        }
    });

    const reachable = new Set<string>();
    const pending = nodes.root ? ['root'] : [];
    while (pending.length > 0) {
        const nodeId = pending.shift()!;
        if (reachable.has(nodeId)) continue;
        reachable.add(nodeId);
        const node = nodes[nodeId];
        if (isRecord(node) && Array.isArray(node.children)) {
            node.children.forEach((childId: unknown) => {
                if (typeof childId === 'string' && nodes[childId]) pending.push(childId);
            });
        }
    }
    Object.keys(nodes).forEach(nodeId => {
        if (!reachable.has(nodeId)) errors.push(`node '${nodeId}' is not reachable from root`);
    });

    const visitState = new Map<string, 'visiting' | 'visited'>();
    const reportedCycles = new Set<string>();
    const visit = (nodeId: string, path: string[]) => {
        if (visitState.get(nodeId) === 'visited') return;
        if (visitState.get(nodeId) === 'visiting') {
            const cycleStart = path.indexOf(nodeId);
            const cycle = [...path.slice(cycleStart), nodeId].join(' -> ');
            if (!reportedCycles.has(cycle)) {
                reportedCycles.add(cycle);
                errors.push(`hierarchy cycle detected: ${cycle}`);
            }
            return;
        }
        visitState.set(nodeId, 'visiting');
        const node = nodes[nodeId];
        if (isRecord(node) && Array.isArray(node.children)) {
            node.children.forEach((childId: unknown) => {
                if (typeof childId === 'string' && nodes[childId]) visit(childId, [...path, nodeId]);
            });
        }
        visitState.set(nodeId, 'visited');
    };
    Object.keys(nodes).forEach(nodeId => visit(nodeId, []));
};

const validateDeterministicIds = (sample: LoadedGallerySample, errors: string[]) => {
    try {
        const repeated = executeGallerySample(
            sample.templateSource,
            sample.hierarchySource,
            executionConfigs.get(sample) ?? {},
        );
        const templateIds = Object.keys(sample.templates).sort();
        const repeatedTemplateIds = Object.keys(repeated.templates).sort();
        if (JSON.stringify(templateIds) !== JSON.stringify(repeatedTemplateIds)) {
            errors.push('template IDs are not deterministic across repeated execution');
            return;
        }
        templateIds.forEach(templateId => {
            const elements = Array.isArray(sample.templates[templateId]?.elements)
                ? sample.templates[templateId].elements
                : [];
            const repeatedElements = Array.isArray(repeated.templates[templateId]?.elements)
                ? repeated.templates[templateId].elements
                : [];
            const count = Math.max(elements.length, repeatedElements.length);
            for (let index = 0; index < count; index += 1) {
                if (elements[index]?.id !== repeatedElements[index]?.id) {
                    errors.push(`template '${templateId}' element at index ${index} id is not deterministic across repeated execution`);
                }
            }
        });
    } catch (error) {
        errors.push(`deterministic ID check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const validateTemplates = (sample: LoadedGallerySample, errors: string[]) => {
    const seenElementIds = new Map<string, string>();
    Object.entries(sample.templates).forEach(([templateId, template]) => {
        if (!isRecord(template)) {
            errors.push(`template '${templateId}' must be an object`);
            return;
        }
        if (!isNonEmptyString(templateId)) errors.push('template key must be a non-empty string');
        if (!isNonEmptyString(template.id)) errors.push(`template '${templateId}' id must be a non-empty string`);
        else if (template.id !== templateId) errors.push(`template key '${templateId}' does not match id '${template.id}'`);
        if (template.width !== PAGE_WIDTH || template.height !== PAGE_HEIGHT) {
            errors.push(`template '${templateId}' must be ${PAGE_WIDTH}x${PAGE_HEIGHT}`);
        }
        if (!Array.isArray(template.elements)) {
            errors.push(`template '${templateId}' elements must be an array`);
            return;
        }

        template.elements.forEach((element: any, elementIndex: number) => {
            if (!isNonEmptyString(element?.id)) {
                errors.push(`template '${templateId}' element at index ${elementIndex} id must be a non-empty string`);
            } else {
                const previousTemplate = seenElementIds.get(element.id);
                if (previousTemplate) {
                    errors.push(`element id '${element.id}' is duplicated in templates '${previousTemplate}' and '${templateId}'`);
                } else {
                    seenElementIds.set(element.id, templateId);
                }
            }
            if (element?.type === 'grid') {
                const grid = element.gridConfig;
                if (!isRecord(grid)) {
                    errors.push(`template '${templateId}' element '${element.id}' gridConfig is missing`);
                } else {
                    if (grid.gridBorderMode === undefined) errors.push(`${element.id} gridBorderMode must be explicit`);
                    else if (!GRID_MODES.has(grid.gridBorderMode)) errors.push(`${element.id} gridBorderMode '${grid.gridBorderMode}' is invalid`);
                    if (grid.gridBorderStyle === undefined) errors.push(`${element.id} gridBorderStyle must be explicit`);
                    else if (!GRID_STYLES.has(grid.gridBorderStyle)) errors.push(`${element.id} gridBorderStyle '${grid.gridBorderStyle}' is invalid`);
                    if (typeof grid.gridBorderColor !== 'string' || grid.gridBorderColor.length === 0) {
                        errors.push(`${element.id} gridBorderColor must be explicit`);
                    }
                    if (typeof grid.gridBorderWidth !== 'number' || !Number.isFinite(grid.gridBorderWidth) || grid.gridBorderWidth < 0) {
                        errors.push(`${element.id} gridBorderWidth must be a non-negative number`);
                    }
                    if (grid.sourceType === 'specific' && (typeof grid.sourceId !== 'string' || !sample.nodes[grid.sourceId])) {
                        errors.push(`${element.id} grid source '${grid.sourceId ?? ''}' does not exist`);
                    }
                }
            }

            renderedNodes(sample, templateId).forEach(node => {
                validateElementLink(element, templateId, node, sample.nodes, errors);
                try {
                    const bounds = getElementBounds(element, sample.nodes, node.id);
                    if (![element.x, element.y, bounds.w, bounds.h].every(Number.isFinite)) {
                        errors.push(`template '${templateId}' element '${element.id}' has non-finite bounds for node '${node.id}'`);
                    } else {
                        if (bounds.w <= 0 || bounds.h <= 0) errors.push(`template '${templateId}' element '${element.id}' has non-positive bounds for node '${node.id}'`);
                        if (element.x < 0) errors.push(`template '${templateId}' element '${element.id}' starts before x=0 for node '${node.id}'`);
                        if (element.y < 0) errors.push(`template '${templateId}' element '${element.id}' starts before y=0 for node '${node.id}'`);
                        if (element.x + bounds.w > PAGE_WIDTH) errors.push(`template '${templateId}' element '${element.id}' overflows width for node '${node.id}'`);
                        if (element.y + bounds.h > PAGE_HEIGHT) errors.push(`template '${templateId}' element '${element.id}' overflows height for node '${node.id}'`);
                    }
                } catch (error) {
                    errors.push(`template '${templateId}' element '${element.id}' bounds failed for node '${node.id}': ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        });
    });
};

const validateExampleChrome = (sample: LoadedGallerySample, errors: string[]) => {
    const example = sample.nodes.example_workspace;
    if (!isRecord(example)) {
        errors.push("example workspace 'example_workspace' does not exist");
        return;
    }
    if (!sample.nodes.blank_workspace) errors.push("blank workspace 'blank_workspace' does not exist");

    const pending = ['example_workspace'];
    const visited = new Set<string>();
    while (pending.length > 0) {
        const nodeId = pending.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        const node = sample.nodes[nodeId];
        if (!isRecord(node)) continue;
        if (node.data?.example_label !== 'EXAMPLE') errors.push(`node '${nodeId}' data.example_label must be 'EXAMPLE'`);
        if (node.data?.skip_label !== 'Skip to blank workspace →') {
            errors.push(`node '${nodeId}' data.skip_label must be 'Skip to blank workspace →'`);
        }
        const template = sample.templates[node.type];
        const elements = Array.isArray(template?.elements) ? template.elements : [];
        const exampleElements = elements.filter((element: any) => hasTextBinding(element, 'example_label'));
        if (exampleElements.length === 0) {
            errors.push(`node '${nodeId}' template '${node.type}' does not bind example_label`);
        } else if (!exampleElements.some((element: any) => isVisibleTextBinding(element, 'example_label', template))) {
            errors.push(`node '${nodeId}' template '${node.type}' does not have a visible text binding for example_label`);
        }
        const boundSkipElements = elements.filter((element: any) => hasTextBinding(element, 'skip_label'));
        const skipElements = boundSkipElements.filter((element: any) => isVisibleTextBinding(element, 'skip_label', template));
        if (boundSkipElements.length === 0) errors.push(`node '${nodeId}' template '${node.type}' does not bind skip_label`);
        else if (skipElements.length === 0) {
            errors.push(`node '${nodeId}' template '${node.type}' does not have a visible text binding for skip_label`);
        }
        if (skipElements.length > 0 && !skipElements.some((element: any) => element.linkTarget === 'specific_node' && element.linkValue === 'blank_workspace')) {
            errors.push(`node '${nodeId}' template '${node.type}' skip element must link to 'blank_workspace'`);
        }
        if (Array.isArray(node.children)) pending.push(...node.children);
    }
};

export function validateSharedGalleryInvariants(sample: LoadedGallerySample): string[] {
    const errors: string[] = [];
    const templatesValid = isRecord(sample?.templates);
    const nodesValid = isRecord(sample?.nodes);
    if (!templatesValid) errors.push('templates must be an object');
    if (!nodesValid) errors.push('nodes must be an object');
    if (!isNonEmptyString(sample?.rootId)) errors.push('rootId must be a non-empty string');
    if (typeof sample?.templateSource !== 'string') errors.push('templateSource must be a string');
    if (typeof sample?.hierarchySource !== 'string') errors.push('hierarchySource must be a string');
    if (templatesValid && nodesValid) {
        validateStructure(sample, errors);
        validateTemplates(sample, errors);
        validateExampleChrome(sample, errors);
        if (typeof sample.templateSource === 'string' && typeof sample.hierarchySource === 'string') {
            validateDeterministicIds(sample, errors);
        }
    }
    return errors;
}

export function validateGallerySample(sample: LoadedGallerySample, contract: GallerySampleContract): string[] {
    const errors = validateSharedGalleryInvariants(sample);
    if (sample?.slug !== contract.slug) errors.push(`sample slug '${sample?.slug}' does not match contract slug '${contract.slug}'`);

    const templates = isRecord(sample?.templates) ? sample.templates : {};
    const nodes = isRecord(sample?.nodes) ? sample.nodes : {};
    const expectedTemplates = new Set(contract.expectedTemplateIds);
    contract.expectedTemplateIds.forEach(templateId => {
        if (!templates[templateId]) errors.push(`expected template '${templateId}' is missing`);
    });
    Object.keys(templates).forEach(templateId => {
        if (!expectedTemplates.has(templateId)) errors.push(`unexpected template '${templateId}' is present`);
    });

    let pageCount: number | undefined;
    try {
        pageCount = computePageOrder({ rootId: sample?.rootId, nodes } as any).length;
    } catch (error) {
        errors.push(`page count could not be computed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (pageCount !== undefined && (pageCount < contract.pageCount[0] || pageCount > contract.pageCount[1])) {
        errors.push(`page count ${pageCount} is outside ${contract.pageCount[0]}-${contract.pageCount[1]}`);
    }
    contract.palette.forEach(color => {
        if (typeof sample?.templateSource !== 'string' || !sample.templateSource.includes(color)) {
            errors.push(`palette color '${color}' does not occur in template source`);
        }
    });
    contract.requiredStableNodeIds.forEach(nodeId => {
        if (!nodes[nodeId]) errors.push(`required stable node '${nodeId}' is missing`);
    });
    return errors;
}

export function expectValidGallerySample(
    slug: string,
    contract: GallerySampleContract,
    config: Record<string, unknown> = {},
): LoadedGallerySample {
    const sample = loadGallerySample(slug, config);
    const errors = validateGallerySample(sample, contract);
    if (errors.length > 0) throw new Error(`Gallery sample '${slug}' failed validation:\n${errors.join('\n')}`);
    return sample;
}
