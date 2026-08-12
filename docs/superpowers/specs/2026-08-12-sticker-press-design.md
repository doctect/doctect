# The Sticker Press — design

**Date:** 2026-08-12
**Status:** design approved, plan not yet written
**Slots:** `gallery-samples/21-sticker-press/`, `gallery-samples/22-sticker-press-compact/`

## What this is

A sticker catalogue for e-note devices, delivered like every other flagship: two generator
scripts the user pastes into the Hierarchy Generator, previews, and applies.

It is not a planner. The other twenty products are hierarchies of pages you write *into*.
This one is a **source book** — every page is a sheet of artwork laid out to be lassoed with
the device's selection tool, screenshotted, and pasted into some other PDF or notebook.
That single difference drives most of the decisions below: there is no data binding on the
sheets, no per-page writing area, and the page chrome is deliberately kept out of the way of
a crop.

500 distinct stickers, each available in several colours and sizes. Colours and sizes do not
count toward the 500.

## Editions

Sticker artwork is fixed-count, so it does not shrink on a smaller page — a smaller page just
means more sheets. Each edition therefore costs roughly the same bytes regardless of its page
size, and each must fit inside `MAX_STATE_BYTES` on its own. Two editions ship:

| Edition | Page (pt) | Serves | Sheets | Pages | Est. state |
|---|---|---|---:|---:|---:|
| The Sticker Press | 509×679 | Paper Pro (exact fit) | ~62 | ~80 | ~2.4 MB |
| The Sticker Press · Compact | 260×463 | Paper Pro Move (exact fit); Paper Pure and Boox Note Air 5C by scaling | ~143 | ~158 | ~2.5 MB |

Device geometry, points at 72/inch, portrait:

| Device | Panel | Pixels | PPI | Page (pt) |
|---|---|---|---:|---|
| reMarkable Paper Pro | 11.8″ 3:4 colour | 1620×2160 | 229 | 509×679 |
| reMarkable Paper Pro Move | 7.3″ 16:9 colour | 954×1696 | 264 | 260×463 |
| reMarkable Paper Pure | 10.3″ 4:3 **mono** | 1404×1872 | 226 | 447×596 |
| Boox Note Air 5C | 10.3″ 4:3 colour | 1860×2480 | 300 | 446×595 |

509×679 matches the app's existing `RM_PP_WIDTH`/`RM_PP_HEIGHT` constants (`types.ts:207-208`).

Paper Pure and Note Air 5C compute to 447×596 and 446×595 — one point apart, which is
invisible. They do not need separate editions, and neither gets one: both read the Compact
edition scaled up. Readers on both platforms scale PDFs to fit.

### Why not one project with four variants

`Variant` carries its own complete `templates` map (`types.ts:151-155`), and the byte cap is
measured on `JSON.stringify` of the whole state. JSON has no back-references, so two variants
holding the same object in memory serialise as two full copies. **There is no way for variants
to share bytes.**

The one mechanism that could have helped does not apply: `svgContent` is read raw at both
render sites (`components/canvas/CanvasElement.tsx:461`, `services/pdfService.ts:1165`), and
data binding is text-only (`services/previewText.ts:96` takes
`Pick<TemplateElement, 'text' | 'dataBinding'>`). There is no asset library, symbol table, or
shared-element concept in the schema. Storing each sticker's markup once in shared node data
and binding it into four variants is not possible today.

Four full-depth variants would be roughly 10 MB against a 5 MB ceiling.

### Why a device constant is acceptable where a palette knob was not

Alternate colourways must be baked into the exported PDF, because a screenshot captures
whatever colour is drawn — you want every colour available in *your* file without re-running
anything. Devices are the opposite: you own one. Re-running to target a different device costs
nothing you care about, and it is the same `DEFAULT_CONFIG` pattern the other twenty flagships
already use.

## Inventory

### Structural — 180 stickers × 6 colourways × 3 sizes = 3,240 placements

| # | Category | n | Contents |
|---|---|---:|---|
| 1 | Index tabs & flags | 28 | rounded and notched tabs, ribbon flags, bookmarks, corner triangles, dog-ears, numbered side tabs |
| 2 | Banners & ribbons | 24 | straight banners, tailed ribbons, pennants, scrolls, folded bands, award rosettes |
| 3 | Labels & plates | 22 | tape strips, torn-paper strips, price and luggage tags, sticky notes (square, portrait, lined, torn), speech-bubble labels |
| 4 | Arrows & pointers | 28 | straight, curved, doodle, looping, dashed, block, U-turn, branch, elbow, pointing hand |
| 5 | Boxes, bullets, markers | 24 | empty, checked and crossed boxes, dots, star and arrow bullets, diamonds, progress pips, priority flags |
| 6 | Stars, sparkles, bursts | 22 | 4/5/6/8-point stars, twinkle clusters, starbursts, sunbursts, seals, medals |
| 7 | Dividers, corners, frames | 32 | dotted, dashed, wave and zigzag rules, floral dividers, corner flourishes, bracket pairs, box frames, washi strips |

