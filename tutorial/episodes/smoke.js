// 3-scene pipeline smoke test — not a real episode.
import { showSlide } from '../lib/slides.js';
import { humanMove, clickEl, resyncCursor } from '../lib/cursor.js';

export const title = 'Pipeline Smoke Test';

export const scenes = [
    {
        chapter: 'Intro',
        narration: 'Welcome to PDF Architect. This short clip is a pipeline test: a title card, the landing page, and the documentation.',
        actions: async (page) => {
            await showSlide(page, 'Pipeline Smoke Test', 'Checking cursor, pacing, and audio sync');
        },
    },
    {
        chapter: 'Landing page',
        narration: 'This is the landing page. From here you can launch the editor, explore the community gallery, or read the documentation.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/');
            await page.waitForTimeout(800);
            await resyncCursor(page);
            await humanMove(page, 700, 460, 800);
            await humanMove(page, 960, 620, 800);
        },
    },
    {
        narration: 'The documentation covers every feature in depth, and it is where each episode of this series will point you for more detail.',
        actions: async (page) => {
            await clickEl(page, 'main a[href="/docs"]', 700);
            await page.waitForTimeout(1000);
            await resyncCursor(page);
        },
    },
];
