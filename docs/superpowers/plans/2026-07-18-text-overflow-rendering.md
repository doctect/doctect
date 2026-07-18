# Configurable Text Overflow Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted `clip`, `ellipsis`, `shrink`, and `visible` text overflow with independent wrapping and policy-level Canvas/PDF parity for fixed text elements and grid cells.

**Architecture:** Schema v10 migration and normalization establish canonical settings at every load and creation boundary. One renderer-independent layout engine owns grapheme segmentation, hard/soft line breaking, ellipsis, shrink search, alignment geometry, and bounded layout caches; Canvas and PDF sessions inject their own cached font metrics and draw only returned lines. Existing auto-width text and shape-caption paths remain separate and unchanged.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 4, Testing Library, Playwright, jsPDF 3, `Intl.Segmenter`, `unicode-segmenter` 0.17.0 fallback, Express 5.

## Global Constraints

- Schema version is exactly `10`; migration remains sequential through `migrateV9ToV10`.
- New/normalized v10 text defaults are `textOverflow: 'clip'`, `textWrap: true`; new/normalized v10 grid defaults are `textOverflow: 'clip'`, `textWrap: false`.
- Migrated v9 text, including auto-width text, is assigned `visible` plus wrap `true`; migrated v9 grid is assigned `ellipsis` plus wrap `false`. Assignment is unconditional, including same-named experimental v9 fields.
- Only `type === 'text' && !autoWidth` and `type === 'grid'` interpret settings. Auto-width text stores canonical values but ignores them. Shape captions never interpret them.
- Mode order and copy are exactly `Clip`, `Ellipsis`, `Shrink`, `Visible`; text labels are `Overflow` and `Wrap`; grid labels are `Cell text overflow` and `Wrap cell text`.
- Auto-width controls are disabled with exact copy: `Auto-width text sizes to content; overflow and wrap apply only to fixed-size text.`
- Every mode uses line height `1.2`. PDF baseline from each line-box top is half-leading plus `0.8em` ascent.
- Missing in-scope alignment uses current Canvas behavior: horizontal `center` and vertical `middle`. Auto-width PDF keeps its existing forced-left behavior.
- Fixed-text content geometry is local `w x h` with zero padding. Grid text geometry is local `max(0, w - 2) x h`, offset one unit from each horizontal cell edge and zero units vertically.
- Layout occurs before rotation. Rotation transforms completed local lines and local clip without changing wrap width, line capacity, or effective font size.
- Normalize CRLF and lone CR to `\n`; retain leading, repeated, and trailing hard empty lines. `textWrap` controls only soft wrapping.
- Grapheme boundaries use native `Intl.Segmenter(..., { granularity: 'grapheme' })` when available and bundled UAX #29 `unicode-segmenter/grapheme` fallback otherwise. Ellipsis is U+2026.
- Shrink searches `[0, baseFontSize]`, tests base size first, performs at most 16 binary-search iterations, stops when interval is at most `0.01`, and has no displayed or persisted minimum.
- Canvas width cache and each PDF export width cache are bounded LRU caches with maximum 20,000 entries. Segmentation and complete-layout LRUs are also bounded at 20,000 entries. No unbounded process-global cache is allowed.
- Measurement failure means no text for that item, one contextual warning per Canvas renderer/PDF export session, continued rendering, and balanced PDF graphics state.
- Overflow never mutates source text, `fontSize`, element dimensions, links, history, or neighboring grid cells.
- Existing project byte, element, node, traversal, reference-depth, layer, variant, and template-dimension limits remain unchanged.
- Server validation accepts old schemas and missing optional fields; schema v10+ direct writes validate present applicable fields without normalizing them.
- No SQL migration, table change, backfill, persistence rewrite, feature flag, or last-used overflow preference is permitted.
- `npm run build` must pass. `npx tsc --noEmit --pretty false` currently exits 2 with exactly five pre-existing diagnostics and this work must add zero: `tests/unit/changePassword.test.tsx(17,60) TS2556`; `tests/unit/loginEmailVerification.test.tsx(11,51) TS2556`; `tests/unit/loginEmailVerification.test.tsx(12,51) TS2556`; `tests/unit/loginEmailVerification.test.tsx(15,81) TS2556`; `tests/unit/svgEditing.test.ts(33,39) TS2339`. This baseline was re-run on 2026-07-18.
- Do not edit historical specs/plans merely to replace old schema numbers. Keep fixtures intentionally exercising v8/v9, tutorials, and old server schemas unchanged; move only the future-version sentinel from v10 to v11.

---

## File Structure

### New Production Files

- `services/textOverflow.ts`: canonical applicable-element defaults, non-mutating resolver, template/state normalizers.
- `services/boundedLruCache.ts`: reusable fixed-capacity LRU used only by text layout/metric sessions.
- `services/graphemes.ts`: native grapheme segmentation with bundled UAX #29 fallback.
- `services/textLayout.ts`: pure wrap/clip/ellipsis/shrink and line-position engine.
- `services/canvasTextLayout.ts`: reused offscreen Canvas metric context, width cache, layout session, warning boundary.
- `components/canvas/useCanvasTextLayoutSession.ts`: one Canvas session per mounted renderer and font-load invalidation/rerender.
- `services/pdfTextLayout.ts`: per-export jsPDF metric session and balanced explicit-line drawing/clip adapter.

### New Focused Tests And Fixtures

- `tests/unit/textOverflowSettings.test.ts`: resolver and clone-normalizer behavior.
- `tests/unit/canvasElementCreationTextOverflow.test.tsx`: click/drag creation defaults only.
- `tests/unit/textLayoutTestUtils.ts`: deterministic metric/request builders shared by layout and parity tests.
- `tests/unit/textLayout.wrap.test.ts`: hard lines, greedy wrapping, whitespace, grapheme breaks, alignment geometry.
- `tests/unit/textLayout.modes.test.ts`: clip, ellipsis, visible, shrink, bounds, invalid input.
- `tests/unit/textLayout.unicodeCache.test.ts`: UAX #29 fallback and all LRU bounds/keys.
- `tests/unit/canvasFixedTextLayout.test.tsx`: fixed text, auto-width, edit overlay, and shape-caption separation.
- `tests/unit/canvasGridTextLayout.test.tsx`: per-cell layout, inset, style overrides, links/hit boxes.
- `tests/unit/SingleElementEditorTextOverflow.test.tsx`: labels/options/disabled state and update payloads.
- `tests/unit/PropertiesPanelTextOverflow.test.tsx`: one history-bearing update per UI change.
- `tests/unit/pdfTextLayoutAdapter.test.ts`: PDF metrics, line drawing, decoration, clip, warnings, cleanup.
- `tests/unit/pdfFixedTextOverflow.test.ts`: fixed text integration, transforms, links, and no native re-wrap.
- `tests/unit/pdfGridTextOverflow.test.ts`: per-cell integration, styles, clips, links, failures, state isolation.
- `tests/unit/textLayoutParity.test.ts`: identical fake Canvas/PDF metrics produce identical layout results.
- `tests/unit/textOverflowPersistence.test.ts`: JSON, snapshots, generated/preset state, cloud codec, and diff preservation.
- `tests/fixtures/text-overflow-parity-v10.json`: current-schema fixed/grid matrix used by integration and browser verification.
- `tests/e2e/text_overflow.spec.js`: real-browser controls, local clipping, auto-width, fixture screenshot, and PDF artifact.

### Existing Files Modified By Responsibility

- Schema/load: `types.ts:13-15,95-106`; `services/migration.ts:14-20,83-149,322-342`; `services/loadProjectState.ts:7-13`; `SCHEMA_CHANGELOG.md:5-27`.
- New content: `components/Canvas.tsx:1316-1425`; `services/generatorTemplates.ts:6-53`; `services/validateGeneratedProject.ts:17-23,153-185,303-321`; `services/generatedProjectState.ts:7-34`; `services/presets.ts:47-68,71-139`; `server/validateAppState.js:45-73`.
- Canvas: `components/canvas/CanvasElement.tsx:10-66,249-327,467-590,699-747`; `components/canvas/ReadOnlyPagePreview.tsx:40-66`; `components/Canvas.tsx:1-12,1540-1590`; `components/properties/SingleElementEditor.tsx:992-1156`.
- PDF: `services/pdfService.ts:644-694,789-887,928-1096,1155-1515,1714-1825`.
- Current/load regressions: `tests/unit/migration.test.ts`; `tests/unit/loadProjectState.test.ts`; `tests/unit/presets.test.ts`; `tests/unit/validateGeneratedProject.test.ts`; `tests/unit/generatedProjectState.test.ts`; `tests/unit/server/validateAppState.test.js`; `tests/unit/EditorPageGeneratorMetadata.test.tsx`; `tests/unit/JsonModalGeneratorMetadata.test.tsx`; `tests/unit/HistoryModal.test.tsx`; `tests/unit/MergeRequestPage.test.tsx`; `tests/unit/projectDocumentSnapshot.test.ts`; `tests/unit/server/stateCodec.test.js`; `tests/unit/shared/diff.test.js`.
- Exact-current fixture audit: `tests/unit/generatorVisualPreview.test.ts`; `tests/unit/GeneratorVisualPreviewModal.test.tsx`; `tests/unit/PublishModal.test.tsx`; `tests/unit/GalleryDetailPage.test.tsx`; `tests/unit/pdfGeneratedTraversal.test.ts`; `tests/unit/pdfPatterns.test.ts`; `tests/unit/EditorPageGeneratedProject.test.tsx`; `tests/unit/ProjectEditor.generatorHistory.test.tsx`.
- Dependency manifest: `package.json:16-36`; `package-lock.json`.

