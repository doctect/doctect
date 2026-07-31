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
  slug: '16-reading-journal',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'shelf', 'book', 'quote_page', 'series', 'tbr', 'wrap_up'],
  pageCount: [46, 66],
  palette: ['#533b33', '#37564e', '#f3ecdf'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('16-reading-journal', () => {
  it('generates The Reading Room', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('shelves every book with working spine links', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const shelves = Object.values(sample.nodes).filter((n: any) => n.type === 'shelf' && !n.referenceId);
    const books = Object.values(sample.nodes).filter((n: any) => n.type === 'book' && !n.referenceId && !isExampleBranch(sample, n));
    expect(books).toHaveLength(24);
    const shelved = shelves.flatMap((s: any) => s.children.map((id: string) => sample.nodes[id]))
      .map((c: any) => c.referenceId ?? c.id);
    books.forEach((b: any) => expect(shelved, `${b.id} shelved`).toContain(b.id));
  });

  it('supports a smaller library', () => {
    const sample = loadGallerySample(contract.slug, { bookCount: 12, quotePageCount: 8 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [26, 46] })).toEqual([]);
  });
});
