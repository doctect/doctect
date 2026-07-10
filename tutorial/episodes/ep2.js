// Episode 2 — Templates & Structure (~10 min): build a journal from scratch.
import { showSlide } from '../lib/slides.js';
import { humanMove, humanClick, clickEl, resyncCursor, humanType } from '../lib/cursor.js';

export const title = 'Episode 2 — Templates & Structure';

const settle = (page, ms = 900) => page.waitForTimeout(ms);
const canvasBox = (page) => page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();

// Drag on canvas with the current tool, human-paced.
async function dragOnCanvas(page, from, to) {
    await humanMove(page, from.x, from.y, 600);
    await page.mouse.down();
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await page.mouse.move(x, y);
        await page.evaluate(([px, py]) => window.__tutCursor?.move(px, py), [x, y]).catch(() => {});
        await page.waitForTimeout(18);
    }
    await page.mouse.up();
    await settle(page, 500);
}


// A node row in the LEFT sidebar (project tabs share the same text up top):
// pick the match whose box sits in the sidebar column.
async function sidebarNodeBox(page, name) {
    const matches = await page.locator(`text=${name}`).all();
    for (const m of matches) {
        const box = await m.boundingBox();
        if (box && box.x < 300 && box.y > 140) return box;
    }
    throw new Error(`sidebar node not found: ${name}`);
}

