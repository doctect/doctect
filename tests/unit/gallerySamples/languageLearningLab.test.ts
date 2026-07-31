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
  slug: '13-language-learning-lab',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'deck', 'card_front', 'card_back', 'grammar', 'drill', 'journal', 'progress'],
  pageCount: [120, 155],
  palette: ['#2f5d5a', '#b3703f', '#eef0ea'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('13-language-learning-lab', () => {
  it('generates Lexicon Lab', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('pairs every card front with its back', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const fronts = Object.values(sample.nodes).filter((n: any) => n.type === 'card_front' && !n.referenceId);
    expect(fronts.length).toBeGreaterThanOrEqual(56);
    fronts.forEach((front: any) => {
      const back = front.children.map((id: string) => sample.nodes[id]).find((c: any) => c?.type === 'card_back' && !c.referenceId);
      expect(back, `${front.id} back`).toBeTruthy();
    });
  });

  it('supports the minimum lab', () => {
    const sample = loadGallerySample(contract.slug, { deckCount: 2, cardsPerDeck: 8, journalPageCount: 4 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [55, 85] })).toEqual([]);
  });

  it('pre-links blank decks and fills the Spanish demo', () => {
    const sample = expectValidGallerySample(contract.slug, contract);

    const blankFronts = Object.values(sample.nodes).filter((n: any) =>
      n.type === 'card_front' && !n.referenceId && isBlankBranch(sample, n));
    expect(blankFronts).toHaveLength(48);
    blankFronts.forEach((front: any) => {
      expect(front.data.word, `${front.id} word`).toBe('');
      const back = sample.nodes[front.children[0]];
      expect(back.type, `${front.id} back type`).toBe('card_back');
      expect(back.data.meaning, `${back.id} meaning`).toBe('');
      const nextRef = back.children.map((id: string) => sample.nodes[id])[0];
      if (back.data.next_label === '') {
        expect(nextRef, `${back.id} must end its deck quietly`).toBeUndefined();
      } else {
        expect(nextRef?.type, `${back.id} next ref type`).toBe('card_front');
        expect(nextRef?.referenceId, `${back.id} next ref`).toBeTruthy();
      }
    });

    const demoFronts = Object.values(sample.nodes).filter((n: any) =>
      n.type === 'card_front' && !n.referenceId && !isBlankBranch(sample, n));
    const demoWords = demoFronts.map((n: any) => n.data.word).sort();
    expect(demoWords).toEqual(['agua', 'amigo', 'casa', 'comer', 'gracias', 'hola', 'libro', 'tiempo']);
    demoFronts.forEach((front: any) => {
      const back = sample.nodes[front.children[0]];
      expect(String(back.data.meaning ?? '').length, `${back.id} meaning`).toBeGreaterThan(0);
      expect(String(back.data.example_sentence ?? '').length, `${back.id} example`).toBeGreaterThan(5);
    });
  });
});
