# Static Text Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted four-sided padding to fixed-size text with linked property controls and identical Canvas, inline-editor, and PDF content geometry.

**Architecture:** Schema v11 stores a nested `textPadding` object. A focused `services/textPadding.ts` module owns normalization and content-box geometry; Canvas, PDF, overlay editing, migration, presets, and generators consume that boundary while the existing text-layout engine stays padding-agnostic.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 4/jsdom, Testing Library, jsPDF 3, Playwright 1.57.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-07-18-static-text-padding-design.md` at commit `cfb393b`.
- Before Task 1, invoke `superpowers:using-git-worktrees`; create `.worktrees/static-text-padding` on branch `feature/static-text-padding` from the plan-doc commit.
- Current schema advances exactly from 10 to 11. Preserve sequential migration and future-schema pass-through.
- Canonical padding is `{ top: number, right: number, bottom: number, left: number }`; every side must be finite and `>= 0`. Decimals are never rounded and there is no maximum.
- v10 → v11 overwrites any experimental pre-v11 text padding with four zeros. Current-v11 normalization preserves valid sides and replaces invalid sides independently with `0`.
- Only `type === 'text' && !autoWidth` renders padding. Auto-width text stores but ignores it. Grids, grid cells, shape captions, SVG, and other elements stay unchanged.
- Padding changes text content origin/dimensions only. Never change element `x/y/w/h`, background, border, transform origin, rotation, opacity, selection bounds, resize handles, or link bounds.
- Oversized padding remains stored. `width` or `height` exhaustion clamps that content axis to zero and draws no view-mode text.
- Inline editing uses padded origin but always exposes full source without clip, ellipsis, or shrink; zero content area retains a minimal editing-only target.
- Linked state is UI-only, starts enabled for each selected-ID set, and never enters schema, persistence, or history.
- Each accepted multi-edit invokes `onUpdateElements` once with `saveHistory=true`.
- No SQL/database migration, package, dependency, or unrelated refactor.
- Do not touch existing untracked `.superpowers/brainstorm/` or `scratch/` files.
- Existing TypeScript baseline is exactly five unrelated diagnostics; introduce none.
- WebKit is optional locally because its executable is unavailable.

## File Structure

- Create `services/textPadding.ts`: canonical values, side normalization, project/template normalization, and shared content-box geometry.
- Create `components/properties/TextPaddingControls.tsx`: linked UI state, four decimal drafts, accessible inputs, and accepted-value callbacks.
- Create `tests/unit/textPadding.test.ts`: pure service contract.
- Create `tests/unit/OverlayTextEditorPadding.test.tsx`: padded editing geometry and full-source behavior.
- Create `tests/unit/PropertiesPanelTextPadding.test.tsx`: property-panel aggregation, linked/unlinked multi-edit, disabled states, and history fanout.
- Modify `types.ts`: `TextPadding` and optional `TemplateElement.textPadding`.
- Modify `services/migration.ts`: schema v11 migration and final padding normalization.
- Modify `services/generatorTemplates.ts`, `services/presets.ts`, `services/validateGeneratedProject.ts`, `components/Canvas.tsx`, and `server/validateAppState.js`: canonical creation/persistence boundaries.
- Modify `components/canvas/CanvasElement.tsx`, `components/canvas/OverlayTextEditor.tsx`, and `services/pdfService.ts`: shared content-box consumers.
- Modify `components/PropertiesPanel.tsx` and `components/properties/SingleElementEditor.tsx`: per-side selection aggregation and Typography integration.
- Modify focused migration, preset, generator, server, Canvas, PDF, parity, and E2E tests listed below.

---

### Task 1: Padding Domain and Shared Geometry

**Files:**
- Create: `services/textPadding.ts`
- Create: `tests/unit/textPadding.test.ts`
- Modify: `types.ts:65-109`

**Interfaces:**
- Produces: `TextPadding`, `TextPaddingSide`, `TextContentBox`.
- Produces: `ZERO_TEXT_PADDING`, `TEXT_PADDING_SIDES`.
- Produces: `normalizeTextPaddingValue(value)`, `resolveTextPadding(element)`, `resolveTextContentBox(element)`.
- Produces: `normalizeTextPaddingElement(element)`, `normalizeTextPaddingTemplate(template)`, `normalizeTextPaddingTemplates(templates)`, `normalizeProjectTextPadding(state)`.

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/textPadding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizeProjectTextPadding,
  normalizeTextPaddingElement,
  normalizeTextPaddingValue,
  resolveTextContentBox,
  resolveTextPadding,
} from '../../services/textPadding';

const zero = { top: 0, right: 0, bottom: 0, left: 0 };

describe('text padding normalization', () => {
  it('preserves finite nonnegative decimals and repairs each invalid side independently', () => {
    expect(normalizeTextPaddingValue({ top: 1.25, right: -2, bottom: Infinity, left: '3' }))
      .toEqual({ top: 1.25, right: 0, bottom: 0, left: 0 });
    expect(normalizeTextPaddingValue(null)).toEqual(zero);
    expect(normalizeTextPaddingValue({})).toEqual(zero);
  });

  it('returns fresh values and never mutates source objects', () => {
    const source = { top: 1, right: 2, bottom: 3, left: 4 };
    const normalized = normalizeTextPaddingValue(source);
    expect(normalized).toEqual(source);
    expect(normalized).not.toBe(source);
    expect(source).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
  });

  it('normalizes text elements only', () => {
    const text = { id: 'text', type: 'text', textPadding: { top: 2, right: -1 } };
    const rect = { id: 'rect', type: 'rect', textPadding: { top: -1 } };
    expect(normalizeTextPaddingElement(text)).toEqual({
      ...text,
      textPadding: { top: 2, right: 0, bottom: 0, left: 0 },
    });
    expect(normalizeTextPaddingElement(rect)).toBe(rect);
  });

  it('normalizes variants and legacy flat templates without mutating input', () => {
    const state = {
      variants: { v: { templates: { page: { elements: [{ type: 'text' }] } } } },
      templates: { legacy: { elements: [{ type: 'text', textPadding: { left: 2.5 } }] } },
    };
    const before = structuredClone(state);
    const output: any = normalizeProjectTextPadding(state);
    expect(output.variants.v.templates.page.elements[0].textPadding).toEqual(zero);
    expect(output.templates.legacy.elements[0].textPadding).toEqual({ ...zero, left: 2.5 });
    expect(state).toEqual(before);
    expect(output).not.toBe(state);
  });
});

describe('text content box', () => {
  it('uses asymmetric decimal padding without changing outer dimensions', () => {
    const element = { w: 100.5, h: 40.5, textPadding: { top: 1.5, right: 2.5, bottom: 3.5, left: 4.5 } };
    expect(resolveTextPadding(element)).toEqual(element.textPadding);
    expect(resolveTextContentBox(element)).toEqual({
      padding: element.textPadding,
      x: 4.5,
      y: 1.5,
      width: 93.5,
      height: 35.5,
    });
    expect(element).toMatchObject({ w: 100.5, h: 40.5 });
  });

  it('clamps exhausted axes to zero while retaining padded origin', () => {
    expect(resolveTextContentBox({
      w: 20,
      h: 10,
      textPadding: { top: 12, right: 8, bottom: 4, left: 30 },
    })).toEqual({
      padding: { top: 12, right: 8, bottom: 4, left: 30 },
      x: 30,
      y: 12,
      width: 0,
      height: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run tests/unit/textPadding.test.ts
```

Expected: FAIL because `services/textPadding.ts` and padding types do not exist.

- [ ] **Step 3: Add schema types**

Add before `TemplateElement` in `types.ts`, then add `textPadding?: TextPadding` beside the existing text overflow fields:

```ts
export interface TextPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TemplateElement {
  // existing fields
  textOverflow?: TextOverflow;
  textWrap?: boolean;
  textPadding?: TextPadding;
  // existing fields
}
```

