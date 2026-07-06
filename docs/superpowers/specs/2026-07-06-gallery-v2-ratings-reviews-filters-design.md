# Gallery v2 — Ratings, Reviews, Tag Filtering, Visual Refresh — Design

**Status:** Approved (interactive brainstorming, 2026-07-06)

## Context

The gallery shipped functional but barebones (`pages/GalleryPage.tsx`): a search box (name + description `LIKE`), a Newest/Popular sort select, and a flat card grid showing name, author, fork and download counts. Tags are collected at publish time and stored per project (JSON text column `projects.tags`) but are only *displayed* on the detail page — nothing filters by them. There is no rating or review system anywhere. The detail page (`components/gallery/GalleryDetailBody.tsx`, rendered both as a standalone page and as the overlay modal) shows metadata and action buttons but offers no community signal beyond raw fork/download counts.

## Decisions (from brainstorming)

- **Ratings + reviews:** 1–5 star rating with optional written review. One per user per project, editable and deletable by its author. Cards and detail page show average + count. Reviews are reportable through the existing reports pipeline; admin can remove a review.
- **Who can review:** signed in **with a username** — the same `requireUsername` gate as fork/publish, so every review has a public handle and the legacy null-username identity gap stays closed. Owners cannot review their own project.
- **Organization:** filter-bar-plus-sections layout. Default view: hero band, tag chip row, then three curated section rows (Top rated / Popular / Recently updated). Any search text, tag selection, or "see all" collapses to a single filtered, paginated grid. Clearing filters returns to sections.
- **Visual refresh:** polish within the existing slate/blue Tailwind language — richer cards, hover states, gradient hero, better empty/loading states. No new theme, no dark mode, no layout system change.

## Design

### 1. Database — migration `008_reviews`

Appended to `server/migrations/index.js` (pg + sqlite variants, same pattern as 001–007):

```sql
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    UNIQUE (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
ALTER TABLE reports ADD COLUMN review_id TEXT;
```

