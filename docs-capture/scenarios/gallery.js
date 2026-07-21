// Gallery-wave captures: browsing, project pages, and public version history
// as an ANONYMOUS visitor. Accounts persist for the lifetime of one sealed
// server (one per scenario run) but every shot starts in a fresh signed-out
// context, so each shot re-authenticates via ensureUser and re-checks the
// seed via ensurePublished before doing its own signed-out work.
import { gotoEditor, newNotebookProject, selectSidebarNode, settle, ACTIVE_PANE } from '../lib/app.js';
import { ensureUser, saveToCloud, publishProject, signOut } from '../lib/cloud.js';

// Module-level users shared by the whole gallery wave (later scenarios fork
// the OWNER's published project as FORKER). Usernames use underscores, not
// the brief's hyphens: pages/LoginPage.tsx:103 validates against
// /^[a-zA-Z0-9_]{3,30}$/ client-side (server-enforced too), so a hyphenated
// username never gets past the sign-up form -- same gotcha smoke-cloud.js
// documents for docs_owner/docs_forker.
export const OWNER = { username: 'atlas_designs', email: 'owner@docs.test', password: 'DocsCapture2026!' };
export const FORKER = { username: 'quill_and_ink', email: 'forker@docs.test', password: 'DocsCapture2026!' };

// The published card/detail name. NOT "Simple Notebook": that's only the
// preset CARD's title -- pages/EditorPage.tsx:160-162 names the created
// project "My Notebook", and publishing sets published_name = name
// (server/routes/projects.js:343), so "My Notebook" is what the gallery
// shows and what the already-seeded probe below must look for.
export const PUBLISHED_NAME = 'My Notebook';

const DESCRIPTION = 'A structured notebook with cover, dividers, and lined pages.';
const TAGS = 'notebook, minimal';
// Cover ("My Notebook") is pre-selected by the publish modal; these two add
// a section divider and a lined page so the detail page shows a real spread.
const PREVIEW_PAGES = ['Project A', 'Project A - Page 1'];
export const COMMIT_V1 = 'Cover, three sections, lined pages';
export const COMMIT_V2 = 'Rename the second section to Sketches';

// Publishes the seeded notebook once -- TWICE, in fact: two saves and two
// publishes, because the anonymous Version-history modal only lists
// commits pinned by a publish (server/routes/projects.js:263-266 filters
// non-owner listings to project_publications rows -- private in-between
// saves never appear). One publish would leave the "time-travel" shot
// showing a single-row history; two give it a real past to clone.
// Idempotent + safe to call at the top of any shot: the /gallery probe
// waits until either the published card or the empty-gallery text is
// actually rendered (sections load async -- a fixed settle could read a
// false negative mid-skeleton and re-publish a duplicate), and only seeds
// on the empty outcome. Always leaves the context signed out (on /login).
export async function ensurePublished(t) {
    await ensureUser(t, OWNER);
    await t.page.goto(t.baseUrl + '/gallery');
    const card = t.page.getByText(PUBLISHED_NAME).first();
    const empty = t.page.getByText('Nothing here yet').first();
    await card.or(empty).first().waitFor({ state: 'visible', timeout: 20000 });
    const already = await card.isVisible().catch(() => false);
    if (!already) {
        await gotoEditor(t);
        await newNotebookProject(t);
        await saveToCloud(t, COMMIT_V1);
        await publishProject(t, { description: DESCRIPTION, tags: TAGS, previewPages: PREVIEW_PAGES });

        // Version 2: a real state change (identical state would dedupe into
        // the same commit -- server/routes/projects.js:259 -- and the second
        // publish would pin nothing new). Rename the second section via the
        // Node Properties Title input: visible-but-tasteful, and it touches
        // none of the three published preview pages. The input has no
        // htmlFor pairing (components/properties/NodeProperties.tsx:45-47,
        // label and input are plain siblings), so getByLabel can't resolve
        // it -- label:text-is() + adjacent-sibling CSS is the proven
        // tests/e2e/helpers.js pattern for exactly this DOM shape, scoped to
        // the active pane like every sidebar/canvas query in lib/app.js.
        await selectSidebarNode(t, 'Project B');
        await t.page.locator(`${ACTIVE_PANE} label:text-is("Title") + input`).fill('Sketches');
        await settle(t.page, 600);
        await saveToCloud(t, COMMIT_V2);
        await publishProject(t, { description: DESCRIPTION, tags: TAGS, previewPages: PREVIEW_PAGES });
    }
    await signOut(t);
}

// Every thumbnail <img> currently in the DOM is fully loaded (decoded,
// non-zero natural size) -- the gallery-home card and the detail page's
// preview stack both render through /api/thumbnails/ URLs, and a snap
// taken before decode finishes shows grey boxes.
async function waitThumbnailsLoaded(t) {
    await t.page.waitForFunction(() => {
        const imgs = [...document.querySelectorAll('img[src*="/api/thumbnails/"]')];
        return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, { timeout: 20000 });
}

// The seeded project's standalone detail page, loaded by DIRECT URL. The
// card's href is read instead of clicking it: an in-app card click
// navigates with backgroundLocation state and renders the overlay MODAL
// (App.tsx:87-91), while a direct goto of the same URL renders
// pages/GalleryDetailPage.tsx -- and the standalone page is what these
// shots document. `a[href^="/gallery/"]` (trailing slash) can't match the
// header's own /gallery nav link.
async function gotoProjectPage(t) {
    await t.page.goto(t.baseUrl + '/gallery');
    const cardLink = t.page.locator('a[href^="/gallery/"]').first();
    await cardLink.waitFor({ timeout: 20000 });
    const href = await cardLink.getAttribute('href');
    await t.page.goto(t.baseUrl + href);
    await t.page.getByRole('heading', { name: PUBLISHED_NAME }).waitFor({ timeout: 20000 });
    await waitThumbnailsLoaded(t);
    await settle(t.page, 800);
}

export const shots = [
    { id: 'gallery/gallery-home', kind: 'still', run: async (t) => {
        await ensurePublished(t);
        // Signed out (ensurePublished ends on /login): the whole point of
        // this shot is the gallery working without an account.
        await t.page.goto(t.baseUrl + '/gallery');
        await t.page.getByText(PUBLISHED_NAME).first().waitFor({ timeout: 20000 });
        await waitThumbnailsLoaded(t);
        await settle(t.page, 800);
        await t.snap();
    } },
    { id: 'gallery/project-page', kind: 'still', run: async (t) => {
        await ensurePublished(t);
        await gotoProjectPage(t);
        await t.snap();
    } },
    { id: 'gallery/version-history-clone', kind: 'still', run: async (t) => {
        await ensurePublished(t);
        await gotoProjectPage(t);
        await t.page.getByRole('button', { name: 'Version history' }).click();
        await t.page.getByRole('heading', { name: 'Version history' }).waitFor({ timeout: 10000 });
        // Both published versions must be listed (newest first, HEAD badge
        // on the latest) -- this also guards that the two-publish seeding
        // actually produced two public history rows.
        await t.page.getByText(COMMIT_V2).waitFor({ timeout: 10000 });
        await t.page.getByText(COMMIT_V1).waitFor({ timeout: 10000 });
        await settle(t.page, 600);
        await t.snap();
    } },
];
