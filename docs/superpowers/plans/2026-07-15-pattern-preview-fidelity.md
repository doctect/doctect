# Pattern Preview Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep valid line and dot patterns readable at low canvas scales, add missing diagonal-pattern viewport/PDF support, and rename the Generator Visual Preview action to **Create As New Project**.

**Architecture:** Centralize viewport CSS pattern construction in one pure canvas helper that receives render scale, then pass the shared page scale into every `CanvasElement`. Keep PDF rendering physical and zoom-independent by adding a diagonal branch to the existing clipped `drawPattern` path. Update only current UI/help/docs copy and extend real-renderer browser coverage.

**Tech Stack:** React 19, TypeScript, CSS gradients, jsPDF, Vitest/jsdom, Playwright.

## Global Constraints

- Horizontal, vertical, and diagonal lines have a minimum visible thickness of exactly 1 screen pixel in scaled viewport rendering.
- Dots have a minimum visible diameter of exactly 1.5 screen pixels and a 0.5-screen-pixel color-to-transparent edge.
- Pattern spacing, color, saved template data, generator source, and PDF source dimensions never change.
- Source weight remains authoritative whenever it renders above the viewport minimum.
- Shapes and grid cells use the same viewport pattern-style helper.
- Editor canvas, generator thumbnails, and generator lightbox use the same scale-aware rule; no preview-only renderer branch.
- PDF diagonal patterns use source spacing and source weight, never viewport screen-minimum values.
- Rename only Generator Visual Preview's decision action to **Create As New Project**. Keep **Create Generated Project**, **Create Project**, and the unrelated global **Create New Project** modal unchanged.
- Keep schema v9, generator sandbox timeout/limits, project history/persistence semantics, and publication behavior unchanged.
- Add no runtime dependency.
- Historical design specifications and implementation plans remain unchanged.
- Do not touch existing untracked `.superpowers/brainstorm/` or `scratch/` files.

---

## File Structure

- Create `components/canvas/patternStyle.ts`: pure scale-aware CSS pattern style construction.
- Modify `components/canvas/CanvasElement.tsx`: consume shared pattern helper for normal elements and grid cells; accept render scale.
- Modify `components/canvas/ReadOnlyPagePreview.tsx`: pass page scale to default element rendering.
- Modify `components/Canvas.tsx`: pass page scale to interactive element rendering.
- Create `tests/unit/patternStyle.test.ts`: exact scale-minimum and pattern-type contract.
- Create `tests/unit/canvasPatternScale.test.tsx`: real normal-element, grid-cell, shared-preview, and editor propagation coverage.
- Modify `services/pdfService.ts`: draw diagonal pattern strokes through existing clipped pattern path.
- Create `tests/unit/pdfPatterns.test.ts`: diagonal PDF integration and existing-pattern regression coverage.
- Modify `components/GeneratorVisualPreviewModal.tsx`, `components/HierarchyGeneratorModal.tsx`, `docs/6-advanced-features.md`, and `pages/DocsPage.tsx`: current action/help copy.
- Modify `tests/unit/GeneratorVisualPreviewModal.test.tsx` and `tests/unit/HierarchyGeneratorModal.test.tsx`: copy and behavior assertions.
- Modify `tests/e2e/editor_advanced.spec.js`: real patterned thumbnail styles and renamed action workflow.

---

### Task 1: Build and Propagate Scale-Aware Viewport Pattern Styles

**Files:**
- Create: `components/canvas/patternStyle.ts`
- Modify: `components/canvas/CanvasElement.tsx:4-7,67-77,247-300,532-544`
- Modify: `components/canvas/ReadOnlyPagePreview.tsx:54-66`
- Modify: `components/Canvas.tsx:1568-1582`
- Create: `tests/unit/patternStyle.test.ts`
- Create: `tests/unit/canvasPatternScale.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface PatternBackgroundOptions {
  type?: PatternType;
  color: string;
  spacing?: number;
  weight?: number;
  renderScale?: number;
}

export const MIN_SCREEN_LINE_PX = 1;
export const MIN_SCREEN_DOT_PX = 1.5;
export const DOT_FEATHER_SCREEN_PX = 0.5;

export function buildPatternBackgroundStyle(
  options: PatternBackgroundOptions,
): React.CSSProperties;
```

