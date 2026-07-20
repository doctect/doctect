# In-App Documentation Overhaul — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorm complete)

## Goal

Replace the single hardcoded `/docs` page with a full documentation section: multiple tutorials per domain ordered simple→complex, a searchable indexed reference of every tool and concept, and screenshots/animated captures throughout — all generated and guarded so they can't silently rot.

User priorities driving this:

- Editor coverage of **all** tools and capabilities, including keyboard shortcuts and the non-intuitive parts of grid configuration and linking.
- Advanced generator techniques for building complex documents.
- Gallery usage with and without an account, especially forking/merging, which users find challenging.
- A clear simple→complex pathway so nobody feels lost.
- Every detail searchable via an indexed lookup, not just buried in tutorial prose.
- Heavy visual support: stills plus short animated captures.

## Decisions (settled in brainstorm)

| Decision | Choice |
|---|---|
| Content storage | Markdown files in repo, bundled at build via `import.meta.glob('?raw')` |
| Rendering | Existing `react-markdown` v10 + custom renderers; no new dependencies |
| Screenshots | Committed Playwright capture pipeline (reusing `tutorial/lib`), rerunnable |
| Motion | Stills + short looping animated webp clips (3–10 s, no audio) where motion is the point |
| Search | Curated reference entries (weighted high) + full-text over tutorials, client-side index built from the same bundled markdown |
| Pathway | Four tracks, each ordered basics→advanced, plus a "start here" learning-path home |
| Existing content | Absorbed: current page rewritten into new structure, 4 walkthrough webps re-homed, video episodes linked |

## Architecture

### Content layout

```
docs-content/
  tutorials/<track>/<nn>-<slug>.md     # tracks: getting-started, editor, generator, gallery
  reference/<category>/<slug>.md       # atomic entries
```

Frontmatter fields: `title`, `track`, `order`, `difficulty` (beginner|intermediate|advanced), `time` (read estimate), `keywords`, `aliases`, `summary`, `prerequisites` (tutorial slugs). Parsed by a hand-rolled ~30-line parser (`---`-delimited, `key: value`, string lists).

### Loader

`lib/docsContent.ts`: eager `import.meta.glob` over `docs-content/**/*.md`, parses frontmatter, exports typed `tutorials[]` (sorted by track+order) and `referenceEntries[]`. Validates unique slugs and resolvable prerequisites; validation is unit-tested so a bad content file fails the suite, not production.

### Routes (replace current `/docs`)

- `/docs` — learning-path home: track cards, recommended order, search box.
- `/docs/:track/:slug` — tutorial page: rendered markdown, right-side TOC built from headings, prev/next within track, difficulty badge, breadcrumbs.
- `/docs/reference` — reference index grouped by category, instant filter.
- `/docs/reference/:slug` — single entry page, deep-linkable from tutorials and search results.

Old `pages/DocsPage.tsx` retired, replaced by `pages/docs/` (home, tutorial, reference index, reference entry + shared sidebar layout). `AppHeader` stays.

### Rendering

`DocsMarkdown` component wrapping `react-markdown` with custom renderers:

- `img` → figure with caption and click-to-zoom lightbox; animated `.webp` clips flow through the same `<img>` tag, styled as a clip.
- GitHub-style callouts: `> [!TIP]`, `> [!NOTE]`, `> [!WARNING]`.
- `kbd:Ctrl+Z` inline-code convention → `<kbd>` chip.
- Internal `/docs/...` links → react-router `Link` (no full page reload).
- Styled tables for shortcut/option matrices.

### Assets

`public/docs-assets/<area>/<shot-id>.png|.webp`, committed to the repo (same policy as existing walkthrough webps).

## Content plan

**Ground rule:** every content wave starts with a feature-inventory pass reading the actual source (`Canvas.tsx`, `PropertiesPanel.tsx`, `EditorToolbar.tsx`, `GridSourceModal.tsx`, `HierarchyGeneratorModal.tsx`, …) so documented options, shortcuts, and behaviors come from code, not memory.

### Getting Started track (2 tutorials)

1. What PDF Architect is — nodes/templates/variants/data-binding mental model, interface tour. *(beginner)*
2. First document from a preset — load 2026 Planner, explore hierarchy, edit, export PDF. *(beginner)*

### Editor track (10 tutorials)

1. Canvas basics — pan/zoom/snap, click-drag-to-create (documented gotcha), select/move/resize, undo.
2. Elements & properties — text, shapes, lines, fills/patterns (dots-for-bujo trick), fonts, opacity, z-index.
3. Layers — panel controls, hide/lock semantics (canvas + export + thumbnails), reorder; lock-the-background pattern.
4. Selecting overlapped elements — click-cycle, Alt-click, Shift+Alt cycle-add, right-click select-under menu, panel row selection. *(the non-intuitive cluster)*
5. Data binding — `{{title}}`, date fields, custom node data, where data comes from.
6. Grids I — sources (current vs specific page children), rows/cols, display fields, cell links.
7. Grids II: calendars & offsets — dynamic offset via `dayOfWeekNum`, adjustment, building a real month grid. *(non-intuitive)*
8. Linking — all four targets (parent / child-index / child-referrer / specific-node), back buttons, nav bars.
9. References & referrer formulas — reference nodes, `{{child_referrer:...}}` arguments, week-overview build.
10. Variants, SVG, JSON inspector, export — multi-device workflow, unit selector, SVG import/limits, inspector modes, grayscale export.