- [ ] **Step 4: Implement focused normalization and geometry service**

Create `services/textPadding.ts`:

```ts
import type { PageTemplate, TemplateElement, TextPadding } from '../types';

export const TEXT_PADDING_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type TextPaddingSide = typeof TEXT_PADDING_SIDES[number];

export const ZERO_TEXT_PADDING: Readonly<TextPadding> = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export interface TextContentBox {
  padding: TextPadding;
  x: number;
  y: number;
  width: number;
  height: number;
}

const normalizeSide = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
);

export function normalizeTextPaddingValue(value: unknown): TextPadding {
  const candidate = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    top: normalizeSide(candidate.top),
    right: normalizeSide(candidate.right),
    bottom: normalizeSide(candidate.bottom),
    left: normalizeSide(candidate.left),
  };
}

export function resolveTextPadding(
  element: Pick<TemplateElement, 'textPadding'>,
): TextPadding {
  return normalizeTextPaddingValue(element.textPadding);
}

export function resolveTextContentBox(
  element: Pick<TemplateElement, 'w' | 'h' | 'textPadding'>,
): TextContentBox {
  const padding = resolveTextPadding(element);
  return {
    padding,
    x: padding.left,
    y: padding.top,
    width: Math.max(0, element.w - padding.left - padding.right),
    height: Math.max(0, element.h - padding.top - padding.bottom),
  };
}

export function normalizeTextPaddingElement<T extends Record<string, any>>(element: T): T {
  if (element.type !== 'text') return element;
  return { ...element, textPadding: normalizeTextPaddingValue(element.textPadding) };
}

export function normalizeTextPaddingTemplate<T extends PageTemplate>(template: T): T {
  return {
    ...template,
    elements: template.elements.map(element => normalizeTextPaddingElement(element)),
  };
}

export function normalizeTextPaddingTemplates<T extends Record<string, PageTemplate>>(templates: T): T {
  return Object.fromEntries(
    Object.entries(templates).map(([id, template]) => [id, normalizeTextPaddingTemplate(template)]),
  ) as T;
}

export function normalizeProjectTextPadding<T extends Record<string, any>>(state: T): T {
  const normalized: Record<string, any> = structuredClone(state);
  if (normalized.variants && typeof normalized.variants === 'object') {
    Object.values(normalized.variants).forEach((variant: any) => {
      if (variant?.templates && typeof variant.templates === 'object') {
        variant.templates = normalizeTextPaddingTemplates(variant.templates);
      }
    });
  }
  if (normalized.templates && typeof normalized.templates === 'object') {
    normalized.templates = normalizeTextPaddingTemplates(normalized.templates);
  }
  return normalized as T;
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npx vitest run tests/unit/textPadding.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit domain boundary**

```bash
git add types.ts services/textPadding.ts tests/unit/textPadding.test.ts
git commit -m "feat: add text padding geometry"
```

---

### Task 2: Schema v11 Migration and Load Normalization

**Files:**
- Modify: `services/migration.ts:14-21,84-155,341-373`
- Modify: `tests/unit/migration.test.ts:44-200`

**Interfaces:**
- Consumes: `ZERO_TEXT_PADDING`, `normalizeProjectTextPadding` from Task 1.
- Produces: `CURRENT_SCHEMA_VERSION = 11` and sequential v10 → v11 migration.

- [ ] **Step 1: Add failing migration coverage**

In `tests/unit/migration.test.ts`, change assertions that mean “current schema” from `10` to `11`; retain inputs deliberately declared as v9 or v10. Change the future-version fixture at the existing future pass-through test from `11` to `12`.

The existing current-v10 malformed-overflow test continues through the new migration, so update its exact text-element expectation to include:

```ts
textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
```

Add:

```ts
describe('migrateV10ToV11', () => {
  const zeroPadding = { top: 0, right: 0, bottom: 0, left: 0 };

  it('adds zero padding across variants and flat templates and overwrites experimental v10 data', () => {
    const input: any = {
      schemaVersion: 10,
      variants: { default: { templates: { page: { elements: [
        { id: 'fixed', type: 'text', autoWidth: false, textPadding: { top: 9, right: 8, bottom: 7, left: 6 } },
        { id: 'auto', type: 'text', autoWidth: true },
        { id: 'grid', type: 'grid', textPadding: { top: 4 } },
      ] } } } },
      templates: { legacy: { elements: [
        { id: 'legacy-text', type: 'text', textPadding: 'experimental' },
      ] } },
    };
    const before = structuredClone(input);

    const output: any = migrateState(input);

    expect(output.schemaVersion).toBe(11);
    expect(output.variants.default.templates.page.elements[0].textPadding).toEqual(zeroPadding);
    expect(output.variants.default.templates.page.elements[1].textPadding).toEqual(zeroPadding);
    expect(output.variants.default.templates.page.elements[2].textPadding).toEqual({ top: 4 });
    expect(output.templates.legacy.elements[0].textPadding).toEqual(zeroPadding);
    expect(input).toEqual(before);
    expect(needsMigration(input)).toBe(true);
    expect(needsMigration(output)).toBe(false);
  });

  it('normalizes current-v11 sides while preserving valid decimals', () => {
    const input: any = {
      schemaVersion: 11,
      variants: { default: { templates: { page: { elements: [
        { type: 'text', textPadding: { top: 1.25, right: -1, bottom: '2', left: 3.75 } },
      ] } } } },
    };
    const output: any = migrateState(input);
    expect(output.variants.default.templates.page.elements[0].textPadding).toEqual({
      top: 1.25, right: 0, bottom: 0, left: 3.75,
    });
    expect(input.variants.default.templates.page.elements[0].textPadding.right).toBe(-1);
  });

  it('returns schema-v12 state untouched by reference', () => {
    const future: any = { schemaVersion: 12, variants: {} };
    expect(migrateState(future)).toBe(future);
  });
});
```

- [ ] **Step 2: Run migration tests and verify RED**

Run:

```bash
npx vitest run tests/unit/migration.test.ts
```

Expected: FAIL because current schema is 10 and no v10 → v11 migration exists.

- [ ] **Step 3: Implement sequential migration**

Update imports/version/final normalization in `services/migration.ts`:

```ts
import { normalizeProjectTextPadding, ZERO_TEXT_PADDING } from './textPadding';

export const CURRENT_SCHEMA_VERSION = 11;

// after the v9 → v10 branch
if (version < 11) {
  migratedState = migrateV10ToV11(migratedState);
  version = 11;
}

