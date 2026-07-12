# SVG Source Editing + Placeholder Insert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editable raw-SVG textarea in Element Properties for selected SVG elements (live, debounced apply), plus a toolbar dropdown replacing the Import-SVG button that offers both "Import SVG file…" and "Insert placeholder SVG".

**Architecture:** A new pure service module (`services/svgEditing.ts`) holds validation, the placeholder markup, and layer-aware element placement; a new focused component (`components/properties/SvgSourceSection.tsx`) owns the draft/debounce/error state and commits through the existing `onUpdate` element-update path (extended with a `saveHistory` pass-through so an edit burst costs one undo step); the toolbar's single SVG button becomes a small click-outside dropdown following the `AccountMenu` pattern.

**Tech Stack:** React 18 + TypeScript, vitest + @testing-library/react (jsdom), lucide-react icons, clsx. No server or schema changes.

**Spec:** `docs/superpowers/specs/2026-07-11-svg-source-editing-design.md`

## Global Constraints

- Debounce for live apply: **400 ms**.
- Invalid SVG must never be committed to `element.svgContent`; canvas keeps rendering last valid markup.
- Error copy, exactly: `Invalid SVG — canvas shows last valid version`.
- Size hint turns amber above **100,000 characters** (same threshold as the import warning in `ProjectEditor.tsx`). No hard cap.
- One `saveToHistory()` per edit burst (a burst = one focus session of the textarea), not per debounced commit.
- SVG Source section shows only when **exactly one** element is selected and it is `type === 'svg'`.
- Element `w`/`h` untouched by source edits.
- Placeholder inserts as a **100×100** element at **(20, 20)**, selected on insert, `tool: 'select'`, placed on the active layer with the layer's next zIndex — identical placement rules to import.
- Sanitization stays render-time only (`CanvasElement.tsx` DOMPurify); do NOT sanitize on store.
- Run unit tests with: `npx vitest run <file>` from the repo root.

---

### Task 1: `services/svgEditing.ts` — validation, placeholder, placement helper

**Files:**
- Create: `services/svgEditing.ts`
- Test: `tests/unit/svgEditing.test.ts`

**Interfaces:**
- Consumes: `resolveActiveLayerId(template, activeLayerId?)`, `nextZIndexInLayer(elements, layerId)` from `services/layers.ts`; `PageTemplate`, `TemplateElement` from `types.ts`.
- Produces (used by Tasks 2–3):
  - `validateSvgMarkup(text: string): { ok: true } | { ok: false; error: string }`
  - `PLACEHOLDER_SVG: string`
  - `createPlacedSvgElement(svgText: string, w: number, h: number, template: PageTemplate, activeLayerId?: string): TemplateElement`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/svgEditing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateSvgMarkup, createPlacedSvgElement, PLACEHOLDER_SVG } from '../../services/svgEditing';
import { PageTemplate, TemplateElement } from '../../types';

const existingElement: TemplateElement = {
    id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1,
    layerId: 'layer1', zIndex: 3,
};

const template: PageTemplate = {
    id: 'tpl1', name: 'Test', width: 400, height: 300,
    elements: [existingElement],
    layers: [
        { id: 'layer1', name: 'Layer 1', order: 0, visible: true, locked: false },
        { id: 'layer2', name: 'Layer 2', order: 1, visible: true, locked: false },
    ],
};

describe('validateSvgMarkup', () => {
    it('accepts well-formed SVG', () => {
        expect(validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>').ok).toBe(true);
    });

    it('rejects malformed XML', () => {
        const result = validateSvgMarkup('<svg><rect</svg>');
        expect(result.ok).toBe(false);
    });

    it('rejects markup whose root is not <svg>', () => {
        const result = validateSvgMarkup('<div>not svg</div>');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/root/i);
    });

    it('rejects empty or whitespace-only text', () => {
        expect(validateSvgMarkup('').ok).toBe(false);
        expect(validateSvgMarkup('   \n ').ok).toBe(false);
    });
});

