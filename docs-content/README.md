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
