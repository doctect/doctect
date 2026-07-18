# Element Properties Auto-Width and Collapsible Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users convert selected text elements between fixed-size and auto-width modes, and make every Element Properties subsection collapsible with mounted-session disclosure retention.

**Architecture:** Extract Canvas preview-text resolution into a renderer-independent service and detached browser auto-width measurement into a focused DOM service, then drive one functional multi-element update from a native Typography checkbox. `PropertiesPanel` owns one controlled six-key disclosure map and passes it through `SingleElementEditor`; compact `CollapsibleSection` instances conditionally render bodies while `SvgSourceSection` itself stays mounted. Existing `autoWidth` persistence selects existing Canvas/PDF routes, so no schema or renderer-policy changes are needed.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 4, Testing Library, Playwright 1.57 Chromium, jsdom 24, Vite 6, lucide-react, existing Canvas/PDF text layout services.

## Global Constraints

- Source of truth is `docs/superpowers/specs/2026-07-18-element-properties-auto-width-collapse-design.md`; Package 1 only.
- Task 0 is the only work in the current checkout. After its docs commit, invoke `superpowers:using-git-worktrees` and execute Tasks 1-4 in `.worktrees/element-properties-auto-width-collapse` on branch `feature/element-properties-auto-width-collapse`.
- Existing untracked `.superpowers/brainstorm/` and `scratch/` remain untouched and unstaged.
- Schema stays exactly v10. Do not edit `types.ts`, `services/migration.ts`, schema changelog, database code, server validation, presets, generated-project normalization, or cloud codecs.
- Do not add Package 2 padding fields, controls, geometry, migration, Canvas behavior, or PDF behavior.
- Do not add dependencies or change `package.json` / `package-lock.json`.
- `Auto width` appears only when every selected editable element has `type === 'text'`; it is absent for grids, grid cells, shape captions, SVGs, and mixed-type selections.
- Fixed means `autoWidth: false`. Disabling auto-width preserves every stored field, including exact `w` and `h`.
- Enabling auto-width resolves each selected text element against the same effective preview node currently supplied to Canvas, then measures each element independently with its own typography.
- Successful fixed-to-auto conversion atomically applies `{ autoWidth: true, w, h }` per element.
- Failed measurement still applies `autoWidth: true`; positive finite prior dimensions survive, invalid width becomes `max(10, effectiveFontSize)`, and invalid height becomes `max(20, effectiveFontSize * 1.5)`.
- Missing `fontSize` resolves through existing Canvas default `DEFAULT_TEXT_FONT_SIZE === 12`; invalid/non-positive font size causes measurement failure and uses 12 only for safe fallback geometry.
- Mixed native checkbox state is `indeterminate === true` and `aria-checked="mixed"`; activating mixed enables all selected text, then activating checked disables all.
- One checkbox activation calls `onUpdateElements` exactly once with `saveHistory === true`, regardless of selection count.
- Existing overflow/wrap controls remain visible and immediately follow `autoWidth`: enabled for fixed text, disabled with existing exact explanation for auto-width text.
- Canvas fixed/native selection remains `element.type === 'text' && !element.autoWidth`; PDF fixed/native selection remains `el.type === 'text' && !el.autoWidth`.
- Shared preview resolution must preserve current Canvas resolved strings exactly, including data-binding precedence, ancestor/reference/referrer traversal, child-referrer arithmetic, unresolved-token empty strings, and literal strings when no active node exists.
- Browser measurement uses one hidden absolutely positioned `inline-block` probe, `white-space: pre`, zero padding, resolved Canvas font family, resolved font size, weight, style, line height `1.2`, and one space for empty text.
- Browser measurement returns `w = ceil(offsetWidth + 25)` and `h = max(20, ceil(offsetHeight))`; non-finite/non-positive final dimensions return `null`.
- Probe cleanup runs after success, attachment failure, and thrown metric access. Cleanup failure returns `null`.
- Inline `OverlayTextEditor` keeps measuring its live editor node and is not refactored.
- Section keys and exact titles are `grid` / `Grid Configuration`, `geometry` / `Geometry`, `appearance` / `Appearance`, `typography` / `Typography`, `interaction` / `Interaction`, and `svgSource` / `SVG Source`.
- All six keys initialize expanded, survive element selection changes while `PropertiesPanel` remains mounted, survive temporary conditional absence, and reset only when `PropertiesPanel` remounts.
- Section disclosure state remains React-only. It must not enter `AppState`, document snapshots, history, local storage, analytics, JSON, presets, generated projects, cloud state, or server calls.
- `SvgSourceSection` remains mounted while its body is collapsed so draft, validation error, debounce, focus-session, and commit state survive.
- Outer `Element Properties` heading/delete action, existing Template Settings disclosure, and existing Layers disclosure remain unchanged.
- Current TypeScript baseline, re-run 2026-07-18, is exit 2 with exactly five diagnostics: `tests/unit/changePassword.test.tsx(17,60) TS2556`; `tests/unit/loginEmailVerification.test.tsx(11,51) TS2556`; `tests/unit/loginEmailVerification.test.tsx(12,51) TS2556`; `tests/unit/loginEmailVerification.test.tsx(15,81) TS2556`; `tests/unit/svgEditing.test.ts(33,39) TS2339`. Tasks add zero diagnostics.
- Focused Playwright runs use configurable alternate ports `4317` and `4318`; never stop or reuse existing servers on `3000` / `3001`.

---

## File Structure

### New Production Files

- `services/previewText.ts`: sole Canvas-compatible element preview-string resolver; private traversal/arithmetic helpers remain in this file.
- `services/autoWidthText.ts`: sole detached-browser probe lifecycle and auto-width dimension calculation.

### New Test Files

- `tests/unit/previewText.test.ts`: literal, binding, traversal, child-referrer, fallback, and source non-mutation coverage.
- `tests/unit/autoWidthText.test.ts`: typography, line/empty behavior, dimensions, invalid metrics, thrown access, and cleanup coverage.
- `tests/unit/SingleElementEditorAutoWidth.test.tsx`: property-text auto-size delegation to shared resolution/measurement.
- `tests/unit/PropertiesPanelAutoWidth.test.tsx`: visibility, conversion, mixed state, active preview data, per-element functional updates, fallback, one history update, and immediate control state.
- `tests/unit/PropertiesPanelSections.test.tsx`: six-key default/toggle/retention/remount/no-document-update behavior.
- `tests/e2e/element_properties.spec.js`: focused real-Chromium conversion, route, history, disclosure, focus, selection, and reload regression.

### Modified Production Files

- `components/canvas/CanvasElement.tsx:25-203`: remove local preview resolver helpers and consume `resolveElementPreviewText`.
- `components/properties/SingleElementEditor.tsx:67-73,239-247,428-1300`: accept real-selection and controlled-disclosure props, use shared text/measurement services, render Auto width checkbox, and wrap five sections.
- `components/PropertiesPanel.tsx:13-27,33-60,98-124,292-308`: accept effective preview node, derive real text-only/mixed selection state, own six-key disclosure state, and pass controlled props.
- `components/ProjectEditor.tsx:1168-1194`: pass `state.nodes[effectivePreviewNodeId]` to `PropertiesPanel`, matching Canvas preview context in hierarchy and template modes.
- `components/CollapsibleSection.tsx`: add optional `variant: 'default' | 'compact'` without changing default caller behavior.
- `components/properties/SvgSourceSection.tsx:10-19,72-100`: replace local disclosure state with required controlled `expanded` / `onToggle` props and compact presentation.
- `playwright.config.cjs`: preserve default ports but allow `E2E_WEB_PORT` / `E2E_API_PORT` isolated-server overrides.

### Modified Tests

- `tests/unit/SingleElementEditorTextOverflow.test.tsx`: supply new required editor props and retain exact overflow behavior assertions.
- `tests/unit/CollapsibleSection.test.tsx`: add compact native-button/accessibility/focus coverage and default-variant regression.
- `tests/unit/svgSourceSection.test.tsx`: supply controlled disclosure props and verify invalid draft/error retention across collapse.
- `tests/unit/projectDocumentSnapshot.test.ts`: explicitly retain `autoWidth` through history snapshots while proving no disclosure field exists.

### Verification-Only Existing Regressions

- `tests/unit/canvasFixedTextLayout.test.tsx`: proves `autoWidth` alone selects Canvas native versus shared fixed layout.
- `tests/unit/pdfFixedTextOverflow.test.ts`: proves `autoWidth` alone selects PDF native versus shared fixed layout.
- `tests/unit/textOverflowPersistence.test.ts`: proves existing v10 `autoWidth` documents and dormant overflow fields remain unchanged.
- `tests/unit/canvasElementCreationTextOverflow.test.tsx`: proves click-created and drag-created text defaults remain unchanged.

