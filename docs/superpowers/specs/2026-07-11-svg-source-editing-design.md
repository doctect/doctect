# SVG Source Editing + Placeholder Insert — Design

**Date:** 2026-07-11
**Status:** Approved pending user review

## Goal

Make SVG elements editable in place. Today an SVG element's markup (`svgContent`) is write-once at import (`ProjectEditor.tsx` `handleImportSvg`); the only way to change artwork is re-import a file. Two additions:

1. When an SVG element is selected, the Element Properties panel shows its raw SVG markup in an editable textarea, applied live to the canvas.
2. The toolbar's SVG button becomes a dropdown with two actions: **Import SVG file…** (existing flow) and **Insert placeholder SVG** (minimal hand-editable markup, no file needed).

## Background constraints

- `TemplateElement.svgContent?: string` already holds raw markup (`types.ts`).
- Canvas rendering sanitizes with DOMPurify at the single render site (`CanvasElement.tsx`) — the stored-XSS fix from the gallery round. Raw user-typed markup therefore stays safe to store un-sanitized; sanitization remains a render-time concern. PDF export path (`pdfService.ts`) parses the markup itself and is not an HTML injection surface.
- Element property UI lives in `components/properties/SingleElementEditor.tsx`, branched on `element.type`. Panel already uses `CollapsibleSection`.
- Import warns at >100 KB markup; the editor keeps the same threshold as a displayed size hint.

## Design

### 1. SVG Source section (`SingleElementEditor.tsx`)

Rendered only for `element.type === 'svg'`, as a `CollapsibleSection` titled "SVG Source", expanded by default.

- **Local draft state** seeded from `element.svgContent`, keyed by element id: switching selection to another element re-seeds the draft (and discards any invalid in-flight text). External changes to `svgContent` (undo/redo, restore) also re-seed when they differ from the last committed value.
- **Textarea:** monospace, ~10 rows, resizable vertically, spellCheck off.
- **Live debounced apply (~400 ms):** after typing pauses, parse the draft with `DOMParser.parseFromString(text, 'image/svg+xml')`.
  - Root element must be `<svg>` and the document must contain no `parsererror` node.
  - **Valid:** commit to `element.svgContent` through the existing element-update path. `saveToHistory()` once per edit burst (on the first commit after the textarea last held the committed value), not per keystroke — one undo step per editing session between focus changes.
  - **Invalid:** show a red inline message under the textarea ("Invalid SVG — canvas shows last valid version"), do not commit. Canvas keeps rendering the last valid markup.
- **Size hint:** current byte length shown (e.g. "2.4 KB"); turns amber above 100 KB to mirror the import warning. No hard cap here — the 5 MB `validateAppState` cap still guards cloud saves.
- Element `w`/`h` are untouched by source edits; the SVG scales into the element's box exactly as imported SVGs do today.

### 2. Toolbar SVG dropdown (`EditorToolbar.tsx`, `ProjectEditor.tsx`)

Replace the single Import-SVG `ToolButton` with a dropdown trigger (same `FileImage` icon plus a small chevron), following the click-outside dropdown pattern used by `AccountMenu`/`CloudMenu`:

- **Import SVG file…** — clicks the existing hidden file input; `handleImportSvg` unchanged.
- **Insert placeholder SVG** — new `onInsertSvgPlaceholder` prop, handled in `ProjectEditor`.

Placeholder markup:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" rx="8" fill="#4f46e5" />
</svg>
```

Inserted as a 100×100 element at (20, 20), selected on insert, `tool: 'select'`. The element-placement tail of `handleImportSvg` (active-layer resolution via `resolveActiveLayerId`, `nextZIndexInLayer`, history save, selection) is extracted into a shared `insertSvgElement(svgText, w, h)` helper used by both import and placeholder paths, so placement rules cannot drift.

### 3. Testing

Unit (vitest + testing-library, alongside `canvasElementSvgSanitize.test.tsx`):

- SVG Source section renders for svg elements only; textarea shows current `svgContent`.
- Valid edit commits after debounce; canvas-bound state updated once, single history entry per burst.
- Invalid edit: error shown, `svgContent` unchanged.
- Selection change re-seeds draft.
- Toolbar dropdown: both actions present; placeholder action creates an svg element with the placeholder markup, correct layer/zIndex, and selects it.

Manual real-browser verification (per house method): insert placeholder, edit fill color in the textarea, watch canvas update live; type broken markup, confirm error + stable canvas; undo collapses one edit burst.

## Out of scope

- Syntax highlighting / modal editor (revisit if inline proves cramped).
- Auto-resizing the element when the viewBox changes.
- Any server or schema change — `svgContent` already exists; no migration.
