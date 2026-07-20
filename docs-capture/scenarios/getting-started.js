import { gotoEditor, newPlannerProject } from '../lib/app.js';

// The active project's whole ProjectEditor subtree, scoped so the Sidebar
// query below can't resolve to a *different*, currently-inactive tab's copy
// (see the sidebar-modes shot's comment).
const ACTIVE_PANE = '[data-testid="project-pane"][data-active="true"]';

export const shots = [
    { id: 'getting-started/editor-overview', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t); await t.snap();
    } },
    { id: 'getting-started/sidebar-modes', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newPlannerProject(t);

        // Not lib/app.js's shared switchToTemplatesMode() here -- it does
        // page.getByRole('button', { name: 'Templates' }).first(), which only
        // resolves correctly with exactly one project tab open. A fresh /app
        // load always seeds a default "Blank Project" tab, and
        // newPlannerProject adds a second, so two are open by the time this
        // shot runs -- the normal, expected state (see Task 12's "tab bar
        // holds several open projects" note), not a capture-only artifact.
        // pages/EditorPage.tsx (~line 357) keeps EVERY open tab's full
        // ProjectEditor -- Sidebar included -- mounted at all times, one
        // "[data-testid=project-pane]" per tab, appended in creation order;
        // only the active one gets z-10/opacity-100, the rest sit underneath
        // at opacity-0/pointer-events-none rather than unmounting. So .first()
        // resolves to the *background* Blank Project pane's Templates button
        // (mounted first), which the active, on-top Planner 2026 pane's own
        // Templates button then occludes at the exact same screen
        // coordinates -- a reproducible Playwright "subtree intercepts
        // pointer events" timeout, confirmed against the actual failure
        // screenshot before this fix. Scoping every query to the active pane
        // sidesteps the ambiguity without changing the shared helper (which
        // every other track's scenarios also use).
        await t.page.locator(ACTIVE_PANE)
            .getByRole('button', { name: 'Templates', exact: true }).click();
        await t.page.waitForTimeout(600);

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
        // "bg-slate-50/50", not "bg-slate-50". Still scoped to the active
        // pane, for the same two-tabs reason as the click above.
        await t.snap(`${ACTIVE_PANE} div.bg-slate-50.border-r.flex-col`);
    } },
];
