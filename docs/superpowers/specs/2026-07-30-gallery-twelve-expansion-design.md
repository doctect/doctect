# Gallery Expansion: Twelve New Flagship Generators (slots 09–20)

**Date:** 2026-07-30
**Status:** Approved design, pending implementation plan

## Goal

Grow the public gallery from ~10 live listings to ~22 by adding twelve new flagship-depth
document products, delivered — like the existing eight — as paste-into-generator scripts in
`gallery-samples/`. Each is a hyperlinked, reMarkable-first PDF product with its own visual
identity, a guided example branch, a committed test spec, and a gallery-ready listing text.
Publishing itself is out of scope: the user pastes, renders, and publishes each project on
doctect.app manually from the prepared material.

## What already exists (context)

- `gallery-samples/01–08`: eight flagships (Study Compass, Project Desk, Money Map,
  Wellbeing Rhythm, Seasonal Kitchen, Field Notes from Elsewhere, Story Atelier, The
  Wayfarer Codex). Six are live on doctect.app; the live gallery also carries a two-year
  puzzle almanac, a sudoku book, a 2026 planner, and an RPG tracker.
- `tests/helpers/gallerySampleHarness.ts` executes both generator scripts exactly as the
  modal does (two `new Function` scopes) and validates structure, links, references,
  bounds, grid borders, and example chrome. Per-product specs live in
  `tests/unit/gallerySamples/`, plus `collection.test.ts` across the set.
- `scratch/render_project.mjs` / `render_all.mjs` drive the real app (needs
  `npx vite --port 3002`) to screenshot template tabs and export the PDF.

## Shared contract (all twelve inherit)

Identical to the flagship conventions established by the 2026-07-12 redesign:

- **Page target:** reMarkable Paper Pro, 509×679, single variant, grayscale e-ink palette.
- **Skeleton:** cover (full-page tap link + CTA) → **Start Here** (how to use) → guided
  **EXAMPLE** branch (bound `EXAMPLE` eyebrow + skip-to-blank link on every example page)
  → clean blank workspace. Two products adapt this honestly rather than mechanically:
  the gamebook's adventure and the quiz's question rounds ARE the product, not examples —
  there the EXAMPLE chrome applies to the worked authoring/hosting specimen instead
  (each product's section below says exactly how).
- **Per-product identity:** own palette (grays), typography, and SVG artwork. No shared
  Cornell chrome.
- **Generator contract:** templates script uses bare consts `RM_PP_WIDTH`/`RM_PP_HEIGHT`,
  no `createId`, returns `{ templateId: template }`; hierarchy script uses
  `createId('prefix')` + `templates`, returns `{ nodes, rootId }`; node =
  `{id,parentId,type,title,data{},children[],referenceId?}`.
- **Nav chrome:** data-bound labels (`{{nav_prev_label}}`-style) over `sibling` /
  `child_index` / `parent` links, label set `''` at true dead ends. Controls that must
  vanish when empty are **unfilled text chips** (visible `textColor`, no `fill`) — a
  filled rect bound to a possibly-`''` label paints an empty colored box (established
  gotcha). Only always-labelled buttons may be filled.
- **Known engine constraints honored:** `elementBounds` ignores rotation, so no rotated
  text (horizontal labels only); jsPDF WinAnsi glyph safety — use `»`, `«`, `–`, `·`,
  never `→`/`▸`/`↓`; template `name` must differ from every node title (render-tooling
  selector collision); `sibling` links get cousin fallback in export, `child_index`
  links do not.
- **Reference nodes** resolve to the original node's page in PDF export (zero duplicate
  pages) — used where a shared sheet must appear in several places in reading order.
- **Config:** `DEFAULT_CONFIG` const at the top of `hierarchy.js` with documented integer
  ranges, per the existing README convention.

## Per-project deliverables

Each project `NN-slug/` ships:

1. `templates.js`, `hierarchy.js` — the two generator scripts.
2. `README.md` — opens with the gallery-ready listing text (`# Product Name`, one-para
   pitch, `## Why you'll like it` bullets, `## Workflow` steps), then `## Configuration`,
   page inventory, navigation map, and **`## Publishing`**: suggested tags (5–8) and the
   six suggested preview pages by template-tab name, so the user can publish without
   re-deriving anything.
3. `samples/` — key-page PNGs plus exported `<slug>.pdf`, produced by the render tooling.
4. A committed harness spec `tests/unit/gallerySamples/<camelCase>.test.ts` asserting:
   page count, palette discipline, nav labels and dead-end `''` suppression, link
   topology (every declared cross-link resolves), example chrome, bounds, and each
   product's signature mechanic (listed per project below). `collection.test.ts` grows
   to cover all twenty.

## The twelve products

### 09 — The Branching Road (`09-adventure-gamebook`)

