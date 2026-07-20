import { describe, it, expect } from 'vitest';
import { parseDocsContent } from '../../lib/docsContent';
import { buildDocsSearchIndex, searchDocs, getDefaultSearchIndex } from '../../lib/docsSearch';

const files: Record<string, string> = {
  '../docs-content/reference/grid/dynamic-offset.md':
    '---\ntitle: Dynamic Offset\nsummary: Start a grid at a field-driven cell.\naliases: calendar offset, weekday offset\nkeywords: grid, offset, dayOfWeekNum\n---\n\nUse the first child\'s data field.\n',
  '../docs-content/reference/grid/traversal-path.md':
    '---\ntitle: Traversal Path\nsummary: Drill a grid into descendants.\nkeywords: grid, descendants\n---\n\nSteps drill down.\n',
  '../docs-content/tutorials/editor/07-grids-calendars.md':
    '---\ntitle: Grids II - Calendars\ndifficulty: intermediate\ntime: 10 min\nsummary: Build a real month calendar.\nkeywords: calendar, month\n---\n\n## Dynamic Offset in practice\n\nSet the offset mode to dynamic.\n\n## Slicing days into weeks\n\nUse data slicing.\n',
};
const sIdx = buildDocsSearchIndex(parseDocsContent(files));

describe('searchDocs', () => {
  it('returns [] for empty queries', () => {
    expect(searchDocs(sIdx, '')).toEqual([]);
    expect(searchDocs(sIdx, '   ')).toEqual([]);
  });
  it('alias lookup lands the reference entry first', () => {
    const r = searchDocs(sIdx, 'calendar offset');
    expect(r[0]).toMatchObject({ type: 'reference', title: 'Dynamic Offset', url: '/docs/reference/dynamic-offset' });
  });
  it('ranks a reference title match above a tutorial body match', () => {
    const r = searchDocs(sIdx, 'traversal');
    expect(r[0].title).toBe('Traversal Path');
  });
  it('token prefix matches titles', () => {
    const r = searchDocs(sIdx, 'trav');
    expect(r.some(x => x.title === 'Traversal Path')).toBe(true);
  });
  it('tutorial heading matches deep-link to the heading anchor', () => {
    const r = searchDocs(sIdx, 'slicing');
    const tut = r.find(x => x.type === 'tutorial')!;
    expect(tut.url).toBe('/docs/editor/grids-calendars#slicing-days-into-weeks');
  });
  it('includes badge labels', () => {
    const r = searchDocs(sIdx, 'dynamic offset');
    expect(r[0].badge).toBe('Grid Configuration');
    const tut = r.find(x => x.type === 'tutorial');
    expect(tut?.badge).toBe('Editor');
  });
  it('caps results at the limit', () => {
    expect(searchDocs(sIdx, 'grid', 1)).toHaveLength(1);
  });
});

