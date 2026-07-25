# Editing a published gallery listing

**Date:** 2026-07-25

## Problem

Two gaps, both in the publish path.

1. **A published listing is immutable except by republishing.** `POST /api/projects/:id/publish` (`server/routes/projects.js:315`) is the only writer of `published_description`, `published_tags`, and the `thumbnails` rows. It requires an `expectedHead` and always sets `published_commit_id = head`. So fixing a typo in a tag, dropping a stale one, or swapping a preview page forces the owner to republish whatever their current working head happens to be — pushing unfinished work public as the price of editing metadata. There is no owner affordance anywhere in the UI: `GalleryDetailBody.tsx` has none, `MyProjectsPage.tsx` offers only Delete, and `PATCH /api/projects/:id` writes only the draft `name`/`description`/`tags` columns (never the `published_*` ones) and is called by no client code.

2. **The preview cap is 4.** Requested to be 6.

## Goals

- An owner can change a published listing's **description, tags, and preview screenshots** without moving the published version.
- The preview cap goes from 4 to 6, everywhere.

## Non-goals

Deliberately excluded, each for a stated reason:

- **A user-facing Unpublish button.** A known pre-existing gap (working endpoint, no UI). Its own round.
- **Drag-reorder of previews.** Order stays selection order, as today. Adds drag-and-drop UI and tests to three entry points for a smaller win than the rest of this.
- **Editing the listing name.** `published_name` stays a copy of the project name; making it independent lets the gallery title and the editor's project name drift apart.
- **Counting thumbnails against the storage quota.** `getUserStoredBytes` (`server/middleware/limits.js:36`) sums commit `state_bytes` only. Thumbnails have always been uncounted. Documented as a known limitation below rather than fixed here.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where to edit from | All three: gallery detail, My projects, editor Cloud menu | One shared modal, three thin entry points; each is a place an owner plausibly notices the problem |
| Effect on published version | Never moves | Metadata-only. Previews re-render from the already-published commit, so they always match public content |
| Editable fields | Description, tags, previews | Exactly what the publish wizard collects, minus the name |
| Preview re-picking | Pre-checked page list backed by a new `thumbnails.node_id` | Touch the selection and the previews become exactly what you checked; leave it alone and they don't change. Editing reads as an edit, not a redo |
| Guard rails | `userWriteLimiter` on the new endpoint | Previews are re-uploadable blobs; publish itself is unthrottled today, so at minimum don't make churn cheaper |
| Component shape | One lazy `EditListingModal` | Keeps pdfjs off the gallery/my-projects chunks; leaves `PublishModal`'s publish-only state machine alone |

## Architecture

### Server

**Migration `016_thumbnail_node_id`** — `ALTER TABLE thumbnails ADD COLUMN node_id TEXT`, nullable, identical DDL for Postgres and SQLite. Rows written before this migration stay `NULL`, which is the signal for "source page unknown".

**Cap 4 → 6** — `server/routes/projects.js:319` becomes `thumbnails.length > 6`, message `'thumbnails must contain 1-6 images'`. `parseThumbnail` and the 300 KB per-image cap are unchanged.

**Shared request shape** — both publish and the new edit route accept:

```
{ description: string, tags: string[], thumbnails: string[], previewNodeIds?: string[] }
```

`previewNodeIds` is optional, and when present must be the same length as `thumbnails`. Optional keeps an older client's publish working (it simply writes `NULL` node ids). Both routes call one extracted `parsePreviewSet(body)` helper so the two validations cannot drift.

On the **edit** route only, `thumbnails` may additionally be **omitted entirely**, meaning "leave the existing previews untouched" — so a tags-only fix costs no PDF render and no blob re-upload. Present means full replace, 1–6 images, same as publish. An empty array is rejected, not treated as omitted; wiping a listing's previews is not a thing this endpoint does. On the **publish** route `thumbnails` stays required, as today.

**New `PATCH /api/projects/:id/publication`** — middleware `requireAuth`, `loadProject(true)` (ownership), `userWriteLimiter`.

