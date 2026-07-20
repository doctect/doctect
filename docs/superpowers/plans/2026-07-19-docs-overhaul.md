# In-App Documentation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded `/docs` page with a full documentation section: 25 tutorials across 4 simple→complex tracks, a searchable indexed reference (83 atomic entries), and a committed Playwright capture pipeline producing every screenshot and animated clip deterministically.

**Architecture:** Markdown content in `docs-content/` bundled at build via `import.meta.glob('?raw')`, parsed by a hand-rolled frontmatter parser, rendered by a `react-markdown` wrapper with custom renderers (callouts, kbd chips, lightbox figures, router links). Client-side weighted search built lazily from the same bundled markdown. A `docs-capture/` Playwright pipeline (reusing `tutorial/lib/servers.js` sealed servers) regenerates all assets into `public/docs-assets/`.

**Tech Stack:** React 19, react-router-dom 6, react-markdown 10 (existing dep), Vite (`import.meta.glob`), Vitest + Testing Library (jsdom), Playwright + ffmpeg (capture only). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-19-docs-overhaul-design.md`

## Global Constraints

- **No new runtime or dev dependencies.** Everything uses what's already in `package.json`.
- **Branch:** all work on `feature/docs-overhaul` (create from `main` at execution start).
- **Tests:** every task runs its targeted test file(s) with `npx vitest run tests/unit/<file>` and finishes with a full `npx vitest run` green before commit. Unit tests live in `tests/unit/`, named `*.test.ts`/`*.test.tsx` (vitest config: jsdom, globals, `tests/setup.ts`).
- **Scroll ownership:** `index.html` disables body scrolling globally; every page owns its scroll via an `h-screen overflow-y-auto` (or inner `overflow-y-auto`) container. The docs layout must follow this pattern.
- **Asset paths:** stills `public/docs-assets/<area>/<shot-id>.png`, clips `public/docs-assets/<area>/clip-<name>.webp`. Markdown references them as absolute `/docs-assets/...` URLs. Captions via the markdown title string: `![alt](/docs-assets/editor/toolbar.png "Caption text")`.
- **Markdown conventions** (enforced by the renderer built in Task 3): callouts as `> [!TIP]` / `> [!NOTE]` / `> [!WARNING]` blockquotes; keyboard keys as inline code starting `kbd:` (e.g. `` `kbd:Ctrl+Z` ``); internal links absolute (`/docs/editor/canvas-basics`, `/docs/reference/dynamic-offset`); JS code fences use ```` ```js ```` (rendered through the existing `HighlightedCode` component).
- **Frontmatter contract** (parser built in Task 1): `---`-delimited block of `key: value` lines. Tutorials require `title`, `difficulty` (beginner|intermediate|advanced), `time`, `summary`; optional `keywords`, `prerequisites` (comma-separated `<track>/<slug>` refs). Reference entries require `title`, `summary`; optional `keywords`, `aliases`. List fields are comma-separated. Tutorial track and order come from the file path `docs-content/tutorials/<track>/<NN>-<slug>.md`; reference category from `docs-content/reference/<category>/<slug>.md`.
- **Content accuracy rule:** every content task starts with an inventory step reading the named source files. Documented behavior comes from code (or live capture), never from memory. If the code contradicts this plan's fact bullets, the code wins — and note the discrepancy in the commit message.
- **Capture determinism:** viewport 1600×1000, deviceScaleFactor 2 for stills; seeded projects only (built-in presets or committed generator scripts); the 2026 Planner preset's dates are static so captures are stable.
- **Commit style:** conventional prefixes as in the existing log (`feat:`, `fix:`, `docs:`, `test:`). Content-only commits use `docs:`.
- **ffmpeg and Playwright browsers** are already available (used by `tutorial/` and `tests/e2e/`). If `ffmpeg -version` or Playwright launch fails at Task 9, stop and report — do not install system packages silently.

## File Structure

```
lib/docsContent.ts              # types, TRACK_*, CATEGORY_*, slugifyHeading, parseFrontmatter, parseDocsContent (pure)
lib/docsContentIndex.ts         # import.meta.glob binding → exported docsIndex singleton
lib/docsSearch.ts               # buildDocsSearchIndex, searchDocs (pure)
components/docs/DocsMarkdown.tsx    # react-markdown wrapper: callouts, kbd, figures+lightbox, router links, code blocks
components/docs/DocsSearchBox.tsx   # combobox with keyboard nav, used in DocsLayout
pages/docs/DocsSection.tsx      # nested <Routes> for /docs/*
pages/docs/DocsLayout.tsx       # AppHeader + sidebar (nav + search) + scroll container + <Outlet/>
pages/docs/DocsHomePage.tsx     # learning path home
pages/docs/DocsTutorialPage.tsx # tutorial renderer: breadcrumbs, badges, TOC, prev/next
pages/docs/DocsReferenceIndexPage.tsx
pages/docs/DocsReferenceEntryPage.tsx
pages/docs/docsUi.tsx           # DifficultyBadge, track descriptions, tutorialUrl
docs-content/tutorials/<track>/<NN>-<slug>.md   # 25 tutorials
docs-content/reference/<category>/<slug>.md     # 83 entries
docs-content/README.md          # authoring guide
docs-capture/run.js             # CLI runner
docs-capture/lib/capture.js     # browser/context/still/clip/ffmpeg mechanics
docs-capture/lib/app.js         # editor-driving helpers (verified selectors)
docs-capture/lib/cloud.js       # sealed-server account/publish/fork/MR helpers
docs-capture/scenarios/{smoke,smoke-cloud,getting-started,editor,generator,gallery}.js
docs-capture/README.md
public/docs-assets/**           # committed captured assets
tests/unit/docsContent.test.ts
tests/unit/docsSearch.test.ts
tests/unit/docsMarkdown.test.tsx
tests/unit/docsSection.test.tsx
tests/unit/docsTutorialPage.test.tsx
tests/unit/docsReferencePages.test.tsx
tests/unit/docsSearchBox.test.tsx
tests/unit/docsAntiRot.test.ts
App.tsx                         # modify: /docs route → DocsSection
pages/DocsPage.tsx              # delete (Task 4)
```

**Route map** (Task 4): `/docs` home · `/docs/reference` index · `/docs/reference/:slug` entry · `/docs/:track/:slug` tutorial. All nested inside `DocsSection`'s own `<Routes>` mounted at `/docs/*` in `App.tsx` — the background-location modal `<Routes>` block in `App.tsx` is untouched.

---

# Phase 1 — Infrastructure

### Task 1: Content types, frontmatter parser, pure content loader

**Files:**
- Create: `lib/docsContent.ts`
- Test: `tests/unit/docsContent.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (later tasks import these exact names from `lib/docsContent`):

```ts
export type DocTrack = 'getting-started' | 'editor' | 'generator' | 'gallery';
export type DocDifficulty = 'beginner' | 'intermediate' | 'advanced';
export const TRACK_ORDER: DocTrack[];
export const TRACK_LABELS: Record<DocTrack, string>;
export const CATEGORY_ORDER: string[];
export const CATEGORY_LABELS: Record<string, string>;
export interface DocTutorial { kind: 'tutorial'; track: DocTrack; slug: string; order: number; title: string; difficulty: DocDifficulty; time: string; summary: string; keywords: string[]; prerequisites: string[]; body: string; }
export interface DocReferenceEntry { kind: 'reference'; category: string; slug: string; title: string; summary: string; keywords: string[]; aliases: string[]; body: string; }
export interface DocsIndex { tutorials: DocTutorial[]; referenceEntries: DocReferenceEntry[]; tutorialByPath: Map<string, DocTutorial>; referenceBySlug: Map<string, DocReferenceEntry>; }
export function slugifyHeading(text: string): string;
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string };
export function parseDocsContent(files: Record<string, string>): DocsIndex; // throws on any validation error
```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsContent.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/docsContent.test.ts`
Expected: FAIL — `Cannot find module '../../lib/docsContent'` (or equivalent resolve error).

- [ ] **Step 3: Implement `lib/docsContent.ts`**

```ts
export type DocTrack = 'getting-started' | 'editor' | 'generator' | 'gallery';
export type DocDifficulty = 'beginner' | 'intermediate' | 'advanced';

export const TRACK_ORDER: DocTrack[] = ['getting-started', 'editor', 'generator', 'gallery'];

export const TRACK_LABELS: Record<DocTrack, string> = {
    'getting-started': 'Getting Started',
    editor: 'Editor',
    generator: 'Generator',
    gallery: 'Gallery & Collaboration',
};

export const CATEGORY_ORDER: string[] = [
    'canvas-tools', 'shortcuts', 'element-properties', 'grid', 'linking',
    'binding', 'layers', 'editor', 'generator', 'cloud',
];

export const CATEGORY_LABELS: Record<string, string> = {
    'canvas-tools': 'Canvas Tools',
    shortcuts: 'Keyboard Shortcuts',
    'element-properties': 'Element Properties',
    grid: 'Grid Configuration',
    linking: 'Linking',
    binding: 'Data Binding',
    layers: 'Layers',
    editor: 'Editor & Workspace',
    generator: 'Generator API',
    cloud: 'Cloud & Gallery',
};

export interface DocTutorial {
    kind: 'tutorial';
    track: DocTrack;
    slug: string;
    order: number;
    title: string;
    difficulty: DocDifficulty;
    time: string;
    summary: string;
    keywords: string[];
    prerequisites: string[];
    body: string;
}

export interface DocReferenceEntry {
    kind: 'reference';
    category: string;
    slug: string;
    title: string;
    summary: string;
    keywords: string[];
    aliases: string[];
    body: string;
}

export interface DocsIndex {
    tutorials: DocTutorial[];
    referenceEntries: DocReferenceEntry[];
    tutorialByPath: Map<string, DocTutorial>;
    referenceBySlug: Map<string, DocReferenceEntry>;
}

export function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[`*_~]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta: {}, body: raw };
    const meta: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { meta, body: raw.slice(m[0].length) };
}