- Rating required; body optional (trimmed, max 2000 chars — server-enforced).
- `created_at`/`updated_at` are **app-stamped millisecond-precision timestamps** (same lesson as Task 8's commit-ordering bug — SQLite `CURRENT_TIMESTAMP` is whole-second).
- No denormalized average columns on `projects`. Averages are computed with SQL aggregates at read time; gallery scale doesn't justify counter-maintenance bugs. (Precedent: `fork_count`/`download_count` are counters, but they're increment-only; a rating average changes on every edit/delete and is genuinely easier to keep correct as an aggregate.)
- `reports.review_id` nullable; existing project reports have it NULL. A report row now targets a project (`project_id` set, as today) or a review (`review_id` set; `project_id` still set to the review's project so admin listing keeps its project context).
- **Partial-failure safety:** the migration runner (`server/migrations.js`) is not transactional — it splits on `;` and executes statements one at a time, so a mid-migration failure leaves earlier statements applied without recording the migration id, and a rerun re-executes all of them. `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` tolerate re-execution; `ALTER TABLE ADD COLUMN` does not in SQLite (no `IF NOT EXISTS` support). Therefore the `ALTER` must be the migration's **last** statement, and the Postgres variant uses `ADD COLUMN IF NOT EXISTS` (supported there).

### 2. Server — `server/routes/gallery.js` (all changes in this one file)

**`GET /api/gallery` (extended, backward compatible):**
- `q` now also matches tags: `LOWER(p.tags) LIKE $n` added to the existing name/description OR-clause.
- New `tag` param: exact-tag filter via `p.tags LIKE '%"' || <tag> || '"%'` on the JSON text (matches the quoted-string encoding `JSON.stringify` produces; tags are validated at publish time to be lowercase-safe plain strings). Note: substring-of-JSON matching is the same tradeoff the existing `q` search already makes; a proper `project_tags` join table is deliberately out of scope until scale demands it.
- New `sort=rating`: `ORDER BY rating_avg DESC NULLS LAST, rating_count DESC, p.updated_at DESC`. (SQLite lacks `NULLS LAST` before 3.30 only — the bundled version supports it; verify in tests, else `ORDER BY rating_avg IS NULL, rating_avg DESC`.)
- New `limit` param: `Math.min(PAGE_SIZE, parseInt(limit) || PAGE_SIZE)` — lets the sections view fetch small rows cheaply. Pagination semantics unchanged when omitted.
- `cardFields` gains a lateral/scalar subquery pair: `(SELECT AVG(rating) FROM reviews r WHERE r.project_id = p.id) AS rating_avg`, `(SELECT COUNT(*) ...) AS rating_count`. `cardDto` gains `ratingAvg` (number | null, rounded to 1 decimal in the DTO) and `ratingCount`.

**`GET /api/gallery/tags` (new, public):** selects `tags` from all public projects, parses and counts in JS, returns `{ tags: [{ tag, count }] }` sorted by count desc, capped at 30. Fine at current scale; documented as a candidate for a real tags table later.

**`GET /api/gallery/:id` (extended):** detail DTO gains `ratingAvg`, `ratingCount` via the same subqueries.

**`GET /api/gallery/:id/reviews` (new, public):** `loadPublicProject`, then reviews joined to `"user"` for `author` username, newest first, `LIMIT 100`. DTO: `{ id, rating, body, author, createdAt, updatedAt }`. With `optionalAuth`, response also includes `myReview` (the caller's own review or null) so the client needn't diff the list.

**`PUT /api/gallery/:id/review` (new):** `requireAuth, requireUsername, userWriteLimiter, loadPublicProject`. Upsert by `(project_id, user_id)`. Validates rating ∈ 1..5 integer, body optional ≤2000 after trim. **403 if caller owns the project** ("You can't review your own project"). Returns the saved review DTO.

**`DELETE /api/gallery/:id/review` (new):** `requireAuth, loadPublicProject`, deletes the caller's own review; 404 if none. Deliberately **not** username-gated — same principle as unpublish/delete: never trap a legacy account away from removing its own content.

**`POST /api/gallery/:id/reviews/:reviewId/report` (new):** `optionalAuth, loadPublicProject`; validates the review belongs to that project; inserts a report row with both `project_id` and `review_id`. Same required-reason validation as project reports.

**Admin:** `GET /api/admin/reports` gains `review_id` and (when set) the review body in its rows (LEFT JOIN reviews). New `DELETE /api/admin/reviews/:id` (`requireAdmin`) removes a review outright.

**Visibility:** every review read/write goes through `loadPublicProject`, so unpublishing a project automatically hides (and blocks writes to) its reviews without any extra code. Rows survive for re-publish; project deletion cascades them away.

### 3. Client API — `services/cloudApi.ts`

- `GalleryItem` gains `ratingAvg: number | null; ratingCount: number` (and `GalleryDetail` inherits).
- New types: `ReviewDto { id, rating, body, author, createdAt, updatedAt }`, `GalleryTag { tag, count }`.
- `gallery(params)` accepts `tag?, limit?` and `sort: 'recent' | 'popular' | 'rating'`.
- New methods: `galleryTags()`, `listReviews(projectId)` → `{ reviews, myReview }`, `putReview(projectId, { rating, body })`, `deleteReview(projectId)`, `reportReview(projectId, reviewId, reason)`.

### 4. Shared components (new, `components/gallery/`)

**`StarRating.tsx`** — one component, two modes:
- Display: fractional-fill stars for an average (e.g. 4.3), with optional `(count)` suffix; renders a muted "No ratings yet" state when count is 0 on the detail page, and simply omits stars on cards.
- Input (`onChange` provided): 5 clickable stars with hover preview, keyboard accessible (radio-group semantics).

**`ProjectCard.tsx`** — the single card used by gallery sections, the filtered grid, and `ProfilePage`'s grid (which currently duplicates card markup). Contents: thumbnail (aspect 3/4, subtle zoom on hover), name, author, 2-line clamped description, up to 3 tag chips (clickable — navigates to the gallery with that tag selected, `stopPropagation` so the card link doesn't fire), star average + count (hidden when 0), fork/download counts. Hover: `hover:shadow-lg hover:-translate-y-0.5 transition`. Wrapped in the existing `GalleryLink` so modal-overlay behavior is preserved.

**`ReviewsSection.tsx`** — used by `GalleryDetailBody`:
- Header: "Reviews" + star summary.
- Write box (3-way gate, same branching pattern as the Fork button): signed out → "Sign in to review" link (`from`-redirect); signed in without username → "Set a username to review" link; with username and not owner → star input + textarea + Save (edit mode pre-filled from `myReview`, with Delete). Owner sees no write box.
- List: author (link to `/u/:username`), stars, relative date, body, per-review "Report" (same `window.prompt` reason flow as the existing project report).

### 5. `pages/GalleryPage.tsx` rework

Two view modes driven by URL search params (`useSearchParams`: `q`, `tag`, `sort` — so filtered views are shareable/bookmarkable and back-button-friendly):

- **Sections mode** (no `q`/`tag`/`sort` params): gradient hero band (blue-600→slate tones, headline "Discover planner & notebook templates", subtitle, search input embedded in the hero), tag chip row from `galleryTags()` (chip = tag + count; click sets `tag` param), then three rows fetched in parallel with `limit: 8`: ★ Top rated (`sort=rating`), 🔥 Popular (`sort=popular`), 🕒 Recently updated (`sort=recent`), each with a "See all →" that sets the `sort` param. Sections with no items are omitted; if the gallery is entirely empty, one friendly empty state.
- **Grid mode** (any param set): compact header keeps search + sort select (now including "Top rated"), active tag shown as a dismissible chip, "← All projects" clears params back to sections mode. Grid + existing Previous/Next pagination, `ProjectCard` cards. Empty result state: "No projects match — clear filters?".
- Loading states: skeleton cards (pulsing slate blocks) instead of a blank page.

### 6. Detail page/modal — `components/gallery/GalleryDetailBody.tsx` + `hooks/useGalleryDetail.ts`

- Star summary (display `StarRating` + count) directly under the author line.
- Tag chips become clickable (navigate to gallery tag filter; inside the modal this replaces the background — acceptable, it's a navigation).
- `ReviewsSection` appended below the existing content (inside the modal it scrolls with the body).
- `useGalleryDetail` gains review state: loads `listReviews` alongside the detail, exposes `reviews`, `myReview`, `saveReview`, `deleteReview`, `reportReview`; saving/deleting refreshes both the list and the project's `ratingAvg`/`ratingCount`.

### 7. `pages/ProfilePage.tsx`

Swaps its inline card markup for `ProjectCard` — one card implementation everywhere.

## Non-goals

- No owner replies to reviews, no review voting/helpfulness, no review pagination beyond the 100 cap.
- No dedicated tags table or full-text search engine — documented tradeoff, revisit at scale.
- No dark mode / theme change.
- No email/notification when a project gets reviewed.
- The editor's Cloud menu and merge-request UI are untouched.

## Testing approach

**Server (supertest + SQLite, extending `tests/server/gallery.test.js` patterns):**
- Review CRUD: create, read back (list + `myReview`), upsert-edit, delete; rating validation (0, 6, non-integer, missing → 400); body length cap.
- Gates: anonymous PUT → 401; no-username account → 403 `USERNAME_REQUIRED`; owner self-review → 403; anonymous DELETE → 401; no-username DELETE of own review → succeeds.
- Aggregates: `ratingAvg`/`ratingCount` correct on card and detail after create/edit/delete; `sort=rating` orders correctly incl. unrated-last; ties break on count.
- Tag filter: `tag` param exact match (and no false hit on a tag that's a substring of another); `q` matches tags; `limit` capped at PAGE_SIZE.
- `GET /api/gallery/tags` counts and cap.
- Reviews hidden after unpublish (list 404s); project delete cascades reviews.
- Review report: creates row with `review_id`; admin report listing includes it; `DELETE /api/admin/reviews/:id` removes; non-admin → 403.

**Client (vitest/RTL, extending `tests/unit/`):**
- `StarRating`: display fractions, input clicks/keyboard, onChange values.
- `ProjectCard`: renders rating when count > 0, hides when 0; tag chip click navigates to tag filter without triggering card link.
- `GalleryPage`: sections mode renders three rows; typing a search switches to grid mode; tag chip sets URL param; "See all" and clear-filters transitions; URL params drive initial state.
- `ReviewsSection` (via `GalleryDetailPage` tests): 3-way gate rendering; save calls `putReview` and refreshes; owner sees no write box.

**Final verification:** real-browser walkthrough — publish from one account, rate + review from a second, confirm stars on card and detail, edit the review, filter by tag from a card chip, check sections view ordering, delete the review, confirm aggregate updates.

## Files touched (summary)

- `server/migrations/index.js` — migration `008_reviews`.
- `server/routes/gallery.js` — extended list/detail, new tags + review + report + admin endpoints.
- `services/cloudApi.ts` — new types and methods.
- `components/gallery/StarRating.tsx`, `ProjectCard.tsx`, `ReviewsSection.tsx` — new.
- `pages/GalleryPage.tsx` — sections/grid rework, URL-param filters, hero.
- `components/gallery/GalleryDetailBody.tsx`, `hooks/useGalleryDetail.ts` — rating summary + reviews wiring.
- `pages/ProfilePage.tsx` — adopt `ProjectCard`.
- Tests as listed above.

No new dependencies.
