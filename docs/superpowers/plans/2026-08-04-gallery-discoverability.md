# Gallery Discoverability Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the gallery's sections view into an explainer + daily spotlight + use-case strips layout with Pinterest-style multi-image rollovers on every card.

**Architecture:** One additive server change (gallery card DTO gains ordered `thumbnailIds`); everything else client-side. Sections mode fetches the whole small catalog in one paginated sweep, then pure functions group it (strips claim in declared order, first claim wins, thin strips collapse) and pick a deterministic daily spotlight. A single `RollingPreview` component provides the rollover on every surface. Filtered/search mode is untouched.

**Tech Stack:** React 18 + TypeScript + Tailwind (client), Express + SQLite/Postgres via `query()` (server), Vitest + Testing Library + supertest (tests), Playwright (e2e/verification).

**Spec:** `docs/superpowers/specs/2026-08-04-gallery-discoverability-design.md`

## Global Constraints

- TDD: every task writes its failing test first, watches it fail, then implements.
- No new server routes, tables, or migrations. The only server change is Task 1's DTO addition.
- One shared card component on all surfaces — strips, leftover grid, filtered grid all render `ProjectCard`; the spotlight uses the same `RollingPreview` the card uses.
- `prefers-reduced-motion: reduce` disables all auto-cycling (spotlight included); dots become click-to-step. jsdom has no `window.matchMedia` — every read must be defensive (`typeof window.matchMedia === 'function'`).
- Rollover cycle interval ~700 ms (cards) / ~2000 ms (spotlight autoplay). Max previews per listing is 6 (existing publish cap) — small enough to preload all when cycling starts.
- Catalog sweep: `sort=recent`, page loop until `hasMore` is false, hard cap 5 pages (120 projects).
- Explainer dismissal key: `localStorage['gallery-explainer-dismissed'] = '1'`.
- Filtered mode (`?q`/`?tag`/`?sort`) behavior unchanged; existing filtered-mode tests must stay green unmodified.
- Run unit tests with `npx vitest run <file>`; full suite `npx vitest run`; e2e `npm run test:e2e`.

---

### Task 1: Server + client DTO — ordered `thumbnailIds` on gallery cards

**Files:**
- Modify: `server/routes/gallery.js:61-95` (the `GET /api/gallery` handler)
- Modify: `services/cloudApi.ts:146-150` (`GalleryItem` interface)
- Modify: `tests/unit/GalleryPage.test.tsx` (fixture only — `mkItem` gains the new field)
- Test: `tests/unit/server/gallery.test.js`

**Interfaces:**
- Consumes: existing `thumbnails` table (`id`, `project_id`, `position`), existing `cardDto`.
- Produces: every `GET /api/gallery` item carries `thumbnailIds: string[]` ordered by `position`; `thumbnailId` stays and equals `thumbnailIds[0] ?? null`. TypeScript: `GalleryItem.thumbnailIds: string[]`.

- [ ] **Step 1: Write the failing test**

Append to the `describe('gallery', …)` block in `tests/unit/server/gallery.test.js`:

```js
it('returns ordered thumbnailIds on every card', async () => {
    const proj = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Two Thumbs', state: minimalState() });
    await request(app).post(`/api/projects/${proj.body.project.id}/publish`).set('Cookie', cookie)
        .set('If-Match', `"${proj.body.project.headCommitId}"`)
        .send({ description: 'multi', tags: ['planner'], thumbnails: [PNG_1X1, PNG_1X1] });

    const res = await request(app).get('/api/gallery');
    expect(res.status).toBe(200);
    const item = res.body.items.find(i => i.name === 'Two Thumbs');
    expect(item.thumbnailIds).toHaveLength(2);
    expect(item.thumbnailId).toBe(item.thumbnailIds[0]);
    const single = res.body.items.find(i => i.name === 'Public Planner');
    expect(single.thumbnailIds).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/gallery.test.js -t "ordered thumbnailIds"`
Expected: FAIL — `item.thumbnailIds` is `undefined`.

- [ ] **Step 3: Implement**

In `server/routes/gallery.js`, add below `cardDto` (after line 59):

```js
// Ordered preview ids for the card rollover. Batched (one query for the whole
// page of results) because a per-row correlated subquery can't return an array
// on SQLite.
async function thumbnailIdsByProject(projectIds) {
    const map = new Map();
    if (projectIds.length === 0) return map;
    const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query(
        `SELECT id, project_id FROM thumbnails WHERE project_id IN (${placeholders}) ORDER BY position`,
        projectIds);
    for (const r of rows) {
        if (!map.has(r.project_id)) map.set(r.project_id, []);
        map.get(r.project_id).push(r.id);
    }
    return map;
}
```

In the `GET /api/gallery` handler, replace the final `res.json(...)` line with:

```js
    const items = rows.slice(0, limit);
    const thumbs = await thumbnailIdsByProject(items.map(r => r.id));
    res.json({
        items: items.map(r => ({ ...cardDto(r), thumbnailIds: thumbs.get(r.id) ?? [] })),
        page,
        hasMore: rows.length > limit,
    });
```

In `services/cloudApi.ts`, extend `GalleryItem`:

```ts
export interface GalleryItem {
    id: string; name: string; description: string; tags: string[]; author: string;
    forkCount: number; downloadCount: number; updatedAt: string; thumbnailId: string | null;
    thumbnailIds: string[];
    ratingAvg: number | null; ratingCount: number;
}
```

In `tests/unit/GalleryPage.test.tsx`, update the `mkItem` fixture to satisfy the type:

```ts
const mkItem = (id: string, name: string): GalleryItem => ({
    id, name, description: 'desc', tags: ['planner'], author: 'maker',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', thumbnailId: null,
    thumbnailIds: [],
    ratingAvg: 4.0, ratingCount: 2,
});
```

