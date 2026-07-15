# Generator Visual Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Hierarchy Generator's count-only preview with a centered, live canvas template-preview dialog that can replace the current project or create a separate named project.

**Architecture:** Extract Canvas's display-only page surface into a reusable read-only component, then build pure representative-template descriptors from validated generator output. A new visual preview dialog renders those descriptors with variant tabs, batches of 24, and a lightbox; existing generator state owns the immutable preview payload. Project creation crosses `ProjectEditor` into `EditorPage`, where a fresh local project is built without mutating the original.

**Tech Stack:** React 19, TypeScript, existing `CanvasElement` renderer, Tailwind CSS, Vitest/jsdom, Playwright, existing sandbox/validator/local-project state.

## Global Constraints

- Generator source executes only through the existing opaque iframe/Worker sandbox with a fixed 10,000 ms timeout.
- Visual rendering receives only parent-validated generated data and never re-executes source.
- Preview preparation and rendering never mutate generated output or application state.
- Use live, scaled canvas rendering; do not add raster screenshot code or a rendering dependency.
- Show one representative page for every template in every variant, including unused templates with preview-only synthetic nodes.
- Mount template cards in batches of exactly 24 per selected variant.
- **Back to Scripts** preserves drafts and changes no project state.
- **Create New Project** asks for a trimmed 1–100 character name, retains exact generator source, opens a separate local project, and leaves the original state/history/cloud linkage unchanged.
- **Replace Current Project** keeps one atomic undo checkpoint and applies the exact source bound to the successful preview.
- Remove end-user **Detach Saved Generator** controls and guidance.
- Publishing source-bearing projects continues to publish source after an explicit warning.
- Keep existing schema v9, format version 1, source limits, generated-state limits, cancellation, and no-reverse-synchronization behavior.
- Add no runtime dependency.
- Do not touch existing untracked `.superpowers/brainstorm/` or `scratch/` files.

---

## File Structure

- Create `components/canvas/ReadOnlyPagePreview.tsx`: shared display-only page surface used by editor Canvas and generator previews.
- Modify `components/Canvas.tsx`: compose `ReadOnlyPagePreview` around existing editing overlays.
- Create `services/generatorVisualPreview.ts`: immutable preview payload/source types and pure representative-template descriptor construction.
- Create `components/GeneratorVisualPreviewModal.tsx`: centered grid, variant tabs, batching, lightbox, name dialog, and decision actions.
- Modify `components/HierarchyGeneratorModal.tsx`: open visual preview from validated output, reopen ready output without rerunning, and remove Detach.
- Create `services/generatedProjectState.ts`: build a safe new `AppState` from immutable generated output and source.
- Modify `components/ProjectEditor.tsx`: pass project name/create callback and retain existing replace behavior.
- Modify `pages/EditorPage.tsx`: create/open a separate local generated project.
- Modify `components/cloud/PublishModal.tsx`, `docs/6-advanced-features.md`, and `pages/DocsPage.tsx`: remove Detach guidance and document visual preview/create behavior.
- Create focused unit/component tests and extend `tests/e2e/editor_advanced.spec.js`.

---

### Task 1: Extract Shared Read-Only Page Surface

**Files:**
- Create: `components/canvas/ReadOnlyPagePreview.tsx`
- Modify: `components/Canvas.tsx:3-10,1553-1600,1875-1878`
- Create: `tests/unit/ReadOnlyPagePreview.test.tsx`
- Modify: `tests/unit/canvasTestUtils.tsx`

**Interfaces:**
- Consumes: `PageTemplate`, `TemplateElement`, `AppNode`, `CanvasElement`, `sortElementsForRender`.
- Produces:

```ts
export interface ReadOnlyPagePreviewProps {
  template: PageTemplate;
  elements?: TemplateElement[];
  nodes: Record<string, AppNode>;
  currentNodeId: string;
  scale: number;
  greyscalePreview?: boolean;
  backgroundOverlay?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
  interactive?: boolean;
  renderElement?: (element: TemplateElement) => React.ReactNode;
}

export const ReadOnlyPagePreview: React.ForwardRefExoticComponent<
  ReadOnlyPagePreviewProps & React.RefAttributes<HTMLDivElement>
>;
```

- [ ] **Step 1: Add failing display-surface tests**

Create `tests/unit/ReadOnlyPagePreview.test.tsx` with concrete page, node, layer, and elements:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadOnlyPagePreview } from '../../components/canvas/ReadOnlyPagePreview';
import type { AppNode, PageTemplate } from '../../types';

const nodes: Record<string, AppNode> = {
  root: { id: 'root', parentId: null, type: 'page', title: 'Bound title', data: { label: 'Canvas value' }, children: [] },
};

const template: PageTemplate = {
  id: 'page',
  name: 'Page',
  width: 200,
  height: 300,
  layers: [{ id: 'base', name: 'Base', order: 0, visible: true, locked: false }],
  elements: [
    { id: 'shape', type: 'rect', x: 10, y: 10, w: 40, h: 30, rotation: 0, fill: '#ff0000', stroke: '#000000', strokeWidth: 1, opacity: 1, layerId: 'base', zIndex: 1 },
    { id: 'label', type: 'text', x: 10, y: 50, w: 100, h: 20, rotation: 0, text: '{{label}}', dataBinding: 'label', fontSize: 12, fill: 'transparent', stroke: 'transparent', strokeWidth: 0, textColor: '#000000', opacity: 1, layerId: 'base', zIndex: 2 },
  ],
};

