# Dev Onboarding Playground — Design

**Date:** 2026-08-07
**Status:** Approved (brainstorm complete)

## Goal

An interactive, self-contained HTML page that onboards a new developer to this
repository: what PDF Architect is, how the code is laid out, how the major flows
work end to end, why the nuanced decisions were made — and a playground of
progressively harder quizzes and games that make the reader engage with the
material actively instead of skimming it.

**Audience:** a developer new to this repo (not an end user of the product).
**Tone/skin:** a tmux/terminal session — dark, monospace, panes, status bar.

## Non-goals

- No server component; the page must work opened via `file://` with no network.
- Not part of the product bundle or any app route; the app's build is untouched.
- No light theme (the terminal skin is deliberately dark); animations respect
  `prefers-reduced-motion`.
- No live execution of app code beyond the bundled diff engine (see Merge Lab).
- No embedded iframe of the running app.
- No reverse-sync: nothing on this page writes back into the app or repo.
- No draggable pane resizing, no i18n, no mobile-first work (panes stack on
  narrow screens; desktop is the target).

## Delivery model

**Assembled static page.** Authored source lives in `onboarding/src/` as plain
ESM modules plus HTML/CSS shell parts. A build script (`onboarding/build.mjs`)
scans the repository for live data, extracts code excerpts by anchor, bundles
the real diff engine, and concatenates everything into a single committed,
self-contained `onboarding/index.html`. Double-clicking that file opens the
playground; no build tooling, dev server, or network needed to *view* it.

Regeneration is manual (`node onboarding/build.mjs`), same policy as
`docs-capture/`: rerun after meaningful repo changes. The page footer shows
`generatedAt` and the git short SHA the build saw, so staleness is visible
rather than silent. There is deliberately **no** freshness hash test (it would
fail on every unrelated commit); anti-rot tests guard *integrity* instead
(paths exist, anchors resolve — see Testing).

### Directory layout

```
onboarding/
  README.md            # what this is, how to regen, how tests guard it
  build.mjs            # scanner + excerpt extractor + bundler + assembler
  index.html           # committed build output, fully self-contained
  src/
    shell.html         # page skeleton with {{PLACEHOLDER}} slots
    style.css          # full stylesheet
    app.js             # runtime: windows, panes, router, keyboard, components
    content/
      intro.mjs        # window 1 authored content
      tours.mjs        # window 2 tours: steps, diagrams, file refs
      code-map.mjs     # window 3 annotations + deep dives + excerpt anchors
      playground.mjs   # window 4 quizzes, bug hunt, merge scenarios, wdil
  tests/
    onboarding.test.mjs   # anti-rot + data-shape + parity tests (vitest)
    fixtures/             # diff-engine parity fixtures
```

Content modules are plain ESM exporting data objects (no DOM access), so vitest
imports them directly. `build.mjs` imports the same modules and serializes them
into the assembled page — one source of truth, testable and shippable.

## Page chrome (tmux skin)

- Bottom status bar: `[doctect]` session name, window list
  `1:intro 2:tours 3:code 4:playground` with the active window highlighted,
  and a live clock. Windows are the top-level navigation.
- Every window is a CSS-grid arrangement of panes; each pane has a tmux-style
  titled border (`┌ pane-title ─┐` look, done with CSS borders + a title chip,
  not literal box-drawing text).
- Keyboard: `1`–`4` switch windows when no input is focused; `?` toggles a
  keybinding help overlay (tmux `list-keys` flavor); `/` focuses the search
  input in the Code window; `Esc` closes overlays. Everything keyboard-reachable
  is also clickable — keys are flavor, not a requirement.
- URL hash routing (`#/tours/publish/3`) so any window/tour/step/activity is
  deep-linkable and survives refresh.
- First visit: a short fake boot sequence types a few lines
  (`connecting to doctect...`, test/migration counts) then reveals the UI.
  Skippable by click/keypress, skipped entirely under `prefers-reduced-motion`,
  never shown again once seen (localStorage flag).
- Narrow screens: panes stack vertically; the status bar wraps. Nothing may
  horizontally scroll the page body.

## Window 1 — INTRO

Two-column layout.

**Left pane — "about":** authored. What PDF Architect is (local-first document/
planner editor targeting e-ink PDFs, with a public gallery, forking, and merge
requests). The stack in one paragraph (React 19 + Vite client, Express server,
SQLite dev / Postgres prod, better-auth, shared plain-JS diff engine). How to
run it: `npm run dev`, `npm test`, `npm run test:e2e`, where the docs live
(`/docs` in-app, `docs/superpowers/` for specs/plans).

