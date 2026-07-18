# Configurable Text Overflow Rendering Design

**Status:** Approved
**Date:** 2026-07-18
**Schema:** v10

## Goal

Give fixed-size text elements and grid cells explicit, persisted overflow and wrapping behavior that renders with the same layout rules on Canvas and in PDF output.

Success means users can choose `clip`, `ellipsis`, `shrink`, or `visible`, independently choose wrapping, and trust Canvas preview and PDF export to make the same line-breaking, truncation, font-sizing, alignment, and clipping decisions for equivalent font metrics.

## Non-goals

- Changing auto-width text sizing, wrapping, editing, or alignment behavior.
- Automatically resizing element or grid-cell boxes to fit content.
- Rich text, hyphenation, language-aware line breaking, or per-run font sizes.
- Applying these controls to captions on `rect`, `ellipse`, `triangle`, or other shapes. A visually shape-like element remains in scope only when its `type` is `text`; shape elements that happen to carry `text` or `dataBinding` keep current behavior.
- Changing grid geometry. Grid `w` and `h` remain one cell's fixed width and height.
- Pixel-identical font rasterization between browser and jsPDF. Parity covers policy and layout decisions using each renderer's actual font metrics.
- Any server database schema or data migration.

## Current Mismatch

- Canvas fixed-size text uses visible overflow and `pre-wrap`, so it wraps and may paint outside `w x h`.
- Canvas grid cells use hidden overflow plus single-line truncation.
- PDF fixed-size text uses `splitTextToSize`, wraps regardless of a user policy, and draws every line without height clipping, so text spills vertically.
- PDF grid cells issue one unbounded `doc.text` call, so long labels spill into adjacent cells.
- Browser-native wrapping/truncation and jsPDF-native splitting do not share an algorithm, making edge cases, explicit newlines, and long words inconsistent.
- Auto-width text currently uses an effectively unbounded line and grows its box from content. That behavior must not change.

## UX Contract

All four modes are offered. `Clip` is the default for newly created text and grids. Wrapping is a separate control.

| Mode | User-visible behavior |
| --- | --- |
| `clip` | Keep base font size and box size. Apply wrap policy, then clip painting to the local content box. |
| `ellipsis` | Keep base font size and box size. With wrapping off, show at most one line. With wrapping on, use available full lines and ellipsize the final visible line. Always safety-clip. |
| `shrink` | Keep box size. Apply wrap policy and choose the largest font size that fits both dimensions. No user-visible minimum font size. Grid cells size independently. |
| `visible` | Keep base font size and box size. Apply wrap policy and do not clip text. |

`textWrap` controls soft wrapping only. Explicit newline characters remain hard content boundaries. Every mode uses line-height `1.2`.

Auto-width text ignores both fields and retains its current no-soft-wrap, content-sized behavior. Typography controls remain visible but disabled, with: "Auto-width text sizes to content; overflow and wrap apply only to fixed-size text."

Overflow never changes source text. Switching modes is reversible. Shrink's computed font size is render-only and never writes back to `TemplateElement.fontSize`.

## Data Model

Add two optional shared typography fields to `TemplateElement` in `types.ts`:

```ts
export type TextOverflow = 'clip' | 'ellipsis' | 'shrink' | 'visible';

export interface TemplateElement {
  // Existing fields...
  textOverflow?: TextOverflow;
  textWrap?: boolean;
}
```

The fields are stored on `TemplateElement` because text and grid already share typography. They are interpreted only for `type === 'text' && !autoWidth` and `type === 'grid'`. Auto-width text can carry normalized values, but renderers ignore them. Other element types neither gain defaults nor interpret these fields.

Canonical defaults are:

| Context | Text | Grid |
| --- | --- | --- |
| New or normalized v10 content | `clip`, wrap `true` | `clip`, wrap `false` |
| Migrated v9 content | `visible`, wrap `true` | `ellipsis`, wrap `false` |

New click-created auto-width text is stamped `clip` plus wrap `true`; those values remain dormant until the element becomes fixed-size. Drag-created fixed text uses the same defaults.

## Migration And Normalization