- Adds to `CanvasElementProps`:

```ts
renderScale?: number;
```

- [ ] **Step 1: Add failing pure pattern-style tests**

Create `tests/unit/patternStyle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildPatternBackgroundStyle,
  DOT_FEATHER_SCREEN_PX,
  MIN_SCREEN_DOT_PX,
  MIN_SCREEN_LINE_PX,
} from '../../components/canvas/patternStyle';

describe('buildPatternBackgroundStyle', () => {
  it('keeps source line weight when it already exceeds the screen minimum', () => {
    const style = buildPatternBackgroundStyle({
      type: 'lines-h', color: '#123456', spacing: 24, weight: 4, renderScale: 0.5,
    });
    expect(style.backgroundImage).toBe(
      'repeating-linear-gradient(180deg, #123456, #123456 4px, transparent 4px, transparent 24px)',
    );
  });

  it.each([
    ['lines-h', '180deg'],
    ['lines-v', '90deg'],
    ['lines-d', '135deg'],
  ] as const)('clamps %s to one screen pixel', (type, angle) => {
    const scale = 0.125;
    const style = buildPatternBackgroundStyle({
      type, color: '#334155', spacing: 24, weight: 1, renderScale: scale,
    });
    expect(style.backgroundImage).toBe(
      `repeating-linear-gradient(${angle}, #334155, #334155 8px, transparent 8px, transparent 24px)`,
    );
    expect(8 * scale).toBe(MIN_SCREEN_LINE_PX);
  });

  it('clamps dots to 1.5 screen pixels with a 0.5 screen pixel feather', () => {
    const scale = 0.125;
    const style = buildPatternBackgroundStyle({
      type: 'dots', color: '#334155', spacing: 24, weight: 1, renderScale: scale,
    });
    expect(style.backgroundImage).toBe(
      'radial-gradient(circle, #334155 0, #334155 2px, transparent 6px)',
    );
    expect(style.backgroundSize).toBe('24px 24px');
    expect(12 * scale).toBe(MIN_SCREEN_DOT_PX);
    expect(4 * scale).toBe(DOT_FEATHER_SCREEN_PX);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to scale 1 for invalid scale %s',
    renderScale => {
      const style = buildPatternBackgroundStyle({
        type: 'lines-v', color: '#000000', spacing: 10, weight: 1, renderScale,
      });
      expect(style.backgroundImage).toContain('#000000 1px');
    },
  );

  it('returns no background for an absent pattern type', () => {
    expect(buildPatternBackgroundStyle({ color: '#000000' })).toEqual({});
  });
});
```

- [ ] **Step 2: Run pure tests to verify RED**

Run:

```bash
npx vitest run tests/unit/patternStyle.test.ts
```

Expected: FAIL because `components/canvas/patternStyle.ts` does not exist.

- [ ] **Step 3: Implement pure viewport pattern style construction**

Create `components/canvas/patternStyle.ts`:

```ts
import type { CSSProperties } from 'react';
import type { PatternType } from '../../types';

export const MIN_SCREEN_LINE_PX = 1;
export const MIN_SCREEN_DOT_PX = 1.5;
export const DOT_FEATHER_SCREEN_PX = 0.5;

export interface PatternBackgroundOptions {
  type?: PatternType;
  color: string;
  spacing?: number;
  weight?: number;
  renderScale?: number;
}

const PATTERN_ANGLES: Partial<Record<PatternType, string>> = {
  'lines-h': '180deg',
  'lines-v': '90deg',
  'lines-d': '135deg',
};

const safeScale = (value: number | undefined) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1
);