return normalizeProjectTextPadding(
  normalizeTextOverflow(migratedState as Record<string, any>),
) as AppState;
```

Add after `migrateV9ToV10`:

```ts
function migrateV10ToV11(state: any): any {
  console.log('[Migration] Applying v10 → v11: Adding text padding');
  const migrated = JSON.parse(JSON.stringify(state));

  const migrateTemplates = (templates: any) => {
    if (!templates || typeof templates !== 'object') return;
    Object.values(templates).forEach((template: any) => {
      if (!Array.isArray(template?.elements)) return;
      template.elements.forEach((element: any) => {
        if (element.type === 'text') {
          element.textPadding = { ...ZERO_TEXT_PADDING };
        }
      });
    });
  };

  if (migrated.variants && typeof migrated.variants === 'object') {
    Object.values(migrated.variants).forEach((variant: any) => migrateTemplates(variant?.templates));
  }
  migrateTemplates(migrated.templates);
  migrated.schemaVersion = 11;
  return migrated;
}
```

Do not export the migration helper. Preserve the existing early return for `version > CURRENT_SCHEMA_VERSION` before normalization.

- [ ] **Step 4: Run migration and normalization regression tests**

Run:

```bash
npx vitest run tests/unit/migration.test.ts tests/unit/textPadding.test.ts tests/unit/textOverflowSettings.test.ts tests/unit/loadProjectState.test.ts
```

Expected: all tests PASS; old v9 overflow appearance assertions still pass after continuing through v11.

- [ ] **Step 5: Commit schema migration**

```bash
git add services/migration.ts tests/unit/migration.test.ts
git commit -m "feat: migrate text padding to schema v11"
```

---

### Task 3: Canonical Creation, Generator, Preset, and Server Boundaries

**Files:**
- Modify: `components/Canvas.tsx:1326-1359,1402-1430`
- Modify: `services/generatorTemplates.ts:1-24`
- Modify: `services/presets.ts:1-9,124-138`
- Modify: `services/validateGeneratedProject.ts:17-23`
- Modify: `server/validateAppState.js:13-18,66-79`
- Modify: `tests/unit/canvasElementCreationTextOverflow.test.tsx`
- Modify: `tests/unit/presets.test.ts`
- Modify: `tests/unit/validateGeneratedProject.test.ts`
- Modify: `tests/unit/generatedProjectState.test.ts`
- Modify: `tests/unit/projectDocumentSnapshot.test.ts:5-74`
- Modify: `tests/unit/server/validateAppState.test.js`
- Modify: `tests/unit/loadProjectState.test.ts`
- Modify: `tests/unit/textOverflowPersistence.test.ts`
- Modify: `tests/unit/EditorPageGeneratedProject.test.tsx`
- Modify: `tests/unit/ProjectEditor.generatorHistory.test.tsx`
- Modify: `tests/unit/GeneratorVisualPreviewModal.test.tsx`
- Modify: `tests/unit/generatorVisualPreview.test.ts`
- Modify: `tests/unit/EditorPageGeneratorMetadata.test.tsx`
- Modify: `tests/unit/HistoryModal.test.tsx`
- Modify: `tests/unit/MergeRequestPage.test.tsx`
- Modify: `tests/unit/JsonModalGeneratorMetadata.test.tsx`

**Interfaces:**
- Consumes: `ZERO_TEXT_PADDING`, `normalizeTextPaddingTemplate`.
- Produces: explicit zero padding for new text and normalized generated/preset text.
- Produces: lightweight v11 API validation for supplied text padding.

- [ ] **Step 1: Add failing boundary assertions**

Extend `tests/unit/canvasElementCreationTextOverflow.test.tsx`:

```ts
expect(clickText).toMatchObject({
  type: 'text', autoWidth: true, textOverflow: 'clip', textWrap: true,
  textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
});
expect(dragText).toMatchObject({
  type: 'text', textOverflow: 'clip', textWrap: true,
  textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
});
expect(dragGrid).not.toHaveProperty('textPadding');
expect(dragRect).not.toHaveProperty('textPadding');
```

In `tests/unit/presets.test.ts`, rename the suite to `schema v11 presets`, change current-schema assertions to `11`, and extend every text assertion with:

```ts
textPadding: { top: 0, right: 0, bottom: 0, left: 0 }
```

In `tests/unit/validateGeneratedProject.test.ts`, change current-schema assertions to `11` and assert generated text has canonical padding. Add a valid decimal padding to `valid-text` and malformed sides to `missing-text`:

```ts
const overflowElements = () => [
  { id: 'missing-text', type: 'text', textPadding: { top: -1, left: '2' }, layerId: 'content' },
  {
    id: 'valid-text', type: 'text', textOverflow: 'ellipsis', textWrap: false,
    textPadding: { top: 1.25, right: 2.5, bottom: 3.75, left: 4 }, layerId: 'content',
  },
  { id: 'malformed-grid', type: 'grid', textOverflow: 'truncate', textWrap: 'true', layerId: 'content' },
  { id: 'rect', type: 'rect', textOverflow: 'future', textWrap: 1, layerId: 'content' },
];
```

Expected generated assertions:

```ts
expect(page.elements[0]).toMatchObject({
  id: 'missing-text',
  textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
});
expect(page.elements[1]).toMatchObject({
  id: 'valid-text',
  textPadding: { top: 1.25, right: 2.5, bottom: 3.75, left: 4 },
});
expect(page.elements[2]).not.toHaveProperty('textPadding');
expect(page.elements[3]).not.toHaveProperty('textPadding');
```

Change `schemaVersion: 10 as const` and expected current version in `tests/unit/generatedProjectState.test.ts` to `11 as const` and `11`.

In `tests/unit/projectDocumentSnapshot.test.ts`, change `makeState()` to schema 11, add asymmetric padding to `fixed-text`, mutate one padding side after snapshot, and include the original nested object in the snapshot assertion:

```ts
textPadding: { top: 1, right: 2, bottom: 3, left: 4 },
```

```ts
state.variants.original.templates.page.elements[0].textPadding!.left = 99;
```

```ts
expect(snapshot.variants.original.templates.page.elements[0]).toMatchObject({
  autoWidth: false,
  textOverflow: 'shrink',
  textWrap: false,
  textPadding: { top: 1, right: 2, bottom: 3, left: 4 },
});
```

Use schema 12 for the deliberately different `current` state in the restore test; the restored snapshot must return schema 11.

Add to `tests/unit/server/validateAppState.test.js`:

```js
it('accepts canonical or missing v11 text padding', () => {
  const state = goodState();
  state.schemaVersion = 11;
  state.variants.default.templates.page.elements = [
    { id: 'canonical', type: 'text', textPadding: { top: 0, right: 1.25, bottom: 2, left: 3 } },
    { id: 'missing', type: 'text' },
  ];
  expect(validateAppState(state)).toEqual({ ok: true });
});

it.each([
  ['non-object', null],
  ['array', [0, 0, 0, 0]],
  ['missing side', { top: 0, right: 0, bottom: 0 }],
  ['negative side', { top: -1, right: 0, bottom: 0, left: 0 }],
  ['string side', { top: '1', right: 0, bottom: 0, left: 0 }],
])('rejects v11 text padding with %s', (_label, textPadding) => {
  const state = goodState();
  state.schemaVersion = 11;
  state.variants.default.templates.page.elements = [{ id: 'text', type: 'text', textPadding }];
  expect(validateAppState(state)).toMatchObject({
    ok: false,
    error: expect.stringContaining('textPadding'),
  });
});

