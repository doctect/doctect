// Episode 4 — Cloud & Gallery (~10 min)
import { showSlide } from '../lib/slides.js';
import { humanMove, humanClick, clickEl, resyncCursor, humanType } from '../lib/cursor.js';

export const title = 'Episode 4 — Cloud & Gallery';

const settle = (page, ms = 900) => page.waitForTimeout(ms);

const USER = { email: 'maya@doctect.dev', username: 'maya_designs', password: 'Tutorial-Pass-1!' };

async function fillField(page, selector, text) {
    await clickEl(page, selector, 600);
    await humanType(page, text, 45);
}

export const scenes = [
    {
        chapter: 'Going online',
        narration: 'So far everything lived in your browser. This episode takes your work online: creating an account, saving projects to the cloud with full version history, and publishing to the community gallery where anyone can browse, rate, and download your designs.',
        actions: async (page) => {
            await showSlide(page, 'Cloud & Gallery', 'Accounts · cloud saves · version history · publishing');
        },
    },
    {
        chapter: 'Creating an account',
        narration: 'From any page, Sign in leads to the account screen. We will create a fresh account: switch to sign up, pick a public username — that is the name shown on everything you publish — and choose a password. Passwords need twelve characters mixing case, digits, or symbols.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/login');
            await settle(page, 1000);
            await resyncCursor(page);
            await clickEl(page, 'text=Sign Up >> visible=true', 700);
            await settle(page, 600);
            await fillField(page, '#login-name', 'Maya');
            await fillField(page, '#login-username', USER.username);
            await fillField(page, '#login-email', USER.email);
            await fillField(page, '#login-password', USER.password);
            await settle(page, 400);
        },
    },
    {
        narration: 'Submitting brings up the verification step: PDF Architect emails you a confirmation link, and sign-in stays locked until you click it. That is what keeps the gallery free of throwaway accounts. Let\'s open the link from the email.',
        actions: async (page) => {
            await clickEl(page, 'button:has-text("Sign Up") >> visible=true', 700);
            await page.waitForSelector('text=Verify your email', { timeout: 20000 });
            await settle(page, 2000);
        },
    },
    {
        narration: 'One click on the emailed link and we are verified and signed in — the app drops us straight into the editor, ready to work.',
        actions: async (page, ctx) => {
            // dev servers log the email; in production this arrives in your inbox
            let link = null;
            for (let i = 0; i < 20 && !link; i++) {
                link = ctx.servers.lastVerificationLink();
                if (!link) await page.waitForTimeout(500);
            }
            if (!link) throw new Error('no verification link in server log');
            await page.goto(link);
            await page.waitForURL('**/app**', { timeout: 20000 });
            await settle(page, 1500);
            await resyncCursor(page);
        },
    },
    {
        chapter: 'Saving to the cloud',
        narration: 'The Cloud menu in the header is now unlocked. Nothing ever syncs silently — you decide when a snapshot goes up. Save to cloud stores the entire project as an immutable commit; save again later and you get another commit, never an overwrite.',
        actions: async (page) => {
            // saving prompts for a commit message via window.prompt — answer it
            page.on('dialog', d => d.accept(d.defaultValue() || 'Tutorial save'));
            await clickEl(page, 'text=Cloud >> visible=true', 800);
            await settle(page, 900);
            await clickEl(page, 'text=Save to cloud >> visible=true', 800);
            await settle(page, 2500);
            await humanClick(page, 700, 72, 500); // dismiss the menu (outside click)
        },
    },
    {
        narration: 'Let\'s make a change and save a second version — drop a rectangle onto the page, then save again. Two commits now exist, and that is what version history is built from.',
        actions: async (page) => {
            await page.keyboard.press('r');
            const c = await page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();
            await humanMove(page, c.x + c.width * 0.3, c.y + c.height * 0.3, 500);
            await page.mouse.down();
            await page.mouse.move(c.x + c.width * 0.6, c.y + c.height * 0.5, { steps: 20 });
            await page.mouse.up();
            await settle(page, 800);
            await page.keyboard.press('Escape');
            await clickEl(page, 'text=Cloud >> visible=true', 700);
            await settle(page, 700);
            await clickEl(page, 'text=Save to cloud >> visible=true', 700);
            await settle(page, 2500);
            await humanClick(page, 700, 72, 500); // dismiss the menu
        },
    },
    {
        chapter: 'Version history',
        narration: 'Version history lists every commit, newest first. Restore reverts your open project to exactly that snapshot — and because restoring is itself just your local state changing, nothing in the cloud is lost. Your history only ever grows.',
        actions: async (page) => {
            await page.keyboard.press('Escape');
            await settle(page, 400);
            await clickEl(page, 'text=Cloud >> visible=true', 700);
            await settle(page, 700);
            await clickEl(page, 'text=Version history >> visible=true', 800);
            await settle(page, 2500);
            const close = page.locator('button:has-text("Close"):visible, [title="Close"]:visible').first();
            try { const b = await close.boundingBox(); await humanClick(page, b.x + b.width / 2, b.y + b.height / 2, 500); }
            catch { await page.keyboard.press('Escape'); }
            // ensure the modal is really gone before the next scene touches the header
            await page.locator('text=Restore').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(async () => {
                await page.keyboard.press('Escape');
                await page.mouse.click(450, 1000);
            });
            await settle(page, 500);
        },
    },
    {
        chapter: 'Publishing to the gallery',
        narration: 'Now the fun part: publishing. The publish wizard asks for a description and tags, then renders preview thumbnails right in your browser — what you see here is exactly what gallery visitors will see on your project\'s card.',
        actions: async (page) => {
            await page.keyboard.press('Escape');
            await settle(page, 400);
            await clickEl(page, 'text=Cloud >> visible=true', 700);
            await settle(page, 700);
            await clickEl(page, 'text=Publish to gallery >> visible=true', 800);
            await settle(page, 1500);
            await fillField(page, 'textarea[placeholder="What is this planner for?"]', 'A minimalist starter page — built live in the tutorial series.');
            await fillField(page, 'input[placeholder="planner, 2026, remarkable"]', 'tutorial, starter, minimal');
            await settle(page, 600);
        },
    },
    {
        narration: 'Hit Publish, and the thumbnails render, upload, and the project goes live. Publishing never happens by accident: it is always this explicit, and an unpublish button in the same menu takes it back down any time.',
        actions: async (page) => {
            await clickEl(page, 'button:has-text("Publish") >> visible=true', 700);
            await page.waitForTimeout(8000); // thumbnail render + upload
        },
    },
    {
        chapter: 'Browsing the gallery',
        narration: 'And here it is in the gallery. The default view curates rows — top rated, popular, recently updated — and the search box matches names, descriptions, and tags. Every filtered view has a shareable URL.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/gallery');
            await settle(page, 2000);
            await resyncCursor(page);
            await humanMove(page, 960, 400, 900);
        },
    },
    {
        narration: 'A project\'s page shows its previews, description, author, and three buttons that matter: Open in editor clones it into your own local workspace — no account needed; Download all variants packages a PDF per device size into one zip; and version history lets you clone any older revision. Signed-in visitors can also rate it and leave a review.',
        actions: async (page) => {
            const card = page.locator('text=Blank Project >> visible=true').first();
            const box = await card.boundingBox();
            if (box) {
                await humanClick(page, box.x + box.width / 2, box.y + box.height / 2, 800);
                await settle(page, 2000);
            }
        },
    },
    {
        chapter: 'What\'s next',
        narration: 'Your work is in the cloud, versioned, and published for the community. The final episode covers what happens when someone else picks it up: forking, proposing changes, and merging them back — collaboration, PDF style.',
        actions: async (page) => {
            await showSlide(page, 'Next: Collaboration', 'Forking · merge requests · reviewing · merging');
        },
    },
];
