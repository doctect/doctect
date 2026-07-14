import { describe, expect, it } from 'vitest';
import { loadProjectState } from '../../services/loadProjectState';

const validV8State = () => ({
  schemaVersion: 8,
  nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
  rootId: 'root',
  variants: {},
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

    expect(result.state.schemaVersion).toBe(9);
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
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.generator).toBeUndefined();
    expect(result.warnings).toEqual([
      'Saved generator was detached: Hierarchy script must be text.',
    ]);
  });
});
