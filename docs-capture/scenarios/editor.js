import { gotoEditor, newBlankProject, drawElement, ACTIVE_PANE, settle, canvasBox } from '../lib/app.js';

// EditorToolbar.tsx's own root div carries Tailwind's arbitrary-value class
// "min-h-[40px]" (py-1 bg-slate-50 border-b ... shadow-sm z-10) -- but so
// does a second, unrelated bar one level up in ProjectEditor.tsx (~line
// 1046: the Undo/Redo/JSON/Export row, "min-h-[40px] ... bg-white ...
// z-20"), and that one is FIRST in DOM order (it wraps the whole editor,
// EditorToolbar sits inside the flex row below it). The brief's guessed
// selector, unscoped, would silently crop that wrong bar instead --
// confirmed by reading both components' root className strings directly.
// "bg-slate-50" is the disambiguator: of the two "min-h-[40px]" elements in
// the whole codebase (grep-verified), only EditorToolbar's carries it.
// Bracket-escaped per CSS's own rule for a literal "[" / "]" in a class
// selector (same escaping Tailwind's own stylesheet uses; Playwright's
// locator resolves it via the browser's native querySelector).
//
// Also scoped to ACTIVE_PANE: gotoEditor's default "Blank Project" tab plus
// newBlankProject's second one means two panes -- and thus two full
// EditorToolbars -- are mounted at once by the time this snaps (see
// lib/app.js's ACTIVE_PANE comment for why an unscoped query can silently
// resolve into the backgrounded tab).
const TOOLBAR_SELECTOR = `${ACTIVE_PANE} div.min-h-\\[40px\\].bg-slate-50`;

// PropertiesPanel.tsx's own root div (~line 176) carries no "properties"
// class at all -- it's `className="flex flex-col h-full overflow-y-auto
// bg-white border-l"` -- and it's a plain <div>, not an <aside>. The brief's
// two guessed selectors (`[class*="properties"]`, `aside:last-of-type`)
// therefore match NOTHING: grep-verified, no element in the whole app has
// "properties" as a class substring, and ProjectEditor.tsx never renders an
// <aside> anywhere in the editor layout. The real, stable hook is a data
// attribute already on that exact div for an unrelated reason --
// `data-prevent-finish-edit="true"` (read by OverlayTextEditor.tsx's blur
// handler via .closest(), so a click inside the panel while editing text
// doesn't commit-and-close the in-progress edit) -- grep-verified as the
// only element in the codebase carrying it, so it's an incidental but exact
// 1:1 marker for the panel root.
// Scoped to ACTIVE_PANE for the same reason as TOOLBAR_SELECTOR: each of the
// two simultaneously-mounted tabs (gotoEditor's seeded "Blank Project" +
// newBlankProject's second one) renders its own full PropertiesPanel, so an
// unscoped query's implicit .first() can resolve into the backgrounded tab's
// panel instead of the one actually on screen.
const PROPERTIES_PANEL_SELECTOR = `${ACTIVE_PANE} [data-prevent-finish-edit="true"]`;

// Drives SingleElementEditor.tsx's Fill controls to apply a pattern fill to
// whichever single element is currently selected. Both <select>s are found
// by an option value unique to them in the whole app (grep-verified:
// value="pattern" appears only on the fill-type <select>, value="dots" only
// on the pattern-type <select> that appears once fill type is Pattern) --
// avoids depending on DOM position/index, which would silently break if the
// Appearance section's layout ever changes. patternType is one of
// 'lines-h' | 'lines-v' | 'dots' -- the three the dropdown actually offers
// (see the tutorial's own NOTE on the 4th, script-only 'lines-d').
//
// Also fills Gap/Weight explicitly (SmartInput label + its sibling input
// wrapper div, per SingleElementEditor.tsx ~lines 947-961 -- label and input
// are siblings, not label-wraps-input, so getByLabel can't resolve these).
// A freshly drawn rect never had patternSpacing/patternWeight set, so
// without this the fields render empty and show SmartInput's "Mixed"
// placeholder (its generic empty-value placeholder text, not an actual
// multi-selection) -- confirmed by reading the captured screenshot before
// this fix landed. 10/1 match patternStyle.ts's own fallback defaults, so
// the rendered pattern is pixel-identical; this only replaces a misleading
// "Mixed" in the panel with the real number already in effect.
async function setPatternFill(t, patternType) {
    const scope = t.page.locator(ACTIVE_PANE);
    await scope.locator('select:has(option[value="pattern"])').selectOption('pattern');
    await settle(t.page, 300);
    await scope.locator('select:has(option[value="dots"])').selectOption(patternType);
    await settle(t.page, 300);
    await scope.locator('label:text-is("Gap") + div input').fill('10');
    await scope.locator('label:text-is("Weight") + div input').fill('1');
    await settle(t.page, 200);
}

