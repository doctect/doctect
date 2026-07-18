import { describe, expect, it } from 'vitest';
import {
  normalizeProjectTextPadding,
  normalizeTextPaddingElement,
  normalizeTextPaddingValue,
  resolveTextContentBox,
  resolveTextPadding,
} from '../../services/textPadding';

const zero = { top: 0, right: 0, bottom: 0, left: 0 };

describe('text padding normalization', () => {
  it('preserves finite nonnegative decimals and repairs each invalid side independently', () => {
    expect(normalizeTextPaddingValue({ top: 1.25, right: -2, bottom: Infinity, left: '3' }))
      .toEqual({ top: 1.25, right: 0, bottom: 0, left: 0 });
    expect(normalizeTextPaddingValue(null)).toEqual(zero);
    expect(normalizeTextPaddingValue({})).toEqual(zero);
  });

  it('returns fresh values and never mutates source objects', () => {
    const source = { top: 1, right: 2, bottom: 3, left: 4 };
    const normalized = normalizeTextPaddingValue(source);
    expect(normalized).toEqual(source);
    expect(normalized).not.toBe(source);
    expect(source).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
  });

  it('normalizes text elements only', () => {
    const text = { id: 'text', type: 'text', textPadding: { top: 2, right: -1 } };
    const rect = { id: 'rect', type: 'rect', textPadding: { top: -1 } };
    expect(normalizeTextPaddingElement(text)).toEqual({
      ...text,
      textPadding: { top: 2, right: 0, bottom: 0, left: 0 },
    });
    expect(normalizeTextPaddingElement(rect)).toBe(rect);
  });

  it('normalizes variants and legacy flat templates without mutating input', () => {
    const state = {
      variants: { v: { templates: { page: { elements: [{ type: 'text' }] } } } },
      templates: { legacy: { elements: [{ type: 'text', textPadding: { left: 2.5 } }] } },
    };
    const before = structuredClone(state);
    const output: any = normalizeProjectTextPadding(state);
    expect(output.variants.v.templates.page.elements[0].textPadding).toEqual(zero);
    expect(output.templates.legacy.elements[0].textPadding).toEqual({ ...zero, left: 2.5 });
    expect(state).toEqual(before);
    expect(output).not.toBe(state);
  });
});

describe('text content box', () => {
  it('uses asymmetric decimal padding without changing outer dimensions', () => {
    const element = { w: 100.5, h: 40.5, textPadding: { top: 1.5, right: 2.5, bottom: 3.5, left: 4.5 } };
    expect(resolveTextPadding(element)).toEqual(element.textPadding);
    expect(resolveTextContentBox(element)).toEqual({
      padding: element.textPadding,
      x: 4.5,
      y: 1.5,
      width: 93.5,
      height: 35.5,
    });
    expect(element).toMatchObject({ w: 100.5, h: 40.5 });
  });

  it('clamps exhausted axes to zero while retaining padded origin', () => {
    expect(resolveTextContentBox({
      w: 20,
      h: 10,
      textPadding: { top: 12, right: 8, bottom: 4, left: 30 },
    })).toEqual({
      padding: { top: 12, right: 8, bottom: 4, left: 30 },
      x: 30,
      y: 12,
      width: 0,
      height: 0,
    });
  });
});
