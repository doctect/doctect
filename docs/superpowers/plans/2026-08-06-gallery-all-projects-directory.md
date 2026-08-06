# Gallery All-Projects Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A compact, sortable all-projects directory at `/gallery?view=all`, reachable from three entry points on the sections view.

**Architecture:** A pure presentational `GalleryDirectory` table component (client-side header sorting over the already-fetched catalog), plus a third render mode in `GalleryPage` gated by `?view=all`. No server changes; data comes from the existing `cloudApi.galleryAll()` sweep the sections view already runs.

**Tech Stack:** React 18 + TypeScript + Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-06-gallery-all-projects-directory-design.md`

## Global Constraints

- TDD: every task writes its failing test first, watches it fail, then implements.
- No server changes; no new fetches — the directory renders from the sections sweep's `catalog`.
- Mode precedence: `?q`/`?tag`/`?sort` filtered grid (unchanged, wins) → `?view=all` directory → sections. Filtered-mode behavior and tests stay untouched.
- Sorting is client-side component state, no URL param. Default: Updated, descending. Same-header click toggles direction; new header gets its natural default (asc for Name/Author, desc for Rating/Downloads/Updated). Null ratings sort last in both directions.
- Entry points render on the sections view only. Copy, exact: sticky bar link "All projects"; More-to-explore heading link "See all →"; band "Browse all {N} projects →". Directory back link: "Gallery".
- Dates render as `updatedAt.slice(0, 10)` (locale-independent; SQLite/ISO timestamps are lexically sortable).
- Empty state ("Nothing here yet. Publish the first project!") and error copy ("Could not load the gallery.") are reused verbatim.
- Run unit tests with `npx vitest run <file>`; full suite `npx vitest run`.

---

### Task 1: `GalleryDirectory` component with client-side sorting

**Files:**
- Create: `components/gallery/GalleryDirectory.tsx`
- Test: `tests/unit/GalleryDirectory.test.tsx`

**Interfaces:**
- Consumes: `GalleryItem` (with `thumbnailIds: string[]`), `API_BASE` from `services/cloudApi`; `GalleryLink` (`{ projectId, className?, children }`); `StarRating` (`{ value: number | null, count: number, size?: number }`).
- Produces (used by Task 2):
  - `GalleryDirectory({ items }: { items: GalleryItem[] }): JSX.Element`
  - `sortItems(items: GalleryItem[], key: DirectorySortKey, dir: 'asc' | 'desc'): GalleryItem[]` (exported for tests)
  - `type DirectorySortKey = 'name' | 'author' | 'rating' | 'downloads' | 'updated'`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/GalleryDirectory.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryDirectory, sortItems } from '../../components/gallery/GalleryDirectory';
import { GalleryItem } from '../../services/cloudApi';

const item = (over: Partial<GalleryItem>): GalleryItem => ({
    id: 'x', name: 'X', description: '', tags: [], author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-08-01 10:00:00',
    thumbnailId: null, thumbnailIds: [], ratingAvg: null, ratingCount: 0,
    ...over,
});

const items = [
    item({ id: 'p1', name: 'Beta', author: 'zoe', downloadCount: 5, updatedAt: '2026-08-03 10:00:00', ratingAvg: 3.5, ratingCount: 2, thumbnailIds: ['t1'], thumbnailId: 't1' }),
    item({ id: 'p2', name: 'Alpha', author: 'amy', downloadCount: 9, updatedAt: '2026-08-01 10:00:00', ratingAvg: null, ratingCount: 0 }),
    item({ id: 'p3', name: 'Gamma', author: 'mel', downloadCount: 1, updatedAt: '2026-08-05 10:00:00', ratingAvg: 5, ratingCount: 1 }),
];

const renderIt = () => render(
    <MemoryRouter initialEntries={['/gallery?view=all']}>
        <Routes>
            <Route path="/gallery" element={<GalleryDirectory items={items} />} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>);

const rowNames = () => screen.getAllByTestId('directory-row').map(r => within(r).getByRole('link').textContent);

describe('sortItems', () => {
    it('sorts null ratings last in both directions', () => {
        expect(sortItems(items, 'rating', 'desc').map(i => i.id)).toEqual(['p3', 'p1', 'p2']);
        expect(sortItems(items, 'rating', 'asc').map(i => i.id)).toEqual(['p1', 'p3', 'p2']);
    });
    it('does not mutate its input', () => {
        const before = items.map(i => i.id);
        sortItems(items, 'name', 'asc');
        expect(items.map(i => i.id)).toEqual(before);
    });
});

describe('GalleryDirectory', () => {
    it('renders one row per item, default-sorted by Updated descending', () => {
        renderIt();
        expect(rowNames()).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('shows author, downloads, forks and sliced date per row', () => {
        renderIt();
        const beta = screen.getAllByTestId('directory-row')[1];
        expect(within(beta).getByText('zoe')).toBeInTheDocument();
        expect(within(beta).getByText('2026-08-03')).toBeInTheDocument();
    });

    it('name header sorts ascending by name, second click flips to descending', () => {
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /^name$/i }));
        expect(rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
        fireEvent.click(screen.getByRole('button', { name: /^name$/i }));
        expect(rowNames()).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('downloads header sorts descending first (numeric natural default)', () => {
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /downloads/i }));
        expect(rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('active column carries aria-sort', () => {
        renderIt();
        expect(screen.getByRole('columnheader', { name: /updated/i })).toHaveAttribute('aria-sort', 'descending');
        fireEvent.click(screen.getByRole('button', { name: /^name$/i }));
        expect(screen.getByRole('columnheader', { name: /^name$/i })).toHaveAttribute('aria-sort', 'ascending');
    });

    it('row name links to the project detail', () => {
        renderIt();
        fireEvent.click(within(screen.getAllByTestId('directory-row')[0]).getByRole('link'));
        expect(screen.getByText('DETAIL_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/GalleryDirectory.test.tsx`