export function buildPatternBackgroundStyle({
  type,
  color,
  spacing = 10,
  weight = 1,
  renderScale = 1,
}: PatternBackgroundOptions): CSSProperties {
  const scale = safeScale(renderScale);
  const resolvedSpacing = Number(spacing) || 10;
  const sourceWeight = Number(weight) || 1;
  const angle = type ? PATTERN_ANGLES[type] : undefined;

  if (angle) {
    const effectiveWeight = Math.max(sourceWeight, MIN_SCREEN_LINE_PX / scale);
    return {
      backgroundImage: `repeating-linear-gradient(${angle}, ${color}, ${color} ${effectiveWeight}px, transparent ${effectiveWeight}px, transparent ${resolvedSpacing}px)`,
    };
  }

  if (type === 'dots') {
    const diameter = Math.max(sourceWeight, MIN_SCREEN_DOT_PX / scale);
    const radius = diameter / 2;
    const feather = Math.min(radius, DOT_FEATHER_SCREEN_PX / scale);
    const solidRadius = Math.max(0, radius - feather);
    return {
      backgroundImage: `radial-gradient(circle, ${color} 0, ${color} ${solidRadius}px, transparent ${radius}px)`,
      backgroundSize: `${resolvedSpacing}px ${resolvedSpacing}px`,
    };
  }

  return {};
}
```

- [ ] **Step 4: Run pure tests to verify GREEN**

Run:

```bash
npx vitest run tests/unit/patternStyle.test.ts
```

Expected: 10 tests PASS, including three `it.each` line cases and four invalid-scale cases reported as parameterized cases by Vitest.

- [ ] **Step 5: Add failing real-renderer scale propagation tests**

Create `tests/unit/canvasPatternScale.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import { ReadOnlyPagePreview } from '../../components/canvas/ReadOnlyPagePreview';
import type { AppNode, PageTemplate, TemplateElement } from '../../types';
import { makeEl, makeLayer, renderCanvas } from './canvasTestUtils';

const nodes: Record<string, AppNode> = {
  root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['child'] },
  child: { id: 'child', parentId: 'root', type: 'page', title: 'Cell', data: {}, children: [] },
};

const baseProps = {
  selected: false,
  nodes,
  currentNodeId: 'root',
  tool: 'select',
  showHandles: false,
};

const patternChild = (container: HTMLElement, id: string) => (
  container.querySelector(`[data-element-id="${id}"] > div`) as HTMLElement
);

