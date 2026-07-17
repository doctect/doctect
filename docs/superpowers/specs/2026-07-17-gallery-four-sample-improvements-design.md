# Gallery Sample Improvements: Money Map, Wellbeing Rhythm, Field Notes, Wayfarer Codex

**Date:** 2026-07-17<br>
**Status:** Approved design<br>
**Builds on:** `docs/superpowers/specs/2026-07-12-gallery-samples-redesign-design.md` (all its conventions remain binding)

## Summary

Improve four shipped gallery flagship generators — `03-personal-finance-planner`, `04-wellness-fitness-journal`, `06-travel-field-journal`, `08-ttrpg-campaign-codex` — for end users of the exported PDFs. Three kinds of change, approved per product:

1. **Navigation:** prev/next sequence controls with per-node data-bound labels, and hierarchy flattening where daisy-chaining currently blocks random access.
2. **New page types:** one or two genuinely useful new pages per product (bills register, strength milestones, food log, sketch frames, threads & clocks).
3. **Small visual upgrades:** shade-in progress tracks, tick boxes, body-map artwork, bank tab rail.

No generator runtime changes. No changes to the other four flagship products.

## Non-goals

- Touching products 01, 02, 05, 07.
- New config keys, A4 variants, or generator/editor runtime changes.
- Reworking guided-example prose beyond what new pages require.
- Expense-ledger row counts, meal/nutrition content, or anything not listed below.

## Verified engine facts this design relies on

Confirmed by reading `services/pdfService.ts` (link resolution ~line 935, grid cell links ~line 1477):

- **Grid cells link to the child node's page** in editor and PDF. Navigator grids are real navigation.
- **`sibling` links have cousin fallback:** at a sequence end, the engine walks to the next/previous uncle and picks its first/last child **of the same template type**. If nothing matches, no link annotation is emitted (control is dead cleanly).
- **`child_index` links with no child at that index emit nothing.**
- **Reference nodes add zero exported pages** (`computePageOrder` skips them; `resolvePage` follows `referenceId`).
- Caps are far away: 20 000 nodes, 50 000 elements, 5 MB state.

## Cross-cutting technique: data-bound nav chrome

Every new prev/next control is a text element with `dataBinding: 'nav_prev_label'` / `'nav_next_label'` (plus `linkTarget: 'sibling'`, `linkValue: '-1'` / `'1'`). The hierarchy script sets the labels per node:

- Interior nodes get honest labels (`« NOV`, `FEB »`, `FUNDS »`, `RECOVERY »`).
- Sequence-end nodes get `''` — the control disappears, satisfying the base spec's "no misleading active controls".

**Endpoint audit rule.** An invisible control can still carry a live link (direct sibling of another type, or cousin fallback). Every such endpoint in this design was audited; invisible-but-live is allowed **only when the destination continues the reading direction into the immediately adjacent sequence unit** (e.g. the last strength log of a week silently reaching the next week's first log). All other endpoints resolve to *no link*. Any template where the fallback would land somewhere surprising simply does not get that control (e.g. finance category review gets no "next" chip because cousin fallback would reach the *next month's review*, skipping its plan).

**Data contract.** Every node whose template renders `nav_prev_label`/`nav_next_label` (or `continue_label`, wellness only) must define those keys, `''` allowed. Tests enforce presence.

Controls are styled per product (chip shapes, colors, placement differ); only the technique is shared.

## Product 1 — Money Map (`03-personal-finance-planner`)

### Flatten the month branch

Today: `month > tx01 > tx02 > review` (chained; UP from review lands on tx02). New: **`month` children = `[tx01 … txN, review]`**. Stable ids unchanged (`blank_month_01_transactions_01`, `blank_month_01_category_review`, …).

- Month's `OPEN TRANSACTION LOG` (`child_index 0`) still works.
- Transaction pages: the static `NEXT LOG / REVIEW` button becomes a bound label (`LOG 02 »` … last sheet reads `REVIEW »`) on `sibling +1`. No prev chip on tx pages (UP = month now, which is the correct "back").
- Category review: prev chip `« LOG NN` (`sibling -1`); **no next chip** (see endpoint audit rule); footer UP now correctly returns to the month plan.

### Sequence navigation across the annual branch

`blank_annual`'s children are the reading order: months 01–12, **bills (new)**, sinking funds, goals, year review. All get prev/next chips as siblings:

- Jan prev: `''` (fallback finds nothing — clean dead end).
- Dec next: `BILLS »`; bills next: `FUNDS »`; sinking next: `GOAL 01 »`; goals chain; last goal next: `YEAR REVIEW »`; year review next: `''` (no sibling, cousin finds nothing).
- Example-branch nodes get **honest labels too** wherever a real sibling destination exists (e.g. example January's next reads `BILLS »`); `''` only at true dead ends. This keeps every visible control truthful in both branches.

### New template `bills` — Recurring Bills & Subscriptions

One page, node id `blank_bills`, child of `blank_annual` after month 12. 8 rows: BILL / DUE / AMOUNT / 12 small tick squares (J F M A M J J A S O N D) drawn as individual rects following the product's shared-edge border rules. Below: italic audit prompt ("Which of these would you cancel this year?") plus one writable bound line (`audit_note`). A guided `example_bills` page (3 clearly fictional filled rows) joins the example branch under `example_annual`.

The annual navigator grid picks the new page up automatically (child count 19 by default → still fits its region; verify bounds).

### Goal progress track

`goal` template adds a 10-segment shade-in track (10 outlined rects, one row, under the target summary). Static artwork; no data.

**Default page count: 66 → 68** (blank bills + example bills). README inventory, nav map, and counts updated.

## Product 2 — Wellbeing Rhythm (`04-wellness-fitness-journal`)

### Restructure: chain → flat

Today weeks/workouts/recovery/reflection form one long chain under each month (week 37 is ~70 taps from anywhere; grids cannot enumerate a chain). New shape:

- **`month_habits` children = `[week × N, recovery, reflection]`**
- **`week` children = `[workout01 … workout0K]`** (K = `workoutsPerWeek`, may be 0)

Example branch restructured the same way. `weeksByMonth` distribution unchanged. Ids unchanged.

### Navigation

- **Month page** gains a week navigator grid (children = weeks + recovery + reflection, all tappable). `BEGIN MONTH →` (`child_index 0`) stays valid — first child is week 1, or recovery when a month has no assigned weeks.
- **Week**: prev/next chips. First week of a month: prev label `« WEEK NN` — cousin fallback correctly reaches the previous month's last week. Last week: next label `RECOVERY »` (direct sibling). Continue button becomes bound `continue_label` = `STRENGTH 1 »` (`child_index 0`), `''` at `workoutsPerWeek: 0` (dead cleanly — no children).
- **Workout**: continue bound: `STRENGTH 2 »` (`sibling +1`); last workout `''` (invisible; live cousin link to next week's first log = next page in reading order — allowed per audit rule). No prev chip; footer UP = week.
- **Recovery**: prev `« WEEK NN` (`sibling -1`), next `REFLECT »` (`sibling +1`, replaces the old child-chain continue). **Reflection**: prev `« RECOVERY`; no next chip (cousin would skip to the next month's reflection); existing `MONTH INDEX` → `blank_workspace` button stays.

### Body map on recovery page

Recovery layout reflows: restored/heavy boxes on top (unchanged content), then left column stacks the energy/recovery pattern fields, right column becomes a **MARK STRAIN / TIGHTNESS** panel with two newly authored line-art body silhouettes (front + back, ~100×140 each, sage/clay strokes, viewBox-only SVG, plain paths — PDF-safe) for circling sore spots. Adjustment line stays at the bottom. All existing bindings keep working.

### New template `milestones` — Strength Milestones

One page, node id `blank_milestones`, child of `blank_workspace` after baseline (workspace navigator picks it up). 8 rows: MOVEMENT / DATE / BEST / NEXT TARGET, using the product's table construction. Not added to the example branch.

**Default page count: 204 → 205.** README structure, navigation section, and counts updated (the "Previous follows the exact sequence parent" claim is replaced by the new model).

## Product 3 — Field Notes from Elsewhere (`06-travel-field-journal`)

### Day-to-day navigation

`day` template gets prev/next chips (`« DAY 02` / `DAY 04 »`), bound per node. Audited: first/last days dead-end **with no link** (neighbor banks under the trip contain no `day`-type children, so cousin fallback finds nothing — verified against the engine's type filter). Example Lisbon days get labels too.

### Reservation ticks

`reservation` template adds two labeled tick squares — CONFIRMED □ PAID □ — in the header row next to the kind chip. Static artwork.

### New template `tastes` — Tastes & Finds

Per trip, node `blank_trip_NN_tastes`, `menu_label: 'TASTES'`. 6 rows: WHERE / WHAT / verdict strip of 5 shade-in squares (star strip). One closing bound line (`best_bite`). Guided `example_tastes` for Lisbon with 3 rows of invented-but-plausible entries (no real venue names beyond the established fictional register).

### New template `sketches` — Tickets & Sketches

Per trip, node `blank_trip_NN_sketches`, `menu_label: 'SKETCHES'`. Four open frames (2×2, ~215×150, 0.8 px rule borders, unlined interiors) each with a caption line below. Guided `example_sketches` for Lisbon: frames stay blank, captions filled ("tram ticket", "tile pattern from Alfama", …).

### Trip dashboard fit

Trip children become: reservations, itinerary, packing, expenses, **tastes, sketches**, highlights (highlights stays last). The dashboard navigator grid grows from 5 to 7 cards → 3 rows; shrink navigator `cellH` and/or nudge the route-note field down so nothing collides or crosses the footer. Explicit bounds check required in tests.

**Default page count: 55 → 63** (2 new pages × 3 blank trips + 2 Lisbon pages). README inventory/config/nav updated (min config 23 → 27; max recalculated).

## Product 4 — Wayfarer Codex (`08-ttrpg-campaign-codex`)

### Bank tab rail (approved: visible everywhere, example branch included)

Every interior template — `bank`, `session`, `quest`, `npc`, `location`, `faction`, `encounter`, `lore`, `campaign`, `party`, `character`, and new `threads` — gets a right-edge rail of 7 mini tabs: SES QST NPC LOC FAC ENC LOR → `specific_node` links to `blank_session_bank` … `blank_lore_bank`. On example pages the tabs jump into the blank banks; approved as teaching-honest.

Construction: per tab, a small rounded rect (~18×52, alternating moss-pale/oxblood-pale), a **rotated** 3-letter label, and an **unrotated invisible rect carrying the link** (rotated elements' link zones are unreliable; the invisible-rect tap target is the established pattern). The tab matching the current template renders in its filled "active" state. Rail spans roughly y 90–470 at x ≈ 489, clear of the 441-wide field column and the corner marks.

### Session prev/next

`session` template: bound chips `« S03` / `S05 »` near the title. S01 prev and last-session next are `''` and dead-end cleanly (neighbor banks hold different types — audited).

### Encounter round tracker

`encounter` adds one row — ROUND □1 □2 □3 □4 □5 □6 — between aftermath and notes (notes box shrinks slightly).

### New template `threads` — Threads & Clocks

One page. 7 rows: THREAD / CLOCK (6 shade-in segment squares) / OWNER / NEXT MOVE. Blank node `blank_threads` under `blank_workspace` between party and the banks (workspace navigator: 10 cards, still fits — verify bounds). Guided `example_threads` under `example_workspace` with 2 filled Ashen Bell threads consistent with the existing fiction ("Greenwarden recovery party", clock 2/4 shaded).

**Default page count: 125 → 127** (blank + example threads). README workflow, inventory, priorities updated.

## Data & id conventions

- New stable ids: `blank_bills`, `example_bills`, `blank_milestones`, `blank_trip_NN_tastes`, `blank_trip_NN_sketches`, `example_tastes`, `example_sketches`, `blank_threads`, `example_threads`.
- New data keys: `nav_prev_label`, `nav_next_label` (all four products where used), `continue_label` (wellness), `audit_note` (finance), `best_bite` (travel), threads/tastes/bills/milestones row fields following each product's existing `field_N` naming.
- All new tables/tick squares follow the base spec's grid-border standard: fill-only cells, one outer boundary, one rect per shared internal edge, 0.75–1 px strokes; new SVGs are viewBox-only, plain shapes, inline attributes.

## Tests

Update `tests/unit/gallerySamples/{personalFinance,wellnessFitness,travelFieldJournal,ttrpgCampaignCodex}.test.ts` (+ `collection.test.ts` shared invariants if counts are asserted there):

- New structure: flattening assertions (finance tx/review siblings; wellness month/week children), new node ids present, new templates referenced.
- Nav-label contract: every node of an affected type defines the label keys; sequence-end nodes have `''`; interior labels non-empty.
- Endpoint audit: assert the specific dead-end resolutions this design promises (e.g. travel first/last day, codex S01/S-last) using the same child/type logic as the engine.
- Bounds: new/updated grids and the codex rail stay inside 509×679 and clear of footers.
- Page counts: 68 / 205 / 63 / 127 at default config; min/max configs still generate.

## Verification (per base spec §Verification)

1. Unit tests green (`tests/unit/gallerySamples/`).
2. Real generator-modal drive per product (scratch render tooling — `scratch/render_project.mjs`; update its tab names if template names changed; keep template names distinct from node titles to avoid the known getByText collision).
3. PDF export spot checks: month prev/next annotations, a bills row, wellness week grid from month page, body map rendering, travel day chips + sketches frames, codex tab rail links + threads clocks. Grayscale readability pass.

## Isolation from parallel work

All implementation in a **git worktree on a dedicated branch**. Files touched: the four product directories, their tests, this spec, and the implementation plan. Nothing under `server/`, `components/`, `services/`, or the moderation docs the other agent owns. Commits name only these paths.

## Acceptance criteria

- All approved features above exist and behave as specified in editor and exported PDF.
- No dead-but-visible nav control at any sequence end in any supported configuration; every invisible-but-live endpoint lands on the adjacent page in reading order.
- Default/min/max configs generate; READMEs match reality (counts, maps, config tables).
- Unit tests updated and green; real-modal + PDF verification performed per product.
- Zero diffs outside the listed paths.