Then find any other fixture constructing a `GalleryItem` and add `thumbnailIds: []` the same way:

Run: `grep -rln "thumbnailId: null\|thumbnailId: '" tests/ components/ pages/`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/gallery.test.js tests/unit/GalleryPage.test.tsx`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add server/routes/gallery.js services/cloudApi.ts tests/unit/server/gallery.test.js tests/unit/GalleryPage.test.tsx
git commit -m "feat(gallery): return ordered thumbnailIds on gallery cards"
```

---

### Task 2: Strip config, grouping, and spotlight logic (pure functions)

**Files:**
- Create: `components/gallery/sections.ts`
- Test: `tests/unit/gallerySections.test.ts`

**Interfaces:**
- Consumes: `GalleryItem` from `services/cloudApi` (only `id` and `tags` fields).
- Produces (used by Task 7):
  - `STRIPS: StripDef[]` where `StripDef = { key: string; title: string; emoji: string; tags: string[] }`
  - `groupCatalog(items: GalleryItem[], strips?: StripDef[]): { strips: { def: StripDef; items: GalleryItem[] }[]; leftover: GalleryItem[] }`
  - `dateKey(now: Date): string` — `'YYYY-MM-DD'`
  - `pickSpotlight(items: GalleryItem[], key: string): GalleryItem | null`
  - `MIN_STRIP_ITEMS = 2`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/gallerySections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GalleryItem } from '../../services/cloudApi';
import { groupCatalog, pickSpotlight, dateKey, MIN_STRIP_ITEMS, StripDef } from '../../components/gallery/sections';

const item = (id: string, tags: string[]): GalleryItem => ({
    id, name: id, description: '', tags, author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01',
    thumbnailId: null, thumbnailIds: [], ratingAvg: null, ratingCount: 0,
});

const strips: StripDef[] = [
    { key: 'plan', title: 'Plan', emoji: '📋', tags: ['planner', 'finance'] },
    { key: 'play', title: 'Play', emoji: '🎲', tags: ['games', 'planner'] },
];

describe('groupCatalog', () => {
    it('first strip claims a project; later strips cannot re-claim it', () => {
        const items = [item('a', ['planner']), item('b', ['planner']), item('c', ['games']), item('d', ['games'])];
        const g = groupCatalog(items, strips);
        expect(g.strips.map(s => s.def.key)).toEqual(['plan', 'play']);
        expect(g.strips[0].items.map(i => i.id)).toEqual(['a', 'b']);
        expect(g.strips[1].items.map(i => i.id)).toEqual(['c', 'd']); // not a/b again
        expect(g.leftover).toEqual([]);
    });

    it('tag matching is case-insensitive on the item side', () => {
        const g = groupCatalog([item('a', ['Planner']), item('b', ['PLANNER'])], strips);
        expect(g.strips[0]?.items.map(i => i.id)).toEqual(['a', 'b']);
    });

    it(`collapses strips with fewer than ${MIN_STRIP_ITEMS} matches into leftover`, () => {
        const items = [item('a', ['planner']), item('b', ['planner']), item('c', ['games'])];
        const g = groupCatalog(items, strips);
        expect(g.strips.map(s => s.def.key)).toEqual(['plan']); // play collapsed
        expect(g.leftover.map(i => i.id)).toEqual(['c']);
    });

    it('unmatched projects land in leftover in input (newest-first) order', () => {
        const items = [item('z', ['misc']), item('a', ['other'])];
        const g = groupCatalog(items, strips);
        expect(g.strips).toEqual([]);
        expect(g.leftover.map(i => i.id)).toEqual(['z', 'a']);
    });
});

describe('pickSpotlight', () => {
    const items = [item('a', []), item('b', []), item('c', []), item('d', []), item('e', [])];

    it('is stable for the same day key and catalog', () => {
        expect(pickSpotlight(items, '2026-08-04')).toBe(pickSpotlight(items, '2026-08-04'));
    });

    it('does not depend on catalog order', () => {
        const shuffled = [items[3], items[0], items[4], items[2], items[1]];
        expect(pickSpotlight(shuffled, '2026-08-04')?.id).toBe(pickSpotlight(items, '2026-08-04')?.id);
    });

    it('varies across days', () => {
        const picks = new Set(
            ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
             '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']
                .map(k => pickSpotlight(items, k)?.id));
        expect(picks.size).toBeGreaterThan(1);
    });

    it('returns null on an empty catalog', () => {
        expect(pickSpotlight([], '2026-08-04')).toBeNull();
    });
});

