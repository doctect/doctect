import fs from 'node:fs';
import { ACTIVE_PANE, applyGeneratorAsNewProject, gotoEditor, newBlankProject, openGenerator, pasteGeneratorScripts, runGenerator, settle } from '../lib/app.js';

// These two scripts are embedded VERBATIM in
// docs-content/tutorials/generator/01-generator-basics.md ("A first script")
// — this capture running them through the real sandbox is what proves the
// tutorial's code actually works. Keep both in sync with the markdown.
const MINI_TEMPLATES = `const t = {};
t.page = { id: 'page', name: 'Page', width: A4_WIDTH, height: A4_HEIGHT, elements: [
  { type: 'text', x: 40, y: 40, w: 300, h: 40, text: '{{title}}', fontSize: 24 },
] };
return t;`;
const MINI_HIERARCHY = `const nodes = {};
nodes.root = { id: 'root', parentId: null, type: 'page', title: 'Mini Book', data: {}, children: [] };
for (let i = 1; i <= 3; i++) {
  const id = createId('p');
  nodes[id] = { id, parentId: 'root', type: 'page', title: 'Chapter ' + i, data: {}, children: [] };
  nodes.root.children.push(id);
}
return { nodes, rootId: 'root' };`;

// Tutorial generator/02 ("Templates in Code") is one continuous templates
// script split across five ```javascript blocks, plus a sixth block holding
// the hierarchy script. Rather than duplicating ~120 lines here and hoping
// they stay in sync, the blocks are extracted from the markdown itself at
// run time — so these captures always prove the tutorial's OWN code runs.
const RICH_MD = new URL('../../docs-content/tutorials/generator/02-templates-in-code.md', import.meta.url);
function richScripts() {
    const md = fs.readFileSync(RICH_MD, 'utf8');
    const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)].map(m => m[1]);
    if (blocks.length !== 6) throw new Error(`templates-in-code: expected 6 js blocks, found ${blocks.length}`);
    if (!blocks[4].includes('return t;')) throw new Error('templates-in-code: block 5 must end the templates script');
    if (!blocks[5].startsWith('const nodes')) throw new Error('templates-in-code: block 6 must be the hierarchy script');
    return { templates: blocks.slice(0, 5).join('\n'), hierarchy: blocks[5] };
}

// Tutorial generator/03 ("Hierarchy in Code") follows the same extract-from-
// markdown pattern: fence 1 is the templates script, fences 2-6 join into one
// continuous hierarchy script, and fence 7 is a hierarchy script broken on
// purpose (a typo'd `type`) for the validation-error shot. Display-only
// snippets in that tutorial use ```js fences precisely so this ```javascript
// regex never sweeps them into the runnable program.
const HIER_MD = new URL('../../docs-content/tutorials/generator/03-hierarchy-in-code.md', import.meta.url);
// The exact line the modal shows for fence 7 (category prefix + the real
// validateGeneratedProject message). The tutorial quotes it verbatim; the
// validation-error shot asserts the live alert matches BOTH this string and
// the markdown, so the doc can never drift from what the app actually says.
const HIER_EXPECTED_ERROR = "Hierarchy: Node day_1 references unknown template type 'dayly' in variant 'default'.";
function hierarchyScripts() {
    const md = fs.readFileSync(HIER_MD, 'utf8');
    const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)].map(m => m[1]);
    if (blocks.length !== 7) throw new Error(`hierarchy-in-code: expected 7 js blocks, found ${blocks.length}`);
    if (!blocks[0].includes('return t;')) throw new Error('hierarchy-in-code: block 1 must be the templates script');
    if (!blocks[5].trimEnd().endsWith("return { nodes, rootId: 'root' };")) {
        throw new Error('hierarchy-in-code: block 6 must end the hierarchy script');
    }
    if (!blocks[6].includes("'dayly'")) throw new Error('hierarchy-in-code: block 7 must be the deliberately broken script');
    if (!md.includes(HIER_EXPECTED_ERROR)) throw new Error('hierarchy-in-code: markdown must quote the on-screen error verbatim');
    return { templates: blocks[0], hierarchy: blocks.slice(1, 6).join('\n'), broken: blocks[6] };
}