Expected: FAIL — module `components/gallery/GalleryDirectory` does not exist.

- [ ] **Step 3: Implement**

Create `components/gallery/GalleryDirectory.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { Square, GitFork, Download } from 'lucide-react';
import { GalleryItem, API_BASE } from '../../services/cloudApi';
import { GalleryLink } from './GalleryLink';
import { StarRating } from './StarRating';

export type DirectorySortKey = 'name' | 'author' | 'rating' | 'downloads' | 'updated';
type SortDir = 'asc' | 'desc';

// Natural first-click direction per column: alphabetical columns ascend, metrics descend.
const DEFAULT_DIR: Record<DirectorySortKey, SortDir> = {
    name: 'asc', author: 'asc', rating: 'desc', downloads: 'desc', updated: 'desc',
};

export function sortItems(items: GalleryItem[], key: DirectorySortKey, dir: SortDir): GalleryItem[] {
    const mul = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
        // Unrated projects sort last regardless of direction.
        if (key === 'rating') {
            if (a.ratingAvg == null && b.ratingAvg == null) return 0;
            if (a.ratingAvg == null) return 1;
            if (b.ratingAvg == null) return -1;
            return (a.ratingAvg - b.ratingAvg) * mul;
        }
        switch (key) {
            case 'name': return a.name.localeCompare(b.name) * mul;
            case 'author': return a.author.localeCompare(b.author) * mul;
            case 'downloads': return (a.downloadCount - b.downloadCount) * mul;
            // SQLite/ISO timestamps compare correctly as strings.
            case 'updated': return a.updatedAt.localeCompare(b.updatedAt) * mul;
        }
    });
}

const COLUMNS: { key: DirectorySortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'author', label: 'Author' },
    { key: 'rating', label: 'Rating' },
    { key: 'downloads', label: 'Downloads' },
    { key: 'updated', label: 'Updated' },
];

export function GalleryDirectory({ items }: { items: GalleryItem[] }) {
    const [sortKey, setSortKey] = useState<DirectorySortKey>('updated');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const sorted = useMemo(() => sortItems(items, sortKey, sortDir), [items, sortKey, sortDir]);

    const onHeader = (key: DirectorySortKey) => {
        if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir(DEFAULT_DIR[key]); }
    };

    return (
        <div className="overflow-x-auto bg-white border rounded-xl">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="w-12" aria-hidden />
                        {COLUMNS.map(c => (
                            <th key={c.key} className="px-3 py-2"
                                aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                                <button onClick={() => onHeader(c.key)}
                                    className="font-semibold text-slate-600 hover:text-blue-600">
                                    {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                                </button>
                            </th>
                        ))}
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Forks</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(i => (
                        <tr key={i.id} data-testid="directory-row" className="border-b last:border-b-0 hover:bg-slate-50">
                            <td className="pl-3 py-1.5">
                                <div className="w-8 aspect-[3/4] bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                                    {i.thumbnailIds[0]
                                        ? <img src={`${API_BASE}/api/thumbnails/${i.thumbnailIds[0]}`} alt="" loading="lazy" className="w-full h-full object-cover" />
                                        : <Square size={12} className="text-slate-300" />}
                                </div>
                            </td>
                            <td className="px-3 py-1.5">
                                <GalleryLink projectId={i.id} className="font-medium text-slate-800 hover:text-blue-600">
                                    {i.name}
                                </GalleryLink>
                            </td>
                            <td className="px-3 py-1.5 text-slate-500">{i.author}</td>
                            <td className="px-3 py-1.5">
                                {i.ratingCount > 0
                                    ? <StarRating value={i.ratingAvg} count={i.ratingCount} size={12} />
                                    : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-slate-500"><span className="flex items-center gap-1"><Download size={12} /> {i.downloadCount}</span></td>
                            <td className="px-3 py-1.5 text-slate-500">{i.updatedAt.slice(0, 10)}</td>
                            <td className="px-3 py-1.5 text-slate-500"><span className="flex items-center gap-1"><GitFork size={12} /> {i.forkCount}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

Note the column order in the body must match the header row: thumb, Name, Author, Rating, Downloads, Updated, Forks — Forks is the last, unsortable column. (The `COLUMNS` array covers the five sortable ones; Updated's body cell comes before the Forks cell, matching Updated's header position before the Forks header — verify the `<td>` order against the `<th>` order when implementing; the code above is already aligned.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/GalleryDirectory.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add components/gallery/GalleryDirectory.tsx tests/unit/GalleryDirectory.test.tsx
git commit -m "feat(gallery): sortable all-projects directory table"
```

