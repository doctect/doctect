// Editor-driving helpers shared by all docs-capture scenarios.
export const settle = (page, ms = 600) => page.waitForTimeout(ms);

// pages/EditorPage.tsx (~lines 357-379): every open project tab's entire
// ProjectEditor (Sidebar + Canvas) stays mounted at all times, one
// "[data-testid=project-pane]" div per tab, absolutely positioned inset-0;
// only the active tab's pane gets z-10/opacity-100, the rest sit underneath
// at opacity-0/pointer-events-none rather than unmounting. A fresh /app load
// always seeds a default "Blank Project" tab, so any scenario that opens a
// second tab (newPlannerProject/newNotebookProject) has two of these mounted
// at once. Helpers below that query by text/role/testid across the whole
// page can silently resolve into the backgrounded, occluded pane instead of
// the one actually on screen -- scope those queries to ACTIVE_PANE.
export const ACTIVE_PANE = '[data-testid="project-pane"][data-active="true"]';

export async function gotoEditor(t) {
    await t.page.goto(t.baseUrl + '/app');
    await t.page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 20000 });
    await settle(t.page, 900);
}

// Card texts from components/NewProjectModal.tsx. The blank card is clicked by
// its description (a tab named "Blank Project" already exists); the preset
// cards by their titles, .last() because an open project tab can share the name.
async function newProjectFromCard(t, cardText) {
    await t.page.click('button[title="New Project"]');
    await settle(t.page, 500);
    await t.page.getByText(cardText, { exact: false }).last().click();
    await settle(t.page, 1500);
}
export const newBlankProject = (t) => newProjectFromCard(t, 'Start fresh with a single A4 page');
export const newPlannerProject = (t) => newProjectFromCard(t, '2026 Planner');
export const newNotebookProject = (t) => newProjectFromCard(t, 'Simple Notebook');

// Real <button> elements in components/Sidebar.tsx (verified — not relying on
// DOM order among arbitrary text matches); the generator modal has plain,
// non-button "Templates"/"Hierarchy" <span>s that this role query can't match.
// Scoped to ACTIVE_PANE: with 2+ tabs open, an unscoped .first() can grab the
// backgrounded tab's own Templates/Hierarchy button, which the active pane's
// button then occludes at the same screen coordinates -- a reproducible
// Playwright "subtree intercepts pointer events" timeout (see
// .superpowers/sdd/task-11-report.md's "Selector adjustment" section).
export async function switchToTemplatesMode(t) {
    await t.page.locator(ACTIVE_PANE).getByRole('button', { name: 'Templates', exact: true }).click();
    await settle(t.page, 600);
}
export async function switchToHierarchyMode(t) {
    await t.page.locator(ACTIVE_PANE).getByRole('button', { name: 'Hierarchy', exact: true }).click();
    await settle(t.page, 600);
}

// A node row in the left sidebar; same column heuristic as tutorial/episodes/ep2.js.
// Scoped to ACTIVE_PANE: a backgrounded tab's Sidebar is fully mounted too, so
// an unscoped text match can resolve to a same-named node in the *inactive*
// pane instead -- the x<300/y>140 heuristic can't tell panes apart, since
// both sit at the identical absolute inset-0 box (pages/EditorPage.tsx
// ~line 357).
//
// Resolves the ROW ([data-node-id] div), not the title text inside it --
// see the HAZARD comment on selectSidebarNode below for why the row, not
// the title span, is what must be measured and clicked. `[data-node-id]`
// only ever marks that row div itself (components/sidebar/NodeItem.tsx: a
// node's children render as siblings of it, one level up, not inside it),
// so filtering by hasText here can't accidentally sweep in a descendant's
// row.
async function resolveSidebarNodeRow(page, name) {
    const rows = await page.locator(ACTIVE_PANE).locator('[data-node-id]', { hasText: name }).all();
    for (const row of rows) {
        const box = await row.boundingBox();
        if (box && box.x < 300 && box.y > 140) return { row, box };
    }
    throw new Error(`sidebar node not found: ${name}`);
}

export async function sidebarNodeBox(page, name) {
    const { box } = await resolveSidebarNodeRow(page, name);
    return box;
}