### Pictorial — 320 stickers × 3 treatments × 2 sizes = 1,920 placements

| # | Category | n | Contents |
|---|---|---:|---|
| 8 | Weather & sky | 24 | sun, clouds, rain, storm, snowflakes, moon phases, rainbow, wind, umbrella |
| 9 | Botanical | 34 | leaves, ferns, branches, flowers, sprigs, mushrooms, acorns, cacti, succulents, trees |
| 10 | Animals | 34 | cats, dogs, birds, butterflies, bee, ladybug, snail, fox, bear, rabbit, whale, fish, owl |
| 11 | Food & drink | 32 | coffee, teapot, water bottle, cake, cupcake, donut, croissant, pizza, fruit, vegetables, ice cream |
| 12 | Faces & moods | 22 | smile, laugh, wink, sad, angry, sleepy, love-eyes, thinking, mood blobs |
| 13 | Study & work | 30 | pencil, brush, ruler, scissors, paperclip, pushpin, notebooks, folder, calendar, clocks, laptop, envelope, gear, bulb, charts |
| 14 | Health & self-care | 26 | hearts, heartbeat, water drop, pill, bandage, dumbbell, running shoe, bicycle, sleep moon, candle, timer |
| 15 | Travel & places | 24 | plane, suitcase, backpack, map pins, compass, globe, camera, ticket, passport, train, tent, mountains |
| 16 | Celebration & seasons | 24 | gifts, balloons, party hat, confetti, fireworks, pumpkin, holly, snowman, ornaments, shamrock |
| 17 | Money & home | 22 | coins, banknote, wallet, piggy bank, receipt, shopping bag, houses, door, lamp, bed, tools |
| 18 | Symbols & misc | 30 | exclamation, question, warning, hourglass, battery, wifi, sync, infinity, hashtag, music notes, dice, puzzle, flame |

**Total: 500 stickers, 5,160 placements per edition.**

## Art style

Bold dark outline around flat fill — the dominant planner-sticker idiom, and the one that
survives e-ink rendering and small crops best, because the outline holds the shape when the
fill greys out. Outline is always `#23292f`.

One path carries both `fill` and `stroke`, so the style costs one element, not two.

## Colourways and treatments

### Structural: six colourways

Because the Compact edition is read on the monochrome Paper Pure, the six fills are chosen so
their greyscale luminances stay separated. The app's own formula is
`y = 0.299r + 0.587g + 0.114b` (`services/svgColorNormalize.ts:198`, `services/pdfService.ts:600`).

| Colourway | Fill | Luminance | Gap to next |
|---|---|---:|---:|
| Outline | none (paper) | 255 | 54 |
| Amber | `#f0c674` | 201 | 32 |
| Green | `#86c08e` | 169 | 33 |
| Blue | `#5b93c4` | 136 | 32 |
| Red | `#b04a46` | 104 | 36 |
| Ink | `#3d4650` | 68 | — |

Minimum separation 32. The outline itself (`#23292f`, luminance 40) stays 28 below the darkest
fill, so it still reads against Ink.

Pale fills are not a compromise here — a light fill under a heavy dark outline is the classic
sticker look, and it is also what makes the luminance ladder possible.

### Pictorial: three treatments

- **Natural** — per-sticker authored colours (a leaf is green, a coffee is brown).
- **Mono** — outline only, no fill. This is why the outline style was worth paying for: the
  mono treatment is a genuine second look, not a degraded fallback.
- **Pastel** — natural, lightened.

### Sizes

| Edition | Structural | Pictorial |
|---|---|---|
| Paper Pro | L 48pt / M 32pt / S 20pt | L 48pt / S 24pt |
| Compact | L 36pt / M 24pt / S 16pt | L 36pt / S 18pt |

Wide structural stickers (banners, dividers, rules, tape) use L 192×24 / M 128×16 / S 80×10 on
Paper Pro, scaled by 0.75 on Compact.

The Compact edition's smaller points are not a downgrade: at 264 PPI on Move, a 16pt sticker
still carries more pixels than a 20pt sticker at 229 PPI on Paper Pro.

## Sheet layout and crop hygiene

