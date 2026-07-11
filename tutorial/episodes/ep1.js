// Episode 1 — Getting Started with PDF Architect (~8 min)
import { showSlide } from '../lib/slides.js';
import { humanMove, humanClick, clickEl, resyncCursor } from '../lib/cursor.js';

export const title = 'Episode 1 — Getting Started with PDF Architect';

const settle = (page, ms = 900) => page.waitForTimeout(ms);

export const scenes = [
    {
        chapter: 'Welcome',
        narration: 'Welcome to PDF Architect — a visual builder for hierarchical, hyperlinked PDF documents: planners, notebooks, journals, and reports. In this first episode, you will create a complete planner from a preset, learn your way around the editor, make your first edit, and export a finished, fully linked PDF.',
        actions: async (page) => {
            await showSlide(page, 'Getting Started', 'Create a project, tour the editor, export your first PDF');
        },
    },
    {
        chapter: 'The landing page',
        narration: 'This is the landing page. The three buttons in the middle mirror the three places you will spend your time: the editor, where documents are built; the community gallery, where creators publish and share their designs; and the documentation, which covers every feature in depth.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/');
            await settle(page);
            await resyncCursor(page);
            await humanMove(page, 715, 542, 900);
            await humanMove(page, 995, 542, 900);
            await humanMove(page, 1238, 542, 900);
        },
    },
    {
        narration: 'Everything works locally in your browser — no account is needed to design and export. Signing up only becomes relevant later, when you want to save projects to the cloud or publish them. Let\'s start building.',
        actions: async (page) => {
            await humanMove(page, 715, 542, 900);
        },
    },
    {
        chapter: 'Creating a project',
        narration: 'Clicking Start Building Now opens the editor with a fresh blank project. The fastest way to get a feel for it, though, is to start from a preset — a complete, working document you can pick apart. Let\'s open the project menu and create one.',
        actions: async (page) => {
            await clickEl(page, 'main a[href="/app"]', 700);
            await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 20000 });
            await settle(page, 1500);
            await resyncCursor(page);
        },
    },
    {
        narration: 'The plus button next to the project tabs creates a new project. It ships with three presets: a blank canvas, a notebook, and a full twenty-twenty-six planner with a year view, twelve months, and a page for every single day.',
        actions: async (page) => {
            await clickEl(page, 'button[title="New Project"]', 700);
            await settle(page);
        },
    },
    {
        narration: 'We will take the planner. One click — and the entire document structure is generated for you: hundreds of linked pages, built from just a handful of reusable templates. That difference — pages generated from templates, rather than drawn one by one — is the core idea behind everything else you will see.',
        actions: async (page) => {
            await clickEl(page, 'text=2026 Planner', 800);
            await page.waitForTimeout(2500);
            await resyncCursor(page);
        },
    },
    {
        chapter: 'Finding your way around',
        narration: 'The editor has three areas. On the left, the sidebar — this is the structure of your document, a tree of pages called nodes. In the middle, the canvas shows the page you are working on. And on the right, the properties column, where everything selected can be inspected and changed.',
        actions: async (page) => {
            await humanMove(page, 150, 400, 900);
            await humanMove(page, 750, 500, 900);
            await humanMove(page, 1750, 400, 900);
        },
    },
    {
        narration: 'The planner is organized the way you would expect a document to be: the year at the top, quarters beneath it, then months, then days. Clicking any node opens that page on the canvas — here is the first quarter\'s overview.',
        actions: async (page) => {
            const q1 = page.locator('aside, [class*="sidebar"], nav').locator('text=Quarter 1').first().or(page.locator('text=Quarter 1').first());
            await page.locator('text=Quarter 1').first().waitFor({ timeout: 10000 });
            const box = await page.locator('text=Quarter 1').first().boundingBox();
            await humanClick(page, box.x + 12, box.y + box.height / 2, 800);
            await settle(page, 1200);
        },
    },
    {
        narration: 'The chevron next to a node unfolds its children. Inside Quarter One sit January, February, and March — and opening January shows the month view, with a page for every single day nested below it.',
        actions: async (page) => {
            const q1 = await page.locator('text=Quarter 1').first().boundingBox();
            await humanClick(page, q1.x - 14, q1.y + q1.height / 2, 700); // chevron
            await settle(page, 800);
            const jan = page.locator('text=January').first();
            await jan.waitFor({ timeout: 10000 });
            const box = await jan.boundingBox();
            // click the LEFT edge of the label: the text wrapper spans the row,
            // and its center sits under the hover-action buttons (edit pencil)
            await humanClick(page, box.x + 12, box.y + box.height / 2, 800);
            await page.keyboard.press('Escape'); // dismiss rename if it opened anyway
            await settle(page, 1200);
        },
    },
    {
        narration: 'Notice what just happened: the canvas is showing January\'s month view — a calendar grid — but nobody ever drew a January page. The month template is being filled in with January\'s data: its name, its days, and links to each day page. One template, twelve months.',
        actions: async (page) => {
            await humanMove(page, 760, 520, 1000);
        },
    },
    {
        narration: 'The canvas itself pans and zooms like any design tool. Hold the spacebar to pan, or use control and your scroll wheel to zoom. The toolbar above the canvas holds the drawing tools — text, shapes, lines, and data grids — plus undo, redo, and snapping.',
        actions: async (page) => {
            await humanMove(page, 500, 119, 800);
            await humanMove(page, 620, 119, 700);
        },
    },
    {
        chapter: 'Making your first edit',
        narration: 'Let\'s make an edit. Templates live in their own sidebar mode — switching to Templates shows every layout this document uses: year view, month view, week view, day view, and a few speciality pages. Selecting Month View opens the template itself — the master copy that all twelve month pages inherit.',
        actions: async (page) => {
            await clickEl(page, 'text=Templates', 700);
            await settle(page, 1000);
            await clickEl(page, 'text=Month View', 700);
            await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 15000 });
            await settle(page, 1000);
        },
    },
    {
        narration: 'Selecting an element on the canvas highlights it and opens its properties on the right — position, size, colors, fonts, and interactions. This title bar is one element; every month page rendered from this template shows it with its own name.',
        actions: async (page) => {
            // click the title element: pick the "January" text whose box sits
            // INSIDE the canvas page (the preview dropdown matches too)
            const c = await page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();
            let target = null;
            for (const m of await page.locator('text=January').all()) {
                const b = await m.boundingBox();
                if (b && b.x > c.x && b.x < c.x + c.width && b.y > c.y && b.y < c.y + c.height) { target = b; break; }
            }
            if (!target) throw new Error('canvas January title not found');
            await humanClick(page, target.x + target.width / 2, target.y + target.height / 2, 800);
            await settle(page, 800);
        },
    },
    {
        narration: 'Every change is immediate, and undo has your back — control Z steps backward through everything you have done. If you select the wrong thing, escape clears the selection.',
        actions: async (page) => {
            await page.keyboard.press('Escape');
            await settle(page, 600);
        },
    },
    {
        chapter: 'Exporting your PDF',
        narration: 'Time to ship it. The Export PDF button in the top right renders the whole hierarchy — every node becomes a page, every link becomes a real PDF hyperlink that works in GoodNotes, Notability, and any decent PDF reader. For a planner this size it takes a few seconds.',
        actions: async (page) => {
            await humanMove(page, 1370, 72, 900);
            const download = page.waitForEvent('download', { timeout: 60000 });
            await clickEl(page, 'text=Export PDF >> visible=true', 600);
            await download;
            await settle(page, 1200);
        },
    },
    {
        narration: 'And that is a complete, interlinked planner — designed from four templates, generated as hundreds of pages, and exported in seconds. Tap any date in the year view and your PDF reader jumps straight to that day.',
        actions: async (page) => {
            await humanMove(page, 760, 500, 900);
        },
    },
    {
        chapter: 'What\'s next',
        narration: 'In the next episode, we build a document from scratch: creating templates, binding data with placeholders, laying out dynamic grids, and wiring up smart links. See you there.',
        actions: async (page) => {
            await showSlide(page, 'Next: Templates & Structure', 'Data binding · dynamic grids · smart linking · variants');
        },
    },
];
