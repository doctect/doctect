# Pattern Preview Fidelity Follow-up Design

**Date:** 2026-07-15
**Status:** Approved
**Builds on:** `docs/superpowers/specs/2026-07-14-generator-visual-preview-design.md`

## Goal

Make line and dot pattern fills remain readable and consistent in scaled canvas views, especially Hierarchy Generator thumbnails, while retaining one shared production renderer. Rename the preview action from **Create New Project** to **Create As New Project**. Add the already documented but missing diagonal-line pattern implementation.

## Root Cause

Generator output and preview descriptors retain pattern data correctly. The failure occurs when the shared page surface scales CSS gradients:

- A 1 px source line becomes roughly 0.13 px in a 1404 × 1872 thumbnail and roughly 0.29 px in an A4 thumbnail.
- Hard-stop radial gradients for dots can disappear entirely after subpixel rasterization.
- Visibility changes with fit scale and device pixel ratio, producing inconsistent cards even though editor and preview use the same element data.
- `lines-d` exists in `PatternType` and generator guidance but has no viewport or PDF renderer branch.

## Chosen Behavior

Use a scale-aware screen minimum in every scaled canvas rendering path:

- Horizontal, vertical, and diagonal lines have a minimum visible thickness of 1 screen pixel.
- Dots have a minimum visible diameter of 1.5 screen pixels and a narrow antialiased edge so subpixel phase does not erase them.
- Source pattern weight remains authoritative whenever it already renders above the minimum.
- Pattern spacing remains unchanged. This preserves intended density rather than enlarging the whole pattern.
- At scale 1 or above, normal source dimensions remain unchanged unless the source weight itself is below the screen minimum.
- Template data, saved state, generator source, and PDF source dimensions are never rewritten.

This deliberately favors legibility at low zoom. Very thin patterns can look slightly heavier in thumbnails, but the same rule applies to editor zoom and visual previews, avoiding preview/editor divergence.

## Architecture

### Shared viewport pattern style

Extract the duplicated shape and grid-cell CSS gradient construction into one pure viewport helper. It accepts:

- pattern type
- color
- source spacing
- source weight
- current render scale

It returns the CSS background properties for `lines-h`, `lines-v`, `lines-d`, or `dots`. Invalid/non-positive render scale falls back to 1. Existing default spacing and weight behavior remains compatible.

Effective viewport source weight is derived from screen minimum divided by render scale:

```text
effectiveLineWeight = max(sourceWeight, 1 / renderScale)
effectiveDotDiameter = max(sourceWeight, 1.5 / renderScale)
```

The dot gradient uses a short color-to-transparent transition near the effective radius instead of two identical hard stops.

### Scale propagation

`CanvasElement` gains an optional render-scale input with a default of 1.

- `ReadOnlyPagePreview` passes its scale to default `CanvasElement` rendering.
- Editor `Canvas` passes the same scale through its custom interactive `CanvasElement` callback.
- Generator thumbnail and lightbox rendering already flow through `ReadOnlyPagePreview`, so they receive the same behavior without preview-only branches.

### Diagonal lines

Viewport rendering adds `lines-d` as a 135-degree repeating linear gradient using the same spacing and effective line-weight rules.

PDF rendering adds clipped diagonal strokes covering the element bounds. PDF uses the source pattern spacing and source weight, not viewport screen-minimum values, because exported dimensions must remain physical and zoom-independent.

Both normal elements and grid cells use diagonal patterns.

## UI Copy

Change only the Generator Visual Preview decision action:

- Old: **Create New Project**
- New: **Create As New Project**

The naming dialog remains **Create Generated Project**, and its submit button remains **Create Project**. The unrelated global New Project flow is unchanged.

Update current help text, advanced-feature docs, unit tests, and browser locators to use the new action label. Historical specifications and implementation plans remain historical records and need not be rewritten.

## Error Handling and Compatibility

- No schema, persistence, sandbox, generated-state limit, or runtime dependency changes.
- Pattern style generation remains display-only and cannot mutate elements.
- Existing valid horizontal, vertical, and dot patterns keep their source spacing and color.
- Existing PDF horizontal/vertical/dot output remains unchanged.
- Pattern validation changes are out of scope; this follow-up addresses valid documented pattern values.

## Testing

### Pure/unit coverage

- Source weight above the screen minimum remains unchanged.
- Low-scale lines clamp to exactly 1 screen pixel after scaling.
- Low-scale dots clamp to 1.5 screen pixels and include an antialias transition.
- Invalid scale falls back safely.
- Horizontal, vertical, diagonal, and dot CSS styles are generated.
- Shapes and grid cells consume the same helper output.
- `ReadOnlyPagePreview` and interactive `Canvas` propagate render scale.
- PDF diagonal pattern draws inside the requested bounds while existing pattern tests remain unchanged.
- Visual-preview component tests expect **Create As New Project** and retain naming validation behavior.

### Browser coverage

Extend the visual-preview fixture with representative line, dot, and diagonal pattern elements. In Chromium:

- Patterned thumbnails render non-empty pattern regions at fit scale.
- Lightbox still renders the same template.
- **Create As New Project** opens the existing naming dialog.

Use behavioral/test-id locators rather than Tailwind classes. Keep existing browser workflow assertions for Back, Create, Replace, source retention, and Undo.

## Acceptance Criteria

1. Thin line and dot patterns remain visibly consistent in Generator Visual Preview thumbnails at reMarkable and A4 fit scales.
2. Editor low-zoom rendering and generator previews use the same scale-aware pattern rule.
3. Pattern spacing, source state, and generator source remain unchanged.
4. Horizontal, vertical, diagonal, and dot patterns work for normal elements and grid cells.
5. Diagonal patterns render in PDF using source dimensions.
6. Preview action reads **Create As New Project**; naming dialog and submit labels remain unchanged.
7. Existing generator safety, history, project-preservation, accessibility, and publication behavior do not regress.