describe('scale-aware canvas patterns', () => {
  it('passes editor Canvas scale into interactive normal elements', () => {
    const line = makeEl('line-pattern', {
      fill: '#334155', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 24, patternWeight: 1,
    });
    const { container } = renderCanvas([line], [makeLayer('base', 0)], { scale: 0.125 });
    expect(patternChild(container, 'line-pattern').style.backgroundImage).toContain('#334155 8px');
  });

  it('passes ReadOnlyPagePreview scale into default dot rendering', () => {
    const dot = makeEl('dot-pattern', {
      fill: '#334155', fillType: 'pattern', patternType: 'dots', patternSpacing: 24, patternWeight: 1,
    });
    const template: PageTemplate = {
      id: 'page', name: 'Page', width: 1404, height: 1872,
      layers: [makeLayer('base', 0)], elements: [{ ...dot, layerId: 'base' }],
    };
    const { container } = render(
      <ReadOnlyPagePreview template={template} nodes={nodes} currentNodeId="root" scale={0.125} />,
    );
    expect(patternChild(container, 'dot-pattern').style.backgroundImage).toContain('transparent 6px');
  });

  it('uses the same scale-aware helper for grid cells and diagonal patterns', () => {
    const grid: TemplateElement = makeEl('grid-pattern', {
      type: 'grid', w: 100, h: 40, fill: '#334155', fillType: 'pattern',
      patternType: 'lines-d', patternSpacing: 24, patternWeight: 1,
      gridConfig: {
        cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title',
        gridBorderMode: 'none', gridBorderWidth: 0, gridBorderColor: 'transparent', gridBorderStyle: 'solid',
      },
    });
    const { container } = render(<CanvasElement element={grid} renderScale={0.125} {...baseProps} />);
    const cell = container.querySelector('[data-element-id="grid-pattern"] > div') as HTMLElement;
    expect(cell.style.backgroundImage).toContain('repeating-linear-gradient(135deg');
    expect(cell.style.backgroundImage).toContain('#334155 8px');
  });
});
```

- [ ] **Step 6: Run renderer tests to verify RED**

Run:

```bash
npx vitest run tests/unit/canvasPatternScale.test.tsx
```

Expected: FAIL because `CanvasElement` does not accept/consume `renderScale`, `ReadOnlyPagePreview` does not pass scale, and `lines-d` returns no background.

- [ ] **Step 7: Integrate the helper in normal elements and grid cells**

In `components/canvas/CanvasElement.tsx`:

1. Import the helper:

```ts
import { buildPatternBackgroundStyle } from './patternStyle';
```

2. Add `renderScale?: number` to `CanvasElementProps` and default it during destructuring:

```ts
const {
  element, selected, nodes, currentNodeId, tool, showHandles,
  onDoubleClick, isEditing, renderScale = 1,
} = props;
```

3. Replace lines 287–298 in `getBackgroundStyle` with:

```ts
if (el.fillType === 'pattern' && el.fill) {
  Object.assign(bgStyle, buildPatternBackgroundStyle({
    type: el.patternType,
    color: el.fill,
    spacing: el.patternSpacing,
    weight: el.patternWeight,
    renderScale,
  }));
}
```

4. Replace duplicated grid-cell pattern construction at lines 532–544 with:

```ts
const patternStyle = element.fillType === 'pattern' && cellFill
  ? buildPatternBackgroundStyle({
      type: element.patternType,
      color: cellFill,
      spacing: element.patternSpacing,
      weight: element.patternWeight,
      renderScale,
    })
  : {};
```

- [ ] **Step 8: Propagate scale through shared and interactive rendering**

In `components/canvas/ReadOnlyPagePreview.tsx`, add this prop to its default `CanvasElement`:

```tsx
renderScale={scale}
```

In `components/Canvas.tsx`, add the same prop to the `CanvasElement` inside `renderElement`:

```tsx
renderScale={scale}
```

Do not add scale to SVG geometry, element bounds, transforms, handles, or PDF data. The existing parent transform still controls page scaling.

- [ ] **Step 9: Run focused viewport suites**

Run:

```bash
npx vitest run tests/unit/patternStyle.test.ts tests/unit/canvasPatternScale.test.tsx tests/unit/ReadOnlyPagePreview.test.tsx tests/unit/canvasLayers.test.tsx tests/unit/canvasElementTextVisibility.test.tsx tests/unit/canvasElementSvgSanitize.test.tsx tests/unit/canvasStackingIsolation.test.tsx tests/unit/canvasGreyscalePreview.test.tsx
```

Expected: all focused tests PASS; normal editor interactions and non-pattern element rendering remain unchanged.

- [ ] **Step 10: Commit Task 1**

```bash
git add components/canvas/patternStyle.ts components/canvas/CanvasElement.tsx components/canvas/ReadOnlyPagePreview.tsx components/Canvas.tsx tests/unit/patternStyle.test.ts tests/unit/canvasPatternScale.test.tsx
git commit -m "fix(canvas): keep patterns visible at low zoom"
```

---

### Task 2: Render Diagonal Patterns in PDF

**Files:**
- Modify: `services/pdfService.ts:600-632`
- Create: `tests/unit/pdfPatterns.test.ts`

**Interfaces:**
- Consumes existing private `drawPattern(doc, type, x, y, w, h, color, spacing, weight)` call sites, both already wrapped by `clipToShape` and graphics-state save/restore.
- Produces no public runtime API; `generatePDF` remains the verification seam.

- [ ] **Step 1: Add failing diagonal PDF integration tests**

Create `tests/unit/pdfPatterns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import type { AppState, PatternType, TemplateElement } from '../../types';

