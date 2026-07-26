# Whole-branch review fixes — `feature/gallery-listing-editing`

Three commits on top of `0bd8f71`. All five items fixed, TDD on every behaviour change.

> Note: this file previously held an unrelated report from `feat/account-moderation`, left
> behind in this worktree's gitignored `.superpowers/sdd/`. Overwritten as instructed.

| Commit | Covers |
| --- | --- |
| `b2a418e` | Item 1 — Escape no longer navigates the gallery page away |
| `849d716` | Items 2 + 5 — `If-Match` precondition on the publication PATCH; route comment corrected |
| `1c73914` | Items 3 + 4 — lazy boundary guarded; three false code-split claims corrected; dead re-export deleted |

Verification on the committed tree: `npx vitest run` → **183 files, 1,710 tests, 0 failures**
(1,703 before, +7 added). `npx tsc --noEmit` → the 5-error baseline, all in test files;
app source clean. `server/analytics.db` untouched throughout; nothing staged with `git add -A`.

---

## Item 1 — Escape in the Edit listing dialog also dismissed the gallery detail modal

**Changed:** `components/cloud/EditListingModal.tsx` — `event.stopPropagation()` added beside
the existing `event.preventDefault()` in the Escape branch, with a comment naming the mechanism
(React's `SyntheticEvent.stopPropagation` forwards to the native event; React's delegated
listener sits on the app root, below `document`, so stopping there keeps the key from reaching
`GalleryDetailModal`'s document handler).

**Test:** `tests/unit/GalleryDetailModal.test.tsx` — new case
`closes only the edit-listing dialog on Escape, without navigating away`. Renders
`GalleryDetailModal` at `/gallery/proj-1` with `/previous` underneath (the file's existing
harness), signs in as the owner so **Edit listing** renders, opens the dialog, waits for its
load to settle, fires Escape at the dialog, then asserts the dialog closed, the previous page
did **not** render, and the detail modal is still there. The file also gained a
`vi.mock` of `services/thumbnailService` — the real module sets pdf.js's worker at module
scope and crashes under jsdom, and this is the first test in the file to mount the lazy dialog.

**RED:** `npx vitest run tests/unit/GalleryDetailModal.test.tsx`

```
× closes only the edit-listing dialog on Escape, without navigating away
AssertionError: expected <div></div> to be null
- Expected: null
+ Received: <div>PREVIOUS_PAGE_MARKER</div>
```

Expected: without `stopPropagation`, the native keydown continues past React's root listener to
`document`, where `navigate(-1)` fires. The dialog closed *and* the page navigated — precisely
the reported defect, reproduced in one assertion.

**GREEN:** 7/7 in that file; `EditListingModal.test.tsx` 12/12 unaffected.

### `PublishModal` — same gap, not reachable, left alone

`PublishModal.tsx:136-137` has the identical `preventDefault`-without-`stopPropagation` Escape
branch. It is **unreachable as a defect today**, so I did not change it. Traced rather than
assumed:

- `PublishModal` is mounted from exactly one place, `components/cloud/CloudMenu.tsx:167`, and
  `CloudMenu` is rendered from exactly one place, `pages/EditorPage.tsx:317`. Neither is inside
  `GalleryDetailModal`.
- The only other document/window keydown listeners in app source are
  `components/Canvas.tsx:475` (Escape resets transient drag/resize/selection state — a no-op
  while a modal covers the canvas), `components/ProjectEditor.tsx:266` (does not handle Escape
  at all), `components/canvas/SelectUnderMenu.tsx:25` and `components/docs/DocsSearchBox.tsx:32`
  (a canvas context menu and the docs route, neither co-mounted with `PublishModal`).

So no listener that could co-fire does anything destructive or navigational. Adding
`stopPropagation` there would be defensible hygiene, but it would be an untested change to a
component this round was not otherwise touching, so I left it. Worth doing if `PublishModal`
ever gains a gallery-side entry point.

---

## Item 2 — precondition token on `PATCH /api/projects/:id/publication`

**Server** (`server/routes/projects.js`):

- Reuses `expectedHeadFromRequest(req, res)` — publish's existing `If-Match` parser — rather
  than adding a second one. It supplies 428 `PROJECT_HEAD_REQUIRED` and 400 `INVALID_IF_MATCH`
  for free.
- The parse sits **after** the cheap not-published pre-check, deliberately: "you never published
  this" is both the more useful and the truer answer, and it keeps the two existing
  `NOT_PUBLISHED` tests describing real behaviour rather than header pedantry.
- The comparison is inside the transaction, immediately after `lockProjectRows`, alongside the
  ownership and published-state checks, so a publish committing between `loadProject` and the
  lock is caught.
- Mismatch returns 409 `PUBLICATION_CHANGED`, distinct from `NOT_PUBLISHED`. The transaction
  callback returns the string `'stale'`, checked before the existing `if (!updated)`.
- The route comment records why `published_commit_id` is the token and not `published_at`
  (second-resolution `CURRENT_TIMESTAMP` cannot discriminate a same-second publish), and states
  that two concurrent *edits* remain last-write-wins by decision, with the reasoning.

**Client:**

- `services/cloudApi.ts` — `updatePublication(projectId, expectedPublication, args)`, sending
  `'If-Match': '"<token>"'` and the explicit `Content-Type`, matching `publish`'s shape exactly.
- `components/cloud/EditListingModal.tsx` — the ready `LoadState` gained
  `publishedCommitId: string`, set from `listing.headCommitId` after the load's own non-null
  check (the gallery detail response exposes `published_commit_id` under that name). Carrying it
  as its own field rather than reaching back into `load.listing.headCommitId!` keeps the
  non-null fact in the type instead of in a cast.
- A `PUBLICATION_CHANGED` code maps to a dedicated message. The server's message names the
  cause; only the client can name the cure, and the cure is **reopen the dialog**, not reload
  the page — the dialog snapshots the listing at load, so a reload of the page behind it leaves
  the stale text sitting in the fields.

**Tests** (`tests/unit/server/publication.test.js`):

- `409s on a published_commit_id that a republish has moved on from, and 200s on the current one`
  — publishes, keeps the token, saves a genuinely different commit (a same-state commit is
  deduped by the commits route and would not move the published id — that bit me first time
  through, and the setup now says so), republishes, then PATCHes with the stale token. Asserts
  409 + `PUBLICATION_CHANGED`, that the republished description and tags are **untouched**, and
  that the same edit with the current token succeeds — the recovery path has to work.
- `428s when no published_commit_id is sent at all`.
- The shared `editListing` helper now looks up the current token unless a test pins one, so the
  other eleven cases are unchanged in intent.
- `tests/unit/cloudApi.test.ts` asserts the header on the wire;
  `tests/unit/EditListingModal.test.tsx` gained
  `tells the owner to reopen the dialog when the listing was republished under it` and had its
  `updatePublication` argument positions shifted.
- `tests/unit/server/userRateLimit.test.js` — the only other caller of the route in the suite;
  now sends the header.

**RED:** `npx vitest run tests/unit/server/publication.test.js`

```
× 409s on a published_commit_id that a republish has moved on from…
  AssertionError: expected 200 to be 409
× 428s when no published_commit_id is sent at all
  AssertionError: expected 200 to be 428
✓ (11 existing tests still passing)
```

Expected: the route ignored preconditions entirely, so a stale token wrote silently — the exact
corruption in the finding — and a missing one was accepted. That only the two new tests failed
also confirms the helper change was behaviour-neutral on its own.

`npx vitest run tests/unit/EditListingModal.test.tsx tests/unit/cloudApi.test.ts` gave 6 RED
(4 argument-position, 1 missing header, 1 missing message), expected because
`updatePublication` had neither the parameter nor the header nor the code mapping.

**GREEN:** publication 13/13, EditListingModal 13/13, cloudApi 16/16, userRateLimit 2/2.

---

## Item 3 — guarded lazy boundary

`components/cloud/LazyEditListingModal.tsx`:

- `LoadingOverlay` — the Suspense fallback, now closing on backdrop click and on Escape.
- `ChunkErrorOverlay` — a modal-shaped panel reporting the failure, with **Close** and
  **Reload**. It says the app was probably updated while the page was open and that nothing
  about the listing changed.
- `EditListingChunkBoundary` — a class component with `getDerivedStateFromError` +
  `componentDidCatch`, the same shape as `components/ErrorBoundary.tsx` (which is the only
  boundary pattern in the codebase), scoped to this dialog. No retry is offered because React
  caches a rejected `lazy` payload; close and reload are the only two honest offers.

Two design points worth recording:

- **Escape is bound on `document` in the capture phase, and stops propagation there.** A
  bubble-phase document listener would sit *beside* `GalleryDetailModal`'s, not below it —
  `stopPropagation` does not suppress other listeners on the same node — so Escape during a
  chunk load would have closed the overlay *and* navigated away, re-creating item 1 in the
  loading state. Capture at `document` runs before the bubble listeners on `document`, and the
  stop-propagation flag then skips them. The test proves this rather than trusting the reading
  of the spec.
- **Neither overlay takes focus.** `EditListingModal` captures `document.activeElement` on
  mount to restore it on close; an overlay that grabbed focus first would be gone by then and
  leave `document.body` as the thing to restore, silently regressing the focus lifecycle this
  branch deliberately added.

**Tests:** new `tests/unit/LazyEditListingModal.test.tsx` (3 cases). It mocks
`components/cloud/EditListingModal` with a factory that either hangs forever or throws
`Failed to fetch dynamically imported module`, and calls `vi.resetModules()` per test with a
dynamic re-import of the host, because `React.lazy` caches its payload — resolved or rejected —
for the life of the module.

**RED:** `npx vitest run tests/unit/LazyEditListingModal.test.tsx` — 3/3 failed:

```
× dismisses the loading overlay when it is clicked      expected "vi.fn()" to be called once, but got 0 times
× dismisses the loading overlay on Escape without …     expected "vi.fn()" to be called once, but got 0 times
× reports a failed chunk load inside the dialog …       (render threw)
stderr: An error occurred in one of your React components.
        Consider adding an error boundary to your tree…
```

Expected: the fallback had no `onClick` and no key handling, and with no local boundary the
rejection escaped `render()` and killed the test — which is the app-level takeover being fixed,
observed directly.

**GREEN:** 3/3.

**Not enlarged.** The boundary still defers only the modal. Re-measured after the change:
`dist/assets/EditListingModal-*.js` is 6,355 bytes (was 6,085; the growth is items 1–2's code)
and its sole import remains `./index-*.js`.

---

## Item 4 — three false code-split claims, plus dead code

Measured against a fresh `npx vite build`, not reasoned from the import graph:

| Fact | How measured |
| --- | --- |
| One `index-*.js` at 2,650,489 B, one docs chunk, one `EditListingModal-*.js` at 6,355 B | `vite build` output + `ls -l` |
| The modal chunk imports nothing but `index` | `grep -o 'from"[^"]*"'` on the chunk → single result `./index-*.js` |
| pdfjs is already in `index` | `grep -c GlobalWorkerOptions dist/assets/index-*.js` → 2 |
| `PreviewPagePicker` is in `index`, not the modal chunk | `grep -c "Preview pages"` → 1 in index, 0 in the modal chunk |

Fixes:

- **`constants/previews.ts`** — no longer claims that importing the cap from `thumbnailService`
  "would undo the listing editor's code split". It now says the separation keeps a
  number-only consumer off that module's worker assignment, and states plainly that in this
  build it costs nothing either way, because pdfjs is already in `index` and
  `PreviewPagePicker` (the only importer) is in `index` too. Hygiene, stated as hygiene.
- **`components/cloud/LazyEditListingModal.tsx`** — the false main clause ("keeps it, and that
  library, off the gallery and my-projects routes") is gone. The replacement gives the measured
  chunk figures, says outright that the boundary removes pdfjs from no route today, and then
  states what it *does* buy: the modal's code stays out of the entry chunk, and gallery /
  my-projects do not become a second independent static importer of the renderer, which would
  pin pdfjs to them even after a future route split.
- **`public/walkthroughs/walkthrough.md`** — the paragraph no longer contradicts itself. The
  closing `MAX_PREVIEWS` sentence dropped "precisely so that importing the cap couldn't drag
  the rasteriser back in and undo the split" (which flatly contradicted "The split removes
  pdf.js from nothing" four sentences earlier) in favour of the same hygiene framing.
- **`services/thumbnailService.ts:14`** — `export { MAX_PREVIEWS }` deleted. Zero consumers
  repo-wide, confirmed by grep across all `.ts`/`.tsx`/`.js` outside `node_modules` and `dist`.

Care taken not to overcorrect: every one of these still says what the boundary prevents
(the modal and the picker inlining into `index`, and a second static importer of the renderer).
None of them calls it pointless.

The walkthrough also picked up this review round — the precondition token and its rationale, the
Escape defect, and the chunk-boundary hazard — and the unit-test total moved 1,703 → 1,710.
Chronicling it was not literally in scope, but the walkthrough describes the edit path, and
leaving it saying there is no precondition would have been a fresh instance of the same
inaccuracy class the item is about. `npx vitest run tests/unit/docs` → 9 files, 83 tests, all
passing.

---

## Item 5 — route comment

`server/routes/projects.js:435` said "Edits the public listing only". The `UPDATE` also assigns
the draft `tags` and `description` columns. The comment now leads with what the code does —
writes the `published_*` columns and mirrors tags/description onto the draft columns so a later
publish (which copies the draft columns forward) does not silently revert the edit — and
records that `PATCH /api/projects/:id` (`server/routes/projects.js:162-177`) writes exactly
those same two draft columns, has no client caller today, and would need reconciling with this
route if one ever appeared. The `published_commit_id` / `published_name` / `published_at`
never-written list is preserved verbatim.

---

## Deliberately unchanged

Confirmed I did not touch any of these: `updated_at = CURRENT_TIMESTAMP` in the publication
route; the tag round-trip's `join(', ')` / split-and-lowercase lossiness; the `pages`-capped-at-100
vs uncapped `initialSelection` mismatch; the CloudMenu focus restore; the untested host `onSaved`
handlers; `thumbnailService`'s variant/page-order behaviour.

## Files changed

```
components/cloud/EditListingModal.tsx      |  28 +++-
components/cloud/LazyEditListingModal.tsx  | 111 +++++++++++++---
constants/previews.ts                      |   8 +-
public/walkthroughs/walkthrough.md         |   8 +-
server/routes/projects.js                  |  43 ++++++-
services/cloudApi.ts                       |   6 +-
services/thumbnailService.ts               |   4 --
tests/unit/EditListingModal.test.tsx       |  30 ++++-
tests/unit/GalleryDetailModal.test.tsx     |  38 +++++-
tests/unit/LazyEditListingModal.test.tsx   |  70 ++++++++++   (new)
tests/unit/cloudApi.test.ts                |   6 +-
tests/unit/server/publication.test.js      |  73 ++++++++++-
tests/unit/server/userRateLimit.test.js    |  10 +-
13 files changed, 390 insertions(+), 45 deletions(-)
```

## Self-review

- The `'stale'` string sentinel from the transaction callback sits beside the existing `null`
  sentinel. It is checked before `if (!updated)`, so ordering is safe, and a truthy string can
  never be confused with the success object.
- `userWriteLimiter` runs before the handler, so a 428 or 409 still consumes a write-budget
  slot. That was already true of the route's 400s; not a regression, and refusing a write that
  was going to corrupt a listing is a reasonable thing to charge for.
- The `If-Match` header is already in `server/app.js:35`'s CORS `allowedHeaders`, so
  cross-origin edits keep working with no change; `tests/unit/server/guards.test.js:59` covers
  the preflight.
- Three commits, each with a self-consistent green tree. Commit 1 was made by temporarily
  reverting `EditListingModal.tsx` to HEAD and re-applying only the `stopPropagation` hunk, so
  its message and diff match exactly. Items 2 and 5 share one contiguous comment block in
  `projects.js` and could not be split; the message says both are there.
- The known load-dependent flakes (`accountModeration`, `appHeaderAdoption`,
  `dbTransactions`) all passed in the full run, twice.

## Concerns / follow-ups (none blocking)

1. **E2E coverage of the precondition is not written.** The committed Playwright specs never
   call `PATCH /publication`, so nothing there broke — I checked. But the "publish from the
   Cloud menu while the Edit listing dialog is open, then hit Save" sequence is a genuine
   two-surface interaction, and a spec asserting the owner sees the reopen message (rather than
   a silent success) would be worth adding. I did not run Playwright, per the constraints.
2. **`PublishModal`'s Escape branch still lacks `stopPropagation`** — traced above as
   unreachable today, and a landmine only if it ever gains a gallery-side entry point.
3. **`dist/` was rebuilt** (gitignored) so the byte figures now in comments describe the code as
   committed rather than as it was before this round. If you were relying on the previous build
   artifacts for anything, they are replaced.
4. **The chunk-size figures in comments and the walkthrough will drift** the next time the modal
   or the index chunk changes materially. They are dated by the round that measured them, which
   is the best available given nothing enforces them.

---

# Re-review round — two Minors closed

Re-review returned **Ready to merge: Yes** with two Minors, both closed here.

| Commit | Covers |
| --- | --- |
| `13dbea2` | Minor 1 — composite precondition token (listing identity, not version identity) |
| `1e6fd69` | Minor 2 — chunk boundary no longer blames a stale deploy for every dialog error |

Verification: the four named suites → 46/46. Full suite → **1,711 tests, 0 failures**
(`accountModeration` aborted its file under load and passed 59/59 in isolation — the known
flake, confirmed rather than assumed). `npx tsc --noEmit` → unchanged 5-error baseline.
`npx vitest run tests/unit/docs` → 83/83. `server/analytics.db` clean.

## Minor 1 — the token narrowed the race but did not close it

**The hole, confirmed.** `POST /publish` gates only on `head_commit_id === expectedHead`
(`server/routes/projects.js:400,406-410`) and never requires the head to have *moved*. So a
republish of an unchanged commit rewrites `published_description`, `published_tags`, the
thumbnails and `published_at` while `published_commit_id` stays byte-identical. A dialog opened
before that republish still held a matching token, the PATCH was accepted, and the listing ended
up with text from before and previews from after — the exact corruption the token exists to
refuse.

**Feasibility check before implementing** (the coordinator asked for this to be verified, not
assumed). `expectedHeadFromRequest` requires `/^"([\x21\x23-\x7e]+)"$/` — a class containing
neither space (`\x20`) nor quote (`\x22`). Measured what `published_at` actually serialises to:

| Engine | Value reaching the client | Raw composite fits the class? |
| --- | --- | --- |
| SQLite | `"2026-07-26 06:10:02"` (string, **contains a space**) | **No** |
| Postgres | `Date` → `res.json` → `"2026-07-26T06:10:02.503Z"` | Yes |

SQLite was checked by running `better-sqlite3` against a `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
column; Postgres by confirming `server/db.js` installs **no** `setTypeParser` override, so `pg`
returns a `Date` for `TIMESTAMP` and `res.json` emits `toISOString()`.

So the composite fits **only if the timestamp half is encoded**. `encodeURIComponent` never
emits a space or a quote, so its output is always inside the class on both engines. Verified
both forms against the actual regex before writing any code.

**Design.** New `shared/publicationTag.js` — `shared/` is this repo's established home for
logic both sides must agree on (`passwordPolicy.js`, `projectLimits.js`, imported as `.js` from
server and client alike). A format duplicated in two places is precisely the drift this branch
kept getting caught by.

```
publicationTag(commitId, publishedAt) = `${commitId}~${encodeURIComponent(...)}`
```

- `~` as delimiter: `encodeURIComponent` leaves it unescaped, yet neither half can contain one
  (commit ids are UUIDs — hex and hyphens; timestamps carry only digits, `-`, `:`, ` `, `.`,
  `T`, `Z`, `+`).
- The server **rebuilds** the expected tag from the locked row and compares whole strings.
  Nothing is parsed out of the header, so there is no delimiter ambiguity to get wrong.
- The `Date` branch reproduces `res.json`'s `toISOString()` so the server compares against the
  same text the client was handed on Postgres.
- `cloudApi.updatePublication` now takes `{ headCommitId, updatedAt }` and assembles the tag
  itself, so no caller can get the format wrong. `EditListingModal` snapshots both halves into
  its ready state.

**Residual, stated not hidden.** `published_at` is a *second factor*, never the sole token:
SQLite's whole-second resolution cannot separate two publishes inside one second. Written into
the route comment, the shared module and the walkthrough.

**Route comment** no longer overstates coverage — it refuses an edit whose *listing* moved, not
merely whose *version* moved.

**TDD evidence.** Two independent REDs, because the finding has two halves.

1. *The hole exists.* New test `409s when a same-head republish rewrote the listing without
   moving the commit`, run against the shipped single-factor token:

   ```
   × 409s when a same-head republish rewrote the listing without moving the commit
   AssertionError: expected 200 to be 409
   ```

   Expected: the commit id was unchanged, so the stale token matched and the pre-publish text
   was written over the republished listing.

2. *The second factor is what closes it.* With the composite in place, `publicationTag` was
   temporarily degraded to `` `${publishedCommitId}` `` — format intact on both sides, only the
   timestamp factor removed:

   ```
   ✓ (13 other tests)
   × 409s when a same-head republish rewrote the listing without moving the commit
   AssertionError: expected 200 to be 409
   ```

   Exactly one test failed. That isolates the timestamp half as the thing catching this case,
   and shows nothing else depends on it spuriously.

**GREEN:** publication 14/14, cloudApi 16/16, EditListingModal 13/13, userRateLimit 2/2.

The test pins `published_at` to the existing `PUBLISHED_AT_SENTINEL` before republishing, so the
republish's `CURRENT_TIMESTAMP` is certainly a different value — deterministic rather than
racing the clock, with the second-resolution residual noted inline. `userRateLimit` builds its
tag from the **gallery DTO** rather than the database, which incidentally round-trips the
client-visible fields through the real endpoint and proves they reconstruct the server's tag.

## Minor 2 — boundary mislabelled non-chunk failures

`EditListingChunkBoundary` wraps the `Suspense`, so it also catches a runtime render error from
`EditListingModal` after it has loaded. The copy asserted the narrower cause. Softened rather
than branched — the boundary genuinely cannot distinguish the two, and both are served by the
same advice:

> The listing editor stopped working. Reloading usually clears it — often the app was updated
> while this page was open. Nothing about your listing has changed.

A comment records why it is deliberately not branched. The lazy-boundary test's assertion moved
from `/could not be loaded/i` to `/stopped working/i`; 3/3 green.

## Not changed, as directed

`updated_at` bump, tag round-trip, `pages`-100 slot, CloudMenu focus restore, untested host
`onSaved` handlers, `PublishModal`'s Escape, and the 3-byte `dist/` discrepancy.

## Concerns

1. **The same-second residual is real but small**, and it is now documented in three places
   rather than discovered later. Closing it fully would need a monotonic publication counter or
   a sub-second column — a migration, which was explicitly out of scope.
2. **`shared/publicationTag.js` is a new cross-boundary contract.** If either side ever stops
   using it the failure is total (every edit 409s) rather than subtle, which is the right
   failure direction, but it is worth knowing.
3. **The precondition e2e remains a follow-up**, per the re-review's own ruling.
4. **This file previously held `feat/account-moderation`'s report.** It is a tracked file; the
   prior content is preserved in git history at `e18878b` and is recoverable with
   `git show e18878b:.superpowers/sdd/final-fix-report.md`. Flagging it because overwriting
   tracked content from another branch is the kind of thing this repo has an incident note about.