`CURRENT_SCHEMA_VERSION` becomes `10`. A sequential `migrateV9ToV10` traverses every template in every variant and the legacy flat `templates` shape:

- Every text element receives `textOverflow: 'visible'` and `textWrap: true`, including auto-width text. Auto-width rendering still ignores both.
- Every grid element receives `textOverflow: 'ellipsis'` and `textWrap: false`.
- Every other element object remains byte-for-byte unchanged by this migration; only the containing state version changes.
- v9 values are assigned unconditionally, even if a v9 document happens to contain same-named experimental fields. Schema v9 did not define those fields; preserving known v9 Canvas appearance takes precedence.
- The migration sets `schemaVersion: 10` and remains idempotent through the normal sequential migration entry point.

This mapping preserves existing Canvas appearance: text remains wrapped and visible; grids remain single-line and truncated. PDF output intentionally changes to match that preserved Canvas contract.

A shared `normalizeTextOverflow` pass canonicalizes v10 content. For every text or grid element:

- Preserve `textOverflow` only when it exactly matches one of the four enum values; otherwise use that element type's new-content default.
- Preserve `textWrap` only when it is a boolean; otherwise use that element type's new-content default.
- Normalize auto-width text fields too, while continuing to ignore them at render time.
- Leave all fields on other element types untouched.

Normalization returns a normalized clone, is idempotent, and does not use truthiness or string coercion. `null`, unknown strings, numbers, and string booleans are malformed. A v9 migration runs first and produces valid legacy values; the subsequent normalizer therefore preserves them. A state whose version is exactly v10 is normalized even though it needs no version bump. Future versions greater than 10 retain existing forward-version handling and are not downgraded or rewritten as v10.

Renderers and property controls also use one non-mutating `resolveTextOverflowSettings(element)` helper. It applies the same canonical defaults without rewriting state, so unsupported future-version documents and transient programmatic elements remain safe even when migration intentionally leaves their state untouched.

All external load paths continue to converge through `migrateState`/`loadProjectState`, including local projects, JSON import and JSON editor apply, custom presets, cloud history restore/clone, gallery open/fork, and merge-request previews. This ensures malformed or incomplete v10 input cannot reach a renderer.

## Schema Version Touchpoints

Implementation must audit all exact-current-version references, not only `services/migration.ts`:

- `types.ts`: add `TextOverflow` and optional fields.
- `services/migration.ts`: set current version 10, add v9 to v10 migration, and run v10 normalization on already-current input.
- `services/loadProjectState.ts`: retain the central load boundary; its returned state must be normalized.
- `pages/EditorPage.tsx`, `components/JsonModal.tsx`, `components/cloud/HistoryModal.tsx`, and `pages/MergeRequestPage.tsx`: retain their existing central load/migration calls and add regression coverage that v10 normalization is not bypassed.
- `services/validateGeneratedProject.ts`: normalize generated text/grid elements before constructing a typed project; update `GeneratedProject.schemaVersion` from literal 9 to 10.
- `services/generatedProjectState.ts`: replace the literal v9 stamp with v10/current-version output, after normalized variants are installed.
- `services/presets.ts`: normalize built-in, variants-shaped, flat, and custom preset templates before stamping v10. Preserve its deep-clone and layer-normalization guarantees.
- `components/ProjectEditor.tsx`: its existing `CURRENT_SCHEMA_VERSION` generator-apply stamp remains the final stamp, after normalized project validation.
- `server/validateAppState.js`: add the lightweight schema-v10 optional-field checks defined below; no persistence schema changes.
- `SCHEMA_CHANGELOG.md`: document v10 fields, defaults, migration behavior, and the new sequential path.
- Exact-current test fixtures and assertions become v10. Fixtures deliberately testing v8/v9 migration remain old. The future-version sentinel currently using v10 in `projectDocumentSnapshot.test.ts` moves to v11. Tutorial and server fixtures intentionally exercising old schemas remain unchanged.