describe('PLACEHOLDER_SVG', () => {
    it('is valid SVG with a viewBox', () => {
        expect(validateSvgMarkup(PLACEHOLDER_SVG).ok).toBe(true);
        expect(PLACEHOLDER_SVG).toContain('viewBox');
        expect(PLACEHOLDER_SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
});

describe('createPlacedSvgElement', () => {
    it('creates an svg element at (20,20) with the given size and markup', () => {
        const el = createPlacedSvgElement('<svg viewBox="0 0 1 1"/>', 120, 80, template, 'layer1');
        expect(el.type).toBe('svg');
        expect(el.x).toBe(20);
        expect(el.y).toBe(20);
        expect(el.w).toBe(120);
        expect(el.h).toBe(80);
        expect(el.rotation).toBe(0);
        expect(el.opacity).toBe(1);
        expect(el.svgContent).toBe('<svg viewBox="0 0 1 1"/>');
        expect(el.id).toMatch(/^el_/);
    });

    it('places on the requested active layer with next zIndex in that layer', () => {
        const el = createPlacedSvgElement('<svg viewBox="0 0 1 1"/>', 100, 100, template, 'layer1');
        expect(el.layerId).toBe('layer1');
        expect(el.zIndex).toBe(4); // existing element in layer1 has zIndex 3
    });

    it('falls back to the frontmost layer when activeLayerId is missing or unknown', () => {
        const el = createPlacedSvgElement('<svg viewBox="0 0 1 1"/>', 100, 100, template, 'nope');
        expect(el.layerId).toBe('layer2'); // order 1 = frontmost
        expect(el.zIndex).toBe(1); // no elements yet in layer2
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/svgEditing.test.ts`
Expected: FAIL — `Cannot find module '../../services/svgEditing'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `services/svgEditing.ts`:

```ts
import { PageTemplate, TemplateElement } from '../types';
import { resolveActiveLayerId, nextZIndexInLayer } from './layers';

export type SvgValidation = { ok: true } | { ok: false; error: string };

// Parse-check raw SVG markup. Storage stays unsanitized by design: DOMPurify
// runs at the single render site (CanvasElement), so validity — not safety —
// is what gates a commit here.
export function validateSvgMarkup(text: string): SvgValidation {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, error: 'SVG markup is empty' };
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
    if (doc.querySelector('parsererror')) {
        return { ok: false, error: 'Markup does not parse as SVG' };
    }
    if (doc.documentElement.nodeName.toLowerCase() !== 'svg') {
        return { ok: false, error: 'Root element must be <svg>' };
    }
    return { ok: true };
}

export const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" rx="8" fill="#4f46e5" />
</svg>`;

// Shared placement rules for every path that adds an svg element (file
// import, placeholder insert): active-layer resolution + next zIndex within
// that layer, so the two paths cannot drift apart.
export function createPlacedSvgElement(
    svgText: string,
    w: number,
    h: number,
    template: PageTemplate,
    activeLayerId?: string,
): TemplateElement {
    const layerId = resolveActiveLayerId(template, activeLayerId);
    return {
        id: `el_${Math.random().toString(36).substr(2, 8)}`,
        type: 'svg',
        x: 20,
        y: 20,
        w,
        h,
        rotation: 0,
        fill: '',
        stroke: '',
        strokeWidth: 0,
        opacity: 1,
        svgContent: svgText,
        layerId,
        zIndex: nextZIndexInLayer(template.elements, layerId),
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/svgEditing.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add services/svgEditing.ts tests/unit/svgEditing.test.ts
git commit -m "feat(svg): validation, placeholder markup, and shared placement helper"
```

---

### Task 2: `SvgSourceSection` — live raw-SVG editor in Element Properties

**Files:**
- Create: `components/properties/SvgSourceSection.tsx`
- Modify: `components/properties/SingleElementEditor.tsx` (props interface at line ~65; render before the `{/* Links / Interactions */}` block at line ~1158)
- Modify: `components/PropertiesPanel.tsx` (`handleUpdate` at line ~99)
- Test: `tests/unit/svgSourceSection.test.tsx`

**Interfaces:**
- Consumes: `validateSvgMarkup` from Task 1; `CollapsibleSection` from `components/CollapsibleSection.tsx`.
- Produces: `SvgSourceSection: React.FC<{ svgContent: string; onCommit: (svg: string, saveHistory: boolean) => void }>`. Also changes two existing signatures every later reader must know:
  - `SingleElementEditorProps.onUpdate` becomes `(updates: Partial<TemplateElement> | ((prev: TemplateElement) => Partial<TemplateElement>), saveHistory?: boolean) => void` (default `true` behavior unchanged for all existing callers).
  - `PropertiesPanel`'s `handleUpdate` gains the same optional second parameter and forwards it to `onUpdateElements(newElements, saveHistory)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/svgSourceSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { SvgSourceSection } from '../../components/properties/SvgSourceSection';

const VALID_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" fill="red"/></svg>';
const VALID_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="blue"/></svg>';
const INVALID = '<svg><rect</svg>';

describe('SvgSourceSection', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    const getTextarea = () => screen.getByTestId('svg-source-textarea') as HTMLTextAreaElement;

    it('shows the current svgContent in the textarea', () => {
        render(<SvgSourceSection svgContent={VALID_A} onCommit={vi.fn()} />);
        expect(getTextarea().value).toBe(VALID_A);
    });

    it('commits a valid edit after the 400ms debounce, with saveHistory=true on the first commit of a burst', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        expect(onCommit).not.toHaveBeenCalled(); // not before debounce
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(VALID_B, true);
    });

    it('passes saveHistory=false on subsequent commits within the same focus session', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.change(getTextarea(), { target: { value: VALID_A } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(onCommit).toHaveBeenNthCalledWith(1, VALID_B, true);
        expect(onCommit).toHaveBeenNthCalledWith(2, VALID_A, false);
    });

    it('resets the burst on blur: next focus session saves history again', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.blur(getTextarea());
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_A } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenNthCalledWith(2, VALID_A, true);
    });

    it('shows an error and does not commit invalid SVG', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: INVALID } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).not.toHaveBeenCalled();
        expect(screen.getByText('Invalid SVG — canvas shows last valid version')).toBeTruthy();
    });

    it('clears the error once the draft becomes valid again', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: INVALID } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText('Invalid SVG — canvas shows last valid version')).toBeNull();
        expect(onCommit).toHaveBeenCalledWith(VALID_B, true);
    });

    it('re-seeds the draft when svgContent changes externally (undo/redo/restore)', () => {
        const { rerender } = render(<SvgSourceSection svgContent={VALID_A} onCommit={vi.fn()} />);
        rerender(<SvgSourceSection svgContent={VALID_B} onCommit={vi.fn()} />);
        expect(getTextarea().value).toBe(VALID_B);
    });

    it('does not re-seed (or loop) from its own committed value', () => {
        const onCommit = vi.fn();
        const { rerender } = render(<SvgSourceSection svgContent={VALID_A} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        // Parent state updated with our own commit — textarea must keep the draft untouched
        rerender(<SvgSourceSection svgContent={VALID_B} onCommit={onCommit} />);
        expect(getTextarea().value).toBe(VALID_B);
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('shows a size hint in KB', () => {
        render(<SvgSourceSection svgContent={VALID_A} onCommit={vi.fn()} />);
        expect(screen.getByTestId('svg-source-size').textContent).toMatch(/KB/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/svgSourceSection.test.tsx`
Expected: FAIL — cannot resolve `components/properties/SvgSourceSection`.

- [ ] **Step 3: Implement `SvgSourceSection`**

Create `components/properties/SvgSourceSection.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { FileCode } from 'lucide-react';
import clsx from 'clsx';
import { CollapsibleSection } from '../CollapsibleSection';
import { validateSvgMarkup } from '../../services/svgEditing';

const DEBOUNCE_MS = 400;
const SIZE_WARN_CHARS = 100000; // mirrors the import warning threshold in ProjectEditor

interface SvgSourceSectionProps {
    svgContent: string;
    // saveHistory=true only on the first commit of an edit burst (one focus
    // session = one undo step, however many debounced commits it produces).
    onCommit: (svg: string, saveHistory: boolean) => void;
}

export const SvgSourceSection: React.FC<SvgSourceSectionProps> = ({ svgContent, onCommit }) => {
    const [expanded, setExpanded] = useState(true);
    const [draft, setDraft] = useState(svgContent);
    const [error, setError] = useState<string | null>(null);
    const lastCommittedRef = useRef(svgContent);
    const historySavedRef = useRef(false);
    const timerRef = useRef<number | null>(null);

    // Re-seed only on EXTERNAL svgContent changes (undo/redo/restore) — our own
    // commits update lastCommittedRef first, so they don't clobber the draft.
    useEffect(() => {
        if (svgContent !== lastCommittedRef.current) {
            lastCommittedRef.current = svgContent;
            setDraft(svgContent);
            setError(null);
        }
    }, [svgContent]);

    useEffect(() => () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    }, []);

    const handleChange = (text: string) => {
        setDraft(text);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            const result = validateSvgMarkup(text);
            if (!result.ok) {
                setError('Invalid SVG — canvas shows last valid version');
                return;
            }
            setError(null);
            if (text === lastCommittedRef.current) return;
            lastCommittedRef.current = text;
            onCommit(text, !historySavedRef.current);
            historySavedRef.current = true;
        }, DEBOUNCE_MS);
    };

    const sizeKb = (draft.length / 1024).toFixed(1);

    return (
        <CollapsibleSection
            title="SVG Source"
            icon={FileCode}
            testId="svg-source-section"
            expanded={expanded}
            onToggle={() => setExpanded(v => !v)}
        >
            <div className="px-4 pb-4 space-y-2">
                <textarea
                    data-testid="svg-source-textarea"
                    className="w-full border rounded px-2 py-1 text-[11px] font-mono resize-y bg-white"
                    rows={10}
                    spellCheck={false}
                    value={draft}
                    onFocus={() => { historySavedRef.current = false; }}
                    onBlur={() => { historySavedRef.current = false; }}
                    onChange={e => handleChange(e.target.value)}
                />
                {error && <div className="text-[11px] text-red-600">{error}</div>}
                <div
                    data-testid="svg-source-size"
                    className={clsx('text-[10px]', draft.length > SIZE_WARN_CHARS ? 'text-amber-600 font-semibold' : 'text-slate-400')}
                >
                    {sizeKb} KB{draft.length > SIZE_WARN_CHARS ? ' — large SVGs increase project file size' : ''}
                </div>
            </div>
        </CollapsibleSection>
    );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/svgSourceSection.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Wire into `SingleElementEditor` and `PropertiesPanel`**

In `components/properties/SingleElementEditor.tsx`:

1. Add the import at the top with the other property-component imports:

```tsx
import { SvgSourceSection } from './SvgSourceSection';
```

2. Change the `onUpdate` signature in `SingleElementEditorProps` (line ~67) from:

```tsx
    onUpdate: (updates: Partial<TemplateElement> | ((prev: TemplateElement) => Partial<TemplateElement>)) => void;
```

to:

```tsx
    onUpdate: (updates: Partial<TemplateElement> | ((prev: TemplateElement) => Partial<TemplateElement>), saveHistory?: boolean) => void;
```

3. Insert the section immediately BEFORE the `{/* Links / Interactions */}` comment (line ~1158):

```tsx
            {element.type === 'svg' && state.selectedElementIds.length === 1 && (
                <SvgSourceSection
                    svgContent={element.svgContent || ''}
                    onCommit={(svg, saveHistory) => onUpdate({ svgContent: svg }, saveHistory)}
                />
            )}
```

In `components/PropertiesPanel.tsx`, change `handleUpdate` (line ~99) to accept and forward the flag — the only changes are the parameter list and the `onUpdateElements` call:

```tsx
    const handleUpdate = useCallback((updates: Partial<TemplateElement> | ((prev: TemplateElement) => Partial<TemplateElement>), saveHistory: boolean = true) => {
        if (selectedElements.length > 0 && template) {
            // Apply updates to ALL selected elements
            const newElements = template.elements.map(el => {
                if (selectedElementIds.includes(el.id)) {
                    // Resolve updates if it's a function
                    const appliedUpdates = typeof updates === 'function' ? updates(el) : updates;

                    // Log for Z-Index debugging
                    if ('zIndex' in appliedUpdates) {
                        console.log(`DEBUG: Updating zIndex for ${el.id}. Prev: ${el.zIndex} (${typeof el.zIndex}). New: ${appliedUpdates.zIndex}`);
                    }

                    return { ...el, ...appliedUpdates };
                }
                return el;
            });
            onUpdateElements(newElements, saveHistory);
        }
    }, [onUpdateElements, selectedElements, template, selectedElementIds]);
```

(`handleUpdateTemplateElements` in `ProjectEditor.tsx` already accepts `shouldSaveHistory` — no change needed there. All existing `onUpdate(...)` calls omit the new argument and keep today's save-every-time behavior.)

- [ ] **Step 6: Run the full unit suite to catch signature fallout**

Run: `npx vitest run`
Expected: PASS — all pre-existing tests still green (the new parameter is optional with unchanged default).

- [ ] **Step 7: Commit**

```bash
git add components/properties/SvgSourceSection.tsx components/properties/SingleElementEditor.tsx components/PropertiesPanel.tsx tests/unit/svgSourceSection.test.tsx
git commit -m "feat(svg): live raw-SVG source editor in Element Properties"
```

---

### Task 3: Toolbar SVG dropdown + placeholder insert

**Files:**
- Modify: `components/EditorToolbar.tsx` (SVG button block at lines 175–193; props interface at lines 6–12)
- Modify: `components/ProjectEditor.tsx` (`handleImportSvg` at line ~692; `EditorToolbar` call site at line ~1192)
- Test: `tests/unit/editorToolbarSvgDropdown.test.tsx`

**Interfaces:**
- Consumes: `PLACEHOLDER_SVG`, `createPlacedSvgElement` from Task 1 (`services/svgEditing.ts`).
- Produces: `EditorToolbarProps.onInsertSvgPlaceholder?: () => void`; `ProjectEditor`-internal `insertSvgElement(svgText: string, w: number, h: number)` used by both import and placeholder paths.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/editorToolbarSvgDropdown.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorToolbar } from '../../components/EditorToolbar';
import { AppState } from '../../types';

// EditorToolbar only reads these fields; cast keeps the fixture honest about
// what the component actually consumes.
const state = {
    tool: 'select',
    selectedElementIds: [],
    selectedTemplateId: 'tpl1',
    activeVariantId: 'v1',
    variants: { v1: { id: 'v1', name: 'V', templates: {} } },
    viewMode: 'templates',
    templatePreviewNodeId: null,
    selectedNodeId: 'root',
    nodes: {},
    rootId: 'root',
    snapToGrid: false,
    showGrid: false,
    scale: 1,
} as unknown as AppState;

describe('EditorToolbar SVG dropdown', () => {
    it('opens a menu with both SVG actions', () => {
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        expect(screen.getByText('Import SVG file…')).toBeTruthy();
        expect(screen.getByText('Insert placeholder SVG')).toBeTruthy();
    });

    it('fires onInsertSvgPlaceholder and closes the menu', () => {
        const onInsert = vi.fn();
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={onInsert} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        fireEvent.click(screen.getByText('Insert placeholder SVG'));
        expect(onInsert).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Insert placeholder SVG')).toBeNull();
    });

    it('clicks the hidden file input for the import action', () => {
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        fireEvent.click(screen.getByText('Import SVG file…'));
        expect(clickSpy).toHaveBeenCalled();
        clickSpy.mockRestore();
    });

    it('closes on outside click', () => {
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} onInsertSvgPlaceholder={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByText('Insert placeholder SVG')).toBeNull();
    });

    it('omits the placeholder item when onInsertSvgPlaceholder is not provided', () => {
        render(<EditorToolbar state={state} setState={vi.fn()} onImportSvg={vi.fn()} />);
        fireEvent.click(screen.getByTitle('SVG Tools'));
        expect(screen.getByText('Import SVG file…')).toBeTruthy();
        expect(screen.queryByText('Insert placeholder SVG')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/editorToolbarSvgDropdown.test.tsx`
Expected: FAIL — `getByTitle('SVG Tools')` finds nothing (current button title is "Import SVG Image").

- [ ] **Step 3: Implement the dropdown in `EditorToolbar.tsx`**

1. Extend imports (line 1–2): add `useState`, `useEffect` to the React import and `ChevronDown` to the lucide import:

```tsx
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MousePointer2, Hand, Type, Square, Circle, Triangle, Minus, Grid3X3, Magnet, GripVertical, ZoomOut, ZoomIn, Wand2, Save, Eye, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, FileImage, ChevronDown } from 'lucide-react';
```

2. Add the prop to `EditorToolbarProps` and the component destructuring:

```tsx
    onInsertSvgPlaceholder?: () => void;
```

```tsx
export const EditorToolbar: React.FC<EditorToolbarProps> = ({ state, setState, onOpenScriptGen, onSavePreset, onImportSvg, onInsertSvgPlaceholder }) => {
```

3. Add menu state beside the existing `svgInputRef` (line ~21), with the same click-outside pattern as `AccountMenu.tsx`:

```tsx
    const [svgMenuOpen, setSvgMenuOpen] = useState(false);
    const svgMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (svgMenuRef.current && !svgMenuRef.current.contains(e.target as Node)) setSvgMenuOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, []);
```

4. Replace the whole `{onImportSvg && (...)}` block (lines 175–193) with:

```tsx
                {onImportSvg && (
                    <>
                        <div className="w-px bg-slate-200 mx-1"></div>
                        <div className="relative" ref={svgMenuRef}>
                            <button
                                onClick={() => setSvgMenuOpen(o => !o)}
                                title="SVG Tools"
                                className={clsx("p-1.5 rounded transition-all flex items-center gap-0.5", svgMenuOpen ? "bg-slate-100 text-slate-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100")}
                            >
                                <FileImage size={16} />
                                <ChevronDown size={10} />
                            </button>
                            {svgMenuOpen && (
                                <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded shadow-lg py-1 z-30">
                                    <button
                                        onClick={() => { setSvgMenuOpen(false); svgInputRef.current?.click(); }}
                                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                                    >
                                        Import SVG file…
                                    </button>
                                    {onInsertSvgPlaceholder && (
                                        <button
                                            onClick={() => { setSvgMenuOpen(false); onInsertSvgPlaceholder(); }}
                                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                                        >
                                            Insert placeholder SVG
                                        </button>
                                    )}
                                </div>
                            )}
                            <input
                                ref={svgInputRef}
                                type="file"
                                accept=".svg"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        onImportSvg(file);
                                        e.target.value = ''; // Reset so same file can be re-imported
                                    }
                                }}
                            />
                        </div>
                    </>
                )}
```

- [ ] **Step 4: Refactor `ProjectEditor.tsx` to share placement and add the placeholder handler**

1. Add to the existing `services/layers` import area (line ~22):

```tsx
import { PLACEHOLDER_SVG, createPlacedSvgElement } from '../services/svgEditing';
```

2. In `handleImportSvg` (line ~692), replace everything from `const newElement: TemplateElement = {` (line ~734) through the end of the `setState` call (line ~765) with a call to a new shared function, so the reader-onload body ends with:

```tsx
            insertSvgElement(svgText, finalW, finalH);
        };
        reader.readAsText(file);
    };
```

3. Directly below `handleImportSvg`, add the shared insert function and the placeholder handler:

```tsx
    // Shared tail of every svg-adding path (file import, placeholder insert):
    // one history entry, placement via createPlacedSvgElement, select the new
    // element, switch to the select tool.
    const insertSvgElement = (svgText: string, w: number, h: number) => {
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const tplId = prev.selectedTemplateId;
            const tpl = activeVariant.templates[tplId];
            if (!tpl) return prev;
            const placedElement = createPlacedSvgElement(svgText, w, h, tpl, prev.activeLayerId);
            const updatedTemplate = { ...tpl, elements: [...tpl.elements, placedElement] };
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [tplId]: updatedTemplate } };
            return {
                ...prev,
                variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant },
                selectedElementIds: [placedElement.id],
                tool: 'select',
            };
        });
    };

    const handleInsertSvgPlaceholder = () => {
        insertSvgElement(PLACEHOLDER_SVG, 100, 100);
    };