## Shared Interfaces

```ts
// services/previewText.ts
export function resolveElementPreviewText(
    element: Pick<TemplateElement, 'text' | 'dataBinding'>,
    node: AppNode | undefined,
    nodes: Record<string, AppNode>,
): string;

// services/autoWidthText.ts
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

// components/properties/SingleElementEditor.tsx
export type AutoWidthSelection = boolean | 'mixed';

export type ElementPropertySectionKey =
    | 'grid'
    | 'geometry'
    | 'appearance'
    | 'typography'
    | 'interaction'
    | 'svgSource';

export type ElementPropertySectionState = Record<ElementPropertySectionKey, boolean>;

// Added SingleElementEditorProps fields
selectionIsTextOnly: boolean;
autoWidthSelection: AutoWidthSelection;
sectionExpanded: ElementPropertySectionState;
onToggleSection: (section: ElementPropertySectionKey) => void;

// Added PropertiesPanelProps field
activePreviewNode?: AppNode;

// Added SvgSourceSectionProps fields
expanded: boolean;
onToggle: () => void;

// Added CollapsibleSectionProps field
variant?: 'default' | 'compact';
```

### Task 0: Approve Documentation and Enter Isolated Worktree

**Files:**
- Stage only: `docs/superpowers/specs/2026-07-18-element-properties-auto-width-collapse-design.md`
- Stage only: `docs/superpowers/plans/2026-07-18-element-properties-auto-width-collapse.md`
- Do not stage: `.superpowers/brainstorm/`
- Do not stage: `scratch/`

**Interfaces:**
- Consumes: approved Package 1 design and this executable plan.
- Produces: one docs-only base commit from which isolated implementation branch starts.

- [ ] **Step 1: Verify docs-only preparation scope**

Run:

```bash
git status --short
```

Expected: design spec and plan are untracked; existing `.superpowers/brainstorm/` and `scratch/` entries remain untracked; no source or test path is staged.

- [ ] **Step 2: Stage exactly spec and plan**

Run:

```bash
git add -- docs/superpowers/specs/2026-07-18-element-properties-auto-width-collapse-design.md docs/superpowers/plans/2026-07-18-element-properties-auto-width-collapse.md
git diff --cached --check
git diff --cached --name-only
```

Expected: `git diff --cached --check` exits 0 with no output; name list contains exactly the two documentation paths above.

- [ ] **Step 3: Commit approved documentation**

```bash
git commit -m "docs: approve element properties package"
```

Expected: one conventional docs commit containing two files and no untracked scratch content.

- [ ] **Step 4: Create isolated implementation worktree**

Invoke `superpowers:using-git-worktrees`, choose project-local `.worktrees/element-properties-auto-width-collapse`, create branch `feature/element-properties-auto-width-collapse` from the docs commit, and run all remaining commands from that worktree root.

Run in the new worktree:

```bash
git status --short --branch
```

Expected: branch is `feature/element-properties-auto-width-collapse`; worktree is clean; main checkout's untracked `.superpowers/brainstorm/` and `scratch/` are absent and untouched.

### Task 1: Extract Preview Resolution and Auto-Width Measurement

**Files:**
- Create: `services/previewText.ts`
- Create: `services/autoWidthText.ts`
- Create: `tests/unit/previewText.test.ts`
- Create: `tests/unit/autoWidthText.test.ts`
- Create: `tests/unit/SingleElementEditorAutoWidth.test.tsx`
- Modify: `components/canvas/CanvasElement.tsx:25-203`
- Modify: `components/properties/SingleElementEditor.tsx:2-10,1008-1047`

**Interfaces:**
- Consumes: `TemplateElement`, `AppNode`, `resolveCanvasFontFamily`, `resolveTextFontSize`, and `DEFAULT_TEXT_FONT_SIZE`.
- Produces: `resolveElementPreviewText(...)` and `measureAutoWidthText(...)` with signatures in Shared Interfaces.
- Preserves: `OverlayTextEditor` live-node measurement and Canvas resolved-string output.

- [ ] **Step 1: Write failing preview resolver tests**

Create `tests/unit/previewText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveElementPreviewText } from '../../services/previewText';
import type { AppNode, TemplateElement } from '../../types';

const nodes: Record<string, AppNode> = {
    root: {
        id: 'root', parentId: null, type: 'page', title: 'Root title',
        data: { label: 'Root label', start: '0', count: '1' },
        children: ['target'],
    },
    target: {
        id: 'target', parentId: 'root', type: 'page', title: 'Target title',
        data: {}, children: [],
    },
    week: {
        id: 'week', parentId: null, type: 'week', title: 'Week title',
        data: { code: 'W42' }, children: ['target-ref'],
    },
    'target-ref': {
        id: 'target-ref', parentId: 'week', type: 'page', title: 'Target ref',
        data: {}, children: [], referenceId: 'target',
    },
};

const text = (overrides: Partial<TemplateElement> = {}) => ({
    text: '', dataBinding: undefined, ...overrides,
});

describe('resolveElementPreviewText', () => {
    it('preserves literal text and does not mutate its source', () => {
        const element = text({ text: 'literal text' });
        const before = { ...element };
        expect(resolveElementPreviewText(element, nodes.root, nodes)).toBe('literal text');
        expect(element).toEqual(before);
    });

    it('uses dataBinding instead of source text and resolves current-node data', () => {
        const element = text({ text: 'ignored source', dataBinding: 'label' });
        expect(resolveElementPreviewText(element, nodes.root, nodes)).toBe('Root label');
    });

    it('keeps current Canvas interpolation order and unresolved fallback', () => {
        expect(resolveElementPreviewText(
            text({ text: '{{title}} / {{label}} / {{missing}}' }),
            nodes.root,
            nodes,
        )).toBe('Root title / Root label / ');
        expect(resolveElementPreviewText(
            text({ text: '{{label}}' }),
            undefined,
            nodes,
        )).toBe('{{label}}');
    });

    it('resolves child-referrer arithmetic and selected parent fields', () => {
        expect(resolveElementPreviewText(
            text({ text: '{{child_referrer:start:count:week:title}} {{child_referrer:0:1::code}}' }),
            nodes.root,
            nodes,
        )).toBe('Week title W42');
    });
});
```

- [ ] **Step 2: Write failing measurement tests**

Create `tests/unit/autoWidthText.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureAutoWidthText } from '../../services/autoWidthText';

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('measureAutoWidthText', () => {
    it('applies Canvas typography and returns buffered dimensions without mutation', () => {
        const appended: HTMLElement[] = [];
        vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
            appended.push(node as HTMLElement);
            return HTMLElement.prototype.appendChild.call(document.body, node) as HTMLElement;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(41.2);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18.1);
        const element = {
            fontSize: 17, fontFamily: 'open-sans',
            fontWeight: 'bold' as const, fontStyle: 'italic' as const,
        };
        const before = { ...element };

        expect(measureAutoWidthText('Alpha', element)).toEqual({ w: 67, h: 20 });
        expect(element).toEqual(before);
        expect(appended).toHaveLength(1);
        expect(appended[0].textContent).toBe('Alpha');
        expect(appended[0].style).toMatchObject({
            position: 'absolute', visibility: 'hidden', display: 'inline-block',
            whiteSpace: 'pre', padding: '0px', fontSize: '17px',
            fontFamily: '"Open Sans", sans-serif', fontWeight: 'bold',
            fontStyle: 'italic', lineHeight: '1.2',
        });
        expect(document.body.contains(appended[0])).toBe(false);
    });

    it('retains explicit newlines and measures a single space for empty text', () => {
        const measuredText: string[] = [];
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
            measuredText.push(this.textContent || '');
            return (this.textContent || '').split('\n').reduce((max, line) => Math.max(max, line.length), 0) * 8;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
            return (this.textContent || '').split('\n').length * 14;
        });

        expect(measureAutoWidthText('a\nbb', { fontSize: 12 })).toEqual({ w: 41, h: 28 });
        expect(measureAutoWidthText('', { fontSize: 12 })).toEqual({ w: 33, h: 20 });
        expect(measuredText).toEqual(['a\nbb', ' ']);
    });

    it('removes the probe when metric access throws', () => {
        const before = document.body.childElementCount;
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => {
            throw new Error('layout unavailable');
        });
        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toBeNull();
        expect(document.body.childElementCount).toBe(before);
    });

    it('returns null when both cleanup mechanisms fail', () => {
        const probe = document.createElement('div');
        vi.spyOn(document, 'createElement').mockReturnValue(probe);
        vi.spyOn(probe, 'remove').mockImplementation(() => { throw new Error('remove failed'); });
        const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {
            throw new Error('fallback remove failed');
        });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(10);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(10);

        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toBeNull();
        removeChild.mockRestore();
        HTMLElement.prototype.remove.call(probe);
    });

    it.each([
        [Number.NaN, 10],
        [Number.POSITIVE_INFINITY, 10],
        [-30, 10],
        [10, Number.NaN],
    ])('rejects unsafe metrics width=%s height=%s', (width, height) => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toBeNull();
        expect(document.body.childElementCount).toBe(0);
    });

    it('returns null when DOM creation or attachment fails', () => {
        const createFailure = {
            body: document.body,
            createElement: () => { throw new Error('creation failed'); },
        } as unknown as Document;
        expect(measureAutoWidthText('Alpha', { fontSize: 12 }, createFailure)).toBeNull();

        const attachmentFailure = {
            createElement: document.createElement.bind(document),
            body: { appendChild: () => { throw new Error('attachment failed'); } },
        } as unknown as Document;
        expect(measureAutoWidthText('Alpha', { fontSize: 12 }, attachmentFailure)).toBeNull();
    });
});
```