`services/projectDocumentSnapshot.ts`, local persistence, JSON download, cloud state encoding, gallery copies, and diff/merge already clone or serialize whole variants, so the new fields flow through without special serialization code. Server project rows already store `schemaVersion` generically. `server/routes/mergeRequests.js` continues comparing source and target schema versions without knowing field details.

No SQL migration, table change, state rewrite job, or server-side database backfill is required.

## Shared Layout Module

Add one renderer-independent text layout module. It owns segmentation, soft wrapping, ellipsis, fit checks, shrink search, and vertical block sizing. It must not import React, DOM APIs, Canvas components, or jsPDF.

Its request includes resolved text, local content-box width/height, base font size, font identity/style, `textOverflow`, `textWrap`, and alignment data. Measurement is injected:

```ts
interface TextMeasurer {
  measureWidth(text: string, font: FontDescriptor): number;
}
```

Its result contains explicit line strings and widths, effective font size, `fontSize * 1.2` line height, total line-block height, truncation status, and whether a local safety clip is required. Renderers position and draw those explicit lines; neither renderer performs a second native wrap or ellipsis pass.

The text-element content box is exactly local `w x h`, with no overflow padding. Grid layout uses the existing Canvas cell text inset, centralized as one unit on each horizontal side and zero vertical inset. Thus each grid text content box is `max(0, w - 2) x h`; cell fill, border, radius, and link bounds still use the full cell.

Layout is always computed before rotation in local element/cell coordinates. Rotation transforms the completed local layout and its clip; rotation never changes wrapping width, visible line count, or shrink size.

## Common Line Layout

Before layout, normalize CRLF and lone CR to `\n`. Split hard lines on `\n` while retaining empty lines, including leading, repeated, and trailing newlines. Hard breaks are never collapsed into spaces.

For `textWrap: true`, wrap each hard line greedily to the content width:

- Prefer the latest whitespace break that fits.
- If an indivisible token cannot fit on an empty line, break at the largest fitting Unicode grapheme boundary.
- Never split a grapheme cluster.
- Preserve hard empty lines as empty line boxes.

Grapheme iteration uses `Intl.Segmenter` with `granularity: 'grapheme'`, with one shared bundled UAX #29 extended-grapheme fallback for runtimes lacking it. Ellipsis uses U+2026 and removes whole grapheme clusters only; it never slices UTF-16 code units, combining sequences, emoji modifiers, flags, or zero-width-joiner sequences.

For `textWrap: false`, soft wrapping is disabled. Clip, shrink, and visible retain one line box per hard line. Ellipsis has its explicit single-visible-line contract described below.

Horizontal alignment is applied independently to each resulting line. Vertical alignment positions the complete resulting line block at top, middle, or bottom using line boxes. PDF baseline conversion keeps the existing CSS-matching model: half-leading plus an ascent of `0.8em`. A partially intersecting line can be visible in clip mode; ellipsis and shrink reason only in complete line boxes.

Text is not rendered when text is empty, the existing font-size visibility rules reject the base size, or content width/height is non-finite or less than or equal to zero.

## Mode Algorithms

### Clip

Lay out at unchanged base font size using the selected wrap policy. Keep all lines and normal alignment. Draw through a local `w x h` clip for text or the grid content-box clip for a cell. Horizontal and vertical overflow are cut at the local boundary; element and cell dimensions never change.

### Ellipsis

Lay out at unchanged base font size and safety-clip the result.

With wrapping off, only the first hard line is a visible candidate. Width overflow or any later hard line means hidden content and requires ellipsis. A hard newline is therefore preserved as a truncation boundary rather than converted to a space.

With wrapping on, greedily wrap first. The full-line capacity is `floor(contentHeight / lineHeight)`. If capacity is zero, render no text. If content exceeds capacity, retain that many lines and ellipsize the final retained line. If all content fits, preserve it without an ellipsis.

To ellipsize, append U+2026 to the final candidate, removing trailing grapheme clusters until candidate plus ellipsis fits. Hidden later lines force the ellipsis even when the candidate itself was narrower than the box. If the ellipsis glyph alone does not fit, draw no glyph. A local safety clip remains active to contain metric and PDF rounding differences.

### Shrink

