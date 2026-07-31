import { describe, expect, it } from 'vitest';
import {
    expectValidGallerySample, loadGallerySample, validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const isExampleBranch = (sample: any, node: any): boolean => {
  let current = node;
  while (current) {
    if (current.id === 'example_workspace') return true;
    current = current.parentId ? sample.nodes[current.parentId] : undefined;
  }
  return false;
};

const contract: GallerySampleContract = {
  slug: '17-home-owners-manual',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'dashboard', 'room', 'system', 'appliance', 'seasonal', 'repair_log', 'contacts'],
  pageCount: [36, 54],
  palette: ['#2e4a66', '#8a9aa8', '#eef3f7'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('17-home-owners-manual', () => {
  it('generates The House Book', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links every appliance from exactly one room and chains the seasons', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const rooms = Object.values(sample.nodes).filter((n: any) => n.type === 'room' && !n.referenceId && !isExampleBranch(sample, n));
    const appliances = Object.values(sample.nodes).filter((n: any) => n.type === 'appliance' && !n.referenceId && !isExampleBranch(sample, n));
    expect(rooms).toHaveLength(8);
    expect(appliances).toHaveLength(12);
    appliances.forEach((a: any) => {
      expect(sample.nodes[a.parentId]?.type, `${a.id} parent room`).toBe('room');
    });
    const seasons = Object.values(sample.nodes).filter((n: any) => n.type === 'seasonal' && !n.referenceId);
    expect(seasons).toHaveLength(4);
  });

  it('supports a small home', () => {
    const sample = loadGallerySample(contract.slug, { roomCount: 4, applianceCount: 6 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [24, 42] })).toEqual([]);
  });
});