**Right column — two panes:**
- **"vitals"** — generated. File and line counts by top-level area, unit-test
  file count, migration count (with latest name), server route mounts, current
  client schema version, dependency count. Rendered as a terminal `top`-style
  readout.
- **"house method"** — authored. The working method: brainstorm → spec → plan →
  fresh implementer per task, test-first → independent per-task review →
  whole-branch review. Why it exists, with two or three concrete catches only a
  whole-branch review could make (from the walkthrough). Below it, a timeline
  of rounds derived from `docs/superpowers/specs/` filenames (generated list,
  authored one-line labels; specs without a label fall back to a prettified
  filename).

## Window 2 — TOURS

A story player. Left pane: tour list, then the active tour's steps with 1–3
sentences of authored commentary per step. Right pane: an authored ASCII
architecture diagram per tour; the current step highlights its boxes (spans
with CSS classes, not re-rendered text). Bottom strip: files touched by the
current step — each is a clickable ref that jumps to the Code window with that
file selected — plus an excerpt toggle where an anchor exists.

Six tours:

1. **Local-first: a project's life in the browser** — AppState shape, reducer,
   localStorage persistence, schema migrations v1→v11 and why presets/imports
   need explicit version stamping.
2. **Save to cloud** — sign-in gate, `stateCodec` gzip snapshot, `If-Match`
   head tag, transactional compare-and-swap advance, stable 409 on staleness.
3. **Publish: the pinned snapshot** — `published_commit_id` vs private head,
   why gallery readers never see the live head, thumbnails pipeline
   (jsPDF → pdfjs-dist → WebP), listing metadata pinned at publish.
4. **Fork → merge request** — fork copies the published commit; three-way diff
   against the common ancestor; live recompute on every view; conflict rules;
   merge re-verification inside the lock.
5. **Export to PDF** — jsPDF, the renderer-independent `textLayout` engine and
   its canvas/PDF parity contract, svg2pdf color normalization, link
   annotations.
6. **A signup's journey** — better-auth, the signup-cap `before`-hook choke
   point, email verification, the username gate (`requireUsername`) and which
   routes deliberately skip it.

## Window 3 — CODE

**Left pane — file tree:** generated at build time. Collapsible directories,
file sizes and line counts, filter box (`/`). Curated entries carry a one-line
authored annotation inline. Excluded from the scan: `node_modules`, `dist`,
`scratch`, `playwright-report`, `archives`, `tutorial-videos`, `.git`,
`server/analytics.db`, lockfiles. `gallery-samples/` is included but collapsed.

**Right pane — detail:** for a curated file or directory: authored commentary —
what it is, why it exists, gotchas — plus, where defined, a real code excerpt
extracted at build time. For uncurated files: generated facts (size, lines)
plus the nearest ancestor directory's commentary, so no selection is ever a
dead end. Target ≈40 curated entries covering every top-level directory and
the load-bearing files.

**Deep dives** — a curated list in the tree pane's footer; each is a sequence
of (excerpt, commentary) sections rendered in the detail pane:

1. `shared/diff.js` — changesets, three-way conflict detection, applyChangeSet.
2. `services/textLayout.ts` — one layout engine, two thin adapters; the parity
   suite idea; the binary-search-to-linear-scan ellipsis story.
3. Generator sandbox (`services/generatorSandbox.ts`) — the trust model:
   sandboxed iframe, disposable Worker, captured intrinsics, why Preview→Apply
   replaced Run.
4. Migrations (`server/migrations/`) — run-once versioned DDL, advisory locks,
   the immutability/suspension **triggers** as database-level guarantees.
5. Publication pinning (`server/routes/projects.js`) — publish
   validate→lock→write, `withTransaction`, If-Match idioms.
6. `server/validateAppState.js` — structural validation, caps, why every write
   path funnels through it.
7. The dotenv seals — present-but-empty guards, why `delete process.env.X`
   resurrects, the four places it was sealed.
8. Auth stack (`server/auth.js` + middleware) — hooks as choke points, the
   normalized-path admin bypass fix, owner reconciliation.

Excerpts use **anchors** declared in `code-map.mjs`: `{file, start, end}` where
`start`/`end` are unique literal substrings (typically a function signature).
`build.mjs` fails loudly if an anchor matches zero or multiple times. Rendered
with a minimal hand-rolled keyword highlighter (keywords/strings/comments only).

## Window 4 — PLAYGROUND

**Hub pane:** four activity cards plus overall progress and a rank derived
from total score: `visitor → intern → contributor → reviewer → maintainer`.
Progress persists in localStorage under one key (`doctect-onboarding`, a
single JSON object, versioned so future shape changes can migrate or reset).

