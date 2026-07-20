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
export async function sidebarNodeBox(page, name) {
    const matches = await page.locator(ACTIVE_PANE).locator(`text=${name}`).all();
    for (const m of matches) {
        const box = await m.boundingBox();
        if (box && box.x < 300 && box.y > 140) return box;
    }
    throw new Error(`sidebar node not found: ${name}`);
}
export async function selectSidebarNode(t, name) {
    const box = await sidebarNodeBox(t.page, name);
    await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
