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
  slug: '20-habit-quest-rpg',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'character', 'skill_tree', 'quest_board', 'daily', 'boss', 'xp_ledger', 'level_log', 'trophy'],
  pageCount: [46, 68],
  palette: ['#5a2f2b', '#9c7c2e', '#f3ecda'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('20-habit-quest-rpg', () => {
  it('generates The Quest Ledger', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('wires character sheet to trees and ledger, bosses back to the board', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const character = sample.nodes.character_sheet;
    const characterDestinations = character.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    const trees = Object.values(sample.nodes).filter((n: any) => n.type === 'skill_tree' && !n.referenceId);
    expect(trees).toHaveLength(4);
    trees.forEach((t: any) => expect(characterDestinations, `${t.id} on character`).toContain(t.id));
    expect(characterDestinations.map((id: string) => sample.nodes[id].type)).toContain('xp_ledger');
    const bosses = Object.values(sample.nodes).filter((n: any) => n.type === 'boss' && !n.referenceId && !isExampleBranch(sample, n));
    expect(bosses).toHaveLength(12);
  });

  it('supports a fortnight starter ledger', () => {
    const sample = loadGallerySample(contract.slug, { dailyCount: 14, bossCount: 4 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [26, 46] })).toEqual([]);
  });
});