First test the unchanged base font size. A candidate fits only when every line fits content width and total line-box height fits content height under the selected wrap policy and all explicit newlines.

If base size does not fit, run a bounded binary search over `[0, baseFontSize]`, retaining the largest fitting candidate. Use at most 16 iterations and stop early when the interval is at most `0.01` layout units. Zero is the algorithmic lower bound, not a selectable or displayed minimum. If no positive measured candidate is found, render no text.

Grid cells run this search per cell because labels and overrides differ. The computed size is passed only to drawing and decoration code. It never mutates the element, history, JSON, `fontSize`, or neighboring cells. A defensive local clip contains final rounding error.

### Visible

Lay out at unchanged base font size using the selected wrap policy and draw without a text clip. Wrapped text can exceed height; unwrapped hard lines can exceed width and height. Page-level clipping still follows existing page rendering behavior.

## Canvas Integration

Canvas preview resolves bindings and grid labels as it does now, then passes resolved strings to shared layout. A browser metrics adapter uses a reused offscreen `CanvasRenderingContext2D` configured with the same resolved family, weight, style, and size as CSS output.

`CanvasElement` renders returned lines explicitly instead of delegating wrapping to `white-space`, browser ellipsis, or the grid's `truncate` class. Each line uses the returned effective font size and `line-height: 1.2`. Local text containers implement the result's clip policy:

- Fixed text clip is exactly the unrotated element box.
- Each grid cell clips to its inset content box for clip, ellipsis, and defensive shrink containment.
- Visible uses `overflow: visible`.
- The outer element retains its existing translation, rotation, opacity, z-index, selection, and hit area. Clipping happens inside that transformed wrapper, so the clip rotates with the element.

Grid fill, border, alternating/header/first-column styles, traversal, and cell geometry are unchanged. Text font weight/color overrides are included in the cell's metric and draw descriptor. Each cell remains the pointer/link target regardless of how little text is visible.

The editing overlay remains non-destructive and edits full source content. Auto-width editing stays exactly as today. Fixed-size committed rendering always uses shared layout, so leaving edit mode immediately reflects selected overflow policy without rewriting content.

## PDF Integration

A jsPDF metrics adapter applies the same registered font family, style, and weight used for drawing, then uses `doc.getTextWidth`. PDF no longer calls `splitTextToSize` for in-scope fixed text and no longer sends an unbounded grid label directly to `doc.text`; it draws the explicit shared-layout lines.

For clipped modes, every element or cell follows a balanced graphics-state sequence:

1. Save graphics state.
2. Apply existing rotation/transform around the configured origin.
3. Define the local rectangular text clip and consume/discard its path.
4. Draw all returned text lines and decorations.
5. Restore graphics state in the same element/cell scope, including error-safe cleanup.

Visible skips the text clip but retains balanced transform state. No clip path or transform may leak into later cells/elements. Fill and border drawing order remains unchanged.

Links are independent of laid-out glyph bounds. Text links retain the element link box. Grid links retain the whole cell rectangle, not the shrunken text or visible substring. Existing link-target resolution and rotation eligibility remain unchanged.

## Typography UI

Add controls in `components/properties/SingleElementEditor.tsx` inside Typography:

- Text: select labeled `Overflow`, followed by checkbox/toggle labeled `Wrap`.
- Grid: select labeled `Cell text overflow`, followed by checkbox/toggle labeled `Wrap cell text`.
- Select options: `Clip`, `Ellipsis`, `Shrink`, `Visible`, in that order.

Only text and grid receive these controls. For auto-width text, both controls are disabled and the explanation from the UX contract is shown. Normalized values drive control state, so the UI never needs an `undefined` display option.

Changes call the existing `onUpdate` path. `ProjectEditor.handleUpdateElement` continues to create one normal history entry and update the selected element. The controls do not create a parallel state store and do not persist a last-used overflow preference in `localStorage`; new-element defaults remain deterministic. Render-time shrink results never call `onUpdate`.

## Serialization, Import, Generator, And Presets

