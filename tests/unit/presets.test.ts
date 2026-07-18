import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlankProject,
  createNotebookProject,
  createPlannerProject,
  getCustomPresets,
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

describe('schema v10 presets', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ['blank', createBlankProject],
    ['notebook', createNotebookProject],
    ['planner', createPlannerProject],
  ])('%s project is v10 without generator metadata', (_name, createProject) => {
    const state = createProject();

    expect(state.schemaVersion).toBe(10);
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
    textElements.forEach(element => expect(element).toMatchObject({ textOverflow: 'clip', textWrap: true }));
    gridElements.forEach(element => expect(element).toMatchObject({ textOverflow: 'clip', textWrap: false }));
  });

  it('normalizes undeclared flat preset data as new content without mutating input', () => {
    const source = { nodes, rootId: 'root', templates: { page: page() } };
    const before = structuredClone(source);

    const state = loadPreset(source);
    const output = state.variants.default.templates.page.elements;

    expect(state.schemaVersion).toBe(10);
    expect(output[0]).toMatchObject({ type: 'text', textOverflow: 'clip', textWrap: true });
    expect(output[1]).toMatchObject({ type: 'grid', textOverflow: 'clip', textWrap: false });
    expect(output[2]).toMatchObject({ type: 'rect', textOverflow: 'future', textWrap: 1 });
    expect(source).toEqual(before);
  });

  it('normalizes undeclared variants-shaped preset data as new content without mutating input', () => {
    const source = { nodes, rootId: 'root', variants: variants(), activeVariantId: 'default' };
    const before = structuredClone(source);

    const state = loadPreset(source);
    const output = state.variants.default.templates.page.elements;

    expect(state.schemaVersion).toBe(10);
    expect(output[0]).toMatchObject({ type: 'text', textOverflow: 'clip', textWrap: true });
    expect(output[1]).toMatchObject({ type: 'grid', textOverflow: 'clip', textWrap: false });
    expect(source).toEqual(before);
  });

  it('uses legacy rendering defaults for presets explicitly declared as v9', () => {
    const source = { schemaVersion: 9, nodes, rootId: 'root', variants: variants(), activeVariantId: 'default' };

    const state = loadPreset(source);
    const output = state.variants.default.templates.page.elements;

    expect(state.schemaVersion).toBe(10);
    expect(output[0]).toMatchObject({ type: 'text', textOverflow: 'visible', textWrap: true });
    expect(output[1]).toMatchObject({ type: 'grid', textOverflow: 'ellipsis', textWrap: false });
  });

  it('preserves a custom project and warns when malformed generator metadata is detached', () => {
    localStorage.setItem('hype_custom_presets', JSON.stringify([{
      id: 'custom-1',
      title: 'Custom',
      desc: 'Saved project',
      initialState: {
        schemaVersion: 8,
        nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
        rootId: 'root',
        variants: {},
        activeVariantId: 'default',
        generator: { formatVersion: 1, templateScript: null, hierarchyScript: '', generatedAt: '2026-07-13T12:00:00.000Z' },
      },
    }]));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [preset] = getCustomPresets();

    expect(preset.title).toBe('Custom');
    expect(preset.initialState?.rootId).toBe('root');
    expect(preset.initialState?.schemaVersion).toBe(10);
    expect(preset.initialState?.generator).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Saved generator was detached: Template script must be text.');
    warn.mockRestore();
  });

  it('normalizes malformed current-v10 custom preset values while retaining valid values', () => {
    const currentVariants = variants();
    currentVariants.default.templates.page.elements = [
      { id: 'text', type: 'text', textOverflow: 'truncate', textWrap: 'true', layerId: 'content' } as any,
      { id: 'grid', type: 'grid', textOverflow: 'visible', textWrap: true, layerId: 'content' },
    ];
    localStorage.setItem('hype_custom_presets', JSON.stringify([{
      id: 'custom-v10',
      title: 'Custom v10',
      desc: 'Saved project',
      initialState: { schemaVersion: 10, nodes, rootId: 'root', variants: currentVariants, activeVariantId: 'default' },
    }]));

    const [preset] = getCustomPresets();
    const output = preset.initialState!.variants.default.templates.page.elements;

    expect(preset.initialState?.schemaVersion).toBe(10);
    expect(output[0]).toMatchObject({ textOverflow: 'clip', textWrap: true });
    expect(output[1]).toMatchObject({ textOverflow: 'visible', textWrap: true });
  });
});
