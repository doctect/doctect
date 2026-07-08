# Layers Panel — Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation planning

## Problem

In the editor, when two elements perfectly overlap, only the topmost (highest `zIndex`)
receives clicks. The element underneath cannot be selected without first moving the top one
out of the way — painful when the user wants to move or edit the lower element.

## Chosen solution

A **named-layer system** (Photoshop-style groups) surfaced through a **Layers panel**, plus
two canvas-side selection aids (Alt-click cycle, right-click "select under"). Elements are
grouped into named, reorderable layers; the panel makes every element selectable regardless of
overlap, and layers add visibility/lock/color organization on top.

### Storage: flat + `layerId` tag (Shape B)

Layers are stored as **metadata on the template plus a `layerId` tag on each element** — NOT by
nesting elements inside layer objects. `template.elements` stays a flat array. This keeps the
blast radius small: elements remain individually addressable, PDF export and canvas rendering
only change their sort/filter, and the gallery diff/merge engine needs **zero** changes (it
diffs whole templates — see §8).

Rejected alternative — Shape A (each layer owns its own `elements` array): true nesting, but
rewrites canvas render, PDF export, and `shared/diff.js`, and endangers the merge engine, for
no extra user-facing capability over Shape B.

## Data model (`types.ts`)

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

- `PageTemplate` gains `layers: Layer[]`.
- `TemplateElement` gains `layerId: string`.
- `AppState` UI-state gains `activeLayerId?: string` — the layer new elements are created into,
  resolved against the active template (fallback: the frontmost layer).

## Stacking rule

Both the canvas renderer and the PDF exporter sort elements by **(layer.order asc, then
element.zIndex asc)**. `zIndex` now means *within-layer* stacking order.

- "Bring to front / send to back" operate among **same-layer siblings** only (adjust `zIndex`
  within the element's layer).
- Moving an element to another layer = set its `layerId` and place it at the top `zIndex` of the
  target layer.

## Migration v7 → v8

Files: `services/migration.ts` (bump `CURRENT_SCHEMA_VERSION` to `8`, add `migrateV7ToV8`),
`SCHEMA_CHANGELOG.md` (new entry).

For every template — across all variants **and** the legacy flat `templates` structure — create
a single default layer `{ id, name: "Layer 1", order: 0, visible: true, locked: false }` and set
every element's `layerId` to it. `zIndex` values are preserved untouched, so the migrated
document renders identically. The migration is idempotent.

**Documented caveat:** the first cloud save after migration rewrites each template (it now
carries `layers` and per-element `layerId`), so it registers once as a "template modified" entry
in version history / merge diffs. Expected and harmless — noted here so it isn't mistaken for a
bug.

**Belt-and-suspenders:** presets already flow through `migrateState` (`services/presets.ts`), so
they are covered automatically. Any *other* code path that creates a template or an element
(hierarchy generator, new-template action, element creation, paste/duplicate) must also assign a
valid `layerId` at creation so newly built content is never left untagged.

## Rendering & export (hidden-layer exclusion)

- `components/Canvas.tsx` (the render sort, currently at ~line 1429) and
  `services/pdfService.ts` (the export sort, currently at ~line 853): replace the single-key
  `zIndex` sort with the two-level sort above **and filter out elements whose layer has
  `visible: false`**.
- Thumbnails need no separate change — `services/thumbnailService.ts` renders via
  `generatePDF`, so the export-path filter covers canvas, PDF, and gallery thumbnails alike.
  "Hidden = excluded everywhere" (the approved behavior).

## Selection — three ways (all respect hidden & locked)

1. **Panel row click** — click an element's row in the Layers panel to select it regardless of
   what overlaps it on canvas. *This is the direct fix for the original problem.*
2. **Alt-click cycle** (`components/Canvas.tsx`, the selection hit-test at ~line 524) — a new
   point-in-bounds, rotation-aware hit-test collects the stack of elements under the cursor on
   **visible + unlocked** layers, ordered top→bottom; each Alt+click on the same spot steps one
   element deeper.
3. **Right-click "select under"** — a context menu listing that same stack (element name + type
   + layer), letting the user pick any one directly.

A shared helper `hitTestPoint(point, elements, layers)` (reusing the existing `getElementBounds`)
powers both the Alt-click cycle and the right-click menu. Elements on locked or hidden layers are
excluded from all three canvas selection paths; to edit a locked layer's elements the user
unlocks the layer first.

## Layers panel UI

Placement: a collapsible **"Layers"** panel in the **right-hand column**, alongside the existing
Properties panel, toggled from the toolbar.

Per **layer row**: eye (visibility) toggle, lock toggle, color chip, inline-editable name, and a
drag handle for reordering (`order`). Rows are foldable (`collapsed`).

Under each layer, its **element rows**: type icon + element name, click to select, current
selection highlighted. Elements can be dragged between layers (sets `layerId`), and a **"move
selection to layer"** action reassigns the current canvas selection in one step.

Clutter management for templates with many elements: **collapse** layer groups, a **search /
filter box** (by element name / type), and **color labels** for fast visual grouping.

## Validation (`server/validateAppState.js`)

Add light, optional checks that keep pre-migration states passing:

- `layers`, if present on a template, must be an array, capped (e.g. ≤ 200 per template).
- `layerId`, if present on an element, must be a string.

No new required fields — legacy/un-migrated states must still validate.

## Diff / merge — no engine change

`shared/diff.js` compares whole templates (`!eq(base[tid], side[tid])` marks a template
modified) rather than diffing individual elements. Layer data lives inside the template object,
so it rides along transparently: a layer edit simply reads as "template modified," exactly like
any other template change today. No changes to the diff, three-way-merge, or apply logic.

## Testing

- **Migration unit** — v7→v8 tags every element, produces exactly one default layer per
  template (variants + legacy flat), preserves `zIndex`, and is idempotent.
- **Sort/exclusion unit** — the two-level (layer.order, zIndex) sort and hidden-layer filtering,
  asserted on both the canvas render order and the PDF page element order.
- **`hitTestPoint` unit** — point-in-bounds correctness including rotated elements, and exclusion
  of hidden/locked layers.
- **Selection integration** — panel-row select, Alt-click cycle ordering (top→bottom), and
  right-click "select under" list contents.
- **Real-app verification** — per the repo's verify skill: exercise selecting a fully-covered
  element via all three paths, hide/lock/reorder layers, and confirm PDF export + thumbnail
  reflect hidden-layer exclusion.

## Out of scope (v1)

- Nested layers / layer folders (layers are a single flat level).
- Layer opacity / blend modes.
- Cross-template or cross-variant layer sharing.
