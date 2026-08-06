# Gallery All-Projects Directory — Design

**Date:** 2026-08-06
**Status:** Approved design, pending implementation plan
**Builds on:** `2026-08-04-gallery-discoverability-design.md` (the sections redesign this closes a gap in)

## Problem

The redesigned gallery sections view has no path to a complete project list. The old per-row "See all →" buttons died with the curated rows; the filtered card grid (`?q`/`?tag`/`?sort`) still exists but nothing on the sections view links to it, and "More to explore" shows only strip-unclaimed projects — which reads like a partial directory. A user who wants to scan everything has no way to.

## Solution

A dedicated compact directory view at `/gallery?view=all`, reached from three entry points on the sections view.

### Directory view

- **URL:** `/gallery?view=all` — shareable, bookmarkable, back-button friendly. A direct hit renders the directory.
- **Data:** the existing `cloudApi.galleryAll()` sweep (one paginated sweep of the whole catalog, 5-page/120-project guard). No pagination UI — the full list is the point at this catalog size.
- **Layout:** a table of compact rows: small 3:4 thumbnail (~40 px wide), name, author, rating (stars + count), downloads, forks, updated date. Each row's name/thumbnail is a `GalleryLink` to the project, opening the detail modal over the page (the same background-location pattern the cards use).
- **Sorting:** client-side, by clicking column headers — Name, Author, Rating, Downloads, Updated. Default: Updated, descending. Clicking a header toggles asc/desc on that column. Sort state is component state, not a URL param.
- **Header:** "All projects (N)" where N is the catalog size.
- **Empty and error states:** reuse the gallery's existing copy ("Nothing here yet…", "Could not load the gallery.").

### Mode precedence in `GalleryPage`

`?q`/`?tag`/`?sort` filtered card grid (unchanged, wins as today) → `?view=all` directory → sections view. The sticky search bar renders in all modes; typing in it from the directory sets `?q` and switches to the filtered grid exactly as it does from the sections view.

### Entry points (all three, sections view only)

1. **Sticky bar:** an "All projects" link beside the search input — always visible without scrolling.
2. **"More to explore" heading:** a "See all →" link beside the heading (restores the old affordance where users last saw it).
3. **Prominent band:** a full-width "Browse all N projects →" row after the last section, above the bottom tag chips.

All three set `?view=all` via the existing `setParam` URL-param helper.

## Out of scope

- Server changes (none needed — `galleryAll` already returns every field the rows show).
- Directory-side text filtering, URL-persisted sort, pagination.
- Any change to sections, filtered grid, detail modal, or profile pages beyond the three entry-point insertions.

## Testing

- Unit: mode precedence (`view=all` renders directory; `q`+`view=all` renders filtered grid; no params renders sections), row content rendering, client-side header sorting (toggle direction, correct ordering for a string column and a numeric column, null ratings sort last), row link opens the detail route, all three entry points navigate to `?view=all`, empty and error states.
- e2e: untouched — the mode is additive and the existing specs never visit `?view=all`.
