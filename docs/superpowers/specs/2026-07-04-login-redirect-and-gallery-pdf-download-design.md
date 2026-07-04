# Login Redirect Fix + Gallery "Download All Variant PDFs" — Design

**Status:** Approved (interactive brainstorming, 2026-07-04)

## Context

User feedback from the first manual test of the gallery/fork/merge-request feature (see `docs/superpowers/plans/2026-07-02-gallery-fork-merge-requests.md`):

1. Signing in always redirects to `/analytics` regardless of where the user came from.
2. The gallery detail page has no way to download a project's PDFs without opening it in the editor.

## 1. Login redirect fix

**Problem:** `pages/LoginPage.tsx` hardcodes `navigate('/analytics')` after sign-in, sign-up, and Google OAuth (`callbackURL: window.location.origin + "/analytics"`), regardless of entry point. Four call sites link to `/login`: `components/AccountMenu.tsx` ("Sign in"), `components/cloud/CloudMenu.tsx` ("Sign in to save to cloud"), `pages/GalleryDetailPage.tsx` ("Sign in to fork"), and `App.tsx`'s `AuthGuard` (protecting `/analytics`).

**Design:** Standard React Router "return to origin" pattern.

- The `from` value is always a plain string pathname (e.g. `/gallery/abc123`), never a full `Location` object — kept consistent across every call site so `LoginPage.tsx` has exactly one shape to read.
- Every `Link to="/login"` passes `state={{ from: <pathname the link lives on> }}` (each caller supplies its own current path — `AccountMenu`/`CloudMenu` are rendered on many pages, so they use `useLocation().pathname` at render time rather than a hardcoded path).
- `App.tsx`'s `AuthGuard` already redirects via `<Navigate to="/login" />`; change it to `<Navigate to="/login" state={{ from: location.pathname }} />` (needs `useLocation()` there).
- `LoginPage.tsx` reads `useLocation().state?.from as string | undefined` and, on successful sign-in/sign-up, calls `navigate(from ?? '/app', { replace: true })` instead of the hardcoded `/analytics`.
- Google OAuth's `callbackURL` becomes `window.location.origin + (from ?? '/app')`.
- **Default destination when there's no `from`** (e.g. someone bookmarks `/login` directly): changes from `/analytics` to `/app`. `/analytics` is an admin-only page; `/app` (the editor) is the sensible generic default now that signups come from the general gallery audience, not just admins testing analytics.

No new dependencies, no server changes. Five files touched: `App.tsx`, `pages/LoginPage.tsx`, `components/AccountMenu.tsx`, `components/cloud/CloudMenu.tsx`, `pages/GalleryDetailPage.tsx`.

## 2. Download all variant PDFs from the gallery

**Design:** A new "Download all variants (.zip)" button on `pages/GalleryDetailPage.tsx`, next to "Open in editor" / "Fork this project". Works for anonymous users (read-only, no account needed — consistent with "Open in editor").

**Mechanism:**
1. Fetch the project's full state via the existing `cloudApi.galleryState(id)` call (same one "Open in editor" already makes) — no new API endpoint needed.
2. New function `generateVariantsZip(state, projectName)` in `services/pdfService.ts`:
   - Loops over `Object.keys(state.variants)`.
   - For each variant, calls the existing `generatePDF(state, { variantId, projectName, output: 'arraybuffer' })` (the `arraybuffer` mode already exists, added in the original plan's Task 14 for thumbnail generation — reused here unchanged).
   - Adds each PDF's bytes to a `JSZip` instance as `<sanitized-variant-name>.pdf` (dedupes/sanitizes names so two variants can't collide or produce a bad filename).
   - Produces the final archive via `zip.generateAsync({ type: 'blob' })`.
3. Triggers a single browser download of the zip blob via `URL.createObjectURL` + a temporary `<a>` element — the same manual-anchor pattern already used by `downloadProjectJson` in `pages/EditorPage.tsx`, so no new download-helper dependency (e.g. `file-saver`) is introduced.

**New dependency:** `jszip` (+ `@types/jszip` if it doesn't ship its own types — check on install). This is a deliberate, explicit decision to avoid the multi-file browser download-permission prompt that sequential separate downloads would trigger (confirmed: the editor's own existing "export all variants" feature in `components/ProjectEditor.tsx` already does N sequential `output: 'save'` downloads with no zipping — that pattern is left untouched; this is a new, separate code path specific to the gallery entry point, not a change to the editor's existing behavior).

**UX:** Button shows a busy/loading state while generating (multi-variant, many-page projects can take a few seconds — same PDF-generation cost as opening the editor and exporting manually, just batched). Zip filename: `<ProjectName>_all_variants.zip`.

**Out of scope:** Changing the editor's own existing "export all variants" checkbox/flow to also zip — not asked for, left as-is (YAGNI).

## Testing approach

- `generateVariantsZip`: unit test with a minimal multi-variant `AppState` fixture, asserting the resulting `Blob`/zip contains one entry per variant with the expected sanitized names (using `jszip`'s own loader to read the produced archive back, rather than asserting on raw bytes).
- Login redirect: manual verification (React Router state-passing is straightforward and the existing e2e specs already exercise sign-in as a side effect of other flows) — no new automated test planned unless the implementation reveals it's warranted.

## Files touched (summary)

- `App.tsx`, `pages/LoginPage.tsx`, `components/AccountMenu.tsx`, `components/cloud/CloudMenu.tsx`, `pages/GalleryDetailPage.tsx` — redirect fix.
- `services/pdfService.ts` — new `generateVariantsZip` export.
- `pages/GalleryDetailPage.tsx` — new button + handler (same file as the redirect fix above).
- `package.json` — add `jszip`.
