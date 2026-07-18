import { describe, expect, it } from 'vitest';
import { loadProjectState } from '../../services/loadProjectState';

const validV8State = () => ({
  schemaVersion: 8,
  nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
  rootId: 'root',
  variants: {},
  activeVariantId: 'default',
});

const currentStateWithElements = (elements: any[]) => ({
  ...validV8State(),
  schemaVersion: 10,
  variants: {
    default: {
      id: 'default', name: 'Default',
      templates: { page: { id: 'page', name: 'Page', width: 100, height: 100, elements } },
    },
  },
  activeVariantId: 'default',
});

const source = {
  formatVersion: 1 as const,
  templateScript: 'const café = "☕";\nreturn {};',
  hierarchyScript: 'return { nodes: {}, rootId: "root" };\n',
  generatedAt: '2026-07-13T12:00:00.000Z',
};

describe('loadProjectState', () => {
  it('migrates and preserves valid generator source byte-exactly', () => {
    const result = loadProjectState({ ...validV8State(), generator: source });

    expect(result.state.schemaVersion).toBe(11);
    expect(result.state.generator).toEqual(source);
    expect(result.state.generator?.templateScript).toBe(source.templateScript);
    expect(result.warnings).toEqual([]);
  });

  it('loads the project while detaching malformed optional metadata', () => {
    const result = loadProjectState({
      ...validV8State(),
      generator: { ...source, hierarchyScript: 42 },
    });

    expect(result.state.rootId).toBe('root');
    expect(result.state.schemaVersion).toBe(11);
    expect(result.state.generator).toBeUndefined();
    expect(result.warnings).toEqual([
      'Saved generator was detached: Hierarchy script must be text.',
    ]);
  });

  it('returns a v10 state independent from its input after migration', () => {
    const raw = { ...validV8State(), schemaVersion: 10, generator: { ...source, unknown: true } } as any;
    const original = structuredClone(raw);

    const result = loadProjectState(raw);
    result.state.nodes.root.title = 'Edited after load';

    expect(raw).toEqual(original);
    expect(result.state.schemaVersion).toBe(11);
    expect(result.state.generator).toEqual(source);
  });

  it('normalizes already-v10 applicable fields at the central load boundary', () => {
    const raw: any = currentStateWithElements([
      { type: 'text', textOverflow: null, textWrap: 'true' },
      { type: 'grid', textOverflow: 'visible' },
    ]);
    const result = loadProjectState(raw);
    expect(result.state.schemaVersion).toBe(11);
    expect(result.state.variants.default.templates.page.elements).toMatchObject([
      {
        textOverflow: 'clip', textWrap: true,
        textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      { textOverflow: 'visible', textWrap: false },
    ]);
    expect(raw.variants.default.templates.page.elements[0].textOverflow).toBeNull();
  });
});
