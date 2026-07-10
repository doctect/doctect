// Episode 3 — Layers & Artwork (~9 min)
import { showSlide } from '../lib/slides.js';
import { humanMove, humanClick, clickEl, resyncCursor } from '../lib/cursor.js';
import path from 'node:path';

export const title = 'Episode 3 — Layers & Artwork';

const settle = (page, ms = 900) => page.waitForTimeout(ms);
const canvasBox = (page) => page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();
const SVG_FIXTURE = path.resolve('tutorial/assets/crossed-swords.svg');

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

export const scenes = [
    {
        chapter: 'Layers and artwork',
        narration: 'Documents get crowded: backgrounds, frames, content, decorations — all stacked on one page. This episode covers the tools that keep that manageable: the layer system, selection tricks for overlapping elements, imported vector artwork, watermarks, and grayscale export.',
        actions: async (page) => {
            await showSlide(page, 'Layers & Artwork', 'Layers panel · overlap selection · SVG import · grayscale');
        },
    },
    {
        narration: 'We start with a fresh blank project, and draw two overlapping rectangles — a large one, then a smaller one right on top of it. Exactly the situation where clicking gets frustrating in most editors.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/app');
            await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 20000 });
            await settle(page, 1200);
            await resyncCursor(page);
            await page.keyboard.press('r');
            const c = await canvasBox(page);
            await dragOnCanvas(page,
                { x: c.x + c.width * 0.2, y: c.y + c.height * 0.15 },
                { x: c.x + c.width * 0.8, y: c.y + c.height * 0.5 });
            await page.keyboard.press('r');
            await dragOnCanvas(page,
                { x: c.x + c.width * 0.35, y: c.y + c.height * 0.22 },
                { x: c.x + c.width * 0.65, y: c.y + c.height * 0.42 });
        },
    },
    {
        chapter: 'The Layers panel',
        narration: 'The Layers panel lives in the properties column, between Template Settings and Element Properties. Every template organizes its elements into named layers — new documents start with a single default layer holding everything.',
        actions: async (page) => {
            await page.keyboard.press('Escape');
            await clickEl(page, 'text=Layers >> visible=true', 800);
            await settle(page, 1000);
        },
    },
    {
        narration: 'Each layer row carries its controls: visibility, lock, a color label, and renaming. Hiding a layer removes its elements everywhere — the canvas, the exported PDF, even gallery thumbnails. Locking keeps a layer visible but makes it untouchable: clicks pass straight through to whatever is underneath.',
        actions: async (page) => {
            await humanMove(page, 1750, 480, 900);
            await settle(page, 800);
        },
    },
    {
        chapter: 'Selecting through the stack',
        narration: 'Now, the overlap problem. Our small rectangle completely covers the middle of the big one. A normal click always selects the top element. But watch: clicking again on the same spot cycles the selection one step down the stack — the big rectangle underneath is now selected, without moving anything.',
        actions: async (page) => {
            const c = await canvasBox(page);
            const cx = c.x + c.width * 0.5, cy = c.y + c.height * 0.3;
            await humanClick(page, cx, cy, 800);
            await settle(page, 900);
            await humanClick(page, cx, cy, 500);
            await settle(page, 1200);
        },
    },
    {
        narration: 'There are two more ways down the stack. Alt-click cycles through the elements under the cursor explicitly. And a right click opens a select-under menu listing everything below the pointer — hovering an entry outlines the element it refers to, so identical entries are easy to tell apart.',
        actions: async (page) => {
            const c = await canvasBox(page);
            const cx = c.x + c.width * 0.5, cy = c.y + c.height * 0.3;
            await humanMove(page, cx, cy, 600);
            await page.mouse.click(cx, cy, { button: 'right' });
            await settle(page, 1400);
            // hover the entries to show the on-canvas outline
            const items = await page.locator('text=Rect >> visible=true').all();
            for (const item of items.slice(0, 2)) {
                const box = await item.boundingBox();
                if (box) await humanMove(page, box.x + box.width / 2, box.y + box.height / 2, 600);
                await settle(page, 500);
            }
            await page.keyboard.press('Escape');
            await settle(page, 500);
        },
    },
    {
        chapter: 'Importing vector artwork',
        narration: 'Templates are not limited to primitive shapes. The Import SVG button in the toolbar accepts any vector file — logos, ornaments, illustrations. Let\'s import a crossed-swords emblem and place it on the page.',
        actions: async (page) => {
            await page.locator('input[type="file"][accept=".svg"]:visible, input[type="file"][accept=".svg"]').first()
                .setInputFiles(SVG_FIXTURE);
            await settle(page, 1500);
            await humanMove(page, 950, 500, 800);
        },
    },
    {
        narration: 'Once placed, an SVG behaves like any other element: move it, resize it, layer it, link it. In the exported PDF it stays true vector — crisp at any zoom, tiny on disk.',
        actions: async (page) => {
            // select it via its Layers-panel row (also shows off panel selection)
            await clickEl(page, 'text=Svg >> visible=true', 800);
            await settle(page, 900);
        },
    },
    {
        chapter: 'Watermarks with opacity',
        narration: 'Combine an SVG with the opacity slider and you have a watermark. Dropping opacity to a few percent turns the emblem into a subtle background stamp — and the export pipeline composes element opacity correctly with any transparency inside the artwork itself.',
        actions: async (page) => {
            const slider = page.locator('input[type="range"]:visible').first();
            const box = await slider.boundingBox();
            if (box) {
                // drag the opacity slider to ~15%
                await humanMove(page, box.x + box.width * 0.9, box.y + box.height / 2, 600);
                await page.mouse.down();
                await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, { steps: 15 });
                await page.mouse.up();
            }
            await settle(page, 1200);
        },
    },
    {
        chapter: 'Grayscale export',
        narration: 'One last production tool: grayscale. E-ink devices render color documents unpredictably, so the toolbar has a grayscale toggle next to Export PDF. Turning it on previews the whole canvas in grayscale — exactly what the exported file will look like — and the export renders every element, including SVG artwork, desaturated.',
        actions: async (page) => {
            await clickEl(page, '[title*="Greyscale Export"] >> visible=true', 800);
            await settle(page, 1600);
        },
    },
    {
        narration: 'Toggle it off and the color comes back. Nothing about the document changed — grayscale is purely an export decision, made at the moment you ship the file.',
        actions: async (page) => {
            await clickEl(page, '[title*="Greyscale Export"] >> visible=true', 700);
            await settle(page, 1200);
        },
    },
    {
        chapter: 'What\'s next',
        narration: 'Layers keep complex pages manageable; SVGs and opacity give them character. Next episode we leave the local editor: accounts, cloud saves, version history, and publishing your work to the community gallery.',
        actions: async (page) => {
            await showSlide(page, 'Next: Cloud & Gallery', 'Accounts · cloud saves · version history · publishing');
        },
    },
];