No `requireUsername`. The established rule (from the username-identity round) gates routes that attach *new* content to the gallery as the acting user, and deliberately leaves ungated the routes that act on content the caller already owns — `unpublish`, `merge`, `close`, delete. Editing your own existing listing is the second kind. The gate would also be dead code: publishing requires a username, so every published project's owner has one.

Behaviour:

- 409 `NOT_PUBLISHED` when `visibility !== 'public'` or `published_commit_id IS NULL`.
- Inside one `withTransaction`:
  - update `published_description` and `published_tags`, mirroring to the draft `description`/`tags` columns exactly as publish does — nothing else writes those columns today, and mirroring keeps them from drifting;
  - only when `thumbnails` was supplied: `DELETE FROM thumbnails WHERE project_id = $1`, then reinsert the new set with `position` and `node_id`.
- **Not written:** `published_commit_id`, `published_name`, `published_at`. Leaving `published_at` alone is load-bearing: it drives the gallery's "recently updated" sort, and letting a tag edit bump a project to the top would be free ranking.
- Returns `{ project: { ...projectDto(row), thumbnailIds } }` — the same shape publish returns.

**`GET /api/gallery/:id`** gains `previews: { id: string; nodeId: string | null }[]` alongside the existing `thumbnailIds` (`nodeId` is null for anything published before migration 016). `thumbnailIds` is kept so `GalleryDetailBody.tsx:25` and every existing test are untouched.

No other new read route is needed. The modal reads published metadata and previews from `GET /api/gallery/:id`, and the published `AppState` from `GET /api/projects/:id/commits/:commitId` — which already permits anyone to read a *published* commit.

### Client

**`services/thumbnailService.ts`** — two changes:

- `nodeIds.slice(0, 4)` → `slice(0, 6)`, doc comment updated.
- Return `{ nodeId, dataUrl }[]` instead of `string[]`. This is required for correctness, not tidiness: the loop `continue`s past a node id missing from the page order or a canvas with no 2d context (`:28`, `:37`), so a parallel `previewNodeIds` array built by the caller would silently misalign images with pages on any skip. Returning pairs also means the documented "publishing can silently include fewer previews than selected" limitation at least attributes the survivors correctly.

Callers to update: `PublishModal.tsx:98`; `MergeRequestPage.tsx:95-96` (`const [after] = …` → `after.dataUrl`); the mocks in `tests/unit/MergeRequestPage.test.tsx` and `tests/unit/mergeRequestGuidance.test.tsx`.

**`components/cloud/PreviewPagePicker.tsx`** (new, shared) — the page checkbox list, the 1–6 cap, and a hint that the first preview is the gallery card cover. Props `{ pages, selected, onChange }`. `PublishModal` deletes its inline `toggle` (`:87-89`) and list markup (`:186-196`) and uses this, so the cap has exactly one implementation.

**`components/cloud/EditListingModal.tsx`** (new, lazy-loaded) — props `{ projectId, onClose, onSaved }`. Self-fetching, so all three entry points stay trivial:

1. `cloudApi.galleryDetail(projectId)` → description, tags, `previews`, `headCommitId` (the published commit).
2. `cloudApi.getCommit(projectId, headCommitId)` → published `AppState` → `computePageOrder`.
3. Pre-check pages from `previews[].nodeId`.
4. Save: if the checked set is unchanged from what loaded (same ids, same order), send description and tags only and skip rendering entirely. Otherwise `generateThumbnails(state, selected, state.activeVariantId)` and send the images with their node ids.

**Legacy listings** (every row published before migration 016, so all `nodeId === null`) open with nothing checked and their current images displayed above the picker, under a line stating that picking pages replaces the whole preview set and that leaving it alone keeps the current images. Because an empty selection sends no `thumbnails` at all, a legacy owner can fix a tag without being forced to re-pick pages they can no longer see the identity of.

The invariant in both cases: **if you touch the page selection, the published previews become exactly what you checked; if you don't, they don't change.**

**Entry points**, each `React.lazy` + `Suspense`, so pdfjs-dist and its worker land in their own chunk rather than on the gallery or my-projects route. This matters: `hooks/useGalleryDetail.ts:5` already static-imports `pdfService` (jsPDF) for the zip download, but nothing on those routes pulls `pdfjs-dist` today.

