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

// SingleElementEditor.tsx's Interaction section (~line 1332) mounts through
// CollapsibleSection with testId="interaction-section", which lands as
// data-testid on the section's own root div (components/CollapsibleSection.tsx
// line 22 -- grep-verified unique in the app). It starts expanded
// (PropertiesPanel.tsx's INITIAL_ELEMENT_PROPERTY_SECTIONS line 35:
// `interaction: true`), so no header toggle is needed before cropping or
// interacting. It is also the LAST section in the panel -- below Geometry/
// Appearance/Typography -- so it sits under the panel's fold at the 1000px
// viewport: the still is fine (t.snap(selector) -> locator.screenshot(),
// which auto-scrolls its target into view first), but the clip below must
// scrollIntoViewIfNeeded() explicitly, since video frames only ever show
// what's actually painted. Scoped to ACTIVE_PANE for the usual
// two-tabs-mounted reason (see TOOLBAR_SELECTOR above).
const INTERACTION_SECTION_SELECTOR = `${ACTIVE_PANE} [data-testid="interaction-section"]`;

// The Interaction section's "On Click" <select> (SingleElementEditor.tsx
// ~line 1344). Anchored by an option value unique to it in the whole app --
// value="child_referrer" appears on no other <option> anywhere
// (grep-verified; the other candidates "parent"/"ancestor"/"specific_node"
// are equally unique, all nine live only on this select) -- same
// has(option[...]) idiom as setPatternFill/grid-source-modal above. NOT
// pre-scoped to ACTIVE_PANE: callers compose it under their own
// ACTIVE_PANE-scoped locator.
const ON_CLICK_SELECT_SELECTOR = 'select:has(option[value="child_referrer"])';

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
    { id: 'editor/interaction-section', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Day View', { exact: true }).click();
        await settle(t.page, 500);
        // January 1, 2026 explicitly (same determinism discipline as
        // clip-preview-node-switch above; the reference-twin double-match is
        // resolved the same way -- see that shot's comment). The panel
        // content this still is about doesn't actually vary by preview node
        // (the target button reads the LINKED node's title, always "2026
        // Planner"), but a pinned preview keeps the whole capture
        // deterministic anyway.
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'January 1, 2026' });
        await settle(t.page, 500);
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        // Select the Day View nav bar's year chip (gen_d_year,
        // services/planner_preset.ts: x189,y0,w99,h40 on the 509x679 day
        // template) -- it ships with linkTarget "specific_node" / linkValue
        // "root", so the Interaction section shows a real, shipped hard link
        // with zero configuration: On Click "Go to Specific Page" plus the
        // target button reading the picked page's title ("2026 Planner",
        // per SingleElementEditor.tsx ~line 1390's
        // `state.nodes[linkValue]?.title`). A *selected* target is the
        // brief's sanctioned fallback here: the open dropdown itself cannot
        // be captured, because a native <select> popup is OS-rendered
        // outside the page compositor -- Playwright screenshots (and its
        // video) never contain it.
        //
        // Click math: fractional canvas coords map 1:1 onto template space
        // (grid-traversal-example above verified (0.147, 0.162) -> template
        // (75, 110) on this same 509x679 page size). Chip center x =
        // 189+99/2 = 238.5 -> 0.469; y = 30 (inside the chip's 0-40 band,
        // below center to stay clear of nothing above -- the row is clear:
        // gen_d_title ends at x169, gen_d_quarter starts at x286, and
        // gen_d_line at y40 is a zero-height line whose bounds only hit at
        // exactly y=40 (hitTest bounds check with h=0), 10px below this
        // click.
        const c = await canvasBox(t.page);
        await t.page.mouse.click(c.x + c.width * 0.469, c.y + c.height * 0.044);
        await settle(t.page, 400);
        await t.snap(INTERACTION_SECTION_SELECTOR);
    } },
    { id: 'editor/clip-set-parent-link', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Day View', { exact: true }).click();
        await settle(t.page, 500);
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'January 1, 2026' });
        await settle(t.page, 500);
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        const c = await canvasBox(t.page);
        // Record the whole workflow the tutorial narrates -- "select it,
        // find Interaction, pick Go to Parent Page" -- so the clip starts
        // with nothing selected (panel showing Template Settings), then:
        // 1. click the day TITLE (gen_d_title, x30,y0,w139,h40 -> center
        //    x99.5 -> 0.195; same y band/mapping as the still above; its
        //    row neighbors are clear of the click: gen_d_prev's triangle
        //    ends at x26.5 and gen_d_next starts at x162.1, which does
        //    overlap the title's last 7px at a higher zIndex -- the center
        //    click is 62px left of that). The title ships with NO link
        //    (the only nav-bar element that doesn't), so the dropdown
        //    genuinely changes None -> "Go to Parent Page" instead of
        //    starting on some other target -- and the change writes a real
        //    parent back-button, the exact shipped pattern of gen_d_month
        //    ("{{month_short}}") next to it.
        // 2. scroll Interaction into view mid-recording (it's below the
        //    fold; see INTERACTION_SECTION_SELECTOR's comment) -- also
        //    shows *where* the section lives, which the tutorial's prose
        //    calls out ("the very last section").
        // 3. switch On Click to 'parent' via selectOption (no native popup
        //    ever opens -- it can't be recorded anyway, per the still's
        //    comment; the <select>'s own displayed value flipping to "Go to
        //    Parent Page" is the visible change the clip is for).
        t.beginClip();
        await settle(t.page, 600);
        await t.page.mouse.click(c.x + c.width * 0.195, c.y + c.height * 0.044);
        await settle(t.page, 700);
        await t.page.locator(INTERACTION_SECTION_SELECTOR).scrollIntoViewIfNeeded();
        await settle(t.page, 600);
        await t.page.locator(ACTIVE_PANE).locator(ON_CLICK_SELECT_SELECTOR).selectOption('parent');
        await settle(t.page, 900);
    } },
    { id: 'editor/add-reference-flow', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);
        // Expand the Weeks section first (root's children render collapsed at
        // depth 1 -- NodeItem.tsx's useState(depth < 1) -- same chevron-click
        // pattern as editor/node-data-fields above; `div.mr-1` is the row's
        // own expand-icon wrapper, whose onClick stopPropagation()s so it
        // toggles instead of selecting). hasText 'Weeks' matches only the
        // Weeks section row among the eight rows rendered at this point.
        const scope = t.page.locator(ACTIVE_PANE);
        await scope.locator('[data-node-id]', { hasText: 'Weeks' }).first()
            .locator('div.mr-1').click();
        await settle(t.page, 400);
        // "Add Reference" is a hover-revealed action: NodeItem.tsx's button
        // cluster (Edit Title / Add New Page / Link Existing Page) is
        // `hidden group-hover:flex` -- display:none, zero-width, until the
        // row itself is really :hover'ed. A locator click straight at the
        // button would time out on visibility, so move the mouse onto the
        // row's title zone first (selectSidebarNode's own validated
        // left-edge math: paddingLeft depth*12+8 = 32 at this depth-2 row,
        // plus the same 28px clearance = 60 -- move only, no click, since
        // clicking would merely select the row, which this shot doesn't
        // need). hasText 'Week 1' also matches Week 10-19 by substring, but
        // .first() in DOM order is the real Week 1 -- it's the Weeks
        // node's children[0], rendered before every other week row.
        const week1Row = scope.locator('[data-node-id]', { hasText: 'Week 1' }).first();
        const box = await week1Row.boundingBox();
        await t.page.mouse.move(box.x + 60, box.y + box.height / 2);
        await settle(t.page, 300);
        // The revealed cluster's real button title, from NodeItem.tsx line
        // ~85: "Link Existing Page (Reference)" -- grep-verified unique to
        // this component. Scoped to the hovered row anyway: every row
        // carries an identically-titled button, but only the hovered row's
        // is display:flex right now. Clicking it fires onAddRef ->
        // ProjectEditor.handleAddReference, which opens NodeSelectorModal
        // in nodeSelectorMode 'create_reference', titled "Select Reference
        // Target" (ProjectEditor.tsx ~line 1235). Full-page snap, same
        // rationale as editor/grid-source-modal: the modal is a fixed
        // inset-0 overlay, and the dimmed sidebar behind it (Weeks
        // expanded, Week 1 hovered) is exactly the flow context the
        // tutorial narrates.
        await week1Row.locator('button[title="Link Existing Page (Reference)"]').click();
        await settle(t.page, 600);
        await t.snap();
    } },
    { id: 'editor/week-references-sidebar', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);
        // Weeks -> Week 2, both via the same stopPropagation chevron wrapper
        // as the shot above. Week 2 -- not Week 1 -- because it's the
        // preset's first *full* week: exactly seven reference children,
        // January 5 through January 11 (services/planner_preset.ts
        // w_yx49iuplj), matching the tutorial's "seven italic rows" prose;
        // Week 1 holds only four (2026 opens on a Thursday). hasText
        // 'Week 2' also substring-matches Week 20-29, but those render
        // after it in DOM order, so .first() is the real Week 2.
        const scope = t.page.locator(ACTIVE_PANE);
        await scope.locator('[data-node-id]', { hasText: 'Weeks' }).first()
            .locator('div.mr-1').click();
        await settle(t.page, 400);
        await scope.locator('[data-node-id]', { hasText: 'Week 2' }).first()
            .locator('div.mr-1').click();
        await settle(t.page, 400);
        // Crop to the sidebar itself so the seven italic+link-icon reference
        // rows stay legible: Sidebar.tsx's own root div (line ~53) is the
        // only element in the app combining border-r with bg-slate-50
        // (grep-verified; EditorToolbar's bar shares bg-slate-50 but has no
        // border-r). ACTIVE_PANE-scoped for the usual two-tabs-mounted
        // reason. Week 2's children sit ~8 rows down -- well inside the
        // sidebar's unscrolled viewport at this window height, so no
        // scrolling is needed before the crop.
        await t.snap(`${ACTIVE_PANE} div.border-r.bg-slate-50`);
    } },
    { id: 'editor/clip-referrer-formula', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        await t.page.locator(ACTIVE_PANE).getByText('Month View', { exact: true }).click();
        await settle(t.page, 500);
        // January explicitly (same determinism discipline as this file's
        // other Month View shots) -- the tutorial's worked example resolves
        // against it: child 0 of January is January 1, referenced from
        // Week 1 (ref_egbahioko under w_vjoyf0ivm), so the formula below
        // must end the clip rendering the literal label "Week 1".
        const preview = t.page.locator(TOOLBAR_SELECTOR).locator('select');
        await preview.selectOption({ label: 'January' });
        await settle(t.page, 500);
        t.beginClip();
        // Real settle before the first recorded action -- same empirically
        // required seek-imprecision guard as clip-grid-cols above.
        await settle(t.page, 600);
        // Draw the text box over the note-pattern area in the page's lower
        // half: template-space ~x224-428, y482-543, inside gen_m_notes2's
        // decorative hatching (x259-489, y476-669 -- overlap-safe per
        // clip-grid-cols' own survey of this template) and clear of the
        // calendar block above (ends ~y466) and the rotated week-label
        // column (x447+; even rotated, gen_m_w6's bounds stay right of
        // x462). A freshly drawn element takes the layer's top zIndex, so
        // it paints over the hatching. drawElement leaves the overlay text
        // editor open with the caret in it (Canvas.tsx opens it on text
        // creation -- the exact flow clip-drag-create already records), so
        // keyboard.type lands in the element's text.
        await drawElement(t, 't', { x: 0.44, y: 0.71 }, { x: 0.84, y: 0.80 });
        // The tutorial's worked example, verbatim. While typing, the
        // overlay shows the raw braces; OverlayTextEditor commits text
        // live on every keystroke (handleInput -> onChange), and Escape
        // just ends the edit (onFinish + switch to select) -- so the
        // committed element re-renders through CanvasElement's
        // resolveElementPreviewText, which resolves {{child_referrer:...}}
        // against the January preview node: the final frames must show the
        // resolved label "Week 1", never raw {{braces}}.
        await t.page.keyboard.type('{{child_referrer:0:7:week:title}}', { delay: 45 });
        await settle(t.page, 500);
        await t.page.keyboard.press('Escape');
        await settle(t.page, 1200);
    } },
    { id: 'editor/variant-dropdown', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);
        // The variant bar only renders in Templates mode (Sidebar.tsx ~line
        // 76). The planner preset ships in the pre-variants flat "templates"
        // format (services/planner_preset.json has no `variants` key), so the
        // v3->v4 migration wraps it into a single variant named "Default" on
        // load -- and Sidebar.tsx hides the Delete button until a second
        // variant exists (variantList.length > 1). Duplicate first, so the
        // still shows the FULL control set the tutorial narrates (dropdown +
        // rename/duplicate/delete/add), not the one-variant subset:
        // title="Duplicate Variant" is grep-unique (TemplateItem.tsx's and
        // NodeItem.tsx's own duplicate buttons are titled just "Duplicate").
        // handleDuplicateVariant (ProjectEditor.tsx ~line 810) deep-copies
        // every template and switches to the copy, so the dropdown then reads
        // "Default (Copy)" -- itself a nice demonstration of what duplicate
        // produces. No confirm dialog fires on duplicate (only delete has
        // one).
        await t.page.locator(`${ACTIVE_PANE} button[title="Duplicate Variant"]`).click();
        await settle(t.page, 800);
        // Crop to the sidebar root -- same div.border-r.bg-slate-50 selector
        // editor/week-references-sidebar above already grep-verified as
        // unique to Sidebar.tsx (EditorToolbar shares bg-slate-50 but has no
        // border-r) -- so the variant bar and the copied variant's template
        // list below it stay legible at display size.
        await t.snap(`${ACTIVE_PANE} div.border-r.bg-slate-50`);
    } },
    { id: 'editor/svg-source-section', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        // EditorToolbar.tsx's SVG menu (~lines 186-231): a FileImage+chevron
        // button titled "SVG Tools" (grep-unique in the app) opens a
        // two-item dropdown whose "Insert placeholder SVG" entry (exact
        // text, also unique -- the other entry is "Import SVG file…", which
        // would need a real file chooser) calls handleInsertSvgPlaceholder
        // -> insertSvgElement (ProjectEditor.tsx ~line 740): places
        // services/svgEditing.ts's PLACEHOLDER_SVG (a 100x100 indigo rounded
        // square) at (20,20) on the active layer, selects it, and switches
        // to the Select tool -- so the properties panel is already showing
        // the element's sections with no further clicks.
        await t.page.locator(`${ACTIVE_PANE} button[title="SVG Tools"]`).click();
        await settle(t.page, 300);
        await t.page.locator(ACTIVE_PANE).getByText('Insert placeholder SVG', { exact: true }).click();
        await settle(t.page, 600);
        // SvgSourceSection mounts through CollapsibleSection with
        // testId="svg-source-section" (grep-unique) and starts expanded
        // (PropertiesPanel.tsx's INITIAL_ELEMENT_PROPERTY_SECTIONS:
        // svgSource true), so the placeholder's markup and the KB size
        // readout are already visible. Crop to the section itself so the
        // 11px-mono markup stays legible -- same rationale as
        // LAYERS_PANEL_SELECTOR; t.snap(selector) is locator.screenshot(),
        // which auto-scrolls its target into view first, so the section
        // sitting below Geometry/Appearance under the fold is fine.
        await t.snap(`${ACTIVE_PANE} [data-testid="svg-source-section"]`);
    } },
    { id: 'editor/json-inspector', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);
        // ProjectEditor.tsx's header-bar JSON button (~line 1060): accessible
        // name exactly "JSON" (Code icon + text). Every tab's ProjectEditor
        // renders a JsonModal but only the active tab's isOpen can be true
        // (showJsonModal lives in each tab's own state) -- the *button* still
        // needs ACTIVE_PANE scoping, since the backgrounded blank tab has an
        // identical one.
        await t.page.locator(ACTIVE_PANE).getByRole('button', { name: 'JSON', exact: true }).click();
        // Visual mode is the default. The planner is 1733 nodes and the
        // Nodes section eagerly maps one MainCollectionItem row per node
        // (components/JsonModal.tsx ~line 360, no virtualization) -- give
        // that big first render a generous settle.
        await settle(t.page, 2500);
        // Expand the first Nodes row so the still demonstrates the tree
        // *editing* surface (per-property rows), not just a list of
        // collapsed headers. The planner's rootId is literally "root"
        // (services/planner_preset.json), so MainCollectionItem's wrapper is
        // id="item-root"; the variants section's counterpart is
        // "item-default" (migration names the wrapped variant id "default"),
        // no collision, and the backgrounded tab's JsonModal renders null --
        // this id exists exactly once. The clickable header row is the
        // wrapper's own first child div (MainCollectionItem.tsx ~line 42).
        await t.page.locator('[id="item-root"] > div').first().click();
        await settle(t.page, 600);
        // Full-page snap: the modal is a fixed inset-0 overlay with its own
        // backdrop blur, same rationale as editor/grid-source-modal. (The
        // Variants section exists but sits 1700+ rows below the fold -- the
        // tutorial's figure caption describes the Nodes tree, not both.)
        await t.snap();
    } },
    { id: 'editor/clip-greyscale-toggle', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        // Neither stock canvas can demonstrate desaturation: a blank page is
        // white-on-white, and the planner preset is grey/black by design
        // (its fill survey: #d3d7cf, #000000, #babdb6, #ffffff...). Draw
        // three rects and fill them saturated blue/green/red so the toggle's
        // effect is unmissable. All three drags run BEFORE any panel input
        // is touched: drawElement starts by keyboard.press()ing the tool
        // key, and ProjectEditor's shortcut handler (~line 150) bails
        // whenever focus sits in an input/textarea -- which is exactly where
        // .fill() on the color input below leaves it. Mouse clicks don't
        // care about focus, so the fill passes are done by re-clicking each
        // rect with the Select tool instead of interleaving draw and fill.
        await drawElement(t, 'r', { x: 0.10, y: 0.30 }, { x: 0.30, y: 0.55 });
        await drawElement(t, 'r', { x: 0.38, y: 0.30 }, { x: 0.58, y: 0.55 });
        await drawElement(t, 'r', { x: 0.66, y: 0.30 }, { x: 0.86, y: 0.55 });
        await t.page.keyboard.press('v');
        await settle(t.page, 300);
        const c = await canvasBox(t.page);
        const scope = t.page.locator(ACTIVE_PANE);
        // SingleElementEditor.tsx's Fill row (~line 896): a w-16 label div
        // reading exactly "Fill" whose SIBLING div holds the one color
        // input. Same label+sibling idiom as setPatternFill's "Gap"/"Weight"
        // above, anchored on the div's text because the Fill row uses a
        // plain div, not a <label>; "Fill" as exact text matches only this
        // row (the Stroke row's div reads "Stroke"). Rects don't overlap,
        // so a single click selects; the rects were drawn left to right and
        // are re-clicked in the same order, ending on the RED one -- its
        // blue selection chrome over a red-turned-grey fill is the clearest
        // possible "content desaturates, chrome doesn't" contrast.
        const fillInput = scope.locator('div.w-16:text-is("Fill") + div input[type="color"]');
        const rects = [
            { cx: 0.20, color: '#2563eb' },
            { cx: 0.48, color: '#16a34a' },
            { cx: 0.76, color: '#dc2626' },
        ];
        for (const r of rects) {
            await t.page.mouse.click(c.x + c.width * r.cx, c.y + c.height * 0.425);
            await settle(t.page, 300);
            await fillInput.fill(r.color);
            await settle(t.page, 300);
        }
        // The greyscale toggle lives in ProjectEditor's OWN header bar (the
        // min-h-[40px] bg-white row, NOT EditorToolbar's bg-slate-50 one --
        // see TOOLBAR_SELECTOR's comment for the two-bars hazard), title
        // "Greyscale Export: OFF"/"Greyscale Export: ON" depending on state
        // (ProjectEditor.tsx ~line 1070, grep-unique) -- prefix-match so the
        // same locator serves every click of the on/off/on sequence below.
        const greyToggle = scope.locator('button[title^="Greyscale Export"]');
        t.beginClip();
        // Real settle before the first recorded action -- same empirically
        // required seek-imprecision guard as clip-grid-cols above.
        await settle(t.page, 800);
        // On -> off -> on: shows the preview is live and reversible (the
        // page content desaturates via ReadOnlyPagePreview's CSS
        // grayscale(1) filter; the selection border/handles render outside
        // that filter wrapper, in the {children} slot, so they stay blue
        // throughout), and the clip ends in the ON state the tutorial's
        // "audit the grey version" prose describes.
        await greyToggle.click();
        await settle(t.page, 1200);
        await greyToggle.click();
        await settle(t.page, 700);
        await greyToggle.click();
        await settle(t.page, 1000);
    } },
];