- JSON, local storage, document snapshots, cloud commits, gallery copies/forks, and diff/merge preserve the optional fields naturally as part of each element.
- JSON import and JSON-editor apply migrate and normalize before replacing editor state. Valid v10 values survive; missing or malformed applicable values become new-content defaults.
- v9 and older imports pass through sequential migrations and receive legacy-preserving v9-to-v10 values.
- Generator output is treated as new content. After sandbox security/shape/limit checks and layer normalization, normalize overflow fields with new-content defaults, then stamp schema v10. Do not feed newly generated templates through the v9 legacy-appearance mapping.
- Built-in and variants-shaped preset data is treated as new content and normalized before its v10 stamp. Flat legacy/custom preset states that declare an older schema continue through sequential migration; custom presets already declaring v10 run current-version normalization.
- `createGeneratedAppState` and generator apply stamp v10 only after receiving normalized templates. No path can stamp v10 first and rely on `migrateState` to fill fields, because current-version migration short-circuits version upgrades.

## Validation And Error Handling

- Client normalization is the recovery policy for missing or malformed v10 fields; imports do not fail solely for these two fields.
- Generator raw output uses the same recovery policy after existing plain-JSON, security, dimensions, traversal, and project-limit checks.
- Server validation remains backward-compatible with old schemas and missing optional fields. For schema-v10 text/grid fields that are present, lightweight validation rejects non-enum `textOverflow` or non-boolean `textWrap` from direct API callers; normal editor writes are canonical before reaching the server. No server mutation or DB migration occurs.
- Unknown fields retain existing handling. Overflow normalization does not coerce values or alter unrelated elements.
- Non-finite or non-positive content boxes render no text in both adapters. Existing invalid/non-positive font-size behavior remains authoritative and also renders no text.
- Font resolution must use the same fallback for measurement and drawing. If a requested font is unavailable, use the renderer's existing fallback consistently. If measurement still throws or returns a non-finite/negative width, skip that text layout, log one contextual warning per render/export session, and continue rendering the document rather than spill or abort PDF generation.
- Clipping and graphics-state cleanup use `finally`-equivalent structure so one bad label cannot leave PDF state unbalanced.
- Source content, links, element dimensions, and base font settings are never discarded as an error-recovery mechanism.

## Performance And Caching

Normal clip, ellipsis, and visible layout is linear in grapheme count. Shrink is bounded to 16 fit checks. Per-cell shrink is intentionally independent but must reuse metrics.

Each adapter owns a bounded LRU width cache keyed by renderer/font identity, family, weight, style, effective size, and measured string. Use a 20,000-entry maximum per Canvas renderer or PDF export session; discard the PDF cache at export completion. Segmented-grapheme and complete-layout LRU caches also use a 20,000-entry maximum and input-complete keys. Never use an unbounded process-global cache.

Canvas uses one reused offscreen measurement context, not temporary DOM nodes per element or cell. Browser font-load completion invalidates affected Canvas font/layout cache entries and triggers normal rerender. PDF cache lifetime is one document, so registered-font changes cannot cross exports.

Existing project byte, element, node, traversal, and template-dimension limits remain the outer work bounds. Layout adds no recursive traversal and no loop whose bound depends on finding a fit.

## Testing

### Migration And Normalization

- v9 fixed and auto-width text become visible plus wrap true; v9 grids become ellipsis plus wrap false; unrelated shapes remain unchanged.
- Migration covers every variant and the legacy flat-template branch, does not mutate input unexpectedly, reaches v10 sequentially from v0, and is idempotent.
- Already-v10 missing, `null`, wrong-type, and unknown values normalize to text/grid new defaults; valid values survive; other element types remain untouched.
- Auto-width text stores canonical fields but render behavior remains unchanged.
- Generator and every preset shape normalize before v10 stamping. Generated content receives new defaults, never legacy v9 defaults.
- Current-version constants, typed literals, changelog path, and future-version fixture are audited.

### Pure Layout

Use deterministic fake metrics to test each mode with wrap on/off, all alignments, exact fits, width overflow, height overflow, partial final-line height, long unbroken words, repeated whitespace, empty text, and leading/repeated/trailing newlines.

