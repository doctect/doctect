# Building the Gallery, Fork & Merge Request System

**Issue:** [doctect/doctect#9](https://github.com/doctect/doctect/issues/9)
**Branch:** `feature/gallery-fork-merge-requests` (merged to `main`)

This is a detailed walkthrough of how PDF Architect went from a purely local-first, single-user editor to a full public gallery with GitHub-style forking, version history, and merge requests — gated behind an expanded authentication system. It covers all 27 planned tasks, the critical finding from the final review, and the follow-up polish that came out of first-use feedback.

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

## By the numbers

- 27 planned tasks across 6 phases, plus 1 post-review security fix and 2 follow-up fixes — 30 pieces of work in total, every one test-driven and independently reviewed.
- 82 unit tests, several committed end-to-end Playwright specs covering the full publish → gallery → fork → merge-request loop (both the clean-merge and conflicted paths).
- New server surface: 6 database migrations, 5 route files (`projects`, `gallery`, `mergeRequests`, `me`, plus the existing auth), all additive — nothing destructive to existing data.
- New client surface: a public gallery, author profiles, a cloud menu, version history, a publish wizard, and a full merge-request review UI.