## Shared Interfaces

Use these names and shapes across tasks so renderer work can proceed independently:

```ts
// types.ts
export type TextOverflow = 'clip' | 'ellipsis' | 'shrink' | 'visible';

// services/textOverflow.ts
export interface ResolvedTextOverflowSettings {
  textOverflow: TextOverflow;
  textWrap: boolean;
}
export const TEXT_OVERFLOW_VALUES: readonly TextOverflow[];
export function resolveTextOverflowSettings(
  element: Pick<TemplateElement, 'type' | 'textOverflow' | 'textWrap'>,
): ResolvedTextOverflowSettings | null;
export function normalizeTextOverflowElement<T extends Record<string, unknown>>(element: T): T;
export function normalizeTextOverflowTemplate(template: PageTemplate): PageTemplate;
export function normalizeTextOverflowTemplates(
  templates: Record<string, PageTemplate>,
): Record<string, PageTemplate>;
export function normalizeTextOverflow<T extends Record<string, unknown>>(state: T): T;

// services/textLayout.ts
export const TEXT_LINE_HEIGHT = 1.2;
export const TEXT_LAYOUT_CACHE_LIMIT = 20_000;
export interface FontDescriptor {
  family: string;
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
  size: number;
}
export interface TextMeasurer {
  cacheKey: string;
  measureWidth(text: string, font: FontDescriptor): number;
}
export interface TextLayoutRequest {
  text: string;
  contentWidth: number;
  contentHeight: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textOverflow: TextOverflow;
  textWrap: boolean;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
}
export interface TextLayoutLine {
  text: string;
  width: number;
  x: number;
  top: number;
  baseline: number;
}
export interface TextLayoutResult {
  lines: readonly TextLayoutLine[];
  effectiveFontSize: number;
  lineHeight: number;
  blockHeight: number;
  truncated: boolean;
  requiresClip: boolean;
}
export interface TextLayoutEngine {
  layout(request: TextLayoutRequest, measurer: TextMeasurer): TextLayoutResult | null;
  clear(): void;
}
export function createTextLayoutEngine(cacheLimit?: number): TextLayoutEngine;
export class TextMeasurementError extends Error {}

// services/canvasTextLayout.ts
export interface CanvasTextLayoutSession {
  layout(request: TextLayoutRequest, context: string): TextLayoutResult | null;
  clear(): void;
}
export function resolveCanvasFontFamily(family: string): string;
export function createCanvasTextLayoutSession(
  canvas?: HTMLCanvasElement,
  warn?: (message: string, error: unknown) => void,
): CanvasTextLayoutSession;

// services/pdfTextLayout.ts
export interface PdfTextLayoutSession {
  layout(
    request: TextLayoutRequest,
    metricIdentity: string,
    selectFont: (size: number) => void,
    context: string,
  ): TextLayoutResult | null;
  draw(
    layout: TextLayoutResult,
    box: { x: number; y: number; width: number; height: number; yOffset: number },
    options: {
      selectFont: (size: number) => void;
      textDecoration: TemplateElement['textDecoration'];
      context: string;
    },
  ): boolean;
  clear(): void;
}
export function createPdfTextLayoutSession(
  doc: jsPDF,
  warn?: (message: string, error: unknown) => void,
): PdfTextLayoutSession;
```

## Preparation Commit

The approved design is currently untracked. Land design and this plan before implementation so every later commit reviews against immutable requirements.

- [ ] Verify only the two documentation files are staged.

Run: `git status --short docs/superpowers/specs/2026-07-18-text-overflow-rendering-design.md docs/superpowers/plans/2026-07-18-text-overflow-rendering.md`

Expected:

```text
?? docs/superpowers/plans/2026-07-18-text-overflow-rendering.md
?? docs/superpowers/specs/2026-07-18-text-overflow-rendering-design.md
```

- [ ] Commit approved design and implementation plan.

```bash
git add docs/superpowers/specs/2026-07-18-text-overflow-rendering-design.md docs/superpowers/plans/2026-07-18-text-overflow-rendering.md
git commit -m "docs: specify text overflow rendering"
```

Expected: one commit containing exactly those two files; no source, test, fixture, or generated file staged.

---

### Task 1: Schema V10, Resolver, Migration, Changelog, And Load Boundary

**Files:**
- Create: `services/textOverflow.ts`
- Create: `tests/unit/textOverflowSettings.test.ts`
- Modify: `types.ts:13-15,95-106`
- Modify: `services/migration.ts:14-20,83-149,322-342`
- Verify without bypass changes: `services/loadProjectState.ts:7-13`
- Modify: `tests/unit/migration.test.ts`
- Modify: `tests/unit/loadProjectState.test.ts`
- Modify: `SCHEMA_CHANGELOG.md:5-27,108-109`

**Interfaces:**
- Consumes: `TemplateElement`, `PageTemplate`, and variant/legacy-flat state shapes already defined in `types.ts`.
- Produces: `TextOverflow`, `resolveTextOverflowSettings`, all `normalizeTextOverflow*` functions, and `CURRENT_SCHEMA_VERSION === 10` for every later task.

- [ ] **Step 1: Write resolver and normalizer RED tests**

Add focused tables proving exact validation rather than truthiness/coercion:

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizeTextOverflow,
  normalizeTextOverflowElement,
  resolveTextOverflowSettings,
} from '../../services/textOverflow';

