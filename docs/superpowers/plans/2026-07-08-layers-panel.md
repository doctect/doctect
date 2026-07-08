# Layers Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Photoshop-style named-layer system (Layers panel + Alt-click cycle + right-click "select under") so fully-overlapped elements are always selectable, with per-layer hide/lock/color/reorder — per `docs/superpowers/specs/2026-07-08-layers-panel-design.md`.

**Architecture:** Shape B storage — `template.elements` stays a **flat array**; layers are metadata (`PageTemplate.layers: Layer[]`) plus a `layerId` tag on each element. A new pure module `services/layers.ts` owns all layer logic (default-layer creation, idempotent tagging, the two-level `(layer.order asc, zIndex asc)` sort with hidden-layer filtering, per-layer zIndex allocation, layer add/remove/reorder). Canvas render (`components/Canvas.tsx:1429`) and PDF export (`services/pdfService.ts:853`) both switch to the shared sort/filter — thumbnails ride the PDF path for free. A new `hitTestPoint` helper (rotation-aware point-in-bounds, reusing the extracted `getElementBounds`) powers Alt-click cycling and the right-click menu. A new `components/LayersPanel.tsx` lives in the right-hand column above `PropertiesPanel`, toggled from `EditorToolbar`. Schema bumps v7→v8 with a sequential migration.

**Tech Stack:** React 19 + TypeScript + Tailwind (utility classes) + `lucide-react` icons; Vitest + `@testing-library/react` (jsdom) for client tests; Vitest `@vitest-environment node` for server tests; jsPDF for export. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-08-layers-panel-design.md` (source of truth — re-read it before starting).

## Global Constraints

- **Shape B only.** `template.elements` is always a flat array. Never nest element arrays inside layer objects.
- **`shared/diff.js` gets ZERO changes.** It diffs whole templates (`!eq(bt[tid], st[tid])`, ~line 50); layer data inside the template object rides along transparently. Do not touch diff/merge/apply logic in any task.
- **Stacking rule:** render/export order is `(layer.order asc, then element.zIndex asc)`. `zIndex` now means *within-layer* order. Elements on a layer with `visible: false` are excluded from canvas, PDF, and thumbnails ("hidden = excluded everywhere"). Locked layers still render; their elements are just not selectable/editable on canvas.
- **TypeScript optionality (deliberate):** `PageTemplate.layers?: Layer[]` and `TemplateElement.layerId?: string` are declared *optional* in `types.ts` even though every post-v8 document has them. Rationale: the same types describe pre-migration states, and the spec's own validation section mandates "no new required fields — legacy/un-migrated states must still validate". All runtime code must therefore tolerate missing `layers`/`layerId` (treat as visible/unlocked, sort key 0).
- **Every content-creating path assigns a valid `layerId`:** migration, presets (`loadPreset`), generator (`normalizeGeneratedTemplates`), new template (`handleAddTemplate`), canvas element creation (both sites), SVG import, paste, duplicate. Known trap: `services/presets.ts` stamps `CURRENT_SCHEMA_VERSION` on variants-shaped presets and `handleImportGenerated` inherits the live state's schemaVersion — both **skip** `migrateV7ToV8`, so Tasks 2–3 add explicit `ensureTemplateLayers` calls at those choke points.
- Migration is sequential (`migrateVNToVN+1`), deep-clones its input, is idempotent, preserves `zIndex` untouched, covers **all variants and the legacy flat `templates` structure**, and gets a `SCHEMA_CHANGELOG.md` entry that documents the "first cloud save after migration registers once as template modified" caveat.
- Client files are TypeScript; server files (`server/validateAppState.js`) are plain-ESM JavaScript. Follow existing style exactly (Tailwind utility classes, `lucide-react` icons, slate/blue palette, `clsx`).
- Element/layer ids follow the existing pattern: `` `layer_${Math.random().toString(36).substr(2, 9)}` ``.
- Client tests: explicit imports from `'vitest'`, `@testing-library/react` `render`/`fireEvent`; build minimal real fixtures (see `tests/unit/canvasElementSvgSanitize.test.tsx` for the house pattern of matching the REAL prop interfaces). jsdom note: `getBoundingClientRect()` returns all zeros, so at `scale: 1` canvas coords equal `clientX`/`clientY` — rely on that, never on layout.
- Server tests: first line `// @vitest-environment node` (see `tests/unit/server/validateAppState.test.js`).
- Commit style: `feat(layers): ...` / `test(layers): ...` / `docs(layers): ...`.
- **Baseline:** before Task 1, run `npx vitest run` (all green) and `npx tsc --noEmit` (clean); record the passing test count. Keep both green after every task.

---

### Task 1: Data model (`Layer`, `layerId`, `activeLayerId`) + `services/layers.ts` core helpers

**Files:**
- Modify: `types.ts` (`TemplateElement` ~line 64, `PageTemplate` ~line 120, `AppState` ~line 134)
- Create: `services/layers.ts`
- Test: `tests/unit/layers.test.ts`

**Interfaces:**
- Consumes: existing `TemplateElement`, `PageTemplate` from `types.ts`.
- Produces (every later task depends on these exact names):
  - `interface Layer { id: string; name: string; order: number; visible: boolean; locked: boolean; color?: string; collapsed?: boolean }` (in `types.ts`)
  - `PageTemplate.layers?: Layer[]`, `TemplateElement.layerId?: string`, `AppState.activeLayerId?: string`, `AppState.showLayersPanel?: boolean`
  - `createLayerId(): string`
  - `createDefaultLayer(): Layer` — `{ id, name: 'Layer 1', order: 0, visible: true, locked: false }`
  - `ensureTemplateLayers(template: PageTemplate): PageTemplate` — idempotent; returns the **same reference** when nothing needed fixing
  - `sortElementsForRender(elements: TemplateElement[], layers?: Layer[]): TemplateElement[]` — new array; two-level sort; hidden filtered
  - `resolveActiveLayerId(template: PageTemplate, activeLayerId?: string): string` — fallback = frontmost (highest `order`)
  - `nextZIndexInLayer(elements: TemplateElement[], layerId: string): number`
  - `moveElementsToLayer(elements: TemplateElement[], ids: string[], layerId: string): TemplateElement[]`
  - `getElementLabel(el: TemplateElement): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/layers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Layer, PageTemplate, TemplateElement } from '../../types';
import {
    createDefaultLayer, ensureTemplateLayers, sortElementsForRender,
    resolveActiveLayerId, nextZIndexInLayer, moveElementsToLayer, getElementLabel
} from '../../services/layers';

const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});

const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});

const makeTemplate = (elements: TemplateElement[], layers?: Layer[]): PageTemplate => ({
    id: 'page', name: 'Page', width: 500, height: 700, elements, ...(layers ? { layers } : {})
});

describe('createDefaultLayer', () => {
    it('produces a visible, unlocked "Layer 1" at order 0 with a unique id', () => {
        const a = createDefaultLayer();
        const b = createDefaultLayer();
        expect(a).toMatchObject({ name: 'Layer 1', order: 0, visible: true, locked: false });
        expect(a.id).not.toBe(b.id);
    });
});

describe('ensureTemplateLayers', () => {
    it('adds one default layer and tags every element when the template has no layers', () => {
        const tpl = makeTemplate([makeEl('a', { zIndex: 5 }), makeEl('b', { zIndex: 2 })]);
        const out = ensureTemplateLayers(tpl);
        expect(out.layers).toHaveLength(1);
        expect(out.layers![0].name).toBe('Layer 1');
        out.elements.forEach(el => expect(el.layerId).toBe(out.layers![0].id));
        // zIndex preserved untouched
        expect(out.elements.map(e => e.zIndex)).toEqual([5, 2]);
    });
    it('re-tags elements whose layerId does not exist in template.layers (lowest-order layer)', () => {
        const layers = [makeLayer('top', 1), makeLayer('bottom', 0)];
        const tpl = makeTemplate([makeEl('a', { layerId: 'ghost' }), makeEl('b', { layerId: 'top' })], layers);
        const out = ensureTemplateLayers(tpl);
        expect(out.elements.find(e => e.id === 'a')!.layerId).toBe('bottom');
        expect(out.elements.find(e => e.id === 'b')!.layerId).toBe('top');
    });
    it('is idempotent and returns the same reference when nothing needs fixing', () => {
        const first = ensureTemplateLayers(makeTemplate([makeEl('a')]));
        const second = ensureTemplateLayers(first);
        expect(second).toBe(first);
    });
});

describe('sortElementsForRender', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1), makeLayer('hidden', 2, { visible: false })];
    it('sorts by (layer.order asc, zIndex asc) and filters hidden-layer elements', () => {
        const els = [
            makeEl('f1', { layerId: 'front', zIndex: 1 }),
            makeEl('b9', { layerId: 'back', zIndex: 9 }),
            makeEl('h1', { layerId: 'hidden', zIndex: 1 }),
            makeEl('b2', { layerId: 'back', zIndex: 2 }),
        ];
        expect(sortElementsForRender(els, layers).map(e => e.id)).toEqual(['b2', 'b9', 'f1']);
    });
    it('does not mutate the input array', () => {
        const els = [makeEl('f1', { layerId: 'front', zIndex: 1 }), makeEl('b1', { layerId: 'back', zIndex: 1 })];
        const snapshot = els.map(e => e.id);
        sortElementsForRender(els, layers);
        expect(els.map(e => e.id)).toEqual(snapshot);
    });
    it('treats untagged elements and missing layers as visible with layer order 0 (legacy safety)', () => {
        const els = [makeEl('legacy', { zIndex: 3 }), makeEl('f1', { layerId: 'front', zIndex: 1 })];
        expect(sortElementsForRender(els, layers).map(e => e.id)).toEqual(['legacy', 'f1']);
        expect(sortElementsForRender(els, undefined).map(e => e.id)).toEqual(['f1', 'legacy']);
    });
});

describe('resolveActiveLayerId', () => {
    const tpl = makeTemplate([], [makeLayer('back', 0), makeLayer('front', 1)]);
    it('returns activeLayerId when it exists on the template', () => {
        expect(resolveActiveLayerId(tpl, 'back')).toBe('back');
    });
    it('falls back to the frontmost layer (highest order) when missing or stale', () => {
        expect(resolveActiveLayerId(tpl, undefined)).toBe('front');
        expect(resolveActiveLayerId(tpl, 'deleted')).toBe('front');
    });
});

describe('nextZIndexInLayer', () => {
    it('returns max zIndex within that layer + 1, ignoring other layers', () => {
        const els = [
            makeEl('a', { layerId: 'L1', zIndex: 7 }),
            makeEl('b', { layerId: 'L2', zIndex: 99 }),
        ];
        expect(nextZIndexInLayer(els, 'L1')).toBe(8);
        expect(nextZIndexInLayer(els, 'empty')).toBe(1);
    });
});

describe('moveElementsToLayer', () => {
    it('retags the given ids and stacks them on top of the target layer', () => {
        const els = [
            makeEl('a', { layerId: 'L1', zIndex: 1 }),
            makeEl('b', { layerId: 'L1', zIndex: 2 }),
            makeEl('c', { layerId: 'L2', zIndex: 5 }),
        ];
        const out = moveElementsToLayer(els, ['a', 'b'], 'L2');
        expect(out.find(e => e.id === 'a')!.layerId).toBe('L2');
        expect(out.find(e => e.id === 'a')!.zIndex).toBe(6);
        expect(out.find(e => e.id === 'b')!.zIndex).toBe(7);
        expect(out.find(e => e.id === 'c')).toEqual(els[2]); // untouched
    });
});

describe('getElementLabel', () => {
    it('uses trimmed text (truncated to 24 chars) for text elements, capitalized type otherwise', () => {
        expect(getElementLabel(makeEl('a', { type: 'text', text: '  Hello  ' }))).toBe('Hello');
        expect(getElementLabel(makeEl('b', { type: 'text', text: 'x'.repeat(40) }))).toBe('x'.repeat(24) + '…');
        expect(getElementLabel(makeEl('c', { type: 'ellipse' }))).toBe('Ellipse');
        expect(getElementLabel(makeEl('d', { type: 'text', text: '' }))).toBe('Text');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/layers.test.ts`
