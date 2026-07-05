# Gallery Detail as an Overlay Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every in-app link to a specific gallery project (the gallery grid, the profile page's grid, `GalleryDetailPage`'s "forked from" link, and `MergeRequestPage`'s target-project link) opens that project as an overlay modal over whatever page you clicked from, instead of a full page navigation — while `/gallery/:id` keeps working as a standalone, directly-loadable, shareable URL exactly as it does today.

**Architecture:** React Router's "background location" pattern. `App.tsx`'s single `<Routes>` splits into two: one renders using `location.state?.backgroundLocation ?? location` (so the page you clicked from keeps rendering, URL notwithstanding — `/gallery/:id` is still registered here too, so a direct hit with no background state still renders the existing full page unchanged); a second, mounted only when a background location is present, renders `/gallery/:id` as a modal on the real current location. A new `GalleryLink` component computes the right `state` for every link to a project, inheriting an already-set background rather than nesting one modal behind another. A new `useGalleryDetail` hook + `GalleryDetailBody` component let the existing full page and the new modal share identical data-fetching/behavior without duplicating it.

**Tech Stack:** React 19 + TypeScript, React Router 6.30 (background-location modal pattern — no new dependency, this is a standard v6 capability), `lucide-react` icons, Vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-07-05-gallery-detail-modal-design.md`

**Note on prior verification:** the background-location + `navigate(-1)` + Escape-key mechanics in this plan were spiked and verified working in this exact repo/test setup before this plan was written (all passed under Vitest/jsdom/RTL: background survives a click, a direct URL hit renders the fallback, and close-via-button/backdrop/Escape all correctly return to the previous history entry). The code below reflects the verified pattern.

## Global Constraints

- Client files are TypeScript.
- Follow existing code style exactly (Tailwind classes, `lucide-react` icons, existing component patterns).
- **Critical, non-negotiable:** any navigation to `/gallery/:id` with no `backgroundLocation` in its location state (a direct URL hit, browser refresh, or `page.goto` in the existing e2e specs) MUST keep rendering the existing full-page `GalleryDetailPage` exactly as it does today. This is what several existing Playwright specs (`tests/e2e/fork.spec.js`, `tests/e2e/merge_requests.spec.js`, `tests/e2e/username_identity.spec.js`) rely on via `page.goto('/gallery/:id')`.
- `tests/unit/GalleryDetailPage.test.tsx`'s existing 6 tests must keep passing **unmodified** — they're the proof that extracting `useGalleryDetail`/`GalleryDetailBody` didn't change the full page's behavior.
- Escape-key handling is new only for the new `GalleryDetailModal` — do not add it to `HistoryModal`, `PublishModal`, or `ProposeChangesModal` (not asked for; out of scope).
- No new dependencies, no database migrations, no server/route changes.
- Test files use Vitest + `@testing-library/react`, explicit imports from `'vitest'`.
- Baseline before this plan: 28 test files / 135 tests passing (`npx vitest run`), `npx tsc --noEmit` clean.

---

### Task 1: `GalleryLink` — a background-location-aware link to a project

**Files:**
- Create: `components/gallery/GalleryLink.tsx`
- Test: Create `tests/unit/GalleryLink.test.tsx`

**Interfaces:**
- Produces: `GalleryLink({ projectId: string; className?: string; children: React.ReactNode }): JSX.Element` — a `<Link>` to `/gallery/${projectId}` that attaches `state: { backgroundLocation }`.
- Consumes: `Link`, `useLocation` from `react-router-dom` (already a dependency).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/GalleryLink.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { GalleryLink } from '../../components/gallery/GalleryLink';

// Renders whatever ends up in the current location's state.backgroundLocation,
// so tests can assert on the navigation's resulting state without reaching
// into MemoryRouter/history internals.
function StateProbe() {
    const location = useLocation();
    const bg = (location.state as any)?.backgroundLocation;
    return <div data-testid="probe">{bg ? bg.pathname : 'none'}</div>;
}

describe('GalleryLink', () => {
    it('attaches the current location as backgroundLocation when none is already set', () => {
        render(
            <MemoryRouter initialEntries={['/gallery']}>
                <Routes>
                    <Route path="/gallery" element={<GalleryLink projectId="abc">Open</GalleryLink>} />
                    <Route path="/gallery/:id" element={<StateProbe />} />
                </Routes>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('link', { name: 'Open' }));
        expect(screen.getByTestId('probe')).toHaveTextContent('/gallery');
    });

    it('inherits an existing backgroundLocation instead of nesting a new one', () => {
        render(
            <MemoryRouter initialEntries={[{
                pathname: '/somewhere',
                state: { backgroundLocation: { pathname: '/original-grid', search: '', hash: '', state: null, key: 'bg1' } },
            }]}>
                <Routes>
                    <Route path="/somewhere" element={<GalleryLink projectId="fork-source">forked from</GalleryLink>} />
                    <Route path="/gallery/fork-source" element={<StateProbe />} />
                </Routes>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('link', { name: 'forked from' }));
        expect(screen.getByTestId('probe')).toHaveTextContent('/original-grid');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/GalleryLink.test.tsx`