- [ ] **Step 3: Write failing property-path delegation test**

Create `tests/unit/SingleElementEditorAutoWidth.test.tsx` with the same `AppState` shape used by `tests/unit/SingleElementEditorTextOverflow.test.tsx`, then add this complete test. Mock only measurement so preview resolution remains real:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SingleElementEditor } from '../../components/properties/SingleElementEditor';
import * as autoWidthText from '../../services/autoWidthText';
import type { AppNode, AppState, TemplateElement } from '../../types';

const activeNode: AppNode = {
    id: 'root', parentId: null, type: 'page', title: 'Root',
    data: { label: 'Bound preview' }, children: [],
};

const state = {
    nodes: { root: activeNode }, rootId: 'root', variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] },
        } },
    },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds: ['text'], scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 240, propertiesPanelWidth: 300, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [],
} as AppState;

const element: TemplateElement = {
    id: 'text', type: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'Literal',
    autoWidth: true, fontSize: 12,
};

afterEach(() => vi.restoreAllMocks());

describe('SingleElementEditor auto-width text edits', () => {
    it('resolves the next preview value and delegates dimensions to the shared helper', () => {
        const measure = vi.spyOn(autoWidthText, 'measureAutoWidthText')
            .mockReturnValue({ w: 151, h: 24 });
        const onUpdate = vi.fn();
        render(<SingleElementEditor
            element={element}
            onUpdate={onUpdate}
            onOpenNodeSelector={vi.fn()}
            state={state}
            activeNode={activeNode}
        />);

        fireEvent.change(screen.getByPlaceholderText('Text content or {{field}}'), {
            target: { value: '{{label}}' },
        });

        expect(measure).toHaveBeenCalledWith(
            'Bound preview',
            expect.objectContaining({ dataBinding: 'label', text: '', fontSize: 12 }),
        );
        expect(onUpdate).toHaveBeenCalledWith({
            text: '', dataBinding: 'label', w: 151, h: 24,
        });
    });
});
```

- [ ] **Step 4: Run RED tests**

Run:

```bash
npx vitest run tests/unit/previewText.test.ts tests/unit/autoWidthText.test.ts tests/unit/SingleElementEditorAutoWidth.test.tsx
```

Expected: FAIL because `services/previewText.ts` and `services/autoWidthText.ts` do not exist and property auto-size still owns an inline probe.

- [ ] **Step 5: Implement exact shared preview resolver**

Create `services/previewText.ts` by moving the current `evaluateMath`, `findChildReferrerNode`, and `getContextNodes` logic byte-for-byte from `CanvasElement.tsx`, then expose this exact resolver around those private helpers:

```ts
import type { AppNode, TemplateElement } from '../types';

const evaluateMath = (expr: string | number, data: Record<string, string>): number => {
    const str = String(expr).trim();
    if (!str) return 0;
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    const plusIdx = str.indexOf('+');
    if (plusIdx > -1) {
        return evaluateMath(str.substring(0, plusIdx).trim(), data)
            + evaluateMath(str.substring(plusIdx + 1).trim(), data);
    }
    const minusIdx = str.lastIndexOf('-');
    if (minusIdx > 0) {
        const previous = str.charAt(minusIdx - 1);
        if (previous !== '+' && previous !== '-') {
            return evaluateMath(str.substring(0, minusIdx).trim(), data)
                - evaluateMath(str.substring(minusIdx + 1).trim(), data);
        }
    }
    const value = data[str];
    return value !== undefined && value !== '' ? parseInt(value, 10) : 0;
};

const findChildReferrerNode = (
    currentNode: AppNode,
    allNodes: Record<string, AppNode>,
    startIndexValue: string | number,
    countValue: string | number,
    typeFilter?: string,
): AppNode | undefined => {
    const start = evaluateMath(startIndexValue, currentNode.data || {});
    const count = evaluateMath(countValue, currentNode.data || {});
    const direction = count >= 0 ? 1 : -1;
    for (let index = 0; index < Math.abs(count); index += 1) {
        const childIndex = start + index * direction;
        if (childIndex < 0) continue;
        const targetChildId = currentNode.children?.[childIndex];
        if (!targetChildId) continue;
        const referrers = Object.values(allNodes).filter(node => node.referenceId === targetChildId);
        let selected: AppNode | undefined;
        if (typeFilter?.trim()) {
            selected = referrers.find(referrer => {
                const parent = referrer.parentId ? allNodes[referrer.parentId] : undefined;
                return parent?.type === typeFilter;
            });
        }
        selected ??= referrers[0];
        if (selected?.parentId) return allNodes[selected.parentId];
    }
    return undefined;
};

const getContextNodes = (
    startNode: AppNode,
    nodes: Record<string, AppNode>,
): AppNode[] => {
    const result: AppNode[] = [];
    const seen = new Set<string>();
    const add = (node: AppNode | undefined) => {
        if (node && !seen.has(node.id)) {
            seen.add(node.id);
            result.push(node);
        }
    };
    let current: AppNode | undefined = startNode;
    while (current) {
        add(current);
        current = current.parentId ? nodes[current.parentId] : undefined;
    }
    if (startNode.referenceId && nodes[startNode.referenceId]) {
        current = nodes[startNode.referenceId];
        while (current) {
            add(current);
            current = current.parentId ? nodes[current.parentId] : undefined;
        }
    }
    const targets = [startNode.id];
    if (startNode.referenceId) targets.push(startNode.referenceId);
    Object.values(nodes)
        .filter(node => node.referenceId && targets.includes(node.referenceId))
        .forEach(referrer => {
            let ancestor: AppNode | undefined = referrer;
            while (ancestor) {
                add(ancestor);
                ancestor = ancestor.parentId ? nodes[ancestor.parentId] : undefined;
            }
        });
    startNode.children.forEach(childId => add(nodes[childId]));
    if (startNode.referenceId && nodes[startNode.referenceId]) {
        nodes[startNode.referenceId].children.forEach(childId => add(nodes[childId]));
    }
    return result;
};

export function resolveElementPreviewText(
    element: Pick<TemplateElement, 'text' | 'dataBinding'>,
    node: AppNode | undefined,
    nodes: Record<string, AppNode>,
): string {
    let content = element.dataBinding ? `{{${element.dataBinding}}}` : (element.text || '');
    if (!content.includes('{{') || !node) return content;
    content = content.replace(
        /\{\{child_referrer:([^:]+):([^:]+):([^:]*):([^}]+)\}\}/g,
        (_match, start, count, typeFilter, field) => {
            const parent = findChildReferrerNode(node, nodes, start, count, typeFilter);
            if (parent) {
                if (field === 'title') return parent.title;
                if (parent.data?.[field] !== undefined) return parent.data[field];
            }
            return '';
        },
    );
    const contextNodes = getContextNodes(node, nodes);
    return content.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
        const field = key.trim();
        for (const contextNode of contextNodes) {
            if (field === 'title') return contextNode.title;
            if (contextNode.data?.[field] !== undefined) return contextNode.data[field];
        }
        return '';
    });
}
```

- [ ] **Step 6: Implement exact browser measurement helper**

Create `services/autoWidthText.ts`:

```ts
import type { TemplateElement } from '../types';
import { resolveCanvasFontFamily } from './canvasTextLayout';
import { resolveTextFontSize } from './textVisibility';

export interface AutoWidthMeasurement {
    w: number;
    h: number;
}

