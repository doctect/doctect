import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppState, TemplateElement } from '../../types';
import { createGeneratedAppState } from '../../services/generatedProjectState';
import { segmentGraphemes } from '../../services/graphemes';
import { loadProjectState } from '../../services/loadProjectState';
import { createBlankProject, loadPreset } from '../../services/presets';
import { snapshotDocument } from '../../services/projectDocumentSnapshot';
import { validateGeneratedProject } from '../../services/validateGeneratedProject';
import { MAX_STATE_BYTES } from '../../shared/projectLimits.js';
import { decodeStateRow, encodeState } from '../../server/stateCodec.js';
import { textOverflowFixtureMetric, textOverflowFixtureRequests } from '../helpers/textOverflowParityFixture';

const fixture = JSON.parse(readFileSync(
  resolve('tests/fixtures/text-overflow-parity-v10.json'),
  'utf8',
)) as AppState;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const allTemplates = (state: any) => Object.values(state.variants as Record<string, any>)
  .flatMap((variant: any) => Object.values(variant.templates as Record<string, any>));

const allElements = (state: any): TemplateElement[] => allTemplates(state)
  .flatMap((template: any) => template.elements);

const allApplicableSettings = (state: any) => allElements(state)
  .filter((element: any) => element.type === 'text' || element.type === 'grid')
  .map((element: any) => ({
    id: element.id,
    textOverflow: element.textOverflow,
    textWrap: element.textWrap,
  }));

const element = (state: any, id: string): any => {
  const found = allElements(state).find(candidate => candidate.id === id);
  if (!found) throw new Error(`Missing fixture element ${id}`);
  return found;
};

const expectCanonicalTextPadding = (state: any) => {
  allElements(state).filter(item => item.type === 'text').forEach(item => {
    expect(item).toMatchObject({ textPadding: { top: 0, right: 0, bottom: 0, left: 0 } });
  });
};

const nearestWrapBoundaryDistance = (request: ReturnType<typeof textOverflowFixtureRequests>[number]['request']): number => {
  const widths = request.text.replace(/\r\n?/g, '\n').split('\n').flatMap(line => {
    const graphemes = segmentGraphemes(line);
    return graphemes.map((_, index) => (
      textOverflowFixtureMetric(graphemes.slice(0, index + 1).join(''), request.fontSize)
    ));
  });
  return Math.min(...widths.map(width => Math.abs(request.contentWidth - width)));
};

