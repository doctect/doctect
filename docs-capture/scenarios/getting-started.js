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
];