export function measureAutoWidthText(
    text: string,
    element: Pick<TemplateElement,
        'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle'>,
    documentRef?: Document,
): AutoWidthMeasurement | null {
    const doc = documentRef ?? (typeof document === 'undefined' ? undefined : document);
    const fontSize = resolveTextFontSize(element.fontSize);
    if (!doc?.body || !Number.isFinite(fontSize) || fontSize <= 0) return null;

    let probe: HTMLElement | null = null;
    let result: AutoWidthMeasurement | null = null;
    let cleanupSafe = true;
    try {
        probe = doc.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.display = 'inline-block';
        probe.style.whiteSpace = 'pre';
        probe.style.padding = '0';
        probe.style.fontSize = `${fontSize}px`;
        probe.style.fontFamily = resolveCanvasFontFamily(element.fontFamily || 'helvetica');
        probe.style.fontWeight = element.fontWeight || 'normal';
        probe.style.fontStyle = element.fontStyle || 'normal';
        probe.style.lineHeight = '1.2';
        probe.textContent = text.length > 0 ? text : ' ';
        doc.body.appendChild(probe);

        const w = Math.ceil(probe.offsetWidth + 25);
        const h = Math.max(20, Math.ceil(probe.offsetHeight));
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
            result = { w, h };
        }
    } catch {
        result = null;
    } finally {
        if (probe) {
            try {
                probe.remove();
            } catch {
                try {
                    probe.parentNode?.removeChild(probe);
                } catch {
                    cleanupSafe = false;
                }
            }
            try {
                if (probe.parentNode) cleanupSafe = false;
            } catch {
                cleanupSafe = false;
            }
        }
    }
    return cleanupSafe ? result : null;
}
```

- [ ] **Step 7: Replace Canvas local resolution with shared resolution**

In `components/canvas/CanvasElement.tsx`, import:

```ts
import { resolveElementPreviewText } from '../../services/previewText';
```

Delete local `evaluateMath`, `findChildReferrerNode`, `getContextNodes`, and `resolveText` definitions. Replace current `resolvedElementText` assignment with:

```ts
const resolvedElementText = resolveElementPreviewText(element, contextNode, nodes);
```

Do not change fixed/native route conditions, font styles, `whiteSpace`, rendered DOM, or layout-session requests.

- [ ] **Step 8: Replace property inline probe with shared services**

In `SingleElementEditor.tsx`, import:

```ts
import { measureAutoWidthText } from '../../services/autoWidthText';
import { resolveElementPreviewText } from '../../services/previewText';
```

Replace lines 1017-1045 with this exact block; keep the existing `onUpdate(updates)` immediately after it:

```ts
if (element.type === 'text' && element.autoWidth) {
    const nextElement = { ...element, ...updates } as TemplateElement;
    const previewText = resolveElementPreviewText(nextElement, activeNode, state.nodes);
    const measurement = measureAutoWidthText(previewText, nextElement);
    if (measurement) Object.assign(updates, measurement);
}
```

- [ ] **Step 9: Run GREEN tests and renderer characterization tests**

Run:

```bash
npx vitest run tests/unit/previewText.test.ts tests/unit/autoWidthText.test.ts tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/canvasFixedTextLayout.test.tsx
```

Expected: all named files PASS; Canvas data binding still sends `RESOLVED TEXT` into fixed layout; native auto-width and shape-caption assertions remain unchanged.

- [ ] **Step 10: Commit shared services**

```bash
git add -- services/previewText.ts services/autoWidthText.ts components/canvas/CanvasElement.tsx components/properties/SingleElementEditor.tsx tests/unit/previewText.test.ts tests/unit/autoWidthText.test.ts tests/unit/SingleElementEditorAutoWidth.test.tsx
git diff --cached --check
git commit -m "refactor: share auto-width text measurement"
```

Expected: one refactor commit; no `OverlayTextEditor`, PDF, schema, migration, package, or persistence file included.

### Task 2: Add Text-Only Auto-Width Multi-Edit Toggle

**Files:**
- Create: `tests/unit/PropertiesPanelAutoWidth.test.tsx`
- Modify: `components/properties/SingleElementEditor.tsx:67-73,239-247,996-1189`
- Modify: `components/PropertiesPanel.tsx:13-24,33-60,292-308`
- Modify: `components/ProjectEditor.tsx:1168-1194`
- Modify: `tests/unit/SingleElementEditorAutoWidth.test.tsx`
- Modify: `tests/unit/SingleElementEditorTextOverflow.test.tsx:28-39`
- Modify: `tests/unit/projectDocumentSnapshot.test.ts:20-24,58-71`

**Interfaces:**
- Consumes: Task 1 `resolveElementPreviewText` and `measureAutoWidthText`.
- Produces: `selectionIsTextOnly`, `autoWidthSelection`, functional per-element updates, and `activePreviewNode` propagation.
- Produces no schema, renderer, history, storage, or server interface.

- [ ] **Step 1: Write failing integration tests**

Create `tests/unit/PropertiesPanelAutoWidth.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from '../../components/PropertiesPanel';
import type { AppNode, AppState, TemplateElement } from '../../types';

const activeNode: AppNode = {
    id: 'root', parentId: null, type: 'page', title: 'Root',
    data: { label: 'BOUND PREVIEW' }, children: [],
};

const text = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'text', x: 5, y: 7, w: 100, h: 40, rotation: 13,
    transformOrigin: { x: 0.25, y: 0.75 }, fill: '', stroke: '', strokeWidth: 0,
    opacity: 0.8, text: id, fontSize: 14, fontFamily: 'helvetica',
    textOverflow: 'clip', textWrap: true, ...overrides,
});

const stateFor = (elements: TemplateElement[], selectedElementIds: string[]): AppState => ({
    nodes: { root: activeNode }, rootId: 'root', variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements },
        } },
    },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds, scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 240, propertiesPanelWidth: 300, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [], schemaVersion: 10,
});

