# Element Properties Auto-Width and Collapsible Sections Design

**Status:** Approved
**Date:** 2026-07-18
**Package:** 1 of 2
**Schema:** unchanged at v10

## Goal

Improve Element Properties usability by:

1. letting users switch text elements between auto-width and fixed-size behavior without recreating them; and
2. making every top-level Element Properties subsection collapsible with session-scoped disclosure state.

This package creates the property-panel structure that Package 2 will later use for static-text padding controls.

## Scope

### In scope

- A text-only `Auto width` toggle in Typography.
- Auto-width to fixed-size conversion that freezes the element's stored width and height.
- Fixed-size to auto-width conversion that immediately measures current rendered preview content.
- Independent auto-sizing of multiple selected text elements.
- Collapsible Grid Configuration, Geometry, Appearance, Typography, Interaction, and SVG Source sections.
- All sections expanded by default.
- Expanded state retained across element selections for the current mounted editor session.
- Existing project-history behavior: one document update/checkpoint per mode change and none for section disclosure.
- Unit, integration, and focused browser coverage.

### Out of scope

- Text padding implementation or schema fields.
- Grid-cell auto-width behavior.
- Auto-width behavior for shape captions.
- Changes to auto-width PDF or Canvas rendering semantics beyond selecting the existing auto-width versus fixed-size path.
- Changes to width/height input behavior.
- Browser-session persistence of disclosure state.
- Last-used auto-width preferences.
- New database tables, migrations, or server persistence.

## Existing Behavior

- Click-created text sets `autoWidth: true`; drag-created text is fixed-size.
- Resizing a text element already converts it to fixed-size and preserves resized `w/h`.
- Property and inline text edits resize auto-width text using measured content, a 25-unit width buffer, and a 20-unit minimum height.
- No user-facing control currently changes `autoWidth` directly.
- Auto-width text bypasses the shared overflow layout engine; fixed-size text uses it.
- Element Properties subsection bodies are always visible except SVG Source, which owns local disclosure state.
- `PropertiesPanel` already retains other disclosure state, such as Template Settings, for its mounted session.

## Architecture

### 1. Session-scoped disclosure controller

`PropertiesPanel` owns a controlled state map keyed by:

```ts
export type ElementPropertySectionKey =
  | 'grid'
  | 'geometry'
  | 'appearance'
  | 'typography'
  | 'interaction'
  | 'svgSource';
```

Every key initializes to `true`. A stable toggle callback changes only the selected key. State is independent of selected element IDs, so a collapsed section stays collapsed while users select other elements. Conditional sections retain their value while absent and restore it when applicable again.

State remains React session state only. It is not written to `AppState`, history, local storage, cloud state, presets, generated projects, or JSON exports.

### 2. Compact collapsible subsection primitive

Extend the existing `CollapsibleSection` with a compact subsection presentation while preserving its current default presentation and existing callers. The compact presentation provides:

- a native full-width `button`;
- right/down chevron;
- optional existing section icon;
- exact section title;
- `aria-expanded`;
- conditionally rendered body that contributes no layout height while collapsed; and
- compact spacing compatible with current `SingleElementEditor` headings.

`SingleElementEditor` receives the controlled state, toggle callback, and a `selectionIsTextOnly` flag derived from the real selected elements rather than the synthetic multi-edit element. Grid Configuration, Geometry, Appearance, Typography, and Interaction use the compact presentation.

`SvgSourceSection` also receives controlled `expanded/onToggle` values. Its component remains mounted while its body is collapsed, preserving its internal draft, validation error, focus-session, and commit state.

The outer `Element Properties` heading and delete action remain always visible and are not another collapsible section.

### 3. Shared preview-text resolution

Move the current Canvas text interpolation/binding resolution into one renderer-independent helper used by both:

- `CanvasElement` when it resolves displayed text; and
- auto-width conversion when it measures current preview content.

For text with `dataBinding`, fixed-to-auto conversion uses the value displayed for the current selected node. Template interpolation follows the same fallback and traversal behavior as Canvas rendering. Each selected text element resolves its own source independently.

This extraction must preserve existing Canvas output byte-for-byte at the resolved-string level.

### 4. Browser auto-width measurement helper

Add one focused browser helper:

```ts
export interface AutoWidthMeasurement {
  w: number;
  h: number;
}

export function measureAutoWidthText(
  text: string,
  element: Pick<TemplateElement,
    'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle'>,
  documentRef?: Document,
): AutoWidthMeasurement | null;
```

The helper:

- creates one hidden, absolutely positioned `inline-block` probe;
- uses `white-space: pre` so soft wrapping is disabled and explicit newlines are retained;
- applies the same resolved font family, size, weight, style, and line height used by auto-width Canvas text;
- uses zero padding;
- measures a single space for an empty string;
- returns `w = ceil(offsetWidth + 25)`;
- returns `h = max(20, ceil(offsetHeight))`;
- rejects non-finite or non-positive final dimensions;
- removes the probe in `finally`; and
- returns `null` when DOM creation, attachment, measurement, or cleanup cannot safely complete.

The existing property-text edit path uses this helper too, eliminating duplicate hidden-probe logic and ensuring typing and mode conversion produce identical dimensions. Inline overlay editing continues measuring its live editor node because that node is already the authoritative current edit surface.

## Auto-Width Toggle Semantics

### Visibility and copy

- The toggle appears in Typography only when every selected editable element is `type === 'text'`.
- It never appears for grids, grid cells, shapes with captions, SVGs, or mixed-type selections.
- Accessible label: `Auto width`.
- Off means fixed-size text.
- Existing overflow and wrap controls remain visible. They are enabled for fixed-size text and disabled with their existing explanation for auto-width text.