it('ignores padding on v10 text and v11 non-text elements', () => {
  const old = goodState();
  old.schemaVersion = 10;
  old.variants.default.templates.page.elements = [{ id: 'old', type: 'text', textPadding: -1 }];
  expect(validateAppState(old)).toEqual({ ok: true });

  const unrelated = goodState();
  unrelated.schemaVersion = 11;
  unrelated.variants.default.templates.page.elements = [{ id: 'rect', type: 'rect', textPadding: -1 }];
  expect(validateAppState(unrelated)).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/presets.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/projectDocumentSnapshot.test.ts tests/unit/server/validateAppState.test.js
```

Expected: FAIL on absent defaults, schema literals, and server validation.

- [ ] **Step 3: Stamp direct text creation defaults**

Import `ZERO_TEXT_PADDING` in `components/Canvas.tsx`. Add this field to both click-created text and the text branch of drag creation:

```ts
textPadding: { ...ZERO_TEXT_PADDING },
```

For drag creation, keep it text-only:

```ts
...(tool === 'text' ? { textPadding: { ...ZERO_TEXT_PADDING } } : {}),
```

Do not add padding to grids or shapes.

- [ ] **Step 4: Normalize generator and preset templates**

In `services/generatorTemplates.ts`, import `normalizeTextPaddingTemplate` and compose it outside the existing overflow normalizer:

```ts
normalized[tpl.id] = normalizeTextPaddingTemplate(
  normalizeTextOverflowTemplate(ensureTemplateLayers(autoIdElements(tpl))),
);
```

In `services/presets.ts`, import `normalizeTextPaddingTemplate` and use:

```ts
variant.templates[templateId] = normalizeTextPaddingTemplate(
  normalizeTextOverflowTemplate(ensureTemplateLayers(template)),
);
```

In `services/validateGeneratedProject.ts`, replace the brittle literal type:

```ts
export interface GeneratedProject {
  nodes: Record<string, AppNode>;
  rootId: string;
  variants: Record<string, Variant>;
  activeVariantId: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
}
```

- [ ] **Step 5: Add lightweight server validation**

In `server/validateAppState.js`, add:

```js
const TEXT_PADDING_SIDES = ['top', 'right', 'bottom', 'left'];
```

Inside the existing element loop, after overflow validation:

```js
if (Number.isInteger(state.schemaVersion) && state.schemaVersion >= 11
    && el && typeof el === 'object' && el.type === 'text' && el.textPadding !== undefined) {
  if (!isObj(el.textPadding)
      || TEXT_PADDING_SIDES.some(side => !isNum(el.textPadding[side]) || el.textPadding[side] < 0)) {
    return fail(`template ${vid}/${tid} has an element with invalid textPadding`);
  }
}
```

Keep the existing schema-v10 overflow gate unchanged.

- [ ] **Step 6: Update current-schema integration consumers**

Before running, update current-schema consumers deliberately; do not bulk-replace every schema-v10 fixture.

Apply these exact rules:

```text
tests/unit/loadProjectState.test.ts
  Keep v8/v10 inputs. Expect every loaded output at schema 11.
  Rename “current-v10” to “v10” where migration is intentional.
  Expect normalized text to include four-zero textPadding.

tests/unit/textOverflowPersistence.test.ts
  Keep raw text-overflow fixture assertion at schema 10.
  Expect loaded/generated/preset/custom output at schema 11.
  Expect every normalized text element to carry canonical textPadding.

tests/unit/EditorPageGeneratedProject.test.tsx
tests/unit/ProjectEditor.generatorHistory.test.tsx
tests/unit/GeneratorVisualPreviewModal.test.tsx
tests/unit/generatorVisualPreview.test.ts
  Change GeneratedProject/GeneratorPreviewPayload schema literals and resulting current-state expectations from 10 to 11.

tests/unit/EditorPageGeneratorMetadata.test.tsx
  Change the in-memory current fixture and “current-v10” test name to v11.
  Expect imported current/legacy output at schema 11 and text elements with normalized textPadding.

tests/unit/HistoryModal.test.tsx
  Keep committed malformed state at schema 10 to exercise migration.
  Expect restored state at schema 11 and its text elements with four-zero textPadding.
  Keep clone-mode raw-state expectations at schema 10 because clone staging intentionally does not normalize.

tests/unit/MergeRequestPage.test.tsx
  Keep source/target inputs at schema 10.
  Expect both thumbnail inputs at schema 11 and text elements with four-zero textPadding.

tests/unit/JsonModalGeneratorMetadata.test.tsx
  Keep Apply input at schema 10.
  Expect saved state at schema 11 and text elements with four-zero textPadding.
```

Use this exact nested assertion wherever the test already checks a normalized text element:

```ts
textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
```

Leave schema 10 unchanged in PDF-only fixtures, the raw `text-overflow-parity-v10.json` fixture, state-codec round-trip tests, and tests intentionally exercising v10 input migration.

- [ ] **Step 7: Run boundary tests and verify GREEN**

Run:

```bash
npx vitest run tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/presets.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/projectDocumentSnapshot.test.ts tests/unit/server/validateAppState.test.js tests/unit/migration.test.ts tests/unit/loadProjectState.test.ts tests/unit/textOverflowPersistence.test.ts tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/generatorVisualPreview.test.ts tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/MergeRequestPage.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 8: Commit canonical boundaries**

```bash
git add components/Canvas.tsx services/generatorTemplates.ts services/presets.ts services/validateGeneratedProject.ts server/validateAppState.js tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/presets.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/projectDocumentSnapshot.test.ts tests/unit/server/validateAppState.test.js tests/unit/loadProjectState.test.ts tests/unit/textOverflowPersistence.test.ts tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/generatorVisualPreview.test.ts tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/MergeRequestPage.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx
git commit -m "feat: normalize text padding boundaries"
```

---

### Task 4: Canvas and PDF Padded Rendering

**Files:**
- Modify: `components/canvas/CanvasElement.tsx:97-116,562-595`
- Modify: `services/pdfService.ts:1793-1840`
- Modify: `tests/unit/canvasFixedTextLayout.test.tsx:204-348`
- Modify: `tests/unit/pdfFixedTextOverflow.test.ts:125-219,453-510`
- Modify: `tests/unit/pdfLinks.test.ts:137-158`
- Modify: `tests/helpers/textOverflowParityFixture.ts:14-31`
- Modify: `tests/unit/textLayoutParity.test.ts:61-123`

**Interfaces:**
- Consumes: `resolveTextContentBox` from Task 1.
- Preserves: existing `TextLayoutRequest`; padding remains outside `services/textLayout.ts`.

- [ ] **Step 1: Add failing Canvas geometry assertions**

In the parameterized fixed-text test in `tests/unit/canvasFixedTextLayout.test.tsx`, create the element with asymmetric padding:

```ts
const element = fixedElement({
  textOverflow,
  textWrap,
  textPadding: { top: 2, right: 5, bottom: 4, left: 3 },
});
```

Change expected request geometry and container styles to:

```ts
contentWidth: 115,
contentHeight: 39,
```

```ts
expect(textContainer).toHaveStyle({
  position: 'absolute',
  left: '3px',
  top: '2px',
  width: '115px',
  height: '39px',
  overflow: textOverflow === 'visible' ? 'visible' : 'hidden',
  padding: '0px',
});
```

Add:

```ts
it('skips view-mode lines when padding exhausts either content axis', () => {
  const fake = createFakeLayoutSession(request => (
    request.contentWidth <= 0 || request.contentHeight <= 0 ? null : fixedLayout(true)
  ));
  const { container } = render(
    <CanvasElement
      element={fixedElement({ textPadding: { top: 50, right: 0, bottom: 0, left: 0 } })}
      textLayoutSession={fake.session}
      {...canvasElementProps}
    />,
  );
  expect(fake.layout).toHaveBeenCalledWith(expect.objectContaining({ contentWidth: 123, contentHeight: 0 }), expect.any(String));
  expect(container.querySelectorAll('[data-text-layout-line]')).toHaveLength(0);
});
```

- [ ] **Step 2: Add failing PDF geometry assertions**

Add to `tests/unit/pdfFixedTextOverflow.test.ts`:

```ts
it('clips to the padded box and skips exhausted padded content', async () => {
  const rectCalls: any[][] = [];
  pdfDocHook.onCreate = doc => {
    const originalRect = doc.rect;
    doc.rect = function (this: any, ...args: any[]) {
      rectCalls.push(args);
      return originalRect.apply(this, args);
    };
  };
  try {
    const pdf = await exportPdf([
      baseElement('PADDED_CLIP', {
        text: 'PADDED_CLIP',
        textOverflow: 'clip',
        textWrap: false,
        textPadding: { top: 2, right: 5, bottom: 4, left: 3 },
      }),
      baseElement('EXHAUSTED', {
        y: 100,
        text: 'EXHAUSTED',
        textOverflow: 'clip',
        textPadding: { top: 50, right: 0, bottom: 0, left: 0 },
      }),
    ]);
    expect(pdf).toContain('PADDED_CLIP');
    expect(pdf).not.toContain('EXHAUSTED');
    expect(rectCalls).toContainEqual([23, 22, 92, 34, null]);
  } finally {
    pdfDocHook.onCreate = null;
  }
});
```

Also add `{ top: 1, right: 2, bottom: 3, left: 4 }` padding to every fixed element created by the existing all-mode/wrap test, to the rotated clip element, and to the visible-unclipped element. Existing assertions must continue to pass, proving every PDF overflow policy accepts padded geometry while visible mode remains unclipped.

In `tests/unit/pdfLinks.test.ts`, change the existing zero-glyph URL/internal test inputs from tiny outer width to exhausted padded content:

```ts
{
  ...baseEl('zero-glyph-url', 0), type: 'text', text: 'URL_LINK_SOURCE',
  w: 100, fontSize: 12, fontFamily: '__builtin_fallback__',
  textOverflow: 'ellipsis', textWrap: false,
  textPadding: { top: 0, right: 60, bottom: 0, left: 60 },
  linkTarget: 'url', linkValue: 'https://example.com/ZEROGLYPH',
},
{
  ...baseEl('zero-glyph-internal', 1), type: 'text', text: 'INTERNAL_LINK_SOURCE',
  w: 100, fontSize: 12, fontFamily: '__builtin_fallback__',
  textOverflow: 'ellipsis', textWrap: false,
  textPadding: { top: 0, right: 60, bottom: 0, left: 60 },
  linkTarget: 'specific_node', linkValue: 'second',
},
```

Keep expectations for zero glyphs and both full-element links unchanged.

- [ ] **Step 3: Update parity request construction**

In `tests/helpers/textOverflowParityFixture.ts`, import `resolveTextContentBox` and replace `requestFor` geometry:

```ts
const contentBox = grid
  ? { width: Math.max(0, item.w - 2), height: item.h }
  : resolveTextContentBox(item);

return {
  text,
  contentWidth: contentBox.width,
  contentHeight: contentBox.height,
  fontSize: item.fontSize ?? 12,
  fontFamily: item.fontFamily ?? 'helvetica',
  fontWeight: item.fontWeight ?? 'normal',
  fontStyle: item.fontStyle ?? 'normal',
  textOverflow: item.textOverflow as TextOverflow,
  textWrap,
  align: item.align ?? 'left',
  verticalAlign: item.verticalAlign ?? 'top',
};
```

Convert the arrow expression to a block body. In `tests/unit/textLayoutParity.test.ts`, add:

```ts
const paddedFixture = (): AppState => {
  const state = structuredClone(fixture);
  state.variants.parity.templates['parity-page'].elements.forEach(item => {
    if (item.type === 'text' && !item.autoWidth) {
      item.textPadding = { top: 1, right: 2, bottom: 3, left: 4 };
    }
  });
  return state;
};
```

Replace each `textOverflowFixtureRequests(fixture)` call with:

```ts
const activeFixture = paddedFixture();
const requests = textOverflowFixtureRequests(activeFixture);
```

In the coverage test, prove fixed and grid geometry diverge only by their intended insets:

```ts
const activeElements = activeFixture.variants.parity.templates['parity-page'].elements;
for (const item of activeElements.filter(item => item.type === 'text' && !item.autoWidth)) {
  const request = requests.find(candidate => candidate.context === item.id)!.request;
  expect(request.contentWidth).toBe(item.w - 6);
  expect(request.contentHeight).toBe(item.h - 4);
}
for (const item of activeElements.filter(item => item.type === 'grid')) {
  const gridRequests = requests.filter(candidate => candidate.context.startsWith(`${item.id}:`));
  expect(gridRequests.length).toBeGreaterThan(0);
  gridRequests.forEach(({ request }) => {
    expect(request.contentWidth).toBe(item.w - 2);
    expect(request.contentHeight).toBe(item.h);
  });
}
```

- [ ] **Step 4: Run rendering tests and verify RED**

Run:

```bash
npx vitest run tests/unit/canvasFixedTextLayout.test.tsx tests/unit/pdfFixedTextOverflow.test.ts tests/unit/textLayoutParity.test.ts
```

Expected: Canvas and PDF still use full element bounds; tests FAIL.

- [ ] **Step 5: Apply shared content box in Canvas**

Import `resolveTextContentBox` in `components/canvas/CanvasElement.tsx`. Resolve it only for fixed text:

```ts
const fixedTextContentBox = element.type === 'text' && !element.autoWidth
  ? resolveTextContentBox(element)
  : null;
const fixedTextSettings = fixedTextContentBox
  ? resolveTextOverflowSettings(element)
  : null;
```

Change the layout request:

```ts
contentWidth: fixedTextContentBox!.width,
contentHeight: fixedTextContentBox!.height,
```

Change the fixed text container:

```ts
top: fixedTextContentBox!.y,
left: fixedTextContentBox!.x,
width: fixedTextContentBox!.width,
height: fixedTextContentBox!.height,
```

Keep line `left/top` relative to that container and keep the outer element transform unchanged.

- [ ] **Step 6: Apply shared content box in PDF**

Import `resolveTextContentBox` in `services/pdfService.ts`. In the fixed shared-layout branch:

```ts
const contentBox = resolveTextContentBox(el);
const layout = pdfTextSession.layout({
  text: textContent,
  contentWidth: contentBox.width,
  contentHeight: contentBox.height,
  fontSize,
  fontFamily: el.fontFamily || 'helvetica',
  fontWeight: el.fontWeight || 'normal',
  fontStyle: el.fontStyle || 'normal',
  textOverflow: settings.textOverflow,
  textWrap: settings.textWrap,
  align: el.align || 'center',
  verticalAlign: el.verticalAlign || 'middle',
}, metricIdentity, selectFont, context);
```

Draw using:

```ts
pdfTextSession.draw(
  layout,
  {
    x: lx + contentBox.x,
    y: ly + contentBox.y,
    width: contentBox.width,
    height: contentBox.height,
    yOffset,
  },
  { selectFont, textDecoration: el.textDecoration, decorationColor, context },
);
```

Do not alter link annotations or grid PDF code.

- [ ] **Step 7: Run rendering, grid-isolation, and parity tests**

Run:

```bash
npx vitest run tests/unit/canvasFixedTextLayout.test.tsx tests/unit/pdfFixedTextOverflow.test.ts tests/unit/textLayoutParity.test.ts tests/unit/canvasGridTextLayout.test.tsx tests/unit/pdfGridTextOverflow.test.ts tests/unit/pdfLinks.test.ts
```

Expected: all tests PASS; grid inset and full-element links remain unchanged.

- [ ] **Step 8: Commit renderer parity**

```bash
git add components/canvas/CanvasElement.tsx services/pdfService.ts tests/unit/canvasFixedTextLayout.test.tsx tests/unit/pdfFixedTextOverflow.test.ts tests/unit/pdfLinks.test.ts tests/helpers/textOverflowParityFixture.ts tests/unit/textLayoutParity.test.ts
git commit -m "feat: render padded fixed text"
```

---

### Task 5: Padded Full-Source Inline Editor

**Files:**
- Create: `tests/unit/OverlayTextEditorPadding.test.tsx`
- Modify: `components/canvas/OverlayTextEditor.tsx:185-245`
- Modify: `tests/unit/canvasFixedTextLayout.test.tsx:325-347`

**Interfaces:**
- Consumes: `resolveTextContentBox`.
- Produces: `data-testid="overlay-text-editor-box"` for the padded editing surface.
- Preserves: `data-testid="overlay-text-editor"` on the full-source contentEditable.

- [ ] **Step 1: Write failing overlay geometry tests**

Create `tests/unit/OverlayTextEditorPadding.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverlayTextEditor } from '../../components/canvas/OverlayTextEditor';
import type { TemplateElement } from '../../types';

const element = (overrides: Partial<TemplateElement> = {}): TemplateElement => ({
  id: 'text', type: 'text', x: 10, y: 20, w: 100, h: 40, rotation: 15,
  fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'FULL SOURCE TEXT',
  fontSize: 12, fontFamily: 'helvetica', align: 'left', verticalAlign: 'top',
  textOverflow: 'ellipsis', textWrap: false,
  textPadding: { top: 3, right: 4, bottom: 5, left: 6 },
  ...overrides,
});

const renderEditor = (value: TemplateElement) => render(
  <OverlayTextEditor element={value} onChange={vi.fn()} onFinish={vi.fn()} />,
);

describe('OverlayTextEditor padding', () => {
  it('keeps outer rotation geometry and starts full source inside the padded box', () => {
    renderEditor(element());
    const editor = screen.getByTestId('overlay-text-editor');
    const box = screen.getByTestId('overlay-text-editor-box');
    const outer = box.parentElement!;

    expect(outer).toHaveStyle({
      left: '10px', top: '20px', width: '100px', height: '40px', transform: 'rotate(15deg)',
    });
    expect(box).toHaveStyle({
      left: '6px', top: '3px', width: '90px', height: '32px', overflow: 'visible',
    });
    expect(editor).toHaveTextContent('FULL SOURCE TEXT');
    expect(editor).toHaveStyle({ whiteSpace: 'pre-wrap', maxWidth: '100%' });
  });

  it('provides a minimal editing-only target for exhausted content', () => {
    renderEditor(element({ textPadding: { top: 50, right: 40, bottom: 0, left: 70 } }));
    expect(screen.getByTestId('overlay-text-editor-box')).toHaveStyle({
      left: '70px', top: '50px', width: '1px', height: '1px', overflow: 'visible',
    });
    expect(screen.getByTestId('overlay-text-editor')).toHaveTextContent('FULL SOURCE TEXT');
  });

  it('ignores dormant padding for auto-width editing', () => {
    renderEditor(element({ autoWidth: true }));
    expect(screen.getByTestId('overlay-text-editor-box')).toHaveStyle({
      left: '0px', top: '0px', width: '100px', height: '40px',
    });
    expect(screen.getByTestId('overlay-text-editor')).toHaveStyle({
      whiteSpace: 'pre', maxWidth: 'none',
    });
  });
});
```

- [ ] **Step 2: Run overlay tests and verify RED**

Run:

```bash
npx vitest run tests/unit/OverlayTextEditorPadding.test.tsx
```

Expected: FAIL because padded editor box does not exist.

- [ ] **Step 3: Split outer transform geometry from inner edit geometry**

Import `resolveTextContentBox`. Before return:

```ts
const contentBox = element.autoWidth
  ? { x: 0, y: 0, width: element.w, height: element.h }
  : resolveTextContentBox(element);
const editorWidth = Math.max(1, contentBox.width);
const editorHeight = Math.max(1, contentBox.height);
```

Replace the return tree with an outer full-element transform container and an inner editing box:

```tsx
return (
  <div
    style={{
      position: 'absolute',
      left: element.x,
      top: element.y,
      width: element.w,
      height: element.h,
      transform: `rotate(${element.rotation || 0}deg)`,
      transformOrigin: element.transformOrigin
        ? `${element.transformOrigin.x * element.w}px ${element.transformOrigin.y * element.h}px`
        : 'center',
      zIndex: 1000,
      pointerEvents: 'none',
    }}
  >
    <div
      data-testid="overlay-text-editor-box"
      style={{
        position: 'absolute',
        left: contentBox.x,
        top: contentBox.y,
        width: editorWidth,
        height: editorHeight,
        display: 'flex',
        justifyContent: element.align === 'center' ? 'center' : element.align === 'right' ? 'flex-end' : 'flex-start',
        alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
        overflow: 'visible',
        fontFamily,
        fontSize: element.fontSize,
        lineHeight: 1.2,
        fontWeight: element.fontWeight,
        fontStyle: element.fontStyle,
        textDecoration: element.textDecoration,
        textDecorationColor: element.textColor,
        color: element.textColor,
        cursor: 'text',
        pointerEvents: 'auto',
        outline: '1px solid #3b82f6',
        padding: 0,
        caretColor: '#000000',
      }}
      onClick={() => editorRef.current?.focus()}
    >
      <div
        ref={editorRef}
        data-testid="overlay-text-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          outline: 'none',
          minWidth: '1px',
          whiteSpace: element.autoWidth ? 'pre' : 'pre-wrap',
          maxWidth: element.autoWidth ? 'none' : '100%',
          textAlign: element.align || 'left',
        }}
      >
        {initialText}
      </div>
    </div>
  </div>
);
```

The outer element keeps the original full-size center rotation. The inner box alone receives the padded offset and editing-only minimum.

- [ ] **Step 4: Extend Canvas editing regression**

In the existing committed-line/full-source test, add `textPadding: { top: 3, right: 4, bottom: 5, left: 6 }` and assert:

```ts
expect(screen.getByTestId('overlay-text-editor-box')).toHaveStyle({
  left: '6px', top: '3px', width: '110px', height: '32px',
});
expect(screen.getByTestId('overlay-text-editor')).toHaveTextContent('FULL SOURCE TEXT');
```

- [ ] **Step 5: Run overlay and Canvas tests**

Run:

```bash
npx vitest run tests/unit/OverlayTextEditorPadding.test.tsx tests/unit/canvasFixedTextLayout.test.tsx tests/unit/autoWidthText.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit editor geometry**

```bash
git add components/canvas/OverlayTextEditor.tsx tests/unit/OverlayTextEditorPadding.test.tsx tests/unit/canvasFixedTextLayout.test.tsx
git commit -m "feat: offset inline editor by padding"
```

---

### Task 6: Linked Typography Controls and Multi-Edit

**Files:**
- Create: `components/properties/TextPaddingControls.tsx`
- Create: `tests/unit/PropertiesPanelTextPadding.test.tsx`
- Modify: `components/PropertiesPanel.tsx:56-93,325-345`
- Modify: `components/properties/SingleElementEditor.tsx:1-13,83-93,259-289,1083-1279`
- Modify: `tests/unit/PropertiesPanelAutoWidth.test.tsx:43-55`
- Modify: `tests/unit/SingleElementEditorAutoWidth.test.tsx:40-60`
- Modify: `tests/unit/SingleElementEditorTextOverflow.test.tsx:33-48`

**Interfaces:**
- Produces: `TextPaddingSelection = Record<TextPaddingSide, number | 'mixed'>`.
- Produces: `TextPaddingControls({ values, disabled, selectionKey, onCommit })`.
- Consumes: functional `onUpdate(previous => Partial<TemplateElement>)` so unlinked multi-edit preserves each element’s other sides.

- [ ] **Step 1: Write failing property-panel integration tests**

Create `tests/unit/PropertiesPanelTextPadding.test.tsx` using the same minimal `AppState`/callback harness as `PropertiesPanelAutoWidth.test.tsx`. Include these tests with exact expectations:

```tsx
it('applies one linked decimal to all sides in one saved update', () => {
  const source = text('one', { autoWidth: false, textPadding: { top: 0, right: 0, bottom: 0, left: 0 } });
  const props = callbacks();
  render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);

  expect(screen.getByLabelText('Link padding sides')).toBeChecked();
  fireEvent.change(screen.getByLabelText('Padding top'), { target: { value: '7.5' } });

  expect(props.onUpdateElements).toHaveBeenCalledOnce();
  expect(props.onUpdateElements).toHaveBeenCalledWith([{
    ...source,
    textPadding: { top: 7.5, right: 7.5, bottom: 7.5, left: 7.5 },
  }], true);
});

it('applies a linked mixed multi-selection edit to every side in one saved update', () => {
  const first = text('first', { autoWidth: false, textPadding: { top: 1, right: 2, bottom: 3, left: 4 } });
  const second = text('second', { autoWidth: false, textPadding: { top: 5, right: 6, bottom: 7, left: 8 } });
  const props = callbacks();
  render(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);

  fireEvent.change(screen.getByLabelText('Padding left'), { target: { value: '9.25' } });

  const linked = { top: 9.25, right: 9.25, bottom: 9.25, left: 9.25 };
  expect(props.onUpdateElements).toHaveBeenCalledWith([
    { ...first, textPadding: linked },
    { ...second, textPadding: linked },
  ], true);
  expect(props.onUpdateElements).toHaveBeenCalledOnce();
});

it('shows per-side mixed values and preserves every unedited side when unlinked', () => {
  const first = text('first', { autoWidth: false, textPadding: { top: 1, right: 2, bottom: 3, left: 4 } });
  const second = text('second', { autoWidth: false, textPadding: { top: 1, right: 8, bottom: 9, left: 4 } });
  const props = callbacks();
  render(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);

  expect(screen.getByLabelText('Padding top')).toHaveValue(1);
  expect(screen.getByLabelText('Padding right')).toHaveValue(null);
  expect(screen.getByLabelText('Padding right')).toHaveAttribute('placeholder', 'Mixed');
  expect(screen.getByLabelText('Padding bottom')).toHaveValue(null);

  fireEvent.click(screen.getByLabelText('Link padding sides'));
  fireEvent.change(screen.getByLabelText('Padding right'), { target: { value: '6.5' } });

  expect(props.onUpdateElements).toHaveBeenCalledWith([
    { ...first, textPadding: { top: 1, right: 6.5, bottom: 3, left: 4 } },
    { ...second, textPadding: { top: 1, right: 6.5, bottom: 9, left: 4 } },
  ], true);
});

it('disables padding for all-auto and mixed fixed/auto text selections', () => {
  const fixed = text('fixed', { autoWidth: false });
  const auto = text('auto', { autoWidth: true });
  const props = callbacks();
  const view = render(<PropertiesPanel state={stateFor([auto], ['auto'])} {...props} />);
  expect(screen.getByLabelText('Padding top')).toBeDisabled();
  expect(screen.getByText('Padding applies only to fixed-size text.')).toBeVisible();

  view.rerender(<PropertiesPanel state={stateFor([fixed, auto], ['fixed', 'auto'])} {...props} />);
  expect(screen.getByLabelText('Padding top')).toBeDisabled();
});

it('ignores blank drafts and clamps accepted negative values to zero', () => {
  const source = text('one', { autoWidth: false, textPadding: { top: 2, right: 2, bottom: 2, left: 2 } });
  const props = callbacks();
  render(<PropertiesPanel state={stateFor([source], ['one'])} {...props} />);
  const top = screen.getByLabelText('Padding top');

  fireEvent.change(top, { target: { value: '' } });
  expect(props.onUpdateElements).not.toHaveBeenCalled();
  fireEvent.change(top, { target: { value: '-3' } });
  expect(props.onUpdateElements).toHaveBeenCalledWith([{
    ...source,
    textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
  }], true);
});

it('resets linked UI state when the selected ID set changes without recording history', () => {
  const first = text('first', { autoWidth: false });
  const second = text('second', { autoWidth: false });
  const props = callbacks();
  const view = render(<PropertiesPanel state={stateFor([first, second], ['first'])} {...props} />);
  const link = screen.getByLabelText('Link padding sides');
  fireEvent.click(link);
  expect(link).not.toBeChecked();

  view.rerender(<PropertiesPanel state={stateFor([first, second], ['first', 'second'])} {...props} />);
  expect(screen.getByLabelText('Link padding sides')).toBeChecked();
  expect(props.onUpdateElements).not.toHaveBeenCalled();
});

it('does not expose padding controls for grids, shape captions, or mixed types', () => {
  const literal = text('text');
  const caption = text('caption', { type: 'rect' });
  const grid = text('grid', {
    type: 'grid',
    text: undefined,
    gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
  });
  const props = callbacks();
  const view = render(<PropertiesPanel state={stateFor([grid], ['grid'])} {...props} />);
  expect(screen.queryByTestId('text-padding-controls')).toBeNull();
  view.rerender(<PropertiesPanel state={stateFor([caption], ['caption'])} {...props} />);
  expect(screen.queryByTestId('text-padding-controls')).toBeNull();
  view.rerender(<PropertiesPanel state={stateFor([literal, caption], ['text', 'caption'])} {...props} />);
  expect(screen.queryByTestId('text-padding-controls')).toBeNull();
});
```

Define `text`, `stateFor`, and `callbacks` exactly as in `PropertiesPanelAutoWidth.test.tsx`, changing test state schema to 11.

- [ ] **Step 2: Run property tests and verify RED**

Run:

```bash
npx vitest run tests/unit/PropertiesPanelTextPadding.test.tsx
```

Expected: FAIL because padding controls do not exist.

- [ ] **Step 3: Build isolated padding controls**

Create `components/properties/TextPaddingControls.tsx`:

```tsx
import React from 'react';
import { TEXT_PADDING_SIDES, type TextPaddingSide } from '../../services/textPadding';

export type TextPaddingSelection = Record<TextPaddingSide, number | 'mixed'>;

interface TextPaddingControlsProps {
  values: TextPaddingSelection;
  disabled: boolean;
  selectionKey: string;
  onCommit: (side: TextPaddingSide, value: number, linked: boolean) => void;
}

const LABELS: Record<TextPaddingSide, string> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
};