const callbacks = () => ({
    onUpdateElements: vi.fn(), onUpdateNode: vi.fn(), onDeleteElements: vi.fn(),
    onOpenNodeSelector: vi.fn(), onUpdateTemplate: vi.fn(),
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('PropertiesPanel Auto width', () => {
    it('disables auto-width without changing geometry or unrelated fields', () => {
        const element = text('auto', { autoWidth: true, w: 187.5, h: 32.25 });
        const props = callbacks();
        render(<PropertiesPanel state={stateFor([element], ['auto'])} activePreviewNode={activeNode} {...props} />);

        fireEvent.click(screen.getByLabelText('Auto width'));

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...element, autoWidth: false },
        ], true);
    });

    it('measures active-node preview text independently in one history update', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
            return (this.textContent || '').length * 10;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
        const literal = text('literal', { text: 'A', autoWidth: false, w: 300, h: 80 });
        const bound = text('bound', {
            text: 'ignored', dataBinding: 'label', autoWidth: false, w: 20, h: 10,
            fontFamily: 'open-sans', fontWeight: 'bold',
        });
        const props = callbacks();
        render(<PropertiesPanel
            state={stateFor([literal, bound], ['literal', 'bound'])}
            activePreviewNode={activeNode}
            {...props}
        />);

        fireEvent.click(screen.getByLabelText('Auto width'));

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...literal, autoWidth: true, w: 35, h: 20 },
            { ...bound, autoWidth: true, w: 155, h: 20 },
        ], true);
    });

    it('exposes native mixed state and one activation enables every text element', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(20);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(15);
        const enabled = text('enabled', { autoWidth: true });
        const disabled = text('disabled', { autoWidth: undefined });
        const props = callbacks();
        render(<PropertiesPanel
            state={stateFor([enabled, disabled], ['enabled', 'disabled'])}
            activePreviewNode={activeNode}
            {...props}
        />);
        const checkbox = screen.getByLabelText('Auto width') as HTMLInputElement;

        expect(checkbox.indeterminate).toBe(true);
        expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
        fireEvent.click(checkbox);

        expect(props.onUpdateElements).toHaveBeenCalledOnce();
        expect(props.onUpdateElements.mock.calls[0][0]).toEqual([
            { ...enabled, autoWidth: true, w: 45, h: 20 },
            { ...disabled, autoWidth: true, w: 45, h: 20 },
        ]);
        expect(props.onUpdateElements.mock.calls[0][1]).toBe(true);
    });

    it('enables mode after failures while preserving or repairing each prior box', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => {
            throw new Error('measurement unavailable');
        });
        const valid = text('valid', { autoWidth: false, w: 88, h: 33 });
        const invalid = text('invalid', { autoWidth: false, w: Number.NaN, h: 0, fontSize: 14 });
        const props = callbacks();
        render(<PropertiesPanel
            state={stateFor([valid, invalid], ['valid', 'invalid'])}
            activePreviewNode={activeNode}
            {...props}
        />);

        fireEvent.click(screen.getByLabelText('Auto width'));

        expect(props.onUpdateElements).toHaveBeenCalledWith([
            { ...valid, autoWidth: true, w: 88, h: 33 },
            { ...invalid, autoWidth: true, w: 14, h: 21 },
        ], true);
    });

    it('hides the toggle for grids, shape captions, SVG, and mixed types', () => {
        const rectangle = text('caption', { type: 'rect', text: 'caption' });
        const grid = text('grid', {
            type: 'grid', text: undefined,
            gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
        });
        const svg = text('svg', { type: 'svg', text: undefined, svgContent: '<svg></svg>' });
        const literal = text('literal');
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor([grid], ['grid'])} {...props} />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor([rectangle], ['caption'])} {...props} />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor([svg], ['svg'])} {...props} />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
        view.rerender(<PropertiesPanel
            state={stateFor([literal, rectangle], ['literal', 'caption'])}
            {...props}
        />);
        expect(screen.queryByLabelText('Auto width')).toBeNull();
    });

    it('immediately follows parent state for checkbox and overflow controls', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(20);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(15);
        const fixed = text('fixed', { autoWidth: false });
        const props = callbacks();
        const view = render(<PropertiesPanel
            state={stateFor([fixed], ['fixed'])}
            activePreviewNode={activeNode}
            {...props}
        />);
        fireEvent.click(screen.getByLabelText('Auto width'));
        const [updated] = props.onUpdateElements.mock.calls[0][0];
        view.rerender(<PropertiesPanel
            state={stateFor([updated], ['fixed'])}
            activePreviewNode={activeNode}
            {...props}
        />);

        expect(screen.getByLabelText('Auto width')).toBeChecked();
        expect(screen.getByLabelText('Overflow')).toBeDisabled();
        expect(screen.getByLabelText('Wrap')).toBeDisabled();
    });
});
```

- [ ] **Step 2: Add persistence characterization assertion**

In `tests/unit/projectDocumentSnapshot.test.ts`, add `autoWidth: false` to `fixed-text`, assert it in the snapshot object, mutate current `autoWidth` after snapshot, and assert the snapshot remains false. Also assert no disclosure data was introduced:

```ts
expect(snapshot.variants.original.templates.page.elements[0]).toMatchObject({
    autoWidth: false, textOverflow: 'shrink', textWrap: false,
});
expect(snapshot).not.toHaveProperty('elementPropertySections');
```

- [ ] **Step 3: Run RED integration tests**

Run:

```bash
npx vitest run tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/projectDocumentSnapshot.test.ts
```

Expected: new Auto width tests FAIL because no toggle or real-selection props exist; existing overflow and snapshot tests remain green.

- [ ] **Step 4: Derive real selection semantics in PropertiesPanel**

Add `activePreviewNode?: AppNode` to `PropertiesPanelProps` and destructuring. After `selectedElements`, derive:

```ts
const selectionIsTextOnly = selectedElements.length > 0
    && selectedElements.every(element => element.type === 'text');
const enabledAutoWidthCount = selectionIsTextOnly
    ? selectedElements.filter(element => !!element.autoWidth).length
    : 0;
const autoWidthSelection: boolean | 'mixed' = enabledAutoWidthCount === 0
    ? false
    : enabledAutoWidthCount === selectedElements.length
        ? true
        : 'mixed';