```

Note: the old inline code kept `resolveActiveLayerId`/`nextZIndexInLayer` imports alive; if `handleImportSvg` was their only user, remove them from the `services/layers` import — check with a search before deleting (they are used elsewhere, e.g. paste handling around lines 462–501, so most likely keep).

4. Pass the new prop at the `EditorToolbar` call site (line ~1192):

```tsx
                        onImportSvg={handleImportSvg}
                        onInsertSvgPlaceholder={handleInsertSvgPlaceholder}
```

- [ ] **Step 5: Run the new test and the full suite**

Run: `npx vitest run tests/unit/editorToolbarSvgDropdown.test.tsx`
Expected: PASS (5 tests).

Run: `npx vitest run`
Expected: PASS — no regressions (import flow behavior unchanged: same placement, same history, same selection).

- [ ] **Step 6: Commit**

```bash
git add components/EditorToolbar.tsx components/ProjectEditor.tsx tests/unit/editorToolbarSvgDropdown.test.tsx
git commit -m "feat(svg): toolbar dropdown with import and placeholder-insert actions"
```

---

### Task 4: Real-browser verification

**Files:** none created (throwaway drive, per house method). Fix anything found test-first before closing the task.

- [ ] **Step 1: Start the dev environment**

Run the app the way the repo's run/verify skill or `package.json` dev script dictates (`npm run dev` for the Vite client; server not required for this purely client-side feature).

- [ ] **Step 2: Drive the feature**

In a real browser (Playwright throwaway script or manual):

1. Open the editor, template view. Click the SVG toolbar button — dropdown shows both actions.
2. **Insert placeholder SVG** — a 100×100 indigo rounded square appears at (20,20), selected, on the active layer.
3. With it selected, Element Properties shows an expanded **SVG Source** section containing the placeholder markup.
4. Edit `fill="#4f46e5"` to `fill="#dc2626"` in the textarea — after ~400ms pause the canvas square turns red without further interaction.
5. Break the markup (delete a `>`), confirm: red error line "Invalid SVG — canvas shows last valid version", canvas unchanged.
6. Fix the markup, confirm error clears and canvas updates.
7. Press Ctrl+Z once — the whole edit burst reverts in one step (back to the pre-edit color, not one keystroke).
8. **Import SVG file…** from the dropdown still round-trips a real `.svg` file.
9. Select two elements at once (one svg + one other) — SVG Source section absent.

- [ ] **Step 3: Full suite + commit any fixes**

Run: `npx vitest run`
Expected: PASS.

If verification surfaced fixes, they were committed test-first during Step 2. Otherwise nothing to commit.

---

## Self-Review (completed)

- **Spec coverage:** SVG Source section (Task 2), live debounced apply + error handling + size hint (Task 2), burst-level undo (Task 2), toolbar dropdown with both actions (Task 3), placeholder markup + shared placement helper (Tasks 1, 3), unit tests per spec's list (Tasks 1–3), real-browser verification (Task 4). Out-of-scope items untouched.
- **Placeholder scan:** none — every code step carries the full code.
- **Type consistency:** `validateSvgMarkup`/`createPlacedSvgElement`/`PLACEHOLDER_SVG` names match across Tasks 1–3; `onUpdate`/`handleUpdate` optional `saveHistory` parameter consistent between Task 2's two call-site edits; `onInsertSvgPlaceholder` name matches between `EditorToolbarProps`, the test, and the `ProjectEditor` call site.