describe('dateKey', () => {
    it('formats YYYY-MM-DD', () => {
        expect(dateKey(new Date('2026-08-04T15:30:00Z'))).toBe('2026-08-04');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/gallerySections.test.ts`
Expected: FAIL — module `components/gallery/sections` does not exist.

- [ ] **Step 3: Implement**

Create `components/gallery/sections.ts`:

```ts
import { GalleryItem } from '../../services/cloudApi';

export interface StripDef { key: string; title: string; emoji: string; tags: string[]; }

// Curated use-case strips. A strip's tags are the publishing convention for the
// flagship samples — publish flagships with tags from this list so they land in
// the intended strip. First strip to claim a project wins.
export const STRIPS: StripDef[] = [
    { key: 'plan', title: 'Plan & organize', emoji: '📋', tags: ['planner', 'planning', 'organization', 'productivity', 'finance', 'business'] },
    { key: 'track', title: 'Track & improve', emoji: '📈', tags: ['tracker', 'habits', 'fitness', 'wellness', 'learning', 'practice'] },
    { key: 'create', title: 'Create & reflect', emoji: '✍️', tags: ['journal', 'writing', 'creative', 'recipes', 'family'] },
    { key: 'play', title: 'Play & explore', emoji: '🎲', tags: ['games', 'adventure', 'travel', 'hobby', 'chess', 'astronomy'] },
];

// A one-card strip reads as broken; its matches fall through to the leftover grid.
export const MIN_STRIP_ITEMS = 2;

export interface GroupedCatalog {
    strips: { def: StripDef; items: GalleryItem[] }[];
    leftover: GalleryItem[];
}

export function groupCatalog(items: GalleryItem[], strips: StripDef[] = STRIPS): GroupedCatalog {
    const claimed = new Set<string>();
    const grouped = strips.map(def => {
        const matches = items.filter(i =>
            !claimed.has(i.id) && i.tags.some(t => def.tags.includes(t.toLowerCase())));
        matches.forEach(i => claimed.add(i.id));
        return { def, items: matches };
    });
    const kept = grouped.filter(g => g.items.length >= MIN_STRIP_ITEMS);
    const keptIds = new Set(kept.flatMap(g => g.items.map(i => i.id)));
    return { strips: kept, leftover: items.filter(i => !keptIds.has(i.id)) };
}

export function dateKey(now: Date): string {
    return now.toISOString().slice(0, 10);
}

// Deterministic daily pick: stable within a day, changes across days, and — via
// the id sort — independent of the API's result ordering. Spotlighting never
// removes a project from its strip (see spec).
export function pickSpotlight(items: GalleryItem[], key: string): GalleryItem | null {
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return sorted[hash % sorted.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/gallerySections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/gallery/sections.ts tests/unit/gallerySections.test.ts
git commit -m "feat(gallery): strip config, catalog grouping, daily spotlight pick"
```

---

### Task 3: Catalog sweep — `cloudApi.galleryAll`

**Files:**
- Modify: `services/cloudApi.ts` (add method directly after `gallery:` around line 262)
- Test: `tests/unit/cloudApiGalleryAll.test.ts`

**Interfaces:**
- Consumes: `cloudApi.gallery` (must be called as `cloudApi.gallery(...)`, not a bare local reference, so tests can spy on it).
- Produces: `cloudApi.galleryAll(maxPages?: number): Promise<GalleryItem[]>` — full public catalog, newest-first, default cap 5 pages.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cloudApiGalleryAll.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cloudApi, GalleryItem } from '../../services/cloudApi';

const item = (id: string): GalleryItem => ({
    id, name: id, description: '', tags: [], author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01',
    thumbnailId: null, thumbnailIds: [], ratingAvg: null, ratingCount: 0,
});

afterEach(() => vi.restoreAllMocks());

describe('cloudApi.galleryAll', () => {
    it('pages until hasMore is false and concatenates in order', async () => {
        const spy = vi.spyOn(cloudApi, 'gallery')
            .mockResolvedValueOnce({ items: [item('a'), item('b')], page: 0, hasMore: true })
            .mockResolvedValueOnce({ items: [item('c')], page: 1, hasMore: false });
        const all = await cloudApi.galleryAll();
        expect(all.map(i => i.id)).toEqual(['a', 'b', 'c']);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenNthCalledWith(1, { sort: 'recent', page: 0 });
        expect(spy).toHaveBeenNthCalledWith(2, { sort: 'recent', page: 1 });
    });

    it('stops at the page cap even if hasMore stays true', async () => {
        const spy = vi.spyOn(cloudApi, 'gallery')
            .mockResolvedValue({ items: [item('x')], page: 0, hasMore: true });
        const all = await cloudApi.galleryAll(3);
        expect(spy).toHaveBeenCalledTimes(3);
        expect(all).toHaveLength(3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cloudApiGalleryAll.test.ts`
Expected: FAIL — `cloudApi.galleryAll is not a function`.

- [ ] **Step 3: Implement**

In `services/cloudApi.ts`, directly after the `gallery:` method:

```ts
    // Sections view fetches the whole (small) catalog in one sweep and groups it
    // client-side. The cap is a guard for the small-catalog era, not a feature —
    // see the discoverability spec.
    galleryAll: async (maxPages = 5): Promise<GalleryItem[]> => {
        const all: GalleryItem[] = [];
        for (let page = 0; page < maxPages; page++) {
            const res = await cloudApi.gallery({ sort: 'recent', page });
            all.push(...res.items);
            if (!res.hasMore) break;
        }
        return all;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cloudApiGalleryAll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/cloudApi.ts tests/unit/cloudApiGalleryAll.test.ts
git commit -m "feat(gallery): galleryAll catalog sweep with page cap"
```

---

### Task 4: `RollingPreview` component

**Files:**
- Create: `components/gallery/RollingPreview.tsx`
- Test: `tests/unit/RollingPreview.test.tsx`

**Interfaces:**
- Consumes: `API_BASE` from `services/cloudApi` (thumbnail URLs are `${API_BASE}/api/thumbnails/${id}`), `Square` icon from `lucide-react`.
- Produces (used by Tasks 5 and 6):

```ts
export function RollingPreview(props: {
    thumbnailIds: string[];
    alt: string;
    autoPlay?: boolean;      // default false: cycle on hover only
    intervalMs?: number;     // default 700
    className?: string;      // container div
    imgClassName?: string;   // the <img>
}): JSX.Element
```

Behavior contract:
- Empty `thumbnailIds` → `Square` placeholder icon (as cards today), nothing else.
- One id → static image, no dots, no cycling.
- Cycling runs while (`autoPlay` or hovered) AND reduced-motion is off AND ids > 1; advances `index = (index + 1) % n` every `intervalMs`; mouse leave resets to 0 (hover mode only).
- When cycling first activates, all remaining images are preloaded (`new Image().src = …`) — ≤6 small WebPs.
- Dots always rendered when ids > 1: `<span role="button" aria-label="Preview page N">`; click sets that index and calls `preventDefault()`/`stopPropagation()` (cards live inside links). Under reduced motion dots are the only way pages change.
- Reduced motion read defensively: `typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/RollingPreview.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RollingPreview } from '../../components/gallery/RollingPreview';
import { API_BASE } from '../../services/cloudApi';

const setReducedMotion = (matches: boolean) => {
    (window as any).matchMedia = vi.fn().mockReturnValue({
        matches, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
};

beforeEach(() => { vi.useFakeTimers(); setReducedMotion(false); });
afterEach(() => { vi.useRealTimers(); delete (window as any).matchMedia; });

const src = () => (screen.getByRole('img') as HTMLImageElement).src;

describe('RollingPreview', () => {
    it('shows the first image and cycles on hover', () => {
        render(<RollingPreview thumbnailIds={['t1', 't2', 't3']} alt="Proj" />);
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t1`);
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t2`);
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t3`);
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toBe(`${API_BASE}/api/thumbnails/t1`); // wraps
    });

    it('resets to the first image on mouse leave', () => {
        render(<RollingPreview thumbnailIds={['t1', 't2']} alt="Proj" />);
        const el = screen.getByTestId('rolling-preview');
        fireEvent.mouseEnter(el);
        act(() => { vi.advanceTimersByTime(700); });
        expect(src()).toContain('t2');
        fireEvent.mouseLeave(el);
        expect(src()).toContain('t1');
    });

    it('single image: no dots, hover does nothing', () => {
        render(<RollingPreview thumbnailIds={['only']} alt="Proj" />);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(2100); });
        expect(src()).toContain('only');
    });

    it('empty: renders placeholder, no img', () => {
        render(<RollingPreview thumbnailIds={[]} alt="Proj" />);
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByTestId('rolling-preview')).toBeInTheDocument();
    });

    it('autoPlay cycles without hover at the given interval', () => {
        render(<RollingPreview thumbnailIds={['t1', 't2']} alt="Proj" autoPlay intervalMs={2000} />);
        act(() => { vi.advanceTimersByTime(2000); });
        expect(src()).toContain('t2');
    });

    it('reduced motion: no auto-cycling, dots step manually', () => {
        setReducedMotion(true);
        render(<RollingPreview thumbnailIds={['t1', 't2', 't3']} alt="Proj" autoPlay />);
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(src()).toContain('t1');
        fireEvent.click(screen.getByRole('button', { name: /preview page 3/i }));
        expect(src()).toContain('t3');
    });

    it('dot clicks do not bubble to a surrounding link', () => {
        const onClick = vi.fn();
        render(
            <a href="/nowhere" onClick={e => { e.preventDefault(); onClick(); }}>
                <RollingPreview thumbnailIds={['t1', 't2']} alt="Proj" />
            </a>);
        fireEvent.click(screen.getByRole('button', { name: /preview page 2/i }));
        expect(onClick).not.toHaveBeenCalled();
        expect(src()).toContain('t2');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/RollingPreview.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `components/gallery/RollingPreview.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Square } from 'lucide-react';
import { API_BASE } from '../../services/cloudApi';

const thumbUrl = (id: string) => `${API_BASE}/api/thumbnails/${id}`;

const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function RollingPreview({ thumbnailIds, alt, autoPlay = false, intervalMs = 700, className = '', imgClassName = '' }: {
    thumbnailIds: string[];
    alt: string;
    autoPlay?: boolean;
    intervalMs?: number;
    className?: string;
    imgClassName?: string;
}) {
    const [index, setIndex] = useState(0);
    const [hovered, setHovered] = useState(false);
    const preloaded = useRef(false);
    const cycling = (autoPlay || hovered) && thumbnailIds.length > 1 && !prefersReducedMotion();

    useEffect(() => {
        if (!cycling) return;
        if (!preloaded.current) {
            preloaded.current = true;
            thumbnailIds.slice(1).forEach(id => { new Image().src = thumbUrl(id); });
        }
        const t = setInterval(() => setIndex(i => (i + 1) % thumbnailIds.length), intervalMs);
        return () => clearInterval(t);
    }, [cycling, intervalMs, thumbnailIds]);

    // A deleted/re-published listing can shrink the id list under a live index.
    const safeIndex = index < thumbnailIds.length ? index : 0;

    return (
        <div data-testid="rolling-preview" className={`relative ${className}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); if (!autoPlay) setIndex(0); }}>
            {thumbnailIds.length === 0
                ? <div className="w-full h-full flex items-center justify-center"><Square size={32} className="text-slate-300" /></div>
                : <img src={thumbUrl(thumbnailIds[safeIndex])} alt={alt} loading="lazy" className={imgClassName} />}
            {thumbnailIds.length > 1 && (
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                    {thumbnailIds.map((id, i) => (
                        <span key={id} role="button" tabIndex={-1} aria-label={`Preview page ${i + 1}`}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setIndex(i); }}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === safeIndex ? 'bg-blue-500' : 'bg-slate-300/80'}`} />
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/RollingPreview.test.tsx`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add components/gallery/RollingPreview.tsx tests/unit/RollingPreview.test.tsx
git commit -m "feat(gallery): RollingPreview multi-image rollover component"
```

---

### Task 5: `ProjectCard` adopts the rollover

**Files:**
- Modify: `components/gallery/ProjectCard.tsx:13-18`
- Test: `tests/unit/ProjectCard.test.tsx` (new)

**Interfaces:**
- Consumes: `RollingPreview` (Task 4), `GalleryItem.thumbnailIds` (Task 1).
- Produces: unchanged `ProjectCard({ item, showAuthor? })` signature — all card surfaces (strips, grids) get the rollover for free.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ProjectCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectCard } from '../../components/gallery/ProjectCard';
import { GalleryItem } from '../../services/cloudApi';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const item: GalleryItem = {
    id: 'p1', name: 'Weekly Planner', description: 'desc', tags: ['planner'], author: 'maker',
    forkCount: 1, downloadCount: 2, updatedAt: '2026-01-01',
    thumbnailId: 't1', thumbnailIds: ['t1', 't2'], ratingAvg: 4.5, ratingCount: 3,
};

describe('ProjectCard', () => {
    it('cycles preview images on hover', () => {
        render(<MemoryRouter><ProjectCard item={item} /></MemoryRouter>);
        const img = screen.getByRole('img') as HTMLImageElement;
        expect(img.src).toContain('/api/thumbnails/t1');
        fireEvent.mouseEnter(screen.getByTestId('rolling-preview'));
        act(() => { vi.advanceTimersByTime(700); });
        expect((screen.getByRole('img') as HTMLImageElement).src).toContain('/api/thumbnails/t2');
    });

    it('still renders name, author, tags and counters', () => {
        render(<MemoryRouter><ProjectCard item={item} /></MemoryRouter>);
        expect(screen.getByText('Weekly Planner')).toBeInTheDocument();
        expect(screen.getByText('by maker')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'planner' })).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ProjectCard.test.tsx`
Expected: FAIL — hover does not change the image (no `rolling-preview` test id yet).

- [ ] **Step 3: Implement**

In `components/gallery/ProjectCard.tsx`, replace the thumbnail block (lines 13–18) with:

```tsx
            <div className="aspect-[3/4] bg-slate-100 overflow-hidden">
                <RollingPreview thumbnailIds={item.thumbnailIds} alt={item.name}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-200" />
            </div>
```

Add the import, drop the now-unused `Square` import:

```tsx
import { GitFork, Download } from 'lucide-react';
import { RollingPreview } from './RollingPreview';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ProjectCard.test.tsx tests/unit/GalleryPage.test.tsx tests/unit/GalleryDetailPage.test.tsx`
Expected: PASS — card consumers unaffected.

- [ ] **Step 5: Commit**

```bash
git add components/gallery/ProjectCard.tsx tests/unit/ProjectCard.test.tsx
git commit -m "feat(gallery): project cards roll through preview pages on hover"
```

---

### Task 6: `GalleryExplainer` and `Spotlight` components

**Files:**
- Create: `components/gallery/GalleryExplainer.tsx`
- Create: `components/gallery/Spotlight.tsx`
- Test: `tests/unit/GalleryExplainer.test.tsx`, `tests/unit/Spotlight.test.tsx`

**Interfaces:**
- Consumes: `useSession` from `lib/auth-client`; `RollingPreview` (Task 4); `cloudApi.galleryState`, `stageImport` from `services/importProject` (the exact open-in-editor sequence `hooks/useGalleryDetail.ts:50-58` uses); `StarRating`, `GalleryLink`.
- Produces (used by Task 7):
  - `GalleryExplainer(): JSX.Element | null` — no props; renders null when signed in or dismissed.
  - `Spotlight({ item }: { item: GalleryItem }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/GalleryExplainer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GalleryExplainer } from '../../components/gallery/GalleryExplainer';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({ useSession: () => mockUseSession() }));

beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReturnValue({ data: null });
});

describe('GalleryExplainer', () => {
    it('shows the three steps to signed-out visitors', () => {
        render(<GalleryExplainer />);
        expect(screen.getByText(/browse/i)).toBeInTheDocument();
        expect(screen.getByText(/open in editor/i)).toBeInTheDocument();
        expect(screen.getByText(/make it yours/i)).toBeInTheDocument();
    });

    it('dismiss hides it and persists across renders', () => {
        const { unmount } = render(<GalleryExplainer />);
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(screen.queryByText(/make it yours/i)).toBeNull();
        unmount();
        render(<GalleryExplainer />);
        expect(screen.queryByText(/make it yours/i)).toBeNull();
        expect(localStorage.getItem('gallery-explainer-dismissed')).toBe('1');
    });

    it('hidden when signed in', () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } } });
        render(<GalleryExplainer />);
        expect(screen.queryByText(/make it yours/i)).toBeNull();
    });
});
```

Create `tests/unit/Spotlight.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Spotlight } from '../../components/gallery/Spotlight';
import { cloudApi, GalleryItem } from '../../services/cloudApi';
import * as importProject from '../../services/importProject';

vi.mock('../../services/importProject', () => ({ stageImport: vi.fn() }));

const item: GalleryItem = {
    id: 'p1', name: 'Novel Story Studio', description: 'Plot and draft a novel.', tags: ['writing'],
    author: 'doctect', forkCount: 0, downloadCount: 5, updatedAt: '2026-01-01',
    thumbnailId: 't1', thumbnailIds: ['t1', 't2'], ratingAvg: 5, ratingCount: 3,
};

const renderIt = () => render(
    <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
            <Route path="/gallery" element={<Spotlight item={item} />} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
            <Route path="/app" element={<div>EDITOR_MARKER</div>} />
        </Routes>
    </MemoryRouter>);

beforeEach(() => vi.restoreAllMocks());

describe('Spotlight', () => {
    it('renders name, author, description and rating', () => {
        renderIt();
        expect(screen.getByText('Novel Story Studio')).toBeInTheDocument();
        expect(screen.getByText(/doctect/)).toBeInTheDocument();
        expect(screen.getByText(/plot and draft a novel/i)).toBeInTheDocument();
    });

    it('"Open in editor" stages the project state and navigates to /app', async () => {
        vi.spyOn(cloudApi, 'galleryState').mockResolvedValue({ name: 'Novel Story Studio', state: { nodes: [] } });
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
        await waitFor(() => expect(screen.getByText('EDITOR_MARKER')).toBeInTheDocument());
        expect(cloudApi.galleryState).toHaveBeenCalledWith('p1');
        expect(importProject.stageImport).toHaveBeenCalledWith({ name: 'Novel Story Studio', state: { nodes: [] } });
    });

    it('failed load shows an inline error and stays put', async () => {
        vi.spyOn(cloudApi, 'galleryState').mockRejectedValue(new Error('boom'));
        renderIt();
        fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
        expect(await screen.findByText(/could not load project/i)).toBeInTheDocument();
        expect(screen.queryByText('EDITOR_MARKER')).toBeNull();
    });

    it('"See details" links to the project', () => {
        renderIt();
        fireEvent.click(screen.getByRole('link', { name: /see details/i }));
        expect(screen.getByText('DETAIL_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/GalleryExplainer.test.tsx tests/unit/Spotlight.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

Create `components/gallery/GalleryExplainer.tsx`:

```tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useSession } from '../../lib/auth-client';

const DISMISS_KEY = 'gallery-explainer-dismissed';

const STEPS = [
    { n: '①', title: 'Browse', text: 'Real, finished document products' },
    { n: '②', title: 'Open in editor', text: 'Free, instantly, no account' },
    { n: '③', title: 'Make it yours', text: 'Edit, fork, republish' },
];

export function GalleryExplainer() {
    const { data: session } = useSession();
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
    if (session?.user || dismissed) return null;
    return (
        <div className="relative flex flex-col sm:flex-row gap-4 sm:gap-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-5 py-4 mb-6">
            {STEPS.map(s => (
                <div key={s.title} className="flex-1">
                    <div className="text-sm font-semibold text-slate-800">{s.n} {s.title}</div>
                    <div className="text-xs text-slate-500">{s.text}</div>
                </div>
            ))}
            <button aria-label="Dismiss" onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }}
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
                <X size={14} />
            </button>
        </div>
    );
}
```

Create `components/gallery/Spotlight.tsx`:

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cloudApi, GalleryItem } from '../../services/cloudApi';
import { stageImport } from '../../services/importProject';
import { GalleryLink } from './GalleryLink';
import { RollingPreview } from './RollingPreview';
import { StarRating } from './StarRating';

export function Spotlight({ item }: { item: GalleryItem }) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Same sequence as useGalleryDetail.openInEditor — anonymous clone into the local editor.
    const openInEditor = async () => {
        setBusy(true);
        try {
            const res = await cloudApi.galleryState(item.id);
            stageImport({ name: res.name, state: res.state });
            navigate('/app');
        } catch { setError('Could not load project'); setBusy(false); }
    };

    return (
        <section className="flex flex-col md:flex-row gap-6 bg-white border rounded-xl p-5 mb-8">
            <RollingPreview thumbnailIds={item.thumbnailIds} alt={item.name} autoPlay intervalMs={2000}
                className="md:w-72 aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden shrink-0"
                imgClassName="w-full h-full object-contain" />
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    <Sparkles size={12} /> In the spotlight
                </div>
                <h2 className="text-xl font-bold text-slate-900 truncate">{item.name}</h2>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    by {item.author}
                    {item.ratingCount > 0 && <StarRating value={item.ratingAvg} count={item.ratingCount} size={12} />}
                </div>
                {item.description && <p className="text-sm text-slate-600 mt-3 line-clamp-4">{item.description}</p>}
                <div className="flex items-center gap-3 mt-auto pt-4">
                    <button onClick={openInEditor} disabled={busy}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2">
                        Open in editor
                    </button>
                    <GalleryLink projectId={item.id} className="text-sm text-blue-600 hover:underline">
                        See details
                    </GalleryLink>
                    {error && <span className="text-xs text-red-600">{error}</span>}
                </div>
            </div>
        </section>
    );
}
```