const patternElement = (patternType: PatternType): TemplateElement => ({
  id: `pattern-${patternType}`,
  type: 'rect',
  x: 40, y: 50, w: 180, h: 120, rotation: 0,
  fill: '#ff0000', fillType: 'pattern', patternType,
  patternSpacing: 12, patternWeight: 2,
  stroke: '', strokeWidth: 0, opacity: 1,
  layerId: 'main', zIndex: 1,
});

const stateWith = (element: TemplateElement): AppState => ({
  schemaVersion: 9,
  nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
  rootId: 'root',
  variants: { default: { id: 'default', name: 'Default', templates: {
    page: {
      id: 'page', name: 'Page', width: 300, height: 300,
      layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
      elements: [element],
    },
  } } },
  activeVariantId: 'default',
  viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
  selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
  scale: 1, tool: 'select', showJsonModal: false,
  sidebarWidth: 288, propertiesPanelWidth: 320,
  snapToGrid: false, showGrid: false, showNodeSelector: false,
  nodeSelectorMode: 'grid_source', editingElementId: null, clipboard: [],
} as AppState);

const pdfText = async (patternType: PatternType) => {
  const buffer = await generatePDF(stateWith(patternElement(patternType)), { output: 'arraybuffer' }) as ArrayBuffer;
  return new TextDecoder('latin1').decode(new Uint8Array(buffer));
};

const paintedLineCount = (pdf: string) => (pdf.match(/\bl\s+S\b/g) ?? []).length;