Expected: FAIL — `Cannot find module '../../services/layers'` (and missing `Layer` export from types).

- [ ] **Step 3: Write the implementation**

In `types.ts`, add above `PageTemplate` (~line 120):

```ts
export interface Layer {
  id: string;
  name: string;
  order: number;       // outer stacking; higher order = frontmost
  visible: boolean;    // false => excluded from canvas, PDF, and thumbnails
  locked: boolean;     // elements not selectable/editable on canvas (still rendered)
  color?: string;      // optional label chip for panel grouping
  collapsed?: boolean; // panel fold state (UI-only; safe to persist)
}
```

Add to `TemplateElement` (next to `zIndex?: number;` ~line 73):

```ts
  layerId?: string; // Layer membership (Shape B). Always present after v8 migration; optional so pre-migration states type-check.
```

Add to `PageTemplate` (after `elements`):

```ts
  layers?: Layer[]; // Layer metadata (Shape B). Always present after v8 migration; optional so pre-migration states type-check.
```

Add to `AppState` under the `// UI State` block:

```ts
  activeLayerId?: string;    // Layer new elements are created into (resolved per active template; fallback: frontmost)
  showLayersPanel?: boolean; // Layers panel visibility (toolbar toggle)
```

Create `services/layers.ts`:

```ts
import { Layer, PageTemplate, TemplateElement } from '../types';

export const createLayerId = () => `layer_${Math.random().toString(36).substr(2, 9)}`;

export const createDefaultLayer = (): Layer => ({
    id: createLayerId(),
    name: 'Layer 1',
    order: 0,
    visible: true,
    locked: false,
});

/**
 * Idempotent Shape-B repair: guarantees template.layers is a non-empty array and every
 * element carries a layerId that exists in template.layers. Untagged/dangling elements are
 * assigned to the lowest-order layer. Never touches zIndex. Returns the SAME reference when
 * nothing needed fixing (safe to call on every load without causing state churn).
 */
export function ensureTemplateLayers(template: PageTemplate): PageTemplate {
    const existing = Array.isArray(template.layers) ? template.layers : [];
    const layers = existing.length > 0 ? existing : [createDefaultLayer()];
    const layerIds = new Set(layers.map(l => l.id));
    const fallbackId = [...layers].sort((a, b) => a.order - b.order)[0].id;
    const elements = template.elements || [];
    const needsElementFix = elements.some(el => !el.layerId || !layerIds.has(el.layerId));
    if (existing.length > 0 && !needsElementFix) return template;
    return {
        ...template,
        layers,
        elements: elements.map(el =>
            el.layerId && layerIds.has(el.layerId) ? el : { ...el, layerId: fallbackId }
        ),
    };
}

/**
 * The single stacking rule for canvas render AND pdf export:
 * filter out elements on hidden layers, then sort (layer.order asc, zIndex asc).
 * Elements with a missing/unknown layerId are treated as visible with layer order 0
 * (legacy safety — pre-migration data must keep rendering).
 * Returns a NEW array (never mutates the input, unlike the old in-place `.sort`).
 */
export function sortElementsForRender(elements: TemplateElement[], layers?: Layer[]): TemplateElement[] {
    const layerMap = new Map((layers ?? []).map(l => [l.id, l]));
    const layerOf = (el: TemplateElement) => (el.layerId ? layerMap.get(el.layerId) : undefined);
    return elements
        .filter(el => (layerOf(el)?.visible ?? true) !== false)
        .sort((a, b) => {
            const orderDiff = (layerOf(a)?.order ?? 0) - (layerOf(b)?.order ?? 0);
            if (orderDiff !== 0) return orderDiff;
            return (a.zIndex || 0) - (b.zIndex || 0);
        });
}

/** The layer new elements go into: activeLayerId if it exists on this template, else the frontmost layer. */
export function resolveActiveLayerId(template: PageTemplate, activeLayerId?: string): string {
    const layers = template.layers ?? [];
    if (activeLayerId && layers.some(l => l.id === activeLayerId)) return activeLayerId;
    const frontmost = [...layers].sort((a, b) => b.order - a.order)[0];
    return frontmost ? frontmost.id : '';
}

/** Within-layer top: max zIndex among that layer's elements + 1 (empty layer -> 1). */
export function nextZIndexInLayer(elements: TemplateElement[], layerId: string): number {
    return elements.reduce((max, el) => (el.layerId === layerId ? Math.max(max, el.zIndex || 0) : max), 0) + 1;
}

/** Reassign the given element ids to layerId, placing them (in order) on top of that layer. */
export function moveElementsToLayer(elements: TemplateElement[], ids: string[], layerId: string): TemplateElement[] {
    let z = nextZIndexInLayer(elements, layerId);
    return elements.map(el => (ids.includes(el.id) ? { ...el, layerId, zIndex: z++ } : el));
}

/** Display label for panel/menu rows: element text (trimmed, max 24 chars) or capitalized type. */
export function getElementLabel(el: TemplateElement): string {
    if (el.type === 'text' && el.text && el.text.trim()) {
        const t = el.text.trim();
        return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    }
    return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/layers.test.ts && npx tsc --noEmit`
Expected: all tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add types.ts services/layers.ts tests/unit/layers.test.ts
git commit -m "feat(layers): Layer data model + shared layer helpers (Shape B)"
```

---

### Task 2: Migration v7 → v8 + `SCHEMA_CHANGELOG.md` + preset belt-and-suspenders

**Files:**
- Modify: `services/migration.ts` (bump `CURRENT_SCHEMA_VERSION` line 19; add `migrateV7ToV8`; add the `if (version < 8)` step in `migrateState`)
- Modify: `services/presets.ts` (`loadPreset`, the `return migrateState(baseState)` at ~line 116)
- Modify: `SCHEMA_CHANGELOG.md` (new Version 8 entry at the top)
- Test: `tests/unit/migration.test.ts` (new file)

**Interfaces:**
- Consumes: `ensureTemplateLayers` from `services/layers.ts` (Task 1).
- Produces: `CURRENT_SCHEMA_VERSION === 8`; `migrateState` output where every template (all variants + legacy flat `templates`) has `layers` (exactly one default `"Layer 1"` for pre-v8 docs) and every element has a valid `layerId`; presets (`createBlankProject` etc.) come out layer-tagged.

**Why presets need an explicit call:** `loadPreset` stamps `baseState.schemaVersion = CURRENT_SCHEMA_VERSION` for variants-shaped preset data (services/presets.ts, just above the `migrateState` call), which makes `migrateState` a no-op — the v7→v8 migration never runs on them. Spec's belt-and-suspenders clause covers this: apply `ensureTemplateLayers` directly after migration.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../../services/migration';
import { createBlankProject, createNotebookProject, createPlannerProject } from '../../services/presets';

const el = (id: string, zIndex?: number) => ({
    id, type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1,
    ...(zIndex !== undefined ? { zIndex } : {})
});

const v7State = () => ({
    schemaVersion: 7,
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [el('a', 5), el('b')] },
        } },
        tablet: { id: 'tablet', name: 'Tablet', templates: {
            page: { id: 'page', name: 'Page', width: 800, height: 600, elements: [el('c', 2)] },
        } },
    },
});

describe('migrateV7ToV8', () => {
    it('bumps CURRENT_SCHEMA_VERSION to 8', () => {
        expect(CURRENT_SCHEMA_VERSION).toBe(8);
    });

    it('creates exactly one default "Layer 1" per template across all variants and tags every element', () => {
        const out: any = migrateState(v7State());
        expect(out.schemaVersion).toBe(8);
        for (const variant of Object.values<any>(out.variants)) {
            for (const tpl of Object.values<any>(variant.templates)) {
                expect(tpl.layers).toHaveLength(1);
                expect(tpl.layers[0]).toMatchObject({ name: 'Layer 1', order: 0, visible: true, locked: false });
                tpl.elements.forEach((e: any) => expect(e.layerId).toBe(tpl.layers[0].id));
            }
        }
    });

    it('preserves zIndex values untouched (migrated document renders identically)', () => {
        const out: any = migrateState(v7State());
        const els = out.variants.default.templates.page.elements;
        expect(els.find((e: any) => e.id === 'a').zIndex).toBe(5);
        expect(els.find((e: any) => e.id === 'b').zIndex).toBeUndefined();
    });

    it('covers the legacy flat templates structure (pre-v4 states)', () => {
        const legacy: any = {
            schemaVersion: 3,
            nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
            rootId: 'root',
            templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [el('a', 1)] } },
        };
        const out: any = migrateState(legacy);
        expect(out.schemaVersion).toBe(8);
        const tpl = out.variants.default.templates.page;
        expect(tpl.layers).toHaveLength(1);
        expect(tpl.elements[0].layerId).toBe(tpl.layers[0].id);
    });

    it('is idempotent (re-running the transform changes nothing, keeps the same layer ids)', () => {
        const once: any = migrateState(v7State());
        const rerun: any = migrateState({ ...JSON.parse(JSON.stringify(once)), schemaVersion: 7 });
        expect(rerun.variants).toEqual(once.variants);
    });

    it('does not mutate its input', () => {
        const input = v7State();
        const snapshot = JSON.parse(JSON.stringify(input));
        migrateState(input);
        expect(input).toEqual(snapshot);
    });
});

describe('presets are layer-tagged (belt-and-suspenders)', () => {
    it.each([
        ['blank', createBlankProject],
        ['notebook', createNotebookProject],
        ['planner', createPlannerProject],
    ])('%s preset: every template has layers and every element a valid layerId', (_name, create) => {
        const state = create();
        for (const variant of Object.values(state.variants)) {
            for (const tpl of Object.values(variant.templates)) {
                expect(tpl.layers && tpl.layers.length).toBeGreaterThan(0);
                const ids = new Set(tpl.layers!.map(l => l.id));
                tpl.elements.forEach(e => expect(ids.has(e.layerId!)).toBe(true));
            }
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/migration.test.ts`
Expected: FAIL — `CURRENT_SCHEMA_VERSION` is 7, templates have no `layers`.

- [ ] **Step 3: Write the implementation**

In `services/migration.ts`:

1. Line 14: `import { AppState } from '../types';` → add below it: `import { ensureTemplateLayers } from './layers';`
2. Line 19: `export const CURRENT_SCHEMA_VERSION = 7;` → `= 8;`
3. In `migrateState`, after the `if (version < 7)` block:

```ts
    if (version < 8) {
        migratedState = migrateV7ToV8(migratedState);
        version = 8;
    }
```

4. Append after `migrateV6ToV7` (follow the existing doc-comment style):

```ts
/**
 * Migration v7 → v8
 *
 * Changes:
 * - Adds the named-layer system (Shape B): `PageTemplate.layers: Layer[]` plus a
 *   `layerId` tag on every `TemplateElement`. Elements stay in a flat array.
 * - Every template (across all variants AND the legacy flat `templates` structure)
 *   gets a single default layer { name: "Layer 1", order: 0, visible: true, locked: false }
 *   and all its elements are tagged with that layer's id.
 * - zIndex values are preserved untouched (it now means within-layer stacking, and with a
 *   single layer the migrated document renders identically). Idempotent.
 */
function migrateV7ToV8(state: any): any {
    console.log('[Migration] Applying v7 → v8: Adding layer system (default "Layer 1" per template)');
    const migrated = JSON.parse(JSON.stringify(state));

    const migrateTemplates = (templates: any) => {
        if (!templates || typeof templates !== 'object') return;
        Object.keys(templates).forEach(templateId => {
            const tpl = templates[templateId];
            if (tpl && typeof tpl === 'object') {
                templates[templateId] = ensureTemplateLayers(tpl);
            }
        });
    };

    // Migrate across all variants
    if (migrated.variants) {
        Object.values(migrated.variants).forEach((variant: any) => migrateTemplates(variant?.templates));
    }
    // Also handle legacy flat templates structure
    migrateTemplates(migrated.templates);

    migrated.schemaVersion = 8;
    return migrated;
}
```

