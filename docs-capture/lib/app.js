// Editor-driving helpers shared by all docs-capture scenarios.
export const settle = (page, ms = 600) => page.waitForTimeout(ms);

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
export async function switchToTemplatesMode(t) {
    await t.page.getByRole('button', { name: 'Templates', exact: true }).first().click();
    await settle(t.page, 600);
}
export async function switchToHierarchyMode(t) {
    await t.page.getByRole('button', { name: 'Hierarchy', exact: true }).first().click();
    await settle(t.page, 600);
}

// A node row in the left sidebar; same column heuristic as tutorial/episodes/ep2.js.
export async function sidebarNodeBox(page, name) {
    const matches = await page.locator(`text=${name}`).all();
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

export const canvasBox = (page) =>
    page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();

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