export const TextPaddingControls: React.FC<TextPaddingControlsProps> = ({
  values,
  disabled,
  selectionKey,
  onCommit,
}) => {
  const [linked, setLinked] = React.useState(true);
  const [drafts, setDrafts] = React.useState<Partial<Record<TextPaddingSide, string>>>({});

  React.useEffect(() => {
    setLinked(true);
    setDrafts({});
  }, [selectionKey]);

  const clearDraft = (side: TextPaddingSide) => {
    setDrafts(current => {
      const next = { ...current };
      delete next[side];
      return next;
    });
  };

  return (
    <div className="space-y-2 rounded border border-slate-200 p-2" data-testid="text-padding-controls">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-500">Padding</span>
        <label className="flex items-center gap-1 text-[10px] text-slate-500">
          <input
            type="checkbox"
            aria-label="Link padding sides"
            checked={linked}
            disabled={disabled}
            onChange={event => setLinked(event.target.checked)}
          />
          Linked
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TEXT_PADDING_SIDES.map(side => {
          const value = Object.hasOwn(drafts, side)
            ? drafts[side]!
            : values[side] === 'mixed' ? '' : String(values[side]);
          return (
            <label key={side} className="text-[10px] text-slate-400">
              {LABELS[side]}
              <input
                type="number"
                min="0"
                step="any"
                aria-label={`Padding ${side}`}
                className="mt-0.5 w-full rounded border px-1 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                value={value}
                placeholder={values[side] === 'mixed' ? 'Mixed' : undefined}
                disabled={disabled}
                onChange={event => {
                  const raw = event.target.value;
                  setDrafts(current => ({ ...current, [side]: raw }));
                  if (raw.trim() === '') return;
                  const parsed = Number(raw);
                  if (Number.isFinite(parsed)) onCommit(side, Math.max(0, parsed), linked);
                }}
                onBlur={() => clearDraft(side)}
              />
            </label>
          );
        })}
      </div>
      {disabled && (
        <p className="text-[10px] leading-snug text-slate-500">
          Padding applies only to fixed-size text.
        </p>
      )}
    </div>
  );
};
```

The local draft allows blank/incomplete input without writing document state. Valid negative input is immediately normalized to zero. Blur discards the draft so parent-normalized state remains authoritative.

- [ ] **Step 4: Aggregate each side in PropertiesPanel**

Import `resolveTextPadding`, `TEXT_PADDING_SIDES`, and `TextPaddingSelection`. After `autoWidthSelection`, add:

```ts
const textPaddingSelection = React.useMemo<TextPaddingSelection | null>(() => {
  if (!selectionIsTextOnly) return null;
  const paddings = selectedElements.map(resolveTextPadding);
  return Object.fromEntries(TEXT_PADDING_SIDES.map(side => {
    const first = paddings[0][side];
    return [side, paddings.every(padding => padding[side] === first) ? first : 'mixed'];
  })) as TextPaddingSelection;
}, [selectedElements, selectionIsTextOnly]);

