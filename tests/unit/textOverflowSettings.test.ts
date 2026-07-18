import { describe, expect, it } from 'vitest';
import {
  normalizeTextOverflow,
  normalizeTextOverflowElement,
  resolveTextOverflowSettings,
} from '../../services/textOverflow';

describe('text overflow settings', () => {
  it.each([
    ['text', { textOverflow: 'clip', textWrap: true }],
    ['grid', { textOverflow: 'clip', textWrap: false }],
  ] as const)('resolves new %s defaults', (type, expected) => {
    expect(resolveTextOverflowSettings({ type })).toEqual(expected);
  });

  it.each([null, 'CLIP', 'unknown', 1, false])('rejects malformed overflow %j', value => {
    expect(normalizeTextOverflowElement({ type: 'text', textOverflow: value, textWrap: 'true' }))
      .toEqual({ type: 'text', textOverflow: 'clip', textWrap: true });
  });

  it.each(['true', 1])('rejects malformed grid wrap %j', value => {
    expect(normalizeTextOverflowElement({ type: 'grid', textWrap: value }))
      .toEqual({ type: 'grid', textOverflow: 'clip', textWrap: false });
  });

  it.each([
    ['text', true],
    ['text', false],
    ['grid', true],
    ['grid', false],
  ] as const)('preserves valid %s wrap %s', (type, textWrap) => {
    expect(normalizeTextOverflowElement({ type, textWrap }))
      .toEqual({ type, textOverflow: 'clip', textWrap });
  });

  it('preserves valid values and leaves non-applicable elements field-for-field unchanged', () => {
    const rect = { type: 'rect', textOverflow: 'future', textWrap: 'false', custom: null };
    expect(normalizeTextOverflowElement({ type: 'grid', textOverflow: 'visible', textWrap: true }))
      .toEqual({ type: 'grid', textOverflow: 'visible', textWrap: true });
    expect(normalizeTextOverflowElement(rect)).toEqual(rect);
  });

  it('normalizes every variant and legacy flat templates into an independent idempotent clone', () => {
    const raw: any = {
      schemaVersion: 10,
      variants: { a: { templates: { page: { elements: [{ type: 'text' }, { type: 'grid' }] } } } },
      templates: { legacy: { elements: [{ type: 'text', autoWidth: true }] } },
    };
    const once = normalizeTextOverflow(raw);
    expect(once).not.toBe(raw);
    expect(once.variants.a.templates.page.elements).toMatchObject([
      { textOverflow: 'clip', textWrap: true },
      { textOverflow: 'clip', textWrap: false },
    ]);
    expect(once.templates.legacy.elements[0]).toMatchObject({ textOverflow: 'clip', textWrap: true });
    expect(normalizeTextOverflow(once)).toEqual(once);
    expect(raw.variants.a.templates.page.elements[0].textOverflow).toBeUndefined();
  });
});
