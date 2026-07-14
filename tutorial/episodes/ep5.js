// Episode 5 — Collaboration (~9 min): fork, propose changes, review, merge.
import { createRequire } from 'node:module';
import { showSlide } from '../lib/slides.js';
import { humanMove, humanClick, clickEl, resyncCursor, humanType } from '../lib/cursor.js';

const require = createRequire(import.meta.url);

export const title = 'Episode 5 — Collaboration';

const settle = (page, ms = 900) => page.waitForTimeout(ms);

const OWNER = { email: 'maya@doctect.dev', username: 'maya_designs', password: 'Tutorial-Pass-1!', name: 'Maya' };
const VIEWER = { email: 'leo@doctect.dev', username: 'leo_builds', password: 'Tutorial-Pass-2!', name: 'Leo' };
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const API = 'http://localhost:3001';
const ORIGIN = 'http://localhost:5199';

// Off-screen setup: the "project owner" (maya) exists with a published
// project before the episode starts — created through the real API, exactly
// like a user would, just not on camera.
async function setupOwner(servers) {
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
    await fetch(`${API}/api/auth/sign-up/email`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: OWNER.email, password: OWNER.password, name: OWNER.name, username: OWNER.username }),
    });
    const Database = require('better-sqlite3');
    const db = new Database(servers.sqlitePath);
    db.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run(OWNER.email);
    db.close();
    const signin = await fetch(`${API}/api/auth/sign-in/email`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
    });
    const cookie = (signin.headers.getSetCookie?.() ?? [signin.headers.get('set-cookie')])
        .map(c => c.split(';')[0]).join('; ');
    const authed = { ...headers, Cookie: cookie };

    const state = {
        nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Weekly Planner', data: {}, children: [] } },
        rootId: 'root',
        variants: { default: { id: 'default', name: 'Default', templates: { page: {
            id: 'page', name: 'Page', width: 500, height: 700,
            layers: [{ id: 'main', name: 'Layer 1', order: 0, visible: true, locked: false }],
            elements: [
                { id: 'bg', type: 'rect', x: 40, y: 40, w: 420, h: 80, rotation: 0, fill: '#dbeafe', stroke: '#1d4ed8', strokeWidth: 1, opacity: 1, zIndex: 1, layerId: 'main' },
                { id: 'ttl', type: 'text', x: 60, y: 60, w: 380, h: 40, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, zIndex: 2, text: '{{title}}', fontSize: 24, fontFamily: 'helvetica', textColor: '#1e293b', layerId: 'main' },
            ],
        } } } },
        activeVariantId: 'default',
        schemaVersion: 8,
        // editor UI state — the editor expects these on imported/forked states
        viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
        selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
        scale: 1, tool: 'select', showJsonModal: false,
        sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
        showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
        clipboard: [],
    };
    const proj = await (await fetch(`${API}/api/projects`, {
        method: 'POST', headers: authed,
        body: JSON.stringify({ name: 'Weekly Planner', state, message: 'Initial design' }),
    })).json();
    await fetch(`${API}/api/projects/${proj.project.id}/publish`, {
        method: 'POST', headers: { ...authed, 'If-Match': proj.project.headCommitId },
        body: JSON.stringify({ description: 'A clean weekly planner spread — fork it and make it yours.', tags: ['weekly', 'planner'], thumbnails: [PNG_1X1] }),
    });
    return proj.project.id;
}

