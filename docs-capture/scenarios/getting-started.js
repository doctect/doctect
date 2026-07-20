import { gotoEditor, newPlannerProject, switchToTemplatesMode, selectSidebarNode, ACTIVE_PANE } from '../lib/app.js';

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

        // The row-click mechanics (hover-stable offset into the title,
        // not the pre-hover span center) now live in the shared
        // selectSidebarNode helper -- see its HAZARD comment in
        // docs-capture/lib/app.js for the full hover-reveal-layout-shift
        // narrative this used to document locally.
        await selectSidebarNode(t, 'January');

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