### Generator track (5 tutorials)

1. Generator basics — two-stage model, first script, preview sandbox flow, create-as-new vs replace.
2. Templates in code — element type catalog, positioning, styling, grid config in JS.
3. Hierarchy logic — nodes/rootId contract, loops, data fields, references in code.
4. Build a full dated planner — real calendar math, week reference nodes, referrer labels, linking. *(advanced)*
5. Advanced patterns — techniques mined from the 8 `gallery-samples` projects (trackers, indexes, multi-variant), debugging failed generation. *(advanced)*

### Gallery & Collaboration track (8 tutorials)

1. Browsing without an account — search/tags/sections, project pages, Open in Editor, zip download, version-history clone.
2. Accounts — signup, email verification, username (why it's required), Google sign-in, settings.
3. Cloud saves & history — commits, restore, My Projects.
4. Publishing — wizard, preview thumbnails, tags, generator-source warning, unpublish.
5. Ratings, reviews, profiles.
6. Forking — fork vs Open-in-Editor distinction, fork workflow, upstream link.
7. Merge requests: proposing — fork → edit → save → propose; what the diff shows.
8. Merge requests: reviewing & conflicts — owner review, merge, what conflicts and how to resolve them (including the self-fork case).

### Reference section (~60–80 atomic entries)

Categories: canvas tools, element properties, grid configuration (one entry per option), link targets, binding formulas, keyboard shortcuts, layers, generator API (constants, `createId`, stage contracts), cloud & gallery terms.

Each entry: one-paragraph definition, aliases (e.g. "calendar offset" → Dynamic Offset), mini screenshot where useful, see-also links into tutorials.

### Pathway presentation

Every tutorial: difficulty badge, prerequisites, several stills/clips, prev/next. The home page draws the recommended path — Getting Started → Editor 1–5 → branch by interest (rest of Editor / Generator / Gallery).

## Capture pipeline

New `docs-capture/` directory, sibling of `tutorial/`, reusing `tutorial/lib/servers.js` (sealed servers: temp SQLite, stubbed email) and `tutorial/lib/cursor.js` (cursor overlay for clips; stills are cursor-free).

Scenario files (`docs-capture/scenarios/*.js`), one per docs area; each exports a shot list:

```js
{ id: 'editor/grid-config-dynamic-offset',   // → public/docs-assets/editor/grid-config-dynamic-offset.png
  kind: 'still' | 'clip',
  viewport | cropTo: selector,               // element-level crops for panel close-ups
  run: async (page, ctx) => { ... } }
```

- **Stills:** fixed 1600×1000 viewport, `page.screenshot`, optional element crop. Deterministic via seeded preset/generator projects and static 2026 dates.
- **Clips:** Playwright video → ffmpeg → looping animated webp (3–10 s, no audio). Same ffmpeg toolchain `tutorial/assemble.js` uses.
- **Cloud/gallery scenarios** script real flows against the sealed server: sign up, verify directly in the test DB, publish, second user forks, opens a merge request (the ep4/ep5 pattern).
- Runner: `node docs-capture/run.js [scenario]` — regenerate one area or all; regenerated images reviewed via git diff.

### Anti-rot guards

1. Every asset referenced in docs markdown exists in `public/docs-assets/` — broken image fails the unit suite.
2. Every captured asset is referenced by some markdown file — reported as a warning by the capture runner (not a test failure, so shots can land ahead of their content wave).
3. Every internal `/docs/...` link resolves to a real slug/anchor — fails the unit suite.

## Search

`lib/docsSearch.ts`, no new dependencies (~100 lines):

- Index built lazily client-side from the same bundled markdown — cannot drift from content.
- Two weighted layers: reference entries (title > aliases > keywords > body) rank above tutorial full-text (headings > paragraphs); phrase and prefix bonuses.
- Results grouped **Reference** / **Tutorials**; tutorial hits deep-link to the nearest heading anchor.
- UI: search box in the docs sidebar on every docs page — `/` focuses, arrow keys + Enter navigate, matches highlighted, category badges. The reference index page reuses the same matcher for its instant filter.

## Testing

- **Unit:** frontmatter parser; loader validation (all files parse, unique slugs, prerequisites resolve); search ranking (alias hit lands the right entry, heading anchors correct); anti-rot guards 1 and 3.
- **Component:** docs shell renders; custom renderers (callout, kbd, figure/lightbox, router-link) behave.
- **Real-browser final verification** (house rule): drive `/docs` in a real browser — follow the learning path, search "calendar offset" → Dynamic Offset entry, confirm stills render and clips animate.
- **Capture pipeline:** committed smoke scenario proving the runner works end to end.

## Phasing (one spec, phased implementation plan)

1. **Infra** — loader, routes, docs shell, renderers, search.
2. **Capture pipeline** — runner + first scenario.
3. **Content waves** — Getting Started → Editor → Generator → Gallery; each wave = feature inventory from code, write markdown, capture shots, cross-link.
4. **Reference entries** — built alongside waves, completed and alias-swept last.
5. **Polish + real-browser verification.**

Effort concentrates in the content waves — each tutorial needs accurate code-derived detail plus scripted captures.

## Out of scope

- New video episodes (existing five stay linked, not remade).
- Localization.
- Server-side search or analytics on doc usage.
- Versioned docs (docs describe current `main` only).
