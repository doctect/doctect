import { describe, it, expect } from 'vitest';
import { parseDocsContent } from '../../lib/docsContent';
import { buildDocsSearchIndex, searchDocs } from '../../lib/docsSearch';

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