// Regression coverage added after review: the brief's 7 tests above each
// exercise every scoring rule's code path, but several individual clauses
// were not independently falsifiable (a broken/deleted clause could still
// leave the assertion passing, rescued by a coincidental tie or the
// reference-before-tutorial tiebreak). Each test below pins one clause so
// that disabling it alone breaks that specific test.
describe('searchDocs — scoring contract clauses (regression coverage)', () => {
  it('alias-exact (+25) decides ranking between same-type docs, not a rescued tie', () => {
    const idx = buildDocsSearchIndex(parseDocsContent({
      '../docs-content/reference/grid/x-widget.md':
        '---\ntitle: X Widget\nsummary: A sample reference entry for scoring tests.\naliases: zark quux\nkeywords: sample\n---\n\nNothing special here.\n',
      '../docs-content/reference/grid/y-widget.md':
        '---\ntitle: Zark Widget\nsummary: Another sample reference entry for scoring tests.\nkeywords: quux\n---\n\nNothing special here too.\n',
    }));
    const r = searchDocs(idx, 'zark quux');
    expect(r[0].title).toBe('X Widget');
    expect(r[1].title).toBe('Zark Widget');
    expect(r[0].score).toBeGreaterThan(r[1].score);
    expect(r[0].score).toBeCloseTo(31.25); // alias-exact 25, x1.25 (no token overlap)
    expect(r[1].score).toBeCloseTo(25);    // title-exact 12 + keyword-exact 8 = 20, x1.25
  });

  it('alias-contains (+15) surfaces an entry and outranks a body-only match', () => {
    const idx = buildDocsSearchIndex(parseDocsContent({
      '../docs-content/reference/grid/p-entry.md':
        '---\ntitle: Unrelated Title\nsummary: Testing the alias-contains scoring path.\naliases: monthly calendar view\nkeywords: misc\n---\n\nNothing about scheduling here.\n',
      '../docs-content/reference/grid/q-entry.md':
        '---\ntitle: Something Else\nsummary: Testing a body-only match competitor.\nkeywords: other\n---\n\nThis entry mentions monthly calendar scheduling deep in the body text only.\n',
    }));
    const r = searchDocs(idx, 'monthly calendar');
    expect(r[0].title).toBe('Unrelated Title');
    expect(r[0].score).toBeCloseTo(18.75); // alias-contains 15, x1.25
    expect(r[1].title).toBe('Something Else');
    expect(r[1].score).toBeCloseTo(5);     // body-exact 2 + 2 = 4, x1.25
  });

  it('ties break reference-before-tutorial, overriding alphabetical title order', () => {
    const idx = buildDocsSearchIndex(parseDocsContent({
      '../docs-content/reference/grid/zulu-neutral.md':
        '---\ntitle: Zulu Neutral\nsummary: Tie-break fixture, reference side.\nkeywords: wobble\n---\n\nPlain body.\n',
      '../docs-content/tutorials/editor/01-alpha-neutral.md':
        '---\ntitle: Alpha Neutral\ndifficulty: beginner\ntime: 5 min\nsummary: Tie-break fixture, tutorial side.\nkeywords: wobble\n---\n\nBody mentions frizzle once.\n',
    }));
    const r = searchDocs(idx, 'wobble frizzle');
    expect(r[0].score).toBeCloseTo(10);
    expect(r[1].score).toBeCloseTo(10);
    expect(r[0]).toMatchObject({ type: 'reference', title: 'Zulu Neutral' });
    expect(r[1]).toMatchObject({ type: 'tutorial', title: 'Alpha Neutral' });
  });

  it('ties between same-type docs break by title A to Z', () => {
    const idx = buildDocsSearchIndex(parseDocsContent({
      '../docs-content/reference/grid/beta-item.md':
        '---\ntitle: Beta Item\nsummary: Tie-break fixture B.\nkeywords: snorkle\n---\n\nPlain body.\n',
      '../docs-content/reference/linking/alpha-item.md':
        '---\ntitle: Alpha Item\nsummary: Tie-break fixture A.\nkeywords: snorkle\n---\n\nPlain body.\n',
    }));
    const r = searchDocs(idx, 'snorkle');
    expect(r[0].score).toBeCloseTo(10);
    expect(r[1].score).toBeCloseTo(10);
    expect(r[0].title).toBe('Alpha Item');
    expect(r[1].title).toBe('Beta Item');
  });

  it('title token prefix (+10) is pinned separately from phrase-in-title (+30)', () => {
    // Reversed word order defeats titleLower.includes(phrase) (phrase-in-title
    // needs the literal phrase as a contiguous substring) while 'path' still
    // title-token-exact-matches and 'trav' title-token-prefix-matches.
    const r = searchDocs(sIdx, 'path trav');
    const tp = r.find(x => x.title === 'Traversal Path')!;
    expect(tp.score).toBeCloseTo(27.5); // (exact 12 + prefix 10) x1.25, no phrase-in-title
  });

  it('phrase-in-title (+30) is pinned in isolation from any title-token bonus', () => {
    const idx = buildDocsSearchIndex(parseDocsContent({
      '../docs-content/reference/grid/underground-cache.md':
        '---\ntitle: Underground Cache\nsummary: Fixture isolating the phrase-in-title bonus.\nkeywords: storage\n---\n\nUnrelated body text.\n',
    }));
    // 'dergro' is a mid-word substring of "Underground" (titleLower.includes
    // fires) but is neither equal to nor a prefix of the token "underground".
    const r = searchDocs(idx, 'dergro');
    expect(r).toHaveLength(1);
    expect(r[0].score).toBeCloseTo(37.5); // phrase-in-title 30 only, x1.25
  });
});

describe('getDefaultSearchIndex', () => {
  it('returns a docs array and memoizes the same instance across calls', () => {
    const first = getDefaultSearchIndex();
    expect(Array.isArray(first.docs)).toBe(true);
    const second = getDefaultSearchIndex();
    expect(second).toBe(first);
  });
});
