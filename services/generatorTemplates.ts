import { PageTemplate, Variant } from '../types';
import { ensureTemplateLayers } from './layers';

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
    const normalized: Record<string, PageTemplate> = {};
    Object.values(raw || {}).forEach((tpl: any) => {
        if (!tpl || !tpl.id) return;
        normalized[tpl.id] = ensureTemplateLayers(autoIdElements(tpl));
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
    if (raw && typeof raw === 'object' && raw.variants && typeof raw.variants === 'object') {
        const variants: Record<string, Variant> = {};
        Object.entries(raw.variants).forEach(([key, v]: [string, any]) => {
            variants[key] = {
                id: (v && v.id) || key,
                name: (v && v.name) || key,
                templates: normalizeFlatTemplates(v && v.templates)
            };
        });
        const activeVariantId = raw.activeVariantId && variants[raw.activeVariantId]
            ? raw.activeVariantId
            : Object.keys(variants)[0];
        return { variants, activeVariantId };
    }
    return { templates: normalizeFlatTemplates(raw) };
}
