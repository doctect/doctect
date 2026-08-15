import { describe, expect, it } from 'vitest';
import * as presets from '../../services/presets';
import {
  createBlankProject,
  createNotebookProject,
  createPlannerProject,
  loadPreset,
} from '../../services/presets';

const nodes = { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } };
const layers = [{ id: 'content', name: 'Content', order: 0, visible: true, locked: false }];
const elements = () => [
  { id: 'text', type: 'text', layerId: 'content' },
  { id: 'grid', type: 'grid', layerId: 'content' },
  { id: 'rect', type: 'rect', textOverflow: 'future', textWrap: 1, layerId: 'content' },
];
const page = () => ({ id: 'page', name: 'Page', width: 500, height: 700, layers, elements: elements() });
const variants = () => ({ default: { id: 'default', name: 'Default', templates: { page: page() } } });

describe('schema v11 presets', () => {
  it('exposes only pure preset loading, factories, and presentation contracts', () => {
    expect(presets).not.toHaveProperty('saveCustomPreset');
    expect(presets).not.toHaveProperty('deleteCustomPreset');
    expect(presets).not.toHaveProperty('getCustomPresets');
  });

  it.each([
    ['blank', createBlankProject],
    ['notebook', createNotebookProject],
    ['planner', createPlannerProject],
  ])('%s project is v11 without generator metadata', (_name, createProject) => {
    const state = createProject();

    expect(state.schemaVersion).toBe(11);
    expect(state.generator).toBeUndefined();
  });

  it.each([
    ['notebook', createNotebookProject],
    ['planner', createPlannerProject],
  ])('%s built-in uses new text and grid defaults', (_name, createProject) => {
    const state = createProject();
    const presetElements = Object.values(state.variants)
      .flatMap(variant => Object.values(variant.templates))
      .flatMap(template => template.elements);
    const textElements = presetElements.filter(element => element.type === 'text');
    const gridElements = presetElements.filter(element => element.type === 'grid');

    expect(textElements.length).toBeGreaterThan(0);
    expect(gridElements.length).toBeGreaterThan(0);
    textElements.forEach(element => expect(element).toMatchObject({
      textOverflow: 'clip',
      textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    }));
    gridElements.forEach(element => expect(element).toMatchObject({ textOverflow: 'clip', textWrap: false }));
  });

  it('normalizes undeclared flat preset data as new content without mutating input', () => {
    const source = { nodes, rootId: 'root', templates: { page: page() } };
    const before = structuredClone(source);

    const state = loadPreset(source);
    const output = state.variants.default.templates.page.elements;

    expect(state.schemaVersion).toBe(11);
    expect(output[0]).toMatchObject({
      type: 'text', textOverflow: 'clip', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(output[1]).toMatchObject({ type: 'grid', textOverflow: 'clip', textWrap: false });
    expect(output[2]).toMatchObject({ type: 'rect', textOverflow: 'future', textWrap: 1 });
    expect(state.nodes).not.toBe(source.nodes);
    expect(state.nodes.root).not.toBe(source.nodes.root);
    expect(source).toEqual(before);
  });

  it('normalizes undeclared variants-shaped preset data as new content without mutating input', () => {
    const source = { nodes, rootId: 'root', variants: variants(), activeVariantId: 'default' };
    const before = structuredClone(source);

    const state = loadPreset(source);
    const output = state.variants.default.templates.page.elements;

    expect(state.schemaVersion).toBe(11);
    expect(output[0]).toMatchObject({
      type: 'text', textOverflow: 'clip', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(output[1]).toMatchObject({ type: 'grid', textOverflow: 'clip', textWrap: false });
    expect(state.nodes).not.toBe(source.nodes);
    expect(state.nodes.root).not.toBe(source.nodes.root);
    expect(source).toEqual(before);
  });

  it('isolates undeclared output node mutations from source and every module preset use', () => {
    const source = { nodes: structuredClone(nodes), rootId: 'root', templates: { page: page() } };
    const state = loadPreset(source);

    state.nodes.root.title = 'Changed output';
    expect(source.nodes.root.title).toBe('Root');

    for (const createProject of [createBlankProject, createNotebookProject, createPlannerProject]) {
      const first = createProject();
      const moduleTitle = first.nodes[first.rootId].title;
      first.nodes[first.rootId].title = 'Changed output';
      const second = createProject();

      expect(second).not.toBe(first);
      expect(second.nodes).not.toBe(first.nodes);
      expect(second.nodes[second.rootId].title).toBe(moduleTitle);
    }
  });

  it('uses legacy rendering defaults for presets explicitly declared as v9', () => {
    const source = { schemaVersion: 9, nodes, rootId: 'root', variants: variants(), activeVariantId: 'default' };

    const state = loadPreset(source);
    const output = state.variants.default.templates.page.elements;

    expect(state.schemaVersion).toBe(11);
    expect(output[0]).toMatchObject({
      type: 'text', textOverflow: 'visible', textWrap: true,
      textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(output[1]).toMatchObject({ type: 'grid', textOverflow: 'ellipsis', textWrap: false });
  });

});