// HAZARD (fixed here; previously worked around locally in
// getting-started.js's planner-month-view shot -- see that scenario's git
// history for the original repro/narrative this replaces). Every
// non-reference row in components/sidebar/NodeItem.tsx is a flex container:
// [chevron/spacer icon][optional reference-link icon][title `<span
// class="truncate flex-1">`][action-button cluster (`hidden
// group-hover:flex`) holding Edit Title/Add/Link/Duplicate/Delete]. The
// action-button cluster is `display:none` -- zero width, so the flex-1
// title span stretches across nearly the *entire* rest of the row -- until
// the row is actually `:hover`ed, at which point the cluster flips to
// `display:flex` and the span shrinks to make room. A bounding box measured
// on the SPAN pre-hover describes that stretched, pre-hover layout only;
// `page.mouse.click(x, y)` first *moves* the mouse to (x, y) (triggering
// real :hover and shrinking the span) and only *then* clicks, so a click
// aimed at that pre-hover span's center lands on whatever the now-revealed
// buttons put at that now-stale coordinate -- commonly "Edit Title",
// producing a rename-input state instead of a selection. This is
// structural to every such row, not node-specific.
//
// Fix: click the ROW at a fixed clearance in from its own LEFT edge. The
// row's left edge -- and the title span's left edge -- never move on
// hover; only the span's *right* edge and the button cluster's width do.
// That clearance has to grow with depth, though: NodeItem sets each row's
// own inline paddingLeft to `depth*12+8`px, followed by a ~22px
// chevron/spacer icon (14px icon + p-0.5 padding + mr-1 margin) before the
// title text actually starts -- so a depth-agnostic fixed offset eventually
// lands back on the icon/padding zone for deep-enough rows (e.g. a
// depth-3 day node under a month, itself under a quarter, itself under the
// root). Reading the row's own paddingLeft and adding a fixed clearance
// past it keeps the click inside the title at any depth; 28px of clearance
// is chosen so depth 2 reproduces the 60px-from-left-edge offset already
// validated against the live app (paddingLeft 32px + 28 = 60), and was
// re-verified at depth 3 (paddingLeft 44px + 28 = 72) with a live probe.
// Not accounted for: reference rows (`isReference`) render an extra ~16px
// Link icon before the title, which this clearance doesn't add for -- no
// current caller selects a reference row, so it's left as a known gap
// rather than a guessed, unverified fix.
export async function selectSidebarNode(t, name) {
    const { row, box } = await resolveSidebarNodeRow(t.page, name);
    const paddingLeft = await row.evaluate((el) => parseFloat(el.style.paddingLeft) || 0);
    await t.page.mouse.click(box.x + paddingLeft + 28, box.y + box.height / 2);
    await settle(t.page, 500);
}

// Scoped to ACTIVE_PANE: empirically confirmed (see
// .superpowers/sdd/task-11-report.md's fix section) that opacity:0 does NOT
// make an element non-":visible" to Playwright, so with 2+ tabs open, both
// panes' canvases match "[data-testid=editor-canvas]:visible" and an
// unscoped .first() can resolve to the backgrounded, occluded tab's
// differently-sized canvas -- silently wrong coordinates for drawElement's
// math (pages/EditorPage.tsx ~line 357 for the DOM shape). No further
// :visible filter needed once scoped: each pane mounts exactly one canvas.
export const canvasBox = (page) =>
    page.locator(`${ACTIVE_PANE} [data-testid="editor-canvas"]`).first().boundingBox();

// Press a tool key (t/r/e/y/l/g) and drag on the canvas between fractional coords.
export async function drawElement(t, toolKey, from, to) {
    await t.page.keyboard.press(toolKey);
    await settle(t.page, 300);
    const c = await canvasBox(t.page);
    const A = { x: c.x + c.width * from.x, y: c.y + c.height * from.y };
    const B = { x: c.x + c.width * to.x, y: c.y + c.height * to.y };
    await t.page.mouse.move(A.x, A.y);
    await t.page.mouse.down();
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
        await t.page.mouse.move(A.x + (B.x - A.x) * (i / steps), A.y + (B.y - A.y) * (i / steps));
        await t.page.waitForTimeout(22);
    }
    await t.page.mouse.up();
    await settle(t.page, 500);
}

// Generator helpers; textarea injection pattern from scratch/render_project.mjs.
// HAZARD (unfixed, no live callers yet): the Generator modal mounts inside each
// tab's ProjectEditor (per-tab local state), and every open tab's pane stays
// mounted (see ACTIVE_PANE note above). With 2+ tabs these unscoped queries can
// hit an inactive pane's button/textareas — scope to ACTIVE_PANE (button) and
// filter textareas via the active pane before first real use.
export async function openGenerator(t) {
    await t.page.getByRole('button', { name: /Generator/i }).first().click();
    await settle(t.page, 600);
}
export async function pasteGeneratorScripts(t, templatesJs, hierarchyJs) {
    await t.page.evaluate(({ tpl, hier }) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        const tas = [...document.querySelectorAll('textarea')].filter(e => e.className.includes('caret-white'));
        if (tas.length < 2) throw new Error('generator textareas not found');
        setter.call(tas[0], tpl); tas[0].dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(tas[1], hier); tas[1].dispatchEvent(new Event('input', { bubbles: true }));
    }, { tpl: templatesJs, hier: hierarchyJs });
    await settle(t.page, 300);
}
export async function runGenerator(t) {
    await t.page.getByRole('button', { name: /Run Generator/i }).click();
    await t.page.waitForTimeout(2500);
}
