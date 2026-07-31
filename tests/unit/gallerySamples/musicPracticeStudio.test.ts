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
  slug: '18-music-practice-studio',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'rack', 'piece', 'session', 'staff_paper', 'chord_sheet', 'technique', 'gig', 'streak'],
  pageCount: [50, 72],
  palette: ['#21262b', '#ad8433', '#f1ede2'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('18-music-practice-studio', () => {
  it('generates The Woodshed', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('racks every piece and chains the session logs', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const rack = sample.nodes.repertoire_rack;
    const pieces = Object.values(sample.nodes).filter((n: any) => n.type === 'piece' && !n.referenceId && !isExampleBranch(sample, n));
    expect(pieces).toHaveLength(12);
    const racked = rack.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    pieces.forEach((p: any) => expect(racked, `${p.id} racked`).toContain(p.id));
    const sessions = Object.values(sample.nodes).filter((n: any) => n.type === 'session' && !n.referenceId && !isExampleBranch(sample, n));
    expect(sessions).toHaveLength(24);
  });

  it('supports a lighter studio', () => {
    const sample = loadGallerySample(contract.slug, { pieceCount: 6, sessionCount: 12 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [32, 54] })).toEqual([]);
  });
});
