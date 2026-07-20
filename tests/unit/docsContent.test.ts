import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseDocsContent, slugifyHeading, TRACK_ORDER } from '../../lib/docsContent';

const tut = (over: Record<string, string> = {}) => {
  const meta: Record<string, string> = {
    title: 'Canvas Basics', difficulty: 'beginner', time: '8 min',
    summary: 'Learn the canvas.', keywords: 'canvas, pan, zoom', ...over,
  };
  const fm = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${fm}\n---\n\n## First Heading\n\nBody text.\n`;
};

const ref = `---\ntitle: Dynamic Offset\nsummary: Field-driven grid offset.\naliases: calendar offset, weekday offset\nkeywords: grid, offset\n---\n\nBody.\n`;

describe('parseFrontmatter', () => {
  it('splits meta from body', () => {
    const { meta, body } = parseFrontmatter('---\ntitle: X\nkeywords: a, b\n---\nBody here');
    expect(meta.title).toBe('X');
    expect(meta.keywords).toBe('a, b');
    expect(body.trim()).toBe('Body here');
  });
  it('treats content without frontmatter as pure body', () => {
    const { meta, body } = parseFrontmatter('just text');
    expect(meta).toEqual({});
    expect(body).toBe('just text');
  });
  it('keeps colons inside values', () => {
    const { meta } = parseFrontmatter('---\ntitle: Grids: The Sequel\n---\n');
    expect(meta.title).toBe('Grids: The Sequel');
  });
});

describe('slugifyHeading', () => {
  it('lowercases, strips punctuation, hyphenates', () => {
    expect(slugifyHeading('Dynamic Offset — via `dayOfWeekNum`!')).toBe('dynamic-offset-via-dayofweeknum');
  });
});

describe('parseDocsContent', () => {
  it('parses a tutorial with track/order/slug from its path', () => {
    const idx = parseDocsContent({ '../docs-content/tutorials/editor/01-canvas-basics.md': tut() });
    expect(idx.tutorials).toHaveLength(1);
    const t = idx.tutorials[0];
    expect(t).toMatchObject({ track: 'editor', order: 1, slug: 'canvas-basics', title: 'Canvas Basics', difficulty: 'beginner' });
    expect(t.keywords).toEqual(['canvas', 'pan', 'zoom']);
    expect(idx.tutorialByPath.get('editor/canvas-basics')).toBe(t);
  });
  it('parses a reference entry with category from its path', () => {
    const idx = parseDocsContent({ '../docs-content/reference/grid/dynamic-offset.md': ref });
    const e = idx.referenceEntries[0];
    expect(e).toMatchObject({ category: 'grid', slug: 'dynamic-offset', title: 'Dynamic Offset' });
    expect(e.aliases).toEqual(['calendar offset', 'weekday offset']);
    expect(idx.referenceBySlug.get('dynamic-offset')).toBe(e);
  });
  it('sorts tutorials by track order then numeric order', () => {
    const idx = parseDocsContent({
      '../docs-content/tutorials/editor/02-b.md': tut({ title: 'B' }),
      '../docs-content/tutorials/editor/10-c.md': tut({ title: 'C' }),
      '../docs-content/tutorials/getting-started/01-a.md': tut({ title: 'A' }),
    });
    expect(idx.tutorials.map(t => t.title)).toEqual(['A', 'B', 'C']);
    expect(TRACK_ORDER[0]).toBe('getting-started');
  });
  it('throws when a required field is missing', () => {
    expect(() => parseDocsContent({ '../docs-content/tutorials/editor/01-x.md': tut({ title: '' }) }))
      .toThrow(/title/);
  });
  it('throws on an invalid difficulty', () => {
    expect(() => parseDocsContent({ '../docs-content/tutorials/editor/01-x.md': tut({ difficulty: 'expert' }) }))
      .toThrow(/difficulty/);
  });
  it('throws on an unknown track directory', () => {
    expect(() => parseDocsContent({ '../docs-content/tutorials/wizardry/01-x.md': tut() }))
      .toThrow(/track/);
  });
  it('throws on an unknown reference category', () => {
    expect(() => parseDocsContent({ '../docs-content/reference/nonsense/x.md': ref }))
      .toThrow(/category/);
  });
  it('throws on duplicate slugs', () => {
    expect(() => parseDocsContent({
      '../docs-content/reference/grid/dynamic-offset.md': ref,
      '../docs-content/reference/linking/dynamic-offset.md': ref,
    })).toThrow(/duplicate/i);
  });
  it('throws on an unresolvable prerequisite', () => {
    expect(() => parseDocsContent({
      '../docs-content/tutorials/editor/01-x.md': tut({ prerequisites: 'editor/does-not-exist' }),
    })).toThrow(/prerequisite/);
  });
  it('accepts a resolvable prerequisite', () => {
    const idx = parseDocsContent({
      '../docs-content/tutorials/editor/01-x.md': tut({ title: 'X' }),
      '../docs-content/tutorials/editor/02-y.md': tut({ title: 'Y', prerequisites: 'editor/x' }),
    });
    expect(idx.tutorialByPath.get('editor/y')!.prerequisites).toEqual(['editor/x']);
  });
  it('ignores files that are not under tutorials/ or reference/', () => {
    const idx = parseDocsContent({ '../docs-content/README.md': 'authoring guide' });
    expect(idx.tutorials).toHaveLength(0);
    expect(idx.referenceEntries).toHaveLength(0);
  });
});
