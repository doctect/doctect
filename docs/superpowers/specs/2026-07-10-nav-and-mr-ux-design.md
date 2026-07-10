# Shared Header Nav + Merge-Request UX — Design

**Date:** 2026-07-10
**Status:** Approved, ready for implementation planning

## Problems (from first-use feedback)

1. **Merge-request page soft-lock.** `/mr/:id` shows only a status chip, a Close button, and a
   link back to the target project — no explanation of what the status means for the viewer,
   and no way back to the editor, gallery, or home.
2. **Landing-page account dropdown broken.** Only the first menu item is clickable. Root
   cause: the landing `<nav>` and hero `<main>` are sibling `z-10` stacking contexts, so the
   later sibling (hero) paints above the nav — the dropdown (z-50 *inside* nav's context) is
   covered below the nav strip by invisible hero wrappers.
3. **No owner notification for new merge requests.**
4. **Inconsistent headers.** Five different headers (landing nav, editor toolbar, docs
   header, gallery header, bare MR page); from the gallery it isn't obvious the logo goes
   home, and there's no Docs link.

## 1. Shared `AppHeader` component

`components/AppHeader.tsx`:

- Left: logo block + "PDF Architect" wordmark, links to `/`.
- Right: labeled links **Editor** (`/app`), **Gallery** (`/gallery`), **Docs** (`/docs`),
  then `<AccountMenu />`.
- Sticky top bar, `bg-white/90 backdrop-blur`, border-bottom, `z-50` — the DocsPage header's
  proven pattern. The dropdown must never be occluded by page content (that's the point).
- Active-page link may be visually distinguished (font weight/color) but that's cosmetic,
  not contract.

**Adopters** (replacing their existing top bars where one exists): `DocsPage`, `GalleryPage`,
`GalleryDetailPage` (standalone page view only — the in-app overlay modal keeps its own
chrome), `ProfilePage`, `MyProjectsPage`, `AccountSettingsPage`, `MergeRequestPage`,
`WelcomePage`.

**Non-adopters (explicit):** `LandingPage` keeps its marketing nav (already carries
Documentation/Gallery links) with only the z-index fix below; `EditorPage`/editor toolbar
unchanged (already has icon links); `LoginPage` stays minimal; `AnalyticsDashboard` out of
scope. Page-specific controls (gallery search, etc.) stay in the page body below the header.

## 2. Landing dropdown fix

`pages/LandingPage.tsx`: nav `z-10` → `z-20` (hero `main` stays `z-10`). Regression test
asserts the dropdown container is not inside a stacking context that paints below the hero
(structural assertion, same style as the canvas stacking-isolation test).

## 3. Merge-request page guidance

Below the title row on `/mr/:id`, one status- and role-aware sentence:

| Status | Viewer | Copy |
|--------|--------|------|
| open | author (not owner) | "Waiting for the project owner to review this merge request." |
| open | target owner | "You own the target project — review the changes below, then merge or close." |
| conflicted | anyone | "The target project has changed since this was proposed — it can't be merged as-is. Update your fork and propose the changes again." |
| merged | anyone | "This merge request was merged into the target project." |
| closed | anyone | "This merge request was closed without merging." |

The server already returns `isTargetOwner`; authorship derives from the MR payload. Plus the
`AppHeader` on top — the soft-lock disappears with it.

## 4. Owner email on merge-request creation

In the existing MR-create route (`server/routes/mergeRequests.js`), after the request row is
created:

- Skip when the author IS the target owner (self-fork MRs).
- Look up the target project owner's email (users table join).
- `sendEmail` (existing `server/email.js` — Resend or console fallback):
  - Subject: `New merge request for "<target project name>"`
  - Body: `<author username>` proposed changes, link to `${CLIENT_URL}/mr/<id>`.
- **Fire-and-forget:** email is sent after the response logic, failures are caught and
  logged, and never change the API status code. No new rate limiting (MR creation is already
  behind `requireUsername` + the per-user hourly content rate limit).

## Testing

- `AppHeader` component test (links + AccountMenu present); one adoption test per page is
  overkill — a representative subset (gallery, docs, MR page) asserting the header renders.
- Landing stacking regression test.
- MR-page explainer: component tests for each status/role row of the table above.
- Server test with injected sender: creating an MR captures exactly one email to the target
  owner containing the `/mr/<id>` link; a self-MR captures none; email-send failure doesn't
  change the create response.
- Real-browser verification: dropdown fully clickable on landing; nav round-trip
  gallery → docs → editor → MR page; MR create sends (console-fallback log in dev).