A choose-your-own-adventure gamebook where hyperlinks are the story mechanic, plus an
authoring kit for writing your own.

- **Identity:** vintage gamebook — heavy serif-feel headers, numbered-section typography,
  compass-rose / forking-path SVG on the cover.
- **The adventure:** one complete original story (50 numbered sections, working title
  *The Branching Road*), 2–4 choices per section as tappable chips (`specific_node`
  links wired by an id map in the hierarchy script), at least one loop, honor-system
  item gates ("If you took the lantern …"), and 5 endings (2 good, 3 bad) on a distinct
  ending template with a return-to-start link. A reader's tracking sheet (sections
  visited, items carried) sits beside the story.
- **Authoring kit (the blank workspace):** story-map worksheets, a branch-planning page,
  and blank numbered section pages with writable choice lines (no links — destinations
  are handwritten; only the authored adventure carries live links). The EXAMPLE chrome
  lands here: a worked story-map of the included adventure, EXAMPLE eyebrow +
  skip-to-blank.
- **Signature test assertions:** every choice link resolves to an existing section; every
  section is reachable from section 1; all five endings are reachable; no section other
  than endings is a link dead end.

### 10 — Quiz Night (`10-trivia-quiz-night`)

A self-scoring pub-quiz companion: tap a question, reveal its answer, keep score — plus a
host kit with pre-linked blank rounds for writing your own quiz.

- **Identity:** chalkboard pub-quiz — big numerals, double-rule dividers, pint-glass and
  question-mark SVG motifs.
- **Content:** 6 themed rounds (General, Science & Nature, History, Geography, Arts,
  Wildcard) × 10 questions. Question page: big question text, write-your-answer lines,
  `Reveal »` chip to the answer page. Answer page: the answer, one fun-fact line,
  `Next question »` + `Back to round`. Round hub lists its ten questions (links + score
  boxes); a score ledger tracks up to 6 teams per round plus a grand-total page.
  Questions must be evergreen and verified correct by the task's reviewer — no
  time-sensitive facts.
- **Host kit:** 2 blank rounds whose ten Q↔A page pairs are already cross-linked, so a
  hand-written quiz gets working reveal navigation for free. EXAMPLE chrome: one worked
  specimen question in the host kit.
- **Signature test assertions:** every question links to its own answer and back; blank
  host-kit pairs are pre-linked; 60 authored questions have non-empty answers.

### 11 — Opening Atlas (`11-chess-opening-repertoire`)

A chess opening repertoire organized as a navigable move tree: each position is a page,
each candidate move a link deeper.

- **Identity:** classic chess-book — file/rank serif labels, rule-framed diagrams.
- **The board:** a static SVG checkerboard with 64 small bound text cells overlaid
  (`{{a1}}`…`{{h8}}`), pieces as letters (uppercase white, lowercase black; legend on
  Start Here). No Unicode chess glyphs (PDF font risk), no data-bound SVG.