const textPaddingSelectionKey = React.useMemo(
  () => [...selectedElementIds].sort().join('\u0000'),
  [selectedElementIds],
);
```

Pass both into `SingleElementEditor`:

```tsx
textPaddingSelection={textPaddingSelection}
textPaddingSelectionKey={textPaddingSelectionKey}
```

Do not use synthetic nested-object equality for side values.

- [ ] **Step 5: Integrate controls with functional multi-update**

In `SingleElementEditor.tsx`, import `resolveTextPadding`, `TextPaddingSide`, `TextPaddingControls`, and `TextPaddingSelection`. Add required props:

```ts
textPaddingSelection: TextPaddingSelection | null;
textPaddingSelectionKey: string;
```

Destructure them and add:

```ts
const handleTextPaddingCommit = (side: TextPaddingSide, value: number, linked: boolean) => {
  onUpdate(previous => {
    const current = resolveTextPadding(previous);
    const textPadding = linked
      ? { top: value, right: value, bottom: value, left: value }
      : { ...current, [side]: value };
    return { textPadding };
  });
};
```

Render immediately after the Auto width block and before source/font controls:

```tsx
{textPaddingSelection && (
  <TextPaddingControls
    values={textPaddingSelection}
    disabled={autoWidthSelection !== false}
    selectionKey={textPaddingSelectionKey}
    onCommit={handleTextPaddingCommit}
  />
)}
```

Update the two direct `SingleElementEditor` test harnesses to pass a resolved four-side selection and `textPaddingSelectionKey={element.id}`. For non-text elements pass `null`.

In the first `PropertiesPanelAutoWidth.test.tsx` test, give the source element asymmetric padding:

```ts
textPadding: { top: 1, right: 2, bottom: 3, left: 4 },
```

Keep its existing expected `{ ...element, autoWidth: false }` result. This proves conversion preserves padding without adding conversion-specific code.

- [ ] **Step 6: Run UI and existing Typography regression tests**

Run:

```bash
npx vitest run tests/unit/PropertiesPanelTextPadding.test.tsx tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/PropertiesPanelTextOverflow.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/PropertiesPanelSections.test.tsx
```

Expected: all tests PASS. Auto-width and overflow controls retain prior behavior.

- [ ] **Step 7: Commit property controls**

```bash
git add components/properties/TextPaddingControls.tsx components/properties/SingleElementEditor.tsx components/PropertiesPanel.tsx tests/unit/PropertiesPanelTextPadding.test.tsx tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx
git commit -m "feat: edit linked text padding"
```

---

### Task 7: Browser Acceptance and Full Verification

**Files:**
- Modify: `tests/e2e/element_properties.spec.js`
- Verify only: `tests/e2e/text_overflow.spec.js`
- Verify only: whole repository

**Interfaces:**
- Consumes all previous tasks.
- Produces real-browser coverage for linked/unlinked padding, dormant auto-width state, Canvas geometry, and padded full-source editing.

- [ ] **Step 1: Extend the Element Properties fixture to schema v11**

In `tests/e2e/element_properties.spec.js`, change `schemaVersion` to `11` and add zero padding to `literal` and `bound`:

```js
textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
```

- [ ] **Step 2: Add browser acceptance test**

Add inside the existing describe:

```js
test('edits linked and independent padding and restores it after auto width', async ({ page }) => {
  const pane = activePane(page);
  await canvasElement(page, 'literal').click();

  const top = pane.getByLabel('Padding top');
  const right = pane.getByLabel('Padding right');
  const link = pane.getByLabel('Link padding sides');
  await expect(link).toBeChecked();
  await top.fill('8');

  const textBox = canvasElement(page, 'literal').locator('[data-text-layout-line]').first().locator('..');
  await expect(textBox).toHaveCSS('left', '8px');
  await expect(textBox).toHaveCSS('top', '8px');
  await expect(textBox).toHaveCSS('width', '164px');
  await expect(textBox).toHaveCSS('height', '24px');

  await link.uncheck();
  await right.fill('12');
  await expect(textBox).toHaveCSS('left', '8px');
  await expect(textBox).toHaveCSS('top', '8px');
  await expect(textBox).toHaveCSS('width', '160px');
  await expect(textBox).toHaveCSS('height', '24px');

  await canvasElement(page, 'literal').dblclick();
  const editorBox = pane.getByTestId('overlay-text-editor-box');
  await expect(editorBox).toHaveCSS('left', '8px');
  await expect(editorBox).toHaveCSS('top', '8px');
  await expect(editorBox).toHaveCSS('width', '160px');
  await expect(editorBox).toHaveCSS('height', '24px');
  await expect(pane.getByTestId('overlay-text-editor')).toContainText('Short');
  await page.keyboard.press('Escape');

  const autoWidth = pane.getByLabel('Auto width', { exact: true });
  await autoWidth.check();
  await expect(top).toBeDisabled();
  await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(0);

  await autoWidth.uncheck();
  await expect(top).toBeEnabled();
  await expect(textBox).toHaveCSS('left', '8px');
  await expect(textBox).toHaveCSS('top', '8px');
});
```

If Escape switches tools before the property controls settle, explicitly reselect `literal`; do not add timeouts.

- [ ] **Step 3: Run focused Chromium acceptance**

Use ports that do not disturb the existing development stack:

```bash
E2E_WEB_PORT=4327 E2E_API_PORT=4328 npx playwright test tests/e2e/element_properties.spec.js tests/e2e/text_overflow.spec.js --project=chromium
```

Expected: all focused Chromium tests PASS. No existing `41000/3001` process is reused or stopped.

- [ ] **Step 4: Commit browser acceptance**

```bash
git add tests/e2e/element_properties.spec.js
git commit -m "test: cover static text padding workflow"
```

- [ ] **Step 5: Run all focused unit suites serially**

```bash
npx vitest run --maxWorkers=1 tests/unit/textPadding.test.ts tests/unit/migration.test.ts tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/presets.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatedProjectState.test.ts tests/unit/projectDocumentSnapshot.test.ts tests/unit/server/validateAppState.test.js tests/unit/canvasFixedTextLayout.test.tsx tests/unit/pdfFixedTextOverflow.test.ts tests/unit/textLayoutParity.test.ts tests/unit/canvasGridTextLayout.test.tsx tests/unit/pdfGridTextOverflow.test.ts tests/unit/pdfLinks.test.ts tests/unit/OverlayTextEditorPadding.test.tsx tests/unit/PropertiesPanelTextPadding.test.tsx tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/PropertiesPanelTextOverflow.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/PropertiesPanelSections.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 6: Run full unit/component suite**

