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
  slug: '14-job-search-hq',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'pipeline', 'dossier', 'star_story', 'question_bank', 'ask_bank', 'contacts', 'comparison', 'weekly_review'],
  pageCount: [32, 48],
  palette: ['#23364c', '#7d9ab5', '#f0f2f5'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('14-job-search-hq', () => {
  it('generates Offer Track', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('routes every dossier through the pipeline and prep bank', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const pipeline = sample.nodes.pipeline_board;
    const dossiers = Object.values(sample.nodes).filter((n: any) => n.type === 'dossier' && !n.referenceId);
    expect(dossiers.length).toBeGreaterThanOrEqual(10);
    const pipelineDestinations = pipeline.children.map((id: string) => sample.nodes[id])
      .map((c: any) => c.referenceId ?? c.id);
    dossiers.filter((d: any) => !isExampleBranch(sample, d)).forEach((d: any) => {
      expect(pipelineDestinations, `${d.id} on pipeline`).toContain(d.id);
    });
  });

  it('links every dossier to the contact log', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const chip = sample.templates.dossier.elements.find((e: any) =>
      e.linkTarget === 'specific_node' && e.linkValue === 'contacts_01');
    expect(chip, 'dossier contact log chip').toBeTruthy();
    expect(typeof chip.text === 'string' && chip.text.length > 0, 'chip is always labelled').toBe(true);
    expect(chip.dataBinding, 'label must not be data-bound (never vanishes)').toBeUndefined();
    expect(sample.nodes.contacts_01.type).toBe('contacts');
  });

  it('supports a lean search', () => {
    const sample = loadGallerySample(contract.slug, { dossierCount: 4, reviewWeeks: 4 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [22, 36] })).toEqual([]);
  });
});
