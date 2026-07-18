# Static Text Padding Design

**Date:** 2026-07-18
**Status:** Approved in conversation; awaiting written-spec review
**Package:** Element Properties Package 2

## Objective

Add independent top, right, bottom, and left padding to fixed-size static text elements. Padding must affect the same text content rectangle in Canvas preview, inline editing, and PDF output without changing outer element geometry.

Package 1 already added the text-only `Auto width` control and collapsible Element Properties sections. This package adds padding controls to the existing Typography section and reuses the shared fixed-text overflow layout introduced in schema v10.

In this specification, **fixed-size text** means any element with `type === 'text' && !autoWidth`, whether its content is literal or data-bound. “Static text padding” distinguishes this feature from grid-cell and shape-caption text; it does not exclude data-bound text elements.

## Goals

- Persist four nonnegative decimal padding values on text elements.
- Start the UI in linked mode while allowing independent side editing.
- Support homogeneous text multi-selection, including mixed side values.
- Keep padding dormant while auto-width is enabled and restore it when fixed-size mode returns.
- Apply padding consistently to fixed-text clip, ellipsis, shrink, visible, and wrap behavior.
- Keep Canvas and PDF content geometry identical.
- Preserve full source access in the inline text editor.
- Migrate existing projects without changing their rendered appearance.

## Non-Goals

- Grid-cell padding.
- Shape-caption padding.
- Auto-width text measurement changes.
- Padding for SVG or non-text elements.
- Changes to outer element dimensions, background, border, selection bounds, rotation origin, opacity, or link bounds.
- New database tables, SQL migrations, packages, or dependencies.

## Chosen Architecture

Use a nested schema-v11 `textPadding` object and one shared content-box geometry service consumed by Canvas, PDF, editing, migration, generators, presets, and property controls.

This avoids four unrelated top-level fields and prevents Canvas/PDF coordinate formulas from drifting. Existing shared text layout remains responsible only for line layout inside supplied content dimensions; it does not learn about elements or padding.

Rejected alternatives:

1. **Four top-level fields** — mechanically simple, but expands `TemplateElement`, makes atomic updates noisier, and provides no clear boundary for normalization.
2. **Renderer-local padding calculations** — fewer initial files, but duplicates normalization and geometry across Canvas, PDF, and editing, making parity failures likely.

## Schema

Add these types to `types.ts`:

```ts
export interface TextPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TemplateElement {
  // Existing fields...
  textPadding?: TextPadding;
}
```

`textPadding` remains optional in TypeScript so legacy objects and focused test fixtures continue to type-check. Canonical schema-v11 text elements contain all four sides explicitly.

Padding values use existing document layout units. Valid values are finite numbers greater than or equal to zero; decimals are preserved without rounding and no upper limit is imposed.

## Padding and Geometry Service

Create a focused `services/textPadding.ts` module with these responsibilities:

- define the canonical four-zero padding value;
- normalize one padding object;
- resolve canonical padding from a text element;
- normalize text elements/templates/project state at persistence boundaries; and
- calculate the fixed-text local content box.

The content-box result has this shape:

