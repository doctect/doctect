import { describe, expect, it } from 'vitest';
import {
    expectValidGallerySample, loadGallerySample, validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const contract: GallerySampleContract = {
  slug: '12-family-history-workbook',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'chart', 'person', 'group_sheet', 'prompts', 'photo_log', 'research_log', 'sources'],
  pageCount: [42, 60],
  palette: ['#53455c', '#9c8354', '#f1eae0'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('12-family-history-workbook', () => {
  it('generates Roots & Branches', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links all fifteen pedigree boxes to distinct person pages with kin links', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const chart = sample.nodes.pedigree_chart;
    expect(chart.children).toHaveLength(15);
    const personIds = new Set(chart.children);
    expect(personIds.size).toBe(15);
    chart.children.forEach((id: string) => {
      const person = sample.nodes[id];
      expect(person.type).toBe('person');
      person.children.forEach((childId: string) => {
        const kin = sample.nodes[childId];
        expect(kin.referenceId, `${id} kin ${childId}`).toBeTruthy();
        expect(sample.nodes[kin.referenceId].type).toBe('person');
      });
    });
  });

  it('supports a smaller workbook', () => {
    const sample = loadGallerySample(contract.slug, { sparePersonCount: 4, promptPageCount: 2 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [32, 50] })).toEqual([]);
  });
});
