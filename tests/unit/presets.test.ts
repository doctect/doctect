import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlankProject,
  createNotebookProject,
  createPlannerProject,
  getCustomPresets,
} from '../../services/presets';

describe('schema v9 presets', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ['blank', createBlankProject],
    ['notebook', createNotebookProject],
    ['planner', createPlannerProject],
  ])('%s project is v9 without generator metadata', (_name, createProject) => {
    const state = createProject();

    expect(state.schemaVersion).toBe(9);
    expect(state.generator).toBeUndefined();
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
    expect(preset.initialState?.schemaVersion).toBe(9);
    expect(preset.initialState?.generator).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Saved generator was detached: Template script must be text.');
    warn.mockRestore();
  });
});