const list = (v: string | undefined): string[] =>
    (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

const DIFFICULTIES: DocDifficulty[] = ['beginner', 'intermediate', 'advanced'];
const TUTORIAL_PATH = /(?:^|\/)tutorials\/([a-z-]+)\/(\d+)-([a-z0-9-]+)\.md$/;
const REFERENCE_PATH = /(?:^|\/)reference\/([a-z0-9-]+)\/([a-z0-9-]+)\.md$/;

export function parseDocsContent(files: Record<string, string>): DocsIndex {
    const errors: string[] = [];
    const tutorials: DocTutorial[] = [];
    const referenceEntries: DocReferenceEntry[] = [];
    const tutorialByPath = new Map<string, DocTutorial>();
    const referenceBySlug = new Map<string, DocReferenceEntry>();

    for (const [path, raw] of Object.entries(files)) {
        const tm = path.match(TUTORIAL_PATH);
        const rm = path.match(REFERENCE_PATH);
        if (!tm && !rm) continue; // e.g. docs-content/README.md

        const { meta, body } = parseFrontmatter(raw);
        const require = (field: string): string => {
            const v = (meta[field] ?? '').trim();
            if (!v) errors.push(`${path}: missing required frontmatter field "${field}"`);
            return v;
        };

        if (tm) {
            const [, track, orderStr, slug] = tm;
            if (!(TRACK_ORDER as string[]).includes(track)) {
                errors.push(`${path}: unknown track "${track}"`);
                continue;
            }
            const difficulty = require('difficulty') as DocDifficulty;
            if (difficulty && !DIFFICULTIES.includes(difficulty)) {
                errors.push(`${path}: invalid difficulty "${difficulty}"`);
            }
            const t: DocTutorial = {
                kind: 'tutorial',
                track: track as DocTrack,
                slug,
                order: parseInt(orderStr, 10),
                title: require('title'),
                difficulty,
                time: require('time'),
                summary: require('summary'),
                keywords: list(meta.keywords),
                prerequisites: list(meta.prerequisites),
                body,
            };
            const key = `${t.track}/${t.slug}`;
            if (tutorialByPath.has(key)) errors.push(`${path}: duplicate tutorial slug "${key}"`);
            tutorialByPath.set(key, t);
            tutorials.push(t);
        } else if (rm) {
            const [, category, slug] = rm;
            if (!CATEGORY_ORDER.includes(category)) {
                errors.push(`${path}: unknown reference category "${category}"`);
                continue;
            }
            const e: DocReferenceEntry = {
                kind: 'reference',
                category,
                slug,
                title: require('title'),
                summary: require('summary'),
                keywords: list(meta.keywords),
                aliases: list(meta.aliases),
                body,
            };
            if (referenceBySlug.has(slug)) errors.push(`${path}: duplicate reference slug "${slug}"`);
            referenceBySlug.set(slug, e);
            referenceEntries.push(e);
        }
    }

    for (const t of tutorials) {
        for (const p of t.prerequisites) {
            if (!tutorialByPath.has(p)) {
                errors.push(`${t.track}/${t.slug}: unresolvable prerequisite "${p}"`);
            }
        }
    }

    if (errors.length) throw new Error(`docs-content validation failed:\n${errors.join('\n')}`);

    tutorials.sort((a, b) =>
        TRACK_ORDER.indexOf(a.track) - TRACK_ORDER.indexOf(b.track) || a.order - b.order);
    referenceEntries.sort((a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.title.localeCompare(b.title));

    return { tutorials, referenceEntries, tutorialByPath, referenceBySlug };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsContent.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — expected green (existing suite unaffected).

```bash
git add lib/docsContent.ts tests/unit/docsContent.test.ts
git commit -m "feat: docs content types, frontmatter parser, and validating loader"
```

---

### Task 2: Bundled content index + anti-rot guard tests + authoring README

**Files:**
- Create: `lib/docsContentIndex.ts`
- Create: `docs-content/README.md`
- Test: `tests/unit/docsAntiRot.test.ts`

**Interfaces:**
- Consumes: `parseDocsContent`, `slugifyHeading` from `lib/docsContent`.
- Produces: `export const docsIndex: DocsIndex` from `lib/docsContentIndex` — the singleton every page and the search index import. Also `export const docsContentFiles: Record<string, string>` (raw path→markdown map) for tests that need file paths.

- [ ] **Step 1: Write the failing anti-rot tests**

Create `tests/unit/docsAntiRot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { docsIndex } from '../../lib/docsContentIndex';
import { slugifyHeading } from '../../lib/docsContent';

const ROOT = path.resolve(__dirname, '../..');

const allDocs = () => [
    ...docsIndex.tutorials.map(t => ({ id: `${t.track}/${t.slug}`, body: t.body })),
    ...docsIndex.referenceEntries.map(e => ({ id: `reference/${e.slug}`, body: e.body })),
];

const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// Links only (exclude images via negative lookbehind on '!')
const LINK_RE = /(?<!!)\[[^\]]*\]\((\/docs[^)#\s]*)(#[^)\s]+)?\)/g;

const headingAnchors = (body: string): Set<string> => {
    const anchors = new Set<string>();
    for (const m of body.matchAll(/^#{2,4}\s+(.+)$/gm)) anchors.add(slugifyHeading(m[1]));
    return anchors;
};

describe('docs anti-rot guards', () => {
    it('every referenced image exists under public/docs-assets or public/walkthroughs', () => {
        const missing: string[] = [];
        for (const d of allDocs()) {
            for (const m of d.body.matchAll(IMAGE_RE)) {
                const src = m[1];
                expect(src, `${d.id}: image "${src}" must be an absolute /docs-assets/ or /walkthroughs/ path`)
                    .toMatch(/^\/(docs-assets|walkthroughs)\//);
                if (!fs.existsSync(path.join(ROOT, 'public', src))) missing.push(`${d.id}: ${src}`);
            }
        }
        expect(missing, `missing image files:\n${missing.join('\n')}`).toEqual([]);
    });

    it('every internal /docs link resolves to a real page (and anchor when present)', () => {
        const broken: string[] = [];
        for (const d of allDocs()) {
            for (const m of d.body.matchAll(LINK_RE)) {
                const [, url, anchor] = m;
                let targetBody: string | null = null;
                if (url === '/docs' || url === '/docs/' || url === '/docs/reference') {
                    targetBody = ''; // structural pages, always exist
                } else {
                    const refMatch = url.match(/^\/docs\/reference\/([a-z0-9-]+)$/);
                    const tutMatch = url.match(/^\/docs\/([a-z-]+)\/([a-z0-9-]+)$/);
                    if (refMatch) {
                        const e = docsIndex.referenceBySlug.get(refMatch[1]);
                        if (e) targetBody = e.body;
                    } else if (tutMatch) {
                        const t = docsIndex.tutorialByPath.get(`${tutMatch[1]}/${tutMatch[2]}`);
                        if (t) targetBody = t.body;
                    }
                }
                if (targetBody === null) { broken.push(`${d.id}: ${url}`); continue; }
                if (anchor && targetBody !== '' && !headingAnchors(targetBody).has(anchor.slice(1))) {
                    broken.push(`${d.id}: ${url}${anchor} (anchor not found)`);
                }
            }
        }
        expect(broken, `broken internal links:\n${broken.join('\n')}`).toEqual([]);
    });

    it('content corpus parses (loader threw no error on import)', () => {
        expect(docsIndex.tutorials).toBeInstanceOf(Array);
        expect(docsIndex.referenceEntries).toBeInstanceOf(Array);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsAntiRot.test.ts`
Expected: FAIL — cannot resolve `../../lib/docsContentIndex`.

- [ ] **Step 3: Implement `lib/docsContentIndex.ts`**

```ts
import { parseDocsContent, type DocsIndex } from './docsContent';

// Bundles every docs markdown file at build time. Vitest runs through Vite,
// so the same glob works in tests without mocks.
export const docsContentFiles = import.meta.glob('../docs-content/{tutorials,reference}/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export const docsIndex: DocsIndex = parseDocsContent(docsContentFiles);
```

- [ ] **Step 4: Create `docs-content/README.md`** (authoring guide — also proves the "ignore non-content files" path):

```markdown
# Docs content authoring guide

Everything under `tutorials/` and `reference/` is bundled into the app at build
time and rendered at `/docs`. This README is ignored by the loader.

## File layout

- Tutorial: `tutorials/<track>/<NN>-<slug>.md` — track is one of
  `getting-started`, `editor`, `generator`, `gallery`; `NN` is the order
  within the track; the slug becomes the URL `/docs/<track>/<slug>`.
- Reference entry: `reference/<category>/<slug>.md` — category must be one of
  the keys in `CATEGORY_LABELS` (`lib/docsContent.ts`); URL `/docs/reference/<slug>`.

## Frontmatter

Tutorials require `title`, `difficulty` (beginner|intermediate|advanced),
`time` (e.g. `8 min`), `summary`. Optional: `keywords`, `prerequisites`
(comma-separated `<track>/<slug>`). Reference entries require `title`,
`summary`; optional `keywords`, `aliases` (search synonyms — add generously).

## Conventions

- Callouts: `> [!TIP]`, `> [!NOTE]`, `> [!WARNING]` as the first text of a blockquote.
- Keyboard keys: `` `kbd:Ctrl+Z` `` renders a key chip.
- Images: `![alt](/docs-assets/<area>/<id>.png "Caption shown under the figure")`.
  Animated clips are `/docs-assets/<area>/clip-<name>.webp` (same syntax).
- Internal links: absolute — `/docs/editor/canvas-basics`,
  `/docs/reference/dynamic-offset`, optionally `#heading-anchor`.
- JS examples: fenced ```` ```js ```` blocks.

## Guards

`tests/unit/docsAntiRot.test.ts` fails the suite on any referenced image that
doesn't exist or any internal `/docs` link that doesn't resolve. Regenerate
screenshots with `node docs-capture/run.js <scenario>` (see `docs-capture/README.md`).
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsAntiRot.test.ts tests/unit/docsContent.test.ts`
Expected: PASS — guards are vacuously green (no content yet), loader import works, README ignored.

- [ ] **Step 6: Full suite + commit**

Run: `npx vitest run` — expected green.

```bash
git add lib/docsContentIndex.ts docs-content/README.md tests/unit/docsAntiRot.test.ts
git commit -m "feat: bundled docs content index with anti-rot guard tests"
```

---
### Task 3: DocsMarkdown renderer (callouts, kbd, figures + lightbox, router links, code)

**Files:**
- Create: `components/docs/DocsMarkdown.tsx`
- Test: `tests/unit/docsMarkdown.test.tsx`

**Interfaces:**
- Consumes: `slugifyHeading` from `lib/docsContent`; existing `components/HighlightedCode.tsx` (`<HighlightedCode code={string} />` — JS tokenizer, expects a string prop); `react-markdown` default export; `Link` from react-router-dom.
- Produces: `export function DocsMarkdown({ markdown }: { markdown: string })` — the only component later pages use to render any docs body. Must be rendered inside a Router.

**Behavior contract (all tested):**
- `## Heading` → `<h2 id="heading">` (via `slugifyHeading`); same for h3/h4.
- `> [!TIP] / [!NOTE] / [!WARNING]` first-line blockquotes → styled callout `<aside>` with icon; marker text stripped.
- `` `kbd:Ctrl+Z` `` → `<kbd>Ctrl+Z</kbd>` chip; ordinary inline code unchanged.
- ```` ```js ```` blocks → dark `<pre>` with `<HighlightedCode/>`; other/no language → plain dark `<pre><code>`.
- `![alt](/docs-assets/x/y.png "Caption")` → `<figure>` with lazy `<img>`, `<figcaption>Caption</figcaption>`, click opens a fixed-overlay lightbox (click again closes). Files whose basename starts `clip-` get a "clip" badge on the figure.
- `[text](/docs/...)` → react-router `<Link>`; external `http(s)` links → `<a target="_blank" rel="noopener noreferrer">`.
- Tables wrapped in `overflow-x-auto` container.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsMarkdown.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';

const md = (s: string) => render(<MemoryRouter><DocsMarkdown markdown={s} /></MemoryRouter>);

describe('DocsMarkdown', () => {
  it('gives headings slugified ids', () => {
    md('## Dynamic Offset — via `dayOfWeekNum`');
    const h = screen.getByRole('heading', { level: 2 });
    expect(h.id).toBe('dynamic-offset-via-dayofweeknum');
  });

  it('renders [!TIP] blockquotes as callouts with the marker stripped', () => {
    md('> [!TIP]\n> Lock your background layer.');
    expect(screen.getByText(/Lock your background layer/)).toBeInTheDocument();
    expect(screen.queryByText(/\[!TIP\]/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-callout="tip"]')).toBeTruthy();
  });

  it('renders [!WARNING] callouts', () => {
    md('> [!WARNING]\n> Publishing exposes generator scripts.');
    expect(document.querySelector('[data-callout="warning"]')).toBeTruthy();
  });

  it('renders kbd: inline code as a key chip', () => {
    md('Press `kbd:Ctrl+Z` to undo.');
    const kbd = document.querySelector('kbd');
    expect(kbd?.textContent).toBe('Ctrl+Z');
  });

  it('leaves ordinary inline code alone', () => {
    md('The `{{title}}` placeholder.');
    expect(document.querySelector('kbd')).toBeNull();
    expect(screen.getByText('{{title}}').tagName.toLowerCase()).toBe('code');
  });

  it('renders js code fences through HighlightedCode', () => {
    md('```js\nconst x = 1;\n```');
    expect(document.querySelector('pre')?.textContent).toContain('const x = 1;');
  });

  it('renders images as captioned figures and opens a lightbox on click', () => {
    md('![Toolbar](/docs-assets/editor/toolbar.png "The editor toolbar")');
    expect(screen.getByText('The editor toolbar')).toBeInTheDocument();
    const img = screen.getByAltText('Toolbar');
    expect(img).toHaveAttribute('loading', 'lazy');
    fireEvent.click(img);
    expect(document.querySelector('[data-lightbox]')).toBeTruthy();
    fireEvent.click(document.querySelector('[data-lightbox]')!);
    expect(document.querySelector('[data-lightbox]')).toBeNull();
  });

  it('badges animated clips', () => {
    md('![Drag](/docs-assets/editor/clip-drag-create.webp "Dragging out a rectangle")');
    expect(screen.getByText('clip')).toBeInTheDocument();
  });

  it('renders internal links as router links and external links with target=_blank', () => {
    md('[Grids](/docs/editor/grids-sources) and [Ko-fi](https://ko-fi.com/x)');
    expect(screen.getByText('Grids').closest('a')).toHaveAttribute('href', '/docs/editor/grids-sources');
    expect(screen.getByText('Ko-fi').closest('a')).toHaveAttribute('target', '_blank');
  });

  it('wraps tables for horizontal scroll', () => {
    md('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(document.querySelector('.overflow-x-auto table')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsMarkdown.test.tsx`
Expected: FAIL — cannot resolve `../../components/docs/DocsMarkdown`.

- [ ] **Step 3: Implement `components/docs/DocsMarkdown.tsx`**

```tsx
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { Lightbulb, Info, AlertTriangle } from 'lucide-react';
import { HighlightedCode } from '../HighlightedCode';
import { slugifyHeading } from '../../lib/docsContent';

// Recursively extract the plain text of a React node tree.
const textOf = (node: React.ReactNode): string => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
    return '';
};

const CALLOUTS = {
    tip: { marker: '[!TIP]', icon: Lightbulb, cls: 'bg-green-50 border-green-200 text-green-900', iconCls: 'text-green-600' },
    note: { marker: '[!NOTE]', icon: Info, cls: 'bg-blue-50 border-blue-200 text-blue-900', iconCls: 'text-blue-600' },
    warning: { marker: '[!WARNING]', icon: AlertTriangle, cls: 'bg-amber-50 border-amber-300 text-amber-900', iconCls: 'text-amber-600' },
} as const;

// Remove the leading "[!TIP]" marker text (and a following soft-break) from
// the blockquote's first paragraph.
const stripMarker = (node: React.ReactNode, marker: string): React.ReactNode => {
    let stripped = false;
    const walk = (n: React.ReactNode): React.ReactNode => {
        if (stripped) return n;
        if (typeof n === 'string') {
            const i = n.indexOf(marker);
            if (i !== -1) { stripped = true; return n.slice(0, i) + n.slice(i + marker.length).replace(/^\s*\n?/, ''); }
            return n;
        }
        if (Array.isArray(n)) return n.map(walk);
        if (React.isValidElement(n)) {
            const props = n.props as { children?: React.ReactNode };
            return React.cloneElement(n, undefined, walk(props.children));
        }
        return n;
    };
    return walk(node);
};

const Heading = (Tag: 'h2' | 'h3' | 'h4') => {
    const H: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
        const id = slugifyHeading(textOf(children));
        return <Tag id={id} className="group scroll-mt-20">
            {children}
            <a href={`#${id}`} className="ml-2 opacity-0 group-hover:opacity-60 text-blue-500 no-underline text-sm align-middle" aria-label="Link to section">#</a>
        </Tag>;
    };
    return H;
};

const DocsFigure: React.FC<{ src?: string; alt?: string; title?: string }> = ({ src = '', alt = '', title }) => {
    const [open, setOpen] = useState(false);
    const isClip = /\/clip-[^/]+\.webp$/.test(src);
    return (
        <figure className="my-6 not-prose">
            <div className="relative inline-block max-w-full">
                <img
                    src={src} alt={alt} loading="lazy"
                    onClick={() => setOpen(true)}
                    className="rounded-xl border border-slate-200 shadow-sm max-w-full cursor-zoom-in"
                />
                {isClip && <span className="absolute top-2 right-2 bg-slate-900/70 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">clip</span>}
            </div>
            {(title || alt) && <figcaption className="text-sm text-slate-500 mt-2">{title || alt}</figcaption>}
            {open && (
                <div data-lightbox onClick={() => setOpen(false)}
                    className="fixed inset-0 z-[100] bg-slate-900/80 flex items-center justify-center p-6 cursor-zoom-out">
                    <img src={src} alt={alt} className="max-w-full max-h-full rounded-lg shadow-2xl" />
                </div>
            )}
        </figure>
    );
};

export function DocsMarkdown({ markdown }: { markdown: string }) {
    return (
        <div className="prose prose-slate max-w-none prose-p:leading-7 prose-li:leading-7 prose-headings:font-bold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
            <ReactMarkdown
                components={{
                    h2: Heading('h2'),
                    h3: Heading('h3'),
                    h4: Heading('h4'),
                    img: ({ src, alt, title }) => <DocsFigure src={typeof src === 'string' ? src : ''} alt={alt ?? ''} title={title ?? undefined} />,
                    // react-markdown wraps a lone image in <p>; keep <figure> valid by
                    // unwrapping paragraphs whose only child is our figure.
                    p: ({ children }) => {
                        const arr = React.Children.toArray(children);
                        if (arr.length === 1 && React.isValidElement(arr[0]) && (arr[0].type === DocsFigure)) return <>{arr}</>;
                        return <p>{children}</p>;
                    },
                    blockquote: ({ children }) => {
                        const text = textOf(children).trim();
                        for (const [kind, c] of Object.entries(CALLOUTS)) {
                            if (text.startsWith(c.marker)) {
                                const Icon = c.icon;
                                return (
                                    <aside data-callout={kind} className={`not-prose my-6 border rounded-xl p-4 flex gap-3 ${c.cls}`}>
                                        <Icon size={20} className={`flex-shrink-0 mt-0.5 ${c.iconCls}`} />
                                        <div className="text-sm leading-6 [&>p]:m-0 [&>p+p]:mt-2">{stripMarker(children, c.marker)}</div>
                                    </aside>
                                );
                            }
                        }
                        return <blockquote>{children}</blockquote>;
                    },
                    code: ({ className, children }) => {
                        const text = String(children ?? '');
                        const isBlock = className != null || text.includes('\n');
                        if (!isBlock) {
                            if (text.startsWith('kbd:')) {
                                return <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700 shadow-[0_1px_0_rgba(0,0,0,0.15)]">{text.slice(4)}</kbd>;
                            }
                            return <code>{children}</code>;
                        }
                        const lang = /language-(\w+)/.exec(className ?? '')?.[1];
                        const code = text.replace(/\n$/, '');
                        return (
                            <pre className="not-prose bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto my-6">
                                {lang === 'js' || lang === 'javascript' || lang === 'ts'
                                    ? <HighlightedCode code={code} />
                                    : <code>{code}</code>}
                            </pre>
                        );
                    },
                    pre: ({ children }) => <>{children}</>, // code renderer emits its own <pre>
                    a: ({ href = '', children }) => {
                        if (href.startsWith('/')) return <Link to={href}>{children}</Link>;
                        if (href.startsWith('#')) return <a href={href}>{children}</a>;
                        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                    },
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-6 border border-slate-200 rounded-xl not-prose">
                            <table className="w-full text-sm [&_th]:bg-slate-50 [&_th]:text-left [&_th]:font-semibold [&_th]:text-slate-600 [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 [&_td]:border-t [&_td]:border-slate-100 [&_td]:text-slate-600 [&_td]:align-top">{children}</table>
                        </div>
                    ),
                }}
            >
                {markdown}
            </ReactMarkdown>
        </div>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsMarkdown.test.tsx`
Expected: PASS. If the `p`-unwrap test setup complains about `arr[0].type === DocsFigure` (component identity through react-markdown), adjust the check to `React.isValidElement(arr[0]) && typeof arr[0].type !== 'string'` — the intent is only to avoid `<figure>` inside `<p>`.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — expected green.

```bash
git add components/docs/DocsMarkdown.tsx tests/unit/docsMarkdown.test.tsx
git commit -m "feat: docs markdown renderer with callouts, kbd chips, lightbox figures"
```

---

### Task 4: Docs shell — routes, layout, home page; retire old DocsPage

**Files:**
- Create: `pages/docs/DocsSection.tsx`, `pages/docs/DocsLayout.tsx`, `pages/docs/DocsHomePage.tsx`, `pages/docs/docsUi.tsx`
- Modify: `App.tsx` (route swap at line 42, import swap at line 6)
- Delete: `pages/DocsPage.tsx`
- Test: `tests/unit/docsSection.test.tsx`

**Interfaces:**
- Consumes: `docsIndex` from `lib/docsContentIndex`; `TRACK_ORDER`, `TRACK_LABELS`, `DocTutorial` from `lib/docsContent`; existing `components/AppHeader.tsx` (`<AppHeader />`, sticky, needs `shrink-0`-safe flex parent).
- Produces:
  - `export function DocsSection()` — mounted at `/docs/*` in App.tsx.
  - `pages/docs/docsUi.tsx`: `export const DifficultyBadge: React.FC<{ level: DocDifficulty }>`; `export const TRACK_DESCRIPTIONS: Record<DocTrack, string>`; `export function tutorialUrl(t: DocTutorial): string` (returns `/docs/${t.track}/${t.slug}`).
  - `DocsLayout` renders `<Outlet />` inside the scroll container and owns scroll restoration: on pathname change scroll top; when `location.hash` set, `scrollIntoView` the element.
  - Placeholder slot: `DocsLayout` renders a `<div data-docs-search-slot>` at the top of the sidebar; Task 8 replaces it with `<DocsSearchBox/>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsSection.test.tsx`. Mock the content index with a fixture so tests don't depend on real content:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { parseDocsContent } from '../../lib/docsContent';

const fixtureFiles: Record<string, string> = {
  '../docs-content/tutorials/getting-started/01-what-is-it.md':
    '---\ntitle: What Is PDF Architect\ndifficulty: beginner\ntime: 5 min\nsummary: The mental model.\n---\n\n## Nodes\n\nIntro.\n',
  '../docs-content/tutorials/editor/01-canvas-basics.md':
    '---\ntitle: Canvas Basics\ndifficulty: beginner\ntime: 8 min\nsummary: Tools and navigation.\n---\n\n## Toolbar\n\nBody.\n',
  '../docs-content/tutorials/editor/02-grids.md':
    '---\ntitle: Grids\ndifficulty: intermediate\ntime: 10 min\nsummary: Data grids.\nprerequisites: editor/canvas-basics\n---\n\n## Sources\n\nBody.\n',
  '../docs-content/reference/grid/dynamic-offset.md':
    '---\ntitle: Dynamic Offset\nsummary: Field-driven offset.\naliases: calendar offset\n---\n\nOffset body.\n',
};

vi.mock('../../lib/docsContentIndex', () => ({
  docsIndex: parseDocsContent(fixtureFiles),
  docsContentFiles: fixtureFiles,
}));

import { DocsSection } from '../../pages/docs/DocsSection';

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/docs/*" element={<DocsSection />} /></Routes>
  </MemoryRouter>
);

describe('DocsSection routing', () => {
  it('renders the home page at /docs with track sections', () => {
    at('/docs');
    expect(screen.getByRole('heading', { name: /documentation/i })).toBeInTheDocument();
    expect(screen.getAllByText('Canvas Basics').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Getting Started/).length).toBeGreaterThan(0);
  });
  it('renders a tutorial page at /docs/:track/:slug', () => {
    at('/docs/editor/canvas-basics');
    expect(screen.getByRole('heading', { level: 1, name: 'Canvas Basics' })).toBeInTheDocument();
    expect(screen.getByText(/8 min/)).toBeInTheDocument();
  });
  it('shows a not-found panel for unknown tutorials', () => {
    at('/docs/editor/nope');
    expect(screen.getByText(/couldn.t find|not found/i)).toBeInTheDocument();
  });
  it('renders sidebar navigation links for every tutorial', () => {
    at('/docs');
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveTextContent('Canvas Basics');
    expect(nav).toHaveTextContent('Grids');
    expect(nav).toHaveTextContent('Reference');
  });
});
```

(The tutorial-page assertions pass once Task 5 lands `DocsTutorialPage`; for this task, `DocsSection` routes `:track/:slug` to a minimal `DocsTutorialPage` created in Task 5. To keep Task 4 self-contained and green, create `DocsTutorialPage` here as a stub that renders the h1 title, time badge, and body via `DocsMarkdown` — Task 5 then grows it to full behavior with its own tests. This is a deliberate thin-slice, not a placeholder: the stub is real, tested behavior.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsSection.test.tsx`
Expected: FAIL — cannot resolve `../../pages/docs/DocsSection`.

- [ ] **Step 3: Implement `pages/docs/docsUi.tsx`**

```tsx
import React from 'react';
import type { DocDifficulty, DocTrack, DocTutorial } from '../../lib/docsContent';

const DIFF_STYLES: Record<DocDifficulty, string> = {
    beginner: 'bg-green-50 text-green-700 border-green-200',
    intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
    advanced: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const DifficultyBadge: React.FC<{ level: DocDifficulty }> = ({ level }) => (
    <span className={`inline-block text-[11px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${DIFF_STYLES[level]}`}>{level}</span>
);

export const TRACK_DESCRIPTIONS: Record<DocTrack, string> = {
    'getting-started': 'What PDF Architect is and your first document — start here.',
    editor: 'Every canvas tool, panel, and shortcut, from first click to overlapped-stack selection.',
    generator: 'Build entire documents in code — from first script to full dated planners.',
    gallery: 'Browse, publish, fork, and merge — with or without an account.',
};

export const tutorialUrl = (t: DocTutorial): string => `/docs/${t.track}/${t.slug}`;
```

- [ ] **Step 4: Implement `pages/docs/DocsLayout.tsx`**

```tsx
import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { docsIndex } from '../../lib/docsContentIndex';
import { TRACK_ORDER, TRACK_LABELS } from '../../lib/docsContent';
import { tutorialUrl } from './docsUi';

export function DocsLayout() {
    const location = useLocation();
    const mainRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (location.hash) {
            document.getElementById(location.hash.slice(1))?.scrollIntoView();
        } else {
            mainRef.current?.scrollTo(0, 0);
        }
    }, [location.pathname, location.hash]);

    return (
        <div className="h-screen w-full bg-white text-slate-900 font-sans flex flex-col overflow-hidden">
            <AppHeader />
            <div className="flex flex-1 min-h-0 max-w-[1400px] mx-auto w-full">
                <aside className="w-72 hidden md:flex flex-col border-r bg-slate-50/50 flex-shrink-0">
                    <div className="p-4 border-b" data-docs-search-slot />
                    <nav role="navigation" className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
                        <NavLink to="/docs" end className={({ isActive }) => `block font-semibold px-2 py-1.5 rounded-lg ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-white'}`}>
                            <span className="flex items-center gap-2"><BookOpen size={15} /> Learning Path</span>
                        </NavLink>
                        {TRACK_ORDER.map(track => {
                            const tuts = docsIndex.tutorials.filter(t => t.track === track);
                            if (!tuts.length) return null;
                            return (
                                <div key={track}>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">{TRACK_LABELS[track]}</div>
                                    {tuts.map(t => (
                                        <NavLink key={t.slug} to={tutorialUrl(t)} className={({ isActive }) => `block px-2 py-1.5 rounded-lg truncate ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                                            <span className="text-slate-400 mr-1.5">{t.order}.</span>{t.title}
                                        </NavLink>
                                    ))}
                                </div>
                            );
                        })}
                        <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Lookup</div>
                            <NavLink to="/docs/reference" className={({ isActive }) => `block px-2 py-1.5 rounded-lg ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-white'}`}>Reference</NavLink>
                        </div>
                    </nav>
                </aside>
                <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Implement `pages/docs/DocsHomePage.tsx`**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Layers, Wand2, Globe, Search } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { TRACK_ORDER, TRACK_LABELS, type DocTrack } from '../../lib/docsContent';
import { DifficultyBadge, TRACK_DESCRIPTIONS, tutorialUrl } from './docsUi';

const TRACK_ICONS: Record<DocTrack, React.FC<{ size?: number; className?: string }>> = {
    'getting-started': BookOpen, editor: Layers, generator: Wand2, gallery: Globe,
};

export function DocsHomePage() {
    return (
        <div className="p-8 md:p-14 max-w-5xl">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Documentation</h1>
            <p className="text-lg text-slate-500 leading-relaxed mb-10 max-w-3xl">
                Tutorials ordered from first click to advanced techniques, plus a searchable reference of
                every tool, option, and shortcut. Follow the path below in order, or jump straight to the
                track you need.
            </p>

            <div className="space-y-10">
                {TRACK_ORDER.map((track, i) => {
                    const tuts = docsIndex.tutorials.filter(t => t.track === track);
                    const Icon = TRACK_ICONS[track];
                    return (
                        <section key={track}>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">{i + 1}</div>
                                <h2 className="text-2xl font-bold flex items-center gap-2"><Icon size={22} className="text-blue-500" /> {TRACK_LABELS[track]}</h2>
                            </div>
                            <p className="text-slate-500 mb-4 ml-11">{TRACK_DESCRIPTIONS[track]}</p>
                            <div className="ml-11 grid sm:grid-cols-2 gap-3">
                                {tuts.map(t => (
                                    <Link key={t.slug} to={tutorialUrl(t)} className="group border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all bg-white">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-mono text-slate-400">{t.order.toString().padStart(2, '0')}</span>
                                            <DifficultyBadge level={t.difficulty} />
                                        </div>
                                        <div className="font-semibold text-slate-800 group-hover:text-blue-700">{t.title}</div>
                                        <div className="text-sm text-slate-500 mt-1 line-clamp-2">{t.summary}</div>
                                        <div className="text-xs text-slate-400 mt-2">{t.time}</div>
                                    </Link>
                                ))}
                                {!tuts.length && <div className="text-sm text-slate-400 italic">Tutorials landing soon.</div>}
                            </div>
                        </section>
                    );
                })}
            </div>

            <Link to="/docs/reference" className="mt-12 flex items-center gap-4 border border-slate-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-md transition-all bg-slate-50/50">
                <div className="p-3 bg-blue-100 rounded-xl text-blue-600"><Search size={24} /></div>
                <div className="flex-1">
                    <div className="font-bold text-lg text-slate-900">Reference</div>
                    <div className="text-slate-500 text-sm">Every tool, grid option, link target, formula, and shortcut — one indexed entry each, searchable from any docs page.</div>
                </div>
                <ArrowRight className="text-slate-400" />
            </Link>
        </div>
    );
}
```

- [ ] **Step 6: Implement `pages/docs/DocsSection.tsx` (+ tutorial-page thin slice, + not-found)**

```tsx
import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { DocsLayout } from './DocsLayout';
import { DocsHomePage } from './DocsHomePage';
import { DocsTutorialPage } from './DocsTutorialPage';

export function DocsNotFound() {
    return (
        <div className="p-14">
            <h1 className="text-2xl font-bold mb-2">We couldn't find that page</h1>
            <p className="text-slate-500 mb-4">The link may be outdated.</p>
            <Link to="/docs" className="text-blue-600 font-medium">Back to the documentation home</Link>
        </div>
    );
}

export function DocsSection() {
    return (
        <Routes>
            <Route element={<DocsLayout />}>
                <Route index element={<DocsHomePage />} />
                <Route path=":track/:slug" element={<DocsTutorialPage />} />
                <Route path="*" element={<DocsNotFound />} />
            </Route>
        </Routes>
    );
}
```

And the Task-4 thin slice of `pages/docs/DocsTutorialPage.tsx` (grown in Task 5):

```tsx
import React from 'react';
import { useParams } from 'react-router-dom';
import { docsIndex } from '../../lib/docsContentIndex';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';
import { DifficultyBadge } from './docsUi';
import { DocsNotFound } from './DocsSection';

export function DocsTutorialPage() {
    const { track = '', slug = '' } = useParams();
    const tutorial = docsIndex.tutorialByPath.get(`${track}/${slug}`);
    if (!tutorial) return <DocsNotFound />;
    return (
        <article className="p-8 md:p-14 max-w-4xl">
            <h1 className="text-4xl font-extrabold tracking-tight mb-3">{tutorial.title}</h1>
            <div className="flex items-center gap-3 mb-8 text-sm text-slate-500">
                <DifficultyBadge level={tutorial.difficulty} />
                <span>{tutorial.time}</span>
            </div>
            <DocsMarkdown markdown={tutorial.body} />
        </article>
    );
}
```

(If `DocsSection.tsx` importing `DocsTutorialPage` while `DocsTutorialPage` imports `DocsNotFound` from `DocsSection.tsx` creates a circular-import warning, move `DocsNotFound` into `docsUi.tsx` and update both imports.)

- [ ] **Step 7: Swap the route in `App.tsx` and delete the old page**

In `App.tsx`: replace line 6 `import { DocsPage } from './pages/DocsPage';` with `import { DocsSection } from './pages/docs/DocsSection';` and line 42 `<Route path="/docs" element={<DocsPage />} />` with `<Route path="/docs/*" element={<DocsSection />} />`. Then:

```bash
git rm pages/DocsPage.tsx
grep -rn "DocsPage" --include="*.ts*" . --exclude-dir=node_modules --exclude-dir=dist
```

Expected: no remaining references except possibly comments/tests. `components/AppHeader.tsx:29` mentions DocsPage in a comment — update the comment wording to "docs pages". If any test file references `DocsPage` (check `tests/unit/appHeaderAdoption.test.tsx`), update it to import `DocsSection` and render it at `/docs` inside a `MemoryRouter` with the same assertions about the shared header.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsSection.test.tsx`
Expected: PASS.

- [ ] **Step 9: Full suite + visual smoke + commit**

Run: `npx vitest run` — green, including any updated header-adoption tests.
Then boot the app (`npm run dev`, or rely on an already-running dev server) and load `http://localhost:3000/docs` — expect the new home with the four numbered track sections ("Tutorials landing soon." placeholders are fine at this stage).

```bash
git add App.tsx pages/docs/ tests/unit/docsSection.test.tsx components/AppHeader.tsx
git commit -m "feat: docs section shell - routes, layout, learning-path home"
```

---

### Task 5: Full tutorial page — TOC, prev/next, prerequisites, breadcrumbs

**Files:**
- Modify: `pages/docs/DocsTutorialPage.tsx` (grow the Task-4 thin slice)
- Test: `tests/unit/docsTutorialPage.test.tsx`

**Interfaces:**
- Consumes: `docsIndex`, `TRACK_LABELS`, `slugifyHeading`, `DifficultyBadge`, `tutorialUrl`, `DocsMarkdown`.
- Produces: the finished `DocsTutorialPage` used by `DocsSection` (no signature change).

**Behavior contract:**
- Breadcrumbs: `Docs / <Track label> / <Title>` — first two are links (`/docs`, first tutorial of track).
- Prerequisite chips under the header: each links to its tutorial, labeled with that tutorial's title.
- TOC ("On this page"): all `##` and `###` headings from the body, indented by level, as `#anchor` links using `slugifyHeading`; hidden below `xl`.
- Prev/next footer cards within the same track ordered by `order`; absent at the ends.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsTutorialPage.test.tsx` (reuse the exact `vi.mock` fixture block from `tests/unit/docsSection.test.tsx` — same `fixtureFiles`, same mock of `../../lib/docsContentIndex`):

```tsx
// ...same fixtureFiles + vi.mock('../../lib/docsContentIndex', ...) as docsSection.test.tsx...
import { DocsSection } from '../../pages/docs/DocsSection';

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/docs/*" element={<DocsSection />} /></Routes>
  </MemoryRouter>
);

describe('DocsTutorialPage', () => {
  it('renders breadcrumbs with track label', () => {
    at('/docs/editor/canvas-basics');
    expect(screen.getByText('Editor', { selector: 'a, span' })).toBeInTheDocument();
  });
  it('links prerequisites by title', () => {
    at('/docs/editor/grids');
    const chip = screen.getByRole('link', { name: /Canvas Basics/ });
    expect(chip).toHaveAttribute('href', '/docs/editor/canvas-basics');
  });
  it('renders a TOC entry per ## heading', () => {
    at('/docs/editor/canvas-basics');
    const toc = screen.getByLabelText('On this page');
    expect(toc).toHaveTextContent('Toolbar');
  });
  it('renders next link to the following tutorial in the track', () => {
    at('/docs/editor/canvas-basics');
    expect(screen.getByRole('link', { name: /Grids/ })).toHaveAttribute('href', '/docs/editor/grids');
  });
  it('renders prev link and no next at the end of a track', () => {
    at('/docs/editor/grids');
    expect(screen.getAllByRole('link', { name: /Canvas Basics/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Next$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsTutorialPage.test.tsx`
Expected: FAIL — TOC label / prereq chips / prev-next not rendered by the thin slice.

- [ ] **Step 3: Grow `pages/docs/DocsTutorialPage.tsx`**

```tsx
import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { TRACK_LABELS, slugifyHeading } from '../../lib/docsContent';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';
import { DifficultyBadge, tutorialUrl } from './docsUi';
import { DocsNotFound } from './DocsSection';

export function DocsTutorialPage() {
    const { track = '', slug = '' } = useParams();
    const tutorial = docsIndex.tutorialByPath.get(`${track}/${slug}`);

    const trackTutorials = useMemo(
        () => docsIndex.tutorials.filter(t => t.track === track),
        [track]);
    const headings = useMemo(() => {
        if (!tutorial) return [];
        return [...tutorial.body.matchAll(/^(##|###)\s+(.+)$/gm)]
            .map(m => ({ depth: m[1].length, text: m[2].replace(/[`*]/g, ''), anchor: slugifyHeading(m[2]) }));
    }, [tutorial]);

    if (!tutorial) return <DocsNotFound />;
    const i = trackTutorials.indexOf(tutorial);
    const prev = i > 0 ? trackTutorials[i - 1] : null;
    const next = i < trackTutorials.length - 1 ? trackTutorials[i + 1] : null;

    return (
        <div className="flex">
            <article className="p-8 md:p-14 max-w-4xl min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-6">
                    <Link to="/docs" className="hover:text-blue-600">Docs</Link>
                    <ChevronRight size={14} />
                    <span>{TRACK_LABELS[tutorial.track]}</span>
                    <ChevronRight size={14} />
                    <span className="text-slate-800 font-medium truncate">{tutorial.title}</span>
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight mb-3">{tutorial.title}</h1>
                <p className="text-lg text-slate-500 mb-4">{tutorial.summary}</p>
                <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-slate-500">
                    <DifficultyBadge level={tutorial.difficulty} />
                    <span>{tutorial.time}</span>
                </div>
                {tutorial.prerequisites.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-8 text-sm">
                        <span className="text-slate-400 font-medium">Before this:</span>
                        {tutorial.prerequisites.map(p => {
                            const target = docsIndex.tutorialByPath.get(p);
                            return target ? (
                                <Link key={p} to={tutorialUrl(target)} className="bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-full px-3 py-1">{target.title}</Link>
                            ) : null;
                        })}
                    </div>
                )}
                <DocsMarkdown markdown={tutorial.body} />
                <div className="mt-14 pt-8 border-t flex gap-4">
                    {prev && (
                        <Link to={tutorialUrl(prev)} className="flex-1 border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm group">
                            <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><ArrowLeft size={12} /> Previous</div>
                            <div className="font-semibold text-slate-800 group-hover:text-blue-700">{prev.title}</div>
                        </Link>
                    )}
                    {next && (
                        <Link to={tutorialUrl(next)} className="flex-1 border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm text-right group">
                            <div className="text-xs text-slate-400 flex items-center justify-end gap-1 mb-1">Next <ArrowRight size={12} /></div>
                            <div className="font-semibold text-slate-800 group-hover:text-blue-700">{next.title}</div>
                        </Link>
                    )}
                </div>
            </article>
            {headings.length > 1 && (
                <nav aria-label="On this page" className="hidden xl:block w-56 flex-shrink-0 pr-8 pt-14">
                    <div className="sticky top-6 text-sm">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">On this page</div>
                        {headings.map(h => (
                            <a key={h.anchor} href={`#${h.anchor}`} className={`block py-1 text-slate-500 hover:text-blue-600 truncate ${h.depth === 3 ? 'pl-4' : ''}`}>{h.text}</a>
                        ))}
                    </div>
                </nav>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsTutorialPage.test.tsx tests/unit/docsSection.test.tsx`
Expected: PASS (both files).

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — green.

```bash
git add pages/docs/DocsTutorialPage.tsx tests/unit/docsTutorialPage.test.tsx
git commit -m "feat: tutorial page with TOC, prerequisites, breadcrumbs, prev/next"
```

---

### Task 6: Search library (weighted reference + full-text)

**Files:**
- Create: `lib/docsSearch.ts`
- Test: `tests/unit/docsSearch.test.ts`

**Interfaces:**
- Consumes: `DocsIndex`, `TRACK_LABELS`, `CATEGORY_LABELS`, `slugifyHeading` from `lib/docsContent`; `docsIndex` from `lib/docsContentIndex` (only inside `getDefaultSearchIndex`).
- Produces:

```ts
export interface DocsSearchResult { type: 'reference' | 'tutorial'; title: string; url: string; badge: string; snippet: string; score: number; }
export interface DocsSearchIndex { docs: IndexedDoc[] } // opaque to callers
export function buildDocsSearchIndex(index: DocsIndex): DocsSearchIndex;
export function searchDocs(sIdx: DocsSearchIndex, query: string, limit?: number): DocsSearchResult[]; // limit default 10
export function getDefaultSearchIndex(): DocsSearchIndex; // lazy singleton over the real docsIndex
```

**Scoring contract (tested):** phrase-in-title +30 · title token exact +12 / prefix +10 · alias phrase exact +25 / contains +15 · keyword exact +8 · heading token +5 (first matching heading's anchor appended to a tutorial's url) · body token exact +2. Reference results ×1.25 at the end. Ties: reference before tutorial, then title A→Z. Empty/whitespace query → `[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsSearch.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsSearch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/docsSearch.ts`**

```ts
import {
    type DocsIndex, TRACK_LABELS, CATEGORY_LABELS, slugifyHeading,
} from './docsContent';

export interface DocsSearchResult {
    type: 'reference' | 'tutorial';
    title: string;
    url: string;
    badge: string;
    snippet: string;
    score: number;
}

interface IndexedDoc {
    type: 'reference' | 'tutorial';
    title: string;
    titleLower: string;
    titleTokens: string[];
    url: string;
    badge: string;
    snippet: string;
    aliases: string[];        // lowercased
    keywords: string[];       // lowercased tokens
    headings: { anchor: string; tokens: string[] }[];
    bodyTokens: Set<string>;
}

export interface DocsSearchIndex { docs: IndexedDoc[] }

const tokenize = (s: string): string[] =>
    s.toLowerCase().split(/[^a-z0-9_{}]+/).filter(Boolean);

export function buildDocsSearchIndex(index: DocsIndex): DocsSearchIndex {
    const docs: IndexedDoc[] = [];
    for (const e of index.referenceEntries) {
        docs.push({
            type: 'reference',
            title: e.title,
            titleLower: e.title.toLowerCase(),
            titleTokens: tokenize(e.title),
            url: `/docs/reference/${e.slug}`,
            badge: CATEGORY_LABELS[e.category] ?? e.category,
            snippet: e.summary,
            aliases: e.aliases.map(a => a.toLowerCase()),
            keywords: e.keywords.flatMap(tokenize),
            headings: [],
            bodyTokens: new Set(tokenize(e.body)),
        });
    }
    for (const t of index.tutorials) {
        const headings = [...t.body.matchAll(/^#{2,4}\s+(.+)$/gm)]
            .map(m => ({ anchor: slugifyHeading(m[1]), tokens: tokenize(m[1]) }));
        docs.push({
            type: 'tutorial',
            title: t.title,
            titleLower: t.title.toLowerCase(),
            titleTokens: tokenize(t.title),
            url: `/docs/${t.track}/${t.slug}`,
            badge: TRACK_LABELS[t.track],
            snippet: t.summary,
            aliases: [],
            keywords: t.keywords.flatMap(tokenize),
            headings,
            bodyTokens: new Set(tokenize(t.body)),
        });
    }
    return { docs };
}

export function searchDocs(sIdx: DocsSearchIndex, query: string, limit = 10): DocsSearchResult[] {
    const phrase = query.trim().toLowerCase();
    if (!phrase) return [];
    const qTokens = tokenize(phrase);
    if (!qTokens.length) return [];

    const results: DocsSearchResult[] = [];
    for (const d of sIdx.docs) {
        let score = 0;
        let anchor: string | null = null;

        if (d.titleLower.includes(phrase)) score += 30;
        for (const a of d.aliases) {
            if (a === phrase) score += 25;
            else if (a.includes(phrase) || phrase.includes(a)) score += 15;
        }
        for (const q of qTokens) {
            for (const t of d.titleTokens) {
                if (t === q) { score += 12; break; }
                if (t.startsWith(q)) { score += 10; break; }
            }
            if (d.keywords.includes(q)) score += 8;
            for (const h of d.headings) {
                if (h.tokens.some(t => t === q || t.startsWith(q))) {
                    score += 5;
                    if (!anchor) anchor = h.anchor;
                    break;
                }
            }
            if (d.bodyTokens.has(q)) score += 2;
        }
        if (score <= 0) continue;
        if (d.type === 'reference') score *= 1.25;
        results.push({
            type: d.type,
            title: d.title,
            url: anchor && d.type === 'tutorial' ? `${d.url}#${anchor}` : d.url,
            badge: d.badge,
            snippet: d.snippet,
            score,
        });
    }
    results.sort((a, b) =>
        b.score - a.score
        || (a.type === b.type ? 0 : a.type === 'reference' ? -1 : 1)
        || a.title.localeCompare(b.title));
    return results.slice(0, limit);
}

let defaultIndex: DocsSearchIndex | null = null;
export function getDefaultSearchIndex(): DocsSearchIndex {
    if (!defaultIndex) {
        // Lazy so the tokenize pass runs only when search is first used.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { docsIndex } = require('./docsContentIndex') as typeof import('./docsContentIndex');
        defaultIndex = buildDocsSearchIndex(docsIndex);
    }
    return defaultIndex;
}
```

**Note:** if `require` is unavailable under Vite ESM, replace `getDefaultSearchIndex` with a top-level `import { docsIndex } from './docsContentIndex'` and `export function getDefaultSearchIndex() { if (!defaultIndex) defaultIndex = buildDocsSearchIndex(docsIndex); return defaultIndex; }` — the laziness that matters is the index build, not the module import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — green.

```bash
git add lib/docsSearch.ts tests/unit/docsSearch.test.ts
git commit -m "feat: weighted docs search over reference entries and tutorial full-text"
```

---

### Task 7: Reference index + entry pages

**Files:**
- Create: `pages/docs/DocsReferenceIndexPage.tsx`, `pages/docs/DocsReferenceEntryPage.tsx`
- Modify: `pages/docs/DocsSection.tsx` (add the two routes)
- Test: `tests/unit/docsReferencePages.test.tsx`

**Interfaces:**
- Consumes: `docsIndex`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `buildDocsSearchIndex`/`searchDocs` (instant filter), `DocsMarkdown`, `tutorialUrl`.
- Produces: routes `/docs/reference` and `/docs/reference/:slug` inside `DocsSection`:

```tsx
<Route path="reference" element={<DocsReferenceIndexPage />} />
<Route path="reference/:slug" element={<DocsReferenceEntryPage />} />
```
(placed BEFORE the `:track/:slug` route so `reference` never matches as a track).

**Behavior contract:**
- Index page: entries grouped by category in `CATEGORY_ORDER`; a filter input (`placeholder="Filter reference…"`) that narrows the grid live using `searchDocs` over a reference-only index; each card links to its entry and shows title + summary + aliases.
- Entry page: title, category badge, "Also known as: …" alias line when present, body via `DocsMarkdown`, and an "Appears in" section linking every tutorial whose body references `/docs/reference/<slug>`; 404 panel for unknown slugs.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsReferencePages.test.tsx` (same `vi.mock` fixture pattern as `docsSection.test.tsx`, with fixture extended so one tutorial's body contains a link to `/docs/reference/dynamic-offset`):

```tsx
// fixtureFiles: reuse the docsSection.test.tsx block, but change the editor/02-grids.md body to:
// '## Sources\n\nSee [Dynamic Offset](/docs/reference/dynamic-offset).\n'
// and keep reference/grid/dynamic-offset.md as before.

describe('DocsReferenceIndexPage', () => {
  it('groups entries by category label', () => {
    at('/docs/reference');
    expect(screen.getByText('Grid Configuration')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dynamic Offset/ })).toHaveAttribute('href', '/docs/reference/dynamic-offset');
  });
  it('filters entries live', () => {
    at('/docs/reference');
    fireEvent.change(screen.getByPlaceholderText(/filter reference/i), { target: { value: 'zzz-no-match' } });
    expect(screen.queryByRole('link', { name: /Dynamic Offset/ })).not.toBeInTheDocument();
  });
});

describe('DocsReferenceEntryPage', () => {
  it('renders entry with alias line and body', () => {
    at('/docs/reference/dynamic-offset');
    expect(screen.getByRole('heading', { level: 1, name: 'Dynamic Offset' })).toBeInTheDocument();
    expect(screen.getByText(/calendar offset/)).toBeInTheDocument();
  });
  it('lists tutorials that reference the entry under "Appears in"', () => {
    at('/docs/reference/dynamic-offset');
    expect(screen.getByText(/appears in/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Grids/ })).toHaveAttribute('href', '/docs/editor/grids');
  });
  it('404s unknown entries', () => {
    at('/docs/reference/nope');
    expect(screen.getByText(/couldn.t find|not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsReferencePages.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both pages**

`pages/docs/DocsReferenceIndexPage.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { CATEGORY_ORDER, CATEGORY_LABELS } from '../../lib/docsContent';
import { buildDocsSearchIndex, searchDocs } from '../../lib/docsSearch';

export function DocsReferenceIndexPage() {
    const [q, setQ] = useState('');
    const refSearchIndex = useMemo(() => buildDocsSearchIndex({
        ...docsIndex, tutorials: [],
    }), []);
    const visibleSlugs = useMemo(() => {
        if (!q.trim()) return null;
        return new Set(searchDocs(refSearchIndex, q, 200).map(r => r.url.split('/').pop()));
    }, [q, refSearchIndex]);

    return (
        <div className="p-8 md:p-14 max-w-5xl">
            <h1 className="text-4xl font-extrabold tracking-tight mb-3">Reference</h1>
            <p className="text-lg text-slate-500 mb-8 max-w-3xl">One entry per tool, option, formula, and shortcut. Filter below, or use the sidebar search from any docs page.</p>
            <div className="relative mb-10 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter reference…"
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            {CATEGORY_ORDER.map(cat => {
                const entries = docsIndex.referenceEntries.filter(e =>
                    e.category === cat && (!visibleSlugs || visibleSlugs.has(e.slug)));
                if (!entries.length) return null;
                return (
                    <section key={cat} className="mb-10">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">{CATEGORY_LABELS[cat]}</h2>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {entries.map(e => (
                                <Link key={e.slug} to={`/docs/reference/${e.slug}`} className="group border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm bg-white">
                                    <div className="font-semibold text-slate-800 group-hover:text-blue-700">{e.title}</div>
                                    <div className="text-sm text-slate-500 mt-1 line-clamp-2">{e.summary}</div>
                                    {e.aliases.length > 0 && <div className="text-xs text-slate-400 mt-2 italic truncate">aka {e.aliases.join(', ')}</div>}
                                </Link>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
```

`pages/docs/DocsReferenceEntryPage.tsx`:

```tsx
import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { CATEGORY_LABELS } from '../../lib/docsContent';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';
import { tutorialUrl } from './docsUi';
import { DocsNotFound } from './DocsSection';

export function DocsReferenceEntryPage() {
    const { slug = '' } = useParams();
    const entry = docsIndex.referenceBySlug.get(slug);
    const appearsIn = useMemo(() =>
        docsIndex.tutorials.filter(t => t.body.includes(`/docs/reference/${slug}`)), [slug]);

    if (!entry) return <DocsNotFound />;
    return (
        <article className="p-8 md:p-14 max-w-3xl">
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-6">
                <Link to="/docs/reference" className="hover:text-blue-600">Reference</Link>
                <ChevronRight size={14} />
                <span>{CATEGORY_LABELS[entry.category]}</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">{entry.title}</h1>
            {entry.aliases.length > 0 && (
                <p className="text-sm text-slate-400 italic mb-4">Also known as: {entry.aliases.join(', ')}</p>
            )}
            <p className="text-lg text-slate-500 mb-8">{entry.summary}</p>
            <DocsMarkdown markdown={entry.body} />
            {appearsIn.length > 0 && (
                <div className="mt-12 pt-6 border-t">
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Appears in</div>
                    <div className="flex flex-wrap gap-2">
                        {appearsIn.map(t => (
                            <Link key={`${t.track}/${t.slug}`} to={tutorialUrl(t)} className="bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-full px-3 py-1 text-sm">{t.title}</Link>
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
}
```

Add both routes to `DocsSection.tsx` (before `:track/:slug`):

```tsx
<Route path="reference" element={<DocsReferenceIndexPage />} />
<Route path="reference/:slug" element={<DocsReferenceEntryPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsReferencePages.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — green.

```bash
git add pages/docs/DocsReferenceIndexPage.tsx pages/docs/DocsReferenceEntryPage.tsx pages/docs/DocsSection.tsx tests/unit/docsReferencePages.test.tsx
git commit -m "feat: reference index and entry pages with instant filter"
```

---

### Task 8: Search box UI with keyboard navigation

**Files:**
- Create: `components/docs/DocsSearchBox.tsx`
- Modify: `pages/docs/DocsLayout.tsx` (replace `data-docs-search-slot` div with `<DocsSearchBox />`)
- Test: `tests/unit/docsSearchBox.test.tsx`

**Interfaces:**
- Consumes: `getDefaultSearchIndex`, `searchDocs`, `DocsSearchResult` from `lib/docsSearch`; `useNavigate` from react-router-dom.
- Produces: `export function DocsSearchBox()` — self-contained combobox. For testability it accepts an optional prop `searchIndex?: DocsSearchIndex` (defaults to `getDefaultSearchIndex()`).

**Behavior contract (tested):**
- Typing ≥1 non-space char shows a dropdown of up to 8 results, grouped visually by badge chips; no results → "No matches" row.
- `ArrowDown`/`ArrowUp` move the highlight (wrapping); `Enter` navigates to the highlighted result's url and closes; `Escape` closes.
- Global `/` keydown focuses the input unless focus is already in an input/textarea/contenteditable.
- Clicking a result navigates (it's a `<Link>`); clicking outside closes.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/docsSearchBox.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { parseDocsContent } from '../../lib/docsContent';
import { buildDocsSearchIndex } from '../../lib/docsSearch';
import { DocsSearchBox } from '../../components/docs/DocsSearchBox';

const sIdx = buildDocsSearchIndex(parseDocsContent({
  '../docs-content/reference/grid/dynamic-offset.md':
    '---\ntitle: Dynamic Offset\nsummary: Field-driven offset.\naliases: calendar offset\n---\n\nBody.\n',
  '../docs-content/reference/grid/traversal-path.md':
    '---\ntitle: Traversal Path\nsummary: Drill into descendants.\n---\n\nBody.\n',
}));

const LocationProbe = () => <div data-testid="loc">{useLocation().pathname}</div>;

const setup = () => render(
  <MemoryRouter initialEntries={['/docs']}>
    <DocsSearchBox searchIndex={sIdx} />
    <Routes><Route path="*" element={<LocationProbe />} /></Routes>
  </MemoryRouter>
);

describe('DocsSearchBox', () => {
  it('shows results while typing', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'offset' } });
    expect(screen.getByText('Dynamic Offset')).toBeInTheDocument();
  });
  it('navigates with arrow keys + Enter', () => {
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'path' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/traversal-path');
  });
  it('closes on Escape', () => {
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'offset' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Dynamic Offset')).not.toBeInTheDocument();
  });
  it('focuses on global "/" keypress', () => {
    setup();
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByRole('combobox')).toHaveFocus();
  });
  it('shows a no-matches row', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/docsSearchBox.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/docs/DocsSearchBox.tsx`**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getDefaultSearchIndex, searchDocs, type DocsSearchIndex } from '../../lib/docsSearch';

export function DocsSearchBox({ searchIndex }: { searchIndex?: DocsSearchIndex }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const sIdx = useMemo(() => searchIndex ?? getDefaultSearchIndex(), [searchIndex]);
    const results = useMemo(() => searchDocs(sIdx, q, 8), [sIdx, q]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/') return;
            const tag = (document.activeElement?.tagName ?? '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement | null)?.isContentEditable) return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setOpen(false); return; }
        if (!open || !results.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % results.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + results.length) % results.length); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const r = results[highlight];
            if (r) { setOpen(false); setQ(''); navigate(r.url); }
        }
    };

    return (
        <div ref={rootRef} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
                ref={inputRef}
                role="combobox"
                aria-expanded={open && q.trim().length > 0}
                aria-label="Search documentation"
                value={q}
                onChange={e => { setQ(e.target.value); setOpen(true); setHighlight(0); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder="Search docs…  ( / )"
                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {open && q.trim() && (
                <div role="listbox" className="absolute z-40 mt-1 w-[22rem] max-w-[80vw] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {results.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">No matches</div>}
                    {results.map((r, i) => (
                        <Link
                            key={r.url}
                            to={r.url}
                            role="option"
                            aria-selected={i === highlight}
                            onClick={() => { setOpen(false); setQ(''); }}
                            onMouseEnter={() => setHighlight(i)}
                            className={`block px-4 py-2.5 text-sm border-b border-slate-50 last:border-0 ${i === highlight ? 'bg-blue-50' : ''}`}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-800 truncate">{r.title}</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${r.type === 'reference' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{r.badge}</span>
                            </span>
                            <span className="block text-slate-500 truncate">{r.snippet}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
```

In `pages/docs/DocsLayout.tsx`, replace `<div className="p-4 border-b" data-docs-search-slot />` with:

```tsx
<div className="p-4 border-b"><DocsSearchBox /></div>
```

plus the import `import { DocsSearchBox } from '../../components/docs/DocsSearchBox';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/docsSearchBox.test.tsx tests/unit/docsSection.test.tsx`
Expected: PASS (layout test still green — if the layout test rendered the slot div, update that assertion to the search input's combobox role).

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — green.

```bash
git add components/docs/DocsSearchBox.tsx pages/docs/DocsLayout.tsx tests/unit/docsSearchBox.test.tsx
git commit -m "feat: docs search box with keyboard navigation, wired into sidebar"
```

---
# Phase 2 — Capture Pipeline

### Task 9: Capture runner, editor-driving helpers, smoke scenario

**Files:**
- Create: `docs-capture/run.js`, `docs-capture/lib/capture.js`, `docs-capture/lib/app.js`, `docs-capture/scenarios/smoke.js`, `docs-capture/README.md`

**Interfaces:**
- Consumes: `startServers(tag)` from `tutorial/lib/servers.js` (returns `{ apiLog, sqlitePath, baseUrl, lastVerificationLink(), stop() }` — sealed env: scratch SQLite, empty `RESEND_API_KEY`/`DATABASE_URL`, vite on `:5199`).
- Produces (used by every scenario in Phases 3–6):

```js
// docs-capture/lib/capture.js
export async function runScenario(name, shots, { outDir });
// shot contract: { id: 'area/name', kind: 'still' | 'clip', dialogText?, run: async (t) => {} }
//   t = { page, servers, baseUrl,
//         snap(cssSelector?),   // stills: capture full viewport, or the first matching element; exactly once
//         beginClip() }         // clips: mark the moment recording should start from

// docs-capture/lib/app.js
export const settle = (page, ms = 600) => page.waitForTimeout(ms);
export async function gotoEditor(t);
export async function newBlankProject(t);
export async function newPlannerProject(t);
export async function newNotebookProject(t);
export async function switchToTemplatesMode(t);
export async function switchToHierarchyMode(t);
export async function sidebarNodeBox(page, name);      // -> boundingBox of a sidebar row
export async function selectSidebarNode(t, name);
export async function canvasBox(page);
export async function drawElement(t, toolKey, from, to); // from/to = {x,y} 0..1 canvas fractions
export async function openGenerator(t);
export async function pasteGeneratorScripts(t, templatesJs, hierarchyJs);
export async function runGenerator(t);
```

- CLI: `node docs-capture/run.js [scenario ...] [--out=DIR]` — default all scenarios, default out `public/docs-assets`. After a full default-out run it prints `⚠ orphan asset:` warnings for files in `public/docs-assets` that no markdown references (spec guard 2 — warning only, never a failure).

- [ ] **Step 1: Implement `docs-capture/lib/capture.js`**

```js
// Shot runner: one fresh browser context per shot (clean editor state every
// time), stills at deviceScaleFactor 2, clips via Playwright video -> ffmpeg
// animated webp. Sealed servers come from tutorial/lib/servers.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServers } from '../../tutorial/lib/servers.js';

const VIEWPORT = { width: 1600, height: 1000 };

export async function runScenario(name, shots, { outDir }) {
    if (!Array.isArray(shots) || !shots.length) throw new Error(`scenario ${name}: no shots exported`);
    const servers = await startServers(`docs-${name}`);
    const browser = await chromium.launch();
    const tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-clip-'));
    try {
        for (const shot of shots) {
            const isClip = shot.kind === 'clip';
            const outPath = path.join(outDir, `${shot.id}.${isClip ? 'webp' : 'png'}`);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });

            const context = await browser.newContext({
                viewport: VIEWPORT,
                deviceScaleFactor: isClip ? 1 : 2,
                ...(isClip ? { recordVideo: { dir: tmpVideoDir, size: VIEWPORT } } : {}),
            });
            const page = await context.newPage();
            // Headless Chromium auto-dismisses window.prompt/confirm, which
            // silently aborts cloud saves — accept with a stable answer instead.
            page.on('dialog', d => d.accept(shot.dialogText ?? 'Docs capture').catch(() => {}));

            const contextStart = Date.now();
            let snapped = false;
            let clipStart = null;
            const t = {
                page,
                servers,
                baseUrl: servers.baseUrl,
                snap: async (selector) => {
                    if (isClip) throw new Error(`${shot.id}: snap() is for stills`);
                    if (snapped) throw new Error(`${shot.id}: snap() called twice`);
                    const target = selector ? page.locator(selector).first() : page;
                    await target.screenshot({ path: outPath });
                    snapped = true;
                },
                beginClip: () => { clipStart = Date.now(); },
            };

            try {
                await shot.run(t);
                if (isClip) {
                    if (clipStart == null) throw new Error('clip shot never called beginClip()');
                    await page.waitForTimeout(400); // small tail so the last action lands
                } else if (!snapped) {
                    throw new Error('still shot never called snap()');
                }
            } catch (err) {
                const failPath = path.join(os.tmpdir(), `docs-capture-failure-${shot.id.replace(/\//g, '_')}.png`);
                await page.screenshot({ path: failPath }).catch(() => {});
                await context.close().catch(() => {});
                throw new Error(`[${name}] shot ${shot.id} failed: ${err.message}\n  failure screenshot: ${failPath}`);
            }

            if (isClip) {
                const video = page.video();
                await context.close(); // flushes recording
                const videoPath = await video.path();
                const offset = Math.max(0, (clipStart - contextStart) / 1000 - 0.2);
                execFileSync('ffmpeg', [
                    '-y', '-ss', offset.toFixed(2), '-i', videoPath,
                    '-vf', 'fps=12,scale=1200:-2:flags=lanczos',
                    '-loop', '0', '-an', '-c:v', 'libwebp', '-q:v', '70',
                    outPath,
                ], { stdio: 'pipe' });
                fs.unlinkSync(videoPath);
            } else {
                await context.close();
            }
            console.log(`  ✓ ${shot.kind.padEnd(5)} ${shot.id}`);
        }
    } finally {
        await browser.close().catch(() => {});
        servers.stop();
        fs.rmSync(tmpVideoDir, { recursive: true, force: true });
    }
}
```

- [ ] **Step 2: Implement `docs-capture/lib/app.js`**

Selectors verified against `tutorial/episodes/ep2.js`, `scratch/render_project.mjs`, `components/EditorToolbar.tsx`, and `components/NewProjectModal.tsx`:

```js
// Editor-driving helpers shared by all docs-capture scenarios.
export const settle = (page, ms = 600) => page.waitForTimeout(ms);

export async function gotoEditor(t) {
    await t.page.goto(t.baseUrl + '/app');
    await t.page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 20000 });
    await settle(t.page, 900);
}

// Card texts from components/NewProjectModal.tsx. The blank card is clicked by
// its description (a tab named "Blank Project" already exists); the preset
// cards by their titles, .last() because an open project tab can share the name.
async function newProjectFromCard(t, cardText) {
    await t.page.click('button[title="New Project"]');
    await settle(t.page, 500);
    await t.page.getByText(cardText, { exact: false }).last().click();
    await settle(t.page, 1500);
}
export const newBlankProject = (t) => newProjectFromCard(t, 'Start fresh with a single A4 page');
export const newPlannerProject = (t) => newProjectFromCard(t, '2026 Planner');
export const newNotebookProject = (t) => newProjectFromCard(t, 'Simple Notebook');

export async function switchToTemplatesMode(t) {
    await t.page.getByText('Templates', { exact: true }).first().click();
    await settle(t.page, 600);
}
export async function switchToHierarchyMode(t) {
    await t.page.getByText('Hierarchy', { exact: true }).first().click();
    await settle(t.page, 600);
}

// A node row in the left sidebar; same column heuristic as tutorial/episodes/ep2.js.
export async function sidebarNodeBox(page, name) {
    const matches = await page.locator(`text=${name}`).all();
    for (const m of matches) {
        const box = await m.boundingBox();
        if (box && box.x < 300 && box.y > 140) return box;
    }
    throw new Error(`sidebar node not found: ${name}`);
}
export async function selectSidebarNode(t, name) {
    const box = await sidebarNodeBox(t.page, name);
    await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await settle(t.page, 500);
}

export const canvasBox = (page) =>
    page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();

// Press a tool key (t/r/e/y/l/g) and drag on the canvas between fractional coords.
export async function drawElement(t, toolKey, from, to) {
    await t.page.keyboard.press(toolKey);
    await settle(t.page, 300);
    const c = await canvasBox(t.page);
    const A = { x: c.x + c.width * from.x, y: c.y + c.height * from.y };
    const B = { x: c.x + c.width * to.x, y: c.y + c.height * to.y };
    await t.page.mouse.move(A.x, A.y);
    await t.page.mouse.down();
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
        await t.page.mouse.move(A.x + (B.x - A.x) * (i / steps), A.y + (B.y - A.y) * (i / steps));
        await t.page.waitForTimeout(22);
    }
    await t.page.mouse.up();
    await settle(t.page, 500);
}

// Generator helpers; textarea injection pattern from scratch/render_project.mjs.
export async function openGenerator(t) {
    await t.page.getByRole('button', { name: /Generator/i }).first().click();
    await settle(t.page, 600);
}
export async function pasteGeneratorScripts(t, templatesJs, hierarchyJs) {
    await t.page.evaluate(({ tpl, hier }) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        const tas = [...document.querySelectorAll('textarea')].filter(e => e.className.includes('caret-white'));
        if (tas.length < 2) throw new Error('generator textareas not found');
        setter.call(tas[0], tpl); tas[0].dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(tas[1], hier); tas[1].dispatchEvent(new Event('input', { bubbles: true }));
    }, { tpl: templatesJs, hier: hierarchyJs });
    await settle(t.page, 300);
}
export async function runGenerator(t) {
    await t.page.getByRole('button', { name: /Run Generator/i }).click();
    await t.page.waitForTimeout(2500);
}
```

- [ ] **Step 3: Implement `docs-capture/run.js`**

```js
// CLI: node docs-capture/run.js [scenario ...] [--out=DIR]
// Default: every scenario in docs-capture/scenarios, out to public/docs-assets.
// After a default-out run, warns about orphan assets no markdown references.
import fs from 'node:fs';
import path from 'node:path';
import { runScenario } from './lib/capture.js';

const ROOT = new URL('..', import.meta.url).pathname;
const DEFAULT_OUT = path.join(ROOT, 'public', 'docs-assets');

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : DEFAULT_OUT;
const names = args.filter(a => !a.startsWith('--'));

const scenariosDir = path.join(ROOT, 'docs-capture', 'scenarios');
const available = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
const selected = names.length ? names : available.filter(n => !n.startsWith('smoke'));

for (const name of selected) {
    if (!available.includes(name)) {
        console.error(`unknown scenario "${name}" — available: ${available.join(', ')}`);
        process.exit(1);
    }
}

for (const name of selected) {
    console.log(`scenario ${name}`);
    const mod = await import(path.join(scenariosDir, `${name}.js`));
    await runScenario(name, mod.shots, { outDir });
}

if (outDir === DEFAULT_OUT) {
    const referenced = new Set();
    const contentDir = path.join(ROOT, 'docs-content');
    const walkMd = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, f.name);
            if (f.isDirectory()) walkMd(p);
            else if (f.name.endsWith('.md')) {
                const body = fs.readFileSync(p, 'utf8');
                for (const m of body.matchAll(/\((\/docs-assets\/[^)\s]+)/g)) referenced.add(m[1]);
            }
        }
    };
    if (fs.existsSync(contentDir)) walkMd(contentDir);
    const walkAssets = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, f.name);
            if (f.isDirectory()) walkAssets(p);
            else if (!referenced.has('/' + path.relative(path.join(ROOT, 'public'), p))) {
                console.warn(`⚠ orphan asset: ${path.relative(ROOT, p)}`);
            }
        }
    };
    walkAssets(DEFAULT_OUT);
}
console.log('done');
```

- [ ] **Step 4: Create `docs-capture/scenarios/smoke.js`**

```js
// Pipeline smoke test: one still, one clip. Run with --out=<scratch dir>;
// smoke output is never committed.
import { gotoEditor, newBlankProject, drawElement } from '../lib/app.js';

export const shots = [
    {
        id: 'smoke/editor-blank',
        kind: 'still',
        run: async (t) => {
            await gotoEditor(t);
            await newBlankProject(t);
            await t.snap();
        },
    },
    {
        id: 'smoke/clip-draw-rect',
        kind: 'clip',
        run: async (t) => {
            await gotoEditor(t);
            await newBlankProject(t);
            t.beginClip();
            await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.62, y: 0.55 });
        },
    },
];
```

- [ ] **Step 5: Create `docs-capture/README.md`**

```markdown
# docs-capture

Regenerates every screenshot and animated clip used by the in-app docs
(`/docs`), deterministically, against a sealed throwaway server (scratch
SQLite, no email, no real database — see `tutorial/lib/servers.js`).

## Usage

    node docs-capture/run.js                     # all scenarios → public/docs-assets
    node docs-capture/run.js editor              # one scenario
    node docs-capture/run.js smoke --out=/tmp/x  # smoke test, throwaway output

Rerun the relevant scenario after any UI change that alters what a
screenshot shows, then review the image diffs in git before committing.

## Shot contract

Each scenario file in `scenarios/` exports `shots`:

    { id: 'editor/toolbar',        // → public/docs-assets/editor/toolbar.png
      kind: 'still',               // or 'clip' → .webp animated loop
      dialogText: 'My commit',     // optional window.prompt answer
      run: async (t) => { ... } }  // drive the app, then t.snap([selector])
                                   // clips: call t.beginClip() when the action starts

Stills render at 1600×1000, deviceScaleFactor 2; pass a CSS selector to
`t.snap()` for element crops. Clips are 12 fps looping webp, scaled to 1200px
wide; keep them 3–10 s.

Orphan assets (files no markdown references) are warned about after a full
default-out run — they never fail a build; the reverse direction (markdown
referencing a missing file) fails `tests/unit/docsAntiRot.test.ts`.
```

- [ ] **Step 6: Verify by running the smoke scenario**

Run:
```bash
ffmpeg -version | head -1
node docs-capture/run.js smoke --out=/tmp/claude-1000/-media-anoop-ssd-1-Work-doctect-doctect/6ac34a48-19b7-48ca-a30f-0ff2c24f0b69/scratchpad/docs-smoke
ls -la /tmp/claude-1000/-media-anoop-ssd-1-Work-doctect-doctect/6ac34a48-19b7-48ca-a30f-0ff2c24f0b69/scratchpad/docs-smoke/smoke/
```
Expected: `✓ still smoke/editor-blank`, `✓ clip smoke/clip-draw-rect`, then both files listed (`editor-blank.png` ~hundreds of KB, `clip-draw-rect.webp` non-trivial size). **Open `editor-blank.png` (Read tool / image viewer) and confirm it shows the editor with a blank A4 page — do not proceed on a blank/white capture.** If a selector fails, the error names the failure screenshot in `/tmp` — look at it, fix the helper, rerun.

- [ ] **Step 7: Full suite + commit**

Run: `npx vitest run` — green (pipeline is outside vitest's scope).

```bash
git add docs-capture/
git commit -m "feat: docs screenshot/clip capture pipeline with smoke scenario"
```

---

### Task 10: Cloud-flow capture helpers (accounts, publish, fork, merge requests)

**Files:**
- Create: `docs-capture/lib/cloud.js`, `docs-capture/scenarios/smoke-cloud.js`

**Interfaces:**
- Consumes: `t` toolkit from Task 9; `tutorial/lib/servers.js` (`servers.lastVerificationLink()` — the console-fallback mailer logs each verification URL); the app helpers from `docs-capture/lib/app.js`.
- Produces (used by the gallery wave, Tasks 28–35):

```js
export async function signUpAndVerify(t, { username, email, password });  // ends signed in, username set
export async function saveToCloud(t, commitMessage?);                     // dialogText handles the prompt
export async function publishProject(t, { description, tags });           // runs the publish wizard
export async function openGalleryProject(t, name);                        // gallery → detail page (direct URL, standalone page)
export async function forkProject(t);                                     // from a gallery detail page
export async function proposeChanges(t, message?);                        // from the editor's cloud menu
export async function signOut(t);
```

**The passwords must satisfy the live policy: 12+ chars, 3 of 4 character classes — use `DocsCapture2026!` everywhere.**

- [ ] **Step 1: Inventory — read the working flows first**

Read, in this order (they contain the exact working selectors and step order for every flow this task wraps):
1. `tests/e2e/helpers.js` — the committed sign-up/verify/sign-in helpers used by the whole e2e suite.
2. `tutorial/episodes/ep4.js` — real signup + verify + publish, driven on camera.
3. `tutorial/episodes/ep5.js` — two-user fork → propose → review → merge.
4. `components/cloud/CloudMenu.tsx`, `components/cloud/PublishModal.tsx`, `components/cloud/ProposeChangesModal.tsx` — button labels and modal structure.
5. `pages/LoginPage.tsx` — field labels/placeholders and the sign-in/sign-up mode toggle.

Port those flows into `docs-capture/lib/cloud.js` with the signatures above. Keep the helpers **role/label-based** (`getByLabel(/email/i)`, `getByRole('button', { name: /sign up/i })`) like the sources, not brittle CSS paths. Email verification: after submitting the signup form, poll `servers.lastVerificationLink()` (up to ~5 s), `page.goto(link)`, then continue — ep4 shows the exact sequence including the username/welcome step.

- [ ] **Step 2: Implement `docs-capture/lib/cloud.js`**

Skeleton to fill from the inventory (the control flow below is fixed; only selectors may differ after Step 1 — update them to match the sources):

```js
import { settle } from './app.js';

const pollVerificationLink = async (servers, tries = 25) => {
    for (let i = 0; i < tries; i++) {
        const link = servers.lastVerificationLink();
        if (link) return link;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('no verification link appeared in the API log');
};

export async function signUpAndVerify(t, { username, email, password }) {
    const { page, servers } = t;
    await page.goto(`${t.baseUrl}/login`);
    await settle(page, 800);
    // switch to sign-up mode + fill username/email/password + submit
    // (exact selectors: port from tests/e2e/helpers.js signUp flow / ep4.js)
    // then:
    const link = await pollVerificationLink(servers);
    await page.goto(link);
    await settle(page, 1000);
    // complete any /welcome username step if it appears, then land signed in.
}

export async function saveToCloud(t, commitMessage = 'Docs capture save') {
    // open the editor's Cloud menu, click "Save to Cloud"; the window.prompt
    // is auto-accepted by the runner's dialog handler (dialogText on the shot
    // controls the message — set it to commitMessage's value in scenarios).
}

export async function publishProject(t, { description, tags }) {
    // Cloud menu → Publish → wizard: keep default preview pages, fill
    // description + tags, wait for thumbnails to render, confirm.
}

export async function openGalleryProject(t, name) {
    const { page } = t;
    await page.goto(`${t.baseUrl}/gallery`);
    await settle(page, 900);
    await page.getByText(name).first().click();
    await settle(page, 1000);
}

export async function forkProject(t) {
    // on a gallery detail page: click Fork, wait for the editor/cloud state.
}

export async function proposeChanges(t, message = 'Improvements from the docs fork') {
    // editor Cloud menu → "Propose changes to upstream" → fill + submit.
}

export async function signOut(t) {
    // account menu → sign out (see components/AccountMenu.tsx for labels).
}
```

- [ ] **Step 3: Create `docs-capture/scenarios/smoke-cloud.js`**

Exercises every helper end-to-end (two users, publish, fork, merge request), capturing throwaway stills:

```js
import { gotoEditor, newBlankProject, drawElement } from '../lib/app.js';
import { signUpAndVerify, saveToCloud, publishProject, openGalleryProject, forkProject, proposeChanges, signOut } from '../lib/cloud.js';

export const shots = [
    {
        id: 'smoke-cloud/publish-fork-mr',
        kind: 'still',
        run: async (t) => {
            await signUpAndVerify(t, { username: 'docs-owner', email: 'owner@docs.test', password: 'DocsCapture2026!' });
            await gotoEditor(t);
            await newBlankProject(t);
            await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 });
            await saveToCloud(t);
            await publishProject(t, { description: 'Smoke publish', tags: 'smoke' });
            await signOut(t);

            await signUpAndVerify(t, { username: 'docs-forker', email: 'forker@docs.test', password: 'DocsCapture2026!' });
            await openGalleryProject(t, 'Blank Project');
            await forkProject(t);
            await drawElement(t, 'e', { x: 0.5, y: 0.55 }, { x: 0.7, y: 0.7 });
            await saveToCloud(t);
            await proposeChanges(t);
            await t.snap(); // whatever page proposeChanges lands on (the MR page)
        },
    },
];
```

- [ ] **Step 4: Run until green**

```bash
node docs-capture/run.js smoke-cloud --out=/tmp/claude-1000/-media-anoop-ssd-1-Work-doctect-doctect/6ac34a48-19b7-48ca-a30f-0ff2c24f0b69/scratchpad/docs-smoke
```
Expected: `✓ still smoke-cloud/publish-fork-mr`. On failure, the error prints a failure screenshot path — read it, fix the selector against the inventory sources, rerun. **Open the final capture and confirm it shows a merge-request page with the proposed change** before moving on.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` — green.

```bash
git add docs-capture/lib/cloud.js docs-capture/scenarios/smoke-cloud.js
git commit -m "feat: cloud-flow capture helpers (signup, publish, fork, merge request)"
```

---
# Phase 3 — Getting Started Wave

**Wave pattern (applies to every content task, Tasks 11–35):** each task (1) reads the named inventory files and trusts them over this plan's fact bullets, (2) writes one markdown tutorial, (3) appends shots to its track's scenario file, (4) regenerates that scenario into `public/docs-assets/`, (5) eyeballs at least the named captures, (6) runs the anti-rot guard + full suite, (7) commits content + assets together. Screenshot capture doubles as fact verification — if you can't drive the app to the state a sentence describes, the sentence is wrong; fix the sentence.

### Task 11: Tutorial — What PDF Architect Is (getting-started/01)

**Files:**
- Create: `docs-content/tutorials/getting-started/01-what-is-pdf-architect.md`
- Create: `docs-capture/scenarios/getting-started.js`

**Inventory:** `public/walkthroughs/walkthrough.md` (product story), `types.ts` (AppNode/PageTemplate/Variant), `pages/LandingPage.tsx`, `components/Sidebar.tsx` (Hierarchy/Templates toggle).

**Frontmatter:**
```
---
title: What PDF Architect Is
difficulty: beginner
time: 6 min
summary: The mental model — nodes, templates, variants, and data binding — and a tour of the three-panel editor.
keywords: introduction, concepts, nodes, templates, variants, data binding, interface
---
```

**Outline (each ## becomes a section):**
- `## Not another page designer` — contrast with Canva/InDesign: you design a handful of *templates* and a *hierarchy of nodes*; a 400-page planner needs 3–4 unique layouts. Callout `[!NOTE]`: everything is local-first; no account needed until cloud/gallery features.
- `## The four ideas` — Nodes (a page: title, data fields, ordered children) · Templates (reusable visual layout; many nodes share one) · Data binding (`{{title}}` placeholders resolve per node) · Variants (parallel template sets per device size; one shared hierarchy). Table of the four with one-line definitions, each linking to its reference entry (`/docs/reference/...` — add these links in Task 39's sweep if the entries don't exist yet; keep plain text for now to keep the anti-rot guard green).
- `## The editor at a glance` — annotated still: left sidebar (Hierarchy/Templates modes), center canvas, right properties column (Template Settings / Layers / Element Properties). One paragraph per area.
- `## Where to go next` — points at getting-started/02, then the editor track.

**Shots (append to the new `docs-capture/scenarios/getting-started.js`):**
```js
import { gotoEditor, newPlannerProject, switchToTemplatesMode } from '../lib/app.js';

export const shots = [
    { id: 'getting-started/editor-overview', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await t.snap();
    } },
    { id: 'getting-started/sidebar-modes', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.snap('aside, [class*="sidebar"]'); // crop the left sidebar; adjust selector to the real sidebar root if needed
    } },
];
```
Reference both images in the markdown with captions; also embed the existing walkthrough animation in the intro: `![New project walkthrough](/walkthroughs/new_project_creation.webp "Creating a project from the 2026 Planner preset")`.

- [ ] **Step 1:** Read the inventory files; adjust any fact bullet the code contradicts.
- [ ] **Step 2:** Write the markdown file per the outline (prose, callouts, table, image refs).
- [ ] **Step 3:** Create the scenario file with the two shots.
- [ ] **Step 4:** Run `node docs-capture/run.js getting-started` — expect `✓` per shot; open `public/docs-assets/getting-started/editor-overview.png` and confirm the planner project is visible with its hierarchy.
- [ ] **Step 5:** Run `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:** Commit:
```bash
git add docs-content/tutorials/getting-started/ docs-capture/scenarios/getting-started.js public/docs-assets/getting-started/
git commit -m "docs: getting-started tutorial 1 - what PDF Architect is"
```

---

### Task 12: Tutorial — Your First Document from a Preset (getting-started/02)

**Files:**
- Create: `docs-content/tutorials/getting-started/02-first-project-from-preset.md`
- Modify: `docs-capture/scenarios/getting-started.js` (append shots)

**Inventory:** `components/NewProjectModal.tsx` (three built-in presets + custom presets appear here), `components/TabBar.tsx` (multiple open projects as tabs), `components/ProjectEditor.tsx:975-1100` (Export PDF, Export All Variants, greyscale toggle, JSON button), `services/presets.ts`.

**Verified facts to cover:** presets are **Blank Project** ("Start fresh with a single A4 page…"), **Simple Notebook** (cover, dividers, lined/grid pages), **2026 Planner** (Year/Month/Week/Day/Tracker views); projects open as tabs (TabBar) and live in browser localStorage; **Export PDF** exports the active variant, **Export All Variants** appears when a project has >1 variant (button disabled at ≤1); greyscale toggle sits next to export.

**Frontmatter:**
```
---
title: Your First Document from a Preset
difficulty: beginner
time: 8 min
summary: Open the 2026 Planner preset, explore how pages and templates relate, and export your first PDF.
keywords: preset, planner, notebook, new project, export, pdf, tabs
prerequisites: getting-started/what-is-pdf-architect
---
```

**Outline:**
- `## Create the project` — New Project button → preset cards (still of the modal). `[!TIP]`: projects are browser-local until you save to the cloud; the tab bar holds several open projects at once.
- `## Explore the hierarchy` — click Year → Month → Day nodes; watch the canvas change; point out node titles/data in the properties panel (still of a month selected).
- `## Peek at the templates` — Templates mode: a handful of templates power hundreds of pages; the preview-node selector above the canvas chooses whose data fills the design (still).
- `## Export a PDF` — Export PDF button; greyscale toggle; Export All Variants (when >1 variant). `[!NOTE]`: exported links work in PDF readers that support internal links.
- `## What you just used` — one-line recaps linking onward: hierarchy → editor track 1; grids/links seen in the planner → editor tracks 6–8.
- Embed `/walkthroughs/manual_document_design.webp` where element creation is first mentioned.

**Shots (append):**
```js
{ id: 'getting-started/new-project-modal', kind: 'still', run: async (t) => {
    await gotoEditor(t);
    await t.page.click('button[title="New Project"]');
    await t.page.waitForTimeout(600);
    await t.snap();
} },
{ id: 'getting-started/planner-month-view', kind: 'still', run: async (t) => {
    await gotoEditor(t); await newPlannerProject(t);
    await selectSidebarNode(t, 'January');   // confirm the node title in the seeded planner; adjust if the preset names differ
    await t.snap();
} },
{ id: 'getting-started/template-preview-selector', kind: 'still', run: async (t) => {
    await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
    await t.snap();
} },
```
(import `selectSidebarNode` in the scenario file.)

- [ ] **Step 1:** Inventory; fix bullets against code (especially preset node titles like "January").
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append the shots.
- [ ] **Step 4:** `node docs-capture/run.js getting-started` — eyeball `new-project-modal.png` (three preset cards visible) and `planner-month-view.png`.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/getting-started/ docs-capture/scenarios/getting-started.js public/docs-assets/getting-started/
git commit -m "docs: getting-started tutorial 2 - first document from a preset"
```

---

# Phase 4 — Editor Wave

### Task 13: Tutorial — Canvas Basics (editor/01)

**Files:**
- Create: `docs-content/tutorials/editor/01-canvas-basics.md`
- Create: `docs-capture/scenarios/editor.js`

**Inventory:** `components/EditorToolbar.tsx` (tool buttons + titles), `components/ProjectEditor.tsx:143-268` (global shortcuts), `components/Canvas.tsx:350-620` (wheel zoom/pan modifiers, panning at 543: hand tool or middle-click, marquee, Escape at 464), `components/canvas/SelectionHandles.tsx`.

**Verified facts to cover:**
- Tools + keys (from toolbar titles): Select **V**, Pan **H**, Text **T**, Rectangle **R**, Ellipse **E**, Triangle **Y**, Line **L**, Data Grid **G**; SVG menu (Import SVG file… / Insert placeholder SVG).
- **Click & drag to create** — clicking without dragging creates nothing (the #1 beginner trap; give it a `[!WARNING]`).
- Panning: Hand tool or **middle mouse button** (`Canvas.tsx:544`); zoom controls in the toolbar (67%→ zoom −/+); wheel behavior — read the `handleWheel` handler around `Canvas.tsx:360` and document the actual modifier (Ctrl+scroll vs plain scroll) from code, not from the old docs page.
- Undo `kbd:Ctrl+Z` (also `kbd:Ctrl+Shift+Z`), redo `kbd:Ctrl+Y`; delete = `kbd:Delete` **or** `kbd:Backspace`; Escape cancels selection.
- Copy/cut/paste `kbd:Ctrl+C/X/V` (paste also on `kbd:Ctrl+P` — quirk worth documenting), duplicate `kbd:Ctrl+D`. **Ctrl+D also duplicates selected nodes (hierarchy mode) or templates (templates mode)** when no element is selected.
- Arrow nudge: 1 pt (or 10 with snap-to-grid on); `kbd:Shift+Arrow` always 10. Shortcuts are suppressed while typing in inputs and while modals are open.
- Snap magnet + Show grid toggles; snap also turns the grid display on.

**Frontmatter:**
```
---
title: Canvas Basics — Tools, Navigation, Selection
difficulty: beginner
time: 10 min
summary: Every drawing tool and its shortcut, canvas navigation, selection, nudging, and the click-drag-to-create rule.
keywords: tools, shortcuts, pan, zoom, snap, undo, redo, marquee, select
prerequisites: getting-started/first-project-from-preset
---
```

**Outline:** `## The toolbar` (annotated crop still + tool/key table) · `## Creating elements — drag, don't click` (WARNING callout + clip) · `## Moving around the canvas` (pan/zoom/snap facts) · `## Selecting, moving, resizing` (handles still; marquee; shift-click add/remove; Escape) · `## Undo, clipboard, and nudging` (shortcut tables using `kbd:` chips) · `## Shortcut reference` (link to `/docs/reference` shortcuts category — plain text until Task 36 lands entries, then Task 39's sweep links it).

**Shots (new scenario file `editor.js`):**
```js
import { gotoEditor, newBlankProject, newPlannerProject, switchToTemplatesMode, selectSidebarNode, drawElement, canvasBox, settle } from '../lib/app.js';

export const shots = [
    { id: 'editor/toolbar', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await t.snap('div.min-h-\\[40px\\]');   // the EditorToolbar root; verify the class crop works, else snap full and crop later shots differently
    } },
    { id: 'editor/clip-drag-create', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        t.beginClip();
        await drawElement(t, 'r', { x: 0.25, y: 0.25 }, { x: 0.6, y: 0.5 });
        await drawElement(t, 't', { x: 0.25, y: 0.55 }, { x: 0.6, y: 0.62 });
        await t.page.keyboard.type('Hello', { delay: 60 });
        await t.page.keyboard.press('Escape');
    } },
    { id: 'editor/selection-handles', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 });
        await t.snap();
    } },
];
```

- [ ] **Step 1:** Inventory; resolve the wheel-zoom modifier question from `Canvas.tsx` and write what the code does.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Create `editor.js` with the shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball all three captures (toolbar crop legible; clip shows the drag).
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 1 - canvas basics"
```

---

### Task 14: Tutorial — Elements & Properties (editor/02)

**Files:**
- Create: `docs-content/tutorials/editor/02-elements-and-properties.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `types.ts:72-130` (TemplateElement — authoritative property list), `components/properties/SingleElementEditor.tsx` (which controls exist and their labels), `components/properties/TextPaddingControls.tsx`, `components/canvas/patternStyle.ts`, `components/EditorToolbar.tsx:55-172` (align/distribute).

**Verified facts to cover:**
- Element types: rect, ellipse, text, triangle, line (with `flip` for \ vs /), grid, svg.
- Fill: solid color or **pattern** — `lines-h`, `lines-v`, `lines-d`, `dots`, with `patternSpacing` + `patternWeight`. TIP callout: dots + generous spacing = bullet-journal pages without thousands of elements (PDF stays small).
- Stroke color/width; `borderStyle` solid/dashed/dotted/none/double; **per-side borders** (`borderSides` top/right/bottom/left overrides — non-obvious); `borderRadius`; `opacity`; `zIndex` (within-layer); rotation + `transformOrigin` (normalized 0–1, default center).
- Typography: font size/family, weight, italic, underline/line-through, horizontal + **vertical** align, `textColor`, text wrap, **textOverflow** modes clip/ellipsis/shrink/visible, **autoWidth**, text padding (per-side).
- Alignment toolbar appears at 2+ selected: align left/center/right/top/middle/bottom + distribute horizontally/vertically.
- Double-click a text element to edit in place (verify in `components/canvas/OverlayTextEditor.tsx`).

**Frontmatter:**
```
---
title: Elements & Properties
difficulty: beginner
time: 12 min
summary: Every element type and every property — fills and patterns, borders per side, typography, overflow, alignment tools.
keywords: rectangle, ellipse, triangle, line, text, fill, pattern, dots, border, opacity, typography, align, distribute, overflow
prerequisites: editor/canvas-basics
---
```

**Outline:** `## The element types` (table: type → what it's for) · `## Fills and patterns` (pattern gallery still + bujo TIP) · `## Strokes and borders` (border styles; per-side borders WARNING that they override the global stroke) · `## Typography` (all text controls; overflow modes explained one line each) · `## Rotation, opacity, stacking` (transform origin; zIndex is within-layer — links to editor/03) · `## Aligning and distributing` (clip).

**Shots (append to `editor.js`):**
```js
{ id: 'editor/properties-panel-shape', kind: 'still', run: async (t) => {
    await gotoEditor(t); await newBlankProject(t);
    await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.55, y: 0.5 });
    await t.snap('[class*="properties"], aside:last-of-type'); // right column crop; verify selector against PropertiesPanel root, adjust once, reuse everywhere
} },
{ id: 'editor/pattern-fills', kind: 'still', run: async (t) => {
    // Build 4 rects and set each pattern type via the properties panel UI,
    // or (faster, still honest) drive one rect through all four and snap the
    // canvas with 4 pre-drawn rects patterned via UI clicks. Keep UI-driven.
    await gotoEditor(t); await newBlankProject(t);
    await drawElement(t, 'r', { x: 0.1, y: 0.3 }, { x: 0.28, y: 0.55 });
    // ...select pattern fill type + 'dots' in the panel (labels from SingleElementEditor.tsx)...
    await t.snap();
} },
{ id: 'editor/clip-align-distribute', kind: 'clip', run: async (t) => {
    await gotoEditor(t); await newBlankProject(t);
    await drawElement(t, 'r', { x: 0.15, y: 0.3 }, { x: 0.3, y: 0.45 });
    await drawElement(t, 'r', { x: 0.4, y: 0.5 }, { x: 0.55, y: 0.65 });
    await drawElement(t, 'r', { x: 0.65, y: 0.35 }, { x: 0.8, y: 0.5 });
    // marquee-select all three:
    t.beginClip();
    const c = await canvasBox(t.page);
    await t.page.keyboard.press('v');
    await t.page.mouse.move(c.x + c.width * 0.1, c.y + c.height * 0.25);
    await t.page.mouse.down();
    await t.page.mouse.move(c.x + c.width * 0.85, c.y + c.height * 0.7, { steps: 15 });
    await t.page.mouse.up();
    await settle(t.page, 500);
    await t.page.click('button[title="Align Top"]');
    await settle(t.page, 700);
    await t.page.click('button[title="Distribute Horizontally"]');
    await settle(t.page, 700);
} },
```
The pattern-fills shot requires driving the properties panel — read `SingleElementEditor.tsx` for the fill-type control's label and write the clicks accordingly (this is exactly the verification the wave pattern intends).

- [ ] **Step 1:** Inventory (SingleElementEditor is the ground truth for what the panel exposes and what it's labeled).
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots; fill in the panel-driving clicks.
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball `pattern-fills.png` (pattern visibly applied) and the align clip.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 2 - elements and properties"
```

---

### Task 15: Tutorial — Layers (editor/03)

**Files:**
- Create: `docs-content/tutorials/editor/03-layers.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `components/LayersPanel.tsx`, `types.ts:132-149` (Layer, layers on PageTemplate), `services/layers.ts` (shared sort/filter feeding canvas, PDF, thumbnails).

**Verified facts to cover:** named layers with order/visibility/lock/color label/collapse; elements sort by `(layer.order, zIndex)`; hidden ⇒ excluded from canvas **and** exported PDF **and** gallery thumbnails (one shared function — they can't drift); locked ⇒ visible but click-through; panel sits in the right column between Template Settings and Element Properties, collapsed by default; per-layer rename/color/drag-reorder; element rows with search filter; ctrl/cmd- and shift-click element rows to multi-select; move-selection-to-layer; `activeLayerId` — new elements land on the active layer (fallback frontmost).

**Frontmatter:**
```
---
title: Layers
difficulty: intermediate
time: 10 min
summary: Photoshop-style named layers — hide, lock, reorder, color-label — and how they shape the exported PDF.
keywords: layers, hide, lock, reorder, visibility, background, z-index, panel
prerequisites: editor/elements-and-properties
---
```

**Outline:** `## Why layers` (overlap + organization; one default layer after migration) · `## The panel` (annotated crop; every control) · `## Hide and lock semantics` (hide excludes from PDF + thumbnails — TIP: hide a "draft notes" layer before export; lock = click-through — TIP: lock the background layer) · `## Ordering` (layer order first, then z-index within; drag-reorder clip) · `## Working with element rows` (search, multi-select, move-to-layer).

**Shots (append):**
```js
{ id: 'editor/layers-panel', kind: 'still', run: async (t) => {
    await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
    // expand the Layers section in the right column (CollapsibleSection titled "Layers")
    await t.page.getByText('Layers', { exact: true }).last().click();
    await settle(t.page, 500);
    await t.snap();
} },
{ id: 'editor/clip-layer-hide-lock', kind: 'clip', run: async (t) => {
    await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
    await t.page.getByText('Layers', { exact: true }).last().click();
    await settle(t.page, 400);
    t.beginClip();
    // click the layer's eye toggle, then the lock toggle (button titles from LayersPanel.tsx)
    // e.g. await t.page.click('button[title="Hide layer"]'); …
} },
```
Fill the hide/lock button selectors from `LayersPanel.tsx` control titles during Step 1.

- [ ] **Step 1:** Inventory.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots with real panel selectors.
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball both layer captures.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 3 - layers"
```

---

### Task 16: Tutorial — Selecting Overlapped Elements (editor/04)

**Files:**
- Create: `docs-content/tutorials/editor/04-selecting-overlapped-elements.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `components/Canvas.tsx:540-700` (press-keeps-selection, clean-click cycling, alt-click), `components/canvas/SelectUnderMenu.tsx` (right-click menu, hover outline, shift-click stays open), `services/hitTest.ts` (rotation-aware, skips hidden/locked).

**Verified facts to cover (the walkthrough's stacked-selection model, confirm each in code):**
- Press over an already-selected element keeps the selection → dragging moves what you selected.
- A clean click (no drag) cycles one step down the overlapping stack, wrapping back to the top.
- `kbd:Alt+Click` cycles under the cursor explicitly; `kbd:Shift+Alt+Click` cycle-*adds* members of the stack to a multi-selection; shift-click over a stack cycles which member joins.
- Right-click opens "select under" listing everything under the cursor: hover outlines the element on canvas; shift-click entries multi-select without closing.
- Layers-panel element rows select directly; every mechanism skips hidden and locked layers.

**Frontmatter:**
```
---
title: Selecting Overlapped Elements
difficulty: intermediate
time: 8 min
summary: Four ways to reach an element buried under others — click-cycling, Alt-click, the right-click menu, and the Layers panel.
keywords: overlap, stack, selection, alt click, right click, select under, cycle, covered
prerequisites: editor/layers
---
```

**Outline:** `## The problem` (topmost element eats every click) · `## Click again to go deeper` (cycle model + clip) · `## Alt-click and shift variants` (kbd table) · `## The right-click menu` (still + hover-outline note) · `## When in doubt: the Layers panel` · `[!TIP]` locked layers pass clicks through by design — lock decorations instead of fighting them.

**Shots (append):** build a 3-deep stack (three rects drawn on the same spot), then:
```js
{ id: 'editor/select-under-menu', kind: 'still', run: async (t) => {
    await gotoEditor(t); await newBlankProject(t);
    for (const pad of [0, 0.02, 0.04]) {
        await drawElement(t, 'r', { x: 0.3 + pad, y: 0.3 + pad }, { x: 0.55 + pad, y: 0.5 + pad });
    }
    const c = await canvasBox(t.page);
    await t.page.mouse.click(c.x + c.width * 0.42, c.y + c.height * 0.42, { button: 'right' });
    await settle(t.page, 600);
    await t.snap();
} },
{ id: 'editor/clip-click-cycle', kind: 'clip', run: async (t) => {
    await gotoEditor(t); await newBlankProject(t);
    for (const pad of [0, 0.02, 0.04]) {
        await drawElement(t, 'r', { x: 0.3 + pad, y: 0.3 + pad }, { x: 0.55 + pad, y: 0.5 + pad });
    }
    t.beginClip();
    const c = await canvasBox(t.page);
    for (let i = 0; i < 3; i++) {
        await t.page.mouse.click(c.x + c.width * 0.42, c.y + c.height * 0.42);
        await settle(t.page, 900);
    }
} },
```

- [ ] **Step 1:** Inventory; confirm every mechanism bullet against `Canvas.tsx`/`SelectUnderMenu.tsx`.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — the cycle clip must visibly move the selection outline between stacked rects; the menu still must show the stacked entries.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 4 - selecting overlapped elements"
```

---

### Task 17: Tutorial — Data Binding & Node Data (editor/05)

**Files:**
- Create: `docs-content/tutorials/editor/05-data-binding.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `components/properties/NodeProperties.tsx` (add/edit data fields UI), `services/previewText.ts` + `services/canvasTextLayout.ts` (how `{{field}}` resolves), `services/planner_preset.json` (real data fields the preset ships: search for `"data"` keys — e.g. day-of-week numbers), `components/EditorToolbar.tsx:40-53` (preview node resolution).

**Verified facts to cover:** `{{title}}` resolves to the rendering node's title; any custom key in a node's `data` map is bindable as `{{key}}`; node data is edited in the properties panel when a node is selected (Title + Data Fields); in Templates mode the **preview node selector** (toolbar) picks whose data previews — it lists only nodes actually using the template; missing fields render as empty (confirm exact behavior in previewText.ts — empty vs literal); the planner preset's day nodes carry the fields its calendar grids need (name them from the JSON).

**Frontmatter:**
```
---
title: Data Binding & Node Data
difficulty: beginner
time: 8 min
summary: Make one template say the right thing on every page — {{title}}, custom data fields, and the preview-node selector.
keywords: data binding, placeholder, title, fields, node data, preview, curly braces
prerequisites: editor/canvas-basics
---
```

**Outline:** `## One template, many pages` · `## Binding the title` (type `{{title}}` in a text box; preview selector clip switching Monday→Tuesday equivalent in the seeded project) · `## Custom data fields` (add a field on a node, bind it; still of NodeProperties) · `## Where preset data comes from` (planner day-node fields, named precisely — these are the same fields grids' dynamic offset uses, forward-link editor/07) · `[!NOTE]` missing fields' actual rendering behavior.

**Shots (append):** `editor/node-data-fields` still (a planner day node selected, data fields visible) + `editor/clip-preview-node-switch` clip (templates mode, switching the preview node select between two nodes — `select` element in the toolbar, use `selectOption`).

- [ ] **Step 1:** Inventory; extract the planner preset's real field names.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball both; the clip must show the canvas text changing when the preview node changes.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 5 - data binding and node data"
```

---

### Task 18: Tutorial — Grids I: Sources, Cells, and Table Styling (editor/06)

**Files:**
- Create: `docs-content/tutorials/editor/06-grids-basics-and-styling.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `types.ts:23-63` (GridConfig — authoritative), `components/GridSourceModal.tsx`, `components/NodeSelectorModal.tsx` (`grid_source` mode), the grid section of `components/properties/SingleElementEditor.tsx`, grid rendering in `components/canvas/CanvasElement.tsx`.

**Verified facts to cover:**
- A grid renders **one cell per source child**; the element's `w`/`h` are **one cell's** dimensions, not the whole grid's (types.ts comment — top gotcha, WARNING callout).
- `sourceType: 'current'` (children of the page being rendered) vs `'specific'` (children of a fixed node picked in a selector modal — nav menus that are identical on every page).
- `cols`, `gapX`, `gapY`; `displayField` chooses what each cell shows (any bound field, e.g. `title`).
- Cells link to the child they represent (default grid behavior — nav for free).
- Table styling: `gridBorderMode` all/outside/inside/none; border color/width/style/radius overrides; `showEmptyCellBorders`; `headerRow` + fill/text-color/weight; `firstColumn` + same; `alternateRows`/`alternateColumns` + fills.
- Grids render references like normal nodes (forward-link editor/09).

**Frontmatter:**
```
---
title: Grids I — Sources, Cells, and Table Styling
difficulty: intermediate
time: 12 min
summary: Data grids render a cell per child node — sources, columns and gaps, display fields, cell links, and full table styling.
keywords: grid, data grid, source, children, columns, gap, display field, header row, borders, alternating
prerequisites: editor/data-binding
---
```

**Outline:** `## What a grid is` (cell per child; w/h = one cell WARNING) · `## Choosing the source` (current vs specific + selector modal still) · `## Columns, gaps, display field` (clip: draw grid on planner month template, change cols) · `## Cells are links` (embed the existing walkthrough animation here: `![Interactive navigation](/walkthroughs/interactive_navigation.webp "Building a navigation menu with a data grid")`) · `## Table styling` (border modes matrix table; header row / first column / alternating stills built on the notebook or planner project) · `## Where grids get their data` (displayField pulls bound node data; references resolve to their targets).

**Shots (append):** `editor/grid-source-modal` still (grid selected → open source selector) · `editor/clip-grid-cols` clip (change column count in panel, grid reflows) · `editor/grid-table-styling` still (a grid with header row + alternating rows enabled via panel).

- [ ] **Step 1:** Inventory; confirm each styling toggle's panel label.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (panel-driving clicks per labels found in Step 1).
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball all three.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 6 - grids: sources, cells, table styling"
```

---

### Task 19: Tutorial — Grids II: Calendars, Offsets, and Data Shaping (editor/07)

**Files:**
- Create: `docs-content/tutorials/editor/07-grids-calendars-and-data-shaping.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `types.ts:23-63` (offset + slicing + traversal fields), the grid offset/slice/traversal controls in `components/properties/SingleElementEditor.tsx`, the planner preset's month template (dissect how the shipped calendar is configured — open the JSON or inspect in-app).

**Verified facts to cover:**
- **Static offset** (`offsetStart`): N empty cells before the first item.
- **Dynamic offset** (`offsetMode: 'dynamic'`): the offset comes from a **field on the first child's data** (`offsetField`, e.g. the planner's day-of-week field) plus `offsetAdjustment` (can be negative). This is how the 1st of a month lands on the right weekday column — the calendar recipe, worked end-to-end.
- **Data slicing** (`dataSliceStart`, `dataSliceCount`): render a window of the children (weeks as rows: slice 0–6, 7–13, …). Applied AFTER traversal.
- **Traversal path** (`traversalPath` steps with `sliceStart`/`sliceCount`): drill into *descendants* — e.g. a Year template showing grandchild Days by stepping Months→Days. The most non-obvious grid feature; treat with a worked example and a diagram-style table.
- `showEmptyCellBorders` interaction with offsets (blank leading cells visible or not).

**Frontmatter:**
```
---
title: Grids II — Calendars, Offsets, and Data Shaping
difficulty: advanced
time: 14 min
summary: Dynamic weekday offsets for real calendars, slicing children into rows, and traversal paths that reach grandchildren.
keywords: calendar, offset, dynamic offset, dayOfWeekNum, slice, traversal, month grid, weekday
prerequisites: editor/grids-basics-and-styling
---
```

**Outline:** `## The calendar problem` (why day 1 ≠ column 1) · `## Dynamic offset, step by step` (mode/field/adjustment config block matching the planner's real month grid; clip toggling static→dynamic so cells shift) · `## Slicing children into rows` · `## Traversal: grids over grandchildren` (worked Year→Days example with the exact step values) · `## Debugging a grid` (preview node matters; empty cells vs missing data; check the source node actually has children).

**Shots (append):** `editor/grid-offset-config` still (panel crop of the offset controls on the planner month grid) · `editor/clip-dynamic-offset` clip (calendar reflowing as offset mode changes) · `editor/grid-traversal-example` still (a grid configured with a traversal path, canvas + panel both visible).

- [ ] **Step 1:** Inventory; copy the planner month grid's actual config values into the tutorial's example block.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — the dynamic-offset clip must show cells shifting.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 7 - grids: calendars, offsets, data shaping"
```

---

### Task 20: Tutorial — Linking (editor/08)

**Files:**
- Create: `docs-content/tutorials/editor/08-linking.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `types.ts:122-125` (`linkTarget` union — **nine** values, `linkValue`, `linkSecondaryValue`, `linkReferrerParentType`), the Interaction section of `components/properties/SingleElementEditor.tsx` + `components/properties/ChildIndexSelector.tsx`, link resolution in `services/pdfService.ts` (what each target does at export, including fallback semantics of `linkSecondaryValue`).

**Verified facts to cover:** the full target list with per-target semantics and which value fields each uses:
`none` · `parent` (back buttons) · `child_index` (Nth child; `linkValue` = index) · `specific_node` (hard link; node picked via selector modal) · `url` (external web link) · `sibling` (offset within the parent's children; document the exact offset semantics from pdfService) · `ancestor` (N levels up; `linkValue` = depth) · `referrer` and `child_referrer` (jump to the page that *references* this one — summary here, deep dive in editor/09). Document `linkSecondaryValue` fallback behavior exactly as the resolver implements it. Grid cells' built-in child links vs explicit element links. PDF reality check: links become real PDF annotations (including on svg/line elements).

**Frontmatter:**
```
---
title: Linking — Every On-Click Target
difficulty: intermediate
time: 12 min
summary: All nine link targets — parent, child index, sibling, ancestor, specific node, URL, and the referrer family — with when to use each.
keywords: link, interaction, on click, parent, child index, sibling, ancestor, url, navigation, back button
prerequisites: editor/grids-basics-and-styling
---
```

**Outline:** `## Logical links, not URLs` · `## The target reference table` (9-row table: target / meaning / value fields / typical use) · `## Back buttons and nav bars` (parent + specific_node patterns; still of Interaction section) · `## Position-relative links` (child_index, sibling, ancestor — worked planner examples: "next day" via sibling +1) · `## External URLs` · `## The referrer family` (one-paragraph orientation + link to editor/09) · `[!NOTE]` links resolve per rendering node — the same template links somewhere different on every page.

**Shots (append):** `editor/interaction-section` still (panel crop, On Click dropdown open if achievable — otherwise closed with a target selected) · `editor/clip-set-parent-link` clip (select element → set On Click to parent — labels from the panel, ep2 used "Go to Parent Page").

- [ ] **Step 1:** Inventory; nail `sibling`/`ancestor`/`referrer` semantics and `linkSecondaryValue` from `pdfService.ts`.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball both.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 8 - linking, all nine targets"
```

---

### Task 21: Tutorial — References & Referrer Formulas (editor/09)

**Files:**
- Create: `docs-content/tutorials/editor/09-references-and-referrer-formulas.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `types.ts:10` (`referenceId`), `components/NodeSelectorModal.tsx` (`create_reference` mode — how "Add Reference" is reached in the sidebar), `services/previewText.ts` (the `{{child_referrer:...}}` formula implementation — argument order and defaults), `components/sidebar/NodeItem.tsx` (reference affordances), the planner preset's Week nodes (live example).

**Verified facts to cover:** a Reference node points at another node (`referenceId`) — same page in two contexts without duplicating notes; grids render references by pulling the **target's** data and linking to the target; the `child_referrer` link target with `linkReferrerParentType` filter; the display formula `{{child_referrer:StartIndex:Count:TypeFilter:FieldName}}` (argument meanings verified against previewText.ts, not the old docs page); the planner's Week-view pattern: Week node holds 7 references to existing Days; "Back to Week" on a Day template = child_referrer link.

**Frontmatter:**
```
---
title: References & Referrer Formulas
difficulty: advanced
time: 14 min
summary: Reference nodes put one page in two places; referrer links and {{child_referrer}} formulas navigate and label across them.
keywords: reference, referrer, child referrer, week view, formula, shortcut node, back to week
prerequisites: editor/linking
---
```

**Outline:** `## The problem references solve` (Jan 1 belongs to January AND Week 1) · `## Creating a reference` (sidebar flow still) · `## Grids full of references` (week-overview recipe, step list) · `## Linking back through a reference` (child_referrer config walkthrough: Start Index 0 / Count 1, plus the type filter) · `## Displaying the referrer's name` (formula block + argument table + the week-label worked example `{{child_referrer:0:7:week:title}}` — verify the planner's real template type string for weeks) · `[!TIP]` never duplicate Day nodes for week views — reference them.

**Shots (append):** `editor/add-reference-flow` still (NodeSelectorModal open in create_reference mode) · `editor/week-references-sidebar` still (planner Week node expanded showing reference children) · `editor/clip-referrer-formula` clip (typing the formula into a text element on a template whose preview node makes it resolve — the resolved label appears).

- [ ] **Step 1:** Inventory; verify formula argument order + planner week type string.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — the formula clip must end with a resolved label (e.g. a week title), not raw `{{...}}`.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 9 - references and referrer formulas"
```

---

### Task 22: Tutorial — Variants, SVG, JSON Inspector, Export (editor/10)

**Files:**
- Create: `docs-content/tutorials/editor/10-variants-svg-json-export.md`
- Modify: `docs-capture/scenarios/editor.js` (append)

**Inventory:** `components/Sidebar.tsx` (variant dropdown + rename/duplicate/delete), `components/PropertiesPanel.tsx` (Template Settings: width/height + pt/px/in/mm unit selector), `components/EditorToolbar.tsx:186-231` (SVG menu), `components/properties/SvgSourceSection.tsx` (editing SVG markup in place), `components/JsonModal.tsx` + `components/json/` (visual/text modes, Apply), `components/ProjectEditor.tsx:975-1100` (Export PDF / Export All Variants / greyscale), `components/SavePresetModal.tsx`, `components/TabBar.tsx`.

**Verified facts to cover:**
- Variants: dropdown at the top of Templates-mode sidebar; duplicate copies every template for resizing; nodes stay shared; export uses the active variant; **Export All Variants** button (enabled at 2+ variants); unit selector genuinely converts pt/px/in/mm (same physical size re-expressed).
- SVG: Import SVG file… / Insert placeholder SVG; first-class element (move/resize/layer/copy); **SVG Source section** in properties edits markup live with broken-markup error surfaced; sanitized (DOMPurify) so gallery/forked artwork can't run scripts; exports as true vectors; WARNING: heavy filters/embedded rasters may differ in PDF.
- JSON Inspector: visual tree mode (expand, edit values, add properties) and raw text mode (bulk find/replace elsewhere, backups); Apply Changes commits to state.
- Save Preset: current project becomes a reusable card in New Project.
- Export: PDF per active variant; greyscale toggle with live canvas preview (CSS filter, selection chrome stays colored).

**Frontmatter:**
```
---
title: Variants, SVG Artwork, JSON Inspector, and Export
difficulty: intermediate
time: 14 min
summary: Multi-device variants with real unit conversion, vector artwork, low-level JSON access, presets, and PDF export options.
keywords: variants, device sizes, svg, import, json, inspector, export, greyscale, preset, units, remarkable, a4
prerequisites: editor/elements-and-properties
---
```

**Outline:** `## Variants: one hierarchy, many devices` (workflow list: design → duplicate → resize → export; still of variant dropdown) · `## Page dimensions and units` (unit selector genuinely converts) · `## SVG artwork` (import flow, source editing still, sanitization NOTE, export fidelity WARNING) · `## The JSON inspector` (both modes, still; TIP: text mode round-trip to your own editor for bulk renames) · `## Presets` (save/reuse) · `## Exporting` (buttons, greyscale clip showing live preview).

**Shots (append):** `editor/variant-dropdown` still · `editor/svg-source-section` still (import placeholder SVG → open its source section) · `editor/json-inspector` still (visual mode open on the planner) · `editor/clip-greyscale-toggle` clip (toggle on → canvas desaturates live).

- [ ] **Step 1:** Inventory.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js editor` — eyeball all four; greyscale clip must visibly desaturate.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/editor/ docs-capture/scenarios/editor.js public/docs-assets/editor/
git commit -m "docs: editor tutorial 10 - variants, svg, json inspector, export"
```

---
# Phase 5 — Generator Wave

### Task 23: Tutorial — Generator Basics (generator/01)

**Files:**
- Create: `docs-content/tutorials/generator/01-generator-basics.md`
- Create: `docs-capture/scenarios/generator.js`

**Inventory:** `components/HierarchyGeneratorModal.tsx` (panels, Run Generator, preview flow, apply buttons — copy their exact labels), `services/generatorSandbox.ts` (isolation + the 10-second timeout constant), `components/GeneratorVisualPreviewModal.tsx` (variant tabs, Unused badges, batching, lightbox), `services/generatedProjectState.ts` (create-as-new vs replace, undo checkpoint), `types.ts:157-162` (GeneratorProvenance).

**Verified facts to cover:** two panels — Templates Script (returns a map of template objects) and Hierarchy Script (returns `{ nodes, rootId }`); **Run Generator** validates in a disposable sandbox with a fixed 10 s timeout, then opens a visual preview instead of touching your project; preview shows one representative page per template per variant, usage counts, **Unused** badges, batched loading, lightbox; **Back to Scripts** preserves drafts; **View Preview** reopens without rerunning; **Create As New Project** (asks for a name, original untouched) vs **Replace Current Project** (confirmation + one undo checkpoint); both scripts are saved with the project (provenance) and travel through saves/downloads/cloud/forks — publishing makes them public (warning in the publish wizard); opening saved or gallery source never runs it; no reverse sync — manual edits don't rewrite the scripts.

**Frontmatter:**
```
---
title: Generator Basics
difficulty: intermediate
time: 10 min
summary: Build documents in code — the two-script model, the sandboxed preview, and how generated projects are applied and saved.
keywords: generator, script, hierarchy generator, sandbox, preview, create as new, replace, provenance
prerequisites: editor/data-binding
---
```

**Outline:** `## Why generate` (365 pages ≠ 365 clicks; embed the existing walkthrough animation: `![Automated generation](/walkthroughs/automated_generation.webp "The generator building a full project from a script")`) · `## The two scripts` (still of the modal; what each returns) · `## Run and preview` (sandbox NOTE: isolated, 10 s cap, never mutates on open; preview tour still) · `## Applying the result` (Create As New vs Replace, undo checkpoint) · `## Scripts travel with the project` (provenance + publish WARNING) · `## A first script` (minimal working pair, ~15 lines each, verified by the capture below).

**Shots (`docs-capture/scenarios/generator.js`):**
```js
import { gotoEditor, newBlankProject, openGenerator, pasteGeneratorScripts, runGenerator } from '../lib/app.js';

const MINI_TEMPLATES = `const t = {};
t.page = { id: 'page', name: 'Page', width: A4_WIDTH, height: A4_HEIGHT, elements: [
  { type: 'text', x: 40, y: 40, w: 300, h: 40, text: '{{title}}', fontSize: 24 },
] };
return t;`;
const MINI_HIERARCHY = `const nodes = {};
nodes.root = { id: 'root', parentId: null, type: 'page', title: 'Mini Book', data: {}, children: [] };
for (let i = 1; i <= 3; i++) {
  const id = createId('p');
  nodes[id] = { id, parentId: 'root', type: 'page', title: 'Chapter ' + i, data: {}, children: [] };
  nodes.root.children.push(id);
}
return { nodes, rootId: 'root' };`;

export const shots = [
    { id: 'generator/modal-two-scripts', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, MINI_TEMPLATES, MINI_HIERARCHY);
        await t.snap();
    } },
    { id: 'generator/visual-preview', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, MINI_TEMPLATES, MINI_HIERARCHY);
        await runGenerator(t);
        await t.snap();
    } },
];
```
The tutorial's "first script" section embeds MINI_TEMPLATES/MINI_HIERARCHY verbatim — the capture proves they run.

- [ ] **Step 1:** Inventory; copy exact button labels into the prose.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Create the scenario.
- [ ] **Step 4:** `node docs-capture/run.js generator` — the preview still must show rendered pages (not an error panel).
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/generator/ docs-capture/scenarios/generator.js public/docs-assets/generator/
git commit -m "docs: generator tutorial 1 - basics and the preview flow"
```

---

### Task 24: Tutorial — Templates in Code (generator/02)

**Files:**
- Create: `docs-content/tutorials/generator/02-templates-in-code.md`
- Modify: `docs-capture/scenarios/generator.js` (append)

**Inventory:** `services/generatorTemplates.ts` (what the templates sandbox exposes — constants, validation of returned shapes), `services/validateGeneratedProject.ts` (which element fields are accepted/required), `types.ts:72-130`, one committed sample: `gallery-samples/02-work-project-hub/templates.js` (idioms: style helper functions, shared palettes).

**Verified facts to cover:** template contract `{ id, name, width, height, elements: [] }` keyed by id; available constants `A4_WIDTH` (595.28), `A4_HEIGHT` (841.89), `RM_PP_WIDTH` (509), `RM_PP_HEIGHT` (679); every canvas property from Task 14 is writable in code (fills/patterns, borders + per-side, typography incl. overflow/wrap/padding, rotation, opacity); grid elements carry a full `gridConfig`; link fields (`linkTarget`, `linkValue`, …) work identically; layers in generated templates (what validate/migration does — confirm whether `layers` may be provided or a default layer is created); element `id`s (does the validator require them or are they assigned — confirm and document).

**Frontmatter:**
```
---
title: Templates in Code
difficulty: intermediate
time: 12 min
summary: The full element schema in JavaScript — geometry, styling, typography, grid configs, and links, with reusable style helpers.
keywords: templates script, elements, schema, constants, A4, remarkable, style helpers, grid config
prerequisites: generator/generator-basics
---
```

**Outline:** `## The template contract` · `## Geometry and constants` (constants table with the exact values) · `## Styling every element type` (compact JS blocks per group — shapes, patterns, text with overflow, per-side borders) · `## Grids and links in code` (a grid element with `gridConfig` inline; a parent-link back button) · `## Reusable helpers` (the sample-repo idiom: `const label = (x, y, text) => ({...})`; DRY palettes) · `[!NOTE]` whatever validation actually enforces (from validateGeneratedProject) — required fields, rejected values.

**Shots (append):** `generator/templates-script-rich` still (modal with a richer templates script pasted — reuse a trimmed excerpt of the work-project-hub sample) · `generator/preview-rich-templates` still (its preview, multiple distinct pages visible).

- [ ] **Step 1:** Inventory; settle the layers-in-generated-templates and element-id questions from code.
- [ ] **Step 2:** Write the markdown (all JS blocks must be runnable — they feed Step 3's captures).
- [ ] **Step 3:** Append shots pasting the tutorial's own code blocks.
- [ ] **Step 4:** `node docs-capture/run.js generator` — preview must render the styled pages.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/generator/ docs-capture/scenarios/generator.js public/docs-assets/generator/
git commit -m "docs: generator tutorial 2 - templates in code"
```

---

### Task 25: Tutorial — Hierarchy in Code (generator/03)

**Files:**
- Create: `docs-content/tutorials/generator/03-hierarchy-in-code.md`
- Modify: `docs-capture/scenarios/generator.js` (append)

**Inventory:** the hierarchy sandbox in `services/generatorSandbox.ts` (`createId`, access to the `templates` object from stage 1), `services/validateGeneratedProject.ts` (node contract enforcement), `gallery-samples/01-academic-success-system/hierarchy.js` (DEFAULT_CONFIG idiom, reference creation).

**Verified facts to cover:** return `{ nodes, rootId }`; node contract `{ id, parentId, type, title, data, children }` — `type` must name a stage-1 template id; parent must list the child in `children` (ordering = page order); `createId(prefix)` helper; `templates` from stage 1 is in scope; data fields power binding + grid offsets (put `dayOfWeekNum`-style fields here); references via `referenceId` (code block from the current docs page's pattern, re-verified); the samples' `DEFAULT_CONFIG` idiom — counts/toggles at the top of the script.

**Frontmatter:**
```
---
title: Hierarchy in Code
difficulty: intermediate
time: 12 min
summary: Loops that build node trees — the node contract, createId, data fields for grids, and reference nodes in code.
keywords: hierarchy script, nodes, rootId, createId, children, data, referenceId, config
prerequisites: generator/templates-in-code
---
```

**Outline:** `## The node contract` (annotated block) · `## Loops and ordering` (children array = page order) · `## Data your templates will need` (grid offset fields, custom labels — forward-link editor/07) · `## References in code` (`referenceId` block; week-of-references loop) · `## Configurable scripts` (DEFAULT_CONFIG pattern) · `## Validation errors you'll meet` (the real messages validateGeneratedProject produces for a missing template id / orphan child — reproduce two, quote them).

**Shots (append):** `generator/hierarchy-script` still · `generator/validation-error` still (paste a hierarchy script with a wrong `type` on purpose; snap the error the modal shows — documents the debugging experience honestly).

- [ ] **Step 1:** Inventory; collect two real validation error messages.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (including the deliberate-error one).
- [ ] **Step 4:** `node docs-capture/run.js generator` — error still must show the real message text.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/generator/ docs-capture/scenarios/generator.js public/docs-assets/generator/
git commit -m "docs: generator tutorial 3 - hierarchy in code"
```

---

### Task 26: Tutorial — Build a Dated Planner (generator/04)

**Files:**
- Create: `docs-content/tutorials/generator/04-build-a-dated-planner.md`
- Modify: `docs-capture/scenarios/generator.js` (append)

**Inventory:** everything from Tasks 23–25, plus `gallery-samples/03-personal-finance-planner/hierarchy.js` (real Date-loop calendar math) and the planner preset's month template config (from Task 19's dissection).

**This is the flagship worked example.** The tutorial builds, in stages, a complete one-month planner the reader can paste and run:
1. **Templates:** month page (title + calendar grid with `sourceType: 'current'`, `cols: 7`, dynamic offset on the first day's weekday field) + day page (bound title, date, notes area, back-to-month parent link).
2. **Hierarchy:** a real `Date` loop over one month of 2026 — each day node gets `data: { dayOfWeekNum: String(d.getDay()), … }` (match the field name and string/number convention the planner preset actually uses — from inventory); month node's children in date order.
3. **Week rows:** slice the same days into week-row grids (dataSlice) OR add Week reference nodes (choose the one the planner preset itself uses; show the other as a variation).
4. **Referrer labels:** the `{{child_referrer:0:7:week:title}}` pattern if week references are built.
5. **Second variant:** duplicate sizing note (A4 ↔ reMarkable constants swap).

Every stage's code block is cumulative and must run; the final pair is embedded in full at the end ("the whole thing").

**Frontmatter:**
```
---
title: Build a Dated Planner in Code
difficulty: advanced
time: 20 min
summary: A complete month-planner build — real calendar math, dynamic weekday offsets, week rows, back links, and a second device variant.
keywords: planner, calendar, date loop, dayOfWeekNum, month grid, worked example, weeks
prerequisites: generator/hierarchy-in-code, editor/grids-calendars-and-data-shaping
---
```

**Shots (append):** `generator/planner-preview` still (final scripts' preview — month page with correctly offset calendar visible) · `generator/planner-month-canvas` still (after Create As New Project, month template on canvas) · `generator/clip-planner-run` clip (paste → Run Generator → preview appears).

The apply step needs one more helper — add to `docs-capture/lib/app.js` in this task:
```js
export async function applyGeneratorAsNewProject(t, name = 'Docs Planner') {
    // Click the modal's create-as-new button (exact label from
    // HierarchyGeneratorModal.tsx, e.g. /Create As New Project/i);
    // the name prompt is auto-accepted via the shot's dialogText — set
    // dialogText: 'Docs Planner' on shots that use this helper.
    await t.page.getByRole('button', { name: /Create As New Project/i }).click();
    await t.page.waitForTimeout(2000);
}
```

- [ ] **Step 1:** Inventory; lock the weekday field name/format from the preset.
- [ ] **Step 2:** Write the tutorial with cumulative, runnable code blocks.
- [ ] **Step 3:** Append shots + the `applyGeneratorAsNewProject` helper (verify its label).
- [ ] **Step 4:** `node docs-capture/run.js generator` — **the planner-preview still is the proof the tutorial's code works; the calendar's first day must sit in the correct weekday column.**
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/generator/ docs-capture/scenarios/generator.js docs-capture/lib/app.js public/docs-assets/generator/
git commit -m "docs: generator tutorial 4 - build a dated planner"
```

---

### Task 27: Tutorial — Advanced Generator Patterns (generator/05)

**Files:**
- Create: `docs-content/tutorials/generator/05-advanced-patterns.md`
- Modify: `docs-capture/scenarios/generator.js` (append)

**Inventory:** `gallery-samples/README.md` + skim all eight samples' hierarchy.js headers and one templates.js in full; `tests/helpers/gallerySampleHarness.ts` (how samples are validated in CI); `docs/superpowers/` plans if sample conventions are documented there.

**Verified facts to cover (each pattern names the sample it's mined from):** hub-and-spoke navigation (a **Start Here** node every guided page links back to); **EXAMPLE**-marked guided pages beside blank workspaces; `DEFAULT_CONFIG` blocks for counts; tracker/log grids over generated children; index/TOC pages via `specific` grid sources; multi-level structures with traversal grids; reusing one template across sibling sections with data-driven labels; scale guardrails (the validator's node/element caps from `services/validateAppState`-side — confirm the cap numbers on the server validator and note client behavior); debugging workflow: deliberate small runs first, JSON inspector to check generated data, sandbox timeout on runaway loops.

**Frontmatter:**
```
---
title: Advanced Generator Patterns
difficulty: advanced
time: 16 min
summary: Techniques from the eight flagship gallery samples — hub navigation, guided EXAMPLE pages, config blocks, tracker grids, and debugging.
keywords: patterns, samples, start here, example pages, config, trackers, index pages, debugging, timeout
prerequisites: generator/build-a-dated-planner
---
```

**Outline:** `## Learn from the flagships` (what/where the samples are; paste-and-run invitation) · `## Hub-and-spoke navigation` · `## Guided EXAMPLE pages` · `## Config-driven scripts` · `## Trackers and index pages` · `## Big projects without pain` (caps, batched preview, small-run debugging, timeout) · `## When generation fails` (link back to generator/03's error section).

**Shots (append):** `generator/sample-preview` still (paste `gallery-samples/05-seasonal-kitchen` scripts — read from disk with `node:fs` in the scenario — run, snap the preview's variant tabs/pages) · `generator/sample-hierarchy` still (after apply-as-new, the sidebar showing the sample's node tree).

- [ ] **Step 1:** Inventory; confirm validator caps.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (fs-read the sample scripts; `dialogText: 'Seasonal Kitchen'` for the apply).
- [ ] **Step 4:** `node docs-capture/run.js generator` — sample preview must show multiple styled templates.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/generator/ docs-capture/scenarios/generator.js public/docs-assets/generator/
git commit -m "docs: generator tutorial 5 - advanced patterns from the gallery samples"
```

---

# Phase 6 — Gallery & Collaboration Wave

**Wave note:** these tasks use `docs-capture/lib/cloud.js`. Accounts persist for a whole scenario run (one sealed server per scenario), but each shot starts a fresh signed-out context — so shots re-authenticate with `signIn`. Add these two helpers to `docs-capture/lib/cloud.js` in Task 28 (same inventory sources as Task 10):

```js
export async function signIn(t, { email, password });          // /login, fill, submit, land signed in
export async function ensureUser(t, user);                     // signIn; on failure signUpAndVerify — makes every shot self-sufficient
```

### Task 28: Tutorial — Browsing Without an Account (gallery/01)

**Files:**
- Create: `docs-content/tutorials/gallery/01-browsing-without-an-account.md`
- Create: `docs-capture/scenarios/gallery.js`
- Modify: `docs-capture/lib/cloud.js` (add `signIn`, `ensureUser`)

**Inventory:** `pages/GalleryPage.tsx` (hero, curated rows: Top Rated / Popular / Recently Updated, tag chips, search → filtered grid with URL params), `pages/GalleryDetailPage.tsx` + `components/gallery/GalleryDetailBody.tsx` (Open in Editor, Download all variants, Version history, reviews, report), `components/gallery/GalleryDetailModal.tsx` (background-location modal), `components/cloud/HistoryModal.tsx` (`mode: 'clone'`).

**Verified facts to cover:** gallery needs no account; default view = hero + three curated rows; search matches names, descriptions, **and tags**; tag chips + "see all" switch to a URL-param filtered grid (shareable/bookmarkable); clicking a card in-app opens the project as an **overlay modal** while the URL stays `/gallery/:id` (direct visits/refresh render the standalone page — same content); **Open in Editor** clones into your local editor, works signed-out, no link back to the original; **Download all variants** = one zip with a PDF per variant; **Version history** browses public commits and can clone any past commit into a fresh local project; ratings/reviews visible to everyone; Report on the project page.

**Frontmatter:**
```
---
title: Browsing the Gallery Without an Account
difficulty: beginner
time: 8 min
summary: Search, tags, and curated rows; open any public project in your editor, download every variant, or clone a past version — no sign-in needed.
keywords: gallery, browse, anonymous, search, tags, open in editor, download, zip, version history, clone
prerequisites: getting-started/first-project-from-preset
---
```

**Outline:** `## The gallery in one look` (still) · `## Search, tags, and shareable filters` · `## A project page` (modal vs direct-URL NOTE; annotated still) · `## Open in Editor — yours, instantly` (no account, no linkage; contrast with forking → link gallery/06) · `## Download all variants` · `## Time-travel: public version history` (clone-a-commit flow still).

**Scenario seeding (`docs-capture/scenarios/gallery.js` starts with module-level constants):**
```js
import { gotoEditor, newNotebookProject, settle } from '../lib/app.js';
import { signUpAndVerify, ensureUser, saveToCloud, publishProject, openGalleryProject, signOut } from '../lib/cloud.js';

export const OWNER = { username: 'atlas-designs', email: 'owner@docs.test', password: 'DocsCapture2026!' };
export const FORKER = { username: 'quill-and-ink', email: 'forker@docs.test', password: 'DocsCapture2026!' };

// Publishes the seeded notebook once; safe to call at the top of any shot.
export async function ensurePublished(t) {
    await ensureUser(t, OWNER);
    await t.page.goto(t.baseUrl + '/gallery');
    await settle(t.page, 800);
    const already = await t.page.getByText('Simple Notebook').first().isVisible().catch(() => false);
    if (!already) {
        await gotoEditor(t);
        await newNotebookProject(t);
        await saveToCloud(t);
        await publishProject(t, { description: 'A structured notebook with cover, dividers, and lined pages.', tags: 'notebook, minimal' });
    }
    await signOut(t);
}
```

**Shots:** `gallery/gallery-home` still (after `ensurePublished`, signed out, `/gallery`) · `gallery/project-page` still (open the published project directly by URL) · `gallery/version-history-clone` still (history modal open from the project page).

- [ ] **Step 1:** Inventory; implement `signIn`/`ensureUser` from the Task-10 sources.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Create `gallery.js` with seeding + the three shots.
- [ ] **Step 4:** `node docs-capture/run.js gallery` — eyeball all three (gallery must show the published card with thumbnail).
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js docs-capture/lib/cloud.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 1 - browsing without an account"
```

---

### Task 29: Tutorial — Accounts, Verification, and Usernames (gallery/02)

**Files:**
- Create: `docs-content/tutorials/gallery/02-accounts-and-usernames.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** `pages/LoginPage.tsx` (signup form + inline password feedback), `server/…` password validator (12+ chars, 3 of 4 classes — quote the real rule from the shared validator), `pages/WelcomePage.tsx` (username onboarding + `from` redirect), `pages/AccountSettingsPage.tsx` (change username, change password — hidden for Google-only accounts, revokes other sessions), `components/AccountMenu.tsx`, `components/UsernameForm.tsx` (availability pre-check).

**Verified facts to cover:** email+password or Google; password policy (exact rule); email verification required — the "verify your inbox" panel, resend cooldown (5 min/address); username = public handle 3–30 chars shown on everything public, **required before** cloud save / publish / fork / reviews (server-enforced); Google/legacy accounts get the `/welcome` prompt; change username any time (old profile URL 404s, new one works); profile at `/u/username`; account settings: change password (not for Google-only), other sessions revoked on change.

**Frontmatter:**
```
---
title: Accounts, Verification, and Usernames
difficulty: beginner
time: 8 min
summary: Sign up, verify your email, pick your public username — what each unlocks and how to change things later.
keywords: account, sign up, google, password, verification, username, handle, profile, settings
prerequisites: gallery/browsing-without-an-account
---
```

**Outline:** `## Local-first, account-optional` (what an account adds) · `## Signing up` (form still; password policy NOTE with the exact rule) · `## Verify your inbox` (panel still; resend cooldown) · `## Your username` (why required; where it shows; the welcome prompt) · `## Account settings` (change username/password; Google-only note) · `[!NOTE]` your real name/email are never shown publicly.

**Shots (append):** `gallery/signup-form` still (signup mode with fields filled, before submit) · `gallery/verify-email-panel` still (after submitting a **fresh** user, e.g. `demo@docs.test` — the verify prompt) · `gallery/welcome-username` still (mid `signUpAndVerify` of another fresh user — snap at the `/welcome` step; restructure the helper's internals into steps if needed, or inline the flow in this shot) · `gallery/account-settings` still (signed in as OWNER, `/account`).

- [ ] **Step 1:** Inventory; quote the exact password rule + username length from code.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js gallery` — eyeball signup + verify panels.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 2 - accounts, verification, usernames"
```

---

### Task 30: Tutorial — Cloud Saves & Version History (gallery/03)

**Files:**
- Create: `docs-content/tutorials/gallery/03-cloud-saves-and-history.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** `components/cloud/CloudMenu.tsx` (the 3-state menu: signed out / no username / ready; forked-from indicator), `components/cloud/HistoryModal.tsx` (`mode: 'restore'`), `pages/MyProjectsPage.tsx` (list, storage bar, delete).

**Verified facts to cover:** nothing syncs silently — explicit **Save to Cloud** per snapshot; each save = an immutable commit (identical content doesn't duplicate); **Version History** lists commits with **Restore** (editor reverts to exactly that state); **My Projects** page (all cloud projects, storage usage bar, delete); the Cloud menu adapts: signed out → sign-in prompt; signed in without username → username prompt; ready → full menu; forked projects show a "forked from upstream" link.

**Frontmatter:**
```
---
title: Cloud Saves & Version History
difficulty: beginner
time: 7 min
summary: Explicit snapshots to the cloud, a commit history you can restore from, and the My Projects page.
keywords: cloud, save, commit, history, restore, my projects, storage, snapshot
prerequisites: gallery/accounts-and-usernames
---
```

**Outline:** `## Explicit saves, immutable commits` · `## The Cloud menu` (3-state still) · `## Restoring an old version` (clip: rename something → save → restore previous → the change reverts on canvas) · `## My Projects` (still).

**Shots (append):** `gallery/cloud-menu` still (OWNER signed in, menu open in the editor) · `gallery/clip-restore` clip (the restore round-trip above) · `gallery/my-projects` still (`/projects`).

- [ ] **Step 1:** Inventory.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js gallery` — the restore clip must visibly revert the rename.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 3 - cloud saves and version history"
```

---

### Task 31: Tutorial — Publishing to the Gallery (gallery/04)

**Files:**
- Create: `docs-content/tutorials/gallery/04-publishing.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** `components/cloud/PublishModal.tsx` (wizard steps, 1–4 preview pages, live thumbnail rendering, description/tags, generator-source warning), unpublish flow (CloudMenu or gallery page — locate it), thumbnail limits (300 KB, magic-byte validation — server side, mention plainly).

**Verified facts to cover:** publish = public visibility + public history; wizard: pick 1–4 preview pages (thumbnails render live — what visitors see), description (markdown-rendered in the gallery), tags power filtering; generator-source WARNING (both scripts become public — review for secrets); unpublish any time (removes from public view + hides reviews, deletes nothing); published projects show your username, never your email.

**Frontmatter:**
```
---
title: Publishing to the Gallery
difficulty: intermediate
time: 8 min
summary: The publish wizard — preview pages, live thumbnails, tags that people actually search — and what publishing exposes.
keywords: publish, unpublish, wizard, thumbnails, tags, description, public
prerequisites: gallery/cloud-saves-and-history
---
```

**Outline:** `## What publishing means` · `## The wizard, step by step` (stills of both wizard stages) · `## Tags that work` (TIP: tags are searchable + filterable — think like a searcher) · `## Generator scripts go public too` (WARNING) · `## Unpublishing`.

**Shots (append):** `gallery/publish-wizard-pages` still (wizard open on preview-page picking, thumbnails rendered) · `gallery/publish-wizard-meta` still (description/tags step filled).

- [ ] **Step 1:** Inventory; locate the unpublish control's exact home.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (publish a second project, e.g. blank-with-elements, so the flow is fresh).
- [ ] **Step 4:** `node docs-capture/run.js gallery` — wizard stills must show live thumbnails.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 4 - publishing"
```

---

### Task 32: Tutorial — Ratings, Reviews, and Profiles (gallery/05)

**Files:**
- Create: `docs-content/tutorials/gallery/05-ratings-reviews-profiles.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** `components/gallery/StarRating.tsx` (roving-tabindex arrow-key input), `components/gallery/ReviewsSection.tsx` (one per user, edit/delete own, owner can't review, report), `pages/ProfilePage.tsx`.

**Verified facts to cover:** 1–5 stars + optional written review; one per user per project; edit/delete your own; owners can't review their own project; username required to write (not to read); star input is keyboard-accessible (arrow keys); report inappropriate reviews; profiles at `/u/username` list published work; deleting a review needs no username (legacy-account cleanup principle).

**Frontmatter:**
```
---
title: Ratings, Reviews, and Profiles
difficulty: beginner
time: 6 min
summary: Star ratings and written reviews — who can write what — plus public author profiles.
keywords: rating, stars, review, report, profile, author
prerequisites: gallery/accounts-and-usernames
---
```

**Outline:** `## Rating a project` (keyboard NOTE) · `## Writing, editing, deleting` (rules list) · `## Reporting` · `## Author profiles` (still).

**Shots (append):** `gallery/reviews-section` still (FORKER signed in, review form visible on OWNER's project with stars set) · `gallery/profile-page` still (`/u/atlas-designs`).

- [ ] **Step 1:** Inventory.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (FORKER writes a short review first so the section isn't empty).
- [ ] **Step 4:** `node docs-capture/run.js gallery` — eyeball both.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 5 - ratings, reviews, profiles"
```

---

### Task 33: Tutorial — Forking (gallery/06)

**Files:**
- Create: `docs-content/tutorials/gallery/06-forking.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** the gallery detail Fork button (3-state: signed out / no username / ready), `POST /api/projects/:id/fork` semantics via `server/routes` (private copy, lineage recorded), CloudMenu's forked-from indicator, `docs/8-cloud-and-gallery.md`.

**Verified facts to cover:** the decision table — **Open in Editor** (no account, local only, no lineage, can't propose changes) vs **Fork** (account+username, private cloud copy, lineage link, can propose changes upstream); forks start **private** — never public unless you publish them; the editor's cloud menu shows "forked from upstream"; forking your own project is legitimate (experiments); fork copies the project's current commit.

**Frontmatter:**
```
---
title: Forking a Gallery Project
difficulty: intermediate
time: 7 min
summary: Fork vs Open in Editor — when each is right — and what a private fork with upstream lineage lets you do next.
keywords: fork, open in editor, upstream, private, lineage, copy
prerequisites: gallery/cloud-saves-and-history
---
```

**Outline:** `## Two ways to take a copy` (the decision table — this is the tutorial's centerpiece) · `## Forking, step by step` (clip: gallery page → Fork → editor with forked-from indicator) · `## Forks are private` · `## Why fork instead of clone` (merge requests teaser → gallery/07) · `[!TIP]` fork your own project to experiment safely.

**Shots (append):** `gallery/fork-button` still (project page, FORKER signed in) · `gallery/clip-fork-flow` clip (Fork click through to the editor's forked-from indicator visible in the open Cloud menu).

- [ ] **Step 1:** Inventory.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots.
- [ ] **Step 4:** `node docs-capture/run.js gallery` — the clip must end on the forked-from indicator.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 6 - forking"
```

---

### Task 34: Tutorial — Merge Requests: Proposing Changes (gallery/07)

**Files:**
- Create: `docs-content/tutorials/gallery/07-merge-requests-proposing.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** `components/cloud/ProposeChangesModal.tsx`, `pages/MergeRequestPage.tsx` (author view: status sentence "waiting for the owner to review"), `shared/diff.js` (change granularity: variant/template level), owner email notification (fire-and-forget, skipped for self-forks).

**Verified facts to cover:** flow = fork → edit → **Save to Cloud** → Cloud menu → **Propose changes to upstream**; the MR shows a structured change list (which templates/variants changed) + rendered before/after previews — not raw JSON; the diff is **recomputed live** on every view (upstream moved ⇒ the MR reflects it, possibly newly conflicted); author sees status guidance; the owner gets an email notification (not for self-forks); unsaved local edits aren't part of the MR — only cloud commits.

**Frontmatter:**
```
---
title: Merge Requests — Proposing Changes
difficulty: advanced
time: 9 min
summary: Send your fork's improvements upstream — what the owner will see, and why the diff always reflects the upstream's current state.
keywords: merge request, propose, upstream, diff, before after, contribution
prerequisites: gallery/forking
---
```

**Outline:** `## From fork to proposal` (numbered flow; WARNING: save to cloud first — the MR reads commits, not your screen) · `## What the owner sees` (structured diff still) · `## The diff is live` (NOTE) · `## After proposing` (author status view still; the notification email fact).

**Shots (append):** `gallery/propose-changes-modal` still (FORKER, fork edited + saved, modal open) · `gallery/mr-author-view` still (the MR page as its author after submitting).

- [ ] **Step 1:** Inventory.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (FORKER edits the fork — e.g. recolor an element — saves, proposes).
- [ ] **Step 4:** `node docs-capture/run.js gallery` — MR page still must show the structured change list.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 7 - proposing merge requests"
```

---

### Task 35: Tutorial — Merge Requests: Reviewing, Merging, Conflicts (gallery/08)

**Files:**
- Create: `docs-content/tutorials/gallery/08-merge-requests-reviewing.md`
- Modify: `docs-capture/scenarios/gallery.js` (append)

**Inventory:** `pages/MergeRequestPage.tsx` (owner view, `isTargetOwner` from the server, Merge/Close, conflict banner), `shared/diff.js` (`threeWayDiff` — what counts as a conflict: same template edited both sides, removed-vs-modified variants), merge endpoint behavior (re-verifies no conflict before writing; refuses merged/closed; validates result).

**Verified facts to cover:** owners see incoming MRs (link from the notification email or the MR page URL; check where incoming MRs are listed in-app and document that surface); the review page: change list, before/after page previews, status- and role-aware guidance ("review and merge below"); **merging applies only the fork's changes on top of the owner's current state** — the owner's independent edits survive; the merge lands as a normal commit in the owner's history (restorable like any other); **conflicts**: both sides changed the same template/variant → flagged, merge refused (UI and server); resolving = the author re-applies work on a fresh fork of the current upstream (no in-place rebase — document the actual workable path); closing without merging; the self-fork case works (owner == author).

**Frontmatter:**
```
---
title: Merge Requests — Reviewing, Merging, and Conflicts
difficulty: advanced
time: 10 min
summary: Review a structured diff with before/after previews, merge without losing your own edits, and understand exactly what conflicts.
keywords: merge, review, conflict, owner, before after preview, close, resolve
prerequisites: gallery/merge-requests-proposing
---
```

**Outline:** `## The owner's review page` (annotated still) · `## What merging actually does` (both-sides-survive explanation; lands as a commit) · `## Conflicts, precisely` (what conflicts / what doesn't — independent templates merge cleanly; table of conflict cases from threeWayDiff) · `## Resolving a conflict` (the honest workflow) · `## Closing` · `[!NOTE]` the self-fork case.

**Shots (append):** `gallery/mr-owner-review` still (OWNER on the MR page — change list + previews + Merge button) · `gallery/clip-merge` clip (OWNER clicks Merge → success state → the commit visible in history) · `gallery/mr-conflict` still (build the conflict: OWNER edits the same template the fork changed, saves, reloads the MR — conflict banner visible).

- [ ] **Step 1:** Inventory; enumerate conflict cases from `shared/diff.js`.
- [ ] **Step 2:** Write the markdown.
- [ ] **Step 3:** Append shots (the conflict still requires a second MR — have FORKER propose another small change first, then OWNER dirty the same template).
- [ ] **Step 4:** `node docs-capture/run.js gallery` — conflict still must show the real conflict messaging.
- [ ] **Step 5:** `npx vitest run tests/unit/docsAntiRot.test.ts` then `npx vitest run` — green.
- [ ] **Step 6:**
```bash
git add docs-content/tutorials/gallery/ docs-capture/scenarios/gallery.js public/docs-assets/gallery/
git commit -m "docs: gallery tutorial 8 - reviewing, merging, conflicts"
```

---
# Phase 7 — Reference Entries & Final Verification

**Reference entry pattern (Tasks 36–39):** each entry is a small markdown file `docs-content/reference/<category>/<slug>.md` with frontmatter `title`, `summary`, generous `aliases` (what would *you* type when you can't remember the real name?), `keywords`, and a body of 1–3 short paragraphs: what it is → where to find it in the UI → the gotcha, if any. Every entry links to its primary tutorial section (e.g. `[Grids II](/docs/editor/grids-calendars-and-data-shaping#dynamic-offset-step-by-step)`) — that link also powers the entry's automatic "Appears in" backlinks. Entries may reuse existing tutorial screenshots by referencing the same `/docs-assets/...` path — **no new captures in these tasks**. Facts come from the tutorials just written (already code-verified); when in doubt, re-check the source named in the corresponding tutorial task.

### Task 36: Reference — canvas tools, shortcuts, layers (14 entries)

**Files:**
- Create (category `canvas-tools`): `select-and-hand-tools` (aliases: cursor, pan tool, move tool) · `shape-tools` (aliases: rectangle, ellipse, circle, triangle, line) · `text-tool` (aliases: text box, label) · `grid-tool` (aliases: data grid, table tool) · `svg-import` (aliases: vector, artwork, logo, import svg)
- Create (category `shortcuts`): `undo-redo` (aliases: ctrl z, history) · `clipboard-shortcuts` (aliases: copy, cut, paste, duplicate, ctrl c, ctrl d) · `delete-and-nudge` (aliases: backspace, arrow keys, move by pixel) · `tool-shortcuts` (aliases: keyboard tools, v r t e y l g) · `stack-selection-shortcuts` (aliases: alt click, shift alt, cycle selection, select under)
- Create (category `layers`): `layers-panel` (aliases: layer list) · `layer-visibility-and-lock` (aliases: hide layer, lock layer, click through) · `layer-order` (aliases: stacking, z order, reorder layers) · `active-layer` (aliases: current layer, new elements layer)

**Content requirements:** tool entries name the shortcut key and the drag-to-create rule; `clipboard-shortcuts` documents the Ctrl+P paste alias and Ctrl+D's node/template duplication modes; `delete-and-nudge` documents the 1-vs-10-with-snap nudge rule; `stack-selection-shortcuts` compresses tutorial editor/04 into a lookup table; layer entries state the export/thumbnail exclusion and click-through semantics.

- [ ] **Step 1:** Write all 14 entries.
- [ ] **Step 2:** Run `npx vitest run tests/unit/docsAntiRot.test.ts tests/unit/docsContent.test.ts` — green (validates frontmatter + every tutorial link).
- [ ] **Step 3:** Load `/docs/reference` in the dev server; filter for "alt click" — the stack entry must surface.
- [ ] **Step 4:** Full `npx vitest run` — green. Commit:
```bash
git add docs-content/reference/
git commit -m "docs: reference entries - canvas tools, shortcuts, layers"
```

---

### Task 37: Reference — element properties + grid configuration (24 entries)

**Files:**
- Create (category `element-properties`): `fill-and-stroke` · `pattern-fills` (aliases: dots, lines pattern, bullet journal, dotted background) · `opacity` · `borders` (aliases: border style, dashed, border radius, rounded corners) · `per-side-borders` (aliases: border sides, top border only) · `rotation-and-transform-origin` (aliases: rotate, pivot, anchor point) · `z-index` (aliases: stacking order, bring to front) · `typography-controls` (aliases: font, bold, italic, align, vertical align) · `text-overflow` (aliases: clip, ellipsis, shrink, overflow modes) · `auto-width` (aliases: fit text, hug contents) · `text-padding` (aliases: inset, cell padding)
- Create (category `grid`): `grid-source` (aliases: current children, specific page, source type) · `display-field` (aliases: cell text, what cells show) · `grid-columns-and-gaps` (aliases: cols, gap, cell size, spacing) · `static-offset` (aliases: offset start, empty cells) · `dynamic-offset` (aliases: calendar offset, weekday offset, offset mode, dayOfWeekNum) · `offset-adjustment` (aliases: offset math, shift offset) · `data-slicing` (aliases: slice, window, rows of seven, week rows) · `traversal-path` (aliases: grandchildren, drill down, descendants grid) · `grid-border-modes` (aliases: all outside inside none, cell borders) · `header-row` (aliases: table header) · `first-column` (aliases: row labels) · `alternating-rows-and-columns` (aliases: zebra stripes, banding) · `empty-cell-borders` (aliases: show empty cells, offset cells)

**Content requirements:** every grid entry names its exact `GridConfig` field (e.g. `offsetField` + `offsetMode: 'dynamic'`) so searches for the JSON key also hit; `dynamic-offset` carries the three-line calendar recipe inline; `traversal-path` gets the Year→Days worked example in miniature; the one-cell-dimensions gotcha lives in `grid-columns-and-gaps` as a WARNING.

- [ ] **Step 1:** Write all 24 entries.
- [ ] **Step 2:** `npx vitest run tests/unit/docsAntiRot.test.ts` — green.
- [ ] **Step 3:** Dev-server check: search "calendar offset" in the sidebar box — the Dynamic Offset entry must be the first result.
- [ ] **Step 4:** Full `npx vitest run` — green. Commit:
```bash
git add docs-content/reference/
git commit -m "docs: reference entries - element properties and grid configuration"
```

---

### Task 38: Reference — linking, binding, generator API (21 entries)

**Files:**
- Create (category `linking`): `on-click-interaction` (aliases: interaction section, link element, make clickable) · `link-parent` (aliases: back button, go up) · `link-child-index` (aliases: nth child, first child) · `link-specific-node` (aliases: hard link, go to page) · `link-url` (aliases: external link, website) · `link-sibling` (aliases: next page, previous page, adjacent) · `link-ancestor` (aliases: levels up, grandparent) · `link-child-referrer` (aliases: back to week, referrer parent) · `link-referrer` (aliases: who references me)
- Create (category `binding`): `data-binding` (aliases: placeholder, curly braces, template variables) · `node-data-fields` (aliases: custom fields, metadata) · `child-referrer-formula` (aliases: child_referrer, week label formula) · `preview-node` (aliases: template preview, whose data)
- Create (category `generator`): `generator-overview` (aliases: hierarchy generator, scripting) · `templates-script` (aliases: stage 1, template definitions) · `hierarchy-script` (aliases: stage 2, node tree script) · `generator-constants` (aliases: A4_WIDTH, RM_PP_WIDTH, page sizes) · `create-id-helper` (aliases: createId, unique id) · `generator-preview` (aliases: visual preview, unused badge, sandbox) · `generator-apply-modes` (aliases: create as new, replace current project) · `generator-provenance` (aliases: saved scripts, generator source, publish scripts warning)

**Content requirements:** each link entry states which value fields it uses (`linkValue`, `linkSecondaryValue`, `linkReferrerParentType`) with the semantics Task 20 verified; `child-referrer-formula` shows the full argument signature + one example; `generator-constants` lists the four constants **with their numeric values**; `generator-apply-modes` covers the undo checkpoint and the name prompt.

- [ ] **Step 1:** Write all 21 entries.
- [ ] **Step 2:** `npx vitest run tests/unit/docsAntiRot.test.ts` — green.
- [ ] **Step 3:** Dev-server check: search "back to week" — `link-child-referrer` surfaces.
- [ ] **Step 4:** Full `npx vitest run` — green. Commit:
```bash
git add docs-content/reference/
git commit -m "docs: reference entries - linking, binding, generator API"
```

---

### Task 39: Reference — editor workspace + cloud/gallery (24 entries), alias sweep, cross-link pass

**Files:**
- Create (category `editor`): `variants` (aliases: device sizes, a4, remarkable, ipad) · `unit-selector` (aliases: pt px in mm, units, page size units) · `snap-to-grid` (aliases: magnet, snapping, show grid) · `alignment-tools` (aliases: align, distribute, spacing) · `json-inspector` (aliases: json editor, raw state, bulk edit) · `save-preset` (aliases: custom preset, reusable template project) · `export-pdf` (aliases: download pdf, generate) · `greyscale-export` (aliases: grayscale, black and white, e-ink) · `project-tabs` (aliases: multiple projects, tab bar)
- Create (category `cloud`): `cloud-save` (aliases: save to cloud, sync) · `commit` (aliases: snapshot, version) · `version-history-restore` (aliases: restore, revert, previous version) · `my-projects` (aliases: project list, storage) · `publish-and-unpublish` (aliases: make public, take down) · `gallery-tags` (aliases: tags, filtering, categories) · `open-in-editor` (aliases: clone, copy to local, use this template) · `download-all-variants` (aliases: zip download, all pdfs) · `fork` (aliases: copy with lineage, github style) · `merge-request` (aliases: propose changes, MR, pull request) · `merge-conflict` (aliases: conflicted, can't merge) · `ratings-and-reviews` (aliases: stars, feedback, report review) · `username` (aliases: handle, public name, change username) · `email-verification` (aliases: verify inbox, confirmation email) · `profile-page` (aliases: author page, u slash username)
- Modify: tutorial markdown files (cross-link pass — see Step 2)
- Modify: `pages/docs/DocsHomePage.tsx` only if the final home copy needs the reference-count blurb updated

**Content requirements:** `merge-request`/`merge-conflict` compress tutorials gallery/07–08 into lookup form; `fork` embeds the fork-vs-open-in-editor table in two lines; `username` states the exact 3–30 rule and which actions require one.

- [ ] **Step 1:** Write all 24 entries.
- [ ] **Step 2: Cross-link pass over all 25 tutorials.** For each tutorial, link the **first mention** of each major concept to its reference entry (e.g. first "dynamic offset" in editor/07 → `/docs/reference/dynamic-offset`). Also revisit the plain-text mentions deliberately left unlinked by Tasks 11 and 13 ("The four ideas" table; the shortcut-reference pointer) and turn them into links. Anti-rot guards verify every one resolves.
- [ ] **Step 3: Alias sweep.** Read every entry once asking "what else would someone type?" — add missed synonyms (plural forms matter less; the tokenizer handles prefixes). Verify the four canned searches: "calendar offset" → Dynamic Offset · "back to week" → link-child-referrer · "zebra" → alternating rows · "pull request" → merge-request.
- [ ] **Step 3b: Video episodes check** (spec's "absorb existing content" item). Run `grep -rin "youtube" --include="*.md" --include="*.js" --include="*.json" tutorial/ docs/ README.md`. If published episode URLs exist in the repo, add a small "Video series" card to `DocsHomePage` linking them; if none exist, skip — the four walkthrough animations are already embedded in tutorials (Tasks 11, 12, 18, 23) and no URL may be invented.
- [ ] **Step 4:** `npx vitest run tests/unit/docsAntiRot.test.ts` then full `npx vitest run` — green.
- [ ] **Step 5:** Commit:
```bash
git add docs-content/
git commit -m "docs: reference entries - workspace and cloud; cross-link and alias sweep"
```

---

### Task 40: Final verification — full capture regen, suites, real-browser drive

**Files:** none new (fixes only, if the drive finds problems).

- [ ] **Step 1: Full capture regeneration.** `node docs-capture/run.js` (all scenarios, default out). Expect every shot `✓`; review `git diff --stat public/docs-assets` — only intentional changes. Investigate any `⚠ orphan asset:` line: delete the asset or reference it.
- [ ] **Step 2: Full unit suite.** `npx vitest run` — green.
- [ ] **Step 3: E2E suite.** `npx playwright test` — green. If `tests/e2e/navigation.spec.js` (or any spec) asserts old docs-page content, update those assertions to the new docs home (heading "Documentation", track sections) — assertion updates only, no weakening.
- [ ] **Step 4: Real-browser drive of `/docs`** (dev server + Playwright throwaway script or manual, per house rule). Checklist — each item must be seen working:
  - Home: four numbered tracks, every card navigates; Reference card navigates.
  - Follow the recommended path start → getting-started/01 → prev/next chain walks the whole Getting Started + Editor tracks in order.
  - A tutorial page: TOC anchors scroll; breadcrumb returns home; prerequisites navigate; difficulty/time badges render.
  - Search: `/` focuses; "calendar offset" → Dynamic Offset entry (Enter navigates); "slicing" result deep-links into the grids tutorial at the right heading; Escape closes.
  - Reference: index filter narrows live; an entry page shows aliases + "Appears in" backlinks that navigate.
  - Figures: a still zooms in a lightbox and closes; a clip (e.g. `clip-drag-create`) animates; captions render.
  - Callouts, kbd chips, code blocks, tables render styled in a real tutorial.
  - Direct URL load of a deep page (`/docs/editor/grids-calendars-and-data-shaping`) renders standalone (SPA fallback intact).
  - Old bookmarks: `/docs` still lands on docs (route swap didn't orphan the path).
- [ ] **Step 5: Fix anything found** (test-first where it's code), rerun the affected checks.
- [ ] **Step 6: Final commit + wrap.**
```bash
git add -A
git commit -m "docs: final capture regeneration and verification fixes"
```
Then use superpowers:requesting-code-review for the whole-branch review, and superpowers:finishing-a-development-branch to integrate `feature/docs-overhaul`.

---

## Execution notes

- **Task order is the dependency order.** Nothing in Phases 3–6 starts before Task 9; gallery tasks (28–35) also need Task 10. Within a wave, tasks are sequential (each appends to the shared scenario file).
- **Scenario reruns are idempotent** — a content task rerunning its track's scenario regenerates earlier tasks' assets too; that's by design (byte-identical unless the UI changed; review diffs).
- **If a capture exposes a real app bug** (a control that doesn't do what its label says), stop the content task, file/fix it the house way (systematic-debugging, test-first) as its own commit, then resume the tutorial with the true behavior.
- **Fact bullets vs code:** the plan's bullets were verified against the codebase at planning time (2026-07-19). The code is still the authority at execution time.