The product's whole purpose is that a crop comes out clean. Three rules follow, and they are
requirements, not preferences:

1. **Pure white sheet ground.** A cream or tinted ground would be captured by every screenshot
   and carried into whatever the user pastes into.
2. **No borders or boxes around sticker cells.** A cell border lands inside the crop.
3. **Labels sit in a gutter strip below the artwork**, never touching it, with enough clearance
   that a slightly generous lasso still misses them.

Sheets are organised one per (category, colourway) for structural and one per
(category, treatment) for pictorial. Wide categories (Banners, Dividers) take two sheets per
colourway on Paper Pro and more on Compact.

Each sticker occupies one **cluster** — its size variants laid out left to right, largest
first, sharing one label. A cluster is the crop unit.

## Navigation

Roughly 1,500 validated links on Paper Pro and 1,700 on Compact, across three mechanisms.

- **Family rail**, top of every sheet. On structural sheets, chips for the 7 structural
  categories; on pictorial sheets, chips for the 11 pictorial categories; plus one chip
  crossing to the other family. Paper Pro carries the full rail — 14 chips on a structural
  sheet, 18 on a pictorial one, counting the switcher below. **Compact carries a reduced 8-chip
  rail**: the six switcher chips plus two family arrows (see the byte budget — rail cost scales
  with sheet count, and Compact has 2.3× the sheets).
- **Colourway switcher**, bottom of every sheet. Six chips that jump to *this same sheet* in
  another colourway, via `specific_node`. Two taps from any sticker to the same sticker in any
  colour.
- **A–Z index**, 6 pages, 500 entries, each a `specific_node` link to the sheet its sticker
  lives on.

## Required chrome

The harness requires `root`, `start_here`, `example_workspace` and `blank_workspace`
(`tests/helpers/gallerySampleHarness.ts:24`).

- **Cover** → full-page tap link and a CTA into `start_here`.
- **`start_here`** — how to crop on each device, how the rail and switcher work, what the
  colourways mean.
- **Contents** — 18 category chips.
- **Colour guide** — the six colourways and three treatments, with the greyscale note for
  Paper Pure owners.
- **`example_workspace`** — two pages: a decorated weekly spread with stickers actually
  applied, then an annotated copy naming which sticker went where. Both carry the `EXAMPLE`
  eyebrow and the `Skip to blank workspace →` link, per the harness's chrome rules
  (`gallerySampleHarness.ts:524-563`).
- **`blank_workspace`** — three undecorated pages to decorate: weekly grid, dot grid, ruled.

## Generator architecture

500 stickers cannot be 500 string literals — `GENERATOR_SCRIPT_MAX_BYTES` is 512 KiB per script
(`shared/generatorMetadata.js:2`), applied independently to `templateScript` and
`hierarchyScript`. The cap is on source text, not emitted output, so parametric construction
solves it.

`templates.js` contains, in order:

1. **`DEVICE`** — a single constant block at the top selecting page size, size ladder, and rail
   width. The only difference between the two editions' files.
2. **~90 parametric shape builders** — `star(points, innerRatio)`, `tab(style, notch)`,
   `leaf(veins, curl)`, `arrow(curve, head, tail)`, and so on, each returning path data for a
   24×24 viewBox.
3. **A 500-entry registry** naming, per sticker, its builder, arguments, natural colours,
   category, and cell aspect (square, wide, tall).
4. **A layout engine** that walks the registry, packs clusters into sheets for the current
   `DEVICE`, and emits templates with the rail and switcher chrome.

Estimated source: ~180 KB, comfortably inside 512 KiB.

`hierarchy.js` builds the node tree — cover, guide pages, one node per sheet, the A–Z index
pages, and the example/blank workspaces — plus the `specific_node` link targets the switcher
and index resolve against.

## Byte budget

Three independent enforcement points, all on `MAX_STATE_BYTES = 5 * 1024 * 1024`
(`shared/projectLimits.js:1`):

- `services/validateGeneratedProject.ts:168` — in the browser, on Preview, before anything is
  applied. Re-checked after normalisation at `:311`.
- `services/generatorSandbox.ts:422` — compiled into the sandboxed evaluator as a hardening
  boundary. The sandbox captures `TextEncoder` and the `byteLength` getter as trusted
  intrinsics at `:135-138` specifically so evaluated source cannot patch them to smuggle
  oversized output past the check.
- `server/validateAppState.js:26` — on publish.

