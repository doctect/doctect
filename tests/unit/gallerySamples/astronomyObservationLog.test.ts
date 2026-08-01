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
  slug: '19-astronomy-observation-log',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'month_sky', 'target', 'session', 'equipment', 'life_list', 'glossary'],
  pageCount: [40, 64],
  palette: ['#1d2530', '#6e7f96', '#e9edf3'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('19-astronomy-observation-log', () => {
  it('generates The Observatory', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('points every monthly highlight at a catalog target and life-lists the catalog', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const months = Object.values(sample.nodes).filter((n: any) => n.type === 'month_sky' && !n.referenceId);
    expect(months).toHaveLength(12);
    const targets = Object.values(sample.nodes).filter((n: any) => n.type === 'target' && !n.referenceId && !isExampleBranch(sample, n));
    expect(targets).toHaveLength(20);
    months.forEach((month: any) => {
      expect(month.children.length).toBeGreaterThanOrEqual(3);
      month.children.forEach((childId: string) => {
        const ref = sample.nodes[childId];
        expect(ref.referenceId, `${month.id} highlight ${childId}`).toBeTruthy();
        expect(sample.nodes[ref.referenceId].type).toBe('target');
      });
    });
    const lifeList = sample.nodes.life_list;
    const listed = lifeList.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    targets.forEach((t: any) => expect(listed, `${t.id} life-listed`).toContain(t.id));
  });

  it('supports fewer sessions', () => {
    const sample = loadGallerySample(contract.slug, { sessionCount: 8 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [30, 52] })).toEqual([]);
  });
});