### Auto-width to fixed-size

For each selected text element:

```ts
{ autoWidth: false }
```

No geometry is recalculated. Existing `x`, `y`, `w`, `h`, rotation, transform origin, typography, source text, binding, overflow, and wrap fields remain unchanged. The element immediately begins using existing fixed-size Canvas and PDF layout with its stored dimensions.

### Fixed-size to auto-width

For each selected text element independently:

1. Resolve the current preview string for the active node.
2. Measure with that element's typography.
3. If measurement succeeds, apply one atomic update containing `autoWidth: true`, measured `w`, and measured `h`.
4. If measurement fails, apply `autoWidth: true` while preserving that element's existing positive finite `w/h`. Invalid existing width falls back to `max(10, fontSize)`; invalid existing height falls back to `max(20, fontSize * 1.5)`.

No selected element copies another selected element's text, dimensions, or measurement result.

The update uses the existing functional `onUpdate` path so multi-selection applies the correct calculation to each previous element. One user toggle creates one history-bearing `onUpdateElements` call, even when multiple text elements change.

### Mixed auto-width values

When selected text elements contain both enabled and disabled values, the native checkbox exposes `indeterminate = true` and `aria-checked="mixed"`. Activating it enables auto-width for all selected text elements and independently resizes each. A subsequent activation disables auto-width for all and freezes each current box.

## Collapsible Section Behavior

- All six section keys start expanded when `PropertiesPanel` mounts.
- Clicking or keyboard-activating a header toggles that body only.
- Focus remains on the disclosure button.
- Disclosure choices survive element selection changes while `PropertiesPanel` remains mounted.
- Choices reset to all expanded after editor/page remount or reload.
- Hiding a conditional section does not reset its disclosure value.
- Section toggles do not call `onUpdate`, `onUpdateElements`, history, local storage, analytics, or server APIs.
- Collapsing Typography does not alter selection or stop Canvas text rendering.
- Collapsing SVG Source does not discard its current draft or validation state.

## Data and Compatibility

- No schema version change: `TemplateElement.autoWidth` already exists.
- No migration or normalization change.
- Existing documents preserve their current modes.
- Existing click/drag creation defaults remain unchanged.
- Existing resize-to-fixed behavior remains unchanged.
- JSON, presets, generated projects, cloud snapshots, diffs, and server validation need no new field handling.
- Auto-width conversion naturally selects existing Canvas and PDF routes through persisted `autoWidth`.

## Error Handling

- DOM measurement failure never leaves a probe attached.
- Measurement failure never creates `NaN`, infinity, zero, or partial geometry.
- A failed measurement does not block changing mode; existing finite geometry is retained.
- Text resolution failure falls back to the same empty-string behavior as Canvas rendering.
- One element's measurement failure does not prevent other selected text elements from converting.
- Disclosure rendering or toggling cannot mutate project state.

## Testing

### Auto-width measurement unit tests

- Literal single-line text uses exact typography and existing width buffer/minimum height.
- Explicit newlines increase height without soft wrapping.
- Empty content measures a single-space fallback.
- Font family, size, weight, style, and line height reach the probe.
- Probe removal occurs after success and thrown measurement access.
- Non-finite/non-positive measurements return `null`.
- Source element and source text remain unchanged.

### Toggle integration tests

- Auto-width to fixed preserves exact `w/h` and all unrelated fields.
- Fixed to auto immediately writes measured `w/h`.
- Data-bound text measures current active-node preview value, not the binding token.
- Multiple selected text elements receive independent measurements in one history update.
- Mixed auto-width values resolve through one explicit user action.
- Failed measurement preserves each previous `w/h` while enabling auto-width.
- Toggle is absent for grids, captions, and mixed-type selections.
- Overflow/wrap controls enable and disable immediately with mode.
- Existing Canvas fixed/native routing and PDF fixed/native routing remain selected solely by `autoWidth`.

### Collapsible subsection tests

- Every applicable section starts expanded and reports `aria-expanded="true"`.
- Each header hides only its own body and updates accessibility state.
- A collapsed choice survives selection of another element.
- Conditional Grid Configuration and SVG Source restore prior disclosure values.
- All choices reset after `PropertiesPanel` remount.
- Section toggles call no document/history update.
- SVG draft and validation error survive collapse and expansion.
- Existing Template Settings and Layers disclosure behavior remains unchanged.

### Verification

- Focused unit/component tests.
- Full Vitest suite.
- Production build.
- TypeScript check with no diagnostics beyond the documented baseline.
- Focused Chromium test covering toggle conversion, section collapse, selection changes, and history behavior.

## Deferred Package 2 Requirements

Package 2 receives a separate design/spec/plan after Package 1 is complete. Agreed requirements carried forward:

- Static text only; padding controls are disabled while auto-width is enabled.
- Four persisted sides: top, right, bottom, left.
- UI starts linked; editing one linked value updates all four. Unlinking permits independent values.
- Padding edits never change element `w/h`.
- Padding changes the inner text content rectangle and text origin only.
- Fixed-text clip, ellipsis, wrap, shrink, and visible behavior uses the padded content rectangle in both Canvas and PDF.
- Oversized padding remains stored; exhausted content dimensions clamp to zero and render no text on that axis.
- Padding remains dormant while auto-width is enabled and reactivates after conversion to fixed-size.
- Package 2 will decide schema versioning, normalization, editing-overlay behavior, exact numeric constraints, and shared Canvas/PDF geometry interfaces.
