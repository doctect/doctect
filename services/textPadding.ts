import type { PageTemplate, TemplateElement, TextPadding } from '../types';

export const TEXT_PADDING_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type TextPaddingSide = typeof TEXT_PADDING_SIDES[number];

export const ZERO_TEXT_PADDING: Readonly<TextPadding> = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export interface TextContentBox {
  padding: TextPadding;
  x: number;
  y: number;
  width: number;
  height: number;
}

const normalizeSide = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
);

export function normalizeTextPaddingValue(value: unknown): TextPadding {
  const candidate = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    top: normalizeSide(candidate.top),
    right: normalizeSide(candidate.right),
    bottom: normalizeSide(candidate.bottom),
    left: normalizeSide(candidate.left),
  };
}

export function resolveTextPadding(
  element: Pick<TemplateElement, 'textPadding'>,
): TextPadding {
  return normalizeTextPaddingValue(element.textPadding);
}

export function resolveTextContentBox(
  element: Pick<TemplateElement, 'w' | 'h' | 'textPadding'>,
): TextContentBox {
  const padding = resolveTextPadding(element);
  return {
    padding,
    x: padding.left,
    y: padding.top,
    width: Math.max(0, element.w - padding.left - padding.right),
    height: Math.max(0, element.h - padding.top - padding.bottom),
  };
}

export function normalizeTextPaddingElement<T extends Record<string, any>>(element: T): T {
  if (element.type !== 'text') return element;
  return { ...element, textPadding: normalizeTextPaddingValue(element.textPadding) };
}

export function normalizeTextPaddingTemplate<T extends PageTemplate>(template: T): T {
  return {
    ...template,
    elements: template.elements.map(element => normalizeTextPaddingElement(element)),
  };
}

export function normalizeTextPaddingTemplates<T extends Record<string, PageTemplate>>(templates: T): T {
  return Object.fromEntries(
    Object.entries(templates).map(([id, template]) => [id, normalizeTextPaddingTemplate(template)]),
  ) as T;
}

export function normalizeProjectTextPadding<T extends Record<string, any>>(state: T): T {
  const normalized: Record<string, any> = structuredClone(state);
  if (normalized.variants && typeof normalized.variants === 'object') {
    Object.values(normalized.variants).forEach((variant: any) => {
      if (variant?.templates && typeof variant.templates === 'object') {
        variant.templates = normalizeTextPaddingTemplates(variant.templates);
      }
    });
  }
  if (normalized.templates && typeof normalized.templates === 'object') {
    normalized.templates = normalizeTextPaddingTemplates(normalized.templates);
  }
  return normalized as T;
}