```ts
interface TextContentBox {
  padding: TextPadding;
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Calculation is exact:

```ts
x = padding.left
y = padding.top
width = Math.max(0, element.w - padding.left - padding.right)
height = Math.max(0, element.h - padding.top - padding.bottom)
```

The helper does not clamp `x` or `y` to element bounds. Therefore oversized top or left padding retains its requested origin while the exhausted axis has zero content size.

Missing, malformed, negative, infinite, or `NaN` sides normalize independently to `0`. Normalization never mutates caller-owned objects. Non-text renderers do not interpret `textPadding`.

## Migration and Defaults

Increment `CURRENT_SCHEMA_VERSION` from 10 to 11 and add a sequential v10 → v11 migration.

Migration behavior:

- Deep-clone the project like existing migrations.
- Visit variant templates and the legacy flat `templates` shape.
- Set every text element to `{ top: 0, right: 0, bottom: 0, left: 0 }`.
- Replace any pre-v11 experimental `textPadding` value instead of treating it as canonical data.
- Leave grid and other element rendering unchanged.
- Set `schemaVersion` to 11.

After sequential migration, normalize all current-v11 text padding defensively. This covers malformed current-version imports and in-memory/generated states. Unsupported future schema versions retain the existing pass-through behavior.

All text creation boundaries produce explicit zero padding:

- direct Canvas/editor text creation;
- preset normalization;
- generator-template normalization;
- generated project state validation; and
- imported templates/projects after migration and normalization.

Existing projects render identically after migration because zero padding recreates the schema-v10 full-element text content rectangle.

## Canvas Rendering

Only fixed-size elements with `type === 'text' && !autoWidth` use the padded path.

For each eligible element:

1. Resolve the shared content box.
2. Pass its width and height to the existing shared text-layout session.
3. Position the text-line container at local content-box `x/y`.
4. Render layout line coordinates relative to that container.
5. Use content-box width and height for clipping when layout requests clipping.

`visible` mode keeps `overflow: visible`, so glyphs may escape both the content box and outer element. Clip, ellipsis, shrink, and wrapping use the padded dimensions. Zero content width or height returns no rendered layout lines.

The outer background, border, transform, opacity, selection hit area, and resize handles continue using full element bounds. Auto-width text, grids, and shape captions retain their existing branches.

## PDF Rendering

Fixed-text PDF rendering resolves the same content-box helper before calling the existing PDF text-layout session.

- Layout receives content-box width and height.
- Drawing receives `x = element local x + contentBox.x` and `y = element local y + contentBox.y` with content-box dimensions.
- Clip rectangles use the padded box.
- Rotation continues through the existing element transform path.
- URL and internal link annotations continue using full element bounds, even when no glyph is drawn.

No second PDF-specific inset is applied. Grids retain their current one-unit horizontal cell inset, and shape captions retain their existing native path.

## Inline Editing

Fixed-text inline editing begins at the padded content-box origin and uses its dimensions. Editing deliberately does not apply view-mode clip, ellipsis, or shrink behavior:

- the editor uses `overflow: visible`;
- the complete source remains editable;
- existing fixed-text editing wrap behavior remains unchanged; and
- alignment and typography continue using existing editor behavior inside the padded box.

When either content dimension is zero, the editor exposes a minimal visual/editable surface at the padded origin. This surface is editing-only and does not alter stored element or content-box dimensions.

Auto-width editing ignores stored padding completely. Padding remains stored and becomes active again if the element returns to fixed-size mode.

## Property Controls

Add a compact `Padding` group inside Typography. It appears only when the selection contains text elements exclusively.

The group contains:

- Top, Right, Bottom, and Left number inputs;
- a linked/unlinked toggle; and
- disabled-state guidance when padding is dormant.

Inputs use decimal number semantics with `min="0"` and no maximum. Negative accepted input clamps to `0`. Blank, incomplete, or malformed drafts do not mutate document state; they reset to the current normalized value when editing ends.

The link toggle is panel UI state, not document data. It initializes to linked whenever the selected element-ID set changes. It is not exported, persisted, or recorded in history.

Padding controls enable only when every selected text element is fixed-size. All-auto-width and mixed fixed/auto-width selections show normalized values but disable editing and explain that padding applies only to fixed-size text.

## Multi-Selection and Updates

Each side is aggregated independently from normalized padding values across selected text elements:

- matching values display normally;
- mixed values display an empty input with a `Mixed` placeholder; and
- nested-object reference identity is never used for comparison.

In linked mode, accepting a value in any side writes that value to all four sides of every selected text element.

In unlinked mode, accepting a side value uses the existing functional multi-update path. It changes only that side while preserving each selected element's own other three values.

Each accepted input change updates all selected elements through one document update and one corresponding history action. Switching auto-width never clears or rewrites padding.

## Data Flow

1. Project load/import/generation reaches schema-v11 padding normalization.
2. Property controls resolve per-side display values from selected elements.
3. Accepted control input writes canonical nested padding through the existing element-update/history path.
4. Canvas derives one content box and supplies it to shared browser text layout.
5. PDF derives the same content box and supplies it to shared PDF text layout.
6. Inline editing derives the same origin and dimensions but renders full editable source rather than overflow-policy output.

Shared geometry, not duplicated renderer arithmetic, is the parity boundary.

## Validation and Error Handling

Client-side normalization guarantees invalid values never reach CSS dimensions or PDF layout.

For schema v11 and later, server validation checks any supplied text-element `textPadding` value. If present, it must be a non-array object containing finite, nonnegative numeric `top`, `right`, `bottom`, and `left` fields. Malformed supplied padding is rejected with a template-scoped validation error. Missing padding remains accepted at this light server-validation boundary and is filled by client normalization.

Oversized finite padding is valid, stored unchanged, and not warned about. Exhausted content dimensions safely skip view-mode text layout. Existing layout-session warning and font-fallback behavior remains unchanged.

## Test Strategy

### Unit and Service Tests

- Padding normalization: missing object, missing sides, malformed types, negatives, infinities, `NaN`, decimals, immutability, and canonical values.
- Content-box geometry: asymmetric values, decimals, exact exhaustion, oversized axes, and unchanged outer dimensions.
- v10 → v11 migration: variant templates, legacy flat templates, all text modes, pre-v11 experimental values, non-text elements, idempotent current-v11 normalization, and future-schema pass-through.
- Text creation, presets, generator templates, generated state, imports, snapshots, and server validation.

### Canvas and Editing Tests

- Fixed-text layout requests use padded width/height.
- Rendered line container starts at padded origin.
- Clip and visible modes use the correct content rectangle.
- Horizontal and vertical alignment remain relative to the padded box.
- Zero-axis content renders no view-mode text.
- Inline editor starts at padded origin, exposes full source, supports zero-area recovery, and bypasses padding for auto-width text.

### PDF and Parity Tests

- PDF layout and draw calls use the same dimensions and offsets as Canvas.
- Clip, ellipsis, shrink, visible, and wrapping honor asymmetric padding.
- Rotation, text decoration, font fallback, and full-element links retain existing behavior.
- Shared parity fixtures compare Canvas and PDF layout requests for each overflow mode.

### Property Panel Tests

- Linked and unlinked edits.
- Per-side mixed values.
- All-fixed, all-auto-width, and mixed-mode disabled states.
- Independent preservation of unedited sides across multi-selection.
- One multi-element document/history update per accepted edit.
- Link-state reset on selection change.
- Padding persistence across auto-width conversion.

### Verification

- Focused unit/component tests.
- Full serial Vitest suite.
- Production build.
- TypeScript check with no diagnostics beyond the documented five-diagnostic baseline.
- Focused Chromium workflow covering linked padding, independent padding, auto-width dormancy, Canvas rendering, and inline editing.
- WebKit remains optional locally because its executable is unavailable.

## Acceptance Criteria

- Users can set linked or independent padding on one or multiple fixed-size text elements.
- Padding never changes outer `w/h`.
- Auto-width text ignores but preserves padding.
- Every fixed-text overflow mode uses padded dimensions in both Canvas and PDF.
- Inline editing starts at padded origin and never hides source through overflow policy.
- Oversized padding persists and yields no view-mode text when either content axis is exhausted.
- Existing schema-v10 projects migrate to visually identical zero-padding schema-v11 projects.
- Grids, shape captions, links, selection geometry, and non-text renderers show no behavioral regression.
