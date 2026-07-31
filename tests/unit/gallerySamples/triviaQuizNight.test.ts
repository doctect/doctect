import { describe, expect, it } from 'vitest';
import {
    expectValidGallerySample, loadGallerySample, validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const isBlankBranch = (sample: any, node: any): boolean => {
  let current = node;
  while (current) {
    if (current.id === 'blank_workspace') return true;
    current = current.parentId ? sample.nodes[current.parentId] : undefined;
  }
  return false;
};

const contract: GallerySampleContract = {
  slug: '10-trivia-quiz-night',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'round', 'question', 'answer', 'scoreboard', 'grand_total'],
  pageCount: [165, 195],
  palette: ['#2e3438', '#b08d3f', '#f0ede4'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('10-trivia-quiz-night', () => {
  it('generates Quiz Night', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links every question to its answer and back, with real content', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const authored = Object.values(sample.nodes).filter((n: any) =>
      !n.referenceId && n.type === 'question' && !isBlankBranch(sample, n));
    expect(authored).toHaveLength(60);
    authored.forEach((q: any) => {
      const answer = q.children.map((id: string) => sample.nodes[id]).find((c: any) => c?.type === 'answer' && !c.referenceId);
      expect(answer, `${q.id} answer child`).toBeTruthy();
      expect(String(q.data.question_text ?? '').length).toBeGreaterThan(10);
      expect(String(answer.data.answer_text ?? '').length).toBeGreaterThan(0);
    });
  });

  it('pre-links blank host-kit rounds', () => {
    const sample = loadGallerySample(contract.slug, { blankRoundCount: 0 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [125, 150] })).toEqual([]);
  });
});