Test ellipsis with one and many lines, hidden content after a hard newline, an ellipsis-only box, and a box too narrow for U+2026. Verify truncation never splits combining marks, surrogate pairs, emoji modifiers, flags, or zero-width-joiner graphemes.

Test shrink at base-size fit, width-limited, height-limited, multiline, explicit-newline, near-zero result, zero/invalid boxes, and 16-iteration bound. Assert largest tested fit, deterministic output, unchanged base `fontSize`, and distinct per-cell results.

### Canvas

- Fixed text and grid fixtures exercise all eight mode/wrap combinations, typography overrides, zoom, vertical/horizontal alignment, and rotated local clipping.
- Grid tests verify one-unit horizontal content inset, no spill in contained modes, visible spill when selected, and unchanged full-cell links/hit areas.
- Auto-width regression tests compare dimensions, no-soft-wrap behavior, editing, and output with fields absent and present; controls are disabled with explanation.
- Shape-caption regressions prove non-text/non-grid rendering is unchanged.
- UI tests verify labels, option order, normalized values, default creation values, one history update per change, and no `fontSize` mutation from shrink.

### PDF And Parity

- PDF adapter tests verify explicit lines/font sizes, local clips, decoration placement, whole-cell links, and balanced save/clip/draw/restore on success and measurement/draw failure.
- PDF regression fixtures prove grids no longer spill and fixed text follows each selected policy.
- Feed identical fake metrics into Canvas and PDF adapter tests and assert identical line strings, truncation decisions, effective sizes, block heights, and clip flags.
- Integration fixtures use representative built-in, custom, bold, italic, Unicode, rotated, and grid text. Rasterized PDF and Canvas screenshots can differ in antialiasing but must agree on line count and visible content; text-block edges and alignment anchors must differ by no more than one layout unit in fixtures kept at least one layout unit away from a wrap threshold.
- Serialization round trips cover local JSON, JSON editor, custom preset, generated project, cloud snapshot, and diff/merge preservation.

## Acceptance Criteria

- New text elements serialize as clip plus wrap true; new grids serialize as clip plus wrap false.
- Every valid mode is selectable independently from wrap for fixed text and grid cells.
- Auto-width text output and sizing are unchanged, ignores both fields, and presents disabled controls with an explanation.
- v9 migration preserves current Canvas appearance with text visible/wrapped and grids ellipsized/unwrapped.
- Missing or malformed applicable v10 values normalize deterministically to new-content defaults before rendering or canonical serialization.
- Canvas and PDF use one shared line-layout algorithm and explicit adapter metrics; neither performs independent wrapping or truncation for in-scope content.
- Clip and ellipsis never paint outside local text/cell content boxes; shrink chooses the largest bounded-search fit without a user-visible minimum; visible is not locally clipped.
- Explicit newlines, line-height 1.2, Unicode-grapheme-safe ellipsis, alignment, grid padding, and rotation semantics match this specification.
- Grid shrink is per cell. Links continue covering the whole element/cell. Computed font sizes never mutate persisted `fontSize` or history.
- PDF graphics-state operations are balanced and cannot leak clips/transforms between elements.
- Shapes with captions remain out of scope unless the element itself is `type: 'text'`.
- Full unit, integration, migration, UI, serialization, Canvas, and PDF parity suites pass without weakening existing project validation or limits.
- Schema v10 ships without a server DB migration.

## Rollout And Backward Compatibility

Ship schema, normalizer, both adapters, UI, and generator/preset updates in one release so no v10 writer exists without v10 rendering support. No feature flag or background rewrite is needed.

Old projects migrate on their normal client load path. Their first subsequent local/cloud save can record the two new fields as a document change, as expected for schema migration. Existing Canvas appearance is preserved; PDF spill behavior changes intentionally to parity-safe output.

New projects, generated projects, and presets use clip defaults. Existing v10 valid choices survive import/export and cloud history. Older clients do not understand v10 modes and can render them with legacy behavior, so v10 is not a downgrade-compatible authoring format; they must not be used to resave v10 documents. Existing schema-version comparison and migration boundaries remain the compatibility guard.