export const shots = [
    { id: 'editor/toolbar', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await t.snap(TOOLBAR_SELECTOR);
    } },
    { id: 'editor/clip-drag-create', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        t.beginClip();
        await drawElement(t, 'r', { x: 0.25, y: 0.25 }, { x: 0.6, y: 0.5 });
        await drawElement(t, 't', { x: 0.25, y: 0.55 }, { x: 0.6, y: 0.62 });
        await t.page.keyboard.type('Hello', { delay: 60 });
        await t.page.keyboard.press('Escape');
    } },
    { id: 'editor/selection-handles', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 });
        await t.snap();
    } },
    { id: 'editor/properties-panel-shape', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.55, y: 0.5 });
        await t.snap(PROPERTIES_PANEL_SELECTOR);
    } },
    { id: 'editor/pattern-fills', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await drawElement(t, 'r', { x: 0.1, y: 0.3 }, { x: 0.3, y: 0.55 });
        await setPatternFill(t, 'lines-h');
        await drawElement(t, 'r', { x: 0.38, y: 0.3 }, { x: 0.58, y: 0.55 });
        await setPatternFill(t, 'lines-v');
        await drawElement(t, 'r', { x: 0.66, y: 0.3 }, { x: 0.86, y: 0.55 });
        await setPatternFill(t, 'dots');
        await t.snap();
    } },
    { id: 'editor/clip-align-distribute', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await drawElement(t, 'r', { x: 0.15, y: 0.3 }, { x: 0.3, y: 0.45 });
        // Middle rect starts flush against the first (0 gap) rather than the
        // brief's original x:0.4-0.55 -- verified by computing both gaps from
        // the brief's own sketch coordinates: 0.4-0.3=0.10 on the left, and
        // 0.65-0.55=0.10 on the right, i.e. ALREADY equal. handleAlign's
        // dist-h (EditorToolbar.tsx ~line 103) keeps the first/last element
        // fixed and only moves the middle one(s) to equalize the gaps either
        // side of it -- with the brief's numbers there is nothing to
        // equalize, so Distribute Horizontally would be a mathematical
        // no-op and the clip would fail its own verification bar ("three
        // rects visibly ... distributing"). Starting the middle rect flush
        // (0 gap) against the first one instead gives a real, large
        // asymmetry (0.00 vs 0.20) for distribute to visibly resolve.
        await drawElement(t, 'r', { x: 0.3, y: 0.5 }, { x: 0.45, y: 0.65 });
        await drawElement(t, 'r', { x: 0.65, y: 0.35 }, { x: 0.8, y: 0.5 });
        // Marquee-select all three, then run Align Top + Distribute
        // Horizontally from the toolbar's alignment button group (only
        // rendered once 2+ elements are selected -- EditorToolbar.tsx
        // ~line 235).
        t.beginClip();
        const c = await canvasBox(t.page);
        await t.page.keyboard.press('v');
        await t.page.mouse.move(c.x + c.width * 0.1, c.y + c.height * 0.25);
        await t.page.mouse.down();
        await t.page.mouse.move(c.x + c.width * 0.85, c.y + c.height * 0.7, { steps: 15 });
        await t.page.mouse.up();
        await settle(t.page, 500);
        // Scoped to ACTIVE_PANE: EditorToolbar.tsx is mounted once per tab
        // (both currently open), and both copies carry buttons with these
        // exact same title attributes -- an unscoped page.click() risks the
        // backgrounded tab's button, same ACTIVE_PANE hazard as every other
        // toolbar interaction in this file.
        const toolbar = t.page.locator(ACTIVE_PANE);
        await toolbar.locator('button[title="Align Top"]').click();
        await settle(t.page, 700);
        await toolbar.locator('button[title="Distribute Horizontally"]').click();
        await settle(t.page, 700);
    } },
];
