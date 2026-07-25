// Gallery-wave captures: browsing, project pages, and public version history
// as an ANONYMOUS visitor. Accounts persist for the lifetime of one sealed
// server (one per scenario run) but every shot starts in a fresh signed-out
// context, so each shot re-authenticates via ensureUser and re-checks the
// seed via ensurePublished before doing its own signed-out work.
import { gotoEditor, newNotebookProject, selectSidebarNode, settle, ACTIVE_PANE, switchToTemplatesMode, canvasBox } from '../lib/app.js';
import { ensureUser, saveToCloud, publishProject, signOut, forkProject, proposeChanges } from '../lib/cloud.js';

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
//
// Targets the card by NAME (hasText), not `.first()`: from the
// publish-wizard-pages shot onward the gallery holds a SECOND public
// project ("Travel Journal"), so the first card link on the home rows is
// ambiguous for any later shot. hasText matches the card's own title div
// inside the <a> (ProjectCard.tsx:20); .first() still applies because the
// same card can appear in up to three curated rows at once.
async function gotoProjectPage(t, name = PUBLISHED_NAME) {
    await t.page.goto(t.baseUrl + '/gallery');
    const cardLink = t.page.locator('a[href^="/gallery/"]', { hasText: name }).first();
    await cardLink.waitFor({ timeout: 20000 });
    const href = await cardLink.getAttribute('href');
    await t.page.goto(t.baseUrl + href);
    await t.page.getByRole('heading', { name }).waitFor({ timeout: 20000 });
    await waitThumbnailsLoaded(t);
    await settle(t.page, 800);
}

// ---------------------------------------------------------------------------
// Tutorial 02 (accounts, verification, usernames) additions.

// The API server's fixed origin in a sealed run: tutorial/lib/servers.js
// always boots it on :3001 (BETTER_AUTH_URL=http://localhost:3001/api/auth)
// while t.baseUrl is the vite origin on :5199.
const API_BASE = 'http://localhost:3001';

// A display-only identity for the signup-form still. Deliberately NEVER
// submitted, so no account row ever exists for it and re-runs can't collide.
const FORM_DEMO = { name: 'Mira Holloway', username: 'mira_makes', email: 'mira@docs.test' };

// Submitted but never verified: the verify-email-panel still needs a FRESH
// sign-up whose flow stops at the "Verify your email" panel. Left unverified
// on purpose -- the signup cap (server/signupCap.js) only counts VERIFIED
// rows, and no later shot reuses this account.
const VERIFY_DEMO = { name: 'Demo Docs', username: 'demo_docs', email: 'demo@docs.test', password: 'DocsCapture2026!' };

// Google-style account for the welcome-username still: created via the API
// WITHOUT a username (the /login sign-up form always collects one, so a
// form-created user can never see /welcome). This is the exact technique
// tests/e2e/username_identity.spec.js:113-119 uses -- "this is exactly what
// Google OAuth sign-in produces in production (no username ever collected)".
const WELCOME_DEMO = { name: 'Nomad Press', email: 'welcome@docs.test', password: 'DocsCapture2026!' };
const WELCOME_USERNAME = 'nomad_press';

// The centered auth card on /login and /welcome (pages/LoginPage.tsx:183,
// pages/WelcomePage.tsx:26 -- both `w-full max-w-md bg-white rounded-lg
// shadow-md p-8`, the only max-w-md.bg-white element on either page).
// Cropping to it is what makes the form text legible: at the 1600x1000
// viewport the card is ~450px of a full-page shot, and the editor wave
// already established element crops (t.snap(selector)) for exactly this.
const AUTH_CARD = 'div.max-w-md.bg-white';

// Fill the /login page's sign-up form WITHOUT submitting. Toggle first:
// in sign-in mode exactly one control is named "Sign Up" (the mode toggle;
// the submit button reads "Sign In") -- same disambiguation cloud.js's
// signUpAndVerify documents from tests/e2e/helpers.js:116. "Name" needs
// exact:true because the "Username" label contains it as a substring.
async function fillSignupForm(t, { name, username, email, password }) {
    await t.page.goto(t.baseUrl + '/login');
    await settle(t.page, 800);
    await t.page.getByRole('button', { name: 'Sign Up' }).click();
    // "Create Account" only renders while signups are open (LoginPage.tsx:185
    // swaps in the waitlist panel when capped) -- a sealed run starts from an
    // empty DB against the default cap of 500, so this doubles as a guard
    // that the shot never silently captures the waitlist instead.
    await t.page.getByRole('heading', { name: 'Create Account' }).waitFor({ timeout: 10000 });
    await t.page.getByLabel('Name', { exact: true }).fill(name);
    await t.page.getByLabel('Username').fill(username);
    await t.page.getByLabel('Email').fill(email);
    await t.page.getByLabel('Password').fill(password);
    await settle(t.page, 400);
}