describe('text overflow settings', () => {
  it.each([
    ['text', { textOverflow: 'clip', textWrap: true }],
    ['grid', { textOverflow: 'clip', textWrap: false }],
  ] as const)('resolves new %s defaults', (type, expected) => {
    expect(resolveTextOverflowSettings({ type })).toEqual(expected);
  });

  it.each([null, 'CLIP', 'unknown', 1, false])('rejects malformed overflow %j', value => {
    expect(normalizeTextOverflowElement({ type: 'text', textOverflow: value, textWrap: 'true' }))
      .toEqual({ type: 'text', textOverflow: 'clip', textWrap: true });
  });

  it('preserves valid values and leaves non-applicable elements field-for-field unchanged', () => {
    const rect = { type: 'rect', textOverflow: 'future', textWrap: 'false', custom: null };
    expect(normalizeTextOverflowElement({ type: 'grid', textOverflow: 'visible', textWrap: true }))
      .toEqual({ type: 'grid', textOverflow: 'visible', textWrap: true });
    expect(normalizeTextOverflowElement(rect)).toEqual(rect);
  });

  it('normalizes every variant and legacy flat templates into an independent idempotent clone', () => {
    const raw: any = {
      schemaVersion: 10,
      variants: { a: { templates: { page: { elements: [{ type: 'text' }, { type: 'grid' }] } } } },
      templates: { legacy: { elements: [{ type: 'text', autoWidth: true }] } },
    };
    const once = normalizeTextOverflow(raw);
    expect(once).not.toBe(raw);
    expect(once.variants.a.templates.page.elements).toMatchObject([
      { textOverflow: 'clip', textWrap: true },
      { textOverflow: 'clip', textWrap: false },
    ]);
    expect(once.templates.legacy.elements[0]).toMatchObject({ textOverflow: 'clip', textWrap: true });
    expect(normalizeTextOverflow(once)).toEqual(once);
    expect(raw.variants.a.templates.page.elements[0].textOverflow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Add migration/load RED cases**

In `tests/unit/migration.test.ts`, add a v9 fixture containing fixed text, auto-width text, grid, and a rect in two variants plus legacy `templates`; assert text becomes `visible/true`, grid becomes `ellipsis/false`, rect JSON remains identical, existing experimental fields are overwritten, input is unchanged, v0 reaches v10, and a second normal runner call is equal. Add current-v10 malformed/valid normalization and v11 untouched-reference cases.

In `tests/unit/loadProjectState.test.ts`, add:

```ts
const currentStateWithElements = (elements: any[]) => ({
  ...validV8State(),
  schemaVersion: 10,
  variants: {
    default: {
      id: 'default', name: 'Default',
      templates: { page: { id: 'page', name: 'Page', width: 100, height: 100, elements } },
    },
  },
  activeVariantId: 'default',
});

it('normalizes already-v10 applicable fields at the central load boundary', () => {
  const raw: any = currentStateWithElements([
    { type: 'text', textOverflow: null, textWrap: 'true' },
    { type: 'grid', textOverflow: 'visible' },
  ]);
  const result = loadProjectState(raw);
  expect(result.state.variants.default.templates.page.elements).toMatchObject([
    { textOverflow: 'clip', textWrap: true },
    { textOverflow: 'visible', textWrap: false },
  ]);
  expect(raw.variants.default.templates.page.elements[0].textOverflow).toBeNull();
});
```

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/unit/textOverflowSettings.test.ts tests/unit/migration.test.ts tests/unit/loadProjectState.test.ts`

Expected: FAIL because `services/textOverflow.ts` and v10 migration do not exist and `CURRENT_SCHEMA_VERSION` is `9`.

- [ ] **Step 4: Add schema fields and exact resolver/defaults**

Add to `types.ts` and implement `services/textOverflow.ts` with these constants and strict guards:

```ts
export const TEXT_OVERFLOW_VALUES = ['clip', 'ellipsis', 'shrink', 'visible'] as const;
const TEXT_DEFAULTS = { textOverflow: 'clip', textWrap: true } as const;
const GRID_DEFAULTS = { textOverflow: 'clip', textWrap: false } as const;

const isTextOverflow = (value: unknown): value is TextOverflow =>
  typeof value === 'string' && (TEXT_OVERFLOW_VALUES as readonly string[]).includes(value);

export function resolveTextOverflowSettings(element: Pick<TemplateElement, 'type' | 'textOverflow' | 'textWrap'>) {
  if (element.type !== 'text' && element.type !== 'grid') return null;
  const defaults = element.type === 'grid' ? GRID_DEFAULTS : TEXT_DEFAULTS;
  return {
    textOverflow: isTextOverflow(element.textOverflow) ? element.textOverflow : defaults.textOverflow,
    textWrap: typeof element.textWrap === 'boolean' ? element.textWrap : defaults.textWrap,
  };
}
```

`normalizeTextOverflowElement` must clone applicable elements and spread the resolved settings last. `normalizeTextOverflowTemplate` must clone template/elements. `normalizeTextOverflowTemplates` must preserve keys while cloning templates. `normalizeTextOverflow` must `structuredClone` once, traverse both `state.variants[*].templates` and `state.templates`, and return the clone.

- [ ] **Step 5: Implement sequential v9 to v10 migration and current normalization**

Add `migrateV9ToV10` using a JSON clone, traverse both state shapes, and assign legacy values unconditionally only for text/grid. Change runner control flow to preserve future versions but normalize exact-current output:

```ts
if (version > CURRENT_SCHEMA_VERSION) return state as AppState;
// Existing v0 through v9 sequential branches remain in order.
if (version < 10) {
  migratedState = migrateV9ToV10(migratedState);
  version = 10;
}
return normalizeTextOverflow(migratedState as Record<string, unknown>) as AppState;
```

An exact-v10 call reaches the final normalizer. A v11 call returns immediately without downgrade or rewriting. Keep `needsMigration` version-only: malformed v10 needs normalization through load, not a version bump.

- [ ] **Step 6: Document v10 and no-database migration**

Prepend `SCHEMA_CHANGELOG.md` with Version 10 dated 2026-07-18: fields, new defaults, legacy-preserving v9 mapping, strict current normalization, sequential path through v10, renderer scope, and explicit `No server database or SQL migration is required.` Update only the bottom migration path to end in v10.

- [ ] **Step 7: Run GREEN tests**

Run: `npx vitest run tests/unit/textOverflowSettings.test.ts tests/unit/migration.test.ts tests/unit/loadProjectState.test.ts`

Expected: PASS; current v10 is normalized, v9 appearance mapping is exact, v11 remains untouched, and all earlier migration tests remain green.

- [ ] **Step 8: Commit schema boundary**

```bash
git add types.ts services/textOverflow.ts services/migration.ts tests/unit/textOverflowSettings.test.ts tests/unit/migration.test.ts tests/unit/loadProjectState.test.ts SCHEMA_CHANGELOG.md
git commit -m "feat: migrate text overflow settings"
```

---

### Task 2: New Element, Generator, Preset, And Server Defaults

**Files:**
- Create: `tests/unit/canvasElementCreationTextOverflow.test.tsx`
- Modify: `components/Canvas.tsx:1316-1425`
- Modify: `services/generatorTemplates.ts:1-53`
- Modify: `services/validateGeneratedProject.ts:1-23,175-185,303-321`
- Modify: `services/generatedProjectState.ts:1-34`
- Modify: `services/presets.ts:47-68,71-139`
- Modify: `server/validateAppState.js:45-73`
- Modify: `tests/unit/validateGeneratedProject.test.ts`
- Modify: `tests/unit/generatedProjectState.test.ts`
- Modify: `tests/unit/presets.test.ts`
- Modify: `tests/unit/server/validateAppState.test.js`
- Modify: `tests/unit/migration.test.ts:112-178`

**Interfaces:**
- Consumes: Task 1 normalizers and `CURRENT_SCHEMA_VERSION === 10`.
- Produces: every new text/grid object canonical before any v10 stamp; server rejection only for malformed present fields on schema v10+.

- [ ] **Step 1: Write new-element RED tests**

Use `renderCanvas` from `tests/unit/canvasTestUtils.tsx`. Click-create text with movement below five units, drag-create text, and drag-create grid. Read the appended element from `onUpdateElements.mock.calls.at(-1)![0]` and assert:

```ts
expect(clickText).toMatchObject({
  type: 'text', autoWidth: true, textOverflow: 'clip', textWrap: true,
});
expect(dragText).toMatchObject({
  type: 'text', textOverflow: 'clip', textWrap: true,
});
expect(dragGrid).toMatchObject({
  type: 'grid', textOverflow: 'clip', textWrap: false,
});
expect(dragRect).not.toHaveProperty('textOverflow');
expect(localStorage.getItem('doctect_last_textOverflow')).toBeNull();
```

- [ ] **Step 2: Write generator, preset, and server RED tests**

Add generated flat and variants-shaped templates with missing, valid, and malformed values. Assert output v10, new defaults rather than v9 legacy defaults, valid values retained, layers retained, and input unchanged. Add built-in, variants-shaped, flat undeclared-new, declared-v9 legacy, and current-v10 custom preset cases.

Add server cases:

```js
it.each([
  ['textOverflow', 'truncate'],
  ['textWrap', 'true'],
])('rejects malformed present v10 %s on text/grid', (field, value) => {
  const state = goodState();
  state.schemaVersion = 10;
  state.variants.default.templates.page.elements = [
    { id: 'text', type: 'text', [field]: value },
    { id: 'grid', type: 'grid', [field]: value },
  ];
  expect(validateAppState(state)).toMatchObject({ ok: false, error: expect.stringContaining(field) });
});

it('accepts missing fields, old-schema malformed fields, and unrelated shape fields', () => {
  const state = goodState();
  state.schemaVersion = 9;
  state.variants.default.templates.page.elements = [
    { id: 'old', type: 'text', textOverflow: 'old-value', textWrap: 'yes' },
    { id: 'shape', type: 'rect', textOverflow: 'future', textWrap: 1 },
  ];
  expect(validateAppState(state)).toEqual({ ok: true });
});
```

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/presets.test.ts tests/unit/server/validateAppState.test.js`

Expected: FAIL with absent creation fields, generated/preset legacy values or missing values, literal schema 9 assertions, and permissive v10 server validation.

- [ ] **Step 4: Stamp deterministic Canvas creation defaults**

Add `textOverflow` and `textWrap` directly in both `newEl` literals. For click text set `clip/true`; for drag text set `clip/true`; for grid set `clip/false`; for every other tool leave both properties absent. Do not read or write local storage for either field.

- [ ] **Step 5: Normalize generated templates before current stamping**

In `generatorTemplates.ts`, pass every `ensureTemplateLayers(autoIdElements(tpl))` result through `normalizeTextOverflowTemplate`. In `validateGeneratedProject.ts`, change `GeneratedProject.schemaVersion` to literal `10`, remove the synthetic `schemaVersion: 8` call through legacy migration, and construct the validated project only after `normalizeGeneratedTemplates` has installed normalized variants:

```ts
project = {
  nodes,
  rootId: cloned.hierarchy.rootId,
  variants,
  activeVariantId,
  schemaVersion: CURRENT_SCHEMA_VERSION,
};
```

Keep raw JSON/security/dimension/traversal/limit validation before normalization. Keep the post-normalization byte limit. In `createGeneratedAppState`, stamp `CURRENT_SCHEMA_VERSION` after cloning `project.variants`. `ProjectEditor.handleApplyGenerated` already stamps the constant after validation and needs no alternate state path.

- [ ] **Step 6: Separate new preset normalization from declared legacy migration**

For preset data with an own integer `schemaVersion < 10`, keep sequential `loadProjectState` migration. For custom v10 call `loadProjectState` so current normalization runs. Treat built-ins and undeclared `loadPreset` data as new: deep-clone, convert flat templates directly into a `default` variant, call `ensureTemplateLayers` and `normalizeTextOverflowTemplate` on each template, then stamp v10. Preserve independent layer IDs per call and never mutate module-level preset objects.

Use this branch decision without introducing a second migration path:

```ts
const declaredVersion = Object.hasOwn(data, 'schemaVersion') ? data.schemaVersion : undefined;
if (Number.isInteger(declaredVersion)) {
  return loadProjectState({
    ...baseState,
    ...(hasTemplates ? { templates: structuredClone(data.templates) } : {}),
    ...(hasVariants ? {
      variants: structuredClone(data.variants),
      activeVariantId: data.activeVariantId || Object.keys(data.variants)[0],
    } : {}),
    schemaVersion: declaredVersion,
  }).state;
}
const variants = hasVariants
  ? structuredClone(data.variants)
  : { default: { id: 'default', name: 'Default', templates: structuredClone(data.templates) } };
const current = { ...baseState, variants, activeVariantId: data.activeVariantId || Object.keys(variants)[0], schemaVersion: 10 };
for (const variant of Object.values(current.variants)) {
  for (const [templateId, template] of Object.entries(variant.templates)) {
    variant.templates[templateId] = normalizeTextOverflowTemplate(ensureTemplateLayers(template));
  }
}
return current as AppState;
```

`baseState`, `hasTemplates`, and `hasVariants` are the existing values in `loadPreset`; retain every current UI default in `baseState`.

- [ ] **Step 7: Add lightweight v10+ server checks**

Inside the existing element loop, when `Number.isInteger(state.schemaVersion) && state.schemaVersion >= 10` and `el.type` is text/grid, reject a present `textOverflow` not in `['clip', 'ellipsis', 'shrink', 'visible']` and a present non-boolean `textWrap`. Do not assign, delete, coerce, or validate these fields on other element types.

- [ ] **Step 8: Run GREEN tests**

Run: `npx vitest run tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/presets.test.ts tests/unit/server/validateAppState.test.js tests/unit/migration.test.ts`

Expected: PASS; generated/new preset values use clip defaults, declared v9 presets use legacy values, server remains backward-compatible, and no shared preset object is mutated.

- [ ] **Step 9: Commit new-content boundaries**

```bash
git add components/Canvas.tsx services/generatorTemplates.ts services/validateGeneratedProject.ts services/generatedProjectState.ts services/presets.ts server/validateAppState.js tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/presets.test.ts tests/unit/server/validateAppState.test.js tests/unit/migration.test.ts
git commit -m "feat: default text overflow settings"
```

---

### Task 3: Pure Renderer-Independent Text Layout Engine

**Files:**
- Create: `services/boundedLruCache.ts`
- Create: `services/graphemes.ts`
- Create: `services/textLayout.ts`
- Create: `tests/unit/textLayoutTestUtils.ts`
- Create: `tests/unit/textLayout.wrap.test.ts`
- Create: `tests/unit/textLayout.modes.test.ts`
- Create: `tests/unit/textLayout.unicodeCache.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `TextOverflow` from Task 1 and only injected `TextMeasurer`; no React, DOM, Canvas, or jsPDF import.
- Produces: shared interfaces listed above, deterministic positioned lines, `TextMeasurementError`, and bounded engine caches used by both adapters.

- [ ] **Step 1: Install exact fallback dependency**

Run: `npm install --legacy-peer-deps unicode-segmenter@0.17.0 --save-exact`

Expected: `package.json` contains `"unicode-segmenter": "0.17.0"`; lockfile records version 0.17.0 and no transitive runtime dependencies.

- [ ] **Step 2: Add deterministic test utilities**

```ts
import type { TextLayoutRequest, TextMeasurer } from '../../services/textLayout';

export const monoMeasurer = (calls: string[] = []): TextMeasurer => ({
  cacheKey: 'fake-mono-v1',
  measureWidth(text, font) {
    calls.push(`${font.size}:${text}`);
    return [...text].length * font.size;
  },
});

export const request = (overrides: Partial<TextLayoutRequest> = {}): TextLayoutRequest => ({
  text: 'AB CD', contentWidth: 3, contentHeight: 12, fontSize: 1,
  fontFamily: 'Fake Mono', fontWeight: 'normal', fontStyle: 'normal',
  textOverflow: 'clip', textWrap: true, align: 'left', verticalAlign: 'top',
  ...overrides,
});
```

- [ ] **Step 3: Write common-layout RED tests**

Cover CRLF/CR normalization; leading/repeated/trailing newlines; wrap off retaining one line per hard line; greedy latest-whitespace breaks; repeated whitespace; long token grapheme breaks; empty hard lines; exact width; all horizontal and vertical alignments; partial clip line geometry; empty/whitespace-only text; invalid font and boxes.

Representative geometry assertion:

```ts
const engine = createTextLayoutEngine();
const result = engine.layout(request({
  text: 'AB CD', contentWidth: 3, contentHeight: 1.5,
  fontSize: 1, textWrap: true, align: 'right', verticalAlign: 'bottom',
}), monoMeasurer())!;
expect(result.lines.map(line => line.text)).toEqual(['AB ', 'CD']);
expect(result.lineHeight).toBe(1.2);
expect(result.blockHeight).toBe(2.4);
expect(result.lines[0].top).toBeCloseTo(-0.9);
expect(result.lines[0].baseline).toBeCloseTo(0);
expect(result.lines[1].x).toBe(1);
expect(result.requiresClip).toBe(true);
```

- [ ] **Step 4: Write mode RED tests**

Use table-driven wrap-on/off requests for all four modes. Assert clip retains every line at base size; visible has identical lines with `requiresClip: false`; unwrapped ellipsis considers only first hard line and marks a later hard line hidden; wrapped ellipsis uses `floor(height / lineHeight)` complete lines; capacity zero draws none; hidden later lines force U+2026; too-narrow ellipsis draws no glyph.

Add shrink cases with deterministic width `text.length * size`: base fit, width limited, height limited, hard multiline, wrapped multiline, near-zero no result, invalid boxes, deterministic repeat, original request unchanged, and no more than base check plus 16 candidate measurements for a one-line request.

```ts
const engine = createTextLayoutEngine();
const shrink = engine.layout(request({
  text: '1234', contentWidth: 2, contentHeight: 1.2,
  fontSize: 2, textOverflow: 'shrink', textWrap: false,
}), monoMeasurer())!;
expect(shrink.effectiveFontSize).toBeCloseTo(0.5, 2);
expect(shrink.lines[0].width).toBeLessThanOrEqual(2);
expect(shrink.blockHeight).toBeLessThanOrEqual(1.2);
expect(shrink.requiresClip).toBe(true);
```

- [ ] **Step 5: Write Unicode/fallback/cache RED tests**

Call `segmentGraphemes(text, null)` to force fallback and compare native/fallback clusters for `e\u0301`, `👍🏽`, `🇮🇳`, `👨‍👩‍👧‍👦`, and surrogate-pair `𝄞`. Ellipsize each without splitting clusters. Test `BoundedLruCache(2)` refresh-on-read and oldest eviction. Test engine segmentation and complete-layout cache reuse, input-complete key differences for every request field and `measurer.cacheKey`, maximum 20,000 entries, and `clear()`.

- [ ] **Step 6: Run RED tests**

Run: `npx vitest run tests/unit/textLayout.wrap.test.ts tests/unit/textLayout.modes.test.ts tests/unit/textLayout.unicodeCache.test.ts`

Expected: FAIL because pure cache, segmentation, and layout modules do not exist.

- [ ] **Step 7: Implement fixed-capacity LRU and grapheme fallback**

`BoundedLruCache.get` must delete/reinsert hits; `set` must replace an existing key then evict `map.keys().next().value` while size exceeds capacity; expose only `size`, `get`, `set`, and `clear`. Reject non-positive/non-integer capacity in constructor.

In `graphemes.ts`:

```ts
import { splitGraphemes } from 'unicode-segmenter/grapheme';

const native = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function segmentGraphemes(
  text: string,
  segmenter: Pick<Intl.Segmenter, 'segment'> | null = native,
): string[] {
  return segmenter
    ? Array.from(segmenter.segment(text), part => part.segment)
    : Array.from(splitGraphemes(text));
}
```

- [ ] **Step 8: Implement common line layout exactly**

Normalize line endings before cache lookup. Split on `\n`, preserving empty array entries. With wrap off, measure each hard line unchanged. With wrap on, append graphemes greedily; when candidate exceeds width, break after the latest fitting whitespace grapheme already in the candidate, preserving that whitespace in the emitted line; otherwise emit the largest non-empty fitting grapheme prefix. If one grapheme alone exceeds width, emit that grapheme so shrink can detect non-fit. Preserve empty hard lines as `{ text: '', width: 0 }`.

Maintain latest whitespace index during one forward grapheme pass and never restart scanning from the hard-line beginning. Tests must bound non-shrink measurement calls by a constant multiple of grapheme count; ellipsis removes each grapheme at most once. This preserves the required linear grapheme-pass bound even though injected renderer measurement cost is opaque.

Every width result must be finite and non-negative or throw `TextMeasurementError`. Build positioned lines with:

```ts
const lineHeight = fontSize * 1.2;
const blockHeight = lines.length * lineHeight;
const blockTop = verticalAlign === 'top' ? 0
  : verticalAlign === 'bottom' ? contentHeight - blockHeight
  : (contentHeight - blockHeight) / 2;
const x = align === 'left' ? 0
  : align === 'right' ? contentWidth - width
  : (contentWidth - width) / 2;
const top = blockTop + index * lineHeight;
const baseline = top + (lineHeight - fontSize) / 2 + fontSize * 0.8;
```

- [ ] **Step 9: Implement exact mode policies**

For clip, retain common lines and set clip true. For visible, retain common lines and set clip false. For unwrapped ellipsis, use first hard line only; truncate if it exceeds width or any later hard line exists. For wrapped ellipsis, calculate full-line capacity with floor, retain that many lines, and ellipsize final retained line only when content remains. Remove trailing whole graphemes until candidate plus U+2026 fits; if U+2026 alone does not fit, final line text is empty. Ellipsis always safety-clips.

For shrink, perform base fit first. Fit requires every measured line width `<= contentWidth` and complete block height `<= contentHeight`. If needed, binary search with `low = 0`, `high = baseFontSize`, 16 iterations maximum, early break at `high - low <= 0.01`, retaining largest positive fit. Re-layout once at retained size, safety-clip, and never modify request.

Return `null` before measurement only when `text.length === 0`, font size is non-finite/non-positive, or content dimensions are non-finite/non-positive. Whitespace-only and explicit empty hard lines remain valid layout input. Cache immutable results with `JSON.stringify([measurer.cacheKey, normalizedRequest])`; cache grapheme arrays by exact input string. Both caches default to 20,000.

- [ ] **Step 10: Run GREEN tests**

Run: `npx vitest run tests/unit/textLayout.wrap.test.ts tests/unit/textLayout.modes.test.ts tests/unit/textLayout.unicodeCache.test.ts`

Expected: PASS; all modes, Unicode sequences, search bound, alignment geometry, and cache limits are deterministic.

- [ ] **Step 11: Commit pure engine**

```bash
git add package.json package-lock.json services/boundedLruCache.ts services/graphemes.ts services/textLayout.ts tests/unit/textLayoutTestUtils.ts tests/unit/textLayout.wrap.test.ts tests/unit/textLayout.modes.test.ts tests/unit/textLayout.unicodeCache.test.ts
git commit -m "feat: add shared text layout engine"
```

---

### Task 4: Canvas Fixed-Text Adapter And Integration

**Files:**
- Create: `services/canvasTextLayout.ts`
- Create: `components/canvas/useCanvasTextLayoutSession.ts`
- Create: `tests/unit/canvasFixedTextLayout.test.tsx`
- Modify: `components/Canvas.tsx:1-12,1540-1590`
- Modify: `components/canvas/ReadOnlyPagePreview.tsx:1-66`
- Modify: `components/canvas/CanvasElement.tsx:10-66,68-79,249-327,699-747`
- Modify: `tests/unit/canvasElementTextVisibility.test.tsx`
- Modify: `tests/unit/canvasTestUtils.tsx`
- Modify: `tests/unit/canvasElementSvgSanitize.test.tsx`
- Modify: `tests/unit/canvasPatternScale.test.tsx`
- Modify: `tests/unit/ReadOnlyPagePreview.test.tsx`

**Interfaces:**
- Consumes: `TextLayoutEngine`, resolved Task 1 settings, existing `isVisibleText`, and CSS font styling.
- Produces: one bounded Canvas metric/layout session per Canvas/preview renderer and explicit fixed-text line DOM with no browser wrapping/truncation.

- [ ] **Step 1: Write Canvas adapter RED tests**

Use a fake `HTMLCanvasElement` whose single context records `font` and returns deterministic `measureText().width`. Assert one context reuse; CSS family/weight/style/size in `context.font`; width cache hit; 20,000 eviction; malformed measurement logs once with supplied context and returns null; `clear()` forces remeasurement. Defer `getContext('2d')` until first measurement so non-text Canvas tests never require a jsdom Canvas implementation.

- [ ] **Step 2: Write fixed-text integration RED tests**

Inject a fake `CanvasTextLayoutSession` through the new required `textLayoutSession` prop. For all eight mode/wrap combinations assert the request contains resolved text and exact `w/h`, returned lines render as separate `[data-text-layout-line]` nodes, returned size/line height/top/x are applied, contained modes use exact local hidden overflow, and visible uses visible overflow. Assert rotation remains only on the outer `[data-element-id]` wrapper.

Render the same fixed request at `renderScale` 0.5, 1, and 2; assert line strings, effective size, and local geometry are identical because outer Canvas scaling must not change layout decisions.

Add regressions:

```ts
expect(layoutSession.layout).not.toHaveBeenCalledFor(autoWidthText);
expect(layoutSession.layout).not.toHaveBeenCalledFor(rectWithCaption);
expect(layoutSession.layout).not.toHaveBeenCalledFor(triangleWithCaption);
expect(autoWidthNode).toHaveStyle({ whiteSpace: 'pre', overflow: 'visible' });
expect(shapeCaption).toHaveTextContent('UNCHANGED CAPTION');
```

Render fixed text with `isEditing` and assert committed lines become transparent while `OverlayTextEditor` behavior/source remains untouched. Retain existing invalid/missing font-size tests.

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/unit/canvasFixedTextLayout.test.tsx tests/unit/canvasElementTextVisibility.test.tsx`

Expected: FAIL because Canvas still delegates fixed text to `pre-wrap` and no Canvas metric session exists.

- [ ] **Step 4: Implement bounded Canvas measurement session**

Move the current `FONT_FAMILY_MAP` values into `resolveCanvasFontFamily` and use that function for both CanvasElement drawing and metric font strings. Create one offscreen canvas/context per session. Key its `BoundedLruCache` by exact JSON tuple `[sessionIdentity, resolvedFamily, weight, style, size, text]`, maximum 20,000. Configure context as:

```ts
context.font = `${font.style} ${font.weight} ${font.size}px ${resolveCanvasFontFamily(font.family)}`;
```

Pass cached measurement through one `createTextLayoutEngine()`. Catch `TextMeasurementError` and context exceptions; invoke warning only on the first session failure as `[CanvasTextLayout] Skipped ${context}` plus error. Return null and continue rendering.

- [ ] **Step 5: Add renderer-scoped hook and font invalidation**

`useCanvasTextLayoutSession` lazily creates one session, subscribes to `document.fonts` `loadingdone`, clears session caches, and increments a local reducer to trigger normal rerender. Remove listener and clear on unmount. If `document.fonts` is unavailable, keep session without listener. Pass session from both `Canvas` and `ReadOnlyPagePreview` to every `CanvasElement`; allow those two renderer components to accept an optional injected session for tests, while `CanvasElement` requires one. Update `canvasTestUtils` plus every direct CanvasElement/ReadOnlyPagePreview test listed in this task with a bounded fake session rather than adding a process-global default.

- [ ] **Step 6: Render fixed text from explicit layout only**

For `element.type === 'text' && !element.autoWidth`, resolve settings and request layout with exact `w/h`, base resolved font, existing default align/vertical align, and resolved binding text. Render one absolute local text container with `overflow: layout.requiresClip ? 'hidden' : 'visible'`, no padding, and one absolute `whiteSpace: 'pre'` line per result:

```tsx
<span
  data-text-layout-line
  style={{
    position: 'absolute', left: line.x, top: line.top,
    fontSize: layout.effectiveFontSize,
    lineHeight: `${layout.lineHeight}px`, whiteSpace: 'pre',
  }}
>{line.text}</span>
```

Keep color/family/weight/style/decoration on the local container. Keep outer translation, rotation, transform origin, opacity, z-index, selection, hit area, background, and `isEditing` opacity. Route auto-width text and every non-text caption through the existing native branch without changing its DOM styles.

- [ ] **Step 7: Run GREEN tests**

Run: `npx vitest run tests/unit/canvasFixedTextLayout.test.tsx tests/unit/canvasElementTextVisibility.test.tsx tests/unit/canvasElementSvgSanitize.test.tsx tests/unit/canvasLayers.test.tsx`

Expected: PASS; fixed text uses explicit lines, auto-width/shape paths do not call engine, and existing Canvas rendering regressions remain green.

- [ ] **Step 8: Commit fixed Canvas rendering**

```bash
git add services/canvasTextLayout.ts components/canvas/useCanvasTextLayoutSession.ts components/Canvas.tsx components/canvas/ReadOnlyPagePreview.tsx components/canvas/CanvasElement.tsx tests/unit/canvasFixedTextLayout.test.tsx tests/unit/canvasElementTextVisibility.test.tsx tests/unit/canvasTestUtils.tsx tests/unit/canvasElementSvgSanitize.test.tsx tests/unit/canvasPatternScale.test.tsx tests/unit/ReadOnlyPagePreview.test.tsx
git commit -m "feat: render fixed canvas text layouts"
```

---

### Task 5: Canvas Grid Adapter Integration And Typography Controls

**Files:**
- Create: `tests/unit/canvasGridTextLayout.test.tsx`
- Create: `tests/unit/SingleElementEditorTextOverflow.test.tsx`
- Create: `tests/unit/PropertiesPanelTextOverflow.test.tsx`
- Modify: `components/canvas/CanvasElement.tsx:467-590`
- Modify: `components/properties/SingleElementEditor.tsx:992-1156`

**Interfaces:**
- Consumes: Task 4 Canvas session and Task 1 resolver.
- Produces: independent cell requests/drawing, exact grid inset, controls using existing `onUpdate`/history path.

- [ ] **Step 1: Write grid Canvas RED tests**

Render two real child labels with different lengths and style overrides. For all mode/wrap combinations assert one layout request per non-empty visible cell, `contentWidth === Math.max(0, element.w - 2)`, `contentHeight === element.h`, font-weight overrides remain request-specific, and rendered color overrides remain cell-specific. Return different shrink sizes and assert each cell uses only its own result and persisted `element.fontSize` remains unchanged.

Assert text content box starts at `left: 1px`, has zero vertical inset, and contained modes cannot spill while visible can. Cell fill/border/radius remain on full `w x h`; cell `[data-grid-cell]` remains full-size pointer/link target. Rotation remains on outer grid wrapper. Preserve empty cells, mock labels, traversal, header/first-column priority, alternating styles, and outer border order.

- [ ] **Step 2: Write controls/history RED tests**

Render `SingleElementEditor` for fixed text, auto-width text, grid, and rect. Assert exact labels and option sequence:

```ts
expect(screen.getAllByRole('option').map(option => option.textContent))
  .toEqual(['Clip', 'Ellipsis', 'Shrink', 'Visible']);
fireEvent.change(screen.getByLabelText('Overflow'), { target: { value: 'shrink' } });
expect(onUpdate).toHaveBeenCalledWith({ textOverflow: 'shrink' });
fireEvent.click(screen.getByLabelText('Wrap'));
expect(onUpdate).toHaveBeenCalledWith({ textWrap: false });
```

For grid use grid labels. For auto-width assert both disabled and exact explanation. For missing/malformed applicable fields assert resolver-driven defaults, never an undefined select option. For rect assert controls absent.

Render `PropertiesPanel` with one selected fixed text, change one overflow control, and assert `onUpdateElements` called exactly once with `saveHistory === true` and one changed element. Change wrap and assert one additional call. Assert no call contains `fontSize` unless source already had it unchanged.

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/unit/canvasGridTextLayout.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/PropertiesPanelTextOverflow.test.tsx`

Expected: FAIL because grid uses native single-line truncate and controls do not exist.

- [ ] **Step 4: Replace grid truncation with per-cell explicit layout**

Keep full cell outer div and styles. Add `data-grid-cell` to that div. Inside it, request layout for each visible label using resolved element settings and effective cell font weight/style. Use a nested text content box at `left: 1`, `top: 0`, `width: Math.max(0, w - 2)`, `height: h`; apply returned clip mode there. Render explicit line spans with Task 4 geometry. Remove `className="truncate"` and browser text overflow. Set nested text pointer events to none so full cell remains target. Do not call `onUpdate` from rendering.

- [ ] **Step 5: Add normalized controls inside Typography**

After font/color controls and before alignment controls, call resolver for text/grid and render labelled controls. Use exact option values/order. A checkbox may be visually styled as existing toggles but must retain accessible label. Both controls call one existing `onUpdate` invocation. Auto-width text gets `disabled` on both plus exact explanation. Do not write local storage.

- [ ] **Step 6: Run GREEN tests**

Run: `npx vitest run tests/unit/canvasGridTextLayout.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/PropertiesPanelTextOverflow.test.tsx tests/unit/canvasPatternScale.test.tsx tests/unit/canvasLayers.test.tsx`

Expected: PASS; per-cell requests differ, controls/history are exact, full-cell geometry/styles remain unchanged, and no shrink result persists.

- [ ] **Step 7: Commit grid Canvas and UI**

```bash
git add components/canvas/CanvasElement.tsx components/properties/SingleElementEditor.tsx tests/unit/canvasGridTextLayout.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/PropertiesPanelTextOverflow.test.tsx
git commit -m "feat: render canvas grid text overflow"
```

---

### Task 6: PDF Fixed-Text Adapter, Transforms, Clips, Decorations, And Links

**Files:**
- Create: `services/pdfTextLayout.ts`
- Create: `tests/unit/pdfTextLayoutAdapter.test.ts`
- Create: `tests/unit/pdfFixedTextOverflow.test.ts`
- Modify: `services/pdfService.ts:644-694,789-887,928-1096,1714-1825`
- Modify: `tests/unit/pdfLinks.test.ts`

**Interfaces:**
- Consumes: shared layout engine and existing `applyFont`, text visibility, element transform, color, and link resolution.
- Produces: one metric/layout session per `generatePDF`, explicit fixed-text lines, rectangular local clips, error-safe drawing, unchanged auto-width/shape captions.

- [ ] **Step 1: Write PDF adapter RED tests with a call-recording fake doc**

Fake `getTextWidth`, `saveGraphicsState`, `rect`, `clip`, `discardPath`, `text`, `line`, and `restoreGraphicsState`. Assert font selector runs before every uncached measurement and final draw; width key contains renderer identity/family/weight/style/size/string; cache is bounded at 20,000; same input is cached; session clear remeasures.

For a clipped two-line result, assert exact operation order:

```ts
expect(calls).toEqual([
  'save', 'rect:10,20,100,40', 'clip', 'discard',
  'font:12', 'text:first@10,30.8', 'text:second@10,45.2',
  'restore',
]);
```

Use computed baseline values from fixture rather than hard-coding values inconsistent with `1.2`. Add underline assertions using existing geometry: line width `max(0.5, size * 0.05)`, y `baseline + size * 0.15`, and returned line width/x. Assert visible makes no clip calls. Force measurement and `doc.text` failures; assert one warning, `restore` still occurs, draw returns false, and later draw succeeds without leaked state.

- [ ] **Step 2: Write fixed PDF integration RED tests**

Build real `generatePDF` states using `fontFamily: '__builtin_fallback__'` so text operators remain inspectable. Cover all modes/wrap settings, explicit newline, ellipsis, shrink `Tf`, top/middle/bottom anchors, underline, rotation, non-empty whole-element URL/internal links, zero boxes, and a following control element proving clips/transforms do not leak. Assert fixed in-scope text does not use `splitTextToSize`; auto-width text and rect/triangle captions preserve existing behavior.

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/unit/pdfTextLayoutAdapter.test.ts tests/unit/pdfFixedTextOverflow.test.ts tests/unit/pdfLinks.test.ts`

Expected: FAIL because fixed PDF text still calls `splitTextToSize`, lacks policy clips, and has no session adapter.

- [ ] **Step 4: Implement per-export PDF metrics and warning boundary**

Instantiate `createPdfTextLayoutSession(doc)` once after jsPDF creation and clear it before `generatePDF` returns. Its measurer calls the supplied `selectFont(size)` then `doc.getTextWidth(text)`. Key width cache by `[metricIdentity, size, text]`, max 20,000. `metricIdentity` from `pdfService` must include resolved registered/fallback family, weight, style, and export identity. Modify `applyFont` to accept an optional effective size and return the actual selected `family/style` identity; fallback measurement and drawing both select built-in helvetica normal.

Catch measurement exceptions/non-finite/negative widths in session layout, warn once as `[PDFTextLayout] Skipped ${context}`, and return null. Do not abort export.

- [ ] **Step 5: Implement balanced explicit-line PDF drawing**

`draw` saves graphics state only when `layout.requiresClip`; defines `doc.rect(box.x, box.y + box.yOffset, box.width, box.height)`, calls `clip`, consumes path with `discardPath()` or raw `n`, selects effective font, and draws each non-empty line at `box.x + line.x`, `box.y + box.yOffset + line.baseline` with left alignment/alphabetic baseline. Draw underline inside same state. Always restore in `finally`. Catch line/decorations errors, warn once through session, return false, and let export continue.

- [ ] **Step 6: Route only fixed text through shared layout**

After existing text/binding resolution and visibility checks:

```ts
const usesSharedLayout = el.type === 'text' && !el.autoWidth;
if (usesSharedLayout) {
  const settings = resolveTextOverflowSettings(el)!;
  const selectedFont = applyFont(doc, el, options.isGreyscale, fontSize);
  const fontIdentity = `pdf:${selectedFont.family}:${selectedFont.style}:${el.fontWeight || 'normal'}:${el.fontStyle || 'normal'}`;
  const selectFont = (size: number) => { applyFont(doc, el, options.isGreyscale, size); };
  const layout = pdfTextSession.layout({
    text: textContent, contentWidth: w, contentHeight: h,
    fontSize, fontFamily: el.fontFamily || 'helvetica',
    fontWeight: el.fontWeight || 'normal', fontStyle: el.fontStyle || 'normal',
    textOverflow: settings.textOverflow, textWrap: settings.textWrap,
    align: el.align || 'center', verticalAlign: el.verticalAlign || 'middle',
  }, fontIdentity, selectFont, `text ${el.id}`);
  if (layout) {
    pdfTextSession.draw(
      layout,
      { x: lx, y: ly, width: w, height: h, yOffset },
      { selectFont, textDecoration: el.textDecoration, context: `text ${el.id}` },
    );
  }
}
```

Do not subtract current two-unit PDF padding. Keep current auto-width no-soft-wrap/content-sized path and shape-caption padding/native splitting unchanged. Keep outer element rotation/opacity transform; nested local clip therefore rotates with it. Apply non-empty text link after drawing regardless of how many glyphs ellipsis/shrink returned, using existing whole element AABB and target eligibility.

- [ ] **Step 7: Run GREEN tests**

Run: `npx vitest run tests/unit/pdfTextLayoutAdapter.test.ts tests/unit/pdfFixedTextOverflow.test.ts tests/unit/pdfLinks.test.ts tests/unit/pdfLayers.test.ts tests/unit/pdfElementOpacity.test.ts`

Expected: PASS; fixed text uses shared lines and local clips, auto-width/shapes regressions stay unchanged, links remain whole-element, and graphics state is balanced after failures.

- [ ] **Step 8: Commit fixed PDF rendering**

```bash
git add services/pdfTextLayout.ts services/pdfService.ts tests/unit/pdfTextLayoutAdapter.test.ts tests/unit/pdfFixedTextOverflow.test.ts tests/unit/pdfLinks.test.ts
git commit -m "feat: render fixed PDF text layouts"
```

---

### Task 7: PDF Grid Per-Cell Layout, Shrink, Clip State, Links, And Style Regressions

**Files:**
- Create: `tests/unit/pdfGridTextOverflow.test.ts`
- Modify: `services/pdfService.ts:1155-1515`
- Modify: `tests/unit/pdfSvgGrayscaleOpacity.test.ts`
- Modify: `tests/unit/pdfPatterns.test.ts`
- Modify: `tests/unit/pdfLinks.test.ts`

**Interfaces:**
- Consumes: Task 6 per-export PDF session and existing grid traversal/fill/border/link logic.
- Produces: independent per-cell requests and drawing with exact one-unit horizontal inset and no graphics-state leakage.

- [ ] **Step 1: Write PDF grid RED request tests**

Mock `createPdfTextLayoutSession` while retaining actual exports, then generate a grid with two children. Assert two layout calls receive resolved labels, `contentWidth: Math.max(0, cellW - 2)`, `contentHeight: cellH`, independent style identities after header/first-column overrides, and unchanged element base font. Return effective sizes 12 and 6 and assert draw receives each matching result.

- [ ] **Step 2: Write real PDF grid RED regressions**

Use built-in font output and states covering all modes/wrap settings, long labels, hard newlines, distinct per-cell shrink, top/middle/bottom, header/first-column bold and color priority, rotation, rounded/pattern/fill/borders, whole-cell internal links, and a following cell/element. Inspect text/graphics operators and links. Force first-cell measurement/draw failure and assert second cell plus outer border still render, warning occurs once, and save/restore counts remain balanced.

Assert contained text clips use `(cellX + 1, cellY, max(0, cellW - 2), cellH)` while fill, border, radius, and link use `(cellX, cellY, cellW, cellH)`. Assert visible emits no cell text clip.

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/unit/pdfGridTextOverflow.test.ts tests/unit/pdfSvgGrayscaleOpacity.test.ts tests/unit/pdfPatterns.test.ts tests/unit/pdfLinks.test.ts`

Expected: FAIL because grid still emits one unbounded `doc.text` call with four-unit positioning and no policy layout.

- [ ] **Step 4: Integrate per-cell shared layout after style resolution**

Keep traversal, offset, fill, pattern, cell border, outer border, and link order. After calculating `cellTextColorHex` and `cellFontWeight`, resolve element settings and call PDF session for each visible label with local content width `max(0, cellW - 2)`, height `cellH`, and style-specific metric identity. Draw with box `{ x: cellX + 1, y: cellY, width: max(0, cellW - 2), height: cellH, yOffset }`. Remove direct unbounded `doc.text` and old four-unit top/bottom/left/right offsets.

Keep each cell search independent; metric cache still shares identical strings/styles/sizes. Do not assign effective size to `el`, `cellEl`, state, history, or another cell.

- [ ] **Step 5: Preserve full-cell links and isolate failures**

Run existing target-page resolution after text attempt. Keep `doc.link(cellX, cellY, cellW, cellH, ...)` and existing `angle === 0` eligibility exactly. Session catches each cell measurement/draw error and restores its own clip; continue loop. Draw outer grid border after all cell text as before. Reset dash state after grid.

- [ ] **Step 6: Run GREEN tests**

Run: `npx vitest run tests/unit/pdfGridTextOverflow.test.ts tests/unit/pdfSvgGrayscaleOpacity.test.ts tests/unit/pdfPatterns.test.ts tests/unit/pdfLinks.test.ts tests/unit/pdfGeneratedTraversal.test.ts`

Expected: PASS; no contained-mode spill, visible is unclipped, shrink differs per cell, styles affect metrics, full-cell links remain, and no clip/transform leaks.

- [ ] **Step 7: Commit PDF grid rendering**

```bash
git add services/pdfService.ts tests/unit/pdfGridTextOverflow.test.ts tests/unit/pdfSvgGrayscaleOpacity.test.ts tests/unit/pdfPatterns.test.ts tests/unit/pdfLinks.test.ts
git commit -m "feat: render PDF grid text overflow"
```

---

### Task 8: Serialization, Import, Generated/Preset, Diff/Cloud, And Adapter Parity

**Files:**
- Create: `tests/fixtures/text-overflow-parity-v10.json`
- Create: `tests/unit/textOverflowPersistence.test.ts`
- Create: `tests/unit/textLayoutParity.test.ts`
- Modify: `tests/unit/EditorPageGeneratorMetadata.test.tsx`
- Modify: `tests/unit/JsonModalGeneratorMetadata.test.tsx`
- Modify: `tests/unit/HistoryModal.test.tsx`
- Modify: `tests/unit/MergeRequestPage.test.tsx`
- Modify: `tests/unit/projectDocumentSnapshot.test.ts`
- Modify: `tests/unit/server/stateCodec.test.js`
- Modify: `tests/unit/shared/diff.test.js`
- Modify: `tests/unit/generatorVisualPreview.test.ts`
- Modify: `tests/unit/GeneratorVisualPreviewModal.test.tsx`
- Modify: `tests/unit/PublishModal.test.tsx`
- Modify: `tests/unit/GalleryDetailPage.test.tsx`
- Modify: `tests/unit/pdfGeneratedTraversal.test.ts`
- Modify: `tests/unit/pdfPatterns.test.ts`
- Modify: `tests/unit/EditorPageGeneratedProject.test.tsx`
- Modify: `tests/unit/ProjectEditor.generatorHistory.test.tsx`

**Interfaces:**
- Consumes: all canonical state and layout APIs from Tasks 1-7.
- Produces: proof that existing whole-state/template clone/serialization paths preserve settings and both adapters return identical layout policy under equal metrics.

- [ ] **Step 1: Build one current-schema parity fixture**

Create a complete loadable AppState with one 595.28 x 841.89 template, one visible layer, root plus two grid children, and fixed text examples for all four modes with wrap on/off. Include top/middle/bottom and left/center/right, exact fit, long unbroken Unicode, hard/empty lines, bold, italic, underline, one 17-degree rotated fixed text, auto-width text carrying `shrink/false`, a rect caption carrying malformed fields, and four grids. Keep every wrap threshold at least one layout unit from measured boundary. Set schema 10 and canonical applicable values.

- [ ] **Step 2: Write persistence RED/regression tests**

Load fixture and assert exact settings survive:

```ts
const allApplicableSettings = (state: any) => Object.values(state.variants)
  .flatMap((variant: any) => Object.values(variant.templates))
  .flatMap((template: any) => template.elements)
  .filter((element: any) => element.type === 'text' || element.type === 'grid')
  .map((element: any) => ({ id: element.id, textOverflow: element.textOverflow, textWrap: element.textWrap }));

const jsonRoundTrip = JSON.parse(JSON.stringify(fixture));
expect(allApplicableSettings(jsonRoundTrip)).toEqual(allApplicableSettings(fixture));

const snapshot = snapshotDocument(fixture);
expect(allApplicableSettings(snapshot)).toEqual(allApplicableSettings(fixture));

const encoded = encodeState(fixture);
expect(allApplicableSettings(decodeStateRow({ state_gzip: encoded.gzip, state_json: '' })))
  .toEqual(allApplicableSettings(fixture));
```

Add generated and preset calls proving new defaults; custom v10 valid preservation; local JSON missing/malformed recovery; v9 import legacy values; cloud gzip preservation. In diff tests change only `textOverflow/textWrap`, assert template modified, apply change set, assert fields preserved in merged clone and target source not aliased.

- [ ] **Step 3: Add every central load-path regression**

Extend existing tests rather than source-bypassing helpers:

- `EditorPage`: local saved project and staged gallery open/fork normalize malformed v10 before `ProjectEditor` receives it.
- `JsonModal`: text/visual Apply preserves valid v10 and defaults malformed values through `loadProjectState`.
- `HistoryModal`: restore normalizes; clone remains raw until staged `EditorPage` load, then normalizes once.
- `MergeRequestPage`: before/after preview passes normalized v10 source/target to `generateThumbnails` through existing `migrateState` calls.

Update exact-current assertions/literal typed generated fixtures to v10 in files listed above. Keep explicit v8/v9 migration inputs old. In `projectDocumentSnapshot.test.ts`, make normal current snapshots v10 and change the existing future sentinel at line 79 from 10 to 11.

- [ ] **Step 4: Add deterministic adapter parity test**

Create fake Canvas `measureText` and fake PDF `getTextWidth` returning the same grapheme-count-by-size function. Feed fixture requests through both sessions and compare only policy/layout fields:

```ts
expect(pdfResult).toMatchObject({
  lines: canvasResult!.lines,
  effectiveFontSize: canvasResult!.effectiveFontSize,
  lineHeight: canvasResult!.lineHeight,
  blockHeight: canvasResult!.blockHeight,
  truncated: canvasResult!.truncated,
  requiresClip: canvasResult!.requiresClip,
});
```

Run across fixed/grid requests for all mode/wrap pairs, Unicode, explicit newlines, alignments, and two per-cell shrink labels. Assert adapter width caches do not change engine results.

- [ ] **Step 5: Run persistence/parity tests**

Run: `npx vitest run tests/unit/textOverflowPersistence.test.ts tests/unit/textLayoutParity.test.ts tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/MergeRequestPage.test.tsx tests/unit/projectDocumentSnapshot.test.ts tests/unit/server/stateCodec.test.js tests/unit/shared/diff.test.js`

Expected: PASS; every external boundary canonicalizes before render, natural serialization preserves fields, generated/preset semantics remain distinct from v9 migration, and fake-metric adapter results match exactly.

- [ ] **Step 6: Run exact-current audit**

Run: `rg -n "schemaVersion:\s*9|toBe\(9\)|current-v9|schema v9" services components pages tests/unit --glob '*.{ts,tsx,js,jsx}'`

Expected: matches remain only in fixtures/tests deliberately exercising v9 migration or backward-compatible old-schema server behavior. No `GeneratedProject`, generated apply/state, preset current assertion, current snapshot, renderer fixture, gallery current fixture, or current modal fixture remains at v9.

- [ ] **Step 7: Commit integration and parity coverage**

```bash
git add tests/fixtures/text-overflow-parity-v10.json tests/unit/textOverflowPersistence.test.ts tests/unit/textLayoutParity.test.ts tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/MergeRequestPage.test.tsx tests/unit/projectDocumentSnapshot.test.ts tests/unit/server/stateCodec.test.js tests/unit/shared/diff.test.js tests/unit/generatorVisualPreview.test.ts tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/PublishModal.test.tsx tests/unit/GalleryDetailPage.test.tsx tests/unit/pdfGeneratedTraversal.test.ts tests/unit/pdfPatterns.test.ts tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx
git commit -m "test: cover text overflow persistence parity"
```

---

### Task 9: Full Tests, Build, TypeScript, Browser, And Manual PDF Verification

**Files:**
- Create: `tests/e2e/text_overflow.spec.js`

**Interfaces:**
- Consumes: v10 fixture and all completed behavior.
- Produces: browser/PDF evidence, full-suite/build/type baseline evidence, and clean final worktree scope.

- [ ] **Step 1: Add browser verification using the v10 fixture**

Load fixture with `page.addInitScript` into `hype_projects` before `/app`:

```js
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/text-overflow-parity-v10.json', import.meta.url),
  'utf8',
));

await page.addInitScript(fixture => {
  localStorage.setItem('hype_projects', JSON.stringify([
    { id: 'text-overflow', name: 'Text Overflow Parity', initialState: fixture },
  ]));
  localStorage.setItem('hype_active_project', 'text-overflow');
}, fixture);
```

Add one controls/defaults test and one rendering/export test. Assert fixed/grid controls, exact option order, auto-width disabled explanation, line-node counts, contained/visible overflow styles, distinct grid shrink font sizes, unchanged auto-width width after fields are present, and rotated local clip nesting.

In rendering/export test, attach Canvas screenshot and downloaded PDF:

```js
const canvasPath = testInfo.outputPath('text-overflow-canvas.png');
await page.screenshot({ path: canvasPath, fullPage: true });
await testInfo.attach('text-overflow-canvas.png', { path: canvasPath, contentType: 'image/png' });
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export PDF' }).click();
const download = await downloadPromise;
const pdfPath = testInfo.outputPath('text-overflow.pdf');
await download.saveAs(pdfPath);
await testInfo.attach('text-overflow.pdf', { path: pdfPath, contentType: 'application/pdf' });
```

- [ ] **Step 2: Run all focused feature tests together**

Run: `npx vitest run tests/unit/textOverflowSettings.test.ts tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/textLayout.wrap.test.ts tests/unit/textLayout.modes.test.ts tests/unit/textLayout.unicodeCache.test.ts tests/unit/canvasFixedTextLayout.test.tsx tests/unit/canvasGridTextLayout.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/PropertiesPanelTextOverflow.test.tsx tests/unit/pdfTextLayoutAdapter.test.ts tests/unit/pdfFixedTextOverflow.test.ts tests/unit/pdfGridTextOverflow.test.ts tests/unit/textLayoutParity.test.ts tests/unit/textOverflowPersistence.test.ts`

Expected: exit 0; all listed files and tests pass with zero failures and no unhandled warning/error output.

- [ ] **Step 3: Run complete unit/integration suite**

Run: `npx vitest run`

Expected: exit 0; every discovered unit/integration test passes, including server, migration, Canvas, PDF, cloud, gallery, generator, and existing regressions.

- [ ] **Step 4: Build production bundle**

Run: `npm run build`

Expected: exit 0; Vite reports successful production build. Inspect bundle warning output and confirm `unicode-segmenter/grapheme` is bundled once and no new fatal chunk/dependency warning appears.

- [ ] **Step 5: Verify exact TypeScript baseline**

Run: `npx tsc --noEmit --pretty false`

Expected: exit 2 with exactly these five diagnostics and no others:

```text
tests/unit/changePassword.test.tsx(17,60): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(11,51): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(12,51): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(15,81): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/svgEditing.test.ts(33,39): error TS2339: Property 'error' does not exist on type 'SvgValidation'.
  Property 'error' does not exist on type '{ ok: true; }'.
```

- [ ] **Step 6: Run focused cross-browser verification**

Run: `npx playwright test tests/e2e/text_overflow.spec.js --project=chromium --project=firefox --project=webkit`

Expected: six tests pass, two in each browser; Canvas screenshot and PDF attachment are retained in test output for the export test.

- [ ] **Step 7: Run complete Chromium browser suite**

Run: `npx playwright test --project=chromium`

Expected: exit 0; every Chromium e2e test passes, including existing Canvas creation/editing and PDF download.

- [ ] **Step 8: Perform manual Canvas/PDF comparison**

Run: `npx playwright show-report`

Expected: Playwright report opens with passing `text_overflow.spec.js` entries and attached `text-overflow-canvas.png` plus `text-overflow.pdf`.

Open both attachments side by side and verify all fixture rows: clip and ellipsis remain inside exact local text/cell boxes; ellipsis appears only when hidden content exists; wrapped ellipsis uses complete lines only; shrink differs by cell and has no visible minimum; visible spills locally; hard empty lines remain; combining marks/emoji/flags/ZWJ sequences remain intact; top/middle/bottom and left/center/right anchors agree within one layout unit; rotated clip rotates with element; underline follows effective size; auto-width and shape captions match legacy output; whole text/cell link areas remain clickable. Record pass/fail in task execution notes before closing report.

- [ ] **Step 9: Inspect final scope and no-SQL guarantee**

Run: `BASE=$(git merge-base main HEAD) && git status --short && git diff --check && git diff --name-only "$BASE"..HEAD`

Expected: no whitespace errors; changed files are limited to this plan's docs, TypeScript/React services/components, package manifests, changelog, server lightweight validator, tests, and fixture. No file under `server/migrations/`, no SQL file, and no database schema file appears.

- [ ] **Step 10: Commit browser verification or verified fixes**

```bash
git add tests/e2e/text_overflow.spec.js
git commit -m "test: verify text overflow end to end"
```

Do not amend earlier commits and do not stage Playwright reports, screenshots, downloaded PDFs, `test-results/`, `dist/`, scratch files, or unrelated worktree changes.