```bash
npx vitest run --maxWorkers=1
```

Expected: all tests PASS with no unhandled rejection.

- [ ] **Step 7: Run build and TypeScript baseline comparison**

```bash
npm run build
npx tsc --noEmit
```

Expected: build exits 0. TypeScript prints exactly the pre-existing five diagnostics and no new diagnostic in any padding-touched file. Save output before/after comparison if baseline text differs.

- [ ] **Step 8: Inspect scope and request review**

```bash
git status --short
git diff --check
git diff --stat cfb393b..HEAD
```

Expected: only planned source/test/docs files changed; `.superpowers/brainstorm/`, `scratch/`, `dist/`, `playwright-report/`, `test-results/`, screenshots, and generated PDFs are absent from tracked changes.

Invoke `superpowers:requesting-code-review`. Require separate spec-compliance and code-quality passes. Fix High/Medium findings with focused regression tests and new commits; rerun affected tests after each fix.

- [ ] **Step 9: Re-run final verification after review fixes**

```bash
npx vitest run --maxWorkers=1
npm run build
E2E_WEB_PORT=4327 E2E_API_PORT=4328 npx playwright test tests/e2e/element_properties.spec.js tests/e2e/text_overflow.spec.js --project=chromium
git status --short
```

Expected: full Vitest suite, build, and focused Chromium pass; status contains no generated artifacts and only intentional untracked files outside the worktree.

After evidence is fresh, invoke `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch` to offer merge/PR/keep/cleanup choices. Do not merge, push, delete worktrees, or remove branches without explicit user choice.
