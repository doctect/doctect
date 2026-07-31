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
  slug: '15-garden-almanac',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'bed_map', 'month', 'plant_card', 'plant_index', 'harvest_log', 'pest_log', 'year_review'],
  pageCount: [30, 50],
  palette: ['#3d5c45', '#97622f', '#f0eee0'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('15-garden-almanac', () => {
  it('generates The Grower\'s Year', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links month rows to plant cards and indexes every card', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const months = Object.values(sample.nodes).filter((n: any) => n.type === 'month' && !n.referenceId);
    expect(months.filter((m: any) => !isExampleBranch(sample, m))).toHaveLength(12);
    const cards = Object.values(sample.nodes).filter((n: any) => n.type === 'plant_card' && !n.referenceId && !isExampleBranch(sample, n));
    expect(cards).toHaveLength(16);
    months.forEach((month: any) => {
      month.children.forEach((childId: string) => {
        const ref = sample.nodes[childId];
        expect(ref.referenceId, `${month.id} row ${childId}`).toBeTruthy();
        expect(sample.nodes[ref.referenceId].type).toBe('plant_card');
      });
    });
    const index = sample.nodes.plant_index;
    const indexed = index.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    cards.forEach((card: any) => expect(indexed, `${card.id} indexed`).toContain(card.id));
  });

  it('supports a compact garden', () => {
    const sample = loadGallerySample(contract.slug, { bedCount: 2, harvestLogCount: 2 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [26, 46] })).toEqual([]);
  });
});