// Tutorial generator/04 ("Build a Dated Planner") is FIVE cumulative stages
// whose ```javascript fences concatenate into one templates script and one
// hierarchy script, and which then embeds the assembled pair verbatim as its
// last two fences ("The whole thing"). Extraction asserts that invariant —
// the doc can never drift from its own stages — and the captures paste the
// assembled fences, so what readers copy is exactly what ran. Display-only
// code in that tutorial (stage closers, the A4->RM swap line, the variants
// sketch, the quoted preset excerpt) uses ```js/```json fences on purpose.
const PLANNER_MD = new URL('../../docs-content/tutorials/generator/04-build-a-dated-planner.md', import.meta.url);
function plannerScripts() {
    const md = fs.readFileSync(PLANNER_MD, 'utf8');
    const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)].map(m => m[1]);
    if (blocks.length !== 7) throw new Error(`dated-planner: expected 7 js blocks, found ${blocks.length}`);
    if (blocks[5] !== blocks[0] + blocks[2] + blocks[4]) {
        throw new Error('dated-planner: assembled templates fence != stage fences 1+3a+4 concatenated');
    }
    if (blocks[6] !== blocks[1] + blocks[3]) {
        throw new Error('dated-planner: assembled hierarchy fence != stage fences 2+3b concatenated');
    }
    if (!blocks[5].includes("offsetField: 'weekday_num', offsetAdjustment: -1")) {
        throw new Error('dated-planner: templates lost the dynamic weekday offset');
    }
    if (!blocks[6].trimEnd().endsWith("return { nodes, rootId: 'root' };")) {
        throw new Error('dated-planner: hierarchy must end with the return');
    }
    return { templates: blocks[5], hierarchy: blocks[6] };
}

export const shots = [
    { id: 'generator/modal-two-scripts', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, MINI_TEMPLATES, MINI_HIERARCHY);
        await t.snap();
    } },
    { id: 'generator/visual-preview', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, MINI_TEMPLATES, MINI_HIERARCHY);
        await runGenerator(t);
        await t.snap();
    } },
    { id: 'generator/templates-script-rich', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = richScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await t.snap();
    } },
    { id: 'generator/preview-rich-templates', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = richScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await runGenerator(t);
        await t.snap();
    } },
    { id: 'generator/hierarchy-script', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = hierarchyScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await t.snap();
        // The still is the pre-run modal, but the tutorial's prose states the
        // run's exact outcome ("13 nodes, 11 estimated pages") — prove it by
        // actually running the extracted program after the shot is taken.
        await runGenerator(t);
        for (const expected of ['13 nodes', '11 estimated pages']) {
            await t.page.locator(ACTIVE_PANE).getByText(expected, { exact: false })
                .waitFor({ timeout: 5000 });
        }
    } },
    { id: 'generator/validation-error', kind: 'still', run: async (t) => {
        const { templates, broken } = hierarchyScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, broken);
        // Not runGenerator(): that helper waits for the visual preview, which
        // never opens on a failed run. Click Preview and wait for the modal's
        // red role="alert" span instead (HierarchyGeneratorModal.tsx ~2341).
        await t.page.locator(ACTIVE_PANE).getByRole('button', { name: 'Preview', exact: true }).click();
        const alert = t.page.locator(`${ACTIVE_PANE} [role="alert"]`);
        await alert.waitFor({ timeout: 20000 });
        const text = (await alert.innerText()).trim();
        if (!text.includes(HIER_EXPECTED_ERROR)) {
            throw new Error(`validation-error: alert "${text}" != tutorial's quoted "${HIER_EXPECTED_ERROR}"`);
        }
        await settle(t.page, 400);
        await t.snap();
    } },
    { id: 'generator/planner-preview', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = plannerScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await runGenerator(t);
        // The tutorial's stated outcome, asserted against the live header
        // BEFORE snapping: 68 nodes (1 month + 31 days + 5 weeks + 31 refs),
        // 37 estimated pages (references never print). The month card behind
        // these numbers is the offset proof — day 01 in the 4th column.
        for (const expected of ['68 nodes', '37 estimated pages']) {
            await t.page.locator(ACTIVE_PANE).getByText(expected, { exact: false })
                .waitFor({ timeout: 5000 });
        }
        await t.snap();
    } },
    { id: 'generator/planner-month-canvas', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = plannerScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await runGenerator(t);
        await applyGeneratorAsNewProject(t, 'Docs Planner');
        // The new tab opens on the generated root — the month page. Its
        // title appears on the canvas and as the sidebar's root row.
        await t.page.locator(ACTIVE_PANE).getByText('January 2026', { exact: false })
            .first().waitFor({ timeout: 10000 });
        await settle(t.page, 800);
        await t.snap();
    } },
    { id: 'generator/clip-planner-run', kind: 'clip', run: async (t) => {
        const { templates, hierarchy } = plannerScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        t.beginClip();
        await settle(t.page, 700);                    // empty modal, briefly
        await pasteGeneratorScripts(t, templates, hierarchy);
        await settle(t.page, 900);                    // pasted scripts visible
        await runGenerator(t);                        // Preview -> Previewing... -> preview modal
    } },
];