describe('PDF pattern fills', () => {
  it('draws multiple clipped diagonal strokes', async () => {
    const pdf = await pdfText('lines-d');
    expect(pdf).toContain('1. 0. 0. RG');
    expect(paintedLineCount(pdf)).toBeGreaterThan(5);
  });

  it.each(['lines-h', 'lines-v'] as const)('keeps %s line patterns rendering', async patternType => {
    const pdf = await pdfText(patternType);
    expect(pdf).toContain('1. 0. 0. RG');
    expect(paintedLineCount(pdf)).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run the PDF tests to verify RED**

Run:

```bash
npx vitest run tests/unit/pdfPatterns.test.ts
```

Expected: the `lines-d` case FAILS because no line operators are emitted; horizontal and vertical regression cases PASS.

- [ ] **Step 3: Add diagonal stroke generation to `drawPattern`**

In `services/pdfService.ts`, extend the existing line branches after `lines-v`:

```ts
} else if (type === 'lines-d') {
  const diagonalStep = step * Math.SQRT2;
  const maxOffset = w + h;
  for (let offset = halfW; offset <= maxOffset; offset += diagonalStep) {
    const startX = Math.max(0, offset - h);
    const startY = Math.min(h, offset);
    const endX = Math.min(w, offset);
    const endY = Math.max(0, offset - w);
    doc.line(x + startX, y + startY, x + endX, y + endY);
  }
}
```

The two existing call sites already invoke `clipToShape` inside saved graphics state. Do not add a second clip, apply viewport scale minimums, or change existing dots/horizontal/vertical output.

- [ ] **Step 4: Run PDF pattern and neighboring export tests**

Run:

```bash
npx vitest run tests/unit/pdfPatterns.test.ts tests/unit/pdfSvgGrayscaleOpacity.test.ts tests/unit/pdfLayers.test.ts tests/unit/pdfElementOpacity.test.ts
```

Expected: all tests PASS; diagonal output contains red stroke operations and more than five painted lines.

- [ ] **Step 5: Commit Task 2**

```bash
git add services/pdfService.ts tests/unit/pdfPatterns.test.ts
git commit -m "feat(pdf): render diagonal fill patterns"
```

---

### Task 3: Rename the Action, Add Patterned Browser Coverage, and Verify

**Files:**
- Modify: `components/GeneratorVisualPreviewModal.tsx:367-374`
- Modify: `components/HierarchyGeneratorModal.tsx:599`
- Modify: `docs/6-advanced-features.md:36`
- Modify: `pages/DocsPage.tsx:616`
- Modify: `tests/unit/GeneratorVisualPreviewModal.test.tsx:211-284`
- Modify: `tests/unit/HierarchyGeneratorModal.test.tsx:84-99`
- Modify: `tests/e2e/editor_advanced.spec.js:42-69,178-274`

**Interfaces:**
- User-facing visual-preview decision label becomes exactly **Create As New Project**.
- Naming dialog remains exactly **Create Generated Project**.
- Naming submit remains exactly **Create Project**.

- [ ] **Step 1: Add failing copy assertions**

In `tests/unit/GeneratorVisualPreviewModal.test.tsx`, replace only main-dialog action lookups:

```ts
screen.getByRole('button', { name: 'Create As New Project' })
```

Keep naming-dialog submit lookups as:

```ts
within(namingDialog).getByRole('button', { name: 'Create Project' })
```

Add this explicit boundary assertion to the naming-validation test:

```ts
expect(screen.queryByRole('button', { name: 'Create New Project' })).not.toBeInTheDocument();
expect(within(namingDialog).getByRole('button', { name: 'Create Project' })).toBeVisible();
```

In `tests/unit/HierarchyGeneratorModal.test.tsx`, update the workflow sentence to:

```ts
const workflow = 'Preview opens live canvas template previews. Back keeps your scripts, Create As New Project preserves the original, and Replace Current Project creates one undo checkpoint.';
```

- [ ] **Step 2: Run copy tests to verify RED**

Run:

```bash
npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx
```

Expected: FAIL because production action/help copy still says **Create New Project**.

- [ ] **Step 3: Update current UI and documentation copy**

In `components/GeneratorVisualPreviewModal.tsx`, change only the footer decision button text:

```tsx
Create As New Project
```

In `components/HierarchyGeneratorModal.tsx`, set:

```ts
const GENERATOR_WORKFLOW_HELP = 'Preview opens live canvas template previews. Back keeps your scripts, Create As New Project preserves the original, and Replace Current Project creates one undo checkpoint.';
```

In `docs/6-advanced-features.md`, replace the current workflow sentence with:

```md
*   **Preview decisions**: **Back to Scripts** preserves exact drafts and the validated preview. **View Preview** reopens it without rerunning scripts. **Create As New Project** asks for a name, retains source, and leaves the original project unchanged. **Replace Current Project** confirms before replacing generated fields and creates one undo checkpoint.
```

In `pages/DocsPage.tsx`, update only the matching current workflow list item:

```tsx
<li><strong>Choose what happens next:</strong> Back to Scripts preserves exact drafts, and View Preview reopens the validated result without rerunning source. Create As New Project asks for a name, retains source, and preserves the original. Replace Current Project confirms before replacing generated fields and creates one undo checkpoint.</li>
```

Do not modify `components/NewProjectModal.tsx` or historical spec/plan files.

- [ ] **Step 4: Run copy tests to verify GREEN**

Run:

```bash
npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx
```

Expected: all tests PASS; naming validation and focus behavior remain unchanged.

- [ ] **Step 5: Extend the real browser fixture with all viewport pattern types**

In `tests/e2e/editor_advanced.spec.js`, replace the `elements` array in `VISUAL_PREVIEW_TEMPLATE_SOURCE` with:

```js
elements: [
    {
        id: id + '-title', type: 'text', x: 40, y: 40, w: 300, h: 40,
        text: name + ': {{title}}', fontSize: 20, color
    },
    {
        id: id + '-lines', type: 'rect', x: 40, y: 110, w: 220, h: 90,
        fill: color, fillType: 'pattern', patternType: 'lines-h',
        patternSpacing: 24, patternWeight: 1, stroke: '', strokeWidth: 0, opacity: 1
    },
    {
        id: id + '-dots', type: 'rect', x: 40, y: 230, w: 220, h: 90,
        fill: color, fillType: 'pattern', patternType: 'dots',
        patternSpacing: 24, patternWeight: 1, stroke: '', strokeWidth: 0, opacity: 1
    },
    {
        id: id + '-diagonal', type: 'rect', x: 40, y: 350, w: 220, h: 90,
        fill: color, fillType: 'pattern', patternType: 'lines-d',
        patternSpacing: 24, patternWeight: 1, stroke: '', strokeWidth: 0, opacity: 1
    }
]
```

After the Paper Cover card becomes visible, add:

```js
const paperCover = preview.getByRole('button', { name: 'Paper Cover, Paper, 1 use' });
const patternStyle = async id => paperCover.locator(`[data-element-id="${id}"] > div`).evaluate(element => ({
    backgroundImage: element.style.backgroundImage,
    backgroundSize: element.style.backgroundSize,
}));
const lines = await patternStyle('cover-lines');
const dots = await patternStyle('cover-dots');
const diagonal = await patternStyle('cover-diagonal');
expect(lines.backgroundImage).toContain('repeating-linear-gradient(180deg');
expect(lines.backgroundImage).toMatch(/3\.50\d*px/);
expect(dots.backgroundImage).toContain('radial-gradient');
expect(dots.backgroundImage).toMatch(/2\.63\d*px/);
expect(dots.backgroundSize).toBe('24px 24px');
expect(diagonal.backgroundImage).toContain('repeating-linear-gradient(135deg');
expect(diagonal.backgroundImage).toMatch(/3\.50\d*px/);
```

These values derive from A4 fit scale `240 / 842`: line source minimum `1 / scale ≈ 3.5083`, dot radius `(1.5 / scale) / 2 ≈ 2.6313`. Use a numeric extraction/tolerance instead if browser CSS serialization rounds differently; still assert the computed source stop multiplied by `240 / 842` is at least 1 for lines and 0.75 for dot radius.

Change the create-action locator later in the same test to:

```js
await preview.getByRole('button', { name: 'Create As New Project' }).click();
```

Retain existing lightbox, variant, no-rerun, original-preservation, Replace, and Undo assertions.

- [ ] **Step 6: Run focused Chromium browser acceptance**

Run:

```bash
npm run test:e2e -- tests/e2e/editor_advanced.spec.js --project=chromium
```

Expected: all Chromium advanced-editor tests PASS. If ports 3000/3001 are occupied, use an untracked temporary Playwright config with unused client/API ports, `DATABASE_URL=""`, and an explicit `/tmp/opencode/*.sqlite` path; do not stop or reuse user processes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npx vitest run
npm run build
npx tsc --noEmit --pretty false
npm run test:e2e -- --project=chromium --project=firefox
git diff --check
git status --short
```

Expected:

- Full Vitest suite passes.
- Production build passes; existing chunk-size warning may remain.
- TypeScript has zero branch-introduced diagnostic delta; five documented pre-existing test diagnostics may remain.
- Chromium and Firefox pass; existing two explicitly Firefox-specific sandbox skips remain skips.
- WebKit may remain unrun if unavailable; report it explicitly.
- Only intended tracked files changed; `.superpowers/brainstorm/` and `scratch/` remain untouched.

- [ ] **Step 8: Commit Task 3**

```bash
git add components/GeneratorVisualPreviewModal.tsx components/HierarchyGeneratorModal.tsx docs/6-advanced-features.md pages/DocsPage.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/e2e/editor_advanced.spec.js
git commit -m "fix(generator): clarify create action"
```

---

## Final Acceptance Checklist

- [ ] **Create As New Project** appears only on the Generator Visual Preview decision action; naming/global-new-project labels stay unchanged.
- [ ] Horizontal, vertical, and diagonal viewport lines stay at least 1 screen pixel thick at low scale.
- [ ] Viewport dots stay at least 1.5 screen pixels in diameter with a 0.5-screen-pixel antialias edge.
- [ ] Source weights above the minimum and all pattern spacing remain unchanged.
- [ ] Normal elements and grid cells share one CSS pattern helper.
- [ ] Editor canvas, preview thumbnails, and lightbox pass the same render scale into `CanvasElement`.
- [ ] Diagonal patterns render in viewport and PDF; PDF uses source dimensions.
- [ ] Unit, build, TypeScript delta, and available browser suites are verified.
