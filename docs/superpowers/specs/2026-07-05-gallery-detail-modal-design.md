# Gallery Detail as an Overlay Modal — Design

**Status:** Approved (interactive brainstorming, 2026-07-05)

## Context

Today, clicking a project anywhere in the app (`GalleryPage`'s grid, `ProfilePage`'s grid, `GalleryDetailPage`'s own "forked from" link, or `MergeRequestPage`'s target-project link) does a full page navigation to `/gallery/:id` (`GalleryDetailPage.tsx`) — a dedicated route with its own header, `<main>`, thumbnails, description, tags, and action buttons. Feedback: this is more page than the content needs; it should feel like a modal instead.

Constraint that shaped the design: `/gallery/:id` must keep working as a standalone, directly-loadable URL. Multiple existing Playwright specs (`tests/e2e/fork.spec.js`, `tests/e2e/merge_requests.spec.js`, `tests/e2e/username_identity.spec.js`) navigate to it via `page.goto('/gallery/:id')` directly (never by clicking a card), and the app's documented design goal (`docs/8-cloud-and-gallery.md`) is that gallery projects are anonymously browsable *and shareable* — losing a bookmarkable/shareable per-project URL would be a real regression, not just an implementation detail.

## Decisions (from brainstorming)

- **Architecture:** React Router's "background location" modal pattern — the URL still changes to `/gallery/:id` and is still shareable/bookmarkable; a direct hit (no in-app click involved) still renders the existing full page, unchanged. Only navigations that originate from *inside* the app (a click) show it as a modal over whatever was already on screen.
- **Scope:** every in-app link to a specific gallery project gets this treatment — the gallery grid, the profile page's grid, `GalleryDetailPage`'s own "forked from" link, and `MergeRequestPage`'s target-project link.
- **Escape key** closes the modal (in addition to the backdrop-click and X button every other modal in this codebase already supports). This is new only for this modal — `HistoryModal`/`PublishModal`/`ProposeChangesModal` are not being retrofitted; not asked for.

## Design

### Routing mechanism (`App.tsx`)

`App.tsx`'s single `<Routes>` splits into two, driven by whether the current location's `state.backgroundLocation` is set:

```tsx
function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        {/* every existing route, unchanged, including /gallery/:id itself */}
      </Routes>
      {backgroundLocation && (
        <Routes>
          <Route path="/gallery/:id" element={<GalleryDetailModal />} />
        </Routes>
      )}
    </>
  );
}
```