---

### Task 2: `?view=all` mode + three entry points in `GalleryPage`

**Files:**
- Modify: `pages/GalleryPage.tsx`
- Modify: `tests/unit/GalleryPage.test.tsx` (add directory-mode tests; existing tests untouched)

**Interfaces:**
- Consumes: `GalleryDirectory({ items })` (Task 1); existing `catalog` state, `setParam`, `isFiltered`, `galleryEmpty`, `SkeletonGrid`.
- Produces: the `?view=all` render mode and its three sections-view entry points.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/GalleryPage.test.tsx` (existing tests and `beforeEach` stay untouched — the shared `beforeEach` already mocks `galleryAll`; add a richer catalog inside the new tests):

```tsx
const directoryCatalog = () => [
    { ...mkItem('p1', 'Alpha Planner'), tags: ['planner'] },
    { ...mkItem('p2', 'Beta Budget'), tags: ['finance'] },
    { ...mkItem('p3', 'Omega Misc'), tags: ['misc'] },
];

describe('directory mode (?view=all)', () => {
    it('renders the directory table with a count heading', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue(directoryCatalog());
        renderAt('/gallery?view=all');
        expect(await screen.findByText(/all projects \(3\)/i)).toBeInTheDocument();
        expect(screen.getAllByTestId('directory-row')).toHaveLength(3);
        // sections chrome absent
        expect(screen.queryByText(/in the spotlight/i)).toBeNull();
    });

    it('filtered params win over view=all', async () => {
        renderAt('/gallery?q=alpha&view=all');
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ q: 'alpha' })));
        expect(screen.queryByTestId('directory-row')).toBeNull();
    });

    it('all three sections-view entry points open the directory', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue(directoryCatalog());
        renderAt();
        await screen.findByText(/in the spotlight/i);
        expect(screen.getByRole('button', { name: /^all projects$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /see all/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /browse all 3 projects/i }));
        expect(await screen.findByText(/all projects \(3\)/i)).toBeInTheDocument();
    });

    it('Gallery back link returns to the sections view', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue(directoryCatalog());
        renderAt('/gallery?view=all');
        fireEvent.click(await screen.findByRole('button', { name: /gallery/i }));
        expect(await screen.findByText(/in the spotlight/i)).toBeInTheDocument();
    });

    it('empty catalog shows the shared empty state', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([]);
        renderAt('/gallery?view=all');
        expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
    });

    it('sweep failure shows the shared error message', async () => {
        vi.spyOn(cloudApi, 'galleryAll').mockRejectedValue(new Error('down'));
        renderAt('/gallery?view=all');
        expect(await screen.findByText(/could not load the gallery/i)).toBeInTheDocument();
    });
});
```

Note: the "entry points" test asserts the sticky-bar and See-all buttons exist, then navigates via the band — one navigation per test keeps failures attributable. The default `beforeEach` catalog is a single item, whose strip collapses; `More to explore` renders for `directoryCatalog` in the sections view, so the "See all →" button is present.

Check the More-to-explore heading assertion in the existing main sections test still passes — the heading gains a sibling link but keeps its text.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/GalleryPage.test.tsx`
Expected: the 6 new tests FAIL (no directory mode); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `pages/GalleryPage.tsx`:

Add import:

```tsx
import { GalleryDirectory } from '../components/gallery/GalleryDirectory';
```

After the `isFiltered` line (`pages/GalleryPage.tsx:33`):

```tsx
    const viewParam = searchParams.get('view') ?? '';
    const isDirectory = !isFiltered && viewParam === 'all';
```

Sticky bar — inside the sticky div, after the search-input wrapper div (line 104), add:

```tsx
                {!isFiltered && !isDirectory && (
                    <button onClick={() => setParam('view', 'all')}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        All projects
                    </button>
                )}
```

Sections branch — the `!isFiltered` ternary becomes a three-way: loading → empty → (directory | sections). Replace the content fragment opening (line 122's `: <>`) with:

```tsx
                    : isDirectory ? (
                        <>
                            <div className="flex items-center gap-3 mb-4">
                                <button onClick={() => setParam('view', null)}
                                    className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600">
                                    <ArrowLeft size={12} /> Gallery
                                </button>
                                <h1 className="text-sm font-semibold text-slate-700">All projects ({catalog!.length})</h1>
                            </div>
                            <GalleryDirectory items={catalog!} />
                        </>
                    ) : <>
```

(The loading and empty branches above it are shared by both modes and stay exactly as they are.)

"More to explore" heading (lines 136–137) — give it the "See all →" link:

```tsx
                                <section className="mt-8">
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="text-sm font-semibold text-slate-700">More to explore</h2>
                                        <button onClick={() => setParam('view', 'all')}
                                            className="text-xs text-blue-600 hover:underline">See all →</button>
                                    </div>
```

(The `h2` loses its own `mb-3`; the wrapper carries it.)

Band — between the leftover-grid section and the tag chips (after line 142's closing `)}`):

```tsx
                            <button onClick={() => setParam('view', 'all')}
                                className="block w-full mt-10 border rounded-xl bg-white hover:border-blue-300 hover:text-blue-700 text-sm text-slate-700 font-medium py-3 text-center transition-colors">
                                Browse all {catalog?.length ?? 0} projects →
                            </button>
```

And soften the tag-chip container's top margin from `mt-10 pt-6 border-t` to `mt-6 pt-6 border-t` so the band and chips don't double-space.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryPage.test.tsx tests/unit/GalleryDirectory.test.tsx tests/unit/galleryModalRouting.test.tsx`
Expected: PASS, including all pre-existing GalleryPage tests unmodified.

- [ ] **Step 5: Commit**

```bash
git add pages/GalleryPage.tsx tests/unit/GalleryPage.test.tsx
git commit -m "feat(gallery): all-projects directory mode with three entry points"
```

---

### Task 3: Full suite + real-browser sanity check

**Files:**
- Create: `scratch/directory_verify.mjs` (throwaway Playwright drive — NOT committed)

**Interfaces:**
- Consumes: everything above; the dev stack + seeded-projects pattern from `scratch/gallery_redesign_verify.mjs` and `scratch/verify.config.cjs` (reuse their server/seed setup wholesale).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: green (known load-sensitive flake: `GalleryDetailPage.test.tsx:213` — rerun to confirm if it trips, note it).

- [ ] **Step 2: Real-browser drive**

Copy the seed/server scaffolding from `scratch/gallery_redesign_verify.mjs` into `scratch/directory_verify.mjs`, then verify and screenshot into `scratch/`:

1. Sections view: sticky "All projects" link, "See all →" beside More to explore, "Browse all N projects →" band all visible (`dir_01_entry_points.png`).
2. Band click → directory table at `?view=all`: count heading, one row per seeded project, thumbs render (`dir_02_directory.png`).
3. Click "Name" header → rows re-order ascending; click again → descending (`dir_03_sorted.png`).
4. Click a row name → detail modal opens over the directory; Escape/backdrop closes it back to the directory (`dir_04_modal.png`).
5. "Gallery" back link → sections view restored.
6. Direct load of `/gallery?view=all` (fresh page.goto) renders the directory — shareability.
7. Type in the sticky search from the directory → filtered card grid takes over (`dir_05_search_wins.png`).

- [ ] **Step 3: Report**

No commit unless a defect fix was needed (fixes get their own conventional commits). Screenshots and drive script stay uncommitted.

---

## Post-round note (not a task)

`/docs` gallery screenshots were already stale from the sections redesign; the directory adds to that. One regeneration pass (`node docs-capture/run.js <gallery track>`) after this round covers both.
