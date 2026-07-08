# Building the Gallery, Fork & Merge Request System

**Issue:** [doctect/doctect#9](https://github.com/doctect/doctect/issues/9)
**Branch:** `feature/gallery-fork-merge-requests` (merged to `main`)

This is a detailed walkthrough of how PDF Architect went from a purely local-first, single-user editor to a full public gallery with GitHub-style forking, version history, and merge requests — gated behind an expanded authentication system. It covers all 27 planned tasks, the critical finding from the final review, and every round of follow-up work that's come out of real use since.

## Why this exists

Before this work, every project lived only in the browser's `localStorage`. There was no way to publish a planner design, no way for someone else to build on it, and no accounts beyond a hidden admin analytics dashboard. Issue #9 asked for:

- A gallery of published projects, browsable without an account.
- Accounts for publishing and saving privately to the cloud.
- Forking and version control, GitHub-style.
- Merge requests to propose changes back upstream.

## How it was planned and built

The work was scoped through a brainstorming session that settled six architectural decisions before any code was written: **local-first with explicit "save to cloud"/"publish"** actions (not silent auto-sync), **full-snapshot commits** for version history (not diffs), a **three-way structured diff** for merge requests (variant/template/node-hierarchy granularity, not a line-by-line text diff), the **existing better-auth setup extended** with public username handles, **client-side thumbnail generation** (jsPDF → pdfjs-dist → WebP), and a **single sequential plan** covering all of it.

The resulting plan broke into 6 phases and 27 tasks, executed one at a time: a fresh implementer picked up each task's brief, wrote it test-first, and a separate reviewer independently checked the diff against the requirements before the next task started. Every task's implementer and reviewer worked from nothing but the task's own brief plus whatever earlier tasks had already shipped — the same constraint a new contributor would face.

---

## Phase 0 — Foundation (Tasks 1–3)

Nothing user-visible shipped in this phase, but it fixed the one thing that would have made everything else unsafe to build on.

**Task 1 — DB query adapter + migration runner.** The existing `server/db.js` ran `DROP TABLE ... CASCADE` on every Postgres boot to force a schema refresh — harmless while the database only held disposable analytics events, but a real user-data hazard the moment it started holding accounts and projects. Replaced with a versioned, run-once migration system (`server/migrations.js`, `server/migrations/index.js`) and a single `query()` function that works identically against Postgres and SQLite.

**Task 2 — App factory + supertest harness.** Extracted the monolithic `server/index.js` into a `createApp()` factory (`server/app.js`) that can be booted in-process for tests, plus `server/authRequest.js` for per-host auth instance caching. This is what let every later server task write real HTTP tests against a real (SQLite-backed) server instead of mocking.

**Task 3 — Hardening middleware.** Added `checkOrigin` (CSRF defense via an origin allow-list), rate limiting, and `helmet` security headers, plus made `TRUSTED_ORIGINS`/`ALLOWED_HOSTS` environment-driven instead of hardcoded.

---

## Phase 1 — Auth Expansion (Tasks 4–6)

**Task 4 — Public usernames.** Enabled better-auth's `username` plugin so every account gets a unique, public handle (3–30 characters) shown on the gallery instead of an email address.

**Task 5 — `/api/me`.** A small session-info endpoint returning the current user (or `null`), used by the client to know whether someone's signed in.

**Task 6 — Signup UI + account menu.** Added the username field to the signup form with inline validation, and a new `AccountMenu` component (session-aware dropdown: sign in / username + profile/gallery/sign-out) wired into both the landing page and editor headers.

---

## Phase 2 — Cloud Saves + Version History (Tasks 7–11)

**Task 7 — `validateAppState`.** A structural validator (shape, size cap of 5 MB, node/element count caps) that every later task uses to reject malformed or oversized project JSON before it's ever stored.

**Task 8 — Projects + commits API.** The core of cloud storage: `POST/GET /api/projects`, `PATCH/DELETE /api/projects/:id`, and `POST/GET /api/projects/:id/commits` — each commit an immutable, full snapshot of the project's `AppState`, with the project's `head_commit_id` moving forward on every save. Uncovered a subtle bug here: SQLite's `CURRENT_TIMESTAMP` only has whole-second resolution, so two commits saved within the same second would tie, and the tiebreak (a random UUID) made "newest commit first" ordering a coin flip. Fixed by stamping commits with an app-generated millisecond-precision timestamp instead of relying on the database default.

**Task 9 — Typed client API service.** `services/cloudApi.ts`, a single typed wrapper around every server endpoint this feature adds — every later client task imports from this one file.

**Task 10 & 11 — Save to cloud, version history, restore.** A `CloudMenu` component in the editor toolbar (save/history/publish, all gated on sign-in), and a `HistoryModal` listing commits with a **Restore** action. Restoring an old commit correctly reverts the active editor tab's visible content — verified directly in a real browser by renaming a node, saving, restoring the older version, and confirming the name actually reverted on screen (not just that the API call succeeded).

---

## Phase 3 — Gallery + Publishing (Tasks 12–18)

**Task 12 — Publish/unpublish + thumbnails.** Publishing a project takes a description, tags, and 1–4 preview images; `parseThumbnail` validates each one by its actual magic bytes (not just the claimed MIME type) and rejects anything over 300 KB.

**Task 13 — Public gallery API.** `GET /api/gallery` (search + sort + pagination, public projects only), detail/download/report endpoints, and admin moderation (`GET /api/admin/reports`, unpublish).

**Task 14 — Client thumbnail generation.** The editor's canvas is DOM-based, not a real `<canvas>`, so there was no way to screenshot a template. Solved by reusing the existing jsPDF export pipeline: render to an in-memory PDF, rasterize it with `pdfjs-dist`, downscale to WebP. This surfaced a real problem — the `pdfjs-dist` npm `latest` tag was actually broken in current Chromium (it called an unshipped JavaScript engine method), confirmed by launching a real browser and watching it throw. Pinned to the last known-working release instead.

**Task 15 — Publish wizard.** A modal for picking preview pages, entering metadata, and watching the thumbnails render live before publishing.

**Task 16 — Gallery browse/detail + anonymous "Open in editor."** The public gallery pages, plus a flow that lets anyone — signed in or not — clone a published project straight into their own local editor with no account and no link back to the original's cloud data. Also found and fixed an unrelated infrastructure bug while verifying this: the server's security headers were blocking gallery thumbnail images from loading across the Vite-dev-server/API-server origin split, since nothing had rendered a plain `<img>` tag against that route before.

**Task 17 — Public profile pages.** `/u/:username`, showing a user's published work — and closing a small gap Task 16 had left open (an author link that went nowhere).

**Task 18 — End-to-end test.** A committed Playwright spec covering sign-up → publish → browse, run repeatedly against a real server and cross-checked against the database to confirm it wasn't a false pass.

---

## Phase 4 — Fork / Clone (Tasks 19–20)

**Task 19 — Fork endpoint.** `POST /api/projects/:id/fork` copies a public project's current commit into a brand-new **private** project owned by the caller, recording exactly which project and commit it was forked from.

**Task 20 — Fork UX + full verification.** A "forked from upstream" indicator in the cloud menu, and the first end-to-end test of the complete loop: one account publishes, a second account forks it, edits it, and saves — confirmed the fork's lineage link works, the fork stays private, and it never appears in the public gallery.

---

## Phase 5 — Merge Requests (Tasks 21–26)

This is the most involved part of the feature: a three-way diff and merge engine shared between the server (which enforces it) and, conceptually, the client (which renders it).

**Tasks 21–23 — The diff engine (`shared/diff.js`).** Built in three layers, each with its own dense test suite: `stableStringify`/`computeChangeSet` (what changed between two states, at the granularity of individual templates and variants, not raw text), `threeWayDiff` (comparing a fork's changes and the original's changes against their common ancestor to detect genuine conflicts — same template edited differently on both sides, a variant removed on one side but modified on the other, and so on), and `applyChangeSet` (actually applying a non-conflicting change set on top of the current upstream state, preserving whatever the upstream owner had changed independently).

**Tasks 24–25 — Merge request API.** Creating a merge request from a fork, listing incoming/outgoing requests, and a detail view whose diff is **recomputed live** every time it's viewed — never a stale snapshot from when the request was opened, so a merge request that becomes conflicted after the fact (because the upstream owner changed the same thing) is caught. The merge endpoint itself re-verifies there's no conflict immediately before writing, refuses to merge an already-merged or closed request, and runs the merged result back through the structural validator before committing it.

**Task 26 — Merge request UI.** A "Propose changes to upstream" flow, and a review page showing the structured change list, conflict warnings, and a rendered before/after preview of the affected page — verified end-to-end for both a clean merge (fork → edit → propose → owner reviews with preview → merge → change appears in the owner's own version history) and a genuine conflict (both sides edit the same template → merge correctly refused, both in the UI and directly against the server).

---

## The final whole-branch review — and a real vulnerability it caught

Every one of the 27 tasks above was reviewed on its own before being marked done. After all of them shipped, one more review looked at the entire branch as a single system — specifically hunting for problems that only exist when you look at the whole picture at once, which a review scoped to one task at a time structurally can't see.

It found one: **a pre-existing, unsanitized SVG rendering path became a stored, cross-user XSS vulnerability.** The editor has always rendered custom SVG artwork by inserting it straight into the page's HTML, with no sanitization — previously a self-inflicted-only risk, since you could only ever import SVG into your own local project. This feature set is exactly what changed that: publishing, then anonymously cloning or forking, are both new paths for *someone else's* project content to reach *your* browser. A malicious SVG element published to the gallery would have executed in the browser of anyone who opened or forked that project.

This was fixed immediately, with the same rigor as everything else: sanitizing with DOMPurify at the one place SVG content is ever rendered, verified first with a real exploit that was confirmed to actually fire an alert in a live browser against the old code, then confirmed blocked after the fix — while ordinary SVG artwork still renders correctly.

The same final pass also caught a completely unrelated, genuinely pre-existing production bug (present since before this feature started): the server's fallback route for serving the single-page app used a form of `res.sendFile()` that 404s on a direct or refreshed load of *any* page other than the home page — `/login`, `/app`, and now every new gallery/fork/merge-request URL too. Confirmed via the git history that the exact same code predated this whole plan, and fixed with the one-line, more-correct form of the same call.

## Two things intentionally left as open decisions

Not everything found during review was a bug to silently fix — two items are genuine design tradeoffs, documented in [`docs/8-cloud-and-gallery.md`](/docs/8-cloud-and-gallery.md#known-limitations--follow-ups) rather than resolved unilaterally:

- **Publishing can silently include fewer preview thumbnails than selected** if rendering partially fails for one of them — cosmetic only, no data or security impact.
- **The merge endpoint has no database transaction** around its check-then-write sequence, so two near-simultaneous merge attempts on the same request could, in principle, both succeed — the worst case being one extra, valid (not corrupted) commit, and only reachable by the project's own owner double-clicking their own merge button.

## Follow-up polish from first-use feedback

Trying the finished feature surfaced two small, real issues, fixed the same way as everything above — a short design write-up, a plan, then TDD:

1. **Sign-in always redirected to the admin analytics page**, regardless of where you started. Now it returns you to wherever you came from (the gallery, a specific project, wherever "Sign in" was clicked), defaulting sensibly to the editor instead of the analytics dashboard when there's nowhere to return to.
2. **The gallery had no way to get a project's PDFs without opening it in the editor.** Added a "Download all variants" button to every project's gallery page that generates a PDF for each of the project's variants and packages them into a single zip — specifically to avoid the multiple-download permission prompt that separate downloads would otherwise trigger in most browsers.

## Fixing a broken public identity system

First real use of the gallery surfaced three bugs, filed together: clicking "My profile" led to a "User not found" page, a published gallery card showed no author at all, and there was no way to use a pseudonym instead of your real name. All three traced back to one gap: an account can exist with `username = null` — guaranteed for anyone who signed in with Google (the OAuth path never collects a username) or any account older than the username plugin itself — and there was no way to ever set or change one after signup.

Worked through its own brainstorming/spec/plan cycle (`docs/superpowers/plans/2026-07-04-username-identity.md`), the fix broke into 9 tasks:

**Task 1 — `requireUsername` server middleware**, applied to exactly the five routes that create or attach new cloud/gallery content as the acting user (`POST /api/projects`, `.../commits`, `.../publish`, `.../fork`, `POST /api/merge-requests`) — deliberately *not* applied to routes that only reduce exposure or act on content the caller already owns (`unpublish`, `merge`, `close`, delete), since gating those could trap a legacy no-username account away from cleaning up its own data.

**Task 2 — `ApiError` gains a `code` field**, so the client can branch on `USERNAME_REQUIRED` reliably instead of string-matching a message.

**Tasks 3–5 — `UsernameForm`, `/welcome`, `/account`.** A shared form component (format validation, debounced availability check, graceful fallback on a failed submit) used by a blocking onboarding page (`/welcome`, reusing the existing `from`-redirect pattern) and a settings page for changing your username any time afterward. Uncovered a real upstream quirk here: better-auth's own `/update-user` doesn't return its clean "already taken" error the way `/sign-up/email` does — it throws an unhandled database constraint violation instead — worked around by having the UI always pre-check availability rather than trusting a clean error after the fact.

**Tasks 6–8 — Gating the UI.** `AccountMenu` drops its buggy `session.user.name` fallback entirely; `CloudMenu` and the gallery's Fork button both become a 3-way branch (signed out / signed in without a username / signed in with one) instead of a 2-way one.

**Task 9 — End-to-end coverage**, including a real sign-up → publish → change-username → confirm-the-old-profile-link-404s-and-the-new-one-works flow, run against a real server.

Two more fixes came out of wrapping this round up, same rigor as the original feature's own final review:

- **The account's real name field was leaking over the API** (`GET /api/me`, `GET /api/users/:username`) — pre-existing code, untouched by any of the 9 tasks above, flagged by this round's own final whole-branch review. No client code ever read it; removed from both response bodies and the underlying SQL query.
- **Forking your own public project and opening a merge request against it hid the Merge button entirely.** `MergeRequestPage` guessed ownership as "whoever isn't the author must be the owner" — true only when the author and owner are different people, which breaks for exactly this legitimate self-fork case. Fixed by having the server send its own already-correct `isTargetOwner` (the same check the merge endpoint itself enforces) instead of the client re-deriving it. Found via live manual testing against a real self-forked project.

## Gallery version history

The editor already had full commit history for a project's own owner — a list of commits with **Restore**, in the Cloud menu. There was no way to see a *public* project's history from the gallery itself, and the server turned out to already allow it: `GET /api/projects/:id/commits` and its single-commit counterpart already permitted anyone to read a public project's full history, not just its owner. The gap was purely front-end.

Two tasks: generalize the existing `HistoryModal` with a `mode` prop (`'restore'`, the untouched default the editor's Cloud menu already uses; `'clone'`, new — no confirm dialog, clones a past commit into a fresh local project instead of overwriting the one you have open, and deliberately skips the migration step the editor's own import-consuming code already runs once, rather than running it twice), then add a "Version history" button to the gallery detail page using it. Landed with zero server changes and zero regressions to the existing gallery-detail-page test suite — both tasks and the final whole-branch review came back clean, no Critical or Important findings.

## Gallery projects open as an overlay modal

Feedback: clicking a project anywhere in the app felt like more page than the content needed. The fix uses React Router's "background location" pattern — the URL still changes to `/gallery/:id` and stays fully shareable/bookmarkable, but if the navigation came from inside the app (a click), the page you clicked from keeps rendering underneath and the project opens as a modal over it. A direct hit — a typed URL, a refresh, a shared link, or any of the existing Playwright specs' `page.goto('/gallery/:id')` calls — still renders the exact same standalone page as before, completely unchanged.

Four tasks: `GalleryLink`, a `<Link>` wrapper that inherits an already-open modal's background instead of nesting a second one behind it (so "forked from," clicked from inside a modal, doesn't produce a modal-behind-a-modal); a pure extraction of the gallery detail page's data-fetching and rendering into a shared hook and presentational component, so the page and the new modal have exactly one implementation to keep in sync instead of two; the modal itself plus the routing split in `App.tsx`; and finally wiring all four real in-app links (the gallery grid, the profile grid, the "forked from" link, and the merge-request page's project link) to the new component — proven end-to-end with a real two-user fork chain and a real merge-request flow in an actual browser.

The trickiest part — the background-location routing itself — was spiked and verified working in this exact toolchain *before* being written into the implementation plan, rather than trusting the pattern's reputation. The final whole-branch review caught one thing no single task's review could have: a fifth in-app link to a gallery project (the editor's own "forked from upstream" indicator, in the Cloud menu) had been missed when the work was originally scoped. Left as a full-page link rather than a modal — popping a modal over the editor's working canvas would be a worse fit than it is on the simpler list/detail pages it appears on elsewhere — and documented as a deliberate exclusion rather than an oversight.

## Ratings, reviews, and a browsable gallery

The gallery shipped functional but bare: a search box, a newest/popular sort, and a flat grid of cards. This round — its own brainstorm, spec, and plan, executed as eleven tasks with a fresh implementer and an independent reviewer per task (`docs/superpowers/plans/2026-07-06-gallery-v2-ratings-reviews-filters.md`) — turned it into something you can actually browse and trust, without adding a single new server route file.

**Ratings and reviews.** A new `reviews` table (migration `008_reviews`) backs 1–5 star ratings with an optional written review, one per user per project, editable and deletable by its author. Averages are computed at read time with SQL aggregates rather than denormalized onto the projects row — a rating changes on every edit and delete, and a live `AVG()` can't drift out of sync the way a hand-maintained counter can. Writes reuse the exact `requireUsername` gate the identity round established (every review carries a public handle; owners can't review their own project), while *deleting* your own review deliberately isn't gated — the same principle that kept legacy no-username accounts able to clean up their own content. Reporting and admin removal flow through the existing reports pipeline, extended with a nullable `review_id`, so unpublishing a project hides its reviews for free (every review read and write is already scoped through the same public-project check).

**Filtering and discovery.** Tags were collected at publish time but never used for anything; now the gallery filters by exact tag (`GET /api/gallery?tag=`), search matches tag text as well as name and description, and a new `GET /api/gallery/tags` endpoint drives a tag-chip row. The default gallery view became a hero band over three curated rows — top rated, popular, recently updated — that collapse into a single, URL-param-driven filtered grid the moment you search, pick a tag, or hit "see all," so every filtered view stays shareable and bookmarkable. A shared `ProjectCard`, a keyboard-accessible `StarRating` (roving-tabindex arrow-key input, not just a row of buttons), and a `ReviewsSection` are the new reusable pieces; the profile page dropped its duplicate card markup and adopted the same component.

**What the final whole-branch review caught.** Two things a per-task review structurally couldn't. First, a work-around added mid-round to disable better-auth's built-in three-sign-ups-per-ten-seconds limit under test used `enabled: !process.env.DISABLE_AUTH_RATE_LIMIT` — which treats *any* value, including the `=false` someone writes to mean "don't disable this," as "disable," quietly turning off brute-force protection on a misconfigured deploy. Second, the exact-tag filter built its SQL `LIKE` pattern from the raw tag, so a tag containing `%` or `_` would match unrelated projects across JSON element boundaries — the documented "exact match" guarantee leaking. Both were one-file fixes (a strict `!== 'true'` check; escaping the wildcards with an `ESCAPE` clause that behaves identically on Postgres and SQLite), each landed with its own regression test, and the round finished 245 unit tests green.

Testing the round surfaced one more issue, unrelated to the feature itself: the gallery page — and, it turned out, every other `min-h-screen` page — couldn't scroll once its content grew past the viewport, because `index.html` disables body scrolling globally and each page is meant to own its own scroll container. The new sections layout was simply the first gallery view tall enough to expose the gap. Fixed by giving each page an `h-screen overflow-y-auto` wrapper, verified by actually scrolling the running app.

## By the numbers

- 27 planned tasks across 6 phases, plus 1 post-review security fix, 2 follow-up fixes (sign-in redirect + gallery zip download), a 9-task round fixing public username identity (plus 2 more fixes from wrapping that round up), a 2-task round adding gallery version history, a 4-task round making gallery projects open as a modal, and an 11-task round adding ratings, reviews, and tag filtering (plus a final-review pass that fixed a fail-open rate-limit toggle and a tag-search wildcard leak) — 61 pieces of work in total, every one test-driven and independently reviewed.
- 245 unit tests as of the ratings/reviews round. Several committed end-to-end Playwright specs cover the full publish → gallery → fork → merge-request loop (both the clean-merge and conflicted paths) plus the username onboarding/change flow; the gallery version-history, overlay-modal, and ratings/reviews rounds were each verified with a real, throwaway (not committed) browser script instead, per their own plans.
- New server surface from the original feature: 6 database migrations and 5 route files (`projects`, `gallery`, `mergeRequests`, `me`, plus the existing auth), all additive — nothing destructive to existing data. Follow-up rounds stayed additive too: the ratings/reviews round added one migration (`008_reviews` — a `reviews` table plus a nullable `reports.review_id` column) but, like every round before it, no new route file — the review, tag, and reporting endpoints all live in the existing `gallery` route.
- New client surface: a public gallery, author profiles, a cloud menu, version history (in the editor, and later from the gallery itself), a publish wizard, a full merge-request review UI, username onboarding/settings pages, every gallery project link opening as an overlay modal instead of a full page, and — most recently — star ratings, written reviews, and tag-based filtering across a curated sections-and-search gallery layout.