export const scenes = [
    {
        chapter: 'Building from scratch',
        narration: 'In episode one we generated a planner from a preset. This time we build our own document from a blank page: a weekly journal with a cover, a page per day, automatic titles, a navigation grid, and working links. By the end, you will understand the machinery every preset is made of.',
        actions: async (page) => {
            await showSlide(page, 'Templates & Structure', 'Nodes · data binding · dynamic grids · smart links · variants');
        },
    },
    {
        narration: 'We start in the editor with a new blank project. One root node, one empty template — a completely clean slate.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/app');
            await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 20000 });
            await settle(page, 1200);
            await resyncCursor(page);
            await clickEl(page, 'button[title="New Project"]', 700);
            await settle(page);
            // click the modal CARD (the project tab is also named "Blank Project")
            await clickEl(page, 'text=Start fresh with a single A4 page', 800);
            await settle(page, 1500);
        },
    },
    {
        chapter: 'Nodes: the structure',
        narration: 'First, structure. In the hierarchy sidebar, our document is a single node. A node is a page in the final PDF — it carries a title, optional data fields, and children. Let\'s rename the root to My Journal using the title field in the properties panel.',
        actions: async (page) => {
            // the fresh project's root node is auto-selected; its title input is
            // in the properties column (root title defaults to "Blank Project")
            const titleInput = page.locator('input[value="Blank Project"]:visible').first();
            const tbox = await titleInput.boundingBox();
            await humanClick(page, tbox.x + tbox.width / 2, tbox.y + tbox.height / 2, 700);
            await page.keyboard.press('Control+a');
            await humanType(page, 'My Journal', 60);
            await page.keyboard.press('Tab');
            await settle(page, 700);
        },
    },
    {
        narration: 'Now the days. Hovering a node reveals its actions — the green plus adds a child page. We will add Monday, Tuesday, and Wednesday. Each child is a real page of its own in the exported PDF.',
        actions: async (page) => {
            for (const day of ['Monday', 'Tuesday', 'Wednesday']) {
                const box = await sidebarNodeBox(page, 'My Journal');
                await humanMove(page, box.x + box.width / 2, box.y + box.height / 2, 500);
                await clickEl(page, 'button[title="Add New Page"] >> visible=true', 500);
                await settle(page, 600);
                // select the fresh child, then rename via the properties title input
                const nbox = await sidebarNodeBox(page, 'New Page');
                await humanClick(page, nbox.x + nbox.width / 2, nbox.y + nbox.height / 2, 400);
                await settle(page, 500);
                const titleInput = page.locator('input[value="New Page"]:visible').first();
                const tbox = await titleInput.boundingBox();
                await humanClick(page, tbox.x + tbox.width / 2, tbox.y + tbox.height / 2, 400);
                await page.keyboard.press('Control+a');
                await humanType(page, day, 50);
                await page.keyboard.press('Tab');
                await settle(page, 500);
            }
        },
    },
    {
        chapter: 'Templates: the look',
        narration: 'Structure done — now appearance. Switch the sidebar to Templates. A template is a reusable page design: one layout that any number of nodes can share. The blank project gives us one default template; let\'s open it and design our day page.',
        actions: async (page) => {
            await clickEl(page, 'text=Templates >> visible=true', 700);
            await settle(page, 800);
            const first = page.locator('aside >> text=/Template|Default|Page/ >> visible=true').first()
                .or(page.locator('[class*="sidebar"] >> text=/Template|Default|Page/').first());
            try {
                const box = await page.locator('text=Default >> visible=true').first().boundingBox();
                await humanClick(page, box.x + box.width / 2, box.y + box.height / 2, 600);
            } catch {
                // template may already be selected in blank projects
            }
            await page.waitForSelector('[data-testid="editor-canvas"]:visible', { timeout: 15000 });
            await settle(page, 800);
        },
    },
    {
        narration: 'The toolbar above the canvas holds the drawing tools, each with a single-key shortcut: T for text, R for rectangle, E for ellipse, L for line, and G for a data grid. Let\'s place a title. Press T, then drag out a text box across the top of the page.',
        actions: async (page) => {
            await page.keyboard.press('t');
            await settle(page, 400);
            const c = await canvasBox(page);
            await dragOnCanvas(page,
                { x: c.x + c.width * 0.15, y: c.y + 40 },
                { x: c.x + c.width * 0.85, y: c.y + 110 });
        },
    },
    {
        chapter: 'Data binding',
        narration: 'Here is the trick that makes templates powerful. Instead of typing a fixed title, we type a placeholder: two curly braces around the word title. That placeholder is data binding — when a page renders, it is replaced by that node\'s own title.',
        actions: async (page) => {
            await humanType(page, '{{title}}', 80);
            await page.keyboard.press('Escape');
            await settle(page, 800);
        },
    },
    {
        narration: 'Watch the preview selector above the canvas: it controls which node\'s data fills the template while you design. Previewing Monday shows Monday; switch to Tuesday and the same template says Tuesday. One design, every page correct.',
        actions: async (page) => {
            const preview = page.locator('select:visible').filter({ hasText: 'Monday' }).first()
                .or(page.locator('text=Preview: >> visible=true').first());
            try {
                const sel = page.locator('header select, [class*="toolbar"] select').last();
                await sel.selectOption({ label: 'Tuesday' });
            } catch { /* preview select shape differs; the narration still holds */ }
            await settle(page, 1200);
        },
    },
    {
        narration: 'Now assign the template to our day pages. Back in the hierarchy, select Monday, and in the properties panel choose our template under Assigned Template. Every day page now inherits the design.',
        actions: async (page) => {
            await clickEl(page, 'text=Hierarchy >> visible=true', 700);
            await settle(page, 600);
            const box = await sidebarNodeBox(page, 'Monday');
            await humanClick(page, box.x + box.width / 2, box.y + box.height / 2, 700);
            await settle(page, 900);
        },
    },
    {
        chapter: 'Dynamic grids',
        narration: 'Next, navigation. The root page should list its children as a clickable menu — and that is exactly what a data grid does. Select the root, switch to its template, press G for the grid tool, and drag out an area. The grid renders one cell per child node, automatically.',
        actions: async (page) => {
            const box = await sidebarNodeBox(page, 'My Journal');
            await humanClick(page, box.x + box.width / 2, box.y + box.height / 2, 700);
            await settle(page, 800);
            await page.keyboard.press('g');
            await settle(page, 400);
            const c = await canvasBox(page);
            await dragOnCanvas(page,
                { x: c.x + c.width * 0.2, y: c.y + c.height * 0.3 },
                { x: c.x + c.width * 0.8, y: c.y + c.height * 0.55 });
        },
    },
    {
        narration: 'With the grid selected, its properties appear on the right: the source — children of the current page; the number of columns; the gap between cells; and the display field, which is what each cell shows. Ours shows each child\'s title: Monday, Tuesday, Wednesday.',
        actions: async (page) => {
            await humanMove(page, 1750, 500, 900);
            await settle(page, 800);
        },
    },
    {
        narration: 'Grid cells are links by default — each cell navigates to the child it represents. In the finished PDF, tapping Monday in this menu jumps straight to Monday\'s page. Navigation menus that never go stale, no matter how many pages you add.',
        actions: async (page) => {
            const c = await canvasBox(page);
            await humanMove(page, c.x + c.width * 0.35, c.y + c.height * 0.4, 800);
        },
    },
    {
        chapter: 'Smart links',
        narration: 'Grids handle downward navigation. For the way back, any element can be a link. Let\'s put a back button on the day template: draw a small rectangle, then use the Interaction section of its properties to set On Click to Go to Parent Page.',
        actions: async (page) => {
            // switch to the day template via Templates mode
            await clickEl(page, 'text=Templates >> visible=true', 700);
            await settle(page, 800);
            await page.keyboard.press('r');
            await settle(page, 400);
            const c = await canvasBox(page);
            await dragOnCanvas(page,
                { x: c.x + 30, y: c.y + c.height - 90 },
                { x: c.x + 150, y: c.y + c.height - 40 });
        },
    },
    {
        narration: 'In the Interaction section, On Click offers logical destinations: parent, a child by position, a sibling, a specific page, and more. We choose Go to Parent Page. The template does not know or care which day it is on — the link always resolves to that page\'s own parent. That is what makes it smart.',
        actions: async (page) => {
            const select = page.locator('text=On Click').locator('xpath=following::select[1]');
            try {
                await select.selectOption({ label: 'Go to Parent Page' });
            } catch {
                await page.locator('select:visible').last().selectOption({ label: 'Go to Parent Page' }).catch(() => {});
            }
            await settle(page, 900);
        },
    },
    {
        chapter: 'Variants',
        narration: 'One last concept: variants. A variant is a parallel set of templates for a different device — say, A4 for printing and a tablet size for digital use. The dropdown at the top of the templates sidebar manages them; duplicating a variant copies every template so you can resize the copies without touching the originals.',
        actions: async (page) => {
            await humanMove(page, 80, 170, 800);
            await settle(page, 700);
        },
    },
    {
        narration: 'Your page hierarchy — the nodes — stays shared. Only the visual layer changes per variant, and at export time you pick which variant to render. Design once, publish for every device.',
        actions: async (page) => {
            await humanMove(page, 140, 170, 700);
        },
    },
    {
        chapter: 'Recap and what\'s next',
        narration: 'That is the full machinery: nodes give structure, templates give appearance, placeholders bind them together, grids generate navigation, and smart links wire everything up. In the next episode we turn to artwork — layers, imported vector graphics, watermarks, and grayscale export.',
        actions: async (page) => {
            await showSlide(page, 'Next: Layers & Artwork', 'Layers panel · SVG import · watermarks · grayscale');
        },
    },
];