Expected: FAIL — `components/gallery/GalleryLink.tsx` doesn't exist yet (module not found).

- [ ] **Step 3: Implement `GalleryLink`**

Create `components/gallery/GalleryLink.tsx`:

```tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

export function GalleryLink({ projectId, className, children }: { projectId: string; className?: string; children: React.ReactNode }) {
    const location = useLocation();
    const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? location;
    return (
        <Link to={`/gallery/${projectId}`} state={{ backgroundLocation }} className={className}>
            {children}
        </Link>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/GalleryLink.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full unit suite and type-check**

Run: `npx vitest run` — expect 29 test files, 137 tests passing (135 baseline + 2 new), zero regressions.
Run: `npx tsc --noEmit` — expect zero errors.

- [ ] **Step 6: Commit**

```bash
git add components/gallery/GalleryLink.tsx tests/unit/GalleryLink.test.tsx
git commit -m "feat(gallery): add GalleryLink, a background-location-aware link to a project"
```

---

### Task 2: Extract `useGalleryDetail` + `GalleryDetailBody` from `GalleryDetailPage`

**Files:**
- Create: `hooks/useGalleryDetail.ts`
- Create: `components/gallery/GalleryDetailBody.tsx`
- Modify: `pages/GalleryDetailPage.tsx` (full file — becomes a thin shell)
- Test: none new — `tests/unit/GalleryDetailPage.test.tsx` (existing, unmodified) is the proof this refactor didn't change behavior.

**Interfaces:**
- Produces:
  ```ts
  // hooks/useGalleryDetail.ts
  export interface UseGalleryDetailResult {
      project: GalleryDetail | null;
      error: string | null;
      busy: string | null;
      mrs: MergeRequestDto[];
      isOwner: boolean;
      showHistory: boolean;
      setShowHistory: (v: boolean) => void;
      fromPath: string;
      session: ReturnType<typeof useSession>['data'];
      openInEditor: () => Promise<void>;
      fork: () => Promise<void>;
      downloadAllVariants: () => Promise<void>;
      report: () => Promise<void>;
      onCloneHistoryVersion: (args: { state: any }) => void;
  }
  export function useGalleryDetail(id: string | undefined): UseGalleryDetailResult
  ```
  ```ts
  // components/gallery/GalleryDetailBody.tsx
  export function GalleryDetailBody({ detail }: { detail: UseGalleryDetailResult }): JSX.Element | null
  ```
- Consumes: `cloudApi`, `ApiError`, `API_BASE`, `GalleryDetail`, `MergeRequestDto` (from `../services/cloudApi`), `stageImport` (from `../services/importProject`), `downloadVariantsZip` (from `../services/pdfService`), `useSession` (from `../lib/auth-client`), `HistoryModal` (from `../components/cloud/HistoryModal`) — all unchanged, already-existing exports.

This task does not change behavior — every line of logic below is moved verbatim from the current `pages/GalleryDetailPage.tsx`, not altered. The "forked from" link stays a **plain** `<Link>` in this task (unchanged from today) — it's switched to `GalleryLink` in Task 4, once every other call site is switched too, so this task's diff is a pure, isolated extraction.

- [ ] **Step 1: Create the hook**

Create `hooks/useGalleryDetail.ts`:

```ts
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cloudApi, GalleryDetail, ApiError, MergeRequestDto } from '../services/cloudApi';
import { stageImport } from '../services/importProject';
import { downloadVariantsZip } from '../services/pdfService';
import { useSession } from '../lib/auth-client';