```

Pass these exact props to `SingleElementEditor`:

```tsx
selectionIsTextOnly={selectionIsTextOnly}
autoWidthSelection={autoWidthSelection}
activeNode={activePreviewNode}
```

Replace the old hierarchy-only `activeNode={state.viewMode === 'hierarchy' ? node : undefined}` line. Keep `node` for Node Properties.

- [ ] **Step 5: Pass the exact Canvas preview node from ProjectEditor**

Add one prop to the existing `PropertiesPanel` call:

```tsx
activePreviewNode={state.nodes[effectivePreviewNodeId]}
```

This must use `effectivePreviewNodeId`, not `selectedNodeId`, so template-mode `templatePreviewNodeId`, first matching node, and root fallback remain identical to Canvas.

- [ ] **Step 6: Implement functional conversion and mixed checkbox**

In `SingleElementEditor.tsx`, export `AutoWidthSelection`, add `selectionIsTextOnly` and `autoWidthSelection` to props/destructuring, and import:

```ts
import { DEFAULT_TEXT_FONT_SIZE, resolveTextFontSize } from '../../services/textVisibility';
```

Add hook/state synchronization beside `textOverflowControlId`:

```ts
const autoWidthCheckboxRef = React.useRef<HTMLInputElement>(null);
React.useEffect(() => {
    if (autoWidthCheckboxRef.current) {
        autoWidthCheckboxRef.current.indeterminate = autoWidthSelection === 'mixed';
    }
}, [autoWidthSelection]);
```

Add conversion before `return`:

```ts
const handleAutoWidthToggle = () => {
    const enable = autoWidthSelection !== true;
    onUpdate(previous => {
        if (!enable) return { autoWidth: false };
        const previewText = resolveElementPreviewText(previous, activeNode, state.nodes);
        const measurement = measureAutoWidthText(previewText, previous);
        if (measurement) return { autoWidth: true, ...measurement };

        const resolvedFontSize = resolveTextFontSize(previous.fontSize);
        const fontSize = Number.isFinite(resolvedFontSize) && resolvedFontSize > 0
            ? resolvedFontSize
            : DEFAULT_TEXT_FONT_SIZE;
        return {
            autoWidth: true,
            w: Number.isFinite(previous.w) && previous.w > 0
                ? previous.w
                : Math.max(10, fontSize),
            h: Number.isFinite(previous.h) && previous.h > 0
                ? previous.h
                : Math.max(20, fontSize * 1.5),
        };
    });
};
```

Render this at the start of Typography body, before text textarea, only for real text-only selection:

```tsx
{selectionIsTextOnly && (
    <div className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5">
        <input
            ref={autoWidthCheckboxRef}
            id={`${textOverflowControlId}-auto-width`}
            type="checkbox"
            checked={autoWidthSelection === true}
            aria-checked={autoWidthSelection === 'mixed' ? 'mixed' : autoWidthSelection}
            onChange={handleAutoWidthToggle}
        />
        <label
            htmlFor={`${textOverflowControlId}-auto-width`}
            className="text-xs text-slate-600"
        >
            Auto width
        </label>
    </div>
)}
```

- [ ] **Step 7: Update direct SingleElementEditor test callers**

In both `SingleElementEditorAutoWidth.test.tsx` and `SingleElementEditorTextOverflow.test.tsx`, add:

```tsx
selectionIsTextOnly={element.type === 'text'}
autoWidthSelection={element.autoWidth === true}
```

For future mixed direct tests, pass `autoWidthSelection="mixed"`; do not encode `Mixed` into `TemplateElement.autoWidth`.

- [ ] **Step 8: Run GREEN integration and route/persistence regressions**

Run:

```bash
npx vitest run tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/projectDocumentSnapshot.test.ts tests/unit/canvasFixedTextLayout.test.tsx tests/unit/pdfFixedTextOverflow.test.ts tests/unit/textOverflowPersistence.test.ts tests/unit/canvasElementCreationTextOverflow.test.tsx
```

Expected: all named files PASS; one panel action produces one `onUpdateElements(..., true)` call; Canvas and PDF route tests still select solely by `autoWidth`; v10 persistence and click/drag defaults remain unchanged.

- [ ] **Step 9: Commit toggle integration**

```bash
git add -- components/PropertiesPanel.tsx components/ProjectEditor.tsx components/properties/SingleElementEditor.tsx tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/projectDocumentSnapshot.test.ts
git diff --cached --check
git commit -m "feat: add text auto-width toggle"
```

Expected: one feature commit; no schema, migration, PDF, Canvas route, database, server, package, or padding file included.

### Task 3: Add Controlled Compact Collapsible Subsections

**Files:**
- Create: `tests/unit/PropertiesPanelSections.test.tsx`
- Modify: `components/CollapsibleSection.tsx`
- Modify: `components/PropertiesPanel.tsx:23-27,300-308`
- Modify: `components/properties/SingleElementEditor.tsx:67-73,428-1300`
- Modify: `components/properties/SvgSourceSection.tsx:1-19,72-100`
- Modify: `tests/unit/CollapsibleSection.test.tsx`
- Modify: `tests/unit/SingleElementEditorAutoWidth.test.tsx`
- Modify: `tests/unit/SingleElementEditorTextOverflow.test.tsx`
- Modify: `tests/unit/svgSourceSection.test.tsx`

**Interfaces:**
- Consumes: Task 2 real-selection props and existing controlled Template Settings/Layers pattern.
- Produces: `ElementPropertySectionKey`, `ElementPropertySectionState`, stable `onToggleSection(key)`, and compact `CollapsibleSection` variant.
- Preserves: mounted `SvgSourceSection` component state while only its children are conditionally absent.

- [ ] **Step 1: Write compact primitive RED tests**

Extend `tests/unit/CollapsibleSection.test.tsx` with:

```tsx
it('renders compact disclosure as a full-width native button with accessibility state', () => {
    const onToggle = vi.fn();
    const { getByRole, queryByTestId } = render(
        <CollapsibleSection
            title="Geometry"
            variant="compact"
            expanded={false}
            onToggle={onToggle}
            testId="geometry-section"
        >
            <div data-testid="geometry-content" />
        </CollapsibleSection>,
    );
    const button = getByRole('button', { name: 'Geometry' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveClass('w-full');
    expect(queryByTestId('geometry-content')).toBeNull();

    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(button).toHaveFocus();
});

it('keeps default presentation classes for Template Settings and Layers', () => {
    const { getByRole, getByTestId } = render(
        <CollapsibleSection
            title="Layers"
            expanded={true}
            onToggle={() => undefined}
            testId="layers-section"
        >
            <div />
        </CollapsibleSection>,
    );
    expect(getByTestId('layers-section')).toHaveClass('border-b', 'bg-slate-50');
    expect(getByRole('button', { name: 'Layers' })).toHaveClass('p-4', 'font-bold');
});
```

- [ ] **Step 2: Write panel controller RED tests**

Create `tests/unit/PropertiesPanelSections.test.tsx` with shared `stateFor` and callback builders from `PropertiesPanelAutoWidth.test.tsx`, plus these complete behaviors:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from '../../components/PropertiesPanel';
import type { AppState, TemplateElement } from '../../types';

const text: TemplateElement = {
    id: 'text', type: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'Text',
    autoWidth: false, fontSize: 12,
};
const grid: TemplateElement = {
    ...text, id: 'grid', type: 'grid', text: undefined,
    gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
};
const svg: TemplateElement = {
    ...text, id: 'svg', type: 'svg', text: undefined,
    svgContent: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

const stateFor = (selectedElementIds: string[]): AppState => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root', variants: { default: { id: 'default', name: 'Default', templates: {
        page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [text, grid, svg] },
    } } },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds, scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 240, propertiesPanelWidth: 300, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [], schemaVersion: 10,
});

const callbacks = () => ({
    onUpdateElements: vi.fn(), onUpdateNode: vi.fn(), onDeleteElements: vi.fn(),
    onOpenNodeSelector: vi.fn(), onUpdateTemplate: vi.fn(),
});

afterEach(() => vi.restoreAllMocks());

describe('PropertiesPanel element section disclosure', () => {
    it('starts every applicable section expanded and hides only the activated body', () => {
        const props = callbacks();
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        for (const title of ['Geometry', 'Appearance', 'Typography', 'Interaction']) {
            expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'true');
        }

        const geometry = screen.getByRole('button', { name: 'Geometry' });
        geometry.focus();
        fireEvent.click(geometry);
        expect(geometry).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('geometry-section-body')).toBeNull();
        expect(screen.getByTestId('appearance-section-body')).toBeVisible();
        expect(geometry).toHaveFocus();
        expect(props.onUpdateElements).not.toHaveBeenCalled();
        expect(props.onUpdateNode).not.toHaveBeenCalled();
        expect(props.onUpdateTemplate).not.toHaveBeenCalled();
        expect(props.onOpenNodeSelector).not.toHaveBeenCalled();
        expect(props.onDeleteElements).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
    });

    it('retains ordinary and conditional choices across selection changes', () => {
        const props = callbacks();
        const view = render(<PropertiesPanel state={stateFor(['grid'])} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Geometry' }));
        fireEvent.click(screen.getByRole('button', { name: 'Grid Configuration' }));

        view.rerender(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        expect(screen.getByRole('button', { name: 'Geometry' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: 'Grid Configuration' })).toBeNull();

        view.rerender(<PropertiesPanel state={stateFor(['grid'])} {...props} />);
        expect(screen.getByRole('button', { name: 'Grid Configuration' })).toHaveAttribute('aria-expanded', 'false');

        view.rerender(<PropertiesPanel state={stateFor(['svg'])} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));
        view.rerender(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        expect(screen.queryByRole('button', { name: 'SVG Source' })).toBeNull();
        view.rerender(<PropertiesPanel state={stateFor(['svg'])} {...props} />);
        expect(screen.getByRole('button', { name: 'SVG Source' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('resets all choices when PropertiesPanel remounts', () => {
        const props = callbacks();
        const first = render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
        expect(screen.getByRole('button', { name: 'Typography' })).toHaveAttribute('aria-expanded', 'false');
        first.unmount();

        render(<PropertiesPanel state={stateFor(['text'])} {...props} />);
        expect(screen.getByRole('button', { name: 'Typography' })).toHaveAttribute('aria-expanded', 'true');
    });
});
```

- [ ] **Step 3: Write controlled SVG state-retention RED test**

First update every existing `SvgSourceSection` render/rerender in `tests/unit/svgSourceSection.test.tsx` to pass `expanded={true}` and `onToggle={vi.fn()}`. Add:

```tsx
it('keeps invalid draft and validation error while its controlled body is collapsed', () => {
    const onCommit = vi.fn();
    const Controlled = () => {
        const [expanded, setExpanded] = React.useState(true);
        return <SvgSourceSection
            svgContent={VALID_A}
            onCommit={onCommit}
            expanded={expanded}
            onToggle={() => setExpanded(value => !value)}
        />;
    };
    render(<Controlled />);
    fireEvent.change(getTextarea(), { target: { value: INVALID } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('Invalid SVG — canvas shows last valid version')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));
    expect(screen.queryByTestId('svg-source-textarea')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));

    expect(getTextarea()).toHaveValue(INVALID);
    expect(screen.getByText('Invalid SVG — canvas shows last valid version')).toBeVisible();
    expect(onCommit).not.toHaveBeenCalled();
});
```

Add `import React from 'react';` to this test file.

- [ ] **Step 4: Run RED disclosure tests**

Run:

```bash
npx vitest run tests/unit/CollapsibleSection.test.tsx tests/unit/PropertiesPanelSections.test.tsx tests/unit/svgSourceSection.test.tsx
```

Expected: FAIL because compact variant, six controlled section props, and controlled SVG disclosure do not exist.

- [ ] **Step 5: Implement compact CollapsibleSection without changing default callers**

Replace `components/CollapsibleSection.tsx` with:

```tsx
import React from 'react';
import { ChevronRight, ChevronDown, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface CollapsibleSectionProps {
    title: string;
    icon?: LucideIcon;
    expanded: boolean;
    onToggle: () => void;
    testId?: string;
    variant?: 'default' | 'compact';
    children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title, icon: Icon, expanded, onToggle, testId, variant = 'default', children,
}) => {
    const compact = variant === 'compact';
    return (
        <div
            className={clsx(compact ? 'border-t border-slate-200 pt-3' : 'border-b bg-slate-50')}
            data-testid={testId}
        >
            <button
                type="button"
                onClick={onToggle}
                title={title}
                aria-expanded={expanded}
                className={clsx(
                    'w-full flex items-center text-slate-700 hover:bg-slate-100',
                    compact
                        ? 'gap-1.5 rounded py-1 text-xs font-semibold uppercase'
                        : 'gap-2 p-4 font-bold',
                )}
            >
                {expanded ? <ChevronDown size={compact ? 12 : 16} /> : <ChevronRight size={compact ? 12 : 16} />}
                {Icon && <Icon size={compact ? 12 : 16} />}
                {title}
            </button>
            {expanded && (
                <div
                    className={compact ? 'pt-2' : undefined}
                    data-testid={testId ? `${testId}-body` : undefined}
                >
                    {children}
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 6: Add six-key controller to PropertiesPanel**

Import section types from `SingleElementEditor`, then add:

```ts
const INITIAL_ELEMENT_PROPERTY_SECTIONS: ElementPropertySectionState = {
    grid: true,
    geometry: true,
    appearance: true,
    typography: true,
    interaction: true,
    svgSource: true,
};
```

Inside `PropertiesPanel`, beside `settingsExpanded`, add:

```ts
const [elementPropertySections, setElementPropertySections] = React.useState<ElementPropertySectionState>(
    () => ({ ...INITIAL_ELEMENT_PROPERTY_SECTIONS }),
);
const toggleElementPropertySection = useCallback((section: ElementPropertySectionKey) => {
    setElementPropertySections(current => ({
        ...current,
        [section]: !current[section],
    }));
}, []);
```

Pass:

```tsx
sectionExpanded={elementPropertySections}
onToggleSection={toggleElementPropertySection}
```

Do not add the map to `state`, callback dependencies tied to selection, or any persistence effect.

- [ ] **Step 7: Wrap five SingleElementEditor sections**

Export the exact section key/state types from `SingleElementEditor.tsx`, add controlled props, and import `CollapsibleSection`. Apply these exact wrappers while leaving each existing body control unchanged:

```tsx
<CollapsibleSection
    title="Grid Configuration"
    icon={Grid3X3}
    variant="compact"
    testId="grid-configuration-section"
    expanded={sectionExpanded.grid}
    onToggle={() => onToggleSection('grid')}
>
    <div className="space-y-2 bg-indigo-50 p-2 rounded border border-indigo-100">
```

Delete the old Grid Configuration `<label>` and close with `</div></CollapsibleSection>` at the current grid body end.

```tsx
<CollapsibleSection
    title="Geometry"
    variant="compact"
    testId="geometry-section"
    expanded={sectionExpanded.geometry}
    onToggle={() => onToggleSection('geometry')}
>
    <div className="grid grid-cols-4 gap-2">
```

Delete the old Geometry `<label>` and outer `<div>`; close the existing grid with `</div></CollapsibleSection>`.

```tsx
<CollapsibleSection
    title="Appearance"
    icon={Palette}
    variant="compact"
    testId="appearance-section"
    expanded={sectionExpanded.appearance}
    onToggle={() => onToggleSection('appearance')}
>
    <div className="space-y-3">
```

Delete the old Appearance heading and its `border-t pt-3`; close with `</div></CollapsibleSection>`.

```tsx
<CollapsibleSection
    title="Typography"
    icon={Type}
    variant="compact"
    testId="typography-section"
    expanded={sectionExpanded.typography}
    onToggle={() => onToggleSection('typography')}
>
    <div className="space-y-3">
```

Keep the existing Typography condition, Auto width checkbox, text editor, font controls, overflow/wrap controls, and align controls inside this body. Delete the old heading and `border-t pt-3`; close with `</div></CollapsibleSection>`.

```tsx
<CollapsibleSection
    title="Interaction"
    icon={MousePointer2}
    variant="compact"
    testId="interaction-section"
    expanded={sectionExpanded.interaction}
    onToggle={() => onToggleSection('interaction')}
>
    <div className="space-y-3">
```

Delete the old Interaction heading and `border-t pt-3`; close with `</div></CollapsibleSection>`.

Pass controlled SVG props without conditionally mounting the component on `expanded`:

```tsx
<SvgSourceSection
    svgContent={element.svgContent || ''}
    expanded={sectionExpanded.svgSource}
    onToggle={() => onToggleSection('svgSource')}
    onCommit={(svg, saveHistory) => onUpdate({ svgContent: svg }, saveHistory)}
/>
```

- [ ] **Step 8: Make SvgSourceSection controlled and mounted**

Remove local `expanded` state only. Keep `draft`, `error`, refs, effects, debounce, and commit logic unchanged. Make props required:

```ts
interface SvgSourceSectionProps {
    svgContent: string;
    expanded: boolean;
    onToggle: () => void;
    onCommit: (svg: string, saveHistory: boolean) => void;
}
```

Destructure all four props and change its `CollapsibleSection` call to:

```tsx
<CollapsibleSection
    title="SVG Source"
    icon={FileCode}
    testId="svg-source-section"
    variant="compact"
    expanded={expanded}
    onToggle={onToggle}
>
```

- [ ] **Step 9: Update direct editor test props**

In both direct `SingleElementEditor` test files, define and pass:

```ts
const sectionExpanded = {
    grid: true, geometry: true, appearance: true,
    typography: true, interaction: true, svgSource: true,
};
```

```tsx
sectionExpanded={sectionExpanded}
onToggleSection={vi.fn()}
```

- [ ] **Step 10: Run GREEN disclosure and existing disclosure regressions**

Run:

```bash
npx vitest run tests/unit/CollapsibleSection.test.tsx tests/unit/PropertiesPanelSections.test.tsx tests/unit/svgSourceSection.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/LayersPanel.test.tsx
```

Expected: all named files PASS; compact bodies unmount, controlled SVG draft/error survives, selection retention/remount reset works, and existing default Template Settings/Layers presentation remains green.

- [ ] **Step 11: Commit collapsible subsections**

```bash
git add -- components/CollapsibleSection.tsx components/PropertiesPanel.tsx components/properties/SingleElementEditor.tsx components/properties/SvgSourceSection.tsx tests/unit/CollapsibleSection.test.tsx tests/unit/PropertiesPanelSections.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/svgSourceSection.test.tsx
git diff --cached --check
git commit -m "feat: collapse element property sections"
```

Expected: one feature commit; no `AppState`, snapshot service, storage service, schema, renderer, server, package, or padding file included.

### Task 4: Verify Real Chromium, Full Suite, Build, Types, and Scope

**Files:**
- Create: `tests/e2e/element_properties.spec.js`
- Modify: `playwright.config.cjs:3-5,21-25,49-65`
- Verify only: all focused and full unit files named below
- Verify only: source scope from Tasks 1-3

**Interfaces:**
- Consumes: complete Package 1 implementation.
- Produces: isolated-port Chromium evidence and complete unit/build/type/scope evidence.
- Preserves: default Playwright ports when `E2E_WEB_PORT` / `E2E_API_PORT` are unset.

- [ ] **Step 1: Make Playwright ports configurable without reusing existing servers**

At top of `playwright.config.cjs`, add:

```js
const webPort = Number(process.env.E2E_WEB_PORT || 3000);
const apiPort = Number(process.env.E2E_API_PORT || 3001);
if (!Number.isInteger(webPort) || webPort <= 0 || !Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error('E2E_WEB_PORT and E2E_API_PORT must be positive integers');
}
const webOrigin = `http://localhost:${webPort}`;
const apiOrigin = `http://localhost:${apiPort}`;
process.env.E2E_API_BASE ||= apiOrigin;
```

Change `use.baseURL` to `webOrigin`. Replace `webServer` with:

```js
webServer: {
    command: `npx concurrently --kill-others-on-fail "vite --host 127.0.0.1 --port ${webPort} --strictPort" "node server/index.js"`,
    url: webOrigin,
    reuseExistingServer: false,
    env: {
        ...process.env,
        PORT: String(apiPort),
        RESEND_API_KEY: '',
        OWNER_EMAILS: e2eOwnerEmail,
        CLIENT_URL: webOrigin,
        BETTER_AUTH_URL: `${apiOrigin}/api/auth`,
        TRUSTED_ORIGINS: `${webOrigin},${apiOrigin}`,
        VITE_API_URL: `${apiOrigin}/api/auth`,
        VITE_API_BASE: apiOrigin,
    },
},
```

Update the existing comment to state that `reuseExistingServer` remains false and alternate env ports avoid disturbing existing `3000` / `3001` processes.

- [ ] **Step 2: Write focused Chromium test**

Create `tests/e2e/element_properties.spec.js`:

```js
import { test, expect } from '@playwright/test';

const fixture = {
    nodes: {
        root: {
            id: 'root', parentId: null, type: 'page', title: 'Auto Width Page',
            data: { label: 'BOUND PREVIEW VALUE IS LONG' }, children: [],
        },
    },
    rootId: 'root',
    variants: {
        default: {
            id: 'default', name: 'Default', templates: {
                page: {
                    id: 'page', name: 'Page', width: 595, height: 842,
                    layers: [{ id: 'base', name: 'Base', order: 0, visible: true, locked: false }],
                    elements: [
                        {
                            id: 'literal', type: 'text', layerId: 'base',
                            x: 30, y: 40, w: 180, h: 40, rotation: 0,
                            fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                            text: 'Short', dataBinding: '', autoWidth: false,
                            fontSize: 16, fontFamily: 'helvetica', fontWeight: 'normal', fontStyle: 'normal',
                            textColor: '#000000', textOverflow: 'clip', textWrap: true,
                        },
                        {
                            id: 'bound', type: 'text', layerId: 'base',
                            x: 30, y: 120, w: 90, h: 30, rotation: 0,
                            fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                            text: '', dataBinding: 'label', autoWidth: true,
                            fontSize: 16, fontFamily: 'helvetica', fontWeight: 'bold', fontStyle: 'normal',
                            textColor: '#000000', textOverflow: 'ellipsis', textWrap: false,
                        },
                        {
                            id: 'grid', type: 'grid', layerId: 'base',
                            x: 30, y: 210, w: 100, h: 42, rotation: 0,
                            fill: '', stroke: '#000000', strokeWidth: 1, opacity: 1,
                            fontSize: 12, textColor: '#000000', textOverflow: 'clip', textWrap: false,
                            gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
                        },
                        {
                            id: 'svg', type: 'svg', layerId: 'base',
                            x: 240, y: 210, w: 80, h: 80, rotation: 0,
                            fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                            svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
                        },
                    ],
                },
            },
        },
    },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds: ['literal', 'bound'], activeLayerId: 'base',
    templatePreviewNodeId: 'root', scale: 0.8, tool: 'select', showJsonModal: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    sidebarWidth: 288, propertiesPanelWidth: 340, snapToGrid: false, showGrid: false,
    clipboard: [], schemaVersion: 10,
};

const activePane = page => page.locator('[data-testid="project-pane"][data-active="true"]');
const canvasElement = (page, id) => activePane(page).locator(`[data-element-id="${id}"]`);

test.describe('Element Properties auto width and disclosure', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(projectState => {
            localStorage.setItem('hype_projects', JSON.stringify([
                { id: 'element-properties', name: 'Element Properties', initialState: projectState },
            ]));
            localStorage.setItem('hype_active_project', 'element-properties');
        }, fixture);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/app');
        await expect(activePane(page).getByTestId('editor-canvas')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
    });

    test('converts independently in one undo step and retains disclosure only for the mount', async ({ page }) => {
        const pane = activePane(page);
        const undo = pane.getByTitle('Undo (Ctrl+Z)');
        const autoWidth = pane.getByLabel('Auto width', { exact: true });
        await expect(autoWidth).toHaveAttribute('aria-checked', 'mixed');
        expect(await autoWidth.evaluate(input => input.indeterminate)).toBe(true);
        await expect(undo).toBeDisabled();

        const typography = pane.getByRole('button', { name: 'Typography', exact: true });
        await typography.click();
        await expect(typography).toHaveAttribute('aria-expanded', 'false');
        await expect(canvasElement(page, 'literal')).toContainText('Short');
        await expect(canvasElement(page, 'bound')).toContainText('BOUND PREVIEW VALUE IS LONG');
        await expect(undo).toBeDisabled();
        await typography.click();

        const geometry = pane.getByRole('button', { name: 'Geometry', exact: true });
        await geometry.focus();
        await page.keyboard.press('Enter');
        await expect(geometry).toHaveAttribute('aria-expanded', 'false');
        await expect(geometry).toBeFocused();
        await expect(undo).toBeDisabled();
        await expect(canvasElement(page, 'literal')).toContainText('Short');
        await expect(canvasElement(page, 'bound')).toContainText('BOUND PREVIEW VALUE IS LONG');

        await autoWidth.click();
        await expect(autoWidth).toBeChecked();
        await expect(autoWidth).toHaveAttribute('aria-checked', 'true');
        await expect(undo).toBeEnabled();
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(0);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(0);
        const widths = await Promise.all(['literal', 'bound'].map(id =>
            canvasElement(page, id).evaluate(node => Number.parseFloat(node.style.width)),
        ));
        expect(widths[0]).toBeGreaterThan(25);
        expect(widths[1]).toBeGreaterThan(widths[0]);

        await autoWidth.click();
        await expect(autoWidth).not.toBeChecked();
        await expect(autoWidth).toHaveAttribute('aria-checked', 'false');
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(1);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(1);
        const fixedWidths = await Promise.all(['literal', 'bound'].map(id =>
            canvasElement(page, id).evaluate(node => Number.parseFloat(node.style.width)),
        ));
        expect(fixedWidths).toEqual(widths);

        await undo.click();
        await expect(autoWidth).toBeChecked();
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(0);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(0);
        await expect(undo).toBeEnabled();
        await undo.click();
        await expect(autoWidth).toHaveAttribute('aria-checked', 'mixed');
        await expect(undo).toBeDisabled();
        await expect(canvasElement(page, 'literal')).toHaveCSS('width', '180px');
        await expect(canvasElement(page, 'bound')).toHaveCSS('width', '90px');
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(1);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(0);

        await canvasElement(page, 'grid').click();
        await expect(pane.getByRole('button', { name: 'Geometry', exact: true })).toHaveAttribute('aria-expanded', 'false');
        const gridSection = pane.getByRole('button', { name: 'Grid Configuration', exact: true });
        await expect(gridSection).toHaveAttribute('aria-expanded', 'true');
        await gridSection.click();
        await canvasElement(page, 'literal').click();
        await expect(pane.getByRole('button', { name: 'Grid Configuration', exact: true })).toHaveCount(0);
        await canvasElement(page, 'grid').click();
        await expect(pane.getByRole('button', { name: 'Grid Configuration', exact: true })).toHaveAttribute('aria-expanded', 'false');
        await expect(undo).toBeDisabled();

        await page.reload();
        await expect(activePane(page).getByRole('button', { name: 'Geometry', exact: true })).toHaveAttribute('aria-expanded', 'true');
    });
});
```

- [ ] **Step 3: Run focused Chromium on isolated ports**

Run:

```bash
E2E_WEB_PORT=4317 E2E_API_PORT=4318 npx playwright test tests/e2e/element_properties.spec.js --project=chromium
```

Expected: `1 passed`; Playwright starts and stops only its `4317` / `4318` servers; existing `3000` / `3001` processes remain untouched; no real email is sent.

- [ ] **Step 4: Run all focused unit/component regressions**

Run:

```bash
npx vitest run tests/unit/previewText.test.ts tests/unit/autoWidthText.test.ts tests/unit/PropertiesPanelAutoWidth.test.tsx tests/unit/PropertiesPanelSections.test.tsx tests/unit/SingleElementEditorAutoWidth.test.tsx tests/unit/SingleElementEditorTextOverflow.test.tsx tests/unit/CollapsibleSection.test.tsx tests/unit/svgSourceSection.test.tsx tests/unit/canvasFixedTextLayout.test.tsx tests/unit/pdfFixedTextOverflow.test.ts tests/unit/textOverflowPersistence.test.ts tests/unit/canvasElementCreationTextOverflow.test.tsx tests/unit/projectDocumentSnapshot.test.ts
```

Expected: every named file PASS with zero failed tests and zero unhandled errors.

- [ ] **Step 5: Run complete unit suite and production build**

Run:

```bash
npx vitest run
npm run build
```

Expected: full Vitest suite exits 0 with zero failed tests; Vite production build exits 0 and prints `✓ built` with no compile error.

- [ ] **Step 6: Verify exact TypeScript baseline**

Run:

```bash
npx tsc --noEmit --pretty false
```

Expected: exit 2 with exactly these existing diagnostics and no new path/line/code:

```text
tests/unit/changePassword.test.tsx(17,60): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(11,51): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(12,51): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/loginEmailVerification.test.tsx(15,81): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
tests/unit/svgEditing.test.ts(33,39): error TS2339: Property 'error' does not exist on type 'SvgValidation'.
  Property 'error' does not exist on type '{ ok: true; }'.