- First `<Routes>` renders using the *background* location when present — so the page you clicked from (grid, profile, MR page, or another project's full page) keeps rendering exactly as if the URL hadn't changed. `/gallery/:id` is still registered here too, so a direct hit (`backgroundLocation` absent, e.g. `page.goto`, refresh, typed URL, shared link) renders `GalleryDetailPage` exactly as it does today — this path is untouched.
- Second `<Routes>` uses the real, un-overridden current location (so `useParams()`/`useLocation()` inside `GalleryDetailModal` see the actual `/gallery/:id`) and only exists while a background location is present — i.e., only when the navigation came from an in-app click.
- `PageTracker` (analytics) is unaffected: it calls `useLocation()` itself, outside both `<Routes>` trees, so it always sees the real URL and fires a page-view for the project regardless of whether it renders as a modal or a full page.

### Shared behavior: `hooks/useGalleryDetail.ts`

Extracts everything `GalleryDetailPage` currently does *except* rendering: fetching the project (`cloudApi.galleryDetail`) and, if the caller owns it, incoming merge requests; the `isOwner` computation; `showHistory` state; and the four handlers (`openInEditor`, `fork`, `downloadAllVariants`, `report`). Takes `id: string | undefined` (the caller resolves it via `useParams()` — the hook itself stays routing-agnostic). Returns everything both consumers below need to render.

This is the first custom hook in this codebase. Justified narrowly: two shells (the existing full page and the new modal) need identical fetch/handler behavior, and duplicating it would let them drift. Not a broader hooks refactor of anything else.

### Shared content: `components/gallery/GalleryDetailBody.tsx`

Everything `GalleryDetailPage` renders *between* its header and its closing tag today — thumbnails, name, author, "forked from" link, description, tags, the four action buttons, the owner's merge-request list, and the `HistoryModal` itself (still triggered by "Version history," unchanged). Takes the `useGalleryDetail` result as a single prop. Pure presentation — no routing hooks of its own beyond what a plain `<Link>`/`<GalleryLink>` needs.

Loading and error states are *not* shared — each shell renders its own (see below), since "bare centered text with a link back to the gallery" (full page) and "a short message inside the modal card" (modal) are different enough not to be worth unifying.

### `pages/GalleryDetailPage.tsx` (refactored, not behaviorally changed)

Becomes a thin shell: `useParams()` for `id`, `useGalleryDetail(id)` for data, its own loading/error branches (unchanged from today), then the existing header (`Gallery` back-link + `AccountMenu`) wrapping `<main>` wrapping `<GalleryDetailBody detail={detail} />`. Rendered output for the full-page route must stay identical to today's — this is a refactor, not a behavior change, and the existing `tests/unit/GalleryDetailPage.test.tsx` suite is the proof.

### `components/gallery/GalleryDetailModal.tsx` (new)

- `useParams()` + `useGalleryDetail(id)`, same as the page.
- Backdrop: `fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4` — one z-level below `HistoryModal`'s `z-[100]`, so opening version history from inside this modal stacks correctly on top of it.
- Card: `bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative`, containing `<GalleryDetailBody detail={detail} />` in the same two-column layout `GalleryDetailPage`'s `<main>` uses today (minus the full-page header/`min-h-screen` chrome — the background page already has its own header).
- Own loading state (`Loading…`, centered, inside the card) and error state (the error message, inside the card — no redundant "back to gallery" link, since closing the modal already does that).
- Close is one function, wired to three triggers: the X button's `onClick`, the backdrop's `onClick` (card itself stops propagation, matching every other modal in this codebase), and a `keydown` listener for `Escape` (attached/removed via `useEffect`, new for this modal specifically). Close calls `navigate(-1)` — the same thing the browser back button already does, since the modal is a real history entry.
- If `HistoryModal` is also open on top of this one (via "Version history" inside `GalleryDetailBody`) when Escape is pressed: `HistoryModal` has no Escape handling of its own (matching the non-goals above), so this modal's listener is the one that fires, and `navigate(-1)` unmounts this modal's whole subtree — closing both at once. Deterministic, if not maximally granular; not worth a second Escape handler on `HistoryModal` just for this nested case.

### `components/gallery/GalleryLink.tsx` (new)

```tsx
export function GalleryLink({ projectId, className, children }: { projectId: string; className?: string; children: React.ReactNode }) {
    const location = useLocation();
    const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? location;
    return <Link to={`/gallery/${projectId}`} state={{ backgroundLocation }} className={className}>{children}</Link>;
}
```

The `?? location` fallback is what makes this correct in every context it's used from:
- Clicked from a plain page (grid, profile, MR page, or a direct-hit full detail page) — `location.state?.backgroundLocation` is absent, so `backgroundLocation` becomes the *current* location, and the target project opens as a modal over whatever you were just looking at.
- Clicked from *inside* an already-open modal (the "forked from" link, when the project you're viewing is itself a modal) — `location.state.backgroundLocation` is already set (to the original grid, say), so the new link inherits that *same* grandparent background instead of nesting a modal-behind-a-modal. No matter how many project-to-project jumps happen via "forked from," the backdrop always ultimately resolves to one real page underneath.

Replaces all 4 existing raw `<Link to={`/gallery/${x}`}>` call sites, each keeping its exact current `className`/children:
- `GalleryPage.tsx` (grid card)
- `ProfilePage.tsx` (grid card)
- `GalleryDetailBody.tsx` (the "forked from" link — inherited from `GalleryDetailPage.tsx` during the extraction above)
- `MergeRequestPage.tsx` (target-project link)

## Non-goals (explicitly out of scope)

- No scroll-lock on the background page while the modal is open (existing modals in this codebase don't do this either).
- No change to `/mr/:id` itself, or to how `HistoryModal`/`PublishModal`/`ProposeChangesModal` work — Escape-key handling is added only to the new `GalleryDetailModal`, not retrofitted onto those.
- No new server/API changes.
- No change to `GalleryPage`'s or `ProfilePage`'s own layout beyond swapping their card `<Link>` for `<GalleryLink>`.

## Testing approach

1. **`tests/unit/GalleryLink.test.tsx`** (new): renders a `GalleryLink` at a plain location and asserts the produced `state.backgroundLocation` is the current location; renders one inside a `MemoryRouter` location that already carries a `backgroundLocation` in its state and asserts the *same* one is reused (not the intermediate location) — proving the inherit-not-nest behavior directly.
2. **`tests/unit/GalleryDetailPage.test.tsx`** (existing): must keep passing with no behavioral changes — proof the extraction into `useGalleryDetail`/`GalleryDetailBody` preserved the full page's output exactly.
3. **`tests/unit/GalleryDetailModal.test.tsx`** (new): renders the modal in isolation (mocked `cloudApi`), asserts the project content renders inside it; asserts clicking the backdrop, clicking the X, and pressing Escape each trigger a "went back" navigation (a `MemoryRouter` with a marker route at the previous location, or a navigation spy).
4. **One integration-level test** (in `tests/unit/GalleryDetailPage.test.tsx` or a new file) rendering the actual dual-`<Routes>` setup with a `MemoryRouter` seeded at `/gallery`, clicking a card, and asserting both: the modal's content appears, *and* the grid's own content is still present in the DOM (proving the background never unmounted) — then, separately, rendering the same setup seeded directly at `/gallery/:id` with no background state and asserting the full-page shell (header/back-link) renders instead.
5. **Manual verification in a real browser**: click through from the gallery grid (modal appears over a visibly-dimmed grid, URL updates, back button and Escape both close it, direct URL reload of that same `/gallery/:id` renders the full page instead), and the "forked from" link from inside an already-open modal (opens the upstream project as a modal without nesting).

## Files touched (summary)

- `hooks/useGalleryDetail.ts` — new.
- `components/gallery/GalleryDetailBody.tsx` — new.
- `components/gallery/GalleryDetailModal.tsx` — new.
- `components/gallery/GalleryLink.tsx` — new.
- `pages/GalleryDetailPage.tsx` — refactored to a thin shell (no behavior change).
- `App.tsx` — dual-`<Routes>` background-location wiring.
- `pages/GalleryPage.tsx`, `pages/ProfilePage.tsx`, `pages/MergeRequestPage.tsx` — swap one `<Link>` each for `<GalleryLink>`.
- `tests/unit/GalleryLink.test.tsx`, `tests/unit/GalleryDetailModal.test.tsx` — new.
- `tests/unit/GalleryDetailPage.test.tsx` — extended with the integration-level dual-route test.

No new dependencies, no database migrations, no server/route changes.
