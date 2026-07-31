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
  slug: '11-chess-opening-repertoire',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'repertoire', 'chapter', 'position', 'worksheet', 'study_log'],
  pageCount: [52, 74],
  palette: ['#2b3542', '#a08248', '#edf0f4'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const FILES = ['a','b','c','d','e','f','g','h'];
const SQUARES = FILES.flatMap(f => [1,2,3,4,5,6,7,8].map(r => `${f}${r}`));

describe('11-chess-opening-repertoire', () => {
  it('generates Opening Atlas', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('binds a full 64-square board and keeps every position chess-legal at the king level', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const positionTemplate = sample.templates.position;
    SQUARES.forEach(square => {
      expect(positionTemplate.elements.some((e: any) => e.dataBinding === square || (e.text ?? '').includes(`{{${square}}}`)),
        `board cell ${square}`).toBe(true);
    });
    const positions = Object.values(sample.nodes).filter((n: any) => n.type === 'position' && !n.referenceId);
    expect(positions.length).toBeGreaterThanOrEqual(36);
    positions.filter((n: any) => !isBlankBranch(sample, n)).forEach((position: any) => {
      const pieces = SQUARES.map(square => position.data[square] ?? '');
      expect(pieces.filter(p => p === 'K'), `${position.id} white king`).toHaveLength(1);
      expect(pieces.filter(p => p === 'k'), `${position.id} black king`).toHaveLength(1);
    });
  });

  it('uses reference nodes for transpositions', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const refs = Object.values(sample.nodes).filter((n: any) => n.referenceId && n.type === 'position');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('supports fewer worksheets', () => {
    const sample = loadGallerySample(contract.slug, { worksheetCount: 4, studyLogCount: 2 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [44, 66] })).toEqual([]);
  });
});
