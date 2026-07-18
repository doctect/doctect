import type { PageTemplate, TemplateElement, TextOverflow } from '../types';

export const TEXT_OVERFLOW_VALUES = ['clip', 'ellipsis', 'shrink', 'visible'] as const;
const TEXT_DEFAULTS = { textOverflow: 'clip', textWrap: true } as const;
const GRID_DEFAULTS = { textOverflow: 'clip', textWrap: false } as const;

const isTextOverflow = (value: unknown): value is TextOverflow =>
  typeof value === 'string' && (TEXT_OVERFLOW_VALUES as readonly string[]).includes(value);

export function resolveTextOverflowSettings(
  element: Pick<TemplateElement, 'type' | 'textOverflow' | 'textWrap'>,
) {
  if (element.type !== 'text' && element.type !== 'grid') return null;
  const defaults = element.type === 'grid' ? GRID_DEFAULTS : TEXT_DEFAULTS;
  return {
    textOverflow: isTextOverflow(element.textOverflow) ? element.textOverflow : defaults.textOverflow,
    textWrap: typeof element.textWrap === 'boolean' ? element.textWrap : defaults.textWrap,
  };
}

export function normalizeTextOverflowElement<T extends Record<string, any>>(element: T): T {
  const settings = resolveTextOverflowSettings(
    element as unknown as Pick<TemplateElement, 'type' | 'textOverflow' | 'textWrap'>,
  );
  return settings ? { ...element, ...settings } : element;
}

export function normalizeTextOverflowTemplate<T extends PageTemplate>(template: T): T {
  return {
    ...template,
    elements: template.elements.map(element => normalizeTextOverflowElement(element)),
  };
}

export function normalizeTextOverflowTemplates<T extends Record<string, PageTemplate>>(templates: T): T {
  return Object.fromEntries(
    Object.entries(templates).map(([id, template]) => [id, normalizeTextOverflowTemplate(template)]),
  ) as T;
}

export function normalizeTextOverflow<T extends Record<string, any>>(state: T): T {
  const normalized: Record<string, any> = structuredClone(state);

  if (normalized.variants && typeof normalized.variants === 'object') {
    Object.values(normalized.variants).forEach((variant: any) => {
      if (variant?.templates && typeof variant.templates === 'object') {
        variant.templates = normalizeTextOverflowTemplates(variant.templates);
      }
    });
  }
  if (normalized.templates && typeof normalized.templates === 'object') {
    normalized.templates = normalizeTextOverflowTemplates(normalized.templates);
  }

  return normalized as T;
}