In `services/presets.ts`, replace the end of `loadPreset` (`return migrateState(baseState);`) with:

```ts
    // Migrate to ensure all elements have required fields
    const migrated = migrateState(baseState);

    // Belt-and-suspenders (spec §Migration): variants-shaped presets are stamped
    // CURRENT_SCHEMA_VERSION above, which skips migrateV7ToV8 — ensure layer tagging directly.
    Object.values(migrated.variants).forEach(variant => {
        Object.keys(variant.templates).forEach(tid => {
            variant.templates[tid] = ensureTemplateLayers(variant.templates[tid]);
        });
    });
    return migrated;
```

and add `import { ensureTemplateLayers } from './layers';` to its imports.

Prepend to `SCHEMA_CHANGELOG.md` (below the intro, above `## Version 3`… i.e. as the new topmost version entry, matching the existing entry format):

```markdown
## Version 8
**Date:** 2026-07-08

### Changes
- Added `Layer` interface and `layers: Layer[]` to `PageTemplate`
- Added `layerId: string` to `TemplateElement`
- Added `activeLayerId?: string` (UI state) to `AppState`

### Purpose
Named-layer system (Layers panel). Elements stay in a flat array (Shape B); layers are
template metadata plus a per-element tag. Render/export order is now
(layer.order asc, then zIndex asc); `zIndex` means within-layer stacking. Layers with
`visible: false` are excluded from canvas, PDF export, and thumbnails.

### Migration Notes
- Every template (all variants + legacy flat `templates`) gets one default layer
  `{ name: "Layer 1", order: 0, visible: true, locked: false }`; all its elements are tagged
  with it. `zIndex` values are preserved untouched, so migrated documents render identically.
  The migration is idempotent.
- **Known caveat:** the first cloud save after migration rewrites each template (it now carries
  `layers` and per-element `layerId`), so it registers once as a "template modified" entry in
  version history / merge diffs. Expected and harmless — not a bug.
- Diff/merge engine (`shared/diff.js`) needs no changes: it compares whole templates, so layer
  data rides along transparently.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/migration.test.ts tests/unit/layers.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. Then run the full suite: `npx vitest run` — must stay at/above the baseline count.

- [ ] **Step 5: Commit**

```bash
git add services/migration.ts services/presets.ts SCHEMA_CHANGELOG.md tests/unit/migration.test.ts
git commit -m "feat(layers): v7->v8 migration - default layer per template, tag all elements"
```

---

### Task 3: Every content-creating path assigns a valid `layerId`

**Files:**
- Modify: `services/generatorTemplates.ts` (`normalizeFlatTemplates`, ~line 16)
- Modify: `components/Canvas.tsx` (new-element creation: click-create text ~line 1209–1235, drag-create ~line 1248 onward; `CanvasProps` ~line 10)
- Modify: `components/ProjectEditor.tsx` (`handleDuplicate` ~line 444, `handlePaste` ~line 472, `handleAddTemplate` ~line 638, `handleImportSvg` new element ~line 720; pass `activeLayerId` to `<Canvas>` ~line 1181)
- Create: `tests/unit/canvasTestUtils.tsx` (shared canvas fixtures — imported by the test files of Tasks 3, 4, 7, 8; a plain helper module, NOT a test file, so importing it never re-runs anyone's tests)
- Test: `tests/unit/generatorTemplates.test.ts` (extend), `tests/unit/canvasLayers.test.tsx` (new file — Tasks 4 & 7 append to it)

**Interfaces:**
- Consumes: `resolveActiveLayerId`, `nextZIndexInLayer`, `ensureTemplateLayers`, `createDefaultLayer` from `services/layers.ts`.
- Produces: `CanvasProps` gains `activeLayerId?: string`. All newly created elements carry `layerId` + a within-layer `zIndex`; all newly created templates carry `layers`. (Generator output covers `handleImportGenerated` too, because `HierarchyGeneratorModal` runs everything through `normalizeGeneratedTemplates` before `onImport`, and the legacy-templates path forces a full migration via `schemaVersion = 3`.)

- [ ] **Step 1: Write the failing tests**

Extend `tests/unit/generatorTemplates.test.ts` with a new describe block (keep existing tests untouched):

```ts
describe('normalizeGeneratedTemplates layer tagging', () => {
    const rawTpl = {
        id: 'day', name: 'Day', width: 500, height: 700,
        elements: [{ type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, fill: '#fff', stroke: '', strokeWidth: 0, opacity: 1 }]
    };

    it('gives flat-map templates a default layer and tags every element', () => {
        const { templates } = normalizeGeneratedTemplates({ day: rawTpl });
        const tpl = templates!['day'];
        expect(tpl.layers).toHaveLength(1);
        expect(tpl.elements[0].layerId).toBe(tpl.layers![0].id);
    });

    it('gives variants-shaped templates a default layer and tags every element', () => {
        const raw = { variants: { v1: { id: 'v1', name: 'V1', templates: { day: rawTpl } } }, activeVariantId: 'v1' };
        const { variants } = normalizeGeneratedTemplates(raw);
        const tpl = variants!['v1'].templates['day'];
        expect(tpl.layers).toHaveLength(1);
        expect(tpl.elements[0].layerId).toBe(tpl.layers![0].id);
    });
});
```

(Import `normalizeGeneratedTemplates` is already in that file; if the describe needs it, it is.)

Create `tests/unit/canvasTestUtils.tsx` (shared fixtures — written once, here):

```tsx
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '../../components/Canvas';
import { AppNode, Layer, PageTemplate, TemplateElement } from '../../types';

// jsdom: getBoundingClientRect() is all zeros, so at scale 1 canvas coords == clientX/clientY.
export const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});

export const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});

const nodes: Record<string, AppNode> = {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
};

export const renderCanvas = (elements: TemplateElement[], layers: Layer[], extra: Record<string, any> = {}) => {
    const template: PageTemplate = { id: 'page', name: 'Page', width: 500, height: 700, elements, layers };
    const onUpdateElements = vi.fn();
    const onSelectElements = vi.fn();
    const utils = render(
        <Canvas
            template={template}
            elements={elements}
            selectedElementIds={[]}
            scale={1}
            tool="select"
            nodes={nodes}
            currentNodeId="root"
            snapToGrid={false}
            showGrid={false}
            onUpdateElements={onUpdateElements}
            onSelectElements={onSelectElements}
            onZoom={vi.fn()}
            onInteractionStart={vi.fn()}
            {...extra}
        />
    );
    const outer = utils.container.querySelector('.canvas-scroll-container') as HTMLElement;
    return { ...utils, outer, onUpdateElements, onSelectElements };
};
```

Create `tests/unit/canvasLayers.test.tsx` with the creation tests (Tasks 4 and 7 append to this file):

```tsx
import { describe, it, expect } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { TemplateElement } from '../../types';
import { renderCanvas, makeEl, makeLayer } from './canvasTestUtils';