A fourth ceiling matters more in practice, and it is stricter than it looks. Local projects all
live in one `localStorage` key (`pages/EditorPage.tsx:33`). Web Storage is **not** governed by
the percentage-of-disk Storage API quotas that cover IndexedDB, Cache Storage and the OPFS; it
has its own fixed per-origin cap — 5 MiB by the spec's recommendation, 10 MiB by MDN's current
Web Storage page, varying by browser and version — and that cap covers every project the user
has, not just this one.

**localStorage counts UTF-16 code units, two bytes per character.** `MAX_STATE_BYTES` is
measured in UTF-8 bytes (`Buffer.byteLength(state, 'utf8')` server-side,
`new TextEncoder().encode(...).byteLength` client-side), and for mostly-ASCII JSON those bytes
are roughly one per character. So a project's localStorage cost is about **twice** its
`MAX_STATE_BYTES` measurement.

This makes `MAX_STATE_BYTES` unreachable for a locally-saved project: a state at the 5 MiB
ceiling costs ~10.5 MB of localStorage quota. Anything between roughly 2.5 MB and 5 MB passes
every validator in the codebase and then fails to save. The app degrades cleanly — 
`tests/unit/EditorPageGeneratedProject.test.tsx:123,146` assert a rollback of both storage keys
on `QuotaExceededError` — but the user is left with a project they can generate and cannot
keep.

**Target is ~2.4 MB per edition** — about 4.8 MB of localStorage, comfortable against a 10 MiB
quota and marginal against 5 MiB. Task 1 must settle this against a real browser rather than
this paragraph. The product's normal use is generate → export PDF → done, so long-term
localStorage residency is not required, but a book that cannot be saved at all is not
acceptable.

This is an app-wide finding, not a sticker-book one, and it is worth its own issue: the
declared 5 MiB document limit and the real local limit differ by 2×, in the direction that
surprises the user.

Estimated composition per edition:

| Component | Count | Bytes each | Total |
|---|---:|---:|---:|
| SVG placements | 4,440 | ~405 (175 element JSON + ~230 markup) | 1.80 MB |
| Primitive placements | 720 | ~190 | 0.14 MB |
| Labels (first-sheet-per-category only) | 500 | ~230 | 0.12 MB |
| Rail and switcher chrome | ~1,000 (Pro) / ~1,150 (Compact) | ~250 | 0.25–0.29 MB |
| A–Z index | 500 | ~250 | 0.13 MB |
| Cover, guides, example, blank | — | — | 0.10 MB |
| **Total** | | | **~2.4–2.5 MB** |

Four economies are load-bearing and belong in the implementation, not left to chance:

- **Tight markup.** `viewBox="0 0 24 24"`, integer coordinates, one path carrying both `fill`
  and `stroke`, no whitespace, 6-digit hex. Hard budget: **230 bytes average, 400 bytes
  maximum** per sticker's markup.
- **Native primitives where they genuinely win.** Only for one-shape stickers — plain boxes,
  dots, thin rules, tape strips, rounded labels: about 40 of the 180 structural stickers. This
  was scoped down during design after checking: a checked checkbox is a `rect` plus two `line`
  elements, three elements at ~570 bytes, *worse* than one 250-byte SVG path. Multi-shape
  stickers stay as SVG.
- **Labels on the first sheet of each category only** — the Ink sheet for structural
  categories, the Natural sheet for pictorial ones. Every other sheet in that category is the
  same grid in the same order, so the label is recoverable by position, and the A–Z index
  names every sticker regardless.
- **Compact rail on the Compact edition.** Rail cost scales with sheet count; at 143 sheets the
  full 18-chip rail would cost ~0.64 MB against the compact rail's 0.29 MB.

**These figures are estimates, not measurements.** See Task 1.

## SVG authoring rules

Derived from how the two renderers actually behave; violating any of these fails silently
rather than loudly.

- **Ship `viewBox`, omit root `width`/`height`.** The canvas strips them from the root tag
  (`CanvasElement.tsx:461-465`) and PDF export *adds* them from the element box
  (`pdfService.ts:1182-1183`); shipping explicit ones makes the two disagree.
- **No `hsl()`, `hsla()`, `#rgba`, or `#rrggbbaa`.** svg2pdf's colour parser silently drops
  them — the shape renders stroke-only or vanishes, and 8-digit hex loses its alpha
  (`services/svgColorNormalize.ts:44-69`). 6-digit hex or `rgb()` only.
- **No `<use>`.** DOMPurify's SVG profile does not allow it, so it is stripped on canvas
  (`CanvasElement.tsx:473-476`) while still working in PDF export — a canvas/PDF divergence.
  No `<script>`, `<style>`, `<foreignObject>`, or `on*` handlers either.
