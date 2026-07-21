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
        // OWNER's /projects page, deliberately LAST of the wave so the list
        // shows all three cloud rows created this run with distinct names
        // and mixed visibility: "My Notebook" (public -- the ensurePublished
        // seed), "Reading Log" (private, 1 version), "Sketchbook" (private,
        // 2 versions). Reordering these shots would fail the row waits below
        // -- that coupling is deliberate, same as later gallery scenarios
        // depending on this file's earlier seeding.
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
];
