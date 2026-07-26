# 8. Cloud, Gallery & Merge Requests

PDF Architect is, and remains, a client-side-first application (see [High-Level Architecture](1-high-level-architecture.md)) — every project still lives in `localStorage` and works fully offline with no account. This layer is an **additive, opt-in backend** (`server/`, an Express + better-auth + Postgres/SQLite service) that lets a signed-in user optionally back a project with cloud-saved history, publish it to a public gallery, let others fork it, and propose changes back upstream via merge requests.

## Local-First + Explicit Sync Model

Nothing syncs automatically. A project only gains a cloud identity when the user explicitly clicks **Save to cloud (new)** in the editor's Cloud menu (`components/cloud/CloudMenu.tsx`), which `POST`s the current `AppState` to `/api/projects` and stores the returned `{ projectId, lastSyncedCommitId }` back onto the local project as `project.cloud`. From then on the button reads **Save to cloud** and each click is a distinct, user-initiated save — never a background timer, and never a silent overwrite of a previous save. Auto-sync was considered and explicitly rejected: local-first with explicit saves is the intended design, not a stopgap.

A linked save sends `If-Match: "<lastSyncedCommitId>"`. The server locks the project, verifies that expected parent, inserts the commit, advances the head with compare-and-swap, prunes, and commits as one transaction. A stale tab receives `409 PROJECT_HEAD_CHANGED`; CloudMenu preserves local edits and offers an explicit **Reload cloud version** action rather than overwriting them automatically.

A project with no `project.cloud` field behaves exactly as it always has — pure `localStorage`, no network calls. Cloning a public gallery project into your editor via **Open in editor** (see below) also produces a plain local, non-cloud-linked project unless you separately sign in and fork it.

## Commits, History & Restore

Every cloud save inserts an immutable row into `commits`: a full JSON snapshot of the project's `AppState` (`state_json`), a commit message, and a `parent_commit_id` pointing at the previous head — a simple linear chain, not a DAG. The project row's `head_commit_id` always points at the latest private/owner head. `published_commit_id` is separate and changes only through explicit publication.

- **Version history** (`components/cloud/HistoryModal.tsx`) lists up to the last 200 commits (`GET /api/projects/:id/commits`) and lets owners restore any of them. Non-owners see only commits recorded by an explicit publish; private intermediate commits and parent identifiers are not exposed.
- **Validation on every write**: `POST /api/projects` and `POST /api/projects/:id/commits` both run the submitted state through `validateAppState` before writing anything. It rejects anything over 5MB serialized, more than 20,000 nodes, more than 50 variants, or more than 50,000 total template elements across all variants — a defense against both malformed clients and pathological documents, not a normal-use ceiling.
- Deleting a project (`DELETE /api/projects/:id`) closes active merge requests and explicitly removes reports, publication records, thumbnail blobs, reviews, and commits before removing the project. All cleanup shares one transaction, including on SQLite where foreign-key cascades may be disabled.

## Publishing to the Gallery

Publishing (`components/cloud/PublishModal.tsx`, `POST /api/projects/:id/publish`) requires: you own the project, and it's already cloud-linked (you can't publish a project that's never been saved to the cloud). The wizard walks through:

1. **Page selection** — pick 1–6 pages to serve as gallery preview images (`PreviewPagePicker` over `computePageOrder`, capped client-side at `MAX_PREVIEWS`). That constant lives in `constants/previews.ts`, deliberately apart from `services/thumbnailService` (which re-exports it): the service assigns pdf.js's worker URL at module scope, so importing the cap from there drags a side-effecting module into anything that only wanted a number. `server/routes/projects.js` keeps its own copy, since it cannot trust the client's. Each rendered preview records the page that produced it in `thumbnails.node_id` (migration `016_thumbnail_node_id`), so the listing editor can reopen the picker pre-ticked.
2. **Client-side rendering** — the selected pages are rendered to WebP thumbnails in the browser via `generateThumbnails` (the same PDF/canvas rendering pipeline used for export — see [PDF Generation](5-pdf-generation.md)), so the server never needs its own rendering stack. The renderer returns page/image *pairs* and skips any page it cannot rasterize, so it can hand back fewer images than were picked; both this wizard and the listing editor compare `rendered.length` against the selection and throw before anything is sent rather than shipping a short set (see [Known Limitations](#known-limitations--follow-ups)). Each image is always uploaded with the `nodeId` from its own pair — never zipped against the selection array.
3. **Metadata** — a description (≤2000 chars) and up to 10 tags (≤30 chars each).
4. **Upload** — the rendered thumbnails and metadata are sent with a strong expected-head tag; one transaction pins that exact commit, snapshots public name/description/tags, records publication history, replaces thumbnails, and flips `visibility` to `'public'`.

Later cloud saves and MR merges do not alter public content. The gallery remains on the old commit, source, and pages until the owner runs Publish again and reviews the disclosure — the listing's own presentation is separately editable (below), but nothing a visitor can open or download moves without a publish. Publishing is reversible: `POST /api/projects/:id/unpublish` clears current publication visibility/pointer and returns 404 publicly; retained publication records remain owner-inaccessible while private. An admin can also force-unpublish.

### Editing a Published Listing

`PATCH /api/projects/:id/publication` (`components/cloud/EditListingModal.tsx`) is metadata-only: it writes `published_tags`/`tags`, `published_description`/`description` (both mirrored the same way `publish` does), `updated_at`, and — only when the caller sends a new set — the `thumbnails` rows. It deliberately never touches `published_commit_id`, `published_name`, or `published_at`. That last omission is load-bearing rather than incidental: `published_at` is what `GET /api/gallery` orders its default *Recently updated* listing by, so a tag fix that re-ranked the project would be free promotion. 409 `NOT_PUBLISHED` if the project isn't currently public, re-checked under the row lock inside the transaction.

Two omissions are meaningful on the wire, both meaning "keep what is published": an omitted `description` preserves the published one, and an omitted `thumbnails` preserves the published previews (`previewNodeIds` without `thumbnails` is a 400 — accepting it would answer 200 to a request the route silently ignored). Only `tags` is mandatory. `parsePreviewSet` is shared with the publish route so the two cannot drift on the count, the magic-byte check, or the 300 KB ceiling.

Client side, the modal seeds its picker from `GET /api/gallery/:id`'s `previews[].nodeId` and re-renders previews from the **published** commit, never from the editor's working state — so the preview strip can never advertise pages the download doesn't contain. A listing published before migration `016` has no recorded source pages: it opens with nothing ticked and its current images displayed above the picker, and an untouched selection sends no thumbnails, so those images survive. All three entry points (`GalleryDetailBody`, `MyProjectsPage`, `CloudMenu`) mount it through `LazyEditListingModal`, which `lazy()`-imports it.

Be precise about what that buys, because it is *not* "pdfjs off `/gallery`". `App.tsx` statically imports every page except `DocsSection`, so **there are no per-route chunks**: a production build emits `index`, `DocsSection`, `EditListingModal`, and two vendor chunks, and `index` — 2.65 MB, loaded on every route — already contains pdfjs, anchored there by the static chain `EditorPage` → `CloudMenu` → `PublishModal` → `thumbnailService`. The lazy boundary removes pdfjs from nothing. What it does do, measurably: `EditListingModal` builds as its own ~6 kB chunk with no pdfjs markers in it, so the modal's weight stays out of the entry chunk *and* the gallery and my-projects routes never become a **second, independent** static importer of `thumbnailService` — which is what would keep pdfjs pinned to those routes even after `EditorPage`/`PublishModal` were lazified. That lazification is the change that would actually get pdfjs off `/gallery`, and this round did not make it.

## Browsing the Gallery Without Login

The gallery is designed to be useful to anonymous visitors:

- **`/gallery`** (`GalleryPage.tsx`) — paginated (24 per page), free-text search over name/description, and a **Recent** / **Popular** (`fork_count + download_count`) sort — all served by `GET /api/gallery`, which requires no authentication.
- **`/gallery/:id`** (`GalleryDetailPage.tsx`) — full public detail from the pinned publication. **Open in editor** and PDF/ZIP download fetch that same published commit (`GET /api/gallery/:id/state`) — never a newer private head.
- **`/u/:username`** (`ProfilePage.tsx`) — a public profile listing a user's published projects (`GET /api/users/:username`).

Only two actions on these pages actually require signing in: **Fork this project** (shown as "Sign in to fork" otherwise) and reporting/proposing/merging. Browsing, searching, previewing, and cloning are all anonymous.

## Fork Lineage

Forking (`POST /api/projects/:id/fork`) creates a brand-new project, owned by the forker, seeded from the upstream project's current **published commit** as its own first commit. A newer private head is never copied. The fork records that exact `forked_from_commit_id`, and project creation, initial commit/head update, and source counter increment share one transaction.

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

Merging itself (`POST /api/merge-requests/:id/merge`, target owner only — 403 otherwise) re-verifies the diff, then transactionally compares the target head, inserts/advances the merge commit, and marks the MR merged. Required response data is gathered before commit. A merge advances only mutable `head_commit_id`; published gallery content stays pinned until explicit republish.

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
| `POST /api/projects/:id/commits` | owner + `If-Match` | CAS-save a new commit |
| `GET /api/projects/:id/commits` | owner or public | Owner history, or explicitly published history only |
| `GET /api/projects/:id/commits/:commitId` | owner or public | Owner commit, or explicitly published commit only |
| `POST /api/projects/:id/publish` | owner | Publish with thumbnails + description + tags |
| `PATCH /api/projects/:id/publication` | owner | Edit the live listing's description/tags/previews — never the published commit or `published_at` |
| `POST /api/projects/:id/unpublish` | owner | Make private again |
| `POST /api/projects/:id/fork` | required | Fork a public project into a new private one |
| `GET /api/thumbnails/:thumbId` | none | Serve a stored thumbnail image |
| `GET /api/gallery` | none | Paginated/searchable/sortable public listing |
| `GET /api/gallery/:id` | none | Public project detail + lineage |
| `GET /api/gallery/:id/state` | none | Full published state for open/PDF (increments downloads) |
| `POST /api/gallery/:id/report` | optional | Report a project |
| `POST /api/merge-requests` | required | Open an MR from one of your forks |
| `GET /api/projects/:id/merge-requests` | owner | Incoming MRs targeting your project |
| `GET /api/merge-requests/mine` | required | MRs you've authored |
| `GET /api/merge-requests/:id` | author or target owner | Detail + live-recomputed diff |
| `POST /api/merge-requests/:id/merge` | target owner | Merge (re-verifies conflict-free) |
| `POST /api/merge-requests/:id/close` | author or target owner | Close without merging |
| `GET /api/admin/reports` | admin or currently configured owner | List reported projects |
| `POST /api/admin/projects/:id/unpublish` | admin or currently configured owner, hierarchy enforced | Force-unpublish a project with a reason and audit |
| `DELETE /api/admin/reviews/:id` | admin or currently configured owner, hierarchy enforced | Delete a review with a reason and audit |
| `GET /api/admin/users?q=&cursor=` | admin or currently configured owner | Search accounts by email/username; safe bounded DTOs only |
| `GET /api/admin/users/:id?historyCursor=` | admin or currently configured owner | Account suspension state, published projects, and moderation history |
| `POST /api/admin/users/:id/suspend` | admin or currently configured owner, hierarchy enforced | Suspend, revoke sessions, optionally unpublish selected projects, and audit atomically |
| `POST /api/admin/users/:id/restore` | admin or currently configured owner, hierarchy enforced | Clear suspension, defensively revoke sessions, and audit atomically |
| `POST /api/owner/users/:id/promote-admin` | currently configured owner | Promote a user to admin, revoke sessions, and audit atomically |
| `POST /api/owner/users/:id/revoke-admin` | currently configured owner | Demote an admin, optionally suspend/unpublish, revoke sessions, and audit atomically |
| `GET /api/owner/audit` | currently configured owner | Filter and page global immutable platform audit |

Shared moderation routes protected by `requireAdmin` accept an `admin` or a currently configured `owner`. A stale stored `owner` absent from current `OWNER_EMAILS` is denied as an actor but remains protected as a moderation target.

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Required in production (Cloud Run's filesystem is ephemeral); unset in local dev falls back to `server/analytics.db` (SQLite). |
| `OWNER_EMAILS` | Comma-separated, normalized owner addresses. This is the sole deployment-controlled owner root of trust; production startup fails when the normalized set is empty. Configure at least two addresses for recovery. |
| `TRUSTED_ORIGINS` | Comma-separated origins allowed to call the API with credentials — feeds both better-auth's `trustedOrigins` and the `checkOrigin` CSRF guard. |
| `ALLOWED_HOSTS` | Comma-separated `Host` header values the server will serve auth for. Unset means "allow all," which is fine in dev but should be set explicitly in production. |
| `VITE_API_BASE` | API origin (no path suffix) used by `services/cloudApi.ts` for every gallery/cloud-project/fork/merge-request call. Leave empty in production (same origin as the client). |
| `VITE_API_URL` | **Pre-existing quirk, unrelated to this feature set**: a *different*, older client-side variable used as-is (not origin-only) by `lib/auth-client.ts` and `services/analytics.ts`, each expecting its own path suffix already baked in. It is not interchangeable with `VITE_API_BASE`. See `.env.example` for the exact expected values of each. |

`BETTER_AUTH_URL`, `CLIENT_URL`, and Google OAuth/GitHub token variables are listed in `.env.example`.

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

- **Session cookies**, not bearer tokens — better-auth issues an httpOnly session cookie on sign-in. Every `requireAuth`/`optionalAuth` check resolves the cookie through `auth.api.getSession`, then starts a database transaction, locks the current user row (`FOR UPDATE` on PostgreSQL; SQLite uses its serialized `BEGIN IMMEDIATE` transaction), and rechecks `banned`/`banExpires`. If state is actively suspended, deletion of all target sessions occurs in that same transaction and request is unauthenticated (`401` for required auth, `user: null` for optional auth). This lock scope serializes cleanup with restoration: guard-first cleanup commits before restoration permits a new session, while restoration-first makes guard recheck inactive and preserves that new valid session.
- **Origin checks on writes**: `checkOrigin` (defense-in-depth alongside `sameSite` cookies) rejects any non-`GET`/`HEAD`/`OPTIONS` request whose `Origin` header isn't in `TRUSTED_ORIGINS` (or the request's own host) with a 403 — a CSRF mitigation independent of the cookie policy itself.
- **Host allow-list**: `isHostAllowed`/`ALLOWED_HOSTS` rejects requests for `Host` headers the server doesn't recognize before auth is even constructed for that request.
- **Rate limits**: a global `writeLimiter` caps non-`GET` `/api/*` requests to 200 per 15 minutes per client; better-auth additionally rate-limits its own endpoints (20 requests/60s).
- **Better Auth administrator HTTP routes are disabled**: the application retains Better Auth's administrator plugin because sign-in uses its active-ban and expiry enforcement. Express rejects direct `/api/auth/admin` requests as defense-in-depth. Better Auth's own `hooks.before` independently rejects normalized `ctx.path === '/admin'` and `/admin/*`, so raw or percent-encoded dot segments cannot normalize into a plugin administrator endpoint after bypassing Express prefix matching. Such endpoint requests receive `404` before plugin execution. Valid CORS `OPTIONS` preflights may return `204` earlier, and invalid hosts may return `400` earlier. Account administration is exposed only through application-owned routes below.
- **Validation caps**: every commit (create, save, or merge) is run through `validateAppState` — 5MB max serialized size, 20,000 nodes, 50 variants, 50,000 elements total. A merge that would exceed any of these is rejected (409) with nothing written, even if the merge itself is otherwise conflict-free.
- **Thumbnail magic-byte checks**: `parseThumbnail` doesn't trust the claimed `data:image/webp;base64,...` / `data:image/png;base64,...` prefix — it decodes the base64 payload, enforces a 300KB ceiling, and verifies the actual bytes (PNG signature, or `RIFF....WEBP`) match the claimed type before ever writing to the `thumbnails` table.
- **CORP for public thumbnails**: `/api/thumbnails/:thumbId` explicitly sets `Cross-Origin-Resource-Policy: cross-origin` (overriding helmet's app-wide same-origin default) plus `X-Content-Type-Options: nosniff`, since these are unauthenticated, intentionally-public images that need to load as `<img>` tags across the client/API origin split (or a future CDN). This route reads no session/auth state, so relaxing CORP here crosses no privacy boundary.
- **Content-Security-Policy** is disabled app-wide in helmet's config today (the SPA depends on Google Fonts and inline styles) — see [Known limitations](#known-limitations--follow-ups).

## Owner and moderator operations

Stored roles have one explicit authority order; null or unknown values behave as `user`:

| Capability | Currently configured owner | Admin (moderator) | User |
|---|---:|---:|---:|
| View reports, account search/detail, and moderation stats | Yes | Yes | No |
| Suspend/restore users and moderate user content | Yes | Yes | No |
| Promote users to admin | Yes | No | No |
| Demote/suspend admins or moderate admin content | Yes | No | No |
| Query global platform audit | Yes | No | No |
| Act on an owner, owner content, or owner-authored review | No | No | No |
| Add/remove owners | Deployment only | No | No |

`OWNER_EMAILS` is the only owner-membership source. Entries are trimmed, lowercased, deduplicated, and compared with normalized account emails. Production refuses to start with an empty normalized set; development and tests may use an empty set. Startup runs migrations, then reconciles authority in one transaction before listening: configured existing accounts become owners, stale stored owners become users, every changed account increments `moderationVersion`, all its sessions are revoked, and an immutable `owner_granted` or `owner_removed` system action is written. Every reconciliation action has actor kind `system`, null actor user ID, actor label `OWNER_EMAILS reconciliation`, and fixed reason `Synchronize account role with OWNER_EMAILS configuration`. A configured address without an account creates no row; signup reconciliation grants authority only if its role/session/audit transaction succeeds. Configure at least two owners.

Every authenticated request resolves the session, locks and re-reads account email, role, suspension fields, and moderation version, and places those fresh values in `req.user`. `requireAdmin` accepts a fresh `admin` or a fresh `owner` with current configured-email membership; `requireOwner` requires the same fresh owner role and current membership. Role changes revoke sessions. A stale stored owner absent from current `OWNER_EMAILS` is denied as an actor on both shared and owner-only routes, but stored owner rows remain protected as moderation targets during temporary configuration drift. Startup reconciliation repairs that drift before traffic.

Admins can target users and user-owned/authored content only. Currently configured owners can target users or admins and their content, never stored owners. Suspension and restoration use optimistic `moderationVersion`, revoke sessions, and commit account, selected-content, and audit changes atomically. Only explicitly selected published projects become private; restoration never republishes content or changes role. Demoting an admin always produces a user, so later restoration remains user. Reasons are trimmed, mandatory, and 1-1,000 characters. Expiries must be future calendar-valid ISO-8601 timestamps with seconds and an explicit `Z` or numeric timezone. Project selections contain 0-20 unique non-empty IDs.

Migration `012_session_suspension_guard` rejects session insertion for active suspensions. PostgreSQL locks the referenced user and migration `013_session_suspension_wall_clock` evaluates expiry with `(clock_timestamp() AT TIME ZONE 'UTC')`; SQLite uses the same active predicate under its serialized writer. Expired suspensions permit sign-in, which clears persisted suspension fields; audit remains.

### Stable moderation DTOs

```ts
type ModerationAccount = {
  id: string;
  email: string;
  username: string | null;
  role: 'owner' | 'admin' | 'user';
  createdAt: string;
  suspensionStatus: 'none' | 'active' | 'expired';
  banExpires: string | null;
  moderationVersion: number;
  banReason: string | null;
};

type PlatformAuditAction = {
  id: string;
  actorKind: 'user' | 'system';
  actorUserId: string | null;
  actorEmail: string;
  targetUserId: string | null;
  targetEmail: string | null;
  projectId: string | null;
  reviewId: string | null;
  action: 'owner_granted' | 'owner_removed' | 'admin_promoted' | 'admin_demoted'
    | 'account_suspended' | 'account_restored' | 'project_unpublished' | 'review_deleted';
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  metadata:
    | { source: 'owner_emails_reconciliation'; previousRole: 'owner' | 'admin' | 'user'; newRole: 'owner' | 'admin' | 'user' }
    | { source: 'owner_role_workflow'; previousRole: 'owner' | 'admin' | 'user'; newRole: 'owner' | 'admin' | 'user' }
    | { source: 'account_workflow' | 'owner_role_workflow' }
    | { source: 'account_workflow' | 'owner_role_workflow' | 'standalone_project'; previousProjectVisibility: 'public' }
    | { source: 'standalone_review'; deletedReviewRating: 1 | 2 | 3 | 4 | 5 };
};
```

Account search returns `{ users: Array<Omit<ModerationAccount, 'banReason'>>, nextCursor: string | null }`. Account detail returns `{ account: ModerationAccount, projects: Array<{ id: string; name: string; publishedAt: string | null }>, history: { items: PlatformAuditAction[], nextCursor: string | null } }`. Every list page contains at most 25 rows. Cursors are opaque and must be replayed unchanged.

### Stable moderation HTTP contract

Anonymous protected requests receive `401 { "error": "Unauthorized" }`. An actor without admin or current configured-owner authority at an admin route receives `403 { "error": "Forbidden: Admins only" }`; an actor without current configured-owner authority at an owner route receives `403 { "error": "Forbidden: Owners only" }`.

| Method and path | Authority | Request | `200` response |
|---|---|---|---|
| `GET /api/admin/users?q=&cursor=` | admin or currently configured owner | Query: required 1-100 character `q`, optional opaque `cursor` | Account search DTO |
| `GET /api/admin/users/:id?historyCursor=` | admin or currently configured owner | Optional opaque `historyCursor` | Account detail DTO |
| `POST /api/admin/users/:id/suspend` | admin or currently configured owner, hierarchy enforced | `{ reason, expiresAt: string \| null, projectIdsToUnpublish: string[], expectedModerationVersion }` | `{ account: ModerationAccount, actions: PlatformAuditAction[] }` |
| `POST /api/admin/users/:id/restore` | admin or currently configured owner, hierarchy enforced | `{ reason, expectedModerationVersion }` | `{ account: ModerationAccount, actions: [PlatformAuditAction] }` |
| `POST /api/owner/users/:id/promote-admin` | currently configured owner | `{ reason, expectedModerationVersion }` | `{ account: ModerationAccount, actions: [PlatformAuditAction] }` |
| `POST /api/owner/users/:id/revoke-admin` | currently configured owner | `{ reason, expectedModerationVersion, suspension: { expiresAt: string \| null } \| null, projectIdsToUnpublish: string[] }` | `{ account: ModerationAccount, actions: PlatformAuditAction[] }` |
| `POST /api/admin/projects/:id/unpublish` | admin or currently configured owner, hierarchy enforced | `{ reason }` | `{ success: true, action: PlatformAuditAction }` |
| `DELETE /api/admin/reviews/:id` | admin or currently configured owner, hierarchy enforced | `{ reason }` | `{ success: true, action: PlatformAuditAction }` |
| `GET /api/owner/audit` | currently configured owner | Query filters below | `{ items: PlatformAuditAction[], nextCursor: string \| null }` |

Search errors are `400 { "error": "q must be 1 to 100 characters" }` and `400 { "error": "cursor is invalid" }`. Detail uses `400 { "error": "historyCursor is invalid" }` and `404 { "error": "User not found" }`. Suspend uses `400 "Invalid suspension request"`, `403 "Target is protected by role hierarchy"`, `404 "User not found"`, `409 "Moderation state changed; refresh and try again"`, and `500 "Account suspension failed"`. Restore uses the same hierarchy/missing/conflict errors with `400 "Invalid restoration request"` and `500 "Account restoration failed"`.

Promotion uses `400 "Invalid promotion request"`, `403 "Target is protected by role hierarchy"`, `404 "User not found"`, `409 "Role or moderation state changed; refresh and try again"`, and `500 "Admin promotion failed"`. Revocation uses the same hierarchy/missing/conflict errors with `400 "Invalid revocation request"` and `500 "Admin revocation failed"`. Standalone unpublish uses `400 "Invalid project unpublish request"`, `403 "Target is protected by role hierarchy"`, `404 "Project not found"`, `409 "Project state changed; refresh and try again"`, and `500 "Project unpublish failed"`. Review deletion uses equivalent messages: `400 "Invalid review deletion request"`, `403` hierarchy, `404 "Review not found"`, `409 "Review state changed; refresh and try again"`, and `500 "Review deletion failed"`. Quoted text is the value of the response `error` field.

Global audit accepts optional exact normalized `actorEmail` and `targetEmail` filters (1-320 characters), one supported `action`, inclusive `from`/`to` ISO timestamps, and an opaque `cursor`; `from` cannot be later than `to`. Invalid filters or cursor return `400 { "error": "Invalid audit query" }`. Results are global newest-first by `createdAt`, then ID, and cursor pagination preserves every active filter.

### Audit storage and privacy

Migration `014_platform_audit_actions` creates `platform_audit_actions`, backfills every legacy `moderation_actions` row with the same ID, and installs PostgreSQL/SQLite triggers rejecting update or delete. `moderation_actions` remains immutable historical storage but receives no future writes; every current history read and moderation write uses `platform_audit_actions`. Actions cover owner reconciliation, role promotion/demotion, account suspension/restoration, selected or standalone project unpublishing, and review deletion. Audit insertion shares the state-change transaction.

Rows snapshot actor kind/ID/email label, target ID/email, project/review IDs, reason, expiry, timestamp, action, and server-generated constrained metadata. Metadata contains only action source, old/new role, prior public visibility, or deleted rating. Audit never stores passwords, provider/session tokens, session IDs, IP addresses, arbitrary request payloads, or review text. Search, report views, account-detail reads, and moderation-page access are not audited. Target history exposes user-actor case events to moderators; only currently configured owners can inspect system events and global history.

### Emergency owner recovery

Change `OWNER_EMAILS` and redeploy. Startup reconciliation grants owner to configured existing accounts, removes stale owners to user, increments versions, revokes all affected sessions, and writes system audit actions. Review every existing admin after rollout and demote any account that no longer needs moderator authority. Application rollback never restores removed owner configuration and never replaces this recovery procedure; follow [the PostgreSQL rollout and rollback runbook](9-owner-moderator-rollout.md).

## Known Limitations / Follow-ups

- Session-suspension and platform-audit trigger behavior is executed against SQLite, and exact PostgreSQL statements for migrations `012`, `013`, and `014` are contract-tested. Repository has no live PostgreSQL test harness, so PostgreSQL trigger execution, audit backfill, and owner reconciliation require the staging runbook before production approval.

- **Email verification** is not wired up — it needs an actual email provider chosen and configured first; better-auth supports `emailVerification` natively once one exists.
- **Thumbnails are stored as database blobs** (Postgres `bytea` / SQLite `BLOB`), not object storage. Fine at launch scale; the `/api/thumbnails/:id` indirection means moving to something like GCS later requires no client-side changes.
- **No per-change cherry-pick merging.** A conflicted MR can't selectively take some of the fork's changes — the accepted v1 semantics are that the fork author re-forks the latest upstream and reapplies their edit there.
- **No "update fork from upstream."** There's no button to pull/rebase new upstream changes into an existing fork; re-forking is the only path today.
- **Auto-sync is intentionally absent** — this is a deliberate design decision (see [above](#local-first--explicit-sync-model)), not a missing feature.
- **CSP tuning is deferred** (see [Security Model](#security-model)) — a tuned Content-Security-Policy is a follow-up hardening task, not done here.
- **Three disclosed findings surfaced during this feature's implementation and final verification**, none treated as blocking (all are narrow/edge-case or pre-existing, not confirmed to have ever affected a real user). The most consequential part of the first — silent partial preview renders — was fixed in the listing-editing round; everything else below remains open:
  - **Preview render/upload error handling in `PublishModal` — and, since the listing-editing round, in `EditListingModal` too** (originally flagged during the publish-wizard work). **Still open:** the render and upload steps share a single `catch` block, so a failure only surfaces as "which phase failed" indirectly (whether preview thumbnails are already showing). **Fixed:** ~~thumbnail rendering (`generateThumbnails`) only throws on a *fully empty* result — both callers guard with `rendered.length === 0` and neither compares the count against the selection, so a partial render (fewer images produced than pages selected, e.g. from a transient canvas-context allocation failure) succeeds with fewer thumbnails than the user chose and no warning surfaced~~ — closed in the same round that widened its blast radius. Kept here because the *reason* the guard exists is not obvious from the guard: a short render is coherent everywhere downstream — the server accepts it, the gallery lays it out, and the listing editor reopens pre-ticked on the reduced set — so the owner's only signal was counting images on their own listing. On publish that put a new listing live short of previews. On an edit it was materially worse: `replaceThumbnails` deletes the existing set before inserting, in the same transaction, and nothing snapshots thumbnails anywhere (`project_publications` stores only `(project_id, commit_id, published_at)`), so a partial render silently replaced a **live public listing's** previews with fewer images than the owner selected, with no server-side copy to restore the originals from. **Fix applied**: both modals now compare `rendered.length` against `selected.length` and throw before the POST/PATCH — `Only N of M previews rendered. Nothing was published — try again.` on publish, `…Nothing was changed — try again.` on edit — which lands in each modal's existing error state and re-enables its button, turning silent public-data loss into a retry. The new check subsumes the old `rendered.length === 0` one rather than sitting beside it: `selected.length === 0` is refused earlier in both modals, so a fully empty render is just this mismatch with `N = 0`. Scoping is unchanged — the edit path only re-renders when the owner changes the page list, so an untouched list still sends no thumbnails and never reached this at all. Covered by `refuses a partial render …` in `tests/unit/PublishModal.test.tsx` and `tests/unit/EditListingModal.test.tsx`; the neighbouring "page it rendered from" tests still pin that each image is uploaded with the `nodeId` from its own pair, now through a pairs-order divergence rather than a skip (a skip no longer reaches the upload).
  - **Global storage and project-count allowances are not globally serialized.** Save/fork checks now execute through their write transaction, and first-publish allowance is serialized by locking the owner row, but writes to different projects can still race on aggregate `SUM(state_bytes)` and project creation can race on project count. Individual state ceilings and the per-user write limiter bound exposure. A maintained aggregate row or broader owner/global lock is a future hardening option.
  - **The per-user write rate limiter's counter store is in-process memory, not shared** (flagged during the same review): `server/middleware/limits.js`'s `userWriteLimiter` uses `express-rate-limit`'s default in-memory store. This is fine for the byte-quota/cost-control goal this whole feature exists for — that accounting is entirely DB-backed via `SUM(state_bytes)`, correct regardless of how many server instances are running — but the separate per-user abuse-defense goal this specific limiter exists for ("IP limits die behind NAT/shared networks; a per-user limiter doesn't") only holds running a single server instance. If this app is ever deployed horizontally scaled behind a load balancer, each instance enforces its own independent `USER_COMMITS_PER_HOUR` budget, effectively multiplying the real limit by the instance count. A fix, if pursued: point `userWriteLimiter` at a shared store (e.g. a Postgres-backed counter table) instead of the default in-memory one.
- ~~Direct/hard navigation to any non-root client route 404s when served from the production build~~ — **found and fixed** during this doc's own production build+boot verification (not a gallery-specific issue, and not a regression from this feature set — see history below). `server/app.js`'s SPA catch-all was calling `res.sendFile(path.join(distPath, 'index.html'))` with no `root` option; under the currently-installed Express 5 / `send` package combination, that specific call form 404s even though the file exists. Confirmed pre-existing and unrelated to this plan — the identical `res.sendFile` call already existed, byte-for-byte, in `server/index.js` before this feature set's first commit — and unrelated to `npm run dev` (Vite's dev server has its own correct SPA fallback), which is why no earlier verification in this plan caught it until a real production boot was exercised. **Fix applied**: `res.sendFile('index.html', { root: distPath })` (a relative filename plus explicit `root`, which is also Express's own recommended `sendFile` pattern). Verified after the fix: `curl` against a real production boot returns `200` with the real SPA shell for `/gallery`, `/gallery/:id`, `/login`, `/mr/:id`, `/u/:username`, and `/`, and the full unit suite (75/75) plus `tsc --noEmit` remained clean.