describe('element creation assigns the active layer', () => {
    it('drag-created elements get activeLayerId and a within-layer zIndex', () => {
        const layers = [makeLayer('back', 0), makeLayer('front', 1)];
        const existing = [makeEl('a', { layerId: 'front', zIndex: 3 }), makeEl('b', { layerId: 'back', zIndex: 9 })];
        const { outer, onUpdateElements } = renderCanvas(existing, layers, { tool: 'rect', activeLayerId: 'front' });

        fireEvent.mouseDown(outer, { clientX: 200, clientY: 200, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 300, clientY: 300 });
        fireEvent.mouseUp(outer, { clientX: 300, clientY: 300 });

        expect(onUpdateElements).toHaveBeenCalled();
        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        const created = updated.find(e => !['a', 'b'].includes(e.id))!;
        expect(created.layerId).toBe('front');
        expect(created.zIndex).toBe(4); // top of 'front' (3+1), NOT template-wide max (9)+1
    });

    it('falls back to the frontmost layer when activeLayerId is stale', () => {
        const layers = [makeLayer('back', 0), makeLayer('front', 1)];
        const { outer, onUpdateElements } = renderCanvas([], layers, { tool: 'rect', activeLayerId: 'deleted' });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0 });
        fireEvent.mouseMove(outer, { clientX: 150, clientY: 150 });
        fireEvent.mouseUp(outer, { clientX: 150, clientY: 150 });
        const updated: TemplateElement[] = onUpdateElements.mock.calls.at(-1)![0];
        expect(updated[0].layerId).toBe('front');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/generatorTemplates.test.ts tests/unit/canvasLayers.test.tsx`
Expected: FAIL — no `layers` on normalized templates; created element has no `layerId` and `zIndex` 10.

- [ ] **Step 3: Write the implementation**

**`services/generatorTemplates.ts`** — add `import { ensureTemplateLayers } from './layers';` and change `normalizeFlatTemplates` line `normalized[tpl.id] = autoIdElements(tpl);` to:

```ts
        normalized[tpl.id] = ensureTemplateLayers(autoIdElements(tpl));
```

**`components/Canvas.tsx`:**

1. Imports: `import { resolveActiveLayerId, nextZIndexInLayer, sortElementsForRender } from '../services/layers';` (the third is used in Task 4 — importing now is fine, or defer; keep only what compiles without unused-import warnings: import `resolveActiveLayerId, nextZIndexInLayer` now).
2. `CanvasProps` (~line 10): add `activeLayerId?: string;` and destructure it in the component.
3. Click-create text site (~line 1209): replace

```ts
                    const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
```

with

```ts
                    const layerId = resolveActiveLayerId(template, activeLayerId);
```

and in the `newEl` literal replace `zIndex: maxZ + 1,` with:

```ts
                        zIndex: nextZIndexInLayer(elements, layerId),
                        layerId,
```

4. Drag-create site (~line 1248): replace

```ts
            const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
```

with

```ts
            const layerId = resolveActiveLayerId(template, activeLayerId);
```

and where that element literal sets `zIndex: maxZ + 1` (search the following ~60 lines for the single remaining `maxZ` use), set:

```ts
            zIndex: nextZIndexInLayer(elements, layerId),
            layerId,
```

**`components/ProjectEditor.tsx`:**

1. Imports: `import { resolveActiveLayerId, nextZIndexInLayer, createDefaultLayer } from '../services/layers';`
2. `<Canvas>` call site (~line 1181): add `activeLayerId={state.activeLayerId}`.
3. `handleDuplicate` (~line 444) — duplicates stay on their original's layer, stacked on top of it. Replace the loop body's element construction:

```ts
        state.selectedElementIds.forEach(id => {
            const original = template.elements.find(e => e.id === id);
            if (original) {
                const newId = Math.random().toString(36).substr(2, 9);
                const layerId = (original.layerId && template.layers?.some(l => l.id === original.layerId))
                    ? original.layerId
                    : resolveActiveLayerId(template, state.activeLayerId);
                newIds.push(newId);
                newElements.push({
                    ...JSON.parse(JSON.stringify(original)),
                    id: newId,
                    x: original.x + 20,
                    y: original.y + 20,
                    layerId,
                    zIndex: nextZIndexInLayer([...template.elements, ...newElements], layerId)
                });
            }
        });
```

4. `handlePaste` (~line 472) — clipboard items may come from another template whose layer ids do not exist here; fall back to the active layer. Replace the loop:

```ts
        state.clipboard.forEach(item => {
            const newId = Math.random().toString(36).substr(2, 9);
            const layerId = (item.layerId && template.layers?.some(l => l.id === item.layerId))
                ? item.layerId
                : resolveActiveLayerId(template, state.activeLayerId);
            newIds.push(newId);
            newElements.push({
                ...JSON.parse(JSON.stringify(item)),
                id: newId,
                x: item.x + offset,
                y: item.y + offset,
                layerId,
                zIndex: nextZIndexInLayer([...template.elements, ...newElements], layerId)
            });
        });
```

5. `handleAddTemplate` (~line 641):

```ts
        const newTemplate: PageTemplate = { id: newId, name: 'New Template', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [], layers: [createDefaultLayer()] };
```

6. `handleImportSvg` — inside the `setState(prev => { ... })` where `updatedTemplate` is built (~line 740), the imported element currently has **no zIndex at all**; tag it there (the template is in scope as `tpl`):

```ts
                const layerId = resolveActiveLayerId(tpl, prev.activeLayerId);
                const placedElement = { ...newElement, layerId, zIndex: nextZIndexInLayer(tpl.elements, layerId) };
                const updatedTemplate = { ...tpl, elements: [...tpl.elements, placedElement] };
```

(keep `selectedElementIds: [newElement.id]` — the id is unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/generatorTemplates.test.ts tests/unit/canvasLayers.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add services/generatorTemplates.ts components/Canvas.tsx components/ProjectEditor.tsx tests/unit/generatorTemplates.test.ts tests/unit/canvasTestUtils.tsx tests/unit/canvasLayers.test.tsx
git commit -m "feat(layers): all content-creating paths assign layerId + within-layer zIndex"
```

---

### Task 4: Canvas render — two-level sort + hidden-layer exclusion

**Files:**
- Modify: `components/Canvas.tsx:1429` (the render sort)
- Test: `tests/unit/canvasLayers.test.tsx` (extend)

**Interfaces:**
- Consumes: `sortElementsForRender(elements, layers)` from Task 1; `renderCanvas`/`makeEl`/`makeLayer` fixtures from `tests/unit/canvasTestUtils.tsx` (Task 3).
- Produces: canvas DOM order = `(layer.order asc, zIndex asc)`; hidden-layer elements absent from the DOM.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/canvasLayers.test.tsx`:

```tsx
describe('canvas render order and hidden-layer exclusion', () => {
    it('renders (layer.order asc, zIndex asc) and omits elements on hidden layers', () => {
        const layers = [
            makeLayer('back', 0),
            makeLayer('front', 1),
            makeLayer('hidden', 2, { visible: false }),
        ];
        const elements = [
            makeEl('f1', { layerId: 'front', zIndex: 1 }),
            makeEl('b9', { layerId: 'back', zIndex: 9 }),
            makeEl('h1', { layerId: 'hidden', zIndex: 1 }),
            makeEl('b2', { layerId: 'back', zIndex: 2 }),
        ];
        const { container } = renderCanvas(elements, layers);
        const ids = Array.from(container.querySelectorAll('[data-element-id]'))
            .map(n => n.getAttribute('data-element-id'));
        expect(ids).toEqual(['b2', 'b9', 'f1']); // no h1; back layer before front
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/canvasLayers.test.tsx`
Expected: FAIL — `h1` present, order is plain-zIndex (`['f1','b2','b9','h1']`).

- [ ] **Step 3: Write minimal implementation**

`components/Canvas.tsx` line 1429 — replace

```tsx
                        {elements.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map(el => (
```

with

```tsx
                        {sortElementsForRender(elements, template.layers).map(el => (
```

(add `sortElementsForRender` to the `services/layers` import). Note this also stops mutating the `elements` prop in place, which the old `.sort` did.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/canvasLayers.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/Canvas.tsx tests/unit/canvasLayers.test.tsx
git commit -m "feat(layers): canvas renders (layer.order, zIndex) and excludes hidden layers"
```

---

### Task 5: PDF export — two-level sort + hidden-layer exclusion (thumbnails inherit)

**Files:**
- Modify: `services/pdfService.ts:853` (the export sort)
- Test: `tests/unit/pdfLayers.test.ts` (new file)

**Interfaces:**
- Consumes: `sortElementsForRender` from Task 1; `generatePDF(state, { output: 'arraybuffer' })` (existing, `services/pdfService.ts:745`).
- Produces: PDF element draw order = `(layer.order asc, zIndex asc)`; hidden-layer elements never drawn. **No change to `services/thumbnailService.ts`** — it calls `generatePDF(state, { variantId, output: 'arraybuffer' })`, so gallery thumbnails inherit the exclusion automatically (assert this understanding with a code comment only, not code).

**Test technique:** jsPDF here is created without `compress`, so page content streams are plain text in the output bytes — text drawn via `doc.text` appears literally (e.g. `(VISIBLE_TOP)`). Decode the arraybuffer as latin1 and assert on substring presence/relative position. This tests the *real* export path, not a mock.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pdfLayers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

const textEl = (id: string, text: string, layerId: string, zIndex: number) => ({
    id, type: 'text' as const, x: 20, y: 20 + zIndex * 30, w: 200, h: 24, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1,
    text, fontSize: 14, fontFamily: 'helvetica', textColor: '#000000',
    layerId, zIndex,
});

const state: AppState = {
    schemaVersion: 8,
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: {
            id: 'default', name: 'Default',
            templates: {
                page: {
                    id: 'page', name: 'Page', width: 500, height: 700,
                    layers: [
                        { id: 'back', name: 'Back', order: 0, visible: true, locked: false },
                        { id: 'front', name: 'Front', order: 1, visible: true, locked: false },
                        { id: 'ghost', name: 'Ghost', order: 2, visible: false, locked: false },
                    ],
                    elements: [
                        textEl('t-front', 'FRONTLAYERTEXT', 'front', 1),
                        textEl('t-hidden', 'HIDDENLAYERTEXT', 'ghost', 1),
                        textEl('t-back', 'BACKLAYERTEXT', 'back', 9),
                    ],
                },
            },
        },
    },
    viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
    selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
    scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [],
};

describe('PDF export layer handling', () => {
    it('excludes hidden-layer elements and draws back layers before front layers', async () => {
        const buf = (await generatePDF(state, { output: 'arraybuffer' })) as ArrayBuffer;
        const pdf = new TextDecoder('latin1').decode(new Uint8Array(buf));

        expect(pdf).toContain('FRONTLAYERTEXT');
        expect(pdf).toContain('BACKLAYERTEXT');
        expect(pdf).not.toContain('HIDDENLAYERTEXT');
        // back layer (order 0, even with zIndex 9) is drawn BEFORE front layer (order 1, zIndex 1)
        expect(pdf.indexOf('BACKLAYERTEXT')).toBeLessThan(pdf.indexOf('FRONTLAYERTEXT'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pdfLayers.test.ts`
Expected: FAIL — `HIDDENLAYERTEXT` is present, and `FRONTLAYERTEXT` (zIndex 1) precedes `BACKLAYERTEXT` (zIndex 9).

- [ ] **Step 3: Write minimal implementation**

`services/pdfService.ts` line 853 — replace

```ts
        const sortedElements = [...template.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
```

with

```ts
        // Two-level stacking (layer.order asc, zIndex asc) + hidden-layer exclusion.
        // Thumbnails (services/thumbnailService.ts) render via generatePDF, so they inherit this.
        const sortedElements = sortElementsForRender(template.elements, template.layers);
```

and add `import { sortElementsForRender } from './layers';` to the imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/pdfLayers.test.ts && npx tsc --noEmit`
Expected: PASS. (If the failure in Step 2 was instead a fixture problem — e.g. `computePageOrder` yields no pages — fix the fixture first until you see the two *behavioral* failures, then implement.)

- [ ] **Step 5: Commit**

```bash
git add services/pdfService.ts tests/unit/pdfLayers.test.ts
git commit -m "feat(layers): PDF export uses two-level layer sort, hidden layers excluded (thumbnails inherit)"
```

---

### Task 6: Shared `getElementBounds` extraction + `hitTestPoint`

**Files:**
- Create: `components/canvas/elementBounds.ts` (extract from `components/canvas/CanvasElement.tsx:283` + its `traverseGridData` at ~line 77)
- Modify: `components/canvas/CanvasElement.tsx` (delete the local copies, import instead)
- Create: `services/hitTest.ts`
- Test: `tests/unit/hitTest.test.ts` (new file)

**Interfaces:**
- Consumes: `sortElementsForRender` (Task 1).
- Produces:
  - `getElementBounds(el: TemplateElement, nodes: Record<string, AppNode>, currentNodeId: string): { w: number; h: number }` (same math as today's closure version; grids expand to their full rendered size)
  - `hitTestPoint(point: { x: number; y: number }, elements: TemplateElement[], layers: Layer[] | undefined, nodes: Record<string, AppNode>, currentNodeId: string): TemplateElement[]` — the stack under the point, **top→bottom**, on **visible + unlocked** layers only, rotation-aware. (Signature carries `nodes`/`currentNodeId` beyond the spec's sketch because `getElementBounds` needs them for grid elements — the spec mandates reusing `getElementBounds`.)

**Extraction rule:** this is a *move*, not a rewrite. Copy `traverseGridData` and `getElementBounds` verbatim from `CanvasElement.tsx`, changing only the closure captures (`nodes`, `currentNodeId`) into parameters. In `CanvasElement.tsx`, delete both local definitions and call `getElementBounds(el, nodes, currentNodeId)` at the two use sites (~lines 301/365 pre-edit). Leave `Canvas.tsx`'s own private `traverseGridData` copy alone (out of scope). The existing `tests/unit/canvasElementSvgSanitize.test.tsx` must still pass — it is the regression guard for the refactor.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/hitTest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hitTestPoint } from '../../services/hitTest';
import { getElementBounds } from '../../components/canvas/elementBounds';
import { AppNode, Layer, TemplateElement } from '../../types';

const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});
const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});
const nodes: Record<string, AppNode> = {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
};

describe('getElementBounds (extracted)', () => {
    it('returns w/h for plain elements', () => {
        expect(getElementBounds(makeEl('a', { w: 40, h: 30 }), nodes, 'root')).toEqual({ w: 40, h: 30 });
    });
});

describe('hitTestPoint', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];

    it('returns the stack under the point ordered top -> bottom', () => {
        const els = [
            makeEl('bottom', { layerId: 'back', zIndex: 1 }),
            makeEl('middle', { layerId: 'back', zIndex: 2 }),
            makeEl('top', { layerId: 'front', zIndex: 1 }),
            makeEl('elsewhere', { layerId: 'front', x: 500, y: 500 }),
        ];
        expect(hitTestPoint({ x: 50, y: 50 }, els, layers, nodes, 'root').map(e => e.id))
            .toEqual(['top', 'middle', 'bottom']);
    });

    it('is rotation-aware (point inside the rotated box, outside the AABB corner)', () => {
        // 100x20 bar centered at (50,50), rotated 90deg: occupies x 40..60, y 0..100
        const bar = makeEl('bar', { x: 0, y: 40, w: 100, h: 20, rotation: 90, layerId: 'back' });
        expect(hitTestPoint({ x: 50, y: 5 }, [bar], layers, nodes, 'root').map(e => e.id)).toEqual(['bar']);
        expect(hitTestPoint({ x: 5, y: 45 }, [bar], layers, nodes, 'root')).toEqual([]); // inside unrotated box, outside rotated
    });

    it('excludes elements on hidden and locked layers', () => {
        const specialLayers = [
            makeLayer('ok', 0),
            makeLayer('hid', 1, { visible: false }),
            makeLayer('lock', 2, { locked: true }),
        ];
        const els = [
            makeEl('visible', { layerId: 'ok' }),
            makeEl('hiddenEl', { layerId: 'hid' }),
            makeEl('lockedEl', { layerId: 'lock' }),
        ];
        expect(hitTestPoint({ x: 50, y: 50 }, els, specialLayers, nodes, 'root').map(e => e.id))
            .toEqual(['visible']);
    });

    it('treats untagged elements as hittable (legacy safety)', () => {
        expect(hitTestPoint({ x: 50, y: 50 }, [makeEl('legacy')], layers, nodes, 'root').map(e => e.id))
            .toEqual(['legacy']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/hitTest.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Write the implementation**

Create `components/canvas/elementBounds.ts` — move `traverseGridData` (CanvasElement.tsx ~line 77) and `getElementBounds` (~line 283) here **verbatim**, with signatures:

```ts
import { AppNode, TemplateElement, TraversalStep } from '../../types';

export const traverseGridData = (
    currentNodes: string[],
    steps: TraversalStep[],
    depth: number,
    nodes: Record<string, AppNode>
): string[] => {
    /* body copied unchanged from CanvasElement.tsx */
};

export const getElementBounds = (
    el: TemplateElement,
    nodes: Record<string, AppNode>,
    currentNodeId: string
): { w: number; h: number } => {
    /* body copied unchanged from CanvasElement.tsx's closure version —
       the only edits are that `nodes` and `currentNodeId` are now parameters */
};
```

In `components/canvas/CanvasElement.tsx`: delete the local `traverseGridData` and `getElementBounds`, add `import { getElementBounds } from './elementBounds';`, and update the two call sites to `getElementBounds(el, nodes, currentNodeId)` / `getElementBounds(element, nodes, currentNodeId)`.

Create `services/hitTest.ts`:

```ts
import { AppNode, Layer, TemplateElement } from '../types';
import { getElementBounds } from '../components/canvas/elementBounds';
import { sortElementsForRender } from './layers';

/**
 * Shared hit-test powering Alt-click cycling and the right-click "select under" menu.
 * Returns the stack of elements under `point` (template coordinates), ordered TOP -> BOTTOM,
 * considering only elements on visible + unlocked layers. Rotation-aware: the point is
 * un-rotated around each element's transform anchor before the axis-aligned bounds check.
 * Untagged/unknown-layer elements are treated as hittable (legacy safety).
 */
export function hitTestPoint(
    point: { x: number; y: number },
    elements: TemplateElement[],
    layers: Layer[] | undefined,
    nodes: Record<string, AppNode>,
    currentNodeId: string
): TemplateElement[] {
    const layerMap = new Map((layers ?? []).map(l => [l.id, l]));

    const selectable = elements.filter(el => {
        const layer = el.layerId ? layerMap.get(el.layerId) : undefined;
        if (!layer) return true;
        return layer.visible !== false && !layer.locked;
    });

    const hits = selectable.filter(el => {
        const bounds = getElementBounds(el, nodes, currentNodeId);
        const ox = el.transformOrigin ? el.transformOrigin.x : 0.5;
        const oy = el.transformOrigin ? el.transformOrigin.y : 0.5;
        const anchorX = el.x + bounds.w * ox;
        const anchorY = el.y + bounds.h * oy;
        const rad = -(el.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = point.x - anchorX;
        const dy = point.y - anchorY;
        const lx = anchorX + dx * cos - dy * sin;
        const ly = anchorY + dx * sin + dy * cos;
        return lx >= el.x && lx <= el.x + bounds.w && ly >= el.y && ly <= el.y + bounds.h;
    });

    return sortElementsForRender(hits, layers).reverse();
}
```

- [ ] **Step 4: Run tests to verify they pass (including the refactor guard)**

Run: `npx vitest run tests/unit/hitTest.test.ts tests/unit/canvasElementSvgSanitize.test.tsx && npx tsc --noEmit`
Expected: PASS — both files.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/elementBounds.ts components/canvas/CanvasElement.tsx services/hitTest.ts tests/unit/hitTest.test.ts
git commit -m "feat(layers): extract getElementBounds; add rotation-aware hitTestPoint"
```

---

### Task 7: Canvas selection — locked-layer click-through + Alt-click cycle

**Files:**
- Modify: `components/Canvas.tsx` (the selection hit-test in `handleMouseDown`, ~line 522–525 — the spec-identified root cause `e.target.closest('[data-element-id]')`)
- Test: `tests/unit/canvasLayers.test.tsx` (extend)

**Interfaces:**
- Consumes: `hitTestPoint` (Task 6); `template.layers`; existing `getMouseCoords` (Canvas.tsx ~line 348); `renderCanvas` fixture from `tests/unit/canvasTestUtils.tsx` (Task 3).
- Produces: normal clicks on locked-layer elements fall through (no selection of them); Alt+click selects the topmost hit and each further Alt+click **on the same spot** steps one element deeper (wrapping), skipping hidden + locked layers.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/canvasLayers.test.tsx`:

```tsx
describe('locked-layer click-through', () => {
    it('does not select an element whose layer is locked when clicked directly', () => {
        const layers = [makeLayer('lock', 0, { locked: true })];
        const elements = [makeEl('lockedEl', { layerId: 'lock' })];
        const { container, onSelectElements } = renderCanvas(elements, layers);
        const node = container.querySelector('[data-element-id="lockedEl"]')!;
        fireEvent.mouseDown(node, { clientX: 50, clientY: 50, button: 0 });
        const selectedIds = onSelectElements.mock.calls.flatMap(c => c[0]);
        expect(selectedIds).not.toContain('lockedEl');
    });
});

describe('Alt-click cycle', () => {
    const layers = [makeLayer('back', 0), makeLayer('front', 1)];
    const stackOf3 = [
        makeEl('bottom', { layerId: 'back', zIndex: 1 }),
        makeEl('middle', { layerId: 'back', zIndex: 2 }),
        makeEl('top', { layerId: 'front', zIndex: 1 }),
    ];

    it('selects the topmost element first, then steps one deeper per Alt+click on the same spot, wrapping', () => {
        const { outer, onSelectElements } = renderCanvas(stackOf3, layers);
        const alt = { clientX: 50, clientY: 50, button: 0, altKey: true };
        fireEvent.mouseDown(outer, alt);
        fireEvent.mouseDown(outer, alt);
        fireEvent.mouseDown(outer, alt);
        fireEvent.mouseDown(outer, alt); // wraps
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual(
            [['top'], ['middle'], ['bottom'], ['top']]
        );
    });

    it('restarts at the top when Alt+clicking a different spot', () => {
        const { outer, onSelectElements } = renderCanvas(stackOf3, layers);
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        fireEvent.mouseDown(outer, { clientX: 90, clientY: 90, button: 0, altKey: true });
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual([['top'], ['middle'], ['top']]);
    });

    it('skips hidden and locked layers while cycling', () => {
        const specialLayers = [
            makeLayer('ok', 0),
            makeLayer('hid', 1, { visible: false }),
            makeLayer('lock', 2, { locked: true }),
        ];
        const els = [
            makeEl('okEl', { layerId: 'ok' }),
            makeEl('hiddenEl', { layerId: 'hid' }),
            makeEl('lockedEl', { layerId: 'lock' }),
        ];
        const { outer, onSelectElements } = renderCanvas(els, specialLayers);
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        fireEvent.mouseDown(outer, { clientX: 50, clientY: 50, button: 0, altKey: true });
        expect(onSelectElements.mock.calls.map(c => c[0])).toEqual([['okEl'], ['okEl']]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/canvasLayers.test.tsx`
Expected: FAIL — locked element gets selected; Alt+click behaves like a normal click.

- [ ] **Step 3: Write the implementation**

In `components/Canvas.tsx`:

1. Imports: add `import { hitTestPoint } from '../services/hitTest';`
2. Add a ref near the other refs at the top of the component:

```ts
    // Alt-click cycle state: last click point + current depth in the stack
    const altCycleRef = useRef<{ x: number; y: number; index: number } | null>(null);
```

3. In `handleMouseDown`, at the very start of the `if (tool === 'select') {` block (before the `clickedId` lookup at ~line 524), insert the Alt-click branch:

```ts
            // Alt-click: cycle through the stack under the cursor (visible + unlocked layers, top -> bottom)
            if (e.altKey) {
                const stack = hitTestPoint(coords, elements, template.layers, nodes, currentNodeId);
                if (stack.length > 0) {
                    const prev = altCycleRef.current;
                    const samePoint = !!prev && Math.abs(prev.x - coords.x) < 3 && Math.abs(prev.y - coords.y) < 3;
                    const index = samePoint ? (prev!.index + 1) % stack.length : 0;
                    altCycleRef.current = { x: coords.x, y: coords.y, index };
                    onSelectElements([stack[index].id]);
                    e.preventDefault();
                    return;
                }
            }
```

4. Locked-layer click-through — replace the `clickedId` line (~line 524):

```ts
            let clickedId = targetEl.closest('[data-element-id]')?.getAttribute('data-element-id') ?? null;
            // Locked layers: still rendered, but clicks pass through as if the canvas were empty
            if (clickedId) {
                const clickedEl = elements.find(el => el.id === clickedId);
                const clickedLayer = clickedEl?.layerId ? template.layers?.find(l => l.id === clickedEl.layerId) : undefined;
                if (clickedLayer?.locked) clickedId = null;
            }
```

(The rest of the handler already branches on `clickedId` truthiness; `const`→`let` is the only signature change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/canvasLayers.test.tsx && npx tsc --noEmit`
Expected: PASS (all describe blocks in the file, including Tasks 3–4's).

- [ ] **Step 5: Commit**

```bash
git add components/Canvas.tsx tests/unit/canvasLayers.test.tsx
git commit -m "feat(layers): Alt-click cycle + locked-layer click-through on canvas"
```

---

### Task 8: Right-click "select under" context menu

**Files:**
- Create: `components/canvas/SelectUnderMenu.tsx`
- Modify: `components/Canvas.tsx` (`onContextMenu` on the outer container ~line 1395–1402; render the menu)
- Test: `tests/unit/selectUnderMenu.test.tsx` (new file)

**Interfaces:**
- Consumes: `hitTestPoint` (Task 6), `getElementLabel` (Task 1), existing `getMouseCoords`.
- Produces: `SelectUnderMenu` component:

```ts
interface SelectUnderMenuProps {
    position: { x: number; y: number };            // client (fixed) coordinates
    items: { element: TemplateElement; layerName: string }[]; // top -> bottom
    onSelect: (id: string) => void;
    onClose: () => void;
}
```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/selectUnderMenu.test.tsx` (reuses the shared fixtures from `tests/unit/canvasTestUtils.tsx`):

```tsx
import { describe, it, expect } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderCanvas, makeEl, makeLayer } from './canvasTestUtils';

describe('right-click "select under" menu', () => {
    const layers = [
        makeLayer('back', 0),
        makeLayer('front', 1),
        makeLayer('hid', 2, { visible: false }),
        makeLayer('lock', 3, { locked: true }),
    ];
    const elements = [
        makeEl('bottom', { layerId: 'back', zIndex: 1, type: 'ellipse' }),
        makeEl('top', { layerId: 'front', zIndex: 1, type: 'text', text: 'Title text' }),
        makeEl('hiddenEl', { layerId: 'hid' }),
        makeEl('lockedEl', { layerId: 'lock' }),
    ];

    it('lists the stack top->bottom with label, type and layer name, skipping hidden + locked layers', () => {
        const { outer, getByTestId, queryByText } = renderCanvas(elements, layers);
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        const menu = getByTestId('select-under-menu');
        const rows = Array.from(menu.querySelectorAll('[data-menu-element-id]'))
            .map(n => n.getAttribute('data-menu-element-id'));
        expect(rows).toEqual(['top', 'bottom']);
        expect(menu.textContent).toContain('Title text'); // label
        expect(menu.textContent).toContain('front');      // layer name
        expect(queryByText(/hiddenEl|lockedEl/)).toBeNull();
    });

    it('selects the clicked row and closes', () => {
        const { outer, getByTestId, queryByTestId, onSelectElements } = renderCanvas(elements, layers);
        fireEvent.contextMenu(outer, { clientX: 50, clientY: 50 });
        fireEvent.click(getByTestId('select-under-menu').querySelector('[data-menu-element-id="bottom"]')!);
        expect(onSelectElements).toHaveBeenCalledWith(['bottom']);
        expect(queryByTestId('select-under-menu')).toBeNull();
    });

    it('does not open when nothing is under the cursor', () => {
        const { outer, queryByTestId } = renderCanvas(elements, layers);
        fireEvent.contextMenu(outer, { clientX: 480, clientY: 690 });
        expect(queryByTestId('select-under-menu')).toBeNull();
    });
});
```

(`renderCanvas`, `makeEl`, `makeLayer` come from `tests/unit/canvasTestUtils.tsx`, created in Task 3.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/selectUnderMenu.test.tsx`
Expected: FAIL — no `select-under-menu` testid ever appears.

- [ ] **Step 3: Write the implementation**

Create `components/canvas/SelectUnderMenu.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { TemplateElement } from '../../types';
import { getElementLabel } from '../../services/layers';

interface SelectUnderMenuProps {
    position: { x: number; y: number };
    items: { element: TemplateElement; layerName: string }[];
    onSelect: (id: string) => void;
    onClose: () => void;
}

export const SelectUnderMenu: React.FC<SelectUnderMenuProps> = ({ position, items, onSelect, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onDown = (e: globalThis.MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onDown);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('mousedown', onDown);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            data-testid="select-under-menu"
            className="fixed z-50 min-w-[200px] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-sm"
            style={{ left: position.x, top: position.y }}
            onContextMenu={e => e.preventDefault()}
        >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Select element</div>
            {items.map(({ element, layerName }) => (
                <button
                    key={element.id}
                    data-menu-element-id={element.id}
                    className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-blue-50 text-slate-700"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => { onSelect(element.id); onClose(); }}
                >
                    <span className="truncate">{getElementLabel(element)}</span>
                    <span className="flex-shrink-0 text-[10px] text-slate-400">{element.type} · {layerName}</span>
                </button>
            ))}
        </div>
    );
};
```

In `components/Canvas.tsx`:

1. Imports: `import { SelectUnderMenu } from './canvas/SelectUnderMenu';`
2. State near the other useState hooks:

```ts
    const [selectUnderMenu, setSelectUnderMenu] = useState<{ x: number; y: number; stack: TemplateElement[] } | null>(null);
```

3. Handler next to `handleMouseDown`:

```ts
    const handleContextMenu = (e: MouseEvent) => {
        if (tool !== 'select') return;
        const coords = getMouseCoords(e);
        const stack = hitTestPoint(coords, elements, template.layers, nodes, currentNodeId);
        if (stack.length === 0) return; // let the browser menu through on empty canvas
        e.preventDefault();
        setSelectUnderMenu({ x: e.clientX, y: e.clientY, stack });
    };
```

4. On the outer container div (the one with `onMouseDown={handleMouseDown}`, ~line 1399): add `onContextMenu={handleContextMenu}`.
5. Render just inside that outer container (after the inner wrapper div):

```tsx
            {selectUnderMenu && (
                <SelectUnderMenu
                    position={{ x: selectUnderMenu.x, y: selectUnderMenu.y }}
                    items={selectUnderMenu.stack.map(el => ({
                        element: el,
                        layerName: template.layers?.find(l => l.id === el.layerId)?.name ?? '—',
                    }))}
                    onSelect={id => onSelectElements([id])}
                    onClose={() => setSelectUnderMenu(null)}
                />
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/selectUnderMenu.test.tsx tests/unit/canvasLayers.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/SelectUnderMenu.tsx components/Canvas.tsx tests/unit/selectUnderMenu.test.tsx
git commit -m "feat(layers): right-click select-under context menu"
```

---

### Task 9: Layers panel — layer rows (hide/lock/color/rename/collapse/reorder/set-active/add/delete) + toolbar toggle

**Files:**
- Modify: `services/layers.ts` (+ layer-list operations) and `tests/unit/layers.test.ts` (+ their unit tests)
- Create: `components/LayersPanel.tsx`
- Modify: `components/EditorToolbar.tsx` (toggle button, next to the Show Grid toggle ~line 218)
- Modify: `components/ProjectEditor.tsx` (mount panel in the right-hand column above `PropertiesPanel`, ~line 1200)
- Test: `tests/unit/LayersPanel.test.tsx` (new file)

**Interfaces:**
- Consumes: `Layer`, helpers from Task 1; `handleUpdateTemplate(id, updates)` / `handleUpdateTemplateElements(els, save)` (existing, `components/ProjectEditor.tsx:845/876`).
- Produces:
  - New helpers in `services/layers.ts`:
    - `addLayer(layers: Layer[]): { layers: Layer[]; newLayer: Layer }` — appends `"Layer N"` at `order = max + 1`
    - `removeLayerFromTemplate(template: PageTemplate, layerId: string): PageTemplate` — no-op if it's the last layer; otherwise removes the layer and re-tags its elements onto the lowest-order remaining layer (stacked on top of it, preserving relative order)
    - `moveLayerToIndex(layers: Layer[], layerId: string, targetIndex: number): Layer[]` — `targetIndex` counts bottom→top (index within order-asc list); returns layers with `order` renumbered `0..n-1`
  - `LayersPanel` component:

```ts
interface LayersPanelProps {
    template: PageTemplate;
    selectedElementIds: string[];
    activeLayerId?: string;
    onUpdateTemplate: (updates: Partial<PageTemplate>) => void; // template id bound by the caller
    onUpdateElements: (elements: TemplateElement[], saveHistory?: boolean) => void;
    onSelectElements: (ids: string[]) => void;
    onSetActiveLayer: (layerId: string) => void;
}
```

  - Layer rows render **frontmost first** (order desc). Each row: `data-testid="layer-row-<id>"`, eye toggle (`title="Toggle visibility"`), lock toggle (`title="Toggle lock"`), color chip (`title="Layer color"` — clicking opens a 6-swatch row incl. "none"), double-click name → inline rename input, chevron collapse toggle (`title="Collapse layer"`), drag handle (`title="Reorder layer"`, row is `draggable`), delete button (`title="Delete layer"`, disabled when only one layer). Clicking the row body calls `onSetActiveLayer`; the active row is highlighted. An "Add layer" button (`title="Add layer"`) sits in the panel header.

- [ ] **Step 1: Write the failing helper tests**

Append to `tests/unit/layers.test.ts` (reuse `makeEl`/`makeLayer`/`makeTemplate`):

```ts
import { addLayer, removeLayerFromTemplate, moveLayerToIndex } from '../../services/layers';
// (merge into the existing import statement)

describe('addLayer', () => {
    it('appends "Layer N" above everything', () => {
        const { layers, newLayer } = addLayer([makeLayer('a', 0, { name: 'Layer 1' })]);
        expect(layers).toHaveLength(2);
        expect(newLayer).toMatchObject({ name: 'Layer 2', order: 1, visible: true, locked: false });
    });
});

describe('removeLayerFromTemplate', () => {
    it('refuses to remove the last layer', () => {
        const tpl = ensureTemplateLayers(makeTemplate([makeEl('a')]));
        expect(removeLayerFromTemplate(tpl, tpl.layers![0].id)).toBe(tpl);
    });
    it('re-tags orphaned elements onto the lowest-order remaining layer, stacked on top', () => {
        const layers = [makeLayer('bottom', 0), makeLayer('doomed', 1)];
        const tpl = makeTemplate([
            makeEl('keep', { layerId: 'bottom', zIndex: 4 }),
            makeEl('o1', { layerId: 'doomed', zIndex: 1 }),
            makeEl('o2', { layerId: 'doomed', zIndex: 2 }),
        ], layers);
        const out = removeLayerFromTemplate(tpl, 'doomed');
        expect(out.layers!.map(l => l.id)).toEqual(['bottom']);
        expect(out.elements.find(e => e.id === 'o1')).toMatchObject({ layerId: 'bottom', zIndex: 5 });
        expect(out.elements.find(e => e.id === 'o2')).toMatchObject({ layerId: 'bottom', zIndex: 6 });
    });
});

describe('moveLayerToIndex', () => {
    it('moves a layer and renumbers order 0..n-1', () => {
        const layers = [makeLayer('a', 0), makeLayer('b', 1), makeLayer('c', 2)];
        const out = moveLayerToIndex(layers, 'c', 0);
        const byOrder = [...out].sort((x, y) => x.order - y.order).map(l => l.id);
        expect(byOrder).toEqual(['c', 'a', 'b']);
        expect([...out].sort((x, y) => x.order - y.order).map(l => l.order)).toEqual([0, 1, 2]);
    });
});
```

- [ ] **Step 2: Write the failing panel tests**

Create `tests/unit/LayersPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayersPanel } from '../../components/LayersPanel';
import { Layer, PageTemplate, TemplateElement } from '../../types';

const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});
const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});

export const renderPanel = (elements: TemplateElement[], layers: Layer[], extra: Record<string, any> = {}) => {
    const template: PageTemplate = { id: 'page', name: 'Page', width: 500, height: 700, elements, layers };
    const onUpdateTemplate = vi.fn();
    const onUpdateElements = vi.fn();
    const onSelectElements = vi.fn();
    const onSetActiveLayer = vi.fn();
    const utils = render(
        <LayersPanel
            template={template}
            selectedElementIds={[]}
            activeLayerId={layers[0]?.id}
            onUpdateTemplate={onUpdateTemplate}
            onUpdateElements={onUpdateElements}
            onSelectElements={onSelectElements}
            onSetActiveLayer={onSetActiveLayer}
            {...extra}
        />
    );
    return { ...utils, onUpdateTemplate, onUpdateElements, onSelectElements, onSetActiveLayer };
};

describe('LayersPanel layer rows', () => {
    const layers = [makeLayer('back', 0, { name: 'Background' }), makeLayer('front', 1, { name: 'Foreground' })];

    it('renders layers frontmost-first', () => {
        const { container } = renderPanel([], layers);
        const ids = Array.from(container.querySelectorAll('[data-testid^="layer-row-"]'))
            .map(n => n.getAttribute('data-testid'));
        expect(ids).toEqual(['layer-row-front', 'layer-row-back']);
    });

    it('eye toggle flips visible via onUpdateTemplate', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Toggle visibility"]')!);
        const updated: Layer[] = onUpdateTemplate.mock.calls[0][0].layers;
        expect(updated.find(l => l.id === 'front')!.visible).toBe(false);
        expect(updated.find(l => l.id === 'back')!.visible).toBe(true);
    });

    it('lock toggle flips locked', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-back').querySelector('[title="Toggle lock"]')!);
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'back').locked).toBe(true);
    });

    it('double-click renames via inline input', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.doubleClick(getByTestId('layer-row-front').querySelector('[data-testid="layer-name"]')!);
        const input = getByTestId('layer-row-front').querySelector('input')!;
        fireEvent.change(input, { target: { value: 'Header art' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'front').name).toBe('Header art');
    });

    it('color chip sets color', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Layer color"]')!);
        fireEvent.click(getByTestId('layer-color-swatch-#ef4444'));
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'front').color).toBe('#ef4444');
    });

    it('collapse toggle sets collapsed', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Collapse layer"]')!);
        expect(onUpdateTemplate.mock.calls[0][0].layers.find((l: Layer) => l.id === 'front').collapsed).toBe(true);
    });

    it('clicking the row sets the active layer', () => {
        const { getByTestId, onSetActiveLayer } = renderPanel([], layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[data-testid="layer-name"]')!);
        expect(onSetActiveLayer).toHaveBeenCalledWith('front');
    });

    it('drag-reordering emits renumbered orders', () => {
        const { getByTestId, onUpdateTemplate } = renderPanel([], layers);
        fireEvent.dragStart(getByTestId('layer-row-back'), { dataTransfer: { setData: vi.fn(), getData: vi.fn() } });
        fireEvent.dragOver(getByTestId('layer-row-front'));
        fireEvent.drop(getByTestId('layer-row-front'));
        const updated: Layer[] = onUpdateTemplate.mock.calls[0][0].layers;
        expect(updated.find(l => l.id === 'back')!.order).toBeGreaterThan(updated.find(l => l.id === 'front')!.order);
    });

    it('add-layer appends Layer N; delete is disabled for the last layer', () => {
        const single = [makeLayer('only', 0, { name: 'Layer 1' })];
        const { getByTitle, getByTestId, onUpdateTemplate } = renderPanel([], single);
        expect((getByTestId('layer-row-only').querySelector('[title="Delete layer"]') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(getByTitle('Add layer'));
        expect(onUpdateTemplate.mock.calls[0][0].layers).toHaveLength(2);
    });

    it('delete re-tags the doomed layer elements (via layers AND elements updates)', () => {
        const els = [makeEl('x', { layerId: 'front', zIndex: 1 })];
        const { getByTestId, onUpdateTemplate, onUpdateElements } = renderPanel(els, layers);
        fireEvent.click(getByTestId('layer-row-front').querySelector('[title="Delete layer"]')!);
        expect(onUpdateTemplate.mock.calls[0][0].layers.map((l: Layer) => l.id)).toEqual(['back']);
        expect(onUpdateElements.mock.calls[0][0][0]).toMatchObject({ id: 'x', layerId: 'back' });
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/layers.test.ts tests/unit/LayersPanel.test.tsx`
Expected: FAIL — helpers and component don't exist.

- [ ] **Step 4: Write the implementation**

Append to `services/layers.ts`:

```ts
/** Append a new "Layer N" above everything (order = max + 1). */
export function addLayer(layers: Layer[]): { layers: Layer[]; newLayer: Layer } {
    const maxOrder = layers.reduce((m, l) => Math.max(m, l.order), -1);
    const newLayer: Layer = {
        id: createLayerId(),
        name: `Layer ${layers.length + 1}`,
        order: maxOrder + 1,
        visible: true,
        locked: false,
    };
    return { layers: [...layers, newLayer], newLayer };
}

/**
 * Remove a layer, re-tagging its elements onto the lowest-order remaining layer
 * (stacked on top, preserving their relative zIndex order). No-op on the last layer.
 */
export function removeLayerFromTemplate(template: PageTemplate, layerId: string): PageTemplate {
    const layers = template.layers ?? [];
    if (layers.length <= 1 || !layers.some(l => l.id === layerId)) return template;
    const remaining = layers.filter(l => l.id !== layerId);
    const targetId = [...remaining].sort((a, b) => a.order - b.order)[0].id;
    const orphans = template.elements
        .filter(el => el.layerId === layerId)
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
        .map(el => el.id);
    return {
        ...template,
        layers: remaining,
        elements: moveElementsToLayer(template.elements, orphans, targetId),
    };
}

/** Move a layer to targetIndex within the bottom->top (order asc) list; renumber order 0..n-1. */
export function moveLayerToIndex(layers: Layer[], layerId: string, targetIndex: number): Layer[] {
    const asc = [...layers].sort((a, b) => a.order - b.order);
    const from = asc.findIndex(l => l.id === layerId);
    if (from === -1) return layers;
    const [moved] = asc.splice(from, 1);
    asc.splice(Math.max(0, Math.min(targetIndex, asc.length)), 0, moved);
    return asc.map((l, i) => ({ ...l, order: i }));
}
```

Create `components/LayersPanel.tsx` (layer rows only in this task; element rows arrive in Task 10):

```tsx
import React, { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Layers, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { Layer, PageTemplate, TemplateElement } from '../types';
import { addLayer, moveLayerToIndex, removeLayerFromTemplate } from '../services/layers';

const LAYER_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', ''];

interface LayersPanelProps {
    template: PageTemplate;
    selectedElementIds: string[];
    activeLayerId?: string;
    onUpdateTemplate: (updates: Partial<PageTemplate>) => void;
    onUpdateElements: (elements: TemplateElement[], saveHistory?: boolean) => void;
    onSelectElements: (ids: string[]) => void;
    onSetActiveLayer: (layerId: string) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
    template, selectedElementIds, activeLayerId,
    onUpdateTemplate, onUpdateElements, onSelectElements, onSetActiveLayer,
}) => {
    const layers = [...(template.layers ?? [])].sort((a, b) => b.order - a.order); // frontmost first
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [colorPickerId, setColorPickerId] = useState<string | null>(null);
    const [dragLayerId, setDragLayerId] = useState<string | null>(null);

    const updateLayer = (id: string, updates: Partial<Layer>) => {
        onUpdateTemplate({ layers: (template.layers ?? []).map(l => (l.id === id ? { ...l, ...updates } : l)) });
    };

    const commitRename = () => {
        if (renamingId && renameValue.trim()) updateLayer(renamingId, { name: renameValue.trim() });
        setRenamingId(null);
    };

    const handleAdd = () => {
        const { layers: next, newLayer } = addLayer(template.layers ?? []);
        onUpdateTemplate({ layers: next });
        onSetActiveLayer(newLayer.id);
    };

    const handleDelete = (id: string) => {
        const next = removeLayerFromTemplate(template, id);
        if (next === template) return;
        onUpdateTemplate({ layers: next.layers });
        onUpdateElements(next.elements, true);
    };

    const handleDropOnLayer = (targetId: string) => {
        if (!dragLayerId || dragLayerId === targetId) { setDragLayerId(null); return; }
        const asc = [...(template.layers ?? [])].sort((a, b) => a.order - b.order);
        const targetIndex = asc.findIndex(l => l.id === targetId);
        onUpdateTemplate({ layers: moveLayerToIndex(template.layers ?? [], dragLayerId, targetIndex) });
        setDragLayerId(null);
    };

    return (
        <div data-testid="layers-panel" className="border-b border-slate-200 bg-white flex flex-col max-h-[45%] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <Layers size={13} /> Layers
                </div>
                <button title="Add layer" onClick={handleAdd}
                    className="p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                    <Plus size={14} />
                </button>
            </div>
            <div className="overflow-y-auto">
                {layers.map(layer => (
                    <div key={layer.id} data-testid={`layer-row-${layer.id}`}
                        draggable
                        onDragStart={() => setDragLayerId(layer.id)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDropOnLayer(layer.id)}
                        className={clsx('group flex items-center gap-1 px-2 py-1.5 border-b border-slate-50 text-sm',
                            activeLayerId === layer.id ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                        <span title="Reorder layer" className="cursor-grab text-slate-300 group-hover:text-slate-400">
                            <GripVertical size={12} />
                        </span>
                        <button title="Collapse layer" className="text-slate-400"
                            onClick={() => updateLayer(layer.id, { collapsed: !layer.collapsed })}>
                            {layer.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <button title="Toggle visibility" className="text-slate-500"
                            onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>
                            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-300" />}
                        </button>
                        <button title="Toggle lock" className="text-slate-500"
                            onClick={() => updateLayer(layer.id, { locked: !layer.locked })}>
                            {layer.locked ? <Lock size={13} /> : <Unlock size={13} className="text-slate-300" />}
                        </button>
                        <span className="relative">
                            <button title="Layer color"
                                className="w-3 h-3 rounded-full border border-slate-300"
                                style={{ backgroundColor: layer.color || 'transparent' }}
                                onClick={() => setColorPickerId(colorPickerId === layer.id ? null : layer.id)} />
                            {colorPickerId === layer.id && (
                                <span className="absolute left-0 top-4 z-40 flex gap-1 bg-white border border-slate-200 rounded p-1 shadow">
                                    {LAYER_COLORS.map(c => (
                                        <button key={c || 'none'} data-testid={`layer-color-swatch-${c || 'none'}`}
                                            className="w-3.5 h-3.5 rounded-full border border-slate-300"
                                            style={{ backgroundColor: c || 'transparent' }}
                                            onClick={() => { updateLayer(layer.id, { color: c || undefined }); setColorPickerId(null); }} />
                                    ))}
                                </span>
                            )}
                        </span>
                        {renamingId === layer.id ? (
                            <input autoFocus value={renameValue}
                                className="flex-1 min-w-0 px-1 py-0.5 text-sm border border-blue-300 rounded"
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
                        ) : (
                            <span data-testid="layer-name"
                                className={clsx('flex-1 min-w-0 truncate cursor-default', !layer.visible && 'text-slate-400')}
                                onClick={() => onSetActiveLayer(layer.id)}
                                onDoubleClick={() => { setRenamingId(layer.id); setRenameValue(layer.name); }}>
                                {layer.name}
                            </span>
                        )}
                        <button title="Delete layer" disabled={(template.layers ?? []).length <= 1}
                            className="p-0.5 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300"
                            onClick={() => handleDelete(layer.id)}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                {/* Element rows are added in the next task */}
            </div>
        </div>
    );
};
```

Note for the jsdom drag test: React fires `dragstart`→state, `drop` on the target row → `handleDropOnLayer`. No `dataTransfer` reliance in the component (state ref only) — that keeps it jsdom-testable.

`components/EditorToolbar.tsx` — add `Layers` to the `lucide-react` import and, next to the Show Grid ToolButton (~line 218):

```tsx
                <ToolButton active={!!state.showLayersPanel} icon={Layers} onClick={() => setState(s => ({ ...s, showLayersPanel: !s.showLayersPanel }))} title="Layers Panel" />
```

`components/ProjectEditor.tsx` — import `{ LayersPanel } from './LayersPanel';` and in the right-hand column (~line 1200), directly above `<PropertiesPanel`:

```tsx
                    {state.showLayersPanel && currentTemplate && (
                        <LayersPanel
                            template={currentTemplate}
                            selectedElementIds={state.selectedElementIds}
                            activeLayerId={state.activeLayerId}
                            onUpdateTemplate={(updates) => handleUpdateTemplate(currentTemplate.id, updates)}
                            onUpdateElements={(els, save) => handleUpdateTemplateElements(els, save)}
                            onSelectElements={(ids) => setState(s => ({ ...s, selectedElementIds: ids }))}
                            onSetActiveLayer={(layerId) => setState(s => ({ ...s, activeLayerId: layerId }))}
                        />
                    )}
```

(`currentTemplate` is already in scope at the render site — it's passed to `<Canvas>` at line 1182.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/layers.test.ts tests/unit/LayersPanel.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/layers.ts components/LayersPanel.tsx components/EditorToolbar.tsx components/ProjectEditor.tsx tests/unit/layers.test.ts tests/unit/LayersPanel.test.tsx
git commit -m "feat(layers): Layers panel with layer rows + toolbar toggle"
```

---

### Task 10: Layers panel — element rows, panel-row selection, search filter, move-to-layer

**Files:**
- Modify: `components/LayersPanel.tsx`
- Test: `tests/unit/LayersPanel.test.tsx` (extend)

**Interfaces:**
- Consumes: `getElementLabel`, `moveElementsToLayer` (Task 1); `renderPanel` fixture (Task 9).
- Produces: under each non-collapsed layer, that layer's element rows sorted **frontmost first** (zIndex desc), each `data-testid="element-row-<id>"`; clicking a row calls `onSelectElements([id])` (the spec's direct fix for the overlap bug — works regardless of canvas overlap/visibility state); selected rows highlighted (`aria-selected="true"`); a search box (`placeholder="Filter elements…"`) filters element rows by label or type; element rows are draggable onto layer rows (retag via `moveElementsToLayer`); a "Move selection to layer" `<select>` (`data-testid="move-selection-select"`) in the panel header reassigns the whole canvas selection in one step.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/LayersPanel.test.tsx`:

```tsx
describe('LayersPanel element rows', () => {
    const layers = [makeLayer('back', 0, { name: 'Back' }), makeLayer('front', 1, { name: 'Front' })];
    const elements = [
        makeEl('r1', { layerId: 'back', zIndex: 1 }),
        makeEl('t1', { layerId: 'back', zIndex: 2, type: 'text', text: 'Big title' }),
        makeEl('e1', { layerId: 'front', zIndex: 1, type: 'ellipse' }),
    ];

    it('lists each layer\'s elements frontmost-first under its layer row', () => {
        const { container } = renderPanel(elements, layers);
        const ids = Array.from(container.querySelectorAll('[data-testid^="element-row-"]'))
            .map(n => n.getAttribute('data-testid'));
        // front layer first (frontmost), then back layer's elements zIndex desc
        expect(ids).toEqual(['element-row-e1', 'element-row-t1', 'element-row-r1']);
    });

    it('click selects the element — even one fully covered on canvas', () => {
        const { getByTestId, onSelectElements } = renderPanel(elements, layers);
        fireEvent.click(getByTestId('element-row-r1'));
        expect(onSelectElements).toHaveBeenCalledWith(['r1']);
    });

    it('highlights the current selection', () => {
        const { getByTestId } = renderPanel(elements, layers, { selectedElementIds: ['t1'] });
        expect(getByTestId('element-row-t1').getAttribute('aria-selected')).toBe('true');
        expect(getByTestId('element-row-r1').getAttribute('aria-selected')).toBe('false');
    });

    it('hides element rows of collapsed layers', () => {
        const collapsed = [makeLayer('back', 0, { collapsed: true }), makeLayer('front', 1)];
        const { queryByTestId } = renderPanel(elements, collapsed);
        expect(queryByTestId('element-row-r1')).toBeNull();
        expect(queryByTestId('element-row-e1')).not.toBeNull();
    });

    it('search filters element rows by label or type', () => {
        const { getByPlaceholderText, queryByTestId } = renderPanel(elements, layers);
        fireEvent.change(getByPlaceholderText('Filter elements…'), { target: { value: 'big' } });
        expect(queryByTestId('element-row-t1')).not.toBeNull();
        expect(queryByTestId('element-row-r1')).toBeNull();
        expect(queryByTestId('element-row-e1')).toBeNull();
    });

    it('dragging an element row onto a layer row retags it on top of that layer', () => {
        const { getByTestId, onUpdateElements } = renderPanel(elements, layers);
        fireEvent.dragStart(getByTestId('element-row-r1'));
        fireEvent.dragOver(getByTestId('layer-row-front'));
        fireEvent.drop(getByTestId('layer-row-front'));
        const updated: TemplateElement[] = onUpdateElements.mock.calls[0][0];
        expect(updated.find(e => e.id === 'r1')).toMatchObject({ layerId: 'front', zIndex: 2 });
    });

    it('"move selection to layer" reassigns the whole canvas selection', () => {
        const { getByTestId, onUpdateElements } = renderPanel(elements, layers, { selectedElementIds: ['r1', 't1'] });
        fireEvent.change(getByTestId('move-selection-select'), { target: { value: 'front' } });
        const updated: TemplateElement[] = onUpdateElements.mock.calls[0][0];
        expect(updated.find(e => e.id === 'r1')!.layerId).toBe('front');
        expect(updated.find(e => e.id === 't1')!.layerId).toBe('front');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/LayersPanel.test.tsx`
Expected: FAIL — no element rows / search box / select exist.

- [ ] **Step 3: Write the implementation**

In `components/LayersPanel.tsx`:

1. Add imports: `getElementLabel, moveElementsToLayer` from `../services/layers`; icons `Circle, Grid3X3, Minus, Search, Square, Triangle, Type, Image as ImageIcon` from `lucide-react`.
2. Add state: `const [filter, setFilter] = useState('');` and `const [dragElementId, setDragElementId] = useState<string | null>(null);`
3. Type-icon map (module scope):

```tsx
const TYPE_ICONS: Record<string, React.FC<any>> = {
    rect: Square, ellipse: Circle, triangle: Triangle, text: Type, grid: Grid3X3, line: Minus, svg: ImageIcon,
};
```

4. Header additions (below the title bar): search box and move-selection select:

```tsx
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-1 flex-1 min-w-0 bg-slate-50 rounded px-1.5">
                    <Search size={11} className="text-slate-400 flex-shrink-0" />
                    <input value={filter} onChange={e => setFilter(e.target.value)}
                        placeholder="Filter elements…"
                        className="w-full bg-transparent py-1 text-xs outline-none" />
                </div>
                {selectedElementIds.length > 0 && (
                    <select data-testid="move-selection-select" value=""
                        title="Move selection to layer"
                        className="text-xs border border-slate-200 rounded py-1 max-w-[110px]"
                        onChange={e => {
                            if (!e.target.value) return;
                            onUpdateElements(moveElementsToLayer(template.elements, selectedElementIds, e.target.value), true);
                        }}>
                        <option value="">Move to…</option>
                        {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                )}
            </div>
```

5. Element rows: inside the layer `.map`, wrap the existing row in a fragment and render below it (when `!layer.collapsed`):

```tsx
                        {!layer.collapsed && template.elements
                            .filter(el => el.layerId === layer.id)
                            .filter(el => {
                                if (!filter.trim()) return true;
                                const q = filter.trim().toLowerCase();
                                return getElementLabel(el).toLowerCase().includes(q) || el.type.includes(q);
                            })
                            .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
                            .map(el => {
                                const Icon = TYPE_ICONS[el.type] || Square;
                                const isSelected = selectedElementIds.includes(el.id);
                                return (
                                    <div key={el.id} data-testid={`element-row-${el.id}`}
                                        aria-selected={isSelected}
                                        draggable
                                        onDragStart={e => { e.stopPropagation(); setDragElementId(el.id); }}
                                        onClick={() => onSelectElements([el.id])}
                                        className={clsx('flex items-center gap-1.5 pl-9 pr-2 py-1 text-xs cursor-pointer border-b border-slate-50',
                                            isSelected ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50')}>
                                        <Icon size={11} className="flex-shrink-0" />
                                        <span className="truncate">{getElementLabel(el)}</span>
                                    </div>
                                );
                            })}
```

6. Extend the layer row's `onDrop` to accept element drags — replace `onDrop={() => handleDropOnLayer(layer.id)}` with:

```tsx
                        onDrop={() => {
                            if (dragElementId) {
                                onUpdateElements(moveElementsToLayer(template.elements, [dragElementId], layer.id), true);
                                setDragElementId(null);
                            } else {
                                handleDropOnLayer(layer.id);
                            }
                        }}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/LayersPanel.test.tsx && npx tsc --noEmit`
Expected: PASS (Task 9's describe block must still pass too).

- [ ] **Step 5: Commit**

```bash
git add components/LayersPanel.tsx tests/unit/LayersPanel.test.tsx
git commit -m "feat(layers): panel element rows, search filter, move-selection-to-layer"
```

---

### Task 11: Server validation — light optional layer checks

**Files:**
- Modify: `server/validateAppState.js` (inside the per-template loop, next to the element-cap logic ~line 43–48)
- Test: `tests/unit/server/validateAppState.test.js` (extend)

**Interfaces:**
- Consumes: existing `fail`/`isStr` helpers.
- Produces: exactly the spec's two optional checks — `layers`, if present, must be an array with ≤ 200 entries; `layerId`, if present on an element, must be a string. **No new required fields** — the existing `goodState()` fixture (schemaVersion 7, no layers) must keep passing unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/server/validateAppState.test.js` inside the existing `describe`:

```js
    it('accepts pre-migration states with no layers/layerId (legacy)', () => {
        expect(validateAppState(goodState()).ok).toBe(true);
    });
    it('accepts templates with a valid layers array and string layerIds', () => {
        const s = goodState();
        const tpl = s.variants.default.templates.page;
        tpl.layers = [{ id: 'l1', name: 'Layer 1', order: 0, visible: true, locked: false }];
        tpl.elements = [{ id: 'e1', layerId: 'l1' }];
        expect(validateAppState(s).ok).toBe(true);
    });
    it('rejects non-array layers', () => {
        const s = goodState();
        s.variants.default.templates.page.layers = { nope: true };
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects more than 200 layers per template', () => {
        const s = goodState();
        s.variants.default.templates.page.layers = Array.from({ length: 201 }, (_, i) => ({ id: `l${i}` }));
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects a non-string layerId on an element', () => {
        const s = goodState();
        s.variants.default.templates.page.elements = [{ id: 'e1', layerId: 42 }];
        expect(validateAppState(s).ok).toBe(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/validateAppState.test.js`
Expected: the three rejection tests FAIL (validator currently accepts everything); acceptance tests pass.

- [ ] **Step 3: Write minimal implementation**

In `server/validateAppState.js`, inside the template loop, after the `elements must be an array` check and before `totalElements += ...`:

```js
            // Layers (v8+): light, optional checks — legacy/un-migrated states must still validate
            if (tpl.layers !== undefined) {
                if (!Array.isArray(tpl.layers)) return fail(`template ${vid}/${tid} layers must be an array`);
                if (tpl.layers.length > 200) return fail(`template ${vid}/${tid} has too many layers (max 200)`);
            }
            for (const el of tpl.elements) {
                if (el && typeof el === 'object' && el.layerId !== undefined && !isStr(el.layerId)) {
                    return fail(`template ${vid}/${tid} has an element with a non-string layerId`);
                }
            }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/validateAppState.test.js`
Expected: PASS — including every pre-existing test in the file.

- [ ] **Step 5: Full-suite gate + commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: everything green, count ≥ baseline + all new tests.

```bash
git add server/validateAppState.js tests/unit/server/validateAppState.test.js
git commit -m "feat(layers): optional server-side layer validation (array cap, string layerId)"
```

---

### Task 12: Real-app verification (verify skill)

**Files:** none created (fixes, if any, go through a targeted TDD loop in the file that owns the bug).

This task is mandatory before declaring the feature done. **Invoke the repo's `verify` skill** (it bootstraps a project verify skill if none exists) and drive the real app (`npm run dev`) end-to-end. Exercise, at minimum, the spec's Testing section script:

- [ ] **Step 1: Migration in the running app** — load a pre-v8 project (any existing preset/saved project), confirm it opens rendering identically, and that the Layers panel shows one "Layer 1" containing all elements.
- [ ] **Step 2: The original bug, three ways** — draw two perfectly overlapping rectangles. Select the covered one via (a) its Layers-panel row, (b) Alt+click twice on the overlap point, (c) right-click → "select under" list. All three must land on the bottom element.
- [ ] **Step 3: Layer operations** — add a second layer; move one rectangle to it (both via drag onto the layer row and via "Move to…"); rename it; give it a color; collapse/expand; drag-reorder the layers and confirm canvas stacking flips accordingly; toggle the panel from the toolbar.
- [ ] **Step 4: Hide & lock** — hide a layer: its elements vanish from the canvas; lock a layer: its elements render but clicks pass through, Alt-click and right-click skip them, unlock restores selection.
- [ ] **Step 5: Export exclusion** — with one layer hidden, export the PDF and confirm the hidden layer's elements are absent and stacking matches the canvas; confirm the project thumbnail (gallery/preview path) also excludes them.
- [ ] **Step 6: Creation paths** — with a non-default active layer, draw a new shape, paste, and duplicate — each lands on the expected layer at its top. Generate a project via the Hierarchy Generator and confirm its templates carry layers.
- [ ] **Step 7: Fix-forward** — any failure: use superpowers:systematic-debugging, write the failing test first, fix, re-verify.
- [ ] **Step 8: Final gate + commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green, production build succeeds.

```bash
git add -A
git commit -m "docs(layers): mark layers-panel plan verified end-to-end"
```

---

## Self-Review (performed while writing this plan)

- **Spec coverage:** Shape B storage → Tasks 1–2; two-level sort + hidden exclusion in canvas/PDF/thumbnails → Tasks 4–5; per-layer hide/lock/color/collapse/rename/reorder/set-active/move-selection → Tasks 9–10; three selection paths → Tasks 10 (panel row), 7 (Alt-click), 8 (right-click), all on the shared `hitTestPoint` → Task 6; v7→v8 migration incl. variants + legacy flat, zIndex preserved, idempotent, changelog caveat → Task 2; every content-creating path tagged (incl. the preset/generator schemaVersion-stamp traps found during repo verification) → Tasks 2–3; server validation → Task 11; `shared/diff.js` zero changes → Global Constraints (no task touches it); real-app verification → Task 12.
- **Deliberate deviations, with rationale:** (1) `layers`/`layerId` optional in TS — mandated by the spec's own "legacy states must validate" rule; (2) `hitTestPoint` signature carries `nodes`/`currentNodeId` — required by the spec's instruction to reuse `getElementBounds`, which needs them for grids; (3) add/delete-layer operations included though the spec's op list doesn't name them — a single-layer panel would make "move to layer" and "reorder" inert; delete is guarded (last layer undeletable, orphans re-tagged).
- **Type consistency:** helper names/signatures in Tasks 3–10 match the Task 1/6/9 Interfaces blocks verbatim.
