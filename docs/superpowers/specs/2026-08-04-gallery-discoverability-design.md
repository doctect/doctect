# Gallery Discoverability Redesign — Design

**Date:** 2026-08-04
**Status:** Approved design, pending implementation plan

## Problem

The gallery is functional but weak at its two real jobs: a first-time visitor doesn't learn what these projects are or why they should care, and browsing is flat — a hero band over three curated rows ("Top rated", "Popular", "Recently updated") that carry no signal while the catalog is young (near-zero ratings and forks), cards that show a single static thumbnail, and the multi-page previews every listing already stores going entirely unseen.

## Success criteria

Two minutes after landing on `/gallery`, a first-time visitor has:

1. **Understood the product** — what the projects are, that they open free in the editor, that forking makes them yours.
2. **Been visually hooked** — big previews, browsing that feels alive.
3. **Found their use case** — navigated by need, not by search keyword.

Designed for the near-term catalog: roughly the 20 flagship samples plus a trickle of community publishes (~20–60 projects). No taxonomy infrastructure for a scale that doesn't exist yet.

## Scope

`/gallery` sections view, plus its entry points (landing hero CTA). The filtered/search grid, gallery detail modal/page, profile pages, and editor surfaces are out of scope except where noted (cards everywhere gain the rollover, since they share one component).

## Page structure (sections view, top to bottom)

1. **Sticky search bar** — unchanged behavior (debounced into `?q`, switches to filtered grid mode).
2. **Explainer strip** — three steps: "① Browse — real, finished document products · ② Open in editor — free, instantly, no account · ③ Make it yours — edit, fork, republish". Shown to signed-out visitors only; dismissible, dismissal persisted in `localStorage`.
3. **Spotlight** — one project on a stage: large preview that auto-flips through its pages (~2 s interval), name, author, rating, description, "Open in editor" + "See details" buttons. Selection: client-side deterministic daily rotation — a date-derived hash picks from the full public catalog, so the pick is stable within a day, changes across days, and needs no server support or curation.
4. **Use-case strips** (~4) — replace the "Top rated" / "Popular" / "Recently updated" rows. Each strip is `{title, emoji, tags[]}` from a client-side constant (e.g. "📋 Plan & organize", "📈 Track & improve", "🎲 Play & explore"). A strip shows **all** its matches in one horizontally scrollable row — no pagination, no "see all". Rating and popular sorts remain available in filtered mode's sort select.
5. **"More to explore" grid** — every public project not claimed by a strip, newest first.
6. **Tag chips** — demoted from the hero to the page bottom; same behavior (`?tag=` filter).

Filtered mode (`?q` / `?tag` / `?sort`) is unchanged apart from cards gaining the rollover.

## Card rollover (all surfaces)

Pinterest-style multi-image rollover on every card — strips, leftover grid, filtered grid, and the spotlight's stage:

- `mouseenter` starts a ~700 ms cycle through the listing's preview images (up to 6, the existing publish cap); the next image is preloaded before each swap; `mouseleave` resets to the first.
- Dot indicators show position; no dots and no cycle when a listing has a single preview.
- `prefers-reduced-motion`: no auto-cycling anywhere (spotlight included); dots become click-to-step.
- Touch devices: no hover — tap opens the detail as today.
- Projects with no previews keep the existing placeholder, no flip.

One shared card component serves all grids and strips so behavior cannot drift.

## Data plumbing

- **Server (the only server change):** the gallery card DTO (`GET /api/gallery` items) gains an ordered `thumbnailIds` array (currently only the first thumbnail id is returned). Additive, covered by its own test; the detail endpoint already returns all ids.
- **Sections-mode fetch:** one catalog sweep — page through `GET /api/gallery` (`sort=recent`) until `hasMore` is false, safety cap 5 pages (120 projects) — replacing today's three parallel row fetches. Grouping is client-side: strips claim matches in declared order, a project lands in the **first** strip that claims it, the remainder fills "More to explore". The spotlight pick is independent of grouping — the spotlighted project still appears in its strip (or the grid), so the daily rotation never reshuffles strip membership.
- Flagships get published with tags matching the strip constants (a publishing-time convention, not code).

## Entry points

- **Landing hero:** the "Explore the Gallery" CTA gains a live mini-strip of 4 real gallery thumbnails, fetched from the gallery API; on any fetch failure it renders nothing (silent fail, CTA text unaffected).
- Header links unchanged.

## Edge cases

- A strip with fewer than 2 matches collapses — its matches fall through to "More to explore" (a one-card strip reads as broken).
- Empty gallery: existing empty state.
- Catalog sweep failure: existing gallery error handling.
- Safety cap reached (>120 projects): sections render from what was fetched; this design is explicitly for the small-catalog era and the cap is a guard, not a feature.

## Out of scope

- Server-side collections/featured metadata, admin curation UI.
- Category taxonomy or new publish-time metadata.
- Detail modal/page redesign, profile pages, in-editor gallery surfacing.
- Publishing the 20 flagship samples (separate effort; this design is what they land into).

## Testing

- Unit: strip claiming/dedupe/collapse rules, date-hash spotlight rotation (stable within a day, varies across days), rollover timer + reduced-motion behavior, server DTO `thumbnailIds` addition, catalog sweep pagination + cap.
- Existing gallery Playwright specs must stay green (filtered mode is unchanged; sections-mode assertions may need updating to the new structure).
- Final task: real-browser drive of the new page per house method — explainer dismiss, spotlight flip, strip scroll, card rollover, touch/no-hover fallback, filtered mode regression.