// Latest verification link that is DIFFERENT from `previous`. cloud.js's own
// poller just takes the last link in the API log, which is correct for the
// first account of a run but stale here: by the time the welcome shot signs
// up, OWNER's (and possibly demo_docs') links are already in the log, so
// "last link" would resolve instantly to the WRONG user's token. Snapshot
// the log's last link before the sign-up POST and poll past it.
async function pollNewVerificationLink(servers, previous, tries = 50) {
    for (let i = 0; i < tries; i++) {
        const link = servers.lastVerificationLink();
        if (link && link !== previous) return link;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('no new verification link appeared in the API log');
}

// ---------------------------------------------------------------------------
// Tutorial 04 (publishing) helpers.

// The publish dialog element (PublishModal.tsx:146, role="dialog" -- the only
// dialog either wizard shot ever mounts). Element crop, same rationale as
// AUTH_CARD: at the 1600x1000 viewport the 560px-wide modal would be a sliver
// of a full-page shot.
const PUBLISH_DIALOG = 'div[role="dialog"]';

const JOURNAL_NAME = 'Travel Journal';
const JOURNAL_DESCRIPTION = 'A three-section travel journal: packing lists, day-by-day notes, and lined pages for sketches.';
const JOURNAL_TAGS = 'travel, journal, lined';
// Checked ON TOP of the pre-selected cover: a section divider and a lined
// page, so the preview strip shows three distinct page designs (same pair
// rationale as ensurePublished's PREVIEW_PAGES). Titles need exact:true --
// "Project A" is a prefix of "Project A - Page 1".
const JOURNAL_PREVIEW_PAGES = ['Project A', 'Project A - Page 1'];

// Create a fresh notebook, cloud-save it, open the publish wizard, and fill
// it completely (description + tags + three checked pages), leaving the
// modal open one click short of publishing. Shared verbatim by both wizard
// stills so the pair depicts the same publish. Drives the modal directly
// instead of calling cloud.js's publishProject: that helper's contract is
// fill-and-complete in one call, while these shots need to stop (and snap)
// mid-flow -- its selectors are reused here line for line.
async function openFilledPublishWizard(t) {
    await ensureUser(t, OWNER);
    await gotoEditor(t);
    await newNotebookProject(t);
    // Root is pre-selected after creation (services/presets.ts:95), so the
    // Title input is already the root's; >=1000ms settle outlasts
    // ProjectEditor's onStateChange debounce before the save reads
    // project.initialState -- both facts documented at the tutorial-03 block.
    await t.page.locator(`${ACTIVE_PANE} label:text-is("Title") + input`).fill(JOURNAL_NAME);
    await settle(t.page, 1100);
    await saveToCloud(t, 'Trip-ready layout');

    // Cloud menu -> "Publish to gallery…" (CloudMenu.tsx:129-132; the item
    // only renders once the save above cloud-linked the tab).
    await t.page.getByTitle('Cloud').click();
    await settle(t.page, 700);
    await t.page.getByRole('button', { name: /publish to gallery/i }).click();
    await t.page.getByRole('heading', { name: 'Publish to gallery' }).waitFor({ timeout: 10000 });

    // Same placeholder queries as cloud.js publishProject (proven by
    // fork.spec.js:73). The checkbox check()s auto-wait for the modal's
    // disclosure fetch to populate the page list.
    await t.page.getByPlaceholder('What is this planner for?').fill(JOURNAL_DESCRIPTION);
    await t.page.getByPlaceholder('planner, 2026, remarkable').fill(JOURNAL_TAGS);
    for (const pageTitle of JOURNAL_PREVIEW_PAGES) {
        await t.page.getByRole('checkbox', { name: pageTitle, exact: true }).check();
    }
    // Anti-rot for the tutorial's "the first page comes pre-checked" claim
    // (PublishModal.tsx seeds the selection with computePageOrder's first
    // page -- the renamed root). Assert, don't check(): silently re-checking
    // would hide a regression of the default.
    const cover = t.page.getByRole('checkbox', { name: JOURNAL_NAME, exact: true });
    await cover.waitFor({ timeout: 10000 });
    if (!(await cover.isChecked())) {
        throw new Error('publish wizard no longer pre-selects the first page');
    }
    await settle(t.page, 500);
}

// ---------------------------------------------------------------------------
// Tutorial 05 (ratings, reviews, profiles) helpers.

// FORKER's review of OWNER's seeded notebook. Short on purpose: the review
// card renders it whitespace-preserved at max-w-lg (ReviewsSection.tsx:106),
// and one line keeps the element-cropped still compact. After a save it
// appears TWICE -- the form's textarea (getByText matches textarea values
// too, learned from a strict-mode violation) and the published card's <p>
// -- so the round-trip wait below scopes to the paragraph.
const REVIEW_BODY = 'Clean layout, and the section dividers are exactly what I needed.';

// ---------------------------------------------------------------------------
// Tutorial 07 (merge requests: proposing) helpers. Both shots put FORKER on
// their OWN private fork of "My Notebook" -- the one Tutorial 06's
// clip-fork-flow created earlier in this same sealed run -- recolour its
// cover, save, and propose the change upstream to OWNER. They share the whole
// fork -> recolour -> save prelude so the pair reads as one continuous
// proposal; only mr-author-view actually submits it.

// The proposal's title + commit message, kept distinctive and human-readable
// so Tutorial 08 (the reviewing side) can find THIS merge request by name, and
// so the author-view still's heading reads like a real proposal.
const FORK_COMMIT_MSG = 'Recolour the notebook cover to teal';
const MR_TITLE = 'Recolour the cover to teal';
// Description is the propose-modal still's only extra copy: the shared
// proposeChanges helper fills the required title alone (ProposeChangesModal's
// description is optional, and duplicating it into an MR that carries no
// description elsewhere adds nothing), so this exists purely to make that one
// figure read like a complete proposal.
const MR_DESCRIPTION = 'The slate cover felt a bit heavy — this swaps it for a calmer teal, nothing else.';

// A teal unmistakably unlike the notebook preset's slate cover
// (services/notebook_preset.json's notebook_cover "bg" rect ships #334155), so
// the change list shows a real modification and the before/after preview
// renders two visibly different covers.
const FORK_COVER_FILL = '#0e7490';

// The ProposeChangesModal card (components/cloud/ProposeChangesModal.tsx:32):
// its w-[440px] width is grep-unique in the whole app, so this crops to the
// modal itself (title + description fields + the save-first reminder) and
// leaves the dimmed editor behind it out -- same element-crop rationale as
// PUBLISH_DIALOG above. Bracket-escaped per CSS's literal-"[" rule, exactly as
// editor.js's TOOLBAR_SELECTOR escapes min-h-[40px].
const PROPOSE_MODAL = 'div.w-\\[440px\\]';

// Sign FORKER in and open their private fork of PUBLISHED_NAME in the editor,
// cloud-linked and ready to edit. REUSES an existing fork (the only project in
// FORKER's account carrying an upstream lineage -- FORKER forks nothing else in
// this wave) by re-staging it exactly the way the gallery Fork button does
// (hooks/useGalleryDetail.ts fork(): fetch the head commit's state, stageImport
// it WITH cloud linkage, let /app consume it -- services/importProject.ts +
// pages/EditorPage.tsx:131), so a full run never stacks a second fork on
// Tutorial 06's. Falls back to the real Fork button only when no fork exists
// yet (a standalone run of just these shots). The API reads go through the
// page's own fetch (credentials:'include'), identical to every cloudApi call
// the app makes, so auth is whatever the signed-in session already is.
async function ensureForkOpen(t) {
    await ensurePublished(t);       // upstream seeded + left signed out
    await ensureUser(t, FORKER);    // FORKER signed in, lands on /app

    const projects = await t.page.evaluate(async (base) => {
        const r = await fetch(base + '/api/projects', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!r.ok) throw new Error('listing FORKER projects failed: ' + r.status);
        return (await r.json()).projects;
    }, API_BASE);
    const fork = projects.find(p => p.forkedFromProjectId);

    if (fork) {
        // Re-open the existing fork: pull its head commit's state and stage it
        // with the same { projectId, lastSyncedCommitId } cloud linkage the
        // fork flow records -- that linkage is what later makes CloudMenu show
        // "Propose changes to upstream" (CloudMenu.tsx:134, gated on the
        // fetched cloud project's forkedFromProjectId).
        const commit = await t.page.evaluate(async ({ base, pid, cid }) => {
            const r = await fetch(`${base}/api/projects/${pid}/commits/${cid}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
            if (!r.ok) throw new Error('fetching fork head failed: ' + r.status);
            return (await r.json()).commit;
        }, { base: API_BASE, pid: fork.id, cid: fork.headCommitId });
        await t.page.evaluate(({ name, state, pid, cid }) => {
            localStorage.setItem('hype_import_pending', JSON.stringify({
                name, state, cloud: { projectId: pid, lastSyncedCommitId: cid },
            }));
        }, { name: fork.name, state: commit.state, pid: fork.id, cid: fork.headCommitId });
        await gotoEditor(t); // a fresh /app load consumes the staged import
    } else {
        // No fork yet -- create one through the gallery Fork button (the exact
        // path Tutorial 06 uses), which lands in the editor cloud-linked.
        await gotoProjectPage(t);
        await t.page.getByRole('button', { name: 'Fork this project' }).waitFor({ timeout: 15000 });
        await forkProject(t);
    }
    // The fork opens as a SECOND tab alongside the seeded Blank Project and is
    // the active one (consumeImport/fork both setActiveProjectId to it) -- wait
    // for that second tab so ACTIVE_PANE resolves to the fork before any edit,
    // the same 2-tabs-exist guard merge_requests.spec.js:115 uses after a fork.
    await t.page.getByTitle('Close Project').nth(1).waitFor({ timeout: 15000 });
    await settle(t.page, 500);
}

// Recolour the OPEN notebook's cover to `fill` -- one clean, unmistakable
// template edit, on whichever notebook (fork or upstream) is active. Templates
// mode so the change targets the SHARED notebook_cover template directly
// (picked by name, independent of whichever page happens to open selected);
// the full-bleed "bg" rect is then selected by clicking low on the cover,
// below its white title band, where nothing else overlaps it. Produces exactly
// one change-list row ("~ Template modified: default/notebook_cover") plus a
// dramatic before/after, and is a no-op-safe repeat: re-applying the identical
// colour dedupes on save (server/routes/projects.js's commits POST returns
// deduped:true, 200), while a DIFFERENT colour on the same template is exactly
// what makes an upstream-vs-fork conflict (Tutorial 08's mr-conflict shot).
async function recolorCoverTo(t, fill) {
    await switchToTemplatesMode(t);
    // The notebook's three templates list by name in Templates mode;
    // "Notebook Cover" is the preset's cover (services/notebook_preset.json),
    // grep-unique text (the root NODE is titled "My Notebook", not this).
    await t.page.locator(ACTIVE_PANE).getByText('Notebook Cover', { exact: true }).click();
    await settle(t.page, 600);
    // Select the full-bleed background rect (id "bg", zIndex 0, 0,0->509,679).
    // Fractional canvas coords map 1:1 onto the 509x679 template (proven by
    // editor.js's Templates-mode grid clicks), so (0.5, 0.72) -> template
    // (~254, ~489): clear of the white label band (y100-220) and the title
    // text above it, so the topmost element there is bg alone.
    await t.page.keyboard.press('v');
    await settle(t.page, 200);
    const c = await canvasBox(t.page);
    await t.page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.72);
    await settle(t.page, 500);
    // SingleElementEditor's solid Fill row: a w-16 label div reading exactly
    // "Fill" whose sibling div holds the one color input -- the exact recolour
    // path editor.js's clip-greyscale-toggle drives.
    const input = t.page.locator(`${ACTIVE_PANE} div.w-16:text-is("Fill") + div input[type="color"]`);
    await input.fill(fill);
    await settle(t.page, 400);
    // Wrong-element / missed-click guard: a click that selected nothing leaves
    // no Fill input (the fill above throws), and one that hit a different
    // element reads back a different value -- so confirm the colour landed on a
    // cover element before it's ever saved and proposed.
    const applied = (await input.inputValue()).toLowerCase();
    if (applied !== fill) {
        throw new Error(`cover recolour did not take — Fill reads ${applied}, expected ${fill}`);
    }
    // Outlast ProjectEditor's 1000ms onStateChange debounce (ProjectEditor.tsx
    // :76-84) so the template edit is flushed into project.initialState before
    // the caller's saveToCloud reads it -- the same margin the tutorial-03
    // editor shots rely on.
    await settle(t.page, 1100);
}
// The fork's teal recolour, unchanged from Tutorial 06/07's usage.
async function recolorForkCover(t) {
    return recolorCoverTo(t, FORK_COVER_FILL);
}

// ---------------------------------------------------------------------------
// Tutorial 08 (merge requests: reviewing, merging, conflicts) helpers. These
// shots put OWNER on the RECEIVING side of Tutorial 07's proposal: review +
// merge the open request, then build and show a real conflict. Ordering within
// a run matters (shared per-run server DB): mr-owner-review (view, no consume)
// -> clip-merge (merges + consumes the open MR) -> mr-conflict (dirties the
// upstream, which would break the two above -- so it runs LAST).

// OWNER's independent recolour of the SAME cover template the fork changed to
// teal. A warm amber, unmistakably different from both the preset slate
// (#334155) and the fork's teal (#0e7490) -- that difference on one shared
// template is exactly the threeWayDiff "changed on both sides" conflict.
const OWNER_COVER_FILL = '#b45309';
// The conflict shot proposes its OWN request (a full run has already merged
// MR_TITLE by the time this runs), so it carries a distinct title -- no
// collision with the merged one, and it reads sensibly on the conflict figure.
const CONFLICT_MR_TITLE = 'Give the cover a teal refresh';
const OWNER_DIRTY_COMMIT_MSG = 'Warm the cover up to amber';

// The /mr/:id the page is currently on -> the id. Thrown-on-miss so a caller
// that expected a proposal to have landed fails loudly, not silently.
const mrIdFromUrl = (t) => {
    const m = new URL(t.page.url()).pathname.match(/\/mr\/([^/]+)/);
    if (!m) throw new Error(`expected an /mr/:id URL, got ${t.page.url()}`);
    return m[1];
};

// The id of FORKER's existing OPEN merge request titled `title`, or null. Reads
// through the page's own credentialed fetch (FORKER must be signed in), same
// shape as ensureForkOpen's project listing. Used to REUSE Tutorial 07's MR
// instead of stacking duplicate rows in the owner's per-project list.
async function findOpenMrId(t, title) {
    const mrs = await t.page.evaluate(async (base) => {
        const r = await fetch(base + '/api/merge-requests/mine', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!r.ok) throw new Error('listing FORKER merge requests failed: ' + r.status);
        return (await r.json()).mergeRequests;
    }, API_BASE);
    const hit = mrs.find(mr => mr.title === title && mr.status === 'open');
    return hit ? hit.id : null;
}

// Guarantee an OPEN, mergeable "Recolour the cover to teal" request from
// FORKER's fork to OWNER's "My Notebook" exists, and return its id. In a full
// run Tutorial 07's mr-author-view already created it, so this REUSES it (found
// via /api/merge-requests/mine) rather than stacking a second identical row --
// keeping the owner's discovery list a single unambiguous link. On a standalone
// run it proposes a fresh one. Leaves FORKER signed in; callers switch to OWNER
// via signOut + ensureUser.
async function ensureOpenCoverMr(t) {
    await ensureForkOpen(t);              // FORKER signed in, fork open (created if needed)
    await recolorForkCover(t);            // teal (dedupes if an earlier shot already set it)
    await saveToCloud(t, FORK_COMMIT_MSG);
    const existing = await findOpenMrId(t, MR_TITLE);
    if (existing) return existing;
    await proposeChanges(t, MR_TITLE);    // fills the title, submits, lands on /mr/:id
    return mrIdFromUrl(t);
}

// Open OWNER's OWN "My Notebook" -- the upstream the merge request targets --
// in the editor, cloud-linked, so a recolour + saveToCloud lands a new commit
// on THAT project and moves its head (making the fork's still-teal proposal
// conflict). PRECONDITION: OWNER is signed in. Re-stages the project exactly
// the way the gallery fork/open path stages an import (localStorage
// hype_import_pending WITH cloud linkage) -- identical to ensureForkOpen's
// reuse branch, so the save updates the project rather than forking a detached
// copy. Targets the non-fork project named PUBLISHED_NAME (OWNER forks nothing
// in this wave, so that's unique).
async function ensureOwnerProjectOpen(t) {
    const project = await t.page.evaluate(async ({ base, name }) => {
        const r = await fetch(base + '/api/projects', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!r.ok) throw new Error('listing OWNER projects failed: ' + r.status);
        return (await r.json()).projects.find(p => p.name === name && !p.forkedFromProjectId);
    }, { base: API_BASE, name: PUBLISHED_NAME });
    if (!project) throw new Error(`OWNER has no non-fork project named "${PUBLISHED_NAME}"`);
    const commit = await t.page.evaluate(async ({ base, pid, cid }) => {
        const r = await fetch(`${base}/api/projects/${pid}/commits/${cid}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!r.ok) throw new Error('fetching OWNER project head failed: ' + r.status);
        return (await r.json()).commit;
    }, { base: API_BASE, pid: project.id, cid: project.headCommitId });
    await t.page.evaluate(({ name, state, pid, cid }) => {
        localStorage.setItem('hype_import_pending', JSON.stringify({
            name, state, cloud: { projectId: pid, lastSyncedCommitId: cid },
        }));
    }, { name: project.name, state: commit.state, pid: project.id, cid: project.headCommitId });
    await gotoEditor(t); // a fresh /app load consumes the staged import
    // Second tab = the staged upstream, active (consumeImport sets it active) --
    // same 2-tabs guard ensureForkOpen uses so ACTIVE_PANE resolves to it.
    await t.page.getByTitle('Close Project').nth(1).waitFor({ timeout: 15000 });
    await settle(t.page, 500);
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
    { id: 'gallery/signup-form', kind: 'still', run: async (t) => {
        // Signup mode with every field filled, BEFORE submit -- the still
        // documents the form itself (field set + the "3-30 chars ... Shown
        // publicly" hint under Username), not the submission. FORM_DEMO is
        // never submitted, so nothing is created server-side.
        await fillSignupForm(t, { ...FORM_DEMO, password: 'DocsCapture2026!' });
        await t.snap(AUTH_CARD);
    } },
    { id: 'gallery/verify-email-panel', kind: 'still', run: async (t) => {
        // A FRESH user's sign-up, stopped at the verify prompt. After the
        // toggle flip the submit button is the only control named "Sign Up"
        // (the toggle now reads "Sign In") -- cloud.js signUpAndVerify's own
        // second-click pattern. onSuccess swaps the card to the "Verify your
        // email" panel (LoginPage.tsx:200-229); the sealed server's mailer
        // logs the link instead of delivering (no RESEND_API_KEY), and this
        // shot deliberately never follows it.
        await fillSignupForm(t, VERIFY_DEMO);
        await t.page.getByRole('button', { name: 'Sign Up' }).click();
        await t.page.getByRole('heading', { name: 'Verify your email' }).waitFor({ timeout: 15000 });
        await t.page.getByText(/We sent a verification link to/).waitFor({ timeout: 10000 });
        await settle(t.page, 500);
        await t.snap(AUTH_CARD);
    } },
    { id: 'gallery/welcome-username', kind: 'still', run: async (t) => {
        // The /welcome onboarding step, captured MID-FLOW: a signed-in
        // session with no username (the Google/legacy shape), the handle
        // typed, and the live availability check showing green -- snapped
        // BEFORE Continue. The sign-up must bypass the /login form (it
        // always collects a username), so POST the API directly from the
        // page's request context, same shape as tests/e2e/helpers.js's
        // apiSignUpAndVerify minus the username field. callbackURL mirrors
        // LoginPage.tsx:48's verificationCallbackURL so the emailed link
        // lands back on the vite origin, where autoSignInAfterVerification
        // leaves the session signed in and LoginPage forwards to /app.
        const staleLink = t.servers.lastVerificationLink();
        const res = await t.page.request.post(`${API_BASE}/api/auth/sign-up/email`, {
            data: { ...WELCOME_DEMO, callbackURL: `${t.baseUrl}/login?verified=1` },
        });
        if (!res.ok()) throw new Error(`API sign-up failed: ${res.status()} ${await res.text()}`);
        const link = await pollNewVerificationLink(t.servers, staleLink);
        await t.page.goto(link);
        await t.page.waitForURL((url) => url.pathname === '/app' || url.pathname === '/welcome', { timeout: 20000 });
        await settle(t.page, 800);

        // Nothing auto-routes a bare /app visit to /welcome (only gated
        // actions do, via USERNAME_REQUIRED -- hooks/useGalleryDetail.ts:73,
        // components/cloud/CloudMenu.tsx:60), so go there directly; the
        // username-less session renders the "Choose a username" card
        // (pages/WelcomePage.tsx:18 only redirects away when a username
        // exists).
        await t.page.goto(t.baseUrl + '/welcome');
        await t.page.getByRole('heading', { name: 'Choose a username' }).waitFor({ timeout: 15000 });
        await t.page.getByPlaceholder('e.g. planner_pro').fill(WELCOME_USERNAME);
        // UsernameForm debounces 300ms then hits isUsernameAvailable; wait
        // for the exact green hint (components/UsernameForm.tsx:81) so the
        // still shows the availability pre-check actually working. Exact
        // text: plain "Available" would also match "✗ Already taken"'s
        // sibling states in a regression.
        await t.page.getByText('✓ Available').waitFor({ timeout: 10000 });
        await settle(t.page, 400);
        await t.snap(AUTH_CARD);
    } },
    { id: 'gallery/account-settings', kind: 'still', run: async (t) => {
        // OWNER's /account page: username form pre-filled with the public
        // handle plus the change-password section. ensureUser signs in (or
        // seeds OWNER on a standalone run) and ends on /app.
        await ensureUser(t, OWNER);
        await t.page.goto(t.baseUrl + '/account');
        await t.page.getByRole('heading', { name: 'Account settings' }).waitFor({ timeout: 15000 });
        // The username input is state-initialized from the session
        // (AccountSettingsPage.tsx:126), so assert the actual value -- a
        // too-early snap with an empty form would still "look" fine.
        await t.page.waitForFunction(
            (expected) => document.getElementById('username-form-input')?.value === expected,
            OWNER.username, { timeout: 10000 },
        );
        // "Change password" only mounts after listAccounts resolves with a
        // credential provider (AccountSettingsPage.tsx:16-36) -- OWNER is an
        // email+password account, so wait for it; Google-only accounts would
        // never show it, and that asymmetry is exactly what the tutorial
        // documents.
        await t.page.getByRole('heading', { name: 'Change password' }).waitFor({ timeout: 15000 });
        await settle(t.page, 500);
        // <main> (max-w-md, AccountSettingsPage.tsx:121) is the whole
        // settings column; the AppHeader adds nothing this still documents.
        await t.snap('main');
    } },
    // -----------------------------------------------------------------------
    // Tutorial 03 (cloud saves & version history) additions. All three shots
    // run as OWNER; the two editor shots each rename the notebook ROOT before
    // the first save -- the root's title flows into the tab/project name
    // (components/ProjectEditor.tsx:67-73 onNameChange fires on root-title
    // change, immediately, not debounced), and the first cloud save names the
    // cloud project after project.name (CloudMenu.tsx:52) -- so each shot's
    // cloud row gets a distinctive name and the my-projects still below lists
    // three visibly different projects instead of three "My Notebook"s.
    //
    // The root is ALREADY selected right after project creation
    // (services/presets.ts:95 seeds selectedNodeIds=[rootId]), so its Title
    // input can be filled directly -- no selectSidebarNode needed (whose
    // y>140 sidebar heuristic could reject the root row anyway: it sits at
    // the very top of the tree, right at that boundary).
    //
    // Timing note shared by both editor shots: ProjectEditor debounces
    // onStateChange by 1000ms (ProjectEditor.tsx:76-84), and CloudMenu saves
    // project.initialState -- the debounced copy (CloudMenu.tsx:52-55). Every
    // edit below is followed by >=1000ms of settles before saveToCloud's own
    // save-click fires (its menu-open click + settle(700) alone adds ~900ms
    // on top of each explicit settle), so the flushed state always contains
    // the edit being saved -- same margin ensurePublished's seeding already
    // relies on.
    { id: 'gallery/cloud-menu', kind: 'still', run: async (t) => {
        // The READY-state menu of a cloud-linked project: Save to cloud +
        // Version history + Publish to gallery. Both conditional items need
        // project.cloud set (CloudMenu.tsx:116-133), so save once first.
        // Full-page snap, not an element crop: the dropdown is absolutely
        // positioned below the header button, so no single element's
        // bounding box contains both -- and editor/select-under-menu (the
        // other open-menu still of this wave) set the full-page precedent.
        await ensureUser(t, OWNER);
        await gotoEditor(t);
        await newNotebookProject(t);
        await t.page.locator(`${ACTIVE_PANE} label:text-is("Title") + input`).fill('Reading Log');
        await settle(t.page, 800);
        await saveToCloud(t, 'First save from the editor');
        // saveToCloud leaves the menu closed (CloudMenu.tsx:58 setOpen(false)
        // on success); reopen it for the snap. The three waits double as the
        // guard that the save really linked the tab: pre-link the label is
        // "Save to cloud (new)" and the other two items don't render at all,
        // so `exact` on the first assert can't false-pass on the unlinked
        // menu.
        await t.page.getByTitle('Cloud').click();
        await t.page.getByRole('button', { name: 'Save to cloud', exact: true }).waitFor({ timeout: 10000 });
        await t.page.getByRole('button', { name: 'Version history' }).waitFor({ timeout: 10000 });
        await t.page.getByRole('button', { name: /publish to gallery/i }).waitFor({ timeout: 10000 });
        await settle(t.page, 500);
        await t.snap();
    } },
    { id: 'gallery/clip-restore', kind: 'clip', run: async (t) => {
        // The restore round-trip the tutorial walks step-by-step: rename a
        // section (visible in sidebar AND canvas -- the notebook's
        // section_divider template renders {{title}} centered on the page,
        // services/notebook_preset.json), save it as commit 2, then restore
        // commit 1 and watch the rename revert. Commit 1 is saved with the
        // section SELECTED, and selection is part of AppState -- so the
        // restored snapshot remounts with the section divider back on the
        // canvas reading "Project B", no post-restore clicking needed.
        await ensureUser(t, OWNER);
        await gotoEditor(t);
        await newNotebookProject(t);
        await t.page.locator(`${ACTIVE_PANE} label:text-is("Title") + input`).fill('Sketchbook');
        await settle(t.page, 800);
        await selectSidebarNode(t, 'Project B');
        await saveToCloud(t, 'Set up sections');

        t.beginClip();
        // Rename on camera: clear the Title input, then real keystrokes so
        // the sidebar row and the canvas divider visibly change letter by
        // letter (fill() would jump-cut the text in a single frame).
        const title = t.page.locator(`${ACTIVE_PANE} label:text-is("Title") + input`);
        await title.fill('');
        await t.page.keyboard.type('Ink Studies', { delay: 90 });
        await settle(t.page, 1100);
        await saveToCloud(t, 'Rename Project B to Ink Studies');

        await t.page.getByTitle('Cloud').click();
        await settle(t.page, 600);
        await t.page.getByRole('button', { name: 'Version history' }).click();
        await t.page.getByRole('heading', { name: 'Version history' }).waitFor({ timeout: 10000 });
        // Both commits listed, newest first -- also guards that the rename
        // actually changed the state: an identical save would have DEDUPED
        // into commit 1 (server/routes/projects.js:230-234) and left a
        // one-row history with nothing to restore.
        await t.page.getByText('Rename Project B to Ink Studies').waitFor({ timeout: 10000 });
        await t.page.getByText('Set up sections').waitFor({ timeout: 10000 });
        await settle(t.page, 1200); // a beat on the modal so the two rows are readable
        // Restore commit 1: scope to its row (HistoryModal.tsx:64 -- the
        // only .rounded.justify-between div whose text is that message; the
        // modal header is justify-between too but not .rounded). The
        // window.confirm this fires (HistoryModal.tsx:31) is auto-accepted
        // by the runner's dialog handler.
        await t.page.locator('div.rounded.justify-between', { hasText: 'Set up sections' })
            .getByRole('button', { name: 'Restore' }).click();
        // onRestore closes the modal and bumps the project's revision --
        // the pane remounts on its key (pages/EditorPage.tsx:359) with the
        // restored snapshot. Wait on the CANVAS text line specifically:
        // canvas text renders as [data-text-layout-line] spans, so the
        // divider's restored "Project B" title is a real DOM signal, and
        // it's exactly the revert the tutorial's clip promises. The ^$
        // regex keeps the toc grid's "Project B - Page N" lines out, and
        // .first() guards strict mode in case a future preset ever adds a
        // second exact "Project B" line (the sidebar row already proved a
        // plain exact-text wait resolves to 2 elements: sidebar + canvas).
        await t.page.locator(`${ACTIVE_PANE} [data-text-layout-line]`)
            .filter({ hasText: /^Project B$/ }).first().waitFor({ timeout: 15000 });
        await settle(t.page, 1500); // hold the reverted canvas + sidebar as the closing frame
    } },
    { id: 'gallery/my-projects', kind: 'still', run: async (t) => {
        // OWNER's /projects page, deliberately AFTER the three shots above
        // (so the list shows all three cloud rows created this run with
        // distinct names and mixed visibility: "My Notebook" (public -- the
        // ensurePublished seed), "Reading Log" (private, 1 version),
        // "Sketchbook" (private, 2 versions)) and BEFORE the tutorial-04
        // publish-wizard shots below (which add "Travel Journal" rows,
        // including a SECOND public one -- the strict-mode exact-'public'
        // badge wait here allows exactly one match). Reordering these shots
        // would fail the row waits below -- that coupling is deliberate,
        // same as later gallery scenarios depending on this file's earlier
        // seeding.
        await ensurePublished(t);
        await ensureUser(t, OWNER);
        await t.page.goto(t.baseUrl + '/projects');
        await t.page.getByRole('heading', { name: 'My projects' }).waitFor({ timeout: 15000 });
        // The storage meter, and the quota figure the tutorial quotes: the
        // sealed server sets no USER_STORAGE_QUOTA_MB override, so the
        // default of 50 MB (server/middleware/limits.js:31) must render --
        // this wait is the anti-rot guard for the doc's "50 MB" claim.
        await t.page.getByText('of 50.0 MB used').waitFor({ timeout: 15000 });
        await t.page.getByText(PUBLISHED_NAME).waitFor({ timeout: 10000 });
        await t.page.getByText('Reading Log').waitFor({ timeout: 10000 });
        await t.page.getByText('Sketchbook').waitFor({ timeout: 10000 });
        // One badge of each kind ('public' pill on the seed row, 'private'
        // on the other two -- .first(): two private rows would trip strict
        // mode). MyProjectsPage.tsx:80-83.
        await t.page.getByText('public', { exact: true }).waitFor({ timeout: 10000 });
        await t.page.getByText('private', { exact: true }).first().waitFor({ timeout: 10000 });
        await settle(t.page, 600);
        // <main> is the whole max-w-2xl content column (MyProjectsPage.tsx:48)
        // -- same crop rationale as gallery/account-settings above.
        await t.snap('main');
    } },
    // -----------------------------------------------------------------------
    // Tutorial 04 (publishing) additions: the publish wizard itself, on a
    // FRESH project so the whole flow runs on camera instead of re-showing
    // the ensurePublished seed. Both stills stage the identical wizard pass
    // (same project name, description, tags, page picks) so the tutorial's
    // two figures read as one continuous walkthrough; only the second shot
    // actually clicks Publish. The brief suggested a blank-with-elements
    // project, but a blank project has exactly ONE page (app.js's
    // newBlankProject card: "single A4 page"), which would collapse the
    // wizard's defining UI -- the pick-1-of-up-to-4 page list -- into a
    // single row. The notebook preset gives the picker 13 real rows
    // (services/notebook_preset.json: cover + 3 sections x (divider + 3
    // lined pages)) and three visually distinct thumbnails, with zero
    // canvas-drawing flakiness.

    // Root rename flows into the tab/project name (ProjectEditor.tsx:67-73),
    // the first cloud save names the cloud project after it (CloudMenu.tsx:52),
    // and publishing sets published_name = name (server/routes/projects.js:343)
    // -- so "Travel Journal" is both the wizard's first picker row (the root
    // page) and what the gallery would show. Distinct from every other name
    // this run creates (My Notebook / Reading Log / Sketchbook).
    { id: 'gallery/publish-wizard-meta', kind: 'still', run: async (t) => {
        // The wizard as the user leaves it just before Publish: description
        // and tags typed, three pages checked, no thumbnails yet (previews
        // only exist after Publish is clicked -- see the -pages shot).
        await openFilledPublishWizard(t);
        await t.snap(PUBLISH_DIALOG);
    } },
    { id: 'gallery/publish-wizard-pages', kind: 'still', run: async (t) => {
        await openFilledPublishWizard(t);

        // The rendered-thumbnails stage only exists DURING a publish:
        // PublishModal.tsx's publish() renders previews client-side
        // (generateThumbnails: jsPDF -> pdf.js raster -> WebP), setPreviews()s
        // them, then uploads -- and on success CloudMenu closes the modal and
        // alerts (CloudMenu.tsx:161). Snapping "after previews render" by
        // timing alone would race the upload on a localhost server, so HOLD
        // the publish POST at the network layer: the modal sits stably in its
        // uploading phase -- previews strip visible, button reading
        // "Publishing…" -- for as long as the snap needs, then the release
        // lets the same publish complete for real (end-to-end proof the
        // server accepted our rendered thumbnails).
        let releasePublish;
        const gate = new Promise((resolve) => { releasePublish = resolve; });
        await t.page.route('**/api/projects/*/publish', async (route) => {
            await gate;
            await route.continue();
        });

        await t.page.getByRole('button', { name: 'Publish', exact: true }).click();
        // All three previews (pre-checked cover + the two JOURNAL_PREVIEW_PAGES)
        // rendered AND decoded -- <img alt="Preview N"> per PublishModal.tsx:199;
        // scoped inside the dialog so no other page image can satisfy it. The
        // count also guards the three-page selection end to end: fewer checked
        // boxes would render fewer previews, not fail earlier.
        await t.page.waitForFunction((sel) => {
            const imgs = [...document.querySelectorAll(`${sel} img[alt^="Preview "]`)];
            return imgs.length === 3 && imgs.every(i => i.complete && i.naturalWidth > 0);
        }, PUBLISH_DIALOG, { timeout: 30000 });
        await settle(t.page, 400);
        await t.snap(PUBLISH_DIALOG);

        releasePublish();
        // Completion signal: the modal heading unmounts (same done-signal as
        // cloud.js's publishProject); the success alert is auto-accepted by
        // the runner's dialog handler. This publish makes OWNER's second
        // public project -- fine against MAX_PUBLIC_PROJECTS_PER_USER's
        // default of 20 (server/middleware/limits.js:34).
        await t.page.getByRole('heading', { name: 'Publish to gallery' }).waitFor({ state: 'hidden', timeout: 20000 });
        await t.page.unroute('**/api/projects/*/publish');
    } },
    // -----------------------------------------------------------------------
    // Tutorial 05 (ratings, reviews, profiles) additions. First use of FORKER
    // in the wave: ensureUser creates the account through the sign-up form on
    // first run (the verification-link poller is snapshot-and-poll-past, so
    // OWNER's earlier links in the API log can't be mistaken for FORKER's).
    { id: 'gallery/reviews-section', kind: 'still', run: async (t) => {
        // FORKER (signed in, has a username, NOT the owner) on OWNER's "My
        // Notebook" page: writes a 4-star review through the UI, then snaps
        // the Reviews section showing the pre-filled "Your review" form AND
        // the published review card below it -- the tutorial's one-review-
        // per-person figure.
        await ensurePublished(t);
        await ensureUser(t, FORKER);
        await gotoProjectPage(t);

        // The form only mounts once the session fetch resolves a username'd
        // non-owner (ReviewsSection.tsx:49 canWrite); "Rate this project" is
        // its no-review-yet heading, so this wait also proves FORKER has no
        // earlier review (each scenario run boots a fresh sealed server).
        await t.page.getByText('Rate this project').waitFor({ timeout: 15000 });

        // Anti-rot for the tutorial's "Save review stays disabled until
        // you've picked a rating" claim (ReviewsSection.tsx:75
        // `disabled={saving || rating === 0}`). Assert, don't skip: a
        // regression to save-with-zero-stars must fail the shot.
        const saveBtn = t.page.getByRole('button', { name: 'Save review' });
        if (!(await saveBtn.isDisabled())) {
            throw new Error('Save review is no longer disabled at zero stars');
        }

        // Set the rating VIA KEYBOARD -- the exact roving-tabindex arrow-key
        // path the tutorial's NOTE documents (StarRating.tsx:39-54: one tab
        // stop, ArrowRight/Up raises, focus follows selection). With no
        // rating yet, star 1 is the tabbable stop; four ArrowRights step the
        // value 0->1->2->3->4. The aria-checked assert below fails the shot
        // if the radiogroup semantics ever regress to plain buttons.
        await t.page.getByRole('radio', { name: '1 star', exact: true }).focus();
        for (let i = 0; i < 4; i++) await t.page.keyboard.press('ArrowRight');
        const fourStars = t.page.getByRole('radio', { name: '4 stars' });
        if ((await fourStars.getAttribute('aria-checked')) !== 'true') {
            throw new Error('arrow keys no longer drive the star rating radiogroup');
        }

        await t.page.getByPlaceholder('Share what you think (optional)').fill(REVIEW_BODY);
        await settle(t.page, 300);
        await saveBtn.click();

        // Saved: the hook refetches reviews + project (useGalleryDetail.ts
        // refreshAfterReviewChange), flipping the form heading to "Your
        // review" with a Delete button (edit/delete-own claims), publishing
        // the review card (author link + body), and recomputing the live SQL
        // AVG -- "4.0 (1)" renders in BOTH the page header and the Reviews
        // heading (hence .first()), which is the anti-rot guard for the
        // tutorial's computed-fresh-never-drifts claim.
        await t.page.getByText('Your review').waitFor({ timeout: 15000 });
        await t.page.getByRole('button', { name: 'Delete review' }).waitFor({ timeout: 10000 });
        await t.page.getByRole('link', { name: FORKER.username }).waitFor({ timeout: 10000 });
        // The published card's copy specifically -- the form's textarea also
        // getByText-matches this string (see REVIEW_BODY note above).
        await t.page.locator('p', { hasText: REVIEW_BODY }).waitFor({ timeout: 10000 });
        await t.page.getByText('4.0 (1)').first().waitFor({ timeout: 10000 });
        await settle(t.page, 600);

        // Element crop: the ReviewsSection root is the standalone detail
        // page's only div.mt-10 (ReviewsSection.tsx:52) -- heading + average,
        // form, and review card in one legible figure, same crop rationale
        // as AUTH_CARD. Playwright scrolls the element into view itself.
        await t.snap('div.mt-10');
    } },
    { id: 'gallery/profile-page', kind: 'still', run: async (t) => {
        // OWNER's public profile at /u/atlas_designs, viewed SIGNED OUT
        // (ensurePublished ends on /login): profiles are a public surface,
        // and the anonymous view is exactly what the tutorial documents. In
        // a full-wave run the grid shows both of OWNER's published projects
        // (My Notebook + the wizard shots' Travel Journal); standalone runs
        // seed only My Notebook, so that's the one card this waits on.
        await ensurePublished(t);

        // API-level anti-rot for the tutorial's 404 claim: an unknown handle
        // must return "User not found" (server/routes/me.js:20), not an
        // empty profile. Request-context call -- no page navigation happens.
        const res = await t.page.request.get(`${API_BASE}/api/users/no_such_user_docs`);
        if (res.status() !== 404) {
            throw new Error(`unknown profile returned ${res.status()}, expected 404`);
        }

        await t.page.goto(t.baseUrl + '/u/' + OWNER.username);
        await t.page.getByRole('heading', { name: OWNER.username }).waitFor({ timeout: 20000 });
        // The three things a profile exposes (pages/ProfilePage.tsx:30-38,
        // server/routes/me.js:33 -- username, createdAt, published projects
        // only): the join date line plus the seeded published card.
        await t.page.getByText(/^Joined /).waitFor({ timeout: 10000 });
        await t.page.getByText(PUBLISHED_NAME).waitFor({ timeout: 10000 });
        await waitThumbnailsLoaded(t);
        await settle(t.page, 800);
        await t.snap();
    } },
    // -----------------------------------------------------------------------
    // Tutorial 06 (forking) additions. Both shots put FORKER (signed in, has a
    // username, NOT the owner) on OWNER's public "My Notebook" page. The clip
    // creates FORKER's PRIVATE fork of that project -- the persisted fork the
    // merge-request tutorials (07-08) build their propose/merge flows on. No
    // double-fork guard is needed here the way ensurePublished guards its seed:
    // ensurePublished re-runs at the top of every shot, whereas this fork
    // happens in exactly ONE shot, once per run, and every run boots a fresh
    // sealed server (capture.js startServers/stop per scenario) -- so a re-run
    // starts from an empty DB, never a second fork stacked on the first.
    { id: 'gallery/fork-button', kind: 'still', run: async (t) => {
        // The ready-state Fork control: FORKER has a username, so
        // GalleryDetailBody renders the actual "Fork this project" BUTTON
        // (GalleryDetailBody.tsx:72-75), not the "Sign in to fork" /
        // "Set a username to fork" LINKS the signed-out / no-username states
        // render (GalleryDetailBody.tsx:67-71). Waiting on the button as a
        // button (getByRole) is the anti-rot guard for the tutorial's 3-state
        // claim -- a regression that turned the ready state back into a link
        // would fail this wait rather than silently snapping the wrong state.
        await ensurePublished(t);
        await ensureUser(t, FORKER);
        await gotoProjectPage(t);
        await t.page.getByRole('button', { name: 'Fork this project' }).waitFor({ timeout: 15000 });
        await settle(t.page, 400);
        // Element crop to the action-button column (GalleryDetailBody.tsx:54 --
        // the standalone detail page's only div.max-w-xs; the other match in
        // the codebase, NewProjectModal.tsx:118, never mounts here). Shows
        // Open in editor + Download + Version history + Fork this project
        // stacked together -- the tutorial's decision-table protagonists in one
        // legible figure, same crop rationale as AUTH_CARD / div.mt-10 above.
        await t.snap('div.max-w-xs');
    } },
    { id: 'gallery/clip-fork-flow', kind: 'clip', run: async (t) => {
        // The fork round-trip the tutorial walks: from OWNER's public project
        // page, click Fork, land in the editor on the new private fork, open
        // the Cloud menu, and reveal the "↳ forked from upstream" link that
        // only forks show. The clip MUST end on that indicator.
        await ensurePublished(t);
        await ensureUser(t, FORKER);
        await gotoProjectPage(t);
        // Same ready-state guard as the still, so the clip can't begin on a
        // signed-out/no-username page where the Fork button isn't a button.
        await t.page.getByRole('button', { name: 'Fork this project' }).waitFor({ timeout: 15000 });

        t.beginClip();
        // forkProject clicks "Fork this project", then waits for /app + the
        // real editor canvas (hooks/useGalleryDetail.ts fork() stages the
        // forked state WITH cloud linkage -- cloud:{projectId,lastSyncedCommitId}
        // -- then navigate('/app')). That linkage is what makes the indicator
        // below appear: an unlinked Open-in-editor copy never would.
        await forkProject(t);

        // Cloud menu -> the forked-from indicator. getByTitle('Cloud') is the
        // exact toggle query the whole cloud wave uses (CloudMenu.tsx:97,
        // title="Cloud"). The indicator is a full-page <Link> reading
        // "↳ forked from upstream — view source" (CloudMenu.tsx:122-127),
        // rendered only once CloudMenu's own getProject fetch resolves the
        // fork's forkedFromProjectId (CloudMenu.tsx:40-44) -- waitFor
        // auto-waits for that async fetch, and is the anti-rot guard for the
        // indicator's exact text AND the "clip ends on the indicator"
        // requirement. link role (not button): a plain "Propose changes"
        // regression that dropped the link would fail this specifically.
        await t.page.getByTitle('Cloud').click();
        await settle(t.page, 700);
        await t.page.getByRole('link', { name: /forked from upstream/i }).waitFor({ state: 'visible', timeout: 15000 });
        await settle(t.page, 1800); // hold the open menu + lineage link as the closing frames
    } },
    // -----------------------------------------------------------------------
    // Tutorial 07 (merge requests: proposing) additions. FORKER edits their
    // private fork, saves, and proposes the change upstream. Both shots reuse
    // the same fork (Tutorial 06's) via ensureForkOpen and run the identical
    // recolour+save prelude; only mr-author-view submits, creating the single
    // clean, named merge request Tutorial 08 reviews and merges.
    { id: 'gallery/propose-changes-modal', kind: 'still', run: async (t) => {
        // The fork, cover recoloured and SAVED, with the Propose modal open and
        // filled -- stopped one click short of Create merge request (this still
        // documents the modal itself; mr-author-view below actually submits).
        await ensureForkOpen(t);
        await recolorForkCover(t);
        await saveToCloud(t, FORK_COMMIT_MSG);

        // Cloud menu -> Propose changes to upstream (only forks show it, gated
        // on the linked cloud project's forkedFromProjectId -- CloudMenu.tsx
        // :134). saveToCloud closed the menu on success, so reopen it.
        await t.page.getByTitle('Cloud').click();
        await settle(t.page, 700);
        await t.page.getByRole('button', { name: /propose changes to upstream/i }).click();
        await t.page.getByRole('heading', { name: /propose changes to upstream/i }).waitFor({ timeout: 10000 });
        // Neither field has a <label> (ProposeChangesModal.tsx) -- getByPlaceholder
        // is the only handle, same as cloud.js's proposeChanges. Fill BOTH here
        // (the shared helper fills only the required title) so the figure shows
        // a complete, realistic proposal.
        await t.page.getByPlaceholder("Title, e.g. 'Add iPad variant'").fill(MR_TITLE);
        await t.page.getByPlaceholder('What changed and why?').fill(MR_DESCRIPTION);
        await settle(t.page, 500);
        await t.snap(PROPOSE_MODAL);
    } },
    { id: 'gallery/mr-author-view', kind: 'still', run: async (t) => {
        // The merge request page as its AUTHOR, right after submitting: the
        // structured change list (one real template modification), the author
        // status guidance, and a rendered before/after of the recoloured cover.
        await ensureForkOpen(t);
        await recolorForkCover(t);
        await saveToCloud(t, FORK_COMMIT_MSG);
        await proposeChanges(t, MR_TITLE); // fills the title, submits, lands on /mr/:id

        // The page is server-computed live on every view (server/routes/
        // mergeRequests.js GET /:id recomputes the diff) -- these waits double
        // as anti-rot for the tutorial's core claims: the structured (not-JSON)
        // change list shows the real template modification, the status is
        // "open", and the author guidance sentence is exactly this.
        await t.page.getByRole('heading', { name: MR_TITLE }).waitFor({ timeout: 15000 });
        await t.page.getByText('open', { exact: true }).waitFor({ timeout: 10000 });
        await t.page.getByText('~ Template modified: default/notebook_cover').waitFor({ timeout: 10000 });
        await t.page.getByText('Waiting for the project owner to review this merge request.').waitFor({ timeout: 10000 });

        // Render the before/after preview so the figure shows the change, not
        // just its label -- the exact button + decode wait merge_requests.spec.js
        // :161-163 proves works (generateThumbnails: jsPDF -> pdf.js raster).
        // before = upstream's slate cover, after = the fork's teal one.
        await t.page.getByRole('button', { name: /render before\/after preview/i }).click();
        await t.page.waitForFunction(() => {
            const imgs = [...document.querySelectorAll('img[alt="before"], img[alt="after"]')];
            return imgs.length === 2 && imgs.every(i => i.complete && i.naturalWidth > 0);
        }, { timeout: 30000 });
        await settle(t.page, 500);
        // Crop to the MergeRequestPage content column (its <main>, max-w-3xl) --
        // heading + status + guidance + the whole Proposed-changes card in one
        // legible figure; the AppHeader above adds nothing this still documents.
        await t.snap('main');
    } },
    // -----------------------------------------------------------------------
    // Tutorial 08 (merge requests: reviewing, merging, conflicts) additions.
    // OWNER receives Tutorial 07's proposal: reviews it, merges it, then a real
    // conflict is constructed and shown. Order is load-bearing (shared per-run
    // DB): review (no consume) -> merge (consumes the open MR) -> conflict
    // (dirties the upstream, so it runs LAST).
    { id: 'gallery/mr-owner-review', kind: 'still', run: async (t) => {
        // The OWNER's side of the SAME request Tutorial 07 proposed, reached the
        // way an owner really finds it: the per-project "Merge requests" list on
        // their gallery page, then the review page itself -- with the owner
        // guidance line, a rendered before/after, and the Merge button that only
        // the owner (not the author) gets. Reuses the open MR; viewing it never
        // consumes it, so clip-merge below can still merge it.
        await ensureOpenCoverMr(t);   // as FORKER (reuses Tutorial 07's MR, or creates one)
        await signOut(t);
        await ensureUser(t, OWNER);

        // Discovery surface: the owner's own project page shows an owner-only
        // "Merge requests" section (GalleryDetailBody.tsx:81, isOwner &&
        // mrs.length) -- proven by merge_requests.spec.js:157-159. Click the row
        // (a Link named by the MR title) to land on /mr/:id, exercising and
        // documenting the real path in.
        await gotoProjectPage(t);
        await t.page.getByRole('heading', { name: 'Merge requests' }).waitFor({ timeout: 15000 });
        await t.page.getByRole('link', { name: new RegExp(MR_TITLE) }).click();
        await t.page.waitForURL('**/mr/**', { timeout: 15000 });

        // Owner-specific review page. The guidance line and the Merge button are
        // the anti-rot for the tutorial's "what the owner gets" claims (the
        // author sees neither); status stays open (viewing never merges/closes).
        // Guidance string is verbatim from MergeRequestPage.tsx:22.
        await t.page.getByRole('heading', { name: MR_TITLE }).waitFor({ timeout: 15000 });
        await t.page.getByText('open', { exact: true }).waitFor({ timeout: 10000 });
        await t.page.getByText('You own the target project — review the changes below, then merge or close.').waitFor({ timeout: 10000 });
        await t.page.getByText('~ Template modified: default/notebook_cover').waitFor({ timeout: 10000 });
        await t.page.getByRole('button', { name: 'Merge', exact: true }).waitFor({ timeout: 10000 });

        // Render the before/after so the figure shows the change, not just its
        // label -- same decode wait as mr-author-view / merge_requests.spec.js.
        await t.page.getByRole('button', { name: /render before\/after preview/i }).click();
        await t.page.waitForFunction(() => {
            const imgs = [...document.querySelectorAll('img[alt="before"], img[alt="after"]')];
            return imgs.length === 2 && imgs.every(i => i.complete && i.naturalWidth > 0);
        }, { timeout: 30000 });
        await settle(t.page, 500);
        await t.snap('main');
    } },
    { id: 'gallery/clip-merge', kind: 'clip', run: async (t) => {
        // The owner merges the open request and watches the result land as a
        // commit. Reuses the open MR (mr-owner-review left it open), then: click
        // Merge -> merged state -> the "Merge: ..." commit at the head of the
        // project's own version history. CONSUMES the MR (it becomes merged).
        const mrId = await ensureOpenCoverMr(t);   // as FORKER
        await signOut(t);
        await ensureUser(t, OWNER);
        await t.page.goto(t.baseUrl + `/mr/${mrId}`);
        // Guard the pre-merge state: owner + open => Merge button present
        // (MergeRequestPage.tsx:163 renders it only for isOwner && open).
        await t.page.getByRole('button', { name: 'Merge', exact: true }).waitFor({ timeout: 15000 });
        await settle(t.page, 700); // fully settle the loaded MR page before recording opens

        t.beginClip();
        await settle(t.page, 1000); // open on the reviewable MR + its Merge button (the click target)
        // Merge: the window.confirm ("A new version will be created.") is
        // auto-accepted by the runner's dialog handler (capture.js:67). On
        // success load() refetches -> status merged, guidance changes, Merge
        // button gone -- proven by merge_requests.spec.js:170-172.
        await t.page.getByRole('button', { name: 'Merge', exact: true }).click();
        await t.page.getByText('merged', { exact: true }).waitFor({ timeout: 15000 });
        await t.page.getByText('This merge request was merged into the target project.').waitFor({ timeout: 10000 });
        await settle(t.page, 1400); // hold on the merged success state

        // The change landed as an ordinary commit in OWNER's project history.
        // Their gallery-page Version history modal lists ALL commits for the
        // owner (server/routes/projects.js:264 -- isOwner drops the
        // published-only filter), so the merge commit is HEAD. Message:
        // `Merge: <title> (from @author)` (mergeRequests.js:248).
        await gotoProjectPage(t);
        await t.page.getByRole('button', { name: 'Version history' }).click();
        await t.page.getByRole('heading', { name: 'Version history' }).waitFor({ timeout: 10000 });
        await t.page.getByText(new RegExp(`Merge: ${MR_TITLE}`)).waitFor({ timeout: 10000 });
        await settle(t.page, 1800); // hold on the merge commit in history as the closing frames
    } },
    { id: 'gallery/mr-conflict', kind: 'still', run: async (t) => {
        // A REAL conflict, built the way the tutorial describes: FORKER proposes
        // the teal cover, then OWNER independently recolours the SAME cover
        // template to a DIFFERENT colour (amber) and saves -- moving the
        // upstream head. The live diff (recomputed on every view) then flags the
        // template as changed on both sides, flips the request to conflicted,
        // and withholds Merge. Runs LAST: dirtying the upstream would conflict
        // the open MR the two shots above rely on.

        // 1) FORKER: fork teal, saved, proposed as a SEPARATE request (distinct
        //    title -- a full run has already merged MR_TITLE by clip-merge).
        await ensureForkOpen(t);
        await recolorForkCover(t);                  // teal (dedupes if already teal)
        await saveToCloud(t, FORK_COMMIT_MSG);
        await proposeChanges(t, CONFLICT_MR_TITLE); // new MR, lands on /mr/:id
        const mrId = mrIdFromUrl(t);

        // 2) OWNER: open the upstream "My Notebook" cloud-linked and recolour the
        //    same cover template to amber, then save -> upstream head moves.
        await signOut(t);
        await ensureUser(t, OWNER);
        await ensureOwnerProjectOpen(t);
        await recolorCoverTo(t, OWNER_COVER_FILL);  // amber, unmistakably != teal/slate
        await saveToCloud(t, OWNER_DIRTY_COMMIT_MSG);

        // 3) OWNER: reopen the request. The GET recomputes the diff against the
        //    now-amber head (mergeRequests.js:184-191), flips it to conflicted,
        //    and renders the red Conflicts banner naming the shared template.
        //    Conflicted status + conflicted guidance (verbatim from
        //    MergeRequestPage.tsx:25) + the withheld Merge button are the
        //    anti-rot for the tutorial's "merge is refused" claim.
        await t.page.goto(t.baseUrl + `/mr/${mrId}`);
        await t.page.getByText('conflicted', { exact: true }).waitFor({ timeout: 15000 });
        await t.page.getByText(/was changed on both sides/).waitFor({ timeout: 10000 });
        await t.page.getByText("The target project has changed since this was proposed — it can't be merged as-is. Update your fork and propose the changes again.").waitFor({ timeout: 10000 });
        // Merge is refused in the UI: no Merge button on a conflicted request
        // (only Close). A regression that re-enabled it fails this count check.
        if (await t.page.getByRole('button', { name: 'Merge', exact: true }).count() !== 0) {
            throw new Error('conflicted MR still shows a Merge button — UI merge-refusal regression');
        }
        await t.page.getByRole('button', { name: 'Close', exact: true }).waitFor({ timeout: 10000 });
        await settle(t.page, 500);
        await t.snap('main');
    } },
];