- `GalleryDetailBody.tsx` — "Edit listing" button in the owner block, gated on the existing `isOwner`.
- `MyProjectsPage.tsx` — row action for rows with `visibility === 'public'`; refreshes through the existing `load()`.
- `CloudMenu.tsx` — menu item shown when `cloudProject?.visibility === 'public'`, reusing the object already fetched at `:42`. Sits beside "Publish to gallery…", which keeps its distinct job of pushing a newer version.

**`services/cloudApi.ts`** — add `updatePublication(projectId, { description, tags, thumbnails, previewNodeIds })`; extend the `GalleryDetail` type with `previews`.

## Error handling

- Non-owner or unauthenticated: 403 from `loadProject(true)`, as every other owner route.
- Project not currently published (raced against an unpublish, or stale UI): 409 `NOT_PUBLISHED`; the modal surfaces the message and offers to close.
- Invalid thumbnails or tags: the same 400s publish returns, from the shared `parsePreviewSet`. An empty `thumbnails` array is a 400, distinct from omitting the field.
- Rate limited: existing `RATE_LIMITED` shape from `userWriteLimiter`.
- Preview rendering fails entirely (zero images): the modal refuses to submit, matching `PublishModal:101`.
- No `PROJECT_HEAD_CHANGED` path exists here at all — the endpoint never reads or writes the head, which is the whole point.

## Testing

- `tests/unit/server/publish.test.js` — 6 accepted, 7 rejected; `previewNodeIds` persisted; length mismatch rejected; absent `previewNodeIds` still publishes with NULLs.
- `tests/unit/server/publication.test.js` (new) — non-owner 403; unpublished project 409 `NOT_PUBLISHED`; description, tags, and thumbnails updated **while `published_commit_id`, `published_name`, and `published_at` are asserted unchanged**; omitted `thumbnails` leaves the existing rows byte-identical; empty `thumbnails` array 400s; `userWriteLimiter` applied.
- `tests/unit/server/gallery.test.js` — detail returns `previews` with node ids; `thumbnailIds` unchanged.
- `tests/unit/PublishModal.test.tsx` — 6-page cap; payload carries `previewNodeIds`.
- `tests/unit/EditListingModal.test.tsx` (new) — pre-check from `previews`; legacy all-NULL case opens unchecked and shows current images; an unchanged selection sends no `thumbnails` and never calls `generateThumbnails`; a changed selection sends images plus node ids.
- `tests/unit/MergeRequestPage.test.tsx`, `tests/unit/mergeRequestGuidance.test.tsx` — mocks updated for the `{ nodeId, dataUrl }` return.
- `tests/e2e/gallery.spec.js` — publish → edit tags from the gallery page → the new tag filters correctly → the published commit id is identical before and after.
- Mandatory real-browser drive of all three entry points, per the house method.

## Documentation

- `docs-content/tutorials/gallery/04-publishing.md:38` and `docs-content/reference/cloud/publish-and-unpublish.md:8` — 1–4 becomes 1–6.
- `docs/8-cloud-and-gallery.md:25` — same, and the "capped client-side at 4" note.
- `docs-content/reference/cloud/publish-and-unpublish.md` — document the edit-listing flow: metadata-only, does not republish, does not re-rank in "recently updated".
- `docs-content/tutorials/gallery/04-publishing.md` — a short "fixing a listing after the fact" step.
- Re-run `node docs-capture/run.js gallery` for the publish-wizard stills that show "Preview pages (up to 4)".

## Known limitations

- **Thumbnails remain outside the storage quota.** Pre-existing; `getUserStoredBytes` counts commit bytes only. Raising the cap to 6 moves the uncounted worst case per user from roughly 24 MB to 36 MB (`MAX_PUBLIC_PROJECTS_PER_USER` = 20 × 6 × 300 KB). Bounded by that project cap and by the new rate limit; not addressed here because folding thumbnails into the quota changes every user's reported usage and the shared storage-limit tests.
- **Partial preview-render failure still publishes fewer previews than selected**, as documented before. This round makes the surviving images correctly attributed to their pages but does not change the behaviour.
