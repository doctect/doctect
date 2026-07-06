# 8. Cloud, Gallery & Merge Requests

PDF Architect is, and remains, a client-side-first application (see [High-Level Architecture](1-high-level-architecture.md)) — every project still lives in `localStorage` and works fully offline with no account. This layer is an **additive, opt-in backend** (`server/`, an Express + better-auth + Postgres/SQLite service) that lets a signed-in user optionally back a project with cloud-saved history, publish it to a public gallery, let others fork it, and propose changes back upstream via merge requests.

## Local-First + Explicit Sync Model

Nothing syncs automatically. A project only gains a cloud identity when the user explicitly clicks **Save to cloud (new)** in the editor's Cloud menu (`components/cloud/CloudMenu.tsx`), which `POST`s the current `AppState` to `/api/projects` and stores the returned `{ projectId, lastSyncedCommitId }` back onto the local project as `project.cloud`. From then on the button reads **Save to cloud** and each click is a distinct, user-initiated save — never a background timer, and never a silent overwrite of a previous save. Auto-sync was considered and explicitly rejected: local-first with explicit saves is the intended design, not a stopgap.

A project with no `project.cloud` field behaves exactly as it always has — pure `localStorage`, no network calls. Cloning a public gallery project into your editor via **Open in editor** (see below) also produces a plain local, non-cloud-linked project unless you separately sign in and fork it.

## Commits, History & Restore

Every cloud save inserts an immutable row into `commits`: a full JSON snapshot of the project's `AppState` (`state_json`), a commit message, and a `parent_commit_id` pointing at the previous head — a simple linear chain, not a DAG. The project row's `head_commit_id` always points at the latest commit.

- **Version history** (`components/cloud/HistoryModal.tsx`) lists up to the last 200 commits (`GET /api/projects/:id/commits`) and lets you restore any of them. Restoring fetches that commit's full state (`GET /api/projects/:id/commits/:commitId`) and hands it back to the editor, which remounts the active tab via a `revision` key bump so the canvas visibly reverts (the same mechanism described in [State Management](3-state-management.md)).
- **Validation on every write**: `POST /api/projects` and `POST /api/projects/:id/commits` both run the submitted state through `validateAppState` before writing anything. It rejects anything over 5MB serialized, more than 20,000 nodes, more than 50 variants, or more than 50,000 total template elements across all variants — a defense against both malformed clients and pathological documents, not a normal-use ceiling.
- Deleting a project (`DELETE /api/projects/:id`) cascades to its commits.

## Publishing to the Gallery

Publishing (`components/cloud/PublishModal.tsx`, `POST /api/projects/:id/publish`) requires: you own the project, and it's already cloud-linked (you can't publish a project that's never been saved to the cloud). The wizard walks through:

1. **Page selection** — pick 1–4 pages to serve as gallery preview images (checkbox picker over `computePageOrder`, capped client-side at 4).
2. **Client-side rendering** — the selected pages are rendered to WebP thumbnails in the browser via `generateThumbnails` (the same PDF/canvas rendering pipeline used for export — see [PDF Generation](5-pdf-generation.md)), so the server never needs its own rendering stack.
3. **Metadata** — a description (≤2000 chars) and up to 10 tags (≤30 chars each).
4. **Upload** — the rendered thumbnails and metadata are sent together; the server re-validates every image (size + magic bytes, see [Security Model](#security-model)) before storing them and flips `visibility` to `'public'`.

Publishing is reversible: `POST /api/projects/:id/unpublish` flips a project back to `'private'` — it stays in your account with full history intact, it just drops out of the public gallery and returns a 404 on direct gallery-detail lookups. An admin can also force-unpublish a reported project (`POST /api/admin/projects/:id/unpublish`).

## Browsing the Gallery Without Login

The gallery is designed to be useful to anonymous visitors:

- **`/gallery`** (`GalleryPage.tsx`) — paginated (24 per page), free-text search over name/description, and a **Recent** / **Popular** (`fork_count + download_count`) sort — all served by `GET /api/gallery`, which requires no authentication.
- **`/gallery/:id`** (`GalleryDetailPage.tsx`) — full public detail: thumbnails, description, tags, author, fork lineage, fork/download counts. **Open in editor** clones the project's current head state into a fresh *local, non-cloud* project (`GET /api/gallery/:id/state`, which also increments the source's `download_count`) — no account needed.
- **`/u/:username`** (`ProfilePage.tsx`) — a public profile listing a user's published projects (`GET /api/users/:username`).

Only two actions on these pages actually require signing in: **Fork this project** (shown as "Sign in to fork" otherwise) and reporting/proposing/merging. Browsing, searching, previewing, and cloning are all anonymous.

## Fork Lineage

Forking (`POST /api/projects/:id/fork`) creates a brand-new project, owned by the forker, seeded from the upstream project's *current head commit* as its own first commit. The fork records `forked_from_project_id` and `forked_from_commit_id`, and the upstream's `fork_count` increments. Two things are easy to get wrong intuitively and worth stating precisely:

- **Forks are private by default.** A fork does not inherit or default to `'public'` visibility — it starts exactly like any other freshly-created project (`visibility = 'private'`), absent from `/api/gallery` and 404ing on `/api/gallery/:id` until/unless the forker separately publishes it themselves.
- **Lineage is one link, shown both ways.** The forker's editor (`CloudMenu`) shows a "↳ forked from upstream — view source" link back to the original; the original's gallery detail page shows "forked from `author/name`" for any (public) project that was forked from it.

## Merge Requests

A merge request (MR) proposes the fork's changes back onto the upstream project it was forked from — the *only* path from a fork back to its upstream today (there is no direct-push or shared-ownership model).

### Lifecycle: open → merged / closed / conflicted

Opening an MR (`POST /api/merge-requests`) requires the source project to be your own and to actually be a fork of a still-public target. The server computes a three-way diff — `base` (the commit the fork branched from), `source` (the fork's current head), `target` (**the upstream's current head right now**, not its state at fork time) — and rejects the request outright (400) if there's nothing to propose. If that diff *already* contains conflicts (the upstream moved before the MR was even opened), the MR is created directly in `conflicted` status rather than `open`.

The live-recompute is not a one-time check: `GET /api/merge-requests/:id` recomputes the diff against the target's current head on every fetch (for any non-terminal MR) and updates the stored `status` column to match. This means an MR can flip from `open` to `conflicted` between two page loads with nobody having touched the MR itself — because the *target* changed underneath it.

| Transition | Trigger | Notes |
|---|---|---|
| → `open` | MR created, no conflicts against target's current head | |
| → `conflicted` | MR created *or* re-fetched while conflicting with target's current head | Merge is refused (409) and the button isn't even rendered client-side |
| → `merged` | Target owner clicks Merge, diff is (re-)verified conflict-free | Creates a new commit on the **target** |
| → `closed` | Author or target owner closes without merging | Blocked only if already `merged` |

Merging itself (`POST /api/merge-requests/:id/merge`, target owner only — 403 otherwise) re-verifies the diff one last time, refuses with 409 if conflicts are found or the MR is already `merged`/`closed`, then runs `applyChangeSet(base, source, target)` and `validateAppState` on the result before committing. A successful merge inserts one new commit on the **target** project (parent = target's current head, message `Merge: <title> (from @<author>)`) and marks the MR `merged`. Nothing is written to the fork.

### Conflict rules

Conflicts are computed structurally (`shared/diff.js`, `threeWayDiff`), never as a text/line diff — it compares the same three logical layers [Core Data Models](2-core-data-models.md) already documents (page hierarchy, variants, per-variant templates):

| Kind | Flagged when |
|---|---|
| **Nodes (hierarchy)** | Both source and target changed the page tree relative to base, *and* their results actually differ from each other |
| **Variant** | A variant was added on both sides with different content; renamed differently on both sides; or removed on one side while modified on the other |
| **Template** | The same template, in the same variant, was added/modified/removed on **both** sides with different resulting content |

Two independent edits that happen to produce byte-identical results are *not* flagged as conflicting — only genuinely divergent changes are.

### The review UI

`/mr/:id` (`MergeRequestPage.tsx`) shows a structured, human-readable change list (e.g. `~ Template modified: default/a4_blank`) rather than raw JSON, a conflict box when applicable, and an on-demand **before/after preview** — rendered entirely client-side (via the same `generateThumbnails` pipeline used for publishing) from the raw source/target state the API returns, so no extra thumbnail storage is needed just to review a proposal. The target project's owner also sees a "Merge requests" list on their own `/gallery/:id` page.

## API Surface

| Method & Path | Auth | Purpose |
|---|---|---|
| `GET /api/me` | optional | Current session user, or `null` |
| `GET /api/users/:username` | none | Public profile + their published projects |
| `POST /api/projects` | required | Create a project + initial commit |
| `GET /api/projects` | required | List your own projects |
| `GET /api/projects/:id` | optional | Get a project (owner, or public) |
| `PATCH /api/projects/:id` | owner | Update name/description/tags |
| `DELETE /api/projects/:id` | owner | Delete a project and its commits |
| `POST /api/projects/:id/commits` | owner | Save a new commit |
| `GET /api/projects/:id/commits` | owner or public | List commit history (latest 200) |
| `GET /api/projects/:id/commits/:commitId` | owner or public | Full state of one commit (restore) |
| `POST /api/projects/:id/publish` | owner | Publish with thumbnails + description + tags |
| `POST /api/projects/:id/unpublish` | owner | Make private again |
| `POST /api/projects/:id/fork` | required | Fork a public project into a new private one |
| `GET /api/thumbnails/:thumbId` | none | Serve a stored thumbnail image |
| `GET /api/gallery` | none | Paginated/searchable/sortable public listing |
| `GET /api/gallery/:id` | none | Public project detail + lineage |
| `GET /api/gallery/:id/state` | none | Full head state for cloning (increments downloads) |
| `POST /api/gallery/:id/report` | optional | Report a project |
| `POST /api/merge-requests` | required | Open an MR from one of your forks |
| `GET /api/projects/:id/merge-requests` | owner | Incoming MRs targeting your project |
| `GET /api/merge-requests/mine` | required | MRs you've authored |
| `GET /api/merge-requests/:id` | author or target owner | Detail + live-recomputed diff |
| `POST /api/merge-requests/:id/merge` | target owner | Merge (re-verifies conflict-free) |
| `POST /api/merge-requests/:id/close` | author or target owner | Close without merging |
| `GET /api/admin/reports` | admin | List reported projects |
| `POST /api/admin/projects/:id/unpublish` | admin | Force-unpublish a project |

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Required in production (Cloud Run's filesystem is ephemeral); unset in local dev falls back to `server/analytics.db` (SQLite). |
| `TRUSTED_ORIGINS` | Comma-separated origins allowed to call the API with credentials — feeds both better-auth's `trustedOrigins` and the `checkOrigin` CSRF guard. |
| `ALLOWED_HOSTS` | Comma-separated `Host` header values the server will serve auth for. Unset means "allow all," which is fine in dev but should be set explicitly in production. |
| `VITE_API_BASE` | API origin (no path suffix) used by `services/cloudApi.ts` for every gallery/cloud-project/fork/merge-request call. Leave empty in production (same origin as the client). |
| `VITE_API_URL` | **Pre-existing quirk, unrelated to this feature set**: a *different*, older client-side variable used as-is (not origin-only) by `lib/auth-client.ts` and `services/analytics.ts`, each expecting its own path suffix already baked in. It is not interchangeable with `VITE_API_BASE`. See `.env.example` for the exact expected values of each. |

(`BETTER_AUTH_URL`, `CLIENT_URL`, `ADMIN_EMAILS`, and the Google OAuth/GitHub token variables predate this feature set and are unchanged; see `.env.example` for the full list.)

## Storage limits and cost control

Cloud storage is real, billed infrastructure, so this layer adds a set of guardrails around it — all tunable via environment variables, all read live at call time (nothing is cached at process start), so they can be adjusted per deploy or overridden cheaply in tests.

| Limit | Env var | Default | On exceeding |
|---|---|---|---|
| Per-user storage quota | `USER_STORAGE_QUOTA_MB` | 50 (MB) | `413` `STORAGE_QUOTA_EXCEEDED` |
| Global storage ceiling | `MAX_TOTAL_STORAGE_MB` | 20480 (20GB) | `507` `SERVICE_STORAGE_FULL` |
| Commits kept per project | `COMMIT_RETENTION_PER_PROJECT` | 50 | — older commits are silently pruned, not rejected |
| Projects per user | `MAX_PROJECTS_PER_USER` | 25 | `403` `PROJECT_LIMIT_REACHED` |
| Published projects per user | `MAX_PUBLIC_PROJECTS_PER_USER` | 20 | `403` `PUBLIC_LIMIT_REACHED` |
| Writes per user per hour | `USER_COMMITS_PER_HOUR` | 60 | `429` `RATE_LIMITED` |

- The **storage quota and global ceiling** are both checked before `POST /api/projects`, `POST /api/projects/:id/commits`, and `POST /api/projects/:id/fork` write anything — the ceiling is checked first, as a hard, service-wide kill-switch that holds independently of (and even if) per-user accounting were ever wrong.
- The **project cap** is checked on project creation and forking (a fork is its own new project row, so it counts against the cap). The **publish cap** is checked only when a project isn't already public — re-publishing or editing an already-public project doesn't re-check it.
- The **write rate limit** is one shared per-user hourly budget across project create, commit save, and fork — not a separate budget per route.

**Storage mechanics.** Commit state is stored gzip-compressed (`commits.state_gzip`), and it's this compressed byte count — not the original JSON size — that both the quota and the ceiling measure. Rows written before compression was introduced only have the legacy `commits.state_json` column populated; the read path checks `state_gzip` first and falls back to `state_json`, so old rows keep working indefinitely with no backfill migration required. Saves are also deduplicated against the current head: a new commit whose content hash (`state_hash`, computed in a key-order-insensitive way so re-serialization by a different client doesn't defeat it) matches the head commit's hash is treated as a no-op — the API returns the existing head commit (`deduped: true`) instead of writing a new row or counting against quota or retention. The write rate limit is the exception: `userWriteLimiter` runs before the route handler's dedupe check in the middleware chain, so a deduped save still consumes one hit of the hourly per-user write budget.

**Retention pruning** runs on every commit insert — project creation, commit save, fork-seeding, and merging all funnel through the same internal `insertCommit` path — keeping only the newest `COMMIT_RETENTION_PER_PROJECT` commits per project. Commits still referenced by an **open** merge request (as either its source head or its three-way-diff base) are always exempt, since the MR detail page recomputes that diff live on every fetch. One deliberate consequence: a fork's `forkedFromCommitId` pointer is *not itself* protected from pruning, so once the referenced upstream commit ages out of retention (and isn't separately held open by an MR), that pointer resolves to nothing and the fork's lineage degrades from commit-level to project-level (`forkedFromProjectId` still holds).

**Deliberate exclusions:**
- Merging (`POST /api/merge-requests/:id/merge`) performs **no per-user quota check** — the same reasoning as its pre-existing exemption from `requireUsername`: a project owner accepting a proposed change into content they already own shouldn't be blocked by a limit meant to slow *new* low-trust growth. The **global ceiling does still apply**, though: it's a shared-cost kill-switch where whose fault the growth is doesn't matter, so `assertGlobalCeiling` is checked on merge too, right before the resulting commit is written (`507` `SERVICE_STORAGE_FULL` if it would tip the service over the ceiling). The resulting commit still goes through the same `insertCommit` path as everything else, so it's still subject to retention pruning — merging just skips the *per-user quota* check that create, save, and fork perform.
- **Thumbnails** are bounded by the publish cap, not the byte quota — publishing is limited by how many projects a user can have public at once, not by thumbnail storage size.

**Ops note (Neon/Postgres in production).** Keep the database branch's history retention / point-in-time-recovery window short — one day or less — in the Neon console. That history window is itself billed storage, and this workload is insert-heavy (every save is a new immutable commit row, on top of the retention pruning above), so a long PITR window can end up billing for substantially more historical data than the live tables ever hold. It's also worth remembering operationally that deleting rows — via retention pruning, project deletion, or unpublishing — does not shrink billed storage by itself; that space is only reclaimed once the configured history window ages past the deletion.

## Security Model

- **Session cookies**, not bearer tokens — better-auth issues an httpOnly session cookie on sign-in; every `requireAuth`/`optionalAuth` check resolves the caller from that cookie via `auth.api.getSession`.
- **Origin checks on writes**: `checkOrigin` (defense-in-depth alongside `sameSite` cookies) rejects any non-`GET`/`HEAD`/`OPTIONS` request whose `Origin` header isn't in `TRUSTED_ORIGINS` (or the request's own host) with a 403 — a CSRF mitigation independent of the cookie policy itself.
- **Host allow-list**: `isHostAllowed`/`ALLOWED_HOSTS` rejects requests for `Host` headers the server doesn't recognize before auth is even constructed for that request.
- **Rate limits**: a global `writeLimiter` caps non-`GET` `/api/*` requests to 200 per 15 minutes per client; better-auth additionally rate-limits its own endpoints (20 requests/60s).
- **Validation caps**: every commit (create, save, or merge) is run through `validateAppState` — 5MB max serialized size, 20,000 nodes, 50 variants, 50,000 elements total. A merge that would exceed any of these is rejected (409) with nothing written, even if the merge itself is otherwise conflict-free.
- **Thumbnail magic-byte checks**: `parseThumbnail` doesn't trust the claimed `data:image/webp;base64,...` / `data:image/png;base64,...` prefix — it decodes the base64 payload, enforces a 300KB ceiling, and verifies the actual bytes (PNG signature, or `RIFF....WEBP`) match the claimed type before ever writing to the `thumbnails` table.
- **CORP for public thumbnails**: `/api/thumbnails/:thumbId` explicitly sets `Cross-Origin-Resource-Policy: cross-origin` (overriding helmet's app-wide same-origin default) plus `X-Content-Type-Options: nosniff`, since these are unauthenticated, intentionally-public images that need to load as `<img>` tags across the client/API origin split (or a future CDN). This route reads no session/auth state, so relaxing CORP here crosses no privacy boundary.
- **Content-Security-Policy** is disabled app-wide in helmet's config today (the SPA depends on Google Fonts and inline styles) — see [Known limitations](#known-limitations--follow-ups).

## Known Limitations / Follow-ups

- **Email verification** is not wired up — it needs an actual email provider chosen and configured first; better-auth supports `emailVerification` natively once one exists.
- **Thumbnails are stored as database blobs** (Postgres `bytea` / SQLite `BLOB`), not object storage. Fine at launch scale; the `/api/thumbnails/:id` indirection means moving to something like GCS later requires no client-side changes.
- **No per-change cherry-pick merging.** A conflicted MR can't selectively take some of the fork's changes — the accepted v1 semantics are that the fork author re-forks the latest upstream and reapplies their edit there.
- **No "update fork from upstream."** There's no button to pull/rebase new upstream changes into an existing fork; re-forking is the only path today.
- **Auto-sync is intentionally absent** — this is a deliberate design decision (see [above](#local-first--explicit-sync-model)), not a missing feature.
- **CSP tuning is deferred** (see [Security Model](#security-model)) — a tuned Content-Security-Policy is a follow-up hardening task, not done here.
- **Five disclosed, unresolved findings surfaced during this feature's implementation and final verification**, none treated as blocking (all are narrow/edge-case or pre-existing, not confirmed to have ever affected a real user):
  - **`PublishModal`'s render/upload error handling** (flagged during the publish-wizard work): the render and upload steps share a single `catch` block, so a failure only surfaces as "which phase failed" indirectly (whether preview thumbnails are already showing). More significantly, thumbnail rendering (`generateThumbnails`) only throws on a *fully empty* result — a partial render (fewer images produced than pages selected, e.g. from a transient canvas-context allocation failure) would publish successfully with fewer thumbnails than the user chose, with no warning surfaced. This requires either a render-time failure or a state race to trigger and has not been reproduced in practice, but the gap is real as specified.
  - **No transaction or optimistic lock around the merge endpoint's check-then-write sequence** (flagged during the merge-endpoint work): `POST /api/merge-requests/:id/merge` checks status, recomputes the diff, applies the changeset, validates, inserts a commit, and updates status as separate steps with no surrounding transaction. Two near-simultaneous merge attempts on the same MR (a double-click, or two open tabs) could both pass the "not already merged" check before either write lands. The worst case is one extra, valid-but-orphaned merge commit on the target — not data corruption, not data loss, and not a double-applied changeset (`applyChangeSet` always starts fresh from the target's current state, and each attempt independently passes `validateAppState`). Only the target project's own owner can trigger this (a self-inflicted race, not a cross-user attack surface). A minimal fix, if pursued later: make the final status `UPDATE` conditional (`WHERE status NOT IN ('merged','closed')`) and check the affected-row count, 409-ing if it's zero.
  - **No transaction or optimistic lock around the storage-limit checks in `server/middleware/limits.js`** (flagged during the storage-limits feature's final whole-branch review): `assertGlobalCeiling`, `assertStorageAllowance`'s per-user branch, `assertProjectAllowance`, and `assertPublishAllowance` each read a `SUM`/`COUNT`, compare it to a threshold, and return — the actual insert happens as a separate, later statement, with nothing holding a lock in between. Several concurrent requests from the same user (parallel tabs, or a client issuing overlapping requests) could all read the same pre-insert total, all pass the check, and all insert — jointly exceeding a cap that any one of them, checked alone, would have correctly blocked. The blast radius is bounded on every axis that matters: each individual commit is still capped at 5 MB by `validateAppState` regardless of this race, and the per-user `userWriteLimiter` caps the number of requests in the exposure window to `USER_COMMITS_PER_HOUR` (default 60) — so the worst case for the storage quota specifically is on the order of 60 × 5 MB in a single hour before the next request's check would see the (by-then-updated) total and correctly reject, and the limit self-resets every hour regardless. This is the same class of finding as the merge-endpoint race just above, and is left unresolved for the same reason: the fix requires transactional locking (`SELECT ... FOR UPDATE` or equivalent), and this codebase's `query()` abstraction (`server/db.js`) has no transaction support at all today across its Postgres/SQLite backends — adding it is a foundational change larger than either feature that has surfaced this need. A minimal mitigation, if pursued later: a maintained running-total column (updated atomically alongside insert/prune/delete) rather than a live `SUM` would close most of the window without requiring full transactions.
  - **The per-user write rate limiter's counter store is in-process memory, not shared** (flagged during the same review): `server/middleware/limits.js`'s `userWriteLimiter` uses `express-rate-limit`'s default in-memory store. This is fine for the byte-quota/cost-control goal this whole feature exists for — that accounting is entirely DB-backed via `SUM(state_bytes)`, correct regardless of how many server instances are running — but the separate per-user abuse-defense goal this specific limiter exists for ("IP limits die behind NAT/shared networks; a per-user limiter doesn't") only holds running a single server instance. If this app is ever deployed horizontally scaled behind a load balancer, each instance enforces its own independent `USER_COMMITS_PER_HOUR` budget, effectively multiplying the real limit by the instance count. A fix, if pursued: point `userWriteLimiter` at a shared store (e.g. a Postgres-backed counter table) instead of the default in-memory one.
  - ~~Direct/hard navigation to any non-root client route 404s when served from the production build~~ — **found and fixed** during this doc's own production build+boot verification (not a gallery-specific issue, and not a regression from this feature set — see history below). `server/app.js`'s SPA catch-all was calling `res.sendFile(path.join(distPath, 'index.html'))` with no `root` option; under the currently-installed Express 5 / `send` package combination, that specific call form 404s even though the file exists. Confirmed pre-existing and unrelated to this plan — the identical `res.sendFile` call already existed, byte-for-byte, in `server/index.js` before this feature set's first commit — and unrelated to `npm run dev` (Vite's dev server has its own correct SPA fallback), which is why no earlier verification in this plan caught it until a real production boot was exercised. **Fix applied**: `res.sendFile('index.html', { root: distPath })` (a relative filename plus explicit `root`, which is also Express's own recommended `sendFile` pattern). Verified after the fix: `curl` against a real production boot returns `200` with the real SPA shell for `/gallery`, `/gallery/:id`, `/login`, `/mr/:id`, `/u/:username`, and `/`, and the full unit suite (75/75) plus `tsc --noEmit` remained clean.