- **Avoid overlapping shapes inside a semi-transparent sticker.** Element opacity is baked into
  the tree rather than applied as an outer graphics state (`pdfService.ts:1180`), so crossings
  accumulate alpha. Not expected to bite here — stickers are fully opaque — but recorded.
- **svg2pdf failures are swallowed** with a `console.error` (`pdfService.ts:1192-1194`) and the
  element silently disappears. This is why the test suite parses every `svgContent` rather than
  trusting a visual check.

## Harness changes

`tests/helpers/gallerySampleHarness.ts` needs one additive change: the page size must come from
the sample's contract instead of the module constants at `:28-29`, which currently hardcode
509×679 and would reject the Compact edition outright. Everything else the harness validates
applies unchanged.

Twenty existing sample suites depend on this helper. The change is additive — a contract field
defaulting to 509×679 — so no existing suite is touched.

## Testing

`tests/unit/gallerySamples/stickerPress.test.ts` and `stickerPressCompact.test.ts`, through
`expectValidGallerySample`, which already covers structure, page size, element bounds, globally
unique and deterministic ids, link resolution, EXAMPLE chrome, and JSON-clonability.

Product-specific assertions on top:

- Every one of the 500 stickers resolves in every colourway or treatment it declares.
- All 500 A–Z index entries resolve to an existing sheet node.
- Every `svgContent` parses as `image/svg+xml` with no `parsererror`, carries a `viewBox`, and
  has no root `width`/`height`.
- No `hsl(`, `hsla(`, 4- or 8-digit hex, `<use`, `<script`, `<style`, or `<foreignObject`
  anywhere in any `svgContent`.
- Per-sticker markup is within the 400-byte maximum, and the set average is within 230.
- **Greyscale separation:** every pair of structural colourway fills differs by at least 25
  luminance under `0.299r + 0.587g + 0.114b`, and the outline differs from every fill by at
  least 25. This is what keeps the Compact edition legible on Paper Pure.
- **State size:** the generated `AppState` serialises to under **3.0 MB**. This fails the build
  rather than a publish.
- The two editions' `templates.js` files are byte-identical below their `DEVICE` block, so they
  cannot drift.

## Implementation notes

**Task 1 is a measurement spike, not a feature.** Build one category — Botanical, 34 stickers,
3 treatments, 2 sizes — at both page sizes, then:

1. Generate it and weigh the actual serialised state, to check the ~405 bytes-per-placement
   assumption the whole scope rests on.
2. **Extrapolate to 500 stickers, synthesise a state of that size, and actually save it to
   `localStorage` in real Chrome and real Firefox.** The UTF-16 doubling above means the
   arithmetic ceiling and the practical one differ by 2×, and browser quotas vary by version.
   A `QuotaExceededError` here is the finding that resizes the product, and it is far cheaper
   to hit it now than at 500 stickers.

If the real per-sticker cost lands materially above 405 bytes, or the save fails, the sticker
count or the colourway depth is what gives.

## Non-goals

- **No hand-drawn or wobbly style.** Costs roughly 900 bytes per sticker in extra path points,
  which pushes a single edition past 4.5 MB.
- **No `palette` config knob.** Colours must be in the exported PDF, not behind a re-run.
- **No separate Paper Pure edition.** It reads Compact scaled up; the luminance-separated
  palette is what makes that acceptable.
- **No raising of `MAX_STATE_BYTES`, and no move to IndexedDB.** Both are legitimate — and the
  case is stronger than it first appears, because Web Storage's fixed 5–10 MiB cap is the one
  storage API that does *not* get the percentage-of-disk quotas (roughly 60% of disk on
  Chromium and WebKit, the lesser of 10% of disk or 10 GiB on Firefox) that IndexedDB, Cache
  Storage and the OPFS all receive. Moving local persistence off localStorage would take the
  practical document ceiling from single-digit megabytes to gigabytes, and would let the
  sandbox's DoS bound be chosen on its own merits instead of inheriting a storage number. That
  is a platform round with its own design, not a prerequisite for this product, and it should
  not be coupled to it.
- **No animation, gradients, or filters** in sticker markup, despite DOMPurify permitting them
  — they cost bytes and degrade unpredictably through svg2pdf.

## Open decisions

- **Product name.** "The Sticker Press" is the working title. Alternatives considered: The
  Sticker Drawer, Peel & Paste, The Sheet Press.
- **Exact per-category counts.** The 180/320 split and the per-category numbers above sum to
  500 and are the design target, but individual categories may shift by a few stickers during
  authoring as some ideas prove too detailed to draw within the byte budget. The total and the
  structural/pictorial split are fixed; the per-category distribution is not.