export interface UseGalleryDetailResult {
    project: GalleryDetail | null;
    error: string | null;
    busy: string | null;
    mrs: MergeRequestDto[];
    isOwner: boolean;
    showHistory: boolean;
    setShowHistory: (v: boolean) => void;
    fromPath: string;
    session: ReturnType<typeof useSession>['data'];
    openInEditor: () => Promise<void>;
    fork: () => Promise<void>;
    downloadAllVariants: () => Promise<void>;
    report: () => Promise<void>;
    onCloneHistoryVersion: (args: { state: any }) => void;
}

export function useGalleryDetail(id: string | undefined): UseGalleryDetailResult {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session } = useSession();
    const [project, setProject] = useState<GalleryDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const isOwner = !!(session?.user && project && (session.user as any).id === project.ownerId);

    useEffect(() => {
        if (!id) return;
        cloudApi.galleryDetail(id).then(setProject).catch(e => setError(e instanceof ApiError ? e.message : 'Not found'));
    }, [id]);

    useEffect(() => {
        if (isOwner && id) cloudApi.listIncomingMrs(id).then(setMrs).catch(() => {});
    }, [isOwner, id]);

    const openInEditor = async () => {
        if (!id) return;
        setBusy('open');
        try {
            const res = await cloudApi.galleryState(id);
            stageImport({ name: res.name, state: res.state });
            navigate('/app');
        } catch { setError('Could not load project'); setBusy(null); }
    };

    const fork = async () => {
        if (!id) return;
        setBusy('fork');
        try {
            const res = await cloudApi.fork(id);
            const commit = await cloudApi.getCommit(res.project.id, res.project.headCommitId!);
            stageImport({
                name: res.project.name,
                state: commit.state,
                cloud: { projectId: res.project.id, lastSyncedCommitId: commit.id }
            });
            navigate('/app');
        } catch (e) {
            if (e instanceof ApiError && e.code === 'USERNAME_REQUIRED') {
                navigate('/welcome', { state: { from: location.pathname } });
                return;
            }
            setError(e instanceof ApiError ? e.message : 'Fork failed');
            setBusy(null);
        }
    };

    const downloadAllVariants = async () => {
        if (!id || !project) return;
        setBusy('download');
        try {
            const res = await cloudApi.galleryState(id);
            await downloadVariantsZip(res.state, res.name);
        } catch {
            setError('Could not generate the PDF download');
        } finally {
            setBusy(null);
        }
    };

    const report = async () => {
        const reason = window.prompt('Why are you reporting this project?');
        if (!reason || !id) return;
        try { await cloudApi.report(id, reason); window.alert('Thanks — the report was sent.'); }
        catch { window.alert('Could not send report.'); }
    };

    const onCloneHistoryVersion = ({ state }: { state: any }) => {
        if (!project) return;
        stageImport({ name: project.name, state });
        navigate('/app');
    };

    return {
        project, error, busy, mrs, isOwner, showHistory, setShowHistory,
        fromPath: location.pathname, session,
        openInEditor, fork, downloadAllVariants, report, onCloneHistoryVersion,
    };
}
```

- [ ] **Step 2: Create the shared body component**

Create `components/gallery/GalleryDetailBody.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { GitFork, Download, Flag, ExternalLink, History } from 'lucide-react';
import { API_BASE } from '../../services/cloudApi';
import { HistoryModal } from '../cloud/HistoryModal';
import { UseGalleryDetailResult } from '../../hooks/useGalleryDetail';

