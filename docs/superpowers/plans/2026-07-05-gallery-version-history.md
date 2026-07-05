# Gallery Version History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone browsing a public project's gallery page view its full commit history and open any past version directly into a fresh local editor tab — not just the current head.

**Architecture:** No server changes — `GET /api/projects/:id/commits` and `GET /api/projects/:id/commits/:commitId` already permit anonymous access to public projects (`loadProject(false)` in `server/routes/projects.js`), and `services/cloudApi.ts`'s `listCommits`/`getCommit` are already typed and usable as-is. `components/cloud/HistoryModal.tsx` gets a new discriminated-union `mode` prop (`'restore'`, the existing default, unchanged; `'clone'`, new) so it can be reused, unmodified in its data-fetching, by both the editor's `CloudMenu` (restore-in-place) and the new gallery entry point (clone into a fresh local project). `pages/GalleryDetailPage.tsx` adds a "Version history" button that opens it in `clone` mode.

**Tech Stack:** React 19 + TypeScript, `lucide-react` icons, Vitest + `@testing-library/react`, existing `cloudApi`/`stageImport`/`AppState` — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-gallery-version-history-design.md`

## Global Constraints

- Client files are TypeScript.
- Follow existing code style exactly (Tailwind classes, `lucide-react` icons, existing component patterns) — don't introduce new UI conventions for a change this size.
- `HistoryModal`'s default behavior (no `mode` prop passed) MUST remain byte-for-byte identical to its current behavior — `CloudMenu.tsx`'s existing call site is not modified by this plan and must keep working unchanged.
- No new dependencies, no database migrations, no server/route changes.
- Test files use Vitest + `@testing-library/react`, matching existing patterns in `tests/unit/*.test.tsx` — explicit imports from `'vitest'` (not the global implicit API, despite `globals: true` in `vite.config.ts`).
- Commit style: `feat(scope): message`.
- Baseline before this plan: 27 test files / 124 tests passing (`npx vitest run`), `npx tsc --noEmit` clean.

---

### Task 1: `HistoryModal` gains a `mode` prop (`'restore'` default / `'clone'`)

**Files:**
- Modify: `components/cloud/HistoryModal.tsx` (full file, 66 lines)
- Test: Create `tests/unit/HistoryModal.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type HistoryModalProps =
      { cloudProjectId: string; onClose: () => void } &
      (
          | { mode?: 'restore'; onRestore: (state: AppState) => void }
          | { mode: 'clone'; onClone: (args: { state: AppState }) => void }
      );
  export function HistoryModal(props: HistoryModalProps): JSX.Element
  ```
- Consumes: `cloudApi.listCommits`, `cloudApi.getCommit`, `ApiError` (all from `../../services/cloudApi`, unchanged), `migrateState` (from `../../services/migration`, unchanged), `AppState` (from `../../types`, unchanged). New import: `ExternalLink` icon from `lucide-react`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/HistoryModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HistoryModal } from '../../components/cloud/HistoryModal';
import { cloudApi, CommitMeta } from '../../services/cloudApi';

vi.mock('../../services/migration', () => ({
    migrateState: vi.fn((s: any) => ({ ...s, migrated: true })),
}));

const commits: CommitMeta[] = [
    { id: 'c2', parentCommitId: 'c1', message: 'Second save', schemaVersion: 1, createdBy: 'u1', createdAt: '2026-02-01T00:00:00.000Z' },
    { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z' },
];

const commitState = { nodes: {}, rootId: 'root', variants: {}, activeVariantId: 'default' };

describe('HistoryModal', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue(commits);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({ id: 'c2', message: 'Second save', createdAt: '2026-02-01T00:00:00.000Z', state: commitState });
    });

    it('lists commits with a HEAD tag on the newest one', async () => {
        render(<HistoryModal cloudProjectId="proj-1" onRestore={vi.fn()} onClose={vi.fn()} />);
        expect(await screen.findByText(/Second save/)).toBeInTheDocument();
        expect(screen.getByText(/Initial save/)).toBeInTheDocument();
        expect(screen.getByText('HEAD')).toBeInTheDocument();
    });

    describe('default (restore) mode', () => {
        it('shows "Restore" buttons', async () => {
            render(<HistoryModal cloudProjectId="proj-1" onRestore={vi.fn()} onClose={vi.fn()} />);
            expect(await screen.findAllByRole('button', { name: 'Restore' })).toHaveLength(2);
        });

        it('does not call onRestore if the confirm dialog is cancelled', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(false);
            const onRestore = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            expect(window.confirm).toHaveBeenCalled();
            expect(cloudApi.getCommit).not.toHaveBeenCalled();
            expect(onRestore).not.toHaveBeenCalled();
        });

        it('calls onRestore with the migrated state when confirmed', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onRestore = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" onRestore={onRestore} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            await waitFor(() => expect(onRestore).toHaveBeenCalledWith({ ...commitState, migrated: true }));
        });

        it('shows a fallback error message when restoring fails', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            vi.spyOn(cloudApi, 'getCommit').mockRejectedValue(new Error('boom'));
            render(<HistoryModal cloudProjectId="proj-1" onRestore={vi.fn()} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]);
            expect(await screen.findByText('Restore failed')).toBeInTheDocument();
        });
    });

    describe('clone mode', () => {
        it('shows "Open in editor" buttons instead of "Restore"', async () => {
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={vi.fn()} onClose={vi.fn()} />);
            expect(await screen.findAllByRole('button', { name: 'Open in editor' })).toHaveLength(2);
            expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
        });

        it('does not show a confirm dialog before cloning', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onClone = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            await waitFor(() => expect(onClone).toHaveBeenCalled());
            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('calls onClone with the raw (non-migrated) state', async () => {
            const onClone = vi.fn();
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={onClone} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            await waitFor(() => expect(onClone).toHaveBeenCalledWith({ state: commitState }));
        });

        it('shows a fallback error message when opening a version fails', async () => {
            vi.spyOn(cloudApi, 'getCommit').mockRejectedValue(new Error('boom'));
            render(<HistoryModal cloudProjectId="proj-1" mode="clone" onClone={vi.fn()} onClose={vi.fn()} />);
            fireEvent.click((await screen.findAllByRole('button', { name: 'Open in editor' }))[0]);
            expect(await screen.findByText('Could not open this version')).toBeInTheDocument();
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/HistoryModal.test.tsx`
Expected: FAIL — the current `HistoryModal` has no `mode`/`onClone` props; every "clone mode" test fails (either the "Open in editor" button is never found, since the component always renders "Restore" today, or the component calls the (undefined, in these tests) `onRestore` prop internally and the resulting error surfaces as the "Restore failed" fallback text instead of the expected clone behavior).

- [ ] **Step 3: Implement the `mode` prop**

Replace the entire contents of `components/cloud/HistoryModal.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { X, RotateCcw, ExternalLink } from 'lucide-react';
import { cloudApi, CommitMeta, ApiError } from '../../services/cloudApi';
import { migrateState } from '../../services/migration';
import { AppState } from '../../types';

type HistoryModalProps =
    { cloudProjectId: string; onClose: () => void } &
    (
        | { mode?: 'restore'; onRestore: (state: AppState) => void }
        | { mode: 'clone'; onClone: (args: { state: AppState }) => void }
    );

export function HistoryModal(props: HistoryModalProps) {
    const { cloudProjectId, onClose } = props;
    const isClone = props.mode === 'clone';
    const [commits, setCommits] = useState<CommitMeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        cloudApi.listCommits(cloudProjectId)
            .then(setCommits)
            .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load history'));
    }, [cloudProjectId]);

    const select = async (commitId: string) => {
        // Restoring overwrites whatever's currently open in the editor, so it gets a confirm
        // dialog; cloning always creates a brand-new local project and touches nothing the
        // viewer already has open, so it doesn't need one.
        if (props.mode !== 'clone' && !window.confirm('Replace the current editor contents with this version? (Unsaved local changes will be lost — your cloud history is untouched.)')) return;
        setBusyId(commitId); setError(null);
        try {
            const commit = await cloudApi.getCommit(cloudProjectId, commitId);
            if (props.mode === 'clone') {
                // No migrateState here: EditorPage already runs migrateState exactly once when
                // it consumes a staged import (see consumeImport() in pages/EditorPage.tsx),
                // matching how GalleryDetailPage's existing openInEditor/fork handlers already
                // pass raw state into stageImport without migrating it themselves.
                props.onClone({ state: commit.state });
            } else {
                props.onRestore(migrateState(commit.state));
            }
        } catch (e) {
            setError(e instanceof ApiError ? e.message : (props.mode === 'clone' ? 'Could not open this version' : 'Restore failed'));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="font-semibold text-slate-800 text-sm">Version history</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto p-2">
                    {error && <div className="text-xs text-red-600 p-2">{error}</div>}
                    {!commits && !error && <div className="text-xs text-slate-400 p-2">Loading…</div>}
                    {commits?.map((c, i) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-slate-50">
                            <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 truncate">
                                    {c.message} {i === 0 && <span className="text-[10px] text-green-600 font-semibold ml-1">HEAD</span>}
                                </div>
                                <div className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                            </div>
                            <button disabled={busyId !== null} onClick={() => select(c.id)}
                                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-50 flex-shrink-0">
                                {isClone ? <ExternalLink size={11} /> : <RotateCcw size={11} />}
                                {' '}{busyId === c.id ? 'Loading…' : (isClone ? 'Open in editor' : 'Restore')}
                            </button>
                        </div>
                    ))}
                    {commits?.length === 0 && <div className="text-xs text-slate-400 p-2">No versions yet.</div>}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/HistoryModal.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: all pre-existing tests (124) plus the 9 new ones pass (133 total), zero regressions — in particular `tests/unit/CloudMenu.test.tsx` (which renders `HistoryModal` indirectly via `CloudMenu`, always in default/restore mode) must still pass unchanged.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. (This is the step that actually proves the discriminated union is sound — e.g. that `props.onClone`/`props.onRestore` are only accessed where TypeScript can prove they exist.)

- [ ] **Step 7: Commit**

```bash
git add components/cloud/HistoryModal.tsx tests/unit/HistoryModal.test.tsx
git commit -m "feat(cloud): add a clone mode to HistoryModal for read-only viewing"
```

---

### Task 2: "Version history" button on the gallery detail page

**Files:**
- Modify: `pages/GalleryDetailPage.tsx` (imports ~line 1-8, state ~line 18, button column ~line 119-141, end of JSX ~line 155-159)
- Test: Modify `tests/unit/GalleryDetailPage.test.tsx` (full file)

**Interfaces:**
- Consumes: `HistoryModal` with `mode="clone"` (Task 1); `stageImport` (from `../services/importProject`, already imported in this file); `navigate` (already available via `useNavigate()` in this file); `cloudApi` (unchanged — `HistoryModal` calls it internally, this page doesn't call `listCommits`/`getCommit` directly).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/unit/GalleryDetailPage.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryDetailPage } from '../../pages/GalleryDetailPage';
import { cloudApi, ApiError, GalleryDetail } from '../../services/cloudApi';
import { consumeImport } from '../../services/importProject';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

const detail: GalleryDetail = {
    id: 'proj-1', name: 'Test Project', description: 'desc', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', ownerId: 'owner-1',
    headCommitId: 'commit-1', thumbnailIds: [], forkedFrom: null,
};

const renderAt = () => render(
    <MemoryRouter initialEntries={['/gallery/proj-1']}>
        <Routes>
            <Route path="/gallery/:id" element={<GalleryDetailPage />} />
            <Route path="/welcome" element={<div>WELCOME_MARKER</div>} />
            <Route path="/app" element={<div>APP_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryDetailPage fork gating', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('shows "Sign in to fork" when signed out', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Sign in to fork')).toBeInTheDocument();
    });

    it('shows "Set a username to fork" when signed in without a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: null } } });
        renderAt();
        const link = await screen.findByText('Set a username to fork');
        expect(link.closest('a')).toHaveAttribute('href', '/welcome');
    });

    it('shows the Fork button when signed in with a username', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: 'planner_pro' } } });
        renderAt();
        expect(await screen.findByRole('button', { name: /fork this project/i })).toBeInTheDocument();
    });

    it('redirects to /welcome if the server rejects a fork as USERNAME_REQUIRED', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'someone-else', username: 'planner_pro' } } });
        vi.spyOn(cloudApi, 'fork').mockRejectedValue(new ApiError(403, 'nope', 'USERNAME_REQUIRED'));
        renderAt();
        const forkBtn = await screen.findByRole('button', { name: /fork this project/i });
        fireEvent.click(forkBtn);
        expect(await screen.findByText('WELCOME_MARKER')).toBeInTheDocument();
    });
});

describe('GalleryDetailPage version history', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
        mockUseSession.mockReturnValue({ data: null });
        localStorage.clear();
    });

    it('opens the version history modal and lists commits', async () => {
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue([
            { id: 'c2', parentCommitId: 'c1', message: 'Second save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-02-01T00:00:00.000Z' },
            { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-01-01T00:00:00.000Z' },
        ]);
        renderAt();
        fireEvent.click(await screen.findByRole('button', { name: /version history/i }));
        expect(await screen.findByText(/Second save/)).toBeInTheDocument();
        expect(screen.getByText(/Initial save/)).toBeInTheDocument();
    });

    it('opening a past version stages it as a local import and navigates to the editor', async () => {
        vi.spyOn(cloudApi, 'listCommits').mockResolvedValue([
            { id: 'c1', parentCommitId: null, message: 'Initial save', schemaVersion: 1, createdBy: 'owner-1', createdAt: '2026-01-01T00:00:00.000Z' },
        ]);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'c1', message: 'Initial save', createdAt: '2026-01-01T00:00:00.000Z',
            state: { nodes: {}, rootId: 'root', variants: {}, activeVariantId: 'default' },
        });
        renderAt();
        fireEvent.click(await screen.findByRole('button', { name: /version history/i }));
        const messageEl = await screen.findByText(/Initial save/);
        const row = messageEl.parentElement!.parentElement!;
        fireEvent.click(within(row).getByRole('button', { name: 'Open in editor' }));
        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
        expect(consumeImport()).toEqual({
            name: 'Test Project',
            state: { nodes: {}, rootId: 'root', variants: {}, activeVariantId: 'default' },
        });
    });
});
```

(The `messageEl.parentElement!.parentElement!` walk is needed because the page's existing top-level "Open in editor" button — for the current head — has the exact same accessible name as the new per-commit "Open in editor" button inside the modal; `within(row)` scopes the query to just the one commit row so the two identically-labeled buttons don't collide.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx`
Expected: the 4 pre-existing tests in `GalleryDetailPage fork gating` PASS unchanged; both new tests in `GalleryDetailPage version history` FAIL with a timeout on `screen.findByRole('button', { name: /version history/i })` — that button doesn't exist on the page yet.

- [ ] **Step 3: Add the button, state, and modal to `GalleryDetailPage.tsx`**

Change the lucide-react import line:

```tsx
import { ArrowLeft, GitFork, Download, Flag, ExternalLink } from 'lucide-react';
```
→
```tsx
import { ArrowLeft, GitFork, Download, Flag, ExternalLink, History } from 'lucide-react';
```

Add a new import right after the `AccountMenu` import:

```tsx
import { AccountMenu } from '../components/AccountMenu';
```
→
```tsx
import { AccountMenu } from '../components/AccountMenu';
import { HistoryModal } from '../components/cloud/HistoryModal';
```

Add new state right after the `mrs` state declaration:

```tsx
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
```
→
```tsx
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
    const [showHistory, setShowHistory] = useState(false);
```

Add a new button in the action column, right after "Download all variants" and before the sign-in/fork block:

```tsx
                        <button onClick={downloadAllVariants} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <Download size={14} /> {busy === 'download' ? 'Generating…' : 'Download all variants (.zip)'}
                        </button>
                        {!session?.user ? (
```
→
```tsx
                        <button onClick={downloadAllVariants} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <Download size={14} /> {busy === 'download' ? 'Generating…' : 'Download all variants (.zip)'}
                        </button>
                        <button onClick={() => setShowHistory(true)} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <History size={14} /> Version history
                        </button>
                        {!session?.user ? (
```

Add the modal at the end of the component's JSX, right after `</main>` closes:

```tsx
            </main>
        </div>
    );
}
```
→
```tsx
            </main>
            {showHistory && (
                <HistoryModal
                    cloudProjectId={project.id}
                    mode="clone"
                    onClone={({ state }) => { stageImport({ name: project.name, state }); navigate('/app'); }}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx`
Expected: PASS (6 tests: the original 4 plus the 2 new ones).

- [ ] **Step 5: Manual verification in a real browser**

Start the dev server (`npm run dev`) and, as an anonymous (logged-out) browser session:
1. Publish a project with at least two cloud saves (or use an existing published project that already has more than one commit).
2. Open its gallery detail page and click "Version history" — confirm the same commit list you'd see in the editor's own history modal appears, with `HEAD` on the newest entry.
3. Click "Open in editor" on an older (non-HEAD) commit — confirm the editor opens with that older version's content, as a new unsaved local project (not linked to any cloud project), and that the current gallery project itself is untouched (revisit the gallery detail page and confirm its head/description/thumbnails are unchanged).

- [ ] **Step 6: Full repo verification**

Run: `npx vitest run` — expect 27 pre-existing test files (now 28, including the new `HistoryModal.test.tsx` from Task 1) with 135 tests total (124 baseline + 9 from Task 1 + 2 from this task) passing, zero regressions.
Run: `npx tsc --noEmit` — expect zero errors.
Run: `npm run build` — expect a clean production build.

- [ ] **Step 7: Commit**

```bash
git add pages/GalleryDetailPage.tsx tests/unit/GalleryDetailPage.test.tsx
git commit -m "feat(gallery): add a 'Version history' entry point to the gallery detail page"
```
