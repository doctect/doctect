import { gotoEditor, newBlankProject, newPlannerProject, drawElement, ACTIVE_PANE, settle, canvasBox, switchToTemplatesMode, selectSidebarNode } from '../lib/app.js';

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

// LayersPanel.tsx's own root div (~line 114) carries a stable
// data-testid="layers-panel" -- crops the still to just the panel's own
// header/filter/rows instead of the full 1600x1000 viewport, so element-row
// text stays legible at the image's displayed size (same rationale as
// PROPERTIES_PANEL_SELECTOR above, which crops to a data attribute rather
// than a class for the same reason). Scoped to ACTIVE_PANE for the usual
// two-tabs-mounted reason (see TOOLBAR_SELECTOR above).
const LAYERS_PANEL_SELECTOR = `${ACTIVE_PANE} [data-testid="layers-panel"]`;

// Expands the Layers section in the right column. CollapsibleSection.tsx
// renders one real <button> per section (title="Layers", aria-expanded,
// holding a chevron + Layers icon + the literal text "Layers") with the
// onToggle handler directly on it -- PropertiesPanel.tsx mounts it via
// `layersSlot` (~line 327), right after Template Settings' own
// CollapsibleSection closes and right before the Element Properties <h3>,
// confirming the panel really does sit between those two exactly as the
// tutorial says.
//
// The brief's original guess -- `getByText('Layers', { exact: true
// }).last()`, unscoped -- predates this repo's ACTIVE_PANE convention and
// has two independent hazards here: (1) CollapsibleSection's wrapping <div
// data-testid="layers-section"> has no other content while collapsed, so
// its own full trimmed text is *also* exactly "Layers" -- a getByText query
// resolves both that div and the real button as separate matches, which is
// what the guess's trailing .last() was silently relying on to land on the
// (later, in document order) button rather than its non-interactive
// wrapper; and (2) with two tabs mounted (gotoEditor's seeded "Blank
// Project" plus newPlannerProject's second one), an unscoped .last() also
// depends on DOM order between the two panes' own "Layers" buttons, not on
// which pane is actually active on screen. getByRole('button', ...) only
// ever matches the real <button> (not its wrapper div), and scoping to
// ACTIVE_PANE removes the second hazard outright, so no positional .last()
// guess is needed at all.
async function expandLayersPanel(t) {
    await t.page.locator(ACTIVE_PANE).getByRole('button', { name: 'Layers', exact: true }).click();
    await settle(t.page, 500);
}

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
    { id: 'editor/layers-panel', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await expandLayersPanel(t);
        await t.snap(LAYERS_PANEL_SELECTOR);
    } },
    { id: 'editor/clip-layer-hide-lock', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await expandLayersPanel(t);
        // Real per-layer button titles from LayersPanel.tsx (~lines 171-178): "Toggle
        // visibility" and "Toggle lock", not the brief's placeholder guess ("Hide layer").
        // Grep-verified unique to this component in the whole app, so no scoping beyond
        // ACTIVE_PANE is strictly required -- but the planner preset (services/planner_preset.json)
        // defines no `layers` field of its own, so ensureTemplateLayers hands it exactly one
        // default layer on load; .first() is defensive only, in case that ever changes.
        const scope = t.page.locator(ACTIVE_PANE);
        t.beginClip();
        // Hide (canvas content visibly disappears), show again (reappears), then lock (the
        // panel's own icon flips Unlock -> Lock) -- demonstrates both halves of the tutorial's
        // "Hide and lock semantics" section without ending the clip on a blank canvas.
        await scope.locator('button[title="Toggle visibility"]').first().click();
        await settle(t.page, 700);
        await scope.locator('button[title="Toggle visibility"]').first().click();
        await settle(t.page, 700);
        await scope.locator('button[title="Toggle lock"]').first().click();
        await settle(t.page, 700);
    } },
    { id: 'editor/select-under-menu', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        // Three same-size rects, each offset by 2% of the canvas so the stack
        // stays visually tellable apart (staggered corners) despite sharing
        // the same default fill/stroke -- drawElement leaves the last one
        // (highest zIndex, per nextZIndexInLayer) selected and on top.
        for (const pad of [0, 0.02, 0.04]) {
            await drawElement(t, 'r', { x: 0.3 + pad, y: 0.3 + pad }, { x: 0.55 + pad, y: 0.5 + pad });
        }
        // drawElement leaves the rect tool ('r') active -- Canvas.tsx's
        // handleMouseDown checks for its six shape-tool names (step 2)
        // *before* the tool==='select' branch (step 3) that owns right-click
        // resolution, and handleContextMenu's own first line separately bails
        // with `if (tool !== 'select') return`. Without switching tools back
        // first, this right-click would fall into creation mode (creating
        // nothing, since a press-release with no drag is below
        // MIN_DRAG_THRESHOLD) and the context-menu handler would return
        // before ever building the stack -- no menu at all. Same fix the
        // existing clip-align-distribute shot already needs (and applies)
        // after its own back-to-back drawElement calls, for the same reason.
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        const c = await canvasBox(t.page);
        await t.page.mouse.click(c.x + c.width * 0.42, c.y + c.height * 0.42, { button: 'right' });
        await settle(t.page, 600);
        await t.snap();
    } },
    { id: 'editor/clip-click-cycle', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        for (const pad of [0, 0.02, 0.04]) {
            await drawElement(t, 'r', { x: 0.3 + pad, y: 0.3 + pad }, { x: 0.55 + pad, y: 0.5 + pad });
        }
        // Same tool-switch as editor/select-under-menu above, and for the
        // same reason: still on the rect tool after the drawElement loop, and
        // Canvas.tsx's click-cycle logic (the whole point of this clip) lives
        // in the tool==='select' branch of handleMouseDown/handleMouseUp.
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        t.beginClip();
        const c = await canvasBox(t.page);
        // The point (0.42, 0.42) sits inside all three rects. The last-drawn
        // rect is already selected when the clip starts, so this is never a
        // cold first click: each clean click (no drag) is already "inside"
        // the 3-member stack, so handleMouseUp's cycle steps the selection
        // one level down every time -- top -> middle -> bottom -> (wraps)
        // top -- across exactly these 3 clicks, visibly moving the selection
        // outline between the three distinct (offset) rects each time.
        for (let i = 0; i < 3; i++) {
            await t.page.mouse.click(c.x + c.width * 0.42, c.y + c.height * 0.42);
            await settle(t.page, 900);
        }
    } },
    { id: 'editor/node-data-fields', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);
        // Hierarchy mode auto-expands only the root on mount
        // (NodeItem.tsx: useState(depth < 1)) -- Quarter 1 (depth 1) and
        // January (depth 2) both start collapsed, so a day node (depth 3)
        // isn't in the DOM at all until both ancestors are expanded first,
        // one chevron click apiece. Same pattern getting-started.js's
        // planner-month-view shot already uses for Quarter 1 -> January;
        // this goes one level deeper, to a day node under January.
        // `div.mr-1` is NodeItem's own expand/collapse icon wrapper --
        // stopPropagation() on its onClick means clicking it toggles
        // `expanded` instead of selecting the row underneath it.
        const quarter1Row = t.page.locator(ACTIVE_PANE).locator('[data-node-id]', { hasText: 'Quarter 1' }).first();
        await quarter1Row.locator('div.mr-1').click();
        await settle(t.page, 400);
        // Only the "January" *month* row matches this text right now --
        // its own 31 day children aren't rendered yet since January itself
        // is still collapsed -- so this can't accidentally resolve to one
        // of them instead.
        const januaryRow = t.page.locator(ACTIVE_PANE).locator('[data-node-id]', { hasText: 'January' }).first();
        await januaryRow.locator('div.mr-1').click();
        await settle(t.page, 400);
        // selectSidebarNode (docs-capture/lib/app.js) clicks at a
        // depth-scaled offset from the row's own left edge rather than the
        // title span's pre-hover center, so it lands correctly even on this
        // depth-3 row (paddingLeft 44px + 28 = 72, already verified against
        // the live app per that helper's own HAZARD comment).
        // services/planner_preset.ts's day nodes are titled
        // "<Month> <day>, 2026" -- "January 1, 2026" is the very first one
        // in the preset (id d_71skztfco), with 13 real data fields.
        await selectSidebarNode(t, 'January 1, 2026');
        await t.snap(PROPERTIES_PANEL_SELECTOR);
    } },
    { id: 'editor/clip-preview-node-switch', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        // Day View (services/planner_preset.ts's "day" template) has two
        // independent text elements bound straight off whichever node is
        // previewing it: gen_d_title is "{{month_short}} {{day_num}}" and
        // gen_d_w_link is "{{day_short}}" -- so switching the preview node
        // changes two separate on-canvas strings at once ("Jan 01"/"Thu" ->
        // "Jan 02"/"Fri"), not just a single title.
        await t.page.locator(ACTIVE_PANE).getByText('Day View', { exact: true }).click();
        await settle(t.page, 500);
        // EditorToolbar.tsx's "Template Preview Node Selector" -- the only
        // <select> the toolbar itself renders (the font/pattern selects
        // live in the Properties panel, a different component) -- so no
        // extra disambiguation beyond the existing TOOLBAR_SELECTOR (itself
        // already ACTIVE_PANE-scoped) is needed.
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        // effectivePreviewNodeId (EditorToolbar.tsx ~lines 41-53) falls back
        // to nodesForCurrentTemplate[0] the first time a template is
        // selected -- land on January 1, 2026 explicitly rather than assume
        // it's already there, so the clip's starting frame is deterministic.
        // (Every day also has a reference twin under its Week node sharing
        // the exact same title and a copy of the same data -- see this
        // task's report -- but this real node is defined earlier in
        // services/planner_preset.ts, so it's still the first DOM <option>
        // matching this label either way.)
        await preview.selectOption({ label: 'January 1, 2026' });
        await settle(t.page, 500);
        t.beginClip();
        await preview.selectOption({ label: 'January 2, 2026' });
        await settle(t.page, 900);
    } },
];
