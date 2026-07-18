import { PageTemplate, Variant } from '../types';
import { ensureTemplateLayers } from './layers';
import { normalizeTextOverflowTemplate } from './textOverflow';

// Auto-generates element ids missing from a hand-written generator template without mutating
// sandbox output (matches the generator's existing tolerance for omitted per-element ids).
function autoIdElements(tpl: any): PageTemplate {
    if (!Array.isArray(tpl.elements)) return { ...tpl } as PageTemplate;
    return {
        ...tpl,
        elements: tpl.elements.map((el: any, idx: number) => el?.id
            ? { ...el }
            : { ...el, id: `gen_${tpl.id}_${idx}_${Math.random().toString(36).substr(2, 5)}` }),
        layers: Array.isArray(tpl.layers) ? tpl.layers.map((layer: any) => ({ ...layer })) : tpl.layers,
    } as PageTemplate;
}

function normalizeFlatTemplates(raw: Record<string, any>): Record<string, PageTemplate> {
    const normalized: Record<string, PageTemplate> = Object.create(null);
    Object.values(raw || {}).forEach((tpl: any) => {
        if (!tpl || !tpl.id) return;
        normalized[tpl.id] = normalizeTextOverflowTemplate(ensureTemplateLayers(autoIdElements(tpl)));
    });
    return normalized;
}

export interface NormalizedGeneratedTemplates {
    templates?: Record<string, PageTemplate>;
    variants?: Record<string, Variant>;
    activeVariantId?: string;
}

// The Templates script (run by the Hierarchy Generator) can return either a flat
// { templateId: template } map, or the documented multi-device { variants, activeVariantId }
// shape (see the generator's own LLM prompt / schema docs). Both are normalized here so the
// caller doesn't need to special-case which one it got.
export function normalizeGeneratedTemplates(raw: any): NormalizedGeneratedTemplates {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)
        && Object.hasOwn(raw, 'variants') && raw.variants && typeof raw.variants === 'object' && !Array.isArray(raw.variants)) {
        const variants: Record<string, Variant> = Object.create(null);
        Object.entries(raw.variants).forEach(([key, v]: [string, any]) => {
            variants[key] = {
                id: (v && v.id) || key,
                name: (v && v.name) || key,
                templates: normalizeFlatTemplates(v && v.templates)
            };
        });
        const activeVariantId = typeof raw.activeVariantId === 'string' && Object.hasOwn(variants, raw.activeVariantId)
            ? raw.activeVariantId
            : Object.keys(variants)[0];
        return { variants, activeVariantId };
    }
    return { templates: normalizeFlatTemplates(raw) };
}