export const scenes = [
    {
        chapter: 'Collaboration',
        narration: 'Publishing puts your design in front of the community — collaboration is what happens next. In this final episode, another creator forks a published planner, improves it, and proposes the changes back to the original author, who reviews and merges them. GitHub-style collaboration, for PDF design.',
        actions: async (page, ctx) => {
            await showSlide(page, 'Collaboration', 'Forking · merge requests · review · merging');
            ctx.ownerProjectId = await setupOwner(ctx.servers);
            // saving/proposing later prompts via window.prompt / confirm
            page.on('dialog', d => d.accept(d.defaultValue() || 'Tutorial'));
        },
    },
    {
        narration: 'Meet the cast. Maya has published her Weekly Planner to the gallery. And we are Leo — a creator who found it, likes it, and thinks the header deserves a bolder look. Leo has his own account, made exactly the way we did in episode four.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/login');
            await settle(page, 800);
            await resyncCursor(page);
            await clickEl(page, 'text=Sign Up >> visible=true', 600);
            await settle(page, 500);
            for (const [sel, val] of [['#login-name', VIEWER.name], ['#login-username', VIEWER.username], ['#login-email', VIEWER.email], ['#login-password', VIEWER.password]]) {
                await clickEl(page, sel, 400);
                await humanType(page, val, 35);
            }
            await clickEl(page, 'button:has-text("Sign Up") >> visible=true', 600);
            await page.waitForSelector('text=Verify your email', { timeout: 20000 });
            let link = null;
            for (let i = 0; i < 20 && !link; i++) {
                link = ctx.servers.lastVerificationLink();
                if (!link || !link.includes('callbackURL')) { link = null; await page.waitForTimeout(500); }
            }
            await page.goto(link);
            await page.waitForURL('**/app**', { timeout: 20000 });
            await settle(page, 1000);
            await resyncCursor(page);
        },
    },
    {
        chapter: 'Forking',
        narration: 'Leo finds the Weekly Planner in the gallery. Fork this project copies its current version into a brand-new private project that Leo owns — with a permanent link back to where it came from. Maya\'s original is untouched, and Leo\'s fork stays private unless he publishes it himself.',
        actions: async (page, ctx) => {
            await page.goto(ctx.servers.baseUrl + '/gallery/' + ctx.ownerProjectId);
            await settle(page, 1500);
            await resyncCursor(page);
            await clickEl(page, 'text=Fork this project >> visible=true', 900);
            await page.waitForURL('**/app**', { timeout: 20000 });
            await settle(page, 1500);
            await resyncCursor(page);
        },
    },
    {
        narration: 'The fork opens straight in the editor, already linked to Leo\'s cloud account. Time for that bolder header: we select the banner and give it a stronger color.',
        actions: async (page) => {
            const c = await page.locator('[data-testid="editor-canvas"]:visible').first().boundingBox();
            // the banner rect sits near the top of the page
            await humanClick(page, c.x + c.width * 0.5, c.y + c.height * 0.11, 900);
            await settle(page, 900);
            // nudge it taller via the H input as a visible edit
            const hInput = page.locator('text=GEOMETRY').locator('xpath=following::input[4]');
            try {
                const b = await hInput.boundingBox();
                await humanClick(page, b.x + b.width / 2, b.y + b.height / 2, 500);
                await page.keyboard.press('Control+a');
                await humanType(page, '120', 60);
                await page.keyboard.press('Tab');
            } catch { /* geometry input layout differs; the drag below still edits */ }
            await settle(page, 900);
        },
    },
    {
        narration: 'Save the fork to the cloud — that snapshot is what we will propose. A fork can accumulate as many commits as you like before proposing; the merge request always carries your latest saved state.',
        actions: async (page) => {
            await clickEl(page, 'text=Cloud >> visible=true', 700);
            await settle(page, 700);
            await clickEl(page, 'text=Save to cloud >> visible=true', 700);
            await settle(page, 2500);
            await humanClick(page, 700, 72, 500); // dismiss menu
        },
    },
    {
        chapter: 'Proposing changes',
        narration: 'The Cloud menu on a fork has one extra entry: Propose changes to upstream. Give the proposal a title and a short explanation — this is what the owner reads first — and submit.',
        actions: async (page) => {
            await clickEl(page, 'text=Cloud >> visible=true', 700);
            await settle(page, 700);
            await clickEl(page, 'text=Propose changes to upstream >> visible=true', 800);
            await settle(page, 1000);
            await clickEl(page, 'input[placeholder*="Add iPad variant"]', 500);
            await humanType(page, 'Bolder header banner', 45);
            await clickEl(page, 'textarea[placeholder="What changed and why?"]', 500);
            await humanType(page, 'Taller banner makes the week title readable at a glance.', 30);
            await settle(page, 500);
            await clickEl(page, 'button:has-text("Create merge request") >> visible=true', 700);
            await page.waitForURL('**/mr/**', { timeout: 20000 });
            await settle(page, 1500);
            await resyncCursor(page);
        },
    },
    {
        narration: 'This is the merge request page. As the author, Leo sees the proposal is open and waiting for the project owner to review it. The change list is structured — which templates changed, which pages were added — not a wall of raw code. And this diff is recomputed live, so it always reflects the upstream project as it is right now.',
        actions: async (page, ctx) => {
            ctx.mrUrl = page.url();
            await humanMove(page, 960, 480, 900);
        },
    },
    {
        chapter: 'The owner reviews',
        narration: 'Meanwhile, Maya gets an email: someone proposed changes to your project, with a direct link to the review page. Let\'s switch accounts and see her side.',
        actions: async (page, ctx) => {
            const log = (await import('node:fs')).readFileSync(ctx.servers.apiLog, 'utf8');
            const m = log.match(/New merge request for "[^"]+"/g);
            await showSlide(page, 'You\'ve got mail', (m && m[m.length - 1]) || 'New merge request for "Weekly Planner"');
        },
    },
    {
        narration: 'Signed in as Maya, the same merge request page offers more: as the target owner she sees the guidance to review and merge, a before and after preview of the affected page, and the Merge button.',
        actions: async (page, ctx) => {
            // switch user: sign out via account menu, sign in as maya
            await page.goto(ctx.servers.baseUrl + '/login');
            await settle(page, 800);
            await resyncCursor(page);
            // if still signed in as leo, the login page redirects; sign out first via account menu
            const acct = page.locator(`text=${VIEWER.username} >> visible=true`).first();
            if (await acct.count()) {
                const b = await acct.boundingBox();
                if (b) {
                    await humanClick(page, b.x + b.width / 2, b.y + b.height / 2, 600);
                    await settle(page, 500);
                    await clickEl(page, 'text=Sign out >> visible=true', 600);
                    await settle(page, 800);
                    await page.goto(ctx.servers.baseUrl + '/login');
                    await settle(page, 800);
                }
            }
            await clickEl(page, '#login-email', 500);
            await humanType(page, OWNER.email, 35);
            await clickEl(page, '#login-password', 500);
            await humanType(page, OWNER.password, 35);
            await clickEl(page, 'button:has-text("Sign In") >> visible=true', 600);
            // sign-in bounces through /login?verified=1 before settling on /app
            await page.waitForURL('**/app**', { timeout: 20000 }).catch(() => {});
            await settle(page, 1500);
            try { await page.goto(ctx.mrUrl); }
            catch { await settle(page, 1500); await page.goto(ctx.mrUrl); }
            await settle(page, 2000);
            await resyncCursor(page);
        },
    },
    {
        chapter: 'Merging',
        narration: 'One click on Merge, and Leo\'s change lands as a new commit in Maya\'s own version history — her independent edits, if she had made any, would survive untouched. If both sides had edited the same template, the request would be flagged as conflicted and the merge refused until the fork caught up. Safe by default.',
        actions: async (page) => {
            await clickEl(page, 'button:has-text("Merge") >> visible=true', 900);
            await settle(page, 3000);
        },
    },
    {
        narration: 'Merged. The status flips, the guidance updates, and the gallery now serves Maya\'s planner with Leo\'s improvement inside. Fork counts and version history tell the story of every project\'s collaborators.',
        actions: async (page) => {
            await humanMove(page, 960, 400, 900);
        },
    },
    {
        chapter: 'Series wrap',
        narration: 'And that completes the series: from a blank page to templates, structure and data binding; layers and artwork; the cloud and the gallery; and finally collaboration. Everything you watched was built with the same five tools you now know. The documentation covers every detail — now go build something worth forking.',
        actions: async (page) => {
            await showSlide(page, 'Thanks for watching', 'Docs: /docs · Gallery: /gallery — go build something worth forking');
        },
    },
];
