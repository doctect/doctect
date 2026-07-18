import { expect, it } from 'vitest';
import { createBlankProject } from '../../services/presets';
import { createGeneratedAppState } from '../../services/generatedProjectState';

it('builds a fresh generated app state without mutating base or generated project', () => {
  const base = createBlankProject();
  base.scale = 3;
  const generated = {
    schemaVersion: 11 as const,
    rootId: 'generated-root',
    activeVariantId: 'v1',
    nodes: { 'generated-root': { id: 'generated-root', parentId: null, type: 'page', title: 'Generated', data: {}, children: [] } },
    variants: { v1: { id: 'v1', name: 'Variant', templates: { page: { id: 'page', name: 'Page', width: 100, height: 200, layers: [], elements: [] } } } },
  };
  const source = { formatVersion: 1 as const, templateScript: ' return templates; ', hierarchyScript: ' return hierarchy; ' };
  const beforeBase = structuredClone(base);
  const beforeGenerated = structuredClone(generated);

  const state = createGeneratedAppState(base, generated, source, '2026-07-14T12:00:00.000Z');

  expect(state).toMatchObject({
    rootId: 'generated-root', activeVariantId: 'v1', schemaVersion: 11,
    selectedNodeId: 'generated-root', selectedNodeIds: ['generated-root'],
    selectedTemplateId: '', selectedTemplateIds: [], selectedElementIds: [],
    generator: { ...source, generatedAt: '2026-07-14T12:00:00.000Z' },
  });
  expect(state.scale).toBe(createBlankProject().scale);
  expect(base).toEqual(beforeBase);
  expect(generated).toEqual(beforeGenerated);
});