1. **Quiz ladder** — five levels × 8 authored multiple-choice questions (40
   total):
   L1 orientation (what/where basics), L2 client architecture, L3 server &
   data model, L4 security & integrity decisions, L5 war stories & nuances.
   One correct answer each; every answer shows an explanation citing the
   walkthrough or a file. Scoring ≥6/8 unlocks the next level; retries allowed.
2. **Bug Hunt** — seven real historical bugs, reconstructed as small code
   panels in their buggy form. The player clicks the line they suspect; reveal
   shows the guilty line, the true story (authored, from the walkthrough), the
   actual fix, and where the code lives now. The seven: dotenv resurrection;
   `DISABLE_AUTH_RATE_LIMIT` fail-open truthiness; tag-search `LIKE` wildcard
   leak; `providerId` vs `provider`; SQLite second-resolution commit-timestamp
   ordering; `Number(' ') === 0` signup-cap parse; the `res.sendFile` SPA
   fallback 404.
3. **Merge Lab** — the real diff engine, live. Three JSON editor panes (base /
   fork / upstream) with a scenario dropdown: clean merge, same-template
   conflict, remove-vs-modify, variant renamed both sides, generator conflict.
   Buttons run `computeChangeSet`, `threeWayDiff`, `applyChangeSet` from the
   bundled engine; the output pane pretty-prints changesets, conflicts, and
   the merged state. Malformed JSON shows an inline parse error, never a crash.
4. **Where-does-it-live** — ten authored behavior prompts ("who sanitizes
   SVG before it hits the DOM?"), answered by picking a file in the same tree
   component; three tries then reveal, with a hint after the first miss.
   Answers may list several acceptable paths.

## Build script (`onboarding/build.mjs`)

Node ≥ 20, no new dependencies. Steps:

1. **Scan** the repo into a tree (respecting the exclusion list), recording
   per-file byte size and line count, per-directory rollups.
2. **Vitals**: count unit-test files (`*.test.*` outside e2e), read migration
   names from `server/migrations/index.js`, route mounts from `server/app.js`,
   `CURRENT_SCHEMA_VERSION` from `services/migration.ts`, dependency counts from
   `package.json`, spec filenames from `docs/superpowers/specs/`.
3. **Excerpts**: resolve every anchor in `code-map.mjs`; fail the build with a
   named error if any anchor is missing or ambiguous.
4. **Diff engine bundle**: read `shared/generatorMetadata.js` +
   `shared/diff.js`, strip `import`/`export` statements, wrap in an IIFE that
   assigns `window.DoctectDiff`. No other transformation.
5. **Assemble**: inject serialized data + content + bundle + CSS + JS into
   `shell.html` placeholders; write `onboarding/index.html` with a
   `generatedAt` timestamp and git short SHA in the footer.

Build output is deterministic apart from the timestamp/SHA footer.

## Testing (vitest, house style)

`onboarding/tests/onboarding.test.mjs`, included in the normal unit run:

- **Path integrity**: every file path referenced anywhere in the four content
  modules (annotations, tour file refs, quiz/bug/wdil citations, anchors,
  deep dives) exists on disk.
- **Anchor integrity**: every anchor resolves to exactly one match.
- **Data shape**: every quiz question has exactly one correct option and a
  non-empty explanation; every bug-hunt entry has a valid guilty line index;
  every where-does-it-live prompt's accepted answers exist; tour step file
  refs are non-empty.
- **Diff-bundle parity**: run the fixture scenarios through the real ESM
  `shared/diff.js` and through the IIFE-transformed bundle (via `node:vm`);
  outputs must be deeply equal. This pins the transform, so the playground can
  never drift from the engine the server actually enforces.
- **Assembly smoke**: `build.mjs` exports its pure steps (scan/extract/
  transform/assemble) so tests exercise them without writing files.

Real-browser verification of the assembled page (windows switch, tours play,
Merge Lab runs, state persists) happens at the end of implementation, per the
house method's final-task convention — throwaway Playwright drive, not a
committed spec.

## Error handling

- Build: any missing anchor, unreadable file, or unresolvable vital fails the
  build with a message naming the content entry — never a silently thinner page.
- Runtime: the page renders entirely from embedded data; the only user input
  channels (Merge Lab JSON, filter/search boxes) show inline errors on bad
  input. localStorage read failures fall back to a fresh profile without
  crashing; writes are wrapped so a full store never breaks interaction.

## Decisions log

- Static assembled page over app route or hand-written file — approved.
- Hybrid freshness: generated data + authored commentary — approved.
- All four playground activities — approved.
- Dark-only terminal skin; reduced-motion respected — approved.
- Manual regeneration policy mirroring `docs-capture/`; integrity tests, no
  freshness test — approved.