export function GalleryDetailBody({ detail }: { detail: UseGalleryDetailResult }) {
    const {
        project, busy, mrs, isOwner, session, fromPath,
        openInEditor, fork, downloadAllVariants, report,
        showHistory, setShowHistory, onCloneHistoryVersion,
    } = detail;
    if (!project) return null;

    return (
        <>
            <div className="space-y-3">
                {project.thumbnailIds.map(tid => (
                    <img key={tid} src={`${API_BASE}/api/thumbnails/${tid}`} alt="" className="w-full border rounded-xl bg-white" />
                ))}
            </div>
            <div>
                <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
                <div className="text-sm text-slate-500 mt-1">
                    by <Link to={`/u/${project.author}`} className="text-blue-600 hover:underline">{project.author}</Link>
                </div>
                {project.forkedFrom && (
                    <div className="text-xs text-slate-400 mt-1">
                        forked from <Link to={`/gallery/${project.forkedFrom.projectId}`} className="text-blue-600 hover:underline">
                            {project.forkedFrom.author}/{project.forkedFrom.name}</Link>
                    </div>
                )}
                <p className="text-sm text-slate-600 mt-4 whitespace-pre-wrap">{project.description}</p>
                <div className="flex flex-wrap gap-1 mt-3">
                    {project.tags.map(t => <span key={t} className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{t}</span>)}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><GitFork size={12} /> {project.forkCount} forks</span>
                    <span className="flex items-center gap-1"><Download size={12} /> {project.downloadCount} downloads</span>
                </div>
                <div className="flex flex-col gap-2 mt-6 max-w-xs">
                    <button onClick={openInEditor} disabled={busy !== null}
                        className="flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                        <ExternalLink size={14} /> {busy === 'open' ? 'Loading…' : 'Open in editor'}
                    </button>
                    <button onClick={downloadAllVariants} disabled={busy !== null}
                        className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                        <Download size={14} /> {busy === 'download' ? 'Generating…' : 'Download all variants (.zip)'}
                    </button>
                    <button onClick={() => setShowHistory(true)} disabled={busy !== null}
                        className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                        <History size={14} /> Version history
                    </button>
                    {!session?.user ? (
                        <Link to="/login" state={{ from: fromPath }} className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
                    ) : !session.user.username ? (
                        <Link to="/welcome" state={{ from: fromPath }} className="text-center text-xs text-slate-500 hover:text-blue-600">Set a username to fork</Link>
                    ) : (
                        <button onClick={fork} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <GitFork size={14} /> {busy === 'fork' ? 'Forking…' : 'Fork this project'}
                        </button>
                    )}
                    <button onClick={report} className="flex items-center justify-center gap-1 text-[11px] text-slate-400 hover:text-red-600 mt-2">
                        <Flag size={11} /> Report
                    </button>
                </div>
                {isOwner && mrs.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-sm font-semibold text-slate-700 mb-2">Merge requests</h2>
                        <div className="border rounded-lg divide-y bg-white">
                            {mrs.map(mr => (
                                <Link key={mr.id} to={`/mr/${mr.id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50">
                                    <span className="truncate">{mr.title} <span className="text-slate-400">by {mr.authorUsername}</span></span>
                                    <span className="text-[10px] uppercase font-semibold text-slate-500">{mr.status}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {showHistory && (
                <HistoryModal
                    cloudProjectId={project.id}
                    mode="clone"
                    onClone={onCloneHistoryVersion}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </>
    );
}
```

- [ ] **Step 3: Refactor `GalleryDetailPage.tsx` into a thin shell**

Replace the entire contents of `pages/GalleryDetailPage.tsx` with:

```tsx
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AccountMenu } from '../components/AccountMenu';
import { GalleryDetailBody } from '../components/gallery/GalleryDetailBody';
import { useGalleryDetail } from '../hooks/useGalleryDetail';

export function GalleryDetailPage() {
    const { id } = useParams<{ id: string }>();
    const detail = useGalleryDetail(id);
    const { project, error } = detail;

    if (error) return <div className="p-10 text-sm text-red-600">{error} — <Link className="text-blue-600" to="/gallery">back to gallery</Link></div>;
    if (!project) return <div className="p-10 text-sm text-slate-400">Loading…</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-4xl mx-auto p-6 grid md:grid-cols-2 gap-8">
                <GalleryDetailBody detail={detail} />
            </main>
        </div>
    );
}
```

- [ ] **Step 4: Run the existing test suite to verify the refactor preserved behavior**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx`
Expected: PASS (6 tests) — **unmodified** from before this task. If anything fails, the extraction changed behavior; fix the hook/body/shell to match the original file's exact logic rather than changing the test.

- [ ] **Step 5: Run the full unit suite and type-check**

Run: `npx vitest run` — expect 29 test files, 137 tests passing (no change from Task 1's count — this task adds no new tests, it's a pure refactor).
Run: `npx tsc --noEmit` — expect zero errors.

- [ ] **Step 6: Commit**

```bash
git add hooks/useGalleryDetail.ts components/gallery/GalleryDetailBody.tsx pages/GalleryDetailPage.tsx
git commit -m "refactor(gallery): extract useGalleryDetail hook + GalleryDetailBody from GalleryDetailPage"
```

---

### Task 3: `GalleryDetailModal` + background-location routing in `App.tsx`

**Files:**
- Create: `components/gallery/GalleryDetailModal.tsx`
- Modify: `App.tsx` (full file)
- Test: Create `tests/unit/GalleryDetailModal.test.tsx`

**Interfaces:**
- Produces: `GalleryDetailModal(): JSX.Element` (no props — reads `id` via `useParams()`, exactly like `GalleryDetailPage`). Renders as a route element for `/gallery/:id` in `App.tsx`'s second `<Routes>` tree.
- Consumes: `useGalleryDetail` (Task 2), `GalleryDetailBody` (Task 2), `useNavigate`/`useParams` from `react-router-dom`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/GalleryDetailModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { GalleryDetailModal } from '../../components/gallery/GalleryDetailModal';
import { cloudApi, ApiError, GalleryDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

const detail: GalleryDetail = {
    id: 'proj-1', name: 'Test Project', description: 'desc', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', ownerId: 'owner-1',
    headCommitId: 'commit-1', thumbnailIds: [], forkedFrom: null,
};

// A minimal "page behind the modal" -- mirrors how App.tsx's dual-<Routes>
// pattern always has a real history entry (the background page) underneath
// the modal's own entry, so navigate(-1) has somewhere real to land.
function PreviousPage() {
    return (
        <div>
            <div>PREVIOUS_PAGE_MARKER</div>
            <Link to="/gallery/proj-1">Open</Link>
        </div>
    );
}

const renderAt = () => render(
    <MemoryRouter initialEntries={['/previous', '/gallery/proj-1']} initialIndex={1}>
        <Routes>
            <Route path="/previous" element={<PreviousPage />} />
            <Route path="/gallery/:id" element={<GalleryDetailModal />} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryDetailModal', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('renders the project content inside the modal', async () => {
        renderAt();
        expect(await screen.findByText('Test Project')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /open in editor/i })).toBeInTheDocument();
    });

    it('shows a loading state before the project loads', () => {
        renderAt();
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows an error state if the project fails to load', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockRejectedValue(new ApiError(404, 'Not found'));
        renderAt();
        expect(await screen.findByText('Not found')).toBeInTheDocument();
    });

    it('clicking the close (X) button navigates back to the previous page', async () => {
        renderAt();
        await screen.findByText('Test Project');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(await screen.findByText('PREVIOUS_PAGE_MARKER')).toBeInTheDocument();
    });

    it('clicking the backdrop navigates back to the previous page', async () => {
        renderAt();
        await screen.findByText('Test Project');
        fireEvent.click(screen.getByTestId('modal-backdrop'));
        expect(await screen.findByText('PREVIOUS_PAGE_MARKER')).toBeInTheDocument();
    });

    it('pressing Escape navigates back to the previous page', async () => {
        renderAt();
        await screen.findByText('Test Project');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(await screen.findByText('PREVIOUS_PAGE_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/GalleryDetailModal.test.tsx`
Expected: FAIL — `components/gallery/GalleryDetailModal.tsx` doesn't exist yet (module not found).

- [ ] **Step 3: Implement `GalleryDetailModal`**

Create `components/gallery/GalleryDetailModal.tsx`:

```tsx
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useGalleryDetail } from '../../hooks/useGalleryDetail';
import { GalleryDetailBody } from './GalleryDetailBody';

export function GalleryDetailModal() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const detail = useGalleryDetail(id);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') navigate(-1); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [navigate]);

    return (
        <div data-testid="modal-backdrop" className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4" onClick={() => navigate(-1)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => navigate(-1)} aria-label="Close" className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 z-10">
                    <X size={18} />
                </button>
                <div className="p-6">
                    {detail.error && <div className="text-sm text-red-600">{detail.error}</div>}
                    {!detail.error && !detail.project && <div className="text-sm text-slate-400 text-center py-10">Loading…</div>}
                    {detail.project && (
                        <div className="grid md:grid-cols-2 gap-8">
                            <GalleryDetailBody detail={detail} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/GalleryDetailModal.test.tsx`
Expected: PASS (6 tests). If the "loading state" test produces a console warning about an update outside `act(...)` (because the mocked `cloudApi.galleryDetail` promise resolves after that test's synchronous assertion but before the test function returns), that's test output noise to fix — e.g. by awaiting the resolution (`await screen.findByText('Test Project')`) at the end of that specific test before letting it finish, not by suppressing the warning.

- [ ] **Step 5: Wire the dual-`<Routes>` pattern into `App.tsx`**

Replace the entire contents of `App.tsx` with:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { EditorPage } from './pages/EditorPage';
import { DocsPage } from './pages/DocsPage';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { LoginPage } from './pages/LoginPage';
import { GalleryPage } from './pages/GalleryPage';
import { GalleryDetailPage } from './pages/GalleryDetailPage';
import { GalleryDetailModal } from './components/gallery/GalleryDetailModal';
import { ProfilePage } from './pages/ProfilePage';
import { MergeRequestPage } from './pages/MergeRequestPage';
import { WelcomePage } from './pages/WelcomePage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { trackEvent } from './services/analytics';
import { useSession } from './lib/auth-client';
import { Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<EditorPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/:id" element={<GalleryDetailPage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/mr/:id" element={<MergeRequestPage />} />
        <Route
          path="/analytics"
          element={
            <AuthGuard>
              <AnalyticsDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/welcome"
          element={
            <AuthGuard>
              <WelcomePage />
            </AuthGuard>
          }
        />
        <Route
          path="/account"
          element={
            <AuthGuard>
              <AccountSettingsPage />
            </AuthGuard>
          }
        />
      </Routes>
      {backgroundLocation && (
        <Routes>
          <Route path="/gallery/:id" element={<GalleryDetailModal />} />
        </Routes>
      )}
    </>
  );
}

function PageTracker() {
  const location = useLocation();
  React.useEffect(() => {
    trackEvent('page_view', { path: location.pathname });
  }, [location]);
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, error } = useSession();
  const location = useLocation();

  if (isPending) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} />;
  }

  // Optional: Check strictly for admin role if the backend enforces it, 
  // but the backend will return 403 if not admin, so the dashboard will likely show an error.
  // For better UX, we can check here too.
  /*
  if (session.user.role !== 'admin') {
      return <div className="p-8 text-center text-red-600">Access Denied. Admins only.</div>;
  }
  */

  return <>{children}</>;
}

export default App;
```

(Only change from the current file: the inline `<Routes>...</Routes>` block inside `App()` is replaced by `<AppRoutes />`, and a new `AppRoutes` function component wraps that same route table plus the new second `<Routes>` for the modal. `PageTracker` and `AuthGuard` are unchanged, copied verbatim.)

- [ ] **Step 6: Run the full unit suite and type-check**

Run: `npx vitest run` — expect 30 test files, 143 tests passing (137 after Task 1 + 6 new from this task).
Run: `npx tsc --noEmit` — expect zero errors.

- [ ] **Step 7: Commit**

```bash
git add components/gallery/GalleryDetailModal.tsx tests/unit/GalleryDetailModal.test.tsx App.tsx
git commit -m "feat(gallery): add GalleryDetailModal + background-location routing in App.tsx"
```

---

### Task 4: Wire every project link to `GalleryLink`, and prove the whole thing end to end

**Files:**
- Modify: `pages/GalleryPage.tsx` (swap the card link)
- Modify: `pages/ProfilePage.tsx` (swap the card link)
- Modify: `pages/MergeRequestPage.tsx` (swap the target-project link)
- Modify: `components/gallery/GalleryDetailBody.tsx` (swap the "forked from" link)
- Test: Create `tests/unit/galleryModalRouting.test.tsx`

**Interfaces:**
- Consumes: `GalleryLink` (Task 1), `GalleryDetailModal` (Task 3), `GalleryDetailPage`/`GalleryPage` (existing/Task 2).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Swap `GalleryPage.tsx`'s card link**

In `pages/GalleryPage.tsx`, add the import (alongside the existing `lucide-react`/`cloudApi`/`AccountMenu` imports):

```tsx
import { GalleryLink } from '../components/gallery/GalleryLink';
```

Replace the card block:

```tsx
                        <Link key={item.id} to={`/gallery/${item.id}`} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="text-xs text-slate-500">by {item.author}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </Link>
```
→
```tsx
                        <GalleryLink key={item.id} projectId={item.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="text-xs text-slate-500">by {item.author}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </GalleryLink>
```

`Link` (from `react-router-dom`) stays imported in this file — it's still used for the brand logo link and the "Editor" link elsewhere in the same file.

- [ ] **Step 2: Swap `ProfilePage.tsx`'s card link**

In `pages/ProfilePage.tsx`, add the import:

```tsx
import { GalleryLink } from '../components/gallery/GalleryLink';
```

Replace the card block:

```tsx
                        <Link key={item.id} to={`/gallery/${item.id}`} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </Link>
```
→
```tsx
                        <GalleryLink key={item.id} projectId={item.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </GalleryLink>
```

`Link` stays imported in this file too — still used for the two "back to gallery" links.

- [ ] **Step 3: Swap `MergeRequestPage.tsx`'s target-project link**

In `pages/MergeRequestPage.tsx`, this file's only use of `Link` is the one being replaced, so change the import line:

```tsx
import { Link, useParams } from 'react-router-dom';
```
→
```tsx
import { useParams } from 'react-router-dom';
```

Add the new import (alongside the existing `lucide-react`/`cloudApi`/`AccountMenu` imports):

```tsx
import { GalleryLink } from '../components/gallery/GalleryLink';
```

Replace:

```tsx
                <Link to={`/gallery/${mr.targetProjectId}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600">
                    <ArrowLeft size={14} /> {mr.targetProjectName}
                </Link>
```
→
```tsx
                <GalleryLink projectId={mr.targetProjectId} className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600">
                    <ArrowLeft size={14} /> {mr.targetProjectName}
                </GalleryLink>
```

- [ ] **Step 4: Swap `GalleryDetailBody.tsx`'s "forked from" link**

In `components/gallery/GalleryDetailBody.tsx`, add the import:

```tsx
import { GalleryLink } from './GalleryLink';
```

Replace:

```tsx
                {project.forkedFrom && (
                    <div className="text-xs text-slate-400 mt-1">
                        forked from <Link to={`/gallery/${project.forkedFrom.projectId}`} className="text-blue-600 hover:underline">
                            {project.forkedFrom.author}/{project.forkedFrom.name}</Link>
                    </div>
                )}
```
→
```tsx
                {project.forkedFrom && (
                    <div className="text-xs text-slate-400 mt-1">
                        forked from <GalleryLink projectId={project.forkedFrom.projectId} className="text-blue-600 hover:underline">
                            {project.forkedFrom.author}/{project.forkedFrom.name}</GalleryLink>
                    </div>
                )}
```

`Link` stays imported in this file — still used for the "by {author}" link and the merge-request list links.

- [ ] **Step 5: Write the integration test**

Create `tests/unit/galleryModalRouting.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { GalleryPage } from '../../pages/GalleryPage';
import { GalleryDetailPage } from '../../pages/GalleryDetailPage';
import { GalleryDetailModal } from '../../components/gallery/GalleryDetailModal';
import { cloudApi, GalleryItem, GalleryDetail } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
}));

// A minimal stand-in for App.tsx's own AppRoutes (see App.tsx) -- exercises the
// real GalleryPage / GalleryDetailPage / GalleryDetailModal / GalleryLink together
// without importing the actual App.tsx, which transitively pulls in EditorPage
// and, through it, pdfjs-dist -- see the note in tests/unit/CloudMenu.test.tsx
// about that crashing module load under jsdom.
function TestAppRoutes() {
    const location = useLocation();
    const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
    return (
        <>
            <Routes location={backgroundLocation || location}>
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/gallery/:id" element={<GalleryDetailPage />} />
            </Routes>
            {backgroundLocation && (
                <Routes>
                    <Route path="/gallery/:id" element={<GalleryDetailModal />} />
                </Routes>
            )}
        </>
    );
}

const item: GalleryItem = {
    id: 'proj-1', name: 'Cool Planner', description: '', tags: [], author: 'someone',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', thumbnailId: null,
};
const detail: GalleryDetail = {
    ...item, ownerId: 'owner-1', headCommitId: 'commit-1', thumbnailIds: [], forkedFrom: null,
};

describe('gallery card click opens an overlay modal; direct hits still get the full page', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [item], page: 0, hasMore: false });
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(detail);
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
    });

    it('clicking a card shows the modal without unmounting the grid behind it', async () => {
        render(<MemoryRouter initialEntries={['/gallery']}><TestAppRoutes /></MemoryRouter>);
        const card = await screen.findByText('Cool Planner');
        fireEvent.click(card);
        expect(await screen.findByRole('button', { name: /open in editor/i })).toBeInTheDocument();
        // The grid's own search input proves GalleryPage never unmounted underneath the modal.
        expect(screen.getByPlaceholderText(/search planners/i)).toBeInTheDocument();
    });

    it('a direct hit on /gallery/:id (no background state) renders the full page instead', async () => {
        render(<MemoryRouter initialEntries={['/gallery/proj-1']}><TestAppRoutes /></MemoryRouter>);
        // Only the full-page shell has this "back to gallery" header link; the modal has none.
        expect(await screen.findByRole('link', { name: /gallery/i })).toBeInTheDocument();
    });
});
```

- [ ] **Step 6: Run the new test, then the full suite and type-check**

Run: `npx vitest run tests/unit/galleryModalRouting.test.tsx`
Expected: PASS (2 tests).

Run: `npx vitest run` — expect 31 test files, 145 tests passing (143 after Task 3 + 2 new).
Run: `npx tsc --noEmit` — expect zero errors.

- [ ] **Step 7: Manual verification in a real browser**

Start the dev server (`npm run dev`) and:
1. Go to `/gallery`, click a project card — confirm it opens as a modal with a visibly dimmed grid behind it, the URL becomes `/gallery/:id`, and the browser back button closes it back to the grid.
2. Press Escape while the modal is open — confirm it closes the same way.
3. While the modal is open, refresh the page (or copy the URL into a new tab) — confirm `/gallery/:id` now renders the full standalone page (not a modal on a blank background), proving the direct-hit fallback works.
4. From a project's modal, click "forked from" (use a project you know is a fork, or fork one first) — confirm the upstream project opens as a modal on top of the *same* grid, not nested inside the first project's modal.
5. From `/u/:username` and from an `/mr/:id` page, click through to a project — confirm both also open as a modal over that page.

- [ ] **Step 8: Full repo verification**

Run: `npx vitest run` — expect all 145 tests passing.
Run: `npx tsc --noEmit` — expect zero errors.
Run: `npm run build` — expect a clean production build.

- [ ] **Step 9: Commit**

```bash
git add pages/GalleryPage.tsx pages/ProfilePage.tsx pages/MergeRequestPage.tsx components/gallery/GalleryDetailBody.tsx tests/unit/galleryModalRouting.test.tsx
git commit -m "feat(gallery): open gallery project links as an overlay modal everywhere"
```
