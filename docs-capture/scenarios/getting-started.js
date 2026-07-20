import { gotoEditor, newPlannerProject, switchToTemplatesMode, ACTIVE_PANE } from '../lib/app.js';

export const shots = [
    { id: 'getting-started/editor-overview', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await t.snap();
    } },
    { id: 'getting-started/sidebar-modes', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);

        // switchToTemplatesMode() (docs-capture/lib/app.js) is now scoped to
        // the active project-pane, so it resolves correctly even though two
        // tabs are open by this point -- the default "Blank Project" seeded
        // on /app load, plus the one newPlannerProject just added. See
        // lib/app.js's ACTIVE_PANE comment (and
        // .superpowers/sdd/task-11-report.md's "Selector adjustment"
        // section) for the original repro this fixed.
        await switchToTemplatesMode(t);

        // Sidebar.tsx's own root ("aside, [class*='sidebar']" from the brief
        // doesn't match anything real -- the component uses neither an
        // <aside> tag nor any class containing the literal substring
        // "sidebar") is `<div className="w-full border-r bg-slate-50 flex
        // flex-col h-full flex-shrink-0">`. Verified via source read: this
        // 3-class combination (bg-slate-50 + border-r + flex-col) appears on
        // exactly one element per project-pane, and the only other
        // border-r+bg-slate-50 element anywhere in the app is
        // pages/docs/DocsLayout.tsx's <aside> -- an unrelated route (/docs,
        // not /app) that additionally uses the distinct token
        // "bg-slate-50/50", not "bg-slate-50". Scoped to the active pane for
        // the same two-tabs reason as switchToTemplatesMode above.
        await t.snap(`${ACTIVE_PANE} div.bg-slate-50.border-r.flex-col`);
    } },
    { id: 'getting-started/new-project-modal', kind: 'still', run: async (t) => {
        await gotoEditor(t);
        await t.page.click('button[title="New Project"]');
        await t.page.waitForTimeout(600);
        await t.snap();
    } },
    { id: 'getting-started/planner-month-view', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);

        // "January" (services/planner_preset.ts: a child of "Quarter 1",
        // itself a child of root) isn't in the DOM yet at this point --
        // components/sidebar/NodeItem.tsx auto-expands only depth 0 on
        // mount (`useState(depth < 1)`), so root ("2026 Planner") starts
        // expanded but its own children (Quarter 1..4, Weeks, Notes,
        // To-Do Lists -- depth 1) start collapsed, chevron pointing right,
        // and a collapsed node's children never render at all (`{expanded
        // && node.children.map(...)}`). Expand "Quarter 1" first by
        // clicking its chevron specifically: the small icon div preceding
        // the title (`div.mr-1` in NodeItem's row) is the only part of the
        // row whose onClick calls stopPropagation() to toggle `expanded`
        // instead of selecting the node. `[data-node-id]` only ever marks
        // that row div itself (a node's children render as siblings of it,
        // one level up, not inside it), so filtering by hasText here can't
        // accidentally sweep in a descendant's row.
        const quarter1Row = t.page.locator(ACTIVE_PANE).locator('[data-node-id]', { hasText: 'Quarter 1' }).first();
        await quarter1Row.locator('div.mr-1').click();
        await t.page.waitForTimeout(400);

        // Deliberately NOT using the shared selectSidebarNode/sidebarNodeBox
        // helpers (docs-capture/lib/app.js) here -- empirically confirmed
        // (throwaway Playwright probe against the live app) that they
        // misfire on this row. sidebarNodeBox measures a bounding box for
        // the title's `<span class="truncate flex-1">` while the row isn't
        // hovered, at which point NodeItem's hover-only action buttons
        // (`hidden group-hover:flex`, Edit/Add/Link/Duplicate/Delete) are
        // `display:none` and take up zero width, so the flex-1 span
        // stretches across the *entire* rest of the row (measured: row
        // 287px wide, span x=54 w=225 -- almost to the row's right edge).
        // selectSidebarNode then does `page.mouse.click(box.x+box.width/2,
        // ...)`, a raw move-then-click at that pre-hover center. The
        // move() alone triggers real :hover, which flips the action
        // buttons to `display:flex` and shrinks the span to make room --
        // *before* the subsequent down/up fire -- so the click lands on
        // whatever the buttons' layout shift put under that now-stale
        // coordinate. Confirmed via elementFromPoint at the exact computed
        // center: the "Edit Title" button, not the span -- which is
        // exactly the rename-input state visible if you snap right after
        // calling selectSidebarNode(t, 'January') here (input box + all 5
        // hover icons rendered, because the mouse is left sitting on top
        // of the row). This isn't "January"-specific: it's structural to
        // every non-reference NodeItem row, since the same flex-1-span +
        // hidden-group-hover-flex-siblings shape is shared by all of them.
        // Fix used here: click a fixed offset from the *row's own* box
        // (data-node-id div, not the span) instead of the span's
        // pre-hover-measured center -- 60px in clears the depth-2 chevron
        // (padding 32px + ~18px icon) and lands inside the visible title
        // text well before the hover-icon zone can ever reach that far
        // left, regardless of whether hover has toggled by the time the
        // click actually lands. Verified with the same probe: this offset
        // resolves to the title `<span>` both before and after hover.
        const januaryRow = t.page.locator(ACTIVE_PANE).locator('[data-node-id]', { hasText: 'January' }).first();
        const rowBox = await januaryRow.boundingBox();
        await t.page.mouse.click(rowBox.x + 60, rowBox.y + rowBox.height / 2);
        await t.page.waitForTimeout(500);

        await t.snap();
    } },
    { id: 'getting-started/template-preview-selector', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await switchToTemplatesMode(t);

        // Select "Month View" so the toolbar's Preview: dropdown
        // (EditorToolbar.tsx's "Template Preview Node Selector") has more
        // than one real option to show. Templates mode opens on whichever
        // template was `selectedTemplateId` at load time -- for a fresh
        // planner that's "year" (services/presets.ts's loadPreset takes the
        // *first* key of the preset's templates map, and "year" is that
        // first key in services/planner_preset.ts) -- and exactly one node
        // (the root) uses the Year View template, so its Preview: dropdown
        // would only ever offer that single node. Month View has twelve
        // (one per month), which actually demonstrates the "choose whose
        // data fills the design" idea the tutorial prose makes about this
        // control.
        await t.page.locator(ACTIVE_PANE).getByText('Month View', { exact: true }).click();
        await t.page.waitForTimeout(400);

        await t.snap();
    } },
];