Note: if `StarRating`'s `value` prop type rejects `null`, pass `item.ratingAvg ?? 0` — mirror whatever `ProjectCard.tsx:40` does (it renders `StarRating` only when `ratingCount > 0`, same guard as here).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryExplainer.test.tsx tests/unit/Spotlight.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/gallery/GalleryExplainer.tsx components/gallery/Spotlight.tsx tests/unit/GalleryExplainer.test.tsx tests/unit/Spotlight.test.tsx
git commit -m "feat(gallery): explainer strip and daily spotlight components"
```

---

### Task 7: Rewire `GalleryPage` sections mode

**Files:**
- Modify: `pages/GalleryPage.tsx`
- Modify: `tests/unit/GalleryPage.test.tsx`

**Interfaces:**
- Consumes: `cloudApi.galleryAll` (Task 3), `groupCatalog`/`pickSpotlight`/`dateKey`/`STRIPS` (Task 2), `GalleryExplainer`/`Spotlight` (Task 6), `ProjectCard` (rollover-enabled since Task 5).
- Produces: the new sections view. Filtered mode, search debounce, URL params, pagination: byte-for-byte unchanged.

- [ ] **Step 1: Update the sections-mode tests (they define the new page)**

In `tests/unit/GalleryPage.test.tsx`, delete the old sections-mode test (`'default view renders the hero, tag chips and three sections'`) and add — keeping every filtered-mode test untouched:

```tsx
const catalogItem = (id: string, name: string, tags: string[]): GalleryItem => ({
    ...mkItem(id, name), tags,
});