describe('ReadOnlyPagePreview', () => {
  it('renders the production canvas elements at the requested scale without editor controls', () => {
    const { container } = render(
      <ReadOnlyPagePreview template={template} nodes={nodes} currentNodeId="root" scale={0.5} testId="page-preview" />,
    );

    expect(screen.getByTestId('page-preview')).toHaveStyle({ width: '100px', height: '150px' });
    expect(container.querySelector('[data-element-id="shape"]')).not.toBeNull();
    expect(screen.getByText('Canvas value')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="selection-handle"]')).toBeNull();
    expect(container.querySelector('.canvas-scroll-container')).toBeNull();
  });

  it('renders supplied overlays after the element layer', () => {
    render(
      <ReadOnlyPagePreview
        template={template}
        nodes={nodes}
        currentNodeId="root"
        scale={1}
        backgroundOverlay={<div data-testid="grid-overlay" />}
      >
        <div data-testid="editor-overlay" />
      </ReadOnlyPagePreview>,
    );
    expect(screen.getByTestId('grid-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('editor-overlay')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npx vitest run tests/unit/ReadOnlyPagePreview.test.tsx
```

Expected: FAIL because `components/canvas/ReadOnlyPagePreview.tsx` does not exist.

- [ ] **Step 3: Implement the shared page surface**

Create `components/canvas/ReadOnlyPagePreview.tsx`:

```tsx
import React, { forwardRef } from 'react';
import clsx from 'clsx';
import type { AppNode, PageTemplate, TemplateElement } from '../../types';
import { sortElementsForRender } from '../../services/layers';
import { CanvasElement } from './CanvasElement';

export interface ReadOnlyPagePreviewProps {
  template: PageTemplate;
  elements?: TemplateElement[];
  nodes: Record<string, AppNode>;
  currentNodeId: string;
  scale: number;
  greyscalePreview?: boolean;
  backgroundOverlay?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
  interactive?: boolean;
  renderElement?: (element: TemplateElement) => React.ReactNode;
}

export const ReadOnlyPagePreview = forwardRef<HTMLDivElement, ReadOnlyPagePreviewProps>(function ReadOnlyPagePreview({
  template,
  elements = template.elements,
  nodes,
  currentNodeId,
  scale,
  greyscalePreview,
  backgroundOverlay,
  children,
  className,
  testId,
  interactive = false,
  renderElement,
}, ref) {
  return (
    <div
      ref={ref}
      data-testid={testId}
      className={clsx('bg-white relative overflow-hidden', className)}
      style={{ width: template.width * scale, height: template.height * scale }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: template.width,
          height: template.height,
          pointerEvents: interactive ? undefined : 'none',
        }}
      >
        {backgroundOverlay}
        <div style={{ isolation: 'isolate', filter: greyscalePreview ? 'grayscale(1)' : undefined }}>
          {sortElementsForRender(elements, template.layers).map(element => (
            renderElement ? renderElement(element) : (
              <CanvasElement
                key={element.id}
                element={element}
                selected={false}
                nodes={nodes}
                currentNodeId={currentNodeId}
                tool="select"
                showHandles={false}
                isEditing={false}
              />
            )
          ))}
        </div>
        {children}
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Refactor editor Canvas to compose the shared surface**

In `components/Canvas.tsx`:

1. Import `ReadOnlyPagePreview`.
2. Remove direct `CanvasElement` and `sortElementsForRender` imports only after no remaining usage exists.
3. Replace the page container and element-layer JSX at current lines 1555–1600 with:

```tsx
<ReadOnlyPagePreview
  ref={containerRef}
  testId="editor-canvas"
  className="shadow-lg"
  template={template}
  elements={elements}
  nodes={nodes}
  currentNodeId={currentNodeId}
  scale={scale}
  greyscalePreview={greyscalePreview}
  interactive
  renderElement={element => (
    <CanvasElement
      key={element.id}
      element={element}
      selected={selectedElementIds.includes(element.id)}
      nodes={nodes}
      currentNodeId={currentNodeId}
      tool={tool}
      showHandles={selectedElementIds.includes(element.id) && selectedElementIds.length === 1}
      onDoubleClick={() => {
        const layer = element.layerId ? template.layers?.find(item => item.id === element.layerId) : undefined;
        if (!layer?.locked) setEditingElementId(element.id);
      }}
      isEditing={editingElementId === element.id}
    />
  )}
  backgroundOverlay={showGrid ? (
    <div
      className="absolute inset-0 pointer-events-none opacity-20"
      style={{
        backgroundImage: `radial-gradient(#94a3b8 ${Math.max(0.5, 1.5 / scale)}px, transparent ${Math.max(0.5, 1.5 / scale)}px)`,
        backgroundSize: `${effectiveGridSize}px ${effectiveGridSize}px`,
        zIndex: 0,
      }}
    />
  ) : undefined}
>
```

Move the existing JSX beginning with `Group Selection Overlay` and ending with the `isSelecting && selectionBox` overlay inside these children without changing its event logic, then close with `</ReadOnlyPagePreview>`. Keep `.canvas-scroll-container`, wrapper centering, and `SelectUnderMenu` outside the shared surface.

- [ ] **Step 5: Run read-only and existing canvas suites**

Run:

```bash
npx vitest run tests/unit/ReadOnlyPagePreview.test.tsx tests/unit/canvasLayers.test.tsx tests/unit/canvasElementTextVisibility.test.tsx tests/unit/canvasElementSvgSanitize.test.tsx tests/unit/canvasStackingIsolation.test.tsx tests/unit/canvasGreyscalePreview.test.tsx
```

Expected: all focused tests PASS; editor interactions retain existing behavior.

- [ ] **Step 6: Commit Task 1**

```bash
git add components/canvas/ReadOnlyPagePreview.tsx components/Canvas.tsx tests/unit/ReadOnlyPagePreview.test.tsx tests/unit/canvasTestUtils.tsx
git commit -m "refactor(canvas): share read-only page surface"
```

---

### Task 2: Build Immutable Representative Template Descriptors

**Files:**
- Create: `services/generatorVisualPreview.ts`
- Modify: `services/pdfService.ts:760`
- Create: `tests/unit/generatorVisualPreview.test.ts`
- Modify: `tests/unit/computePageOrder.test.ts`

**Interfaces:**
- Consumes: validated `GeneratedProject`, `GeneratedProjectSummary`, and `computePageOrder`.
- Produces:

```ts
export interface GeneratorSourceDraft {
  formatVersion: 1;
  templateScript: string;
  hierarchyScript: string;
}

export interface GeneratorPreviewPayload {
  project: GeneratedProject;
  summary: GeneratedProjectSummary;
  source: GeneratorSourceDraft;
}

export interface TemplatePreviewDescriptor {
  variantId: string;
  variantName: string;
  templateId: string;
  template: PageTemplate;
  nodeId: string;
  nodeTitle: string;
  usageCount: number;
  unused: boolean;
  syntheticNode?: AppNode;
}

export interface VariantPreviewDescriptor {
  variantId: string;
  variantName: string;
  templates: TemplatePreviewDescriptor[];
}

export function buildVariantPreviews(
  project: GeneratedProject,
  createId?: () => string,
): VariantPreviewDescriptor[];

export function nodesForTemplatePreview(
  nodes: Record<string, AppNode>,
  descriptor: TemplatePreviewDescriptor,
): Record<string, AppNode>;

export function fitTemplateScale(
  template: Pick<PageTemplate, 'width' | 'height'>,
  maxWidth: number,
  maxHeight: number,
): number;
```

- [ ] **Step 1: Generalize `computePageOrder` input type**

Change only its type contract in `services/pdfService.ts`:

```ts
export const computePageOrder = (state: Pick<AppState, 'nodes' | 'rootId'>): string[] => {
```

Add a compile/runtime test in `tests/unit/computePageOrder.test.ts` calling it with `{ nodes, rootId }` and no UI fields. Expected order remains depth-first and reference-safe.

- [ ] **Step 2: Add failing descriptor tests**

Create `tests/unit/generatorVisualPreview.test.ts` covering:

```ts
import { describe, expect, it } from 'vitest';
import { buildVariantPreviews, fitTemplateScale, nodesForTemplatePreview } from '../../services/generatorVisualPreview';
import type { GeneratedProject } from '../../services/validateGeneratedProject';

const project: GeneratedProject = {
  schemaVersion: 9,
  rootId: 'root',
  activeVariantId: 'remarkable',
  nodes: {
    root: { id: 'root', parentId: null, type: 'cover', title: 'Cover page', data: {}, children: ['chapter'] },
    chapter: { id: 'chapter', parentId: 'root', type: 'body', title: 'First chapter', data: {}, children: ['body-2'] },
    'body-2': { id: 'body-2', parentId: 'chapter', type: 'body', title: 'Second body', data: {}, children: [] },
  },
  variants: {
    remarkable: {
      id: 'remarkable', name: 'reMarkable',
      templates: {
        cover: { id: 'cover', name: 'Cover', width: 1404, height: 1872, layers: [], elements: [] },
        body: { id: 'body', name: 'Body', width: 1404, height: 1872, layers: [], elements: [] },
        appendix: { id: 'appendix', name: 'Appendix', width: 1404, height: 1872, layers: [], elements: [] },
      },
    },
    a4: {
      id: 'a4', name: 'A4',
      templates: {
        cover: { id: 'cover', name: 'Cover A4', width: 595, height: 842, layers: [], elements: [] },
        body: { id: 'body', name: 'Body A4', width: 595, height: 842, layers: [], elements: [] },
      },
    },
  },
};

describe('generator visual preview descriptors', () => {
  it('uses first page-order node, counts all uses, and adds unused synthetic nodes without mutation', () => {
    const before = structuredClone(project);
    let sequence = 0;
    const variants = buildVariantPreviews(project, () => `synthetic-${++sequence}`);
    const remarkable = variants[0];
    expect(remarkable.variantName).toBe('reMarkable');
    expect(remarkable.templates.map(item => item.templateId)).toEqual(['cover', 'body', 'appendix']);
    expect(remarkable.templates[1]).toMatchObject({ nodeId: 'chapter', nodeTitle: 'First chapter', usageCount: 2, unused: false });
    expect(remarkable.templates[2]).toMatchObject({ nodeId: 'synthetic-1', usageCount: 0, unused: true });
    expect(nodesForTemplatePreview(project.nodes, remarkable.templates[2])['synthetic-1']).toMatchObject({ type: 'appendix', parentId: null, children: [] });
    expect(project).toEqual(before);
  });

  it('keeps variants isolated and returns a bounded positive scale', () => {
    const variants = buildVariantPreviews(project, () => 'unused');
    expect(variants[1].templates.map(item => item.template.name)).toEqual(['Cover A4', 'Body A4']);
    expect(fitTemplateScale({ width: 1404, height: 1872 }, 220, 240)).toBeCloseTo(240 / 1872);
  });
});
```

Also test a supplied synthetic ID colliding with a real node; implementation must request another ID until it gets an unused own key.

- [ ] **Step 3: Run descriptor tests to verify RED**

Run:

```bash
npx vitest run tests/unit/generatorVisualPreview.test.ts tests/unit/computePageOrder.test.ts
```

Expected: FAIL because `generatorVisualPreview.ts` does not exist and `computePageOrder` still requires full `AppState` at compile time.

- [ ] **Step 4: Implement descriptor construction**

Create `services/generatorVisualPreview.ts` with these algorithms:

```ts
import type { AppNode, PageTemplate } from '../types';
import type { GeneratedProject, GeneratedProjectSummary } from './validateGeneratedProject';
import { computePageOrder } from './pdfService';

export const PREVIEW_BATCH_SIZE = 24;

export interface GeneratorSourceDraft {
  formatVersion: 1;
  templateScript: string;
  hierarchyScript: string;
}

export interface GeneratorPreviewPayload {
  project: GeneratedProject;
  summary: GeneratedProjectSummary;
  source: GeneratorSourceDraft;
}

export interface TemplatePreviewDescriptor {
  variantId: string;
  variantName: string;
  templateId: string;
  template: PageTemplate;
  nodeId: string;
  nodeTitle: string;
  usageCount: number;
  unused: boolean;
  syntheticNode?: AppNode;
}

export interface VariantPreviewDescriptor {
  variantId: string;
  variantName: string;
  templates: TemplatePreviewDescriptor[];
}

const defaultCreateId = () => `generator-preview-${crypto.randomUUID()}`;

export function buildVariantPreviews(project: GeneratedProject, createId = defaultCreateId): VariantPreviewDescriptor[] {
  const pageOrder = computePageOrder(project);
  const orderedNodes = pageOrder.map(id => project.nodes[id]).filter((node): node is AppNode => Boolean(node));
  const allNodes = Object.values(project.nodes);

  return Object.entries(project.variants).map(([variantId, variant]) => ({
    variantId,
    variantName: variant.name || variantId,
    templates: Object.entries(variant.templates).map(([templateId, template]) => {
      const matching = allNodes.filter(node => node.type === templateId);
      const representative = orderedNodes.find(node => node.type === templateId) ?? matching[0];
      if (representative) {
        return {
          variantId,
          variantName: variant.name || variantId,
          templateId,
          template,
          nodeId: representative.id,
          nodeTitle: representative.title || representative.id,
          usageCount: matching.length,
          unused: false,
        };
      }

      let syntheticId = createId();
      while (Object.hasOwn(project.nodes, syntheticId)) syntheticId = createId();
      const syntheticNode: AppNode = {
        id: syntheticId,
        parentId: null,
        type: templateId,
        title: template.name || templateId,
        data: {},
        children: [],
      };
      return {
        variantId,
        variantName: variant.name || variantId,
        templateId,
        template,
        nodeId: syntheticId,
        nodeTitle: syntheticNode.title,
        usageCount: 0,
        unused: true,
        syntheticNode,
      };
    }),
  }));
}

export function nodesForTemplatePreview(nodes: Record<string, AppNode>, descriptor: TemplatePreviewDescriptor) {
  return descriptor.syntheticNode ? { ...nodes, [descriptor.syntheticNode.id]: descriptor.syntheticNode } : nodes;
}

export function fitTemplateScale(template: Pick<PageTemplate, 'width' | 'height'>, maxWidth: number, maxHeight: number) {
  if (!(template.width > 0) || !(template.height > 0) || !(maxWidth > 0) || !(maxHeight > 0)) return 1;
  return Math.min(maxWidth / template.width, maxHeight / template.height);
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/unit/generatorVisualPreview.test.ts tests/unit/computePageOrder.test.ts tests/unit/validateGeneratedProject.test.ts
```

Expected: all tests PASS; validator page summaries remain unchanged.

- [ ] **Step 6: Commit Task 2**

```bash
git add services/generatorVisualPreview.ts services/pdfService.ts tests/unit/generatorVisualPreview.test.ts tests/unit/computePageOrder.test.ts
git commit -m "feat(generator): model template previews"
```

---

### Task 3: Add Standalone Visual Preview Dialog

**Files:**
- Create: `components/GeneratorVisualPreviewModal.tsx`
- Create: `tests/unit/GeneratorVisualPreviewModal.test.tsx`

**Interfaces:**
- Consumes: `GeneratorPreviewPayload`, `buildVariantPreviews`, `PREVIEW_BATCH_SIZE`, `ReadOnlyPagePreview`.
- Produces:

```ts
export interface GeneratorVisualPreviewModalProps {
  payload: GeneratorPreviewPayload;
  currentProjectName: string;
  onBack: () => void;
  onReplace: () => boolean;
  onCreateProject: (name: string) => boolean;
}
```

- [ ] **Step 1: Add failing visual-dialog component tests**

Mock `ReadOnlyPagePreview` in `tests/unit/GeneratorVisualPreviewModal.test.tsx` so tests target dialog behavior rather than canvas internals. Cover:

```tsx
vi.mock('../../components/canvas/ReadOnlyPagePreview', () => ({
  ReadOnlyPagePreview: ({ template, currentNodeId }: any) => (
    <div data-testid={`live-preview-${template.id}`} data-node-id={currentNodeId}>{template.name}</div>
  ),
}));
```

Required assertions:

1. Dialog header shows counts and active variant.
2. First variant tab is selected; ArrowRight selects the next tab.
3. Exactly 24 cards mount initially when 25 templates exist; **Load more** mounts the 25th.
4. Used card exposes page title/usage count; unused card exposes **Unused** and synthetic node ID.
5. Clicking a card opens lightbox; ArrowRight navigates; Escape closes lightbox and restores card focus.
6. Main Escape invokes `onBack` only.
7. **Replace Current Project** calls `onReplace`.
8. **Create New Project** opens naming dialog prefilled with `Current – Generated`; whitespace-only and 101-character names show inline errors; valid trimmed name calls `onCreateProject`.
9. A mocked preview component throwing for one template produces an error card while action buttons remain enabled.

- [ ] **Step 2: Run component test to verify RED**

Run:

```bash
npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx
```

Expected: FAIL because the visual dialog does not exist.

- [ ] **Step 3: Implement `GeneratorVisualPreviewModal`**

Create a focused component with these exact states:

```ts
const descriptors = useMemo(() => buildVariantPreviews(payload.project), [payload.project]);
const [selectedVariantId, setSelectedVariantId] = useState(payload.project.activeVariantId);
const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>(() => ({
  [payload.project.activeVariantId]: PREVIEW_BATCH_SIZE,
}));
const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
const [naming, setNaming] = useState(false);
const [name, setName] = useState(`${currentProjectName} – Generated`);
const [nameError, setNameError] = useState<string | null>(null);
```

Use `role="dialog"`, `aria-modal="true"`, `aria-labelledby="generator-preview-title"`, and the existing focus-trap/restoration pattern from `HierarchyGeneratorModal`. Render variant tabs with:

```tsx
<div role="tablist" aria-label="Generated variants">
  {descriptors.map(variant => (
    <button
      key={variant.variantId}
      role="tab"
      aria-selected={selectedVariantId === variant.variantId}
      aria-controls={`generator-preview-panel-${variant.variantId}`}
      onClick={() => selectVariant(variant.variantId)}
      onKeyDown={handleVariantArrowKey}
    >
      {variant.variantName}
    </button>
  ))}
</div>
```

For each visible descriptor, compute `fitTemplateScale(template, 220, 240)`, call `nodesForTemplatePreview`, and render `ReadOnlyPagePreview` inside a keyboard-focusable card button. Wrap each live preview in a class error boundary that stores `error: Error | null` and renders `Could not render {template.name}` on failure.

Footer behavior:

```tsx
<button type="button" onClick={onBack}>Back to Scripts</button>
<button type="button" onClick={() => setNaming(true)}>Create New Project</button>
<button type="button" onClick={onReplace}>Replace Current Project</button>
```

Naming submit behavior:

```ts
const submitName = () => {
  const trimmed = name.trim();
  if (!trimmed) return setNameError('Project name is required.');
  if (trimmed.length > 100) return setNameError('Project name must be 100 characters or fewer.');
  if (onCreateProject(trimmed)) return;
  setNameError('Could not create project. Try again.');
};
```

Lightbox must use the same `ReadOnlyPagePreview`, derive a fit scale from the current viewport, support previous/next, and keep its Escape handling separate from the parent dialog.

- [ ] **Step 4: Run standalone visual-dialog tests**

Run:

```bash
npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/ReadOnlyPagePreview.test.tsx tests/unit/generatorVisualPreview.test.ts
```

Expected: all tests PASS; dialog behavior is independently usable through its callback contract.

- [ ] **Step 5: Commit Task 3**

```bash
git add components/GeneratorVisualPreviewModal.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx
git commit -m "feat(generator): add visual preview dialog"
```

---

### Task 4: Integrate Visual Preview and Create Separate Local Projects

**Files:**
- Create: `services/generatedProjectState.ts`
- Create: `tests/unit/generatedProjectState.test.ts`
- Modify: `components/HierarchyGeneratorModal.tsx:2-21,2016-2171,2322-2378`
- Modify: `tests/unit/HierarchyGeneratorModal.test.tsx`
- Modify: `components/ProjectEditor.tsx:25-40,922-953,1207-1213`
- Modify: `pages/EditorPage.tsx:20-26,205-225,300-306`
- Create: `tests/unit/EditorPageGeneratedProject.test.tsx`
- Modify: `tests/unit/GeneratorVisualPreviewModal.test.tsx`
- Modify: `tests/unit/ProjectEditor.generatorHistory.test.tsx`

**Interfaces:**
- Produces:

```ts
export function createGeneratedAppState(
  base: AppState,
  project: GeneratedProject,
  source: GeneratorSourceDraft,
  generatedAt: string,
): AppState;
```

- Adds `ProjectEditorProps`:

```ts
projectName: string;
onCreateGeneratedProject: (
  name: string,
  project: GeneratedProject,
  source: GeneratorSourceDraft,
) => boolean;
```

- Updates `HierarchyGeneratorModalProps` to:

```ts
interface HierarchyGeneratorModalProps {
  isOpen: boolean;
  projectName: string;
  savedGenerator?: GeneratorProvenance;
  onClose: () => void;
  onApplyGenerated: (project: GeneratedProject, source: GeneratorSourceDraft) => boolean;
  onCreateGeneratedProject: (name: string, project: GeneratedProject, source: GeneratorSourceDraft) => boolean;
}
```

- [ ] **Step 1: Add failing state-builder test**

Create `tests/unit/generatedProjectState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBlankProject } from '../../services/presets';
import { createGeneratedAppState } from '../../services/generatedProjectState';

it('builds a fresh generated app state without mutating base or generated project', () => {
  const base = createBlankProject();
  base.scale = 3;
  const generated = {
    schemaVersion: 9 as const,
    rootId: 'generated-root',
    activeVariantId: 'v1',
    nodes: { 'generated-root': { id: 'generated-root', parentId: null, type: 'page', title: 'Generated', data: {}, children: [] } },
    variants: { v1: { id: 'v1', name: 'Variant', templates: { page: { id: 'page', name: 'Page', width: 100, height: 200, layers: [], elements: [] } } } },
  };
  const source = { formatVersion: 1 as const, templateScript: ' return templates; ', hierarchyScript: ' return hierarchy; ' };
  const beforeBase = structuredClone(base);
  const beforeGenerated = structuredClone(generated);

  const state = createGeneratedAppState(base, generated, source, '2026-07-14T12:00:00.000Z');

  expect(state).toMatchObject({
    rootId: 'generated-root', activeVariantId: 'v1', schemaVersion: 9,
    selectedNodeId: 'generated-root', selectedNodeIds: ['generated-root'],
    selectedTemplateId: '', selectedTemplateIds: [], selectedElementIds: [],
    generator: { ...source, generatedAt: '2026-07-14T12:00:00.000Z' },
  });
  expect(state.scale).toBe(createBlankProject().scale);
  expect(base).toEqual(beforeBase);
  expect(generated).toEqual(beforeGenerated);
});
```

- [ ] **Step 2: Run state-builder test to verify RED**

Run:

```bash
npx vitest run tests/unit/generatedProjectState.test.ts
```

Expected: FAIL because `generatedProjectState.ts` does not exist.

- [ ] **Step 3: Implement fresh generated state builder**

Create `services/generatedProjectState.ts`:

```ts
import type { AppState } from '../types';
import { resolveActiveLayerId } from './layers';
import type { GeneratedProject } from './validateGeneratedProject';
import type { GeneratorSourceDraft } from './generatorVisualPreview';

export function createGeneratedAppState(
  base: AppState,
  project: GeneratedProject,
  source: GeneratorSourceDraft,
  generatedAt: string,
): AppState {
  const rootTemplateId = project.nodes[project.rootId]?.type;
  const rootTemplate = project.variants[project.activeVariantId]?.templates[rootTemplateId];
  return {
    ...structuredClone(base),
    nodes: structuredClone(project.nodes),
    rootId: project.rootId,
    variants: structuredClone(project.variants),
    activeVariantId: project.activeVariantId,
    schemaVersion: 9,
    generator: { ...source, generatedAt },
    selectedNodeId: project.rootId,
    selectedNodeIds: [project.rootId],
    selectedTemplateId: '',
    selectedTemplateIds: [],
    selectedElementIds: [],
    templatePreviewNodeId: project.rootId,
    activeLayerId: rootTemplate ? resolveActiveLayerId(rootTemplate) : '',
    clipboard: [],
    viewMode: 'hierarchy',
    showJsonModal: false,
  };
}
```

- [ ] **Step 4: Integrate immutable ready payload into Hierarchy Generator**

In `components/HierarchyGeneratorModal.tsx`:

1. Replace the local ready-state shape with `GeneratorPreviewPayload`:

```ts
type PreviewState =
  | { status: 'idle' }
  | { status: 'running' }
  | ({ status: 'ready' } & GeneratorPreviewPayload)
  | { status: 'error'; message: string };
```

2. Add `const [showVisualPreview, setShowVisualPreview] = useState(false);`.
3. Build source with `formatVersion: 1 as const`.
4. On successful validation, set ready state and immediately call `setShowVisualPreview(true)`.
5. Any draft edit, preset switch, reset, or close also calls `setShowVisualPreview(false)`.
6. When status is ready, toolbar action reads **View Preview** and only reopens the dialog; it does not call sandbox again:

```ts
const previewOrReopen = () => {
  if (previewState.status === 'ready') {
    setShowVisualPreview(true);
    return;
  }
  void previewGenerator();
};
```

7. Remove count-only ready banner at current lines 2364–2378.
8. Remove `onDetachSavedGenerator`, `detachSavedGenerator`, and all **Detach Saved Generator** buttons/copy.
9. Render `GeneratorVisualPreviewModal` when ready and visible. Ensure successful Create closes both dialogs:

```tsx
{previewState.status === 'ready' && showVisualPreview && (
  <GeneratorVisualPreviewModal
    payload={previewState}
    currentProjectName={projectName}
    onBack={() => setShowVisualPreview(false)}
    onReplace={applyPreview}
    onCreateProject={name => {
      const created = onCreateGeneratedProject(name, previewState.project, previewState.source);
      if (created) {
        setShowVisualPreview(false);
        onClose();
      }
      return created;
    }}
  />
)}
```

Make `applyPreview` return `boolean`; on success close visual preview and generator. Keep existing replacement confirmation text and abort behavior.

- [ ] **Step 5: Add failing Hierarchy Generator integration tests**

In `tests/unit/HierarchyGeneratorModal.test.tsx`:

- Mock `GeneratorVisualPreviewModal` with buttons forwarding `onBack`, `onReplace`, and `onCreateProject`.
- Replace count-banner assertions with `Generated Project Preview` dialog assertions.
- Assert Back preserves exact textarea values and leaves apply/create callbacks untouched.
- Assert **View Preview** reopens without another `runGeneratorSandbox` call.
- Assert source edit removes ready payload and restores **Preview** label.
- Assert successful Create receives exact immutable project/source and closes generator.
- Assert no element named **Detach Saved Generator** exists.

In `tests/unit/ProjectEditor.generatorHistory.test.tsx`, remove Detach checkpoint cases but retain Apply/Undo/Redo provenance assertions.

Run before production integration is complete:

```bash
npx vitest run tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx
```

Expected: FAIL on missing visual-preview integration, Create callback, and remaining Detach UI.

- [ ] **Step 6: Wire ProjectEditor callback**

In `components/ProjectEditor.tsx`:

- Add `projectName` and `onCreateGeneratedProject` props.
- Import `GeneratorSourceDraft`.
- Change `handleApplyGenerated` source type to `GeneratorSourceDraft` and set provenance with `{ ...source, generatedAt }`.
- Remove `handleDetachSavedGenerator`.
- Pass `projectName` and `onCreateGeneratedProject` into `HierarchyGeneratorModal`.

Do not call `saveToHistory` for creation because original editor state must remain unchanged.

- [ ] **Step 7: Add EditorPage creation integration tests**

Create `tests/unit/EditorPageGeneratedProject.test.tsx`. Mock `ProjectEditor` so the test can invoke its `onCreateGeneratedProject` prop with a fixed generated project/source. Seed local storage with an original project containing cloud linkage and distinctive state. Assert:

```ts
expect(originalAfter).toEqual(originalBefore);
expect(created.name).toBe('Separate Generated');
expect(created.cloud).toBeUndefined();
expect(created.initialState.generator).toEqual({
  formatVersion: 1,
  templateScript: 'template source',
  hierarchyScript: 'hierarchy source',
  generatedAt: expect.any(String),
});
expect(created.initialState.rootId).toBe('generated-root');
expect(localStorage.getItem('hype_active_project')).toBe(created.id);
```

Also assert duplicate names are accepted and two creations receive distinct IDs.

- [ ] **Step 8: Implement EditorPage creation**

Import `GeneratedProject`, `GeneratorSourceDraft`, and `createGeneratedAppState`. Add:

```ts
const handleCreateGeneratedProject = (
  sourceProjectId: string,
  name: string,
  generated: GeneratedProject,
  source: GeneratorSourceDraft,
) => {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return false;
  const newId = `proj_${crypto.randomUUID()}`;
  const newProject: Project = {
    id: newId,
    name: trimmed,
    initialState: createGeneratedAppState(createBlankProject(), generated, source, new Date().toISOString()),
    revision: 0,
  };
  setProjects(current => [...current, newProject]);
  setActiveProjectId(newId);
  trackEvent('project_created_from_generator', {
    sourceProjectId,
    nodeCount: Object.keys(generated.nodes).length,
  });
  return true;
};
```

Pass into each editor:

```tsx
<ProjectEditor
  projectId={project.id}
  projectName={project.name}
  initialState={project.initialState}
  isActive={project.id === activeProjectId}
  onNameChange={(name) => handleUpdateProjectName(project.id, name)}
  onStateChange={(state) => handleUpdateProjectState(project.id, state)}
  onCreateGeneratedProject={(name, generated, source) => (
    handleCreateGeneratedProject(project.id, name, generated, source)
  )}
/>
```

- [ ] **Step 9: Run integration and creation tests**

Run:

```bash
npx vitest run tests/unit/generatedProjectState.test.ts tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx
```

Expected: all tests PASS; original project snapshot, history, and cloud link remain unchanged.

- [ ] **Step 10: Commit Task 4**

```bash
git add services/generatedProjectState.ts components/HierarchyGeneratorModal.tsx components/ProjectEditor.tsx pages/EditorPage.tsx tests/unit/generatedProjectState.test.ts tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx
git commit -m "feat(generator): create projects from previews"
```

---

### Task 5: Documentation, Browser Workflow, and Full Verification

**Files:**
- Modify: `components/cloud/PublishModal.tsx:171-174`
- Modify: `components/HierarchyGeneratorModal.tsx:2360-2362` and help content
- Modify: `docs/6-advanced-features.md`
- Modify: `pages/DocsPage.tsx`
- Modify: `tests/unit/PublishModal.test.tsx`
- Modify: `tests/unit/HierarchyGeneratorModal.test.tsx`
- Modify: `tests/e2e/editor_advanced.spec.js`

**Interfaces:**
- Consumes completed visual preview/create/replace workflow.
- Produces final user copy and browser acceptance evidence.

- [ ] **Step 1: Add failing copy tests**

Update `tests/unit/PublishModal.test.tsx` to expect this warning for cloud heads with source:

> This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information.

Assert no warning or help text contains `Detach Saved Generator` or instructs users to remove source before publishing.

Update `tests/unit/HierarchyGeneratorModal.test.tsx` to require help text covering:

> Preview opens live canvas template previews. Back keeps your scripts, Create New Project preserves the original, and Replace Current Project creates one undo checkpoint.

- [ ] **Step 2: Run copy tests to verify RED**

Run:

```bash
npx vitest run tests/unit/PublishModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx
```

Expected: FAIL because current warning/help still references Detach and count-only preview behavior.

- [ ] **Step 3: Update user-facing copy and docs**

In `components/cloud/PublishModal.tsx`, shorten warning to the exact text above while preserving cloud-head inspection and conditional publish logic.

In Hierarchy Generator help and the retained-source banner:

- Explain live canvas previews.
- Explain Back/Create/Replace semantics.
- Keep inert opening, sandbox, public-source, and no-reverse-sync statements.
- Remove all Detach guidance.

In `docs/6-advanced-features.md` and `pages/DocsPage.tsx`, document:

1. Visual preview opens after validation.
2. Variant tabs and one representative page per template.
3. Unused template badges and batched loading.
4. Lightbox inspection.
5. Back/Create/Replace behavior.
6. Created projects retain source.
7. Publishing source makes it public after warning.

- [ ] **Step 4: Extend browser acceptance flow**

In `tests/e2e/editor_advanced.spec.js`, replace count-only preview assertions with this flow:

1. Open Hierarchy Generator and use a script producing two variants, at least two used templates, and one unused template.
2. Click **Preview**.
3. Assert `Generated Project Preview` dialog appears and current project canvas/state remains unchanged.
4. Assert active variant tab, used-template usage counts, and unused badge.
5. Click a thumbnail; assert lightbox; press ArrowRight; press Escape; assert focus returns.
6. Click **Back to Scripts**; assert exact scripts remain; click **View Preview**; assert sandbox request count did not increase using the existing request/test marker mechanism.
7. Click **Create New Project**, enter `Visual Preview Copy`, confirm, and assert a new active project tab appears with source and generated output while the original tab retains its old canvas/state/cloud link.
8. Return to original, rerun Preview, choose **Replace Current Project**, confirm, assert generated output, then Undo and assert original output/provenance returns.

Use role/name/test-id locators; do not select Tailwind classes.

- [ ] **Step 5: Run focused unit and Chromium browser suites**

Run:

```bash
npx vitest run tests/unit/ReadOnlyPagePreview.test.tsx tests/unit/generatorVisualPreview.test.ts tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/generatedProjectState.test.ts tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/PublishModal.test.tsx
npm run test:e2e -- tests/e2e/editor_advanced.spec.js --project=chromium
```

Expected: all focused unit and browser tests PASS. If local ports 3000/3001 remain occupied, run the same Playwright file through an isolated temporary config using unused client/API ports and an explicit SQLite path with `DATABASE_URL=""`; do not reuse or stop user processes.

- [ ] **Step 6: Run full verification**

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

- Full unit suite PASS.
- Production build PASS; existing chunk-size warning may remain.
- TypeScript diagnostics have zero branch-introduced delta; five documented pre-existing test diagnostics may remain.
- Chromium and Firefox suites PASS; existing explicitly browser-specific skips remain skips.
- WebKit may remain unrun if its executable is unavailable, but report that explicitly.
- Only intended files are tracked; `.superpowers/brainstorm/` and `scratch/` remain untouched.

- [ ] **Step 7: Commit Task 5**

```bash
git add components/cloud/PublishModal.tsx components/HierarchyGeneratorModal.tsx docs/6-advanced-features.md pages/DocsPage.tsx tests/unit/PublishModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/e2e/editor_advanced.spec.js
git commit -m "docs(generator): explain visual preview workflow"
```

---

## Final Acceptance Checklist

- [ ] Preview opens a centered live canvas thumbnail grid after sandbox validation.
- [ ] Counts appear in dialog header; count-only ready banner is gone.
- [ ] One representative card appears for every template in every variant.
- [ ] Unused templates use preview-only synthetic nodes and show **Unused**.
- [ ] Variant tabs, batches of 24, Load more, lightbox, and keyboard controls work.
- [ ] Back and View Preview do not rerun source or mutate project/drafts.
- [ ] Create New asks for name, retains exact source, opens separate local project, and preserves original/history/cloud linkage.
- [ ] Replace Current preserves existing confirmation and one-checkpoint Undo behavior.
- [ ] Detach controls/guidance are removed; publishing source still warns that scripts become public.
- [ ] Shared read-only page surface keeps editor Canvas behavior unchanged.
- [ ] Unit, build, TypeScript delta, and available browser suites are verified.