describe('text overflow v10 persistence fixture', () => {
  it('is a complete canonical, bounded parity matrix with stable document structure', () => {
    const template = fixture.variants.parity.templates['parity-page'];
    const fixedText = template.elements.filter(item => item.type === 'text' && !item.autoWidth);
    const grids = template.elements.filter(item => item.type === 'grid');

    expect(fixture.schemaVersion).toBe(10);
    expect(new TextEncoder().encode(JSON.stringify(fixture)).byteLength).toBeLessThan(MAX_STATE_BYTES);
    expect([template.width, template.height]).toEqual([595.28, 841.89]);
    expect(template.layers).toEqual([
      { id: 'parity-layer', name: 'Parity Content', order: 0, visible: true, locked: false },
    ]);
    expect(Object.keys(fixture.nodes)).toEqual(['parity-root', 'grid-child-short', 'grid-child-long']);
    expect(fixture.nodes['parity-root'].children).toEqual(['grid-child-short', 'grid-child-long']);
    expect(fixedText.map(item => `${item.textOverflow}:${item.textWrap}`).sort()).toEqual([
      'clip:false', 'clip:true', 'ellipsis:false', 'ellipsis:true',
      'shrink:false', 'shrink:true', 'visible:false', 'visible:true',
    ]);
    expect(grids.map(item => item.textOverflow).sort()).toEqual(['clip', 'ellipsis', 'shrink', 'visible']);
    for (const setting of allApplicableSettings(fixture)) {
      expect(['clip', 'ellipsis', 'shrink', 'visible']).toContain(setting.textOverflow);
      expect(typeof setting.textWrap).toBe('boolean');
    }
    for (const { context, request } of textOverflowFixtureRequests(fixture).filter(item => item.request.textWrap)) {
      expect(nearestWrapBoundaryDistance(request), context).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(fixedText.map(item => item.align))).toEqual(new Set(['left', 'center', 'right']));
    expect(new Set(fixedText.map(item => item.verticalAlign))).toEqual(new Set(['top', 'middle', 'bottom']));
    expect(fixedText.some(item => item.text?.includes('\n\n') && item.text.endsWith('\n'))).toBe(true);
    expect(fixedText.some(item => item.text?.includes('\u{1f469}\u200d\u{1f4bb}'))).toBe(true);
    expect(fixedText.some(item => item.fontWeight === 'bold')).toBe(true);
    expect(fixedText.some(item => item.fontStyle === 'italic')).toBe(true);
    expect(fixedText.some(item => item.textDecoration === 'underline')).toBe(true);
    expect(element(fixture, 'text-clip-nowrap')).toMatchObject({ text: 'FIT', w: 18, fontSize: 12 });
    expect(element(fixture, 'text-visible-wrap-rotated').rotation).toBe(17);
    expect(element(fixture, 'text-auto-width-dormant')).toMatchObject({
      type: 'text', autoWidth: true, textOverflow: 'shrink', textWrap: false,
    });
    expect(element(fixture, 'rect-caption-out-of-scope')).toMatchObject({
      type: 'rect', textOverflow: 'future-mode', textWrap: 'true',
    });
  });

  it('preserves exact applicable settings through JSON, snapshots, current load, and cloud gzip', () => {
    const expected = allApplicableSettings(fixture);
    const jsonRoundTrip = JSON.parse(JSON.stringify(fixture));
    const snapshot = snapshotDocument(fixture);
    const loaded = loadProjectState(jsonRoundTrip).state;
    const encoded = encodeState(fixture);
    const decoded = decodeStateRow({ state_gzip: encoded.gzip, state_json: '' });

    expect(allApplicableSettings(jsonRoundTrip)).toEqual(expected);
    expect(allApplicableSettings(snapshot)).toEqual(expected);
    expect(allApplicableSettings(loaded)).toEqual(expected);
    expect(allApplicableSettings(decoded)).toEqual(expected);
    expect(loaded.schemaVersion).toBe(11);
    expectCanonicalTextPadding(loaded);
    expect(snapshot.variants).not.toBe(fixture.variants);
    expect(loaded.variants).not.toBe(jsonRoundTrip.variants);
    expect(decoded.variants).not.toBe(fixture.variants);
  });

  it('recovers missing and malformed current JSON while leaving valid and shape fields unchanged', () => {
    const current = clone(fixture) as any;
    delete element(current, 'text-clip-nowrap').textOverflow;
    element(current, 'text-ellipsis-nowrap').textWrap = 'false';
    element(current, 'grid-clip').textOverflow = 'truncate';
    element(current, 'grid-ellipsis').textWrap = null;
    element(current, 'text-visible-wrap-rotated').textOverflow = 'visible';
    const input = clone(current);

    const loaded = loadProjectState(JSON.parse(JSON.stringify(current))).state;

    expect(loaded.schemaVersion).toBe(11);
    expect(element(loaded, 'text-clip-nowrap')).toMatchObject({
      textOverflow: 'clip', textWrap: false,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(loaded, 'text-ellipsis-nowrap')).toMatchObject({
      textOverflow: 'ellipsis', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(loaded, 'grid-clip')).toMatchObject({ textOverflow: 'clip', textWrap: false });
    expect(element(loaded, 'grid-ellipsis')).toMatchObject({ textOverflow: 'ellipsis', textWrap: false });
    expect(element(loaded, 'text-visible-wrap-rotated')).toMatchObject({
      textOverflow: 'visible', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(loaded, 'rect-caption-out-of-scope')).toMatchObject({ textOverflow: 'future-mode', textWrap: 'true' });
    expect(current).toEqual(input);
  });

  it('maps imported v9 text and grids to legacy rendering values without changing shape captions', () => {
    const legacy = clone(fixture) as any;
    legacy.schemaVersion = 9;
    for (const item of allElements(legacy)) {
      if (item.type === 'text' || item.type === 'grid') {
        item.textOverflow = 'shrink';
        item.textWrap = false;
      }
    }

    const loaded = loadProjectState(legacy).state;

    expect(loaded.schemaVersion).toBe(11);
    allElements(loaded).filter(item => item.type === 'text').forEach(item => {
      expect(item).toMatchObject({
        textOverflow: 'visible', textWrap: true,
        textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    });
    allElements(loaded).filter(item => item.type === 'grid').forEach(item => {
      expect(item).toMatchObject({ textOverflow: 'ellipsis', textWrap: false });
    });
    expect(element(loaded, 'rect-caption-out-of-scope')).toMatchObject({
      textOverflow: 'future-mode', textWrap: 'true',
    });
  });

  it('normalizes generated output as new content before creating an independent v11 app state', () => {
    const template = clone(fixture.variants.parity.templates['parity-page']) as any;
    const missingText = clone(element(fixture, 'text-clip-nowrap'));
    delete missingText.textOverflow;
    delete missingText.textWrap;
    template.elements = [
      missingText,
      { ...element(fixture, 'text-ellipsis-nowrap'), textOverflow: 'visible', textWrap: false },
      { ...element(fixture, 'grid-clip'), textOverflow: 'truncate', textWrap: 'true' },
      clone(element(fixture, 'rect-caption-out-of-scope')),
    ];
    const raw = {
      templates: { 'parity-page': template },
      hierarchy: { nodes: clone(fixture.nodes), rootId: fixture.rootId },
    };
    const before = clone(raw);

    const validation = validateGeneratedProject(raw);

    expect(validation.ok).toBe(true);
    if (validation.ok === false) throw new Error(validation.message);
    expect(validation.project.schemaVersion).toBe(11);
    expect(element(validation.project, 'text-clip-nowrap')).toMatchObject({
      textOverflow: 'clip', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(validation.project, 'text-ellipsis-nowrap')).toMatchObject({
      textOverflow: 'visible', textWrap: false,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(validation.project, 'grid-clip')).toMatchObject({ textOverflow: 'clip', textWrap: false });
    expect(element(validation.project, 'rect-caption-out-of-scope')).toMatchObject({ textOverflow: 'future-mode', textWrap: 'true' });
    expectCanonicalTextPadding(validation.project);

    const generated = createGeneratedAppState(
      createBlankProject(),
      validation.project,
      { formatVersion: 1, templateScript: 'return templates;', hierarchyScript: 'return hierarchy;' },
      '2026-07-18T12:00:00.000Z',
    );
    expect(generated.schemaVersion).toBe(11);
    expectCanonicalTextPadding(generated);
    expect(allApplicableSettings(generated)).toEqual(allApplicableSettings(validation.project));
    expect(generated.variants).not.toBe(validation.project.variants);
    element(generated, 'text-clip-nowrap').textOverflow = 'visible';
    expect(element(validation.project, 'text-clip-nowrap').textOverflow).toBe('clip');
    expect(raw).toEqual(before);
  });

  it('uses new defaults for undeclared presets and preserves valid custom v10 settings', () => {
    const newTemplate = clone(fixture.variants.parity.templates['parity-page']) as any;
    const missingPresetText = clone(element(fixture, 'text-clip-nowrap'));
    delete missingPresetText.textOverflow;
    delete missingPresetText.textWrap;
    newTemplate.elements = [
      missingPresetText,
      { ...element(fixture, 'grid-clip'), textOverflow: null, textWrap: 'false' },
      clone(element(fixture, 'rect-caption-out-of-scope')),
    ];
    const undeclared = {
      nodes: clone(fixture.nodes),
      rootId: fixture.rootId,
      templates: { 'parity-page': newTemplate },
    };
    const undeclaredBefore = clone(undeclared);

    const preset = loadPreset(undeclared);

    expect(preset.schemaVersion).toBe(11);
    expect(element(preset, 'text-clip-nowrap')).toMatchObject({
      textOverflow: 'clip', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(preset, 'grid-clip')).toMatchObject({ textOverflow: 'clip', textWrap: false });
    expect(element(preset, 'rect-caption-out-of-scope')).toMatchObject({ textOverflow: 'future-mode', textWrap: 'true' });
    expectCanonicalTextPadding(preset);
    expect(undeclared).toEqual(undeclaredBefore);

    const custom = clone(fixture) as any;
    custom.schemaVersion = 10;
    element(custom, 'text-clip-nowrap').textOverflow = 'ellipsis';
    element(custom, 'text-clip-nowrap').textWrap = false;
    element(custom, 'grid-clip').textOverflow = 'visible';
    element(custom, 'grid-clip').textWrap = true;
    const loadedCustom = loadProjectState(custom).state;
    expect(loadedCustom.schemaVersion).toBe(11);
    expect(element(loadedCustom, 'text-clip-nowrap')).toMatchObject({
      textOverflow: 'ellipsis', textWrap: false,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(element(loadedCustom, 'grid-clip')).toMatchObject({ textOverflow: 'visible', textWrap: true });
    expectCanonicalTextPadding(loadedCustom);
  });
});