it('sections view: explainer, spotlight, use-case strips, leftover grid, bottom tag chips', async () => {
    vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([
        catalogItem('p1', 'Alpha Planner', ['planner']),
        catalogItem('p2', 'Beta Budget', ['finance']),
        catalogItem('p3', 'Gamma Game', ['games']),
        catalogItem('p4', 'Delta Dice', ['adventure']),
        catalogItem('p5', 'Omega Misc', ['misc']),
    ]);
    renderAt();
    // explainer (signed out by default in these tests)
    expect(await screen.findByText(/make it yours/i)).toBeInTheDocument();
    // spotlight is one of the catalog
    expect(screen.getByText(/in the spotlight/i)).toBeInTheDocument();
    // strips: plan claims p1+p2, play claims p3+p4
    expect(screen.getByRole('heading', { name: /plan & organize/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /play & explore/i })).toBeInTheDocument();
    // thin/unmatched strips absent
    expect(screen.queryByRole('heading', { name: /track & improve/i })).toBeNull();
    // leftover grid
    expect(screen.getByRole('heading', { name: /more to explore/i })).toBeInTheDocument();
    expect(screen.getByText('Omega Misc')).toBeInTheDocument();
    // old hero gone
    expect(screen.queryByText(/discover planner & notebook templates/i)).toBeNull();
    // tag chips still work (now at the bottom)
    expect(screen.getByRole('button', { name: /planner \(3\)/i })).toBeInTheDocument();
});

