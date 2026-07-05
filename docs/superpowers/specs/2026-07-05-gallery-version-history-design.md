# Gallery Version History — Design

**Status:** Approved (interactive brainstorming, 2026-07-05)

## Context

The editor already has full version history for a project's owner (`components/cloud/HistoryModal.tsx`, opened from `CloudMenu`): a list of commits with **Restore**, which overwrites the currently-open editor tab. There is currently no way to see a public project's version history from the **gallery** — `pages/GalleryDetailPage.tsx` only ever shows the current head (via "Open in editor") and lets you fork it.

The server already supports this without any changes: `GET /api/projects/:id/commits` and `GET /api/projects/:id/commits/:commitId` (`server/routes/projects.js`) both use `loadProject(false)`, which permits access to the project's **owner or anyone**, as long as the project's `visibility` is `'public'`. `services/cloudApi.ts`'s `listCommits`/`getCommit` already call these endpoints and are already typed. This is a client-only feature.

## Decisions (from brainstorming)

- **Access:** Visible to everyone, including anonymous visitors — consistent with the existing gallery philosophy (browsing, searching, previewing, and cloning are all anonymous already; only Fork and report/propose/merge require sign-in). The gallery detail page only ever renders for public projects, so no additional gating is needed.
- **Per-version action:** "Open in editor" only — clones that specific past snapshot into a fresh local, non-cloud project, exactly like the existing head-only "Open in editor" button, just pinned to an older commit. No per-version PDF download, no restore-in-place (there is nothing to restore — the viewer doesn't own the project).
- **UI pattern:** A modal, matching every other cloud-feature interaction in this app (`HistoryModal`, `PublishModal`, `ProposeChangesModal` are all modals opened from a button) — not a dedicated route.
- **Component reuse:** Generalize the existing `HistoryModal` with a `mode` prop rather than create a new, near-duplicate component. The existing `CloudMenu` call site is unaffected (it passes no `mode` prop, so it keeps today's exact behavior via the default).

## Design

### `HistoryModal` gets a `mode` prop

`components/cloud/HistoryModal.tsx`'s props become a discriminated union so TypeScript enforces the right callback for the chosen mode:

```ts
type HistoryModalProps =
  { cloudProjectId: string; onClose: () => void } &
  ( { mode?: 'restore'; onRestore: (state: AppState) => void }
  | { mode: 'clone';   onClone: (args: { state: AppState }) => void } );
```

Everything that isn't in the table below stays identical between modes: fetching the commit list on mount (`cloudApi.listCommits`), the `HEAD` tag on the newest commit, the 200-commit cap (a server-side limit, unchanged), and the loading/error scaffolding.

| | `restore` (existing default) | `clone` (new) |
|---|---|---|
| Confirm dialog before acting | Yes — `window.confirm('Replace the current editor contents…')` | No — cloning is non-destructive, it opens a **new** local project and touches nothing the viewer already has open |
| Row button label / icon | "Restore" / `RotateCcw` | "Open in editor" / `ExternalLink` |
| On click, after `cloudApi.getCommit(...)` | `onRestore(migrateState(commit.state))` | `onClone({ state: commit.state })` |
| Error fallback message | "Restore failed" | "Could not open this version" |

**Why `clone` mode skips `migrateState`:** `GalleryDetailPage`'s existing `openInEditor`/`fork` handlers pass raw state straight into `stageImport(...)` without calling `migrateState` themselves — migration already happens exactly once, downstream, when `EditorPage` consumes the staged import (`consumeImport()` → `migrateState(pending.state)` in `pages/EditorPage.tsx`). Calling `migrateState` a second time in `HistoryModal` for clone mode would be redundant and inconsistent with that established pattern (not incorrect, since `migrateState` is presumably idempotent, but there's no reason to diverge from how every other gallery-clone path already works).

### `GalleryDetailPage.tsx` wiring

A new "Version history" button (History icon — same icon/label `CloudMenu` already uses for the equivalent editor action) is added to the existing action-button column (the `flex flex-col gap-2 mt-6 max-w-xs` block), placed after "Download all variants (.zip)" and before the Fork/sign-in block. It is not gated on session state — the page only ever renders for public projects (`galleryDetail` 404s otherwise), so anonymous access is safe by construction.

```tsx
const [showHistory, setShowHistory] = useState(false);

// ...button in the action column:
<button onClick={() => setShowHistory(true)} disabled={busy !== null}
    className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
    <History size={14} /> Version history
</button>

// ...modal, alongside the page's existing conditionally-rendered content:
{showHistory && (
    <HistoryModal
        cloudProjectId={project.id}
        mode="clone"
        onClone={({ state }) => { stageImport({ name: project.name, state }); navigate('/app'); }}
        onClose={() => setShowHistory(false)}
    />
)}
```

`project.id` (from `GalleryDetail`) is the same project id `/api/projects/:id/commits` expects — confirmed by reading `server/routes/gallery.js`'s `loadPublicProject`, which selects `p.*` from the same `projects` table row `GalleryDetailPage` already displays. `stageImport` and `navigate` are already imported and used in this file by `openInEditor`/`fork`.

## Non-goals (explicitly out of scope)

- No per-version PDF/zip download — only "Open in editor" was requested.
- No diff/preview between two versions — that's the separate, already-existing merge-request diff UI (`shared/diff.js`, `MergeRequestPage.tsx`); generalizing it to arbitrary two-commit comparisons outside the fork/merge-request flow is a bigger feature that wasn't asked for.
- No new server endpoints, no new route/URL — a modal, matching the existing convention.
- No change to the existing `restore` behavior or its confirm-dialog wording.
- `docs/8-cloud-and-gallery.md` is not updated by this change — this matches the repo's actual established practice (the recent "download all variants" zip button also isn't mentioned there; that narrative doc isn't updated for every incremental gallery UI addition).

## Testing approach

1. **New** `tests/unit/HistoryModal.test.tsx` — this component currently has no dedicated test file (only indirect, non-exercising coverage via `tests/unit/CloudMenu.test.tsx`, which never opens the history modal in its test scenarios). Cover both modes:
   - Default (no `mode` prop, matching `CloudMenu`'s exact existing call shape): list renders with `HEAD` tag on the newest commit; clicking "Restore" calls `window.confirm`; if the user cancels, `onRestore` is **not** called; if confirmed, `onRestore` is called with the fetched, migrated state; an API error shows "Restore failed" (or the server's own message).
   - `mode="clone"`: list renders the same way; the row button reads "Open in editor"; clicking it does **not** call `window.confirm` at all; `onClone` is called with `{ state }` from the raw (non-migrated) fetched commit; an API error shows "Could not open this version".
2. **Extend** `tests/unit/GalleryDetailPage.test.tsx`:
   - Clicking "Version history" opens the modal and lists commits (mock `cloudApi.listCommits`).
   - Clicking a listed commit's "Open in editor" calls `cloudApi.getCommit`, stages the import, and navigates to `/app` — verified via an `/app` marker route in the test's `<Routes>`, the same pattern `tests/unit/loginRedirect.test.tsx` already uses.

## Files touched (summary)

- `components/cloud/HistoryModal.tsx` — add the `mode` prop and its two behavior branches.
- `pages/GalleryDetailPage.tsx` — new button, `showHistory` state, modal wiring.
- `tests/unit/HistoryModal.test.tsx` — new.
- `tests/unit/GalleryDetailPage.test.tsx` — extended with the new scenarios above.

No new dependencies, no database migrations, no server route changes.
