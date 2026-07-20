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

// SingleElementEditor.tsx's grid Offset block (~lines 645-666) -- the
// "Offset (Skip items)" label plus both its sibling rows (the Static/Dynamic
// select + static number, and -- only rendered once Dynamic is picked -- the
// Field Name / +- adjustment row) -- is a single plain `<div>` with no class
// or test id of its own, so it can't be reached by a class/testid selector
// the way TOOLBAR_SELECTOR/PROPERTIES_PANEL_SELECTOR/LAYERS_PANEL_SELECTOR
// above are. Every ancestor div, all the way up to the panel root, also
// "has" this exact text as a descendant (grep-verified page-unique, so this
// isn't a false match) -- CSS alone can't express "the *closest* ancestor",
// only Playwright's own `>> xpath=..` chaining can, by re-scoping evaluation
// to the label's own parent rather than searching the whole subtree again.
// Scoped to ACTIVE_PANE first for the usual two-tabs-mounted reason (see
// TOOLBAR_SELECTOR above), even though in practice this label can only ever
// render for a *selected grid element* in Templates mode, never in the
// backgrounded tab's own default blank/unselected state.
const OFFSET_BLOCK_SELECTOR = `${ACTIVE_PANE} label:has-text("Offset (Skip items)") >> xpath=..`;

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
    { id: 'editor/grid-source-modal', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);
        // newPlannerProject lands in Hierarchy mode with the root ("2026
        // Planner") already selected and its Year View page showing --
        // documented behavior (getting-started/02's own "Explore the
        // hierarchy" section), not assumed. Year View's own two grid
        // elements (services/planner_preset.ts ~lines 38818-38862, "current"
        // source, dataSliceStart/Count 0/4 and 4/3 of the root's 7 children)
        // occupy roughly template-space x54-434,y200-465 on this 509x679
        // page; gen_year_bg is a full-bleed black rect underneath both. This
        // shot's own new grid is drawn well below that, in the otherwise
        // empty black lower third of the page, so it can't visually collide
        // with either existing grid.
        await drawElement(t, 'g', { x: 0.15, y: 0.72 }, { x: 0.5, y: 0.83 });
        const scope = t.page.locator(ACTIVE_PANE);
        // SingleElementEditor.tsx's Grid Configuration Source <select>
        // (~line 531) is the only <select> in the whole app with an
        // option value="specific" (grep-verified) -- same has(option[...])
        // anchor idiom this file's own setPatternFill helper above already
        // uses for value="pattern"/"dots", just a different option value.
        // Grid Configuration starts expanded (PropertiesPanel.tsx's
        // INITIAL_ELEMENT_PROPERTY_SECTIONS sets every section, including
        // "grid", to true), so no CollapsibleSection click is needed first.
        await scope.locator('select:has(option[value="specific"])').selectOption('specific');
        await settle(t.page, 400);
        // Switching Source to "specific" reveals a dashed button reading
        // "Select Page..." (SingleElementEditor.tsx ~line 538, unique exact
        // text -- the unrelated linkTarget==='specific_node' button under
        // Interaction reads "Select Target Page...", a different string, so
        // this can't collide with that even on a selection that also had a
        // link configured, which this one doesn't).
        await scope.getByText('Select Page...', { exact: true }).click();
        // NodeSelectorModal (ProjectEditor.tsx ~line 1231-1235) opens
        // titled "Select Source Node" for nodeSelectorMode==='grid_source'
        // (the create_reference ternary branch doesn't apply here), tree
        // rooted at state.rootId with only the root itself expanded by
        // default (NodeItem's `useState(depth < 1)`) -- so this still lands
        // showing "2026 Planner" open over its 7 real children (Quarter
        // 1-4, Weeks, Notes, To-Do Lists) collapsed, with no further clicks.
        // Full-page snap, not scoped to a selector: the modal is a fixed
        // inset-0 overlay with its own backdrop-blur, so the dimmed
        // editor/canvas behind it barely matters -- it's the modal itself
        // this shot is about.
        await settle(t.page, 600);
        await t.snap();
    } },
    { id: 'editor/clip-grid-cols', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Month View', { exact: true }).click();
        await settle(t.page, 500);
        // Land on January explicitly (same discipline as the
        // clip-preview-node-switch shot above) rather than assume it's
        // already the fallback nodesForCurrentTemplate[0] -- January has 31
        // real day children either way, which the math below depends on.
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'January' });
        await settle(t.page, 500);
        // Month View is dense (calendar grid, day-of-week letters, week
        // numbers, two note-pattern rects filling most of the bottom half --
        // services/planner_preset.ts ~lines 39586-39947); origin (40,470)
        // sits just below the existing calendar/week-label block (which ends
        // ~y466) and inside the note-pattern area (y476.5-668.8, decorative
        // hatching only, safe to overlap). Canvas.tsx's grid-creation
        // formula (tool==='grid' branch, ~line 1379) derives this new grid's
        // *per-cell* w/h from the drag box using a hardcoded 3-col/2-row
        // assumption regardless of what Cols is set to afterward:
        // cellW=(dragW-2*10)/3, cellH=(dragH-1*10)/2. This drag box
        // (110x50 template px) yields cellW=30, cellH=20.
        await drawElement(t, 'g', { x: 0.079, y: 0.692 }, { x: 0.295, y: 0.766 });
        const scope = t.page.locator(ACTIVE_PANE);
        // Display Template and Cols are both `<label>` + sibling `<input>`
        // inside the same wrapping <div> (SingleElementEditor.tsx ~lines
        // 524, 617-622) -- same idiom as this file's setPatternFill "Gap"/
        // "Weight" locators, one level shallower (direct siblings, not
        // label + sibling <div>). A bare field name with no "{{" gets
        // auto-wrapped by both renderers (CanvasElement.tsx, pdfService.ts):
        // `day_num` here shows each cell's own short day number instead of
        // the default {{title}} ("January 5, 2026"), which wouldn't fit
        // legibly in a 30px-wide cell.
        await scope.locator('label:text-is("Display Template") + input').fill('day_num');
        await settle(t.page, 400);
        const colsInput = scope.locator('label:text-is("Cols") + input');
        // Unrecorded setup: land on Cols=10 (4 rows of a 31-day month,
        // ~390x110 template px from this element's fixed top-left corner)
        // BEFORE beginClip() -- getElementBounds (components/canvas/
        // elementBounds.ts) computes a grid's full footprint as
        // `cols*cellW + gaps` wide by `ceil(children/cols)*cellH + gaps`
        // tall, growing only right and down from x/y, so this stays clear
        // of the calendar above and the page's own 679px bottom edge.
        await colsInput.fill('10');
        await settle(t.page, 500);
        t.beginClip();
        // A real settle here -- not just the pre-roll lib/capture.js's own
        // trim (clipStart minus 0.2s) provides -- turned out to matter:
        // empirically (extracted every frame of an early version of this
        // clip with anim_dump and diffed the Cols input's own value across
        // all of them), the whole setup chain above this point takes long
        // enough before beginClip() that the fast `-ss`-before-`-i` seek
        // landed at or after the Cols=6 change on every single frame --
        // "Cols=10" never showed up anywhere in the trimmed output, even
        // though it was genuinely on screen for the full 500ms right above.
        // Holding here, mid-recording, well past that seek imprecision,
        // guarantees several real frames of "Cols=10" survive the trim
        // before the change below fires.
        await settle(t.page, 800);
        // Cols 10 -> 6: same 31 cells, same cellW/cellH, now 6 rows instead
        // of 4 (~230x170 template px) -- a visibly different shape, still
        // safely inside the page (470+170=640 < 679).
        await colsInput.fill('6');
        await settle(t.page, 900);
    } },
    { id: 'editor/grid-table-styling', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Month View', { exact: true }).click();
        await settle(t.page, 500);
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        // June 1, 2026 is a real Monday (services/planner_preset.ts's own
        // June 1 node: "day_name": "Monday", "weekday_num": "1") -- the
        // calendar grid's offset (gridConfig.offsetField "weekday_num",
        // offsetAdjustment -1, gen_month_2 ~line 39587) resolves to
        // weekday_num + adjustment = 1 - 1 = 0, so June's first calendar row
        // has zero leading blank cells: all seven of row 0's cells are real
        // days, the cleanest possible Header Row demonstration. (Verified
        // by direct date arithmetic from Jan 1, 2026 = Thursday, given in
        // editor/data-binding's own table, and cross-checked directly
        // against the preset's June 1 node data.)
        await preview.selectOption({ label: 'June' });
        await settle(t.page, 500);
        // Select-mode, not whatever tool drawElement or a prior shot left
        // active (this shot never calls drawElement, but press('v')
        // defensively regardless, matching this file's own convention).
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        // Click inside the *existing* calendar grid (gen_month_2,
        // template-space roughly x44-462,y81-402 for a 30-day, zero-offset
        // month) rather than drawing a new one -- it's already there with
        // 30 real day cells, exactly the "ready-made grid" this tutorial's
        // "Choosing the source" section already pointed at. hitTestPoint
        // (services/hitTest.ts) checks a grid's *full* getElementBounds
        // footprint, not just its one-cell w/h, so any point inside that
        // rendered area resolves to this element. (0.5, 0.3) is well clear
        // of the day-of-week letter row above (y60-79) and the rotated
        // week-number column to the right (x447+).
        const c = await canvasBox(t.page);
        await t.page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.3);
        await settle(t.page, 400);
        const scope = t.page.locator(ACTIVE_PANE);
        // Header Row / First Column / Alternate Rows / Alternate Columns
        // each render as one outer box (SingleElementEditor.tsx ~lines
        // 725-815, all four sharing the exact className "mb-2 p-1.5
        // bg-white rounded border border-indigo-50") holding two SIBLING
        // rows: the toggle row (label + button, className "flex items-center
        // justify-between mb-1") and, once the toggle is on, a second,
        // conditionally-rendered swatch row (className "flex gap-1
        // items-center") holding the color input(s) and, for Header
        // Row/First Column only, a Bold button. Scoping to the outer
        // box via filter({hasText}) (there are 4 identical "p-1.5" boxes;
        // only one contains each toggle's own label text) and then to
        // "div.gap-1.items-center" specifically -- rather than the outer
        // box's own <button>, which would ambiguously match BOTH the
        // toggle button and the revealed Bold button -- gets exactly the
        // swatch row's own controls with no index-guessing.
        //
        // Toggling the switch alone stages the row/column but paints it in
        // the same colors as every other cell (headerRowFill etc. stay
        // undefined in gridConfig until a swatch is actually touched -- see
        // CanvasElement.tsx's `if (gc.headerRowFill) cellFill = ...`) --
        // so every toggle below is paired with at least one swatch fill,
        // never left as a no-op flip.
        const headerBox = scope.locator('div.p-1\\.5').filter({ hasText: 'Header Row' });
        await scope.locator('label:text-is("Header Row") + button').click();
        await settle(t.page, 300);
        const headerSwatches = headerBox.locator('div.gap-1.items-center');
        await headerSwatches.locator('input[type="color"]').nth(0).fill('#1d4ed8'); // fill
        await settle(t.page, 200);
        await headerSwatches.locator('input[type="color"]').nth(1).fill('#ffffff'); // text color
        await settle(t.page, 200);
        await headerSwatches.locator('button').click(); // Bold
        await settle(t.page, 300);
        const altRowsBox = scope.locator('div.p-1\\.5').filter({ hasText: 'Alternate Rows' });
        await scope.locator('label:text-is("Alternate Rows") + button').click();
        await settle(t.page, 300);
        await altRowsBox.locator('div.gap-1.items-center').locator('input[type="color"]').fill('#dbeafe');
        await settle(t.page, 500);
        await t.snap();
    } },
    { id: 'editor/grid-offset-config', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Month View', { exact: true }).click();
        await settle(t.page, 500);
        // January explicitly (same discipline as this file's other Month
        // View shots) -- 31 real day children, weekday_num 4 on the 1st,
        // ties this still to the tutorial's own running "January" example.
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'January' });
        await settle(t.page, 500);
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        // Click the *existing* calendar grid (gen_month_2,
        // services/planner_preset.ts ~line 39587) rather than drawing a new
        // one -- it already ships with offsetMode "dynamic" (offsetField
        // "weekday_num", offsetAdjustment -1), so the panel shows the real,
        // shipped values with no configuration needed at all. Same click
        // point editor/grid-table-styling above already uses and verified
        // (that shot's own comment: template-space roughly x44-462,y81-402
        // for a 30-day, zero-offset month) -- January's 31 days plus its
        // own 3-cell dynamic offset also lands on 5 rows, so the grid's
        // rendered footprint covers the same region either month.
        const c = await canvasBox(t.page);
        await t.page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.3);
        await settle(t.page, 400);
        await t.snap(OFFSET_BLOCK_SELECTOR);
    } },
    { id: 'editor/clip-dynamic-offset', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Month View', { exact: true }).click();
        await settle(t.page, 500);
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'January' });
        await settle(t.page, 500);
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        // Same real grid and click point as editor/grid-offset-config above.
        const c = await canvasBox(t.page);
        await t.page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.3);
        await settle(t.page, 400);
        const scope = t.page.locator(ACTIVE_PANE);
        // Same has(option[...]) idiom this file's setPatternFill/
        // grid-source-modal shots already use, just this select's own
        // unique option value (grep-verified: "dynamic" appears on no other
        // <select> in the whole app).
        const offsetModeSelect = scope.locator('select:has(option[value="dynamic"])');
        // Unrecorded setup: flip to Static first, so the clip has a real,
        // contrasting starting frame -- gen_month_2's offsetStart is unset
        // (defaults to 0), so Static mode shows zero blank leading cells and
        // day 1 forced into column 0, exactly the "day 1 != column 1"
        // problem this tutorial opens with. Recording only the switch BACK
        // to Dynamic (the fix) mirrors this file's own clip-grid-cols
        // convention: land on the "before" state unrecorded, beginClip()
        // right before the change that's actually the point of the shot.
        await offsetModeSelect.selectOption('static');
        await settle(t.page, 700);
        t.beginClip();
        await offsetModeSelect.selectOption('dynamic');
        await settle(t.page, 900);
    } },
    { id: 'editor/grid-traversal-example', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Quarter View', { exact: true }).click();
        await settle(t.page, 500);
        // Quarter 1 explicitly -- its 3 children are January, February,
        // March in that order (services/planner_preset.ts's own
        // gen_q_m1_days/gen_q_m2_days/gen_q_m3_days reach them via
        // traversalPath sliceStart 0/1/2 respectively), matching this
        // tutorial's own worked Quarter -> Month -> Days table.
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'Quarter 1' });
        await settle(t.page, 500);
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        // Select the *existing* real grid (gen_q_m1_days,
        // services/planner_preset.ts ~line 38921) rather than drawing a
        // fresh one -- Quarter View's own template is packed edge to edge
        // top to bottom (title/divider/mini-calendars/day-letters occupy
        // y0-171; gen_q_g1/g2/g3, three single-column "day list" grids with
        // the *same* 2-step traversal shape reaching all ~28-31 days of
        // each month, occupy nearly the entire rest of the page,
        // y188 down to as far as y653) -- there's no genuinely empty region
        // left to draw a new, larger grid into without it visually
        // colliding with real content either way, so this reuses the real
        // element instead, same principle as editor/grid-table-styling and
        // editor/grid-offset-config above.
        //
        // gen_q_m1_days's own footprint for January (31 days + a 3-cell
        // dynamic offset = 34 slots, 7 cols, no gaps) is template-space
        // x50-169,y82-157. Clicking (75,110) -- fractional (0.147,0.162) --
        // lands inside column 1's populated rows, clear of the taller
        // decorative separator rects immediately to its right (gen_q_rect1/
        // gen_q_rect2, x135-169,y65-171) even though those sit at a lower
        // zIndex (-4 vs this grid's -3) and would lose a hit-test tie there
        // anyway.
        const c = await canvasBox(t.page);
        await t.page.mouse.click(c.x + c.width * 0.147, c.y + c.height * 0.162);
        await settle(t.page, 400);
        // gen_q_m1_days ships fully configured already (cols 7, displayField
        // "day_num", the exact 2-step traversalPath and dynamic weekday_num
        // offset this tutorial's own JSON block quotes verbatim) -- no
        // interaction needed beyond selecting it, same "just click the real
        // thing" pattern as editor/grid-offset-config above.
        const scope = t.page.locator(ACTIVE_PANE);
        // Full-page snap (canvas + panel both visible, per the brief), not a
        // single-element crop -- but PropertiesPanel.tsx's own root div is
        // independently scrollable (overflow-y-auto), and page.screenshot()
        // (what a selector-less t.snap() takes) only ever captures whatever
        // is currently painted in the viewport; unlike locator.screenshot()
        // (what the other two new shots above use via t.snap(selector)), it
        // does NOT auto-scroll anything into view first. Deep Traversal
        // sits well down Grid Configuration's own field list (after
        // Cols/Gaps/Source), so without this the panel's default
        // scroll-to-top position would leave it below the fold. Scrolling
        // it into view as the deliberate last step before snapping puts it
        // exactly where this shot needs it.
        await scope.getByText('Deep Traversal', { exact: true }).scrollIntoViewIfNeeded();
        await settle(t.page, 400);
        await t.snap();
    } },
];