it('sections view: empty catalog shows the empty state', async () => {
    vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
});

it('sections view: fetch failure shows the error message', async () => {
    vi.spyOn(cloudApi, 'galleryAll').mockRejectedValue(new Error('down'));
    renderAt();
    expect(await screen.findByText(/could not load the gallery/i)).toBeInTheDocument();
});
```

Also add `vi.spyOn(cloudApi, 'galleryAll').mockResolvedValue([mkItem('p1', 'Alpha')]);` to the shared `beforeEach` so untouched tests that land on the sections view don't hit the network. Check the remaining tests: any that asserted on the old hero/sections (e.g. "See all") must be updated to the new structure; filtered-mode tests stay as-is.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/GalleryPage.test.tsx`
Expected: new sections-view tests FAIL; filtered-mode tests PASS.

- [ ] **Step 3: Implement**

Rewrite the sections half of `pages/GalleryPage.tsx` (filtered half untouched):

Remove: `SECTION_LIMIT`, `SECTIONS`, `SectionKey`, the `sections` state, the three-fetch effect, the hero band JSX (lines 124–141), and the `Star`/`Flame`/`Clock` icon imports.

Add imports:

```tsx
import { GalleryExplainer } from '../components/gallery/GalleryExplainer';
import { Spotlight } from '../components/gallery/Spotlight';
import { groupCatalog, pickSpotlight, dateKey } from '../components/gallery/sections';
```