```

- [ ] **Step 7: Audit scope before final commit**

Focused browser/server tests may update the tracked local analytics fixture. Restore only that generated test artifact before checking feature scope:

```bash
git restore --source=HEAD -- server/analytics.db
```

Expected: only test-generated analytics rows are discarded; no Package 1 source, tests, docs, or unrelated untracked paths are touched.

Run:

```bash
git diff --check
git diff --exit-code HEAD~3..HEAD -- types.ts services/migration.ts server package.json package-lock.json
git status --short
```

Expected: first two commands exit 0 with no output. Status contains only Task 4's `playwright.config.cjs` and `tests/e2e/element_properties.spec.js`; prior Task 1-3 files are committed. No `dist/`, `playwright-report/`, `test-results/`, screenshot, PDF, `.superpowers/brainstorm/`, `scratch/`, schema, migration, server, package, or padding path appears.

- [ ] **Step 8: Commit browser coverage and isolated-port support**

```bash
git add -- playwright.config.cjs tests/e2e/element_properties.spec.js
git diff --cached --check
git commit -m "test: cover element property controls in chromium"
git status --short
```

Expected: fourth implementation commit after docs base, containing exactly Playwright config and focused e2e test; final status has no output.

Implementation is complete only when all four implementation commits exist after the docs commit, focused Chromium passes on alternate ports, full unit/build verification is green, TypeScript output has exactly the documented five-diagnostic baseline, and no Package 2/schema/server/unrelated path changed.