- **Content:** White and Black repertoire hubs → 4 opening chapters (e.g. Italian Game,
  Queen's Gambit, Sicilian Defence, French Defence), ~10 position pages each. Position
  page: board diagram, move list so far, 1–3 candidate-move chips linking deeper,
  annotation lines, an eval box. Transpositions are **reference nodes** pointing at the
  original position page (the reference-node showcase). Move sequences and piece
  placements must be chess-correct — reviewer verifies against the actual move list.
- **Blank workspace:** prepared-line worksheets — blank board (all 64 cells `''`,
  writable), empty move list, annotation space — plus a study log.
- **Signature test assertions:** each position page's 64 cells present and bound; every
  candidate-move link resolves; transposition references point at existing positions;
  chapter hubs enumerate their lines.

### 12 — Roots & Branches (`12-family-history-workbook`)

A family-history workbook where the pedigree chart is tappable: every ancestor box opens
that person's page.

- **Identity:** heirloom ledger — ornamental branch/tree SVG, engraved-certificate framing.
- **Content:** 4-generation pedigree chart (15 boxes: self, parents, grandparents,
  great-grandparents), each box a name-bound label over a `specific_node` link to its
  person page. Person page: vitals (born/married/died/places), a short timeline, links
  to father, mother, spouse, and children, plus `Chart` back-link. Family group sheets
  (couple + children table), interview/story-prompt pages, a photo & heirloom log, a
  research log, and a source-citation index.
- **Example branch:** 3 person pages filled for a clearly fictional family, EXAMPLE
  eyebrow + skip-to-blank; the blank workspace is the empty 15-person tree plus 8 spare
  person pages.
- **Signature test assertions:** all 15 chart boxes link to distinct person pages;
  parent/child links are mutually consistent (A's father's children include A); spare
  person pages reachable from an index.

### 13 — Lexicon Lab (`13-language-learning-lab`)

A language-agnostic vocabulary lab: flashcard decks with tap-to-reveal, grammar sheets as
shared references, and a lightweight review schedule.

- **Identity:** lab notebook — specimen-card frames, grid rules, flask/tag SVG.
- **Mechanic:** deck hub (grid enumerating its cards) → card front (target word large,
  `Reveal »`) → card back (meaning, example sentence, note lines, `Next card »` +
  `Back to deck`). 4 blank decks × 12 pre-linked front↔back card pairs, so a
  hand-written deck navigates correctly with zero wiring. Each deck hub carries a
  review-schedule strip (Day 1 / 3 / 7 / 14 / 30 checkboxes).
- **Also:** grammar-sheet pages (rule, pattern table, examples), conjugation/pattern
  drill grids, a conversation-journal section, and a progress page.
- **Example branch:** one demo deck of 8 cards (Spanish everyday words, clearly marked
  EXAMPLE) showing front/back usage; skip-to-blank throughout.
- **Signature test assertions:** every card front links to its back and vice versa;
  deck hubs enumerate exactly their card pairs; blank cards' bound fields are `''`.

### 14 — Offer Track (`14-job-search-hq`)

A job-search command center: a pipeline dashboard over per-company dossiers, an interview
prep bank, and an offer comparison sheet.

- **Identity:** crisp corporate-minimal — strong tabular chrome, stage-chip styling.
- **Content:** pipeline dashboard whose stage sections (Wishlist / Applied /
  Interviewing / Offer / Closed) enumerate company dossiers; 10 dossier pages (role,
  source, salary range, status timeline, next action, contact rows, links to prep bank
  and contact log); interview prep bank (6 STAR-story worksheets, common-questions
  sheet, questions-to-ask bank); contact log; offer comparison sheet (side-by-side
  columns: comp, benefits, growth, gut); weekly review page.
- **Example branch:** one filled dossier + one filled STAR story for a fictional company,
  EXAMPLE chrome + skip-to-blank.
- **Signature test assertions:** dashboard enumerates all dossiers; every dossier links
  to prep bank and contact log; comparison sheet and weekly review reachable from
  Start Here.

### 15 — The Grower's Year (`15-garden-almanac`)

A garden almanac linking the calendar to the plants: month pages list what to sow and
harvest, every listed plant taps through to its card.

- **Identity:** botanical almanac — leaf/seed SVG motifs, engraved month headers.
- **Content:** bed-map pages (labeled plot grids), 12 month pages (task lines +
  sow/plant/harvest rows, each row a `specific_node` link to a plant card), 16 plant
  cards (sow depth/spacing, sun, companions, days to maturity, notes — horticulturally
  accurate, evergreen, northern-temperate framing stated on Start Here), an A–Z plant
  index grid, harvest log, pest & disease log, and a year-review page.
- **Example branch:** March filled + 2 filled plant cards (EXAMPLE chrome,
  skip-to-blank); blank workspace = empty months, empty cards, empty beds.
- **Signature test assertions:** every month-row link resolves to a plant card; index
  enumerates all cards; every card links back to the index.

### 16 — The Reading Room (`16-reading-journal`)

A reading journal built around a tappable bookshelf: every spine on the shelf opens that
book's page.

- **Identity:** ex-libris / library plate — bookplate frames, spine-grid shelf SVG.
- **Content:** bookshelf grid enumerating 24 book pages (title/author, dates, rating
  dots, format chips, review lines, favorite-quote slot); quote vault (16 pages); 4
  series trackers; a TBR/wishlist section; annual wrap-up (stats prompts: totals by
  month grid, top five, DNFs).
- **Example branch:** one book page filled for a public-domain classic + one quote page
  (EXAMPLE chrome, skip-to-blank).
- **Signature test assertions:** shelf enumerates all book pages; book pages carry
  working next/prev and back-to-shelf; wrap-up and vault reachable from Start Here.

### 17 — The House Book (`17-home-owners-manual`)

A home operations manual: rooms and systems as a tappable dashboard, appliance cards with
the details you never find when you need them, and the maintenance rhythm of the year.

- **Identity:** blueprint / technical manual — stencil headers, dashed rules, isometric
  house SVG.
- **Content:** home dashboard (rooms grid + systems grid); 8 room pages (paint codes,
  fixtures, measurements, linked appliance rows); 5 system pages (HVAC, plumbing,
  electrical, roof & exterior, safety devices — filter sizes, shutoff locations, breaker
  map lines); 12 appliance cards (make/model/serial, purchased, warranty ends, manual
  location, service history rows), each linked from its room; 4 seasonal maintenance
  checklists; repair & improvement log; contractor contact list.
- **Example branch:** one room + one appliance card filled (EXAMPLE chrome,
  skip-to-blank).
- **Signature test assertions:** dashboard reaches every room and system; every
  appliance card is linked from exactly one room; seasonal checklists chain
  spring»summer»autumn»winter.

### 18 — The Woodshed (`18-music-practice-studio`)

A practice studio for any instrument: repertoire pages wired to session logs, plus real
manuscript tools (staff paper, chord boxes, technique ladders).

- **Identity:** jazz-poster energy in grayscale — big display type, halftone-dot SVG.
- **Content:** repertoire rack (grid) → 12 piece pages (composer, key/tempo boxes,
  section map, trouble-spots table, link to its next empty session slot); 24 practice
  session logs (goal, metronome ladder boxes, what-broke/what-clicked lines); tool
  pages: blank staff paper (tight `lines-h` groups), chord-box sheets (SVG fretboard
  grids), technique ladder; 4 gig/recital planner pages; a practice-streak tracker.
- **Example branch:** one piece + one session filled (EXAMPLE chrome, skip-to-blank).
- **Signature test assertions:** rack enumerates pieces; piece pages link to session
  logs; session logs chain prev/next with `''` dead ends; tool pages reachable from
  Start Here.

### 19 — The Observatory (`19-astronomy-observation-log`)

A night-sky observation log: monthly sky pages point at target cards, target cards feed
session logs with a real eyepiece sketch circle.

- **Identity:** deep-sky — inverted (dark-fill) header blocks, star-field dot SVG,
  thin-line constellation motif.
- **Content:** 12 monthly sky pages (what's well-placed this month — highlight rows
  linking to target cards; moon/notes lines); 20 target cards (Messier picks + planets:
  type, constellation, magnitude, difficulty, finder notes, first-observed box —
  astronomically accurate, northern-hemisphere framing stated on Start Here); 20
  observation session logs with a large SVG eyepiece circle filled with a sparse dot
  pattern for sketching; equipment page; life-list checklist grid enumerating the
  catalog; glossary.
- **Example branch:** one session log (fictional M42 observation) + one target card's
  notes filled (EXAMPLE chrome, skip-to-blank).
- **Signature test assertions:** every monthly highlight link resolves to a target card;
  life-list enumerates the full catalog; session logs chain with `''` dead ends.

### 20 — The Quest Ledger (`20-habit-quest-rpg`)

A gamified habit system played as an RPG: daily quests earn XP, skill trees level up,
big goals are boss battles.

- **Identity:** illuminated-manuscript RPG — banner SVGs, XP diamond motifs, drop-cap
  styling.
- **Content:** Start Here doubles as the rulebook (XP values, leveling table); character
  sheet (name, class, level boxes, link to XP ledger); 4 skill trees (Health, Mind,
  Craft, Social — tiered unlock boxes); quest board (grid of active quests); 28 daily
  quest pages (3 dailies + 1 side quest + XP-earned box); 12 boss battles (the big
  goal, phases as milestone rows, victory condition, loot = the planned reward); XP
  ledger + level-up log; trophy room (achievements grid).
- **Example branch:** one daily page + one boss battle filled (EXAMPLE chrome,
  skip-to-blank).
- **Signature test assertions:** character sheet links ledger and all four trees; quest
  board enumerates quests; daily pages chain with `''` dead ends; every boss links back
  to the board.

## Content-accuracy rule

Four products carry real-world factual content: Quiz Night (trivia), Opening Atlas
(chess lines), The Grower's Year (horticulture), The Observatory (astronomy). For these,
the task's independent reviewer must verify factual claims, and content must be evergreen
(nothing that expires). Fiction (gamebook story, example families/companies) must be
clearly fictional.

## Execution

- One implementation plan from this spec: 12 independent per-project tasks (each fully
  self-contained: identity brief, page inventory, link topology, example content,
  test assertions), plus a final collection task (collection.test.ts, top-level
  gallery-samples README, render sweep) and a whole-branch review.
- Subagent-driven development, per the house method: fresh implementer + independent
  reviewer per task, all subagents dispatched on fable (standing instruction).
  Projects touch disjoint directories, so tasks can run in parallel waves; the
  collection task runs last.
- Every project is rendered in the real app (`scratch/render_project.mjs` against a
  Vite dev server) before its task closes: template-tab PNGs + exported PDF into
  `samples/`, and PDF link spot-checks (`scratch/pdf_spot.cjs`) for each product's
  signature link mechanic.
- Full unit suite green at the end; final whole-branch review before merge.

## Out of scope

- Publishing to doctect.app (user does this manually from each README's Publishing
  section).
- Any app/server code changes. If a task uncovers an app bug, it is filed/reported, not
  fixed inside this round.
- Additional variants (e.g. Paper Pro Move) — single-variant Paper Pro like the existing
  eight; a Move variant can be a later round.