New state + fetch + derivations:

```tsx
    const [catalog, setCatalog] = useState<GalleryItem[] | null>(null);   // sections mode; null = loading

    // Sections mode: one sweep of the whole (small) catalog, grouped client-side.
    useEffect(() => {
        if (isFiltered) return;
        setCatalog(null);
        cloudApi.galleryAll()
            .then(items => { setCatalog(items); setError(null); })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered]);

    const grouped = useMemo(() => catalog ? groupCatalog(catalog) : null, [catalog]);
    const spotlight = useMemo(() => catalog ? pickSpotlight(catalog, dateKey(new Date())) : null, [catalog]);
    const galleryEmpty = catalog !== null && catalog.length === 0;
```

(add `useMemo` to the React import.)

Sections-mode JSX (replaces the old `SECTIONS.map(...)` block inside `<main>`; the sticky search bar above `<main>` is unchanged, minus the hero band that followed it):

```tsx
                {!isFiltered ? (
                    catalog === null && !error ? <SkeletonGrid count={8} />
                    : galleryEmpty
                        ? <div className="text-sm text-slate-400 text-center py-16">Nothing here yet. Publish the first project!</div>
                        : <>
                            <GalleryExplainer />
                            {spotlight && <Spotlight item={spotlight} />}
                            {grouped?.strips.map(({ def, items: stripItems }) => (
                                <section key={def.key} className="mt-8 first:mt-2">
                                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                                        <span aria-hidden>{def.emoji}</span> {def.title}
                                    </h2>
                                    <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                                        {stripItems.map(i => <div key={i.id} className="w-44 shrink-0"><ProjectCard item={i} /></div>)}
                                    </div>
                                </section>
                            ))}
                            {grouped && grouped.leftover.length > 0 && (
                                <section className="mt-8">
                                    <h2 className="text-sm font-semibold text-slate-700 mb-3">More to explore</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {grouped.leftover.map(i => <ProjectCard key={i.id} item={i} />)}
                                    </div>
                                </section>
                            )}
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t">
                                    {tags.map(t => (
                                        <button key={t.tag} onClick={() => setParam('tag', t.tag)}
                                            className="text-xs bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 rounded-full px-3 py-1 transition-colors">
                                            {t.tag} <span className="text-slate-400">({t.count})</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                ) : (
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryPage.test.tsx tests/unit/galleryModalRouting.test.tsx tests/unit/appHeaderAdoption.test.tsx`
Expected: PASS. If `galleryModalRouting`/`appHeaderAdoption` referenced the old hero text or sections fetch, update those assertions to the new structure (they must not remove coverage — swap the anchor text they look for).

- [ ] **Step 5: Commit**

```bash
git add pages/GalleryPage.tsx tests/unit/GalleryPage.test.tsx
git commit -m "feat(gallery): sections view — explainer, spotlight, use-case strips"
```

---

### Task 8: Landing hero CTA mini-strip

**Files:**
- Create: `components/GalleryCtaStrip.tsx`
- Modify: `pages/LandingPage.tsx:72-75` (the "Explore the Gallery" `Link`)
- Test: `tests/unit/GalleryCtaStrip.test.tsx`

**Interfaces:**
- Consumes: `cloudApi.gallery({ limit: 4 })`, `API_BASE`.
- Produces: `GalleryCtaStrip(): JSX.Element | null` — a row of up to 4 tiny overlapping thumbnails; renders `null` while loading, on error, or with zero thumbnails (CTA text never affected).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/GalleryCtaStrip.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GalleryCtaStrip } from '../../components/GalleryCtaStrip';
import { cloudApi, GalleryItem } from '../../services/cloudApi';

afterEach(() => vi.restoreAllMocks());

const item = (id: string, thumb: string | null): GalleryItem => ({
    id, name: id, description: '', tags: [], author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01',
    thumbnailId: thumb, thumbnailIds: thumb ? [thumb] : [], ratingAvg: null, ratingCount: 0,
});

describe('GalleryCtaStrip', () => {
    it('renders a thumbnail per project with one', async () => {
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({
            items: [item('a', 't1'), item('b', 't2'), item('c', null)], page: 0, hasMore: false,
        });
        render(<GalleryCtaStrip />);
        await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
        expect(cloudApi.gallery).toHaveBeenCalledWith({ limit: 4 });
    });

    it('renders nothing on fetch failure', async () => {
        vi.spyOn(cloudApi, 'gallery').mockRejectedValue(new Error('down'));
        const { container } = render(<GalleryCtaStrip />);
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalled());
        expect(container.innerHTML).toBe('');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/GalleryCtaStrip.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `components/GalleryCtaStrip.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { cloudApi, GalleryItem, API_BASE } from '../services/cloudApi';

// Tiny live preview row inside the landing hero's gallery CTA. Purely decorative:
// while loading, on any error, or with no thumbnails it renders nothing at all.
export function GalleryCtaStrip() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    useEffect(() => {
        cloudApi.gallery({ limit: 4 }).then(res => setItems(res.items)).catch(() => {});
    }, []);
    const thumbs = items.filter(i => i.thumbnailId);
    if (thumbs.length === 0) return null;
    return (
        <span className="flex -space-x-2 mr-1">
            {thumbs.map(i => (
                <img key={i.id} src={`${API_BASE}/api/thumbnails/${i.thumbnailId}`} alt={i.name}
                    className="w-7 h-9 object-cover rounded border-2 border-white shadow-sm" />
            ))}
        </span>
    );
}
```

In `pages/LandingPage.tsx`, inside the gallery `Link` (line 72), before the `Image` icon:

```tsx
            <Link to="/gallery" className="flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold text-slate-700 bg-white border border-slate-200 hover:border-blue-200 hover:text-blue-600 transition-all shadow-lg shadow-slate-200/50 hover:shadow-xl hover:-translate-y-1">
              <GalleryCtaStrip />
              <Image size={20} />
              Explore the Gallery
            </Link>
```

Add the import: `import { GalleryCtaStrip } from '../components/GalleryCtaStrip';`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryCtaStrip.test.tsx` — PASS.
Then any existing landing-page tests: `npx vitest run tests/unit/ -t landing` (if LandingPage tests exist and don't mock `cloudApi.gallery`, add the same spy to their setup).

- [ ] **Step 5: Commit**

```bash
git add components/GalleryCtaStrip.tsx pages/LandingPage.tsx tests/unit/GalleryCtaStrip.test.tsx
git commit -m "feat(landing): live gallery thumbnails in the hero CTA"
```

---

### Task 9: Full-suite green + real-browser verification

**Files:**
- Create: `scratch/gallery_redesign_verify.mjs` (throwaway Playwright drive — NOT committed)
- Possibly modify: `tests/e2e/*` specs that assert on the old sections layout

**Interfaces:**
- Consumes: everything above, `npm run dev` stack (Vite + API server).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all green. Fix any straggler fixture that constructs a `GalleryItem` without `thumbnailIds` or asserts on the removed hero.

- [ ] **Step 2: e2e suite**

Run: `npm run test:e2e`
Expected: green. If a spec navigates the old sections layout ("Top rated" heading, "See all"), update its selectors to the new structure (strip headings / "More to explore") without weakening what it proves.

- [ ] **Step 3: Real-browser drive**

Write `scratch/gallery_redesign_verify.mjs` (Playwright, against the dev stack with a seeded/published pair of projects — reuse the publish flow from `scratch/listing-verify.pw.mjs` as the template for account + publish setup, publishing at least two projects with 2+ thumbnails and strip-matching tags e.g. `planner`, `games`). Verify and screenshot into `scratch/`:

1. Signed-out `/gallery`: explainer visible; dismiss it; reload → stays dismissed.
2. Spotlight present, auto-advances its preview (two screenshots ≥2 s apart differ).
3. Hover a strip card → image cycles; dots visible; mouse out → resets.
4. Strips show the published tag groupings; unmatched project sits in "More to explore".
5. Click a card → detail modal opens over the sections view (background-location regression).
6. `?tag=planner` filtered grid unchanged; sort select works; Clear filters returns to sections.
7. `page.emulateMedia({ reducedMotion: 'reduce' })` → no auto-cycling; dot click steps pages.
8. Landing page: CTA mini-strip renders real thumbnails.
9. Spotlight "Open in editor" lands in the editor with the project loaded.

- [ ] **Step 4: Commit any e2e/fixture fixes**

```bash
git add tests/
git commit -m "test(gallery): align e2e and fixtures with the sections redesign"
```

---

## Post-round note (not a task)

The `/docs` tutorials' gallery screenshots (docs-capture pipeline) will show the old layout after this ships. The anti-rot guard only catches missing images, not stale ones — regenerate the gallery-track screenshots (`node docs-capture/run.js <gallery track>`) as a follow-up round, per the docs-section memory.
