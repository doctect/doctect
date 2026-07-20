// Cloud-flow capture helpers: accounts, cloud saves, publishing, forking, and
// merge requests. Selectors below are sourced from, in order of authority:
//   - tests/e2e/fork.spec.js, tests/e2e/merge_requests.spec.js
//     (proven, currently-passing Playwright selectors driving these exact
//     flows through the UI -- more precise than the tutorial episodes, which
//     predate several of these components and use CSS locators)
//   - tests/e2e/helpers.js (sign-up form fields, verification-screen wait)
//   - tests/unit/AccountMenu.test.tsx (proven getByTitle('Account') / "Sign
//     out" query pattern used by the component's own test suite)
//   - tutorial/episodes/ep4.js, ep5.js (end-to-end step order: signup ->
//     verify -> save -> publish; fork -> edit -> save -> propose)
//   - components/cloud/CloudMenu.tsx, PublishModal.tsx, ProposeChangesModal.tsx,
//     pages/LoginPage.tsx, pages/WelcomePage.tsx, components/AccountMenu.tsx
//     (button labels / modal structure, cross-checked against the above)
import { settle } from './app.js';

const pollVerificationLink = async (servers, tries = 25) => {
    for (let i = 0; i < tries; i++) {
        const link = servers.lastVerificationLink();
        if (link) return link;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('no verification link appeared in the API log');
};

// `name` isn't part of the exported signature (the gallery tasks only pass
// username/email/password), but pages/LoginPage.tsx's sign-up form requires
// one (`required` on the Name input, sent as `name` to signUp.email). Derive
// a friendly one from the username instead of a fixed literal, so multiple
// accounts created by later gallery scenarios don't all show the same name.
const displayNameFor = (username) =>
    username.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function signUpAndVerify(t, { username, email, password }) {
    const { page, servers } = t;
    await page.goto(`${t.baseUrl}/login`);
    await settle(page, 800);

    // Toggle to sign-up mode. Exactly one control's accessible name contains
    // "Sign Up" at this point -- the mode-toggle button (pages/LoginPage.tsx
    // renders the submit button as "Sign In" and the toggle as "Sign Up"
    // while isLogin is still true). Ported from tests/e2e/helpers.js:116,
    // which uses `{ name: 'Sign Up' }` with no `exact` -- its own comment
    // explains plain "Sign In" needs `exact` to dodge "Sign in with Google",
    // but "Sign Up" never collides with anything on this page.
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await settle(page, 500);

    // Fields are <label htmlFor> + <input id> pairs (pages/LoginPage.tsx:
    // 268-323), so getByLabel resolves them without touching the `#login-*`
    // ids that tests/e2e/helpers.js (CSS `label:text-is("Name") + input`,
    // `input[type="email"]`, `input[type="password"]`) and tutorial/episodes/
    // ep4.js (`#login-name`, `#login-email`, ...) both rely on instead.
    // "Name" must be `exact`: the "Username" label's text contains "name" as
    // a case-insensitive substring, so a plain getByLabel('Name') hits a
    // strict-mode violation (two matches) once the Username field is mounted.
    await page.getByLabel('Name', { exact: true }).fill(displayNameFor(username));
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);

    // Submit. Now the only "Sign Up"-named control is the submit button (the
    // toggle reads "Sign In" once isLogin flips) -- helpers.js:121.
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await page.getByText(/verify your email/i).waitFor({ state: 'visible', timeout: 15000 });

    const link = await pollVerificationLink(servers);
    await page.goto(link);
    // autoSignInAfterVerification normally lands on /login?verified=1, which
    // client-side redirects to /app -- but if the server side ever decided
    // this account still needs a username (USERNAME_REQUIRED-style gate),
    // wait for either destination rather than assuming /app and blowing the
    // timeout budget before the /welcome fallback below even gets a look.
    await page.waitForURL((url) => url.pathname === '/app' || url.pathname === '/welcome', { timeout: 20000 });
    await settle(page, 1000);

    // Defensive, per the brief: LoginPage's sign-up form already collects a
    // username (unlike the Google OAuth path), so /welcome shouldn't fire
    // here in practice -- but components/cloud/CloudMenu.tsx and
    // hooks/useGalleryDetail.ts both redirect to /welcome on a
    // USERNAME_REQUIRED response, and pages/WelcomePage.tsx is exactly that
    // form, so handle it if it does.
    if (new URL(page.url()).pathname === '/welcome') {
        await page.getByLabel('Username').fill(username);
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForURL((url) => url.pathname !== '/welcome', { timeout: 15000 }).catch(() => {});
        await settle(page, 500);
    }
}

export async function saveToCloud(t, commitMessage = 'Docs capture save') {
    const { page } = t;
    // getByTitle('Cloud'), not a role/text guess: this is the exact query
    // tests/e2e/fork.spec.js and merge_requests.spec.js use throughout, and
    // matches components/cloud/CloudMenu.tsx's toggle button (`title="Cloud"`).
    await page.getByTitle('Cloud').click();
    await settle(page, 700);
    // Matches both "Save to cloud" (already cloud-linked) and "Save to cloud
    // (new)" (first save) in one selector -- components/cloud/CloudMenu.tsx:
    // 112-115. fork.spec.js/merge_requests.spec.js use the two exact strings
    // separately because those tests know which state they're in; a reusable
    // helper doesn't, so the substring regex covers either.
    //
    // NOTE for later gallery tasks: the window.prompt this opens is answered
    // by the runner's page-level dialog handler (docs-capture/lib/capture.js),
    // which uses `shot.dialogText` -- there is no plumbing from this
    // `commitMessage` parameter back to the shot object it came from. If a
    // scenario needs a specific, human-readable commit message to show up in
    // a cloud version-history screenshot, set `dialogText` on that shot to
    // the same string passed here; otherwise every prompt in the shot is
    // answered with the shot's one dialogText (or capture.js's 'Docs capture'
    // default).
    await page.getByRole('button', { name: /save to cloud/i }).click();
    await settle(page, 2500);
}

export async function publishProject(t, { description, tags } = {}) {
    const { page } = t;
    await page.getByTitle('Cloud').click();
    await settle(page, 700);
    // components/cloud/CloudMenu.tsx:129-132; proven by fork.spec.js:72.
    await page.getByRole('button', { name: /publish to gallery/i }).click();
    await settle(page, 1200);

    // Neither field has an associated <label> in components/cloud/
    // PublishModal.tsx (Description's <span> sibling never gets an
    // htmlFor/id pairing, so getByLabel is not an option) -- fork.spec.js:73
    // confirms getByPlaceholder is the working selector for Description, and
    // the Tags input right below it (PublishModal.tsx:181-185) follows the
    // same pattern.
    await page.getByPlaceholder('What is this planner for?').fill(description ?? '');
    const tagsValue = Array.isArray(tags) ? tags.join(', ') : (tags ?? '');
    if (tagsValue) await page.getByPlaceholder('planner, 2026, remarkable').fill(tagsValue);
    await settle(page, 500);

    // Idle-state label is exactly "Publish" (PublishModal.tsx:209) --
    // fork.spec.js:79 matches it via /^publish$/i; `exact: true` here is the
    // getByRole-native equivalent, and also keeps this from ever matching
    // the (unmounted-by-now) "Publish to gallery…" menu button.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    // Publishing renders thumbnails client-side then uploads -- can take
    // several seconds. Wait for the modal's own heading (PublishModal.tsx:150)
    // to disappear instead of a fixed sleep; fork.spec.js:83 asserts the same
    // heading hidden as its done-signal.
    await page.getByRole('heading', { name: /publish to gallery/i }).waitFor({ state: 'hidden', timeout: 20000 });
    await settle(page, 500);
}

export async function openGalleryProject(t, name) {
    const { page } = t;
    await page.goto(`${t.baseUrl}/gallery`);
    await settle(page, 900);
    await page.getByText(name).first().click();
    await settle(page, 1000);
}

export async function forkProject(t) {
    const { page } = t;
    // components/gallery/GalleryDetailBody.tsx:72-75; proven by fork.spec.js:117
    // and merge_requests.spec.js:103,232.
    await page.getByRole('button', { name: /fork this project/i }).click();
    // hooks/useGalleryDetail.ts's fork() stages the forked state then
    // navigate('/app') -- wait for the real canvas too (same pattern as
    // gotoEditor in lib/app.js), since the staged import still has to load
    // once the route lands.
    await page.waitForURL('**/app**', { timeout: 20000 });
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 20000 });
    await settle(page, 1200);
}

export async function proposeChanges(t, message = 'Improvements from the docs fork') {
    const { page } = t;
    await page.getByTitle('Cloud').click();
    await settle(page, 700);
    // components/cloud/CloudMenu.tsx:135-138; proven by merge_requests.spec.js:133.
    // Only rendered once CloudMenu's own fetch of the linked cloud project
    // resolves `forkedFromProjectId` (CloudMenu.tsx:40-44) -- Playwright's
    // default click auto-waiting covers that, no extra polling needed.
    await page.getByRole('button', { name: /propose changes to upstream/i }).click();
    await page.getByRole('heading', { name: /propose changes to upstream/i }).waitFor({ state: 'visible' });

    // Neither field in components/cloud/ProposeChangesModal.tsx has a
    // <label> either -- same getByPlaceholder pattern as publishProject,
    // proven by merge_requests.spec.js:135 for the title field. The brief's
    // signature only exposes `message` (-> the description textarea); the
    // required title has no parameter, so it gets a fixed, generic value.
    await page.getByPlaceholder("Title, e.g. 'Add iPad variant'").fill('Docs capture proposal');
    await page.getByPlaceholder('What changed and why?').fill(message);
    await settle(page, 500);

    // components/cloud/ProposeChangesModal.tsx:54; proven by
    // merge_requests.spec.js:138. Submitting navigates to /mr/:id
    // (ProposeChangesModal.tsx:23).
    await page.getByRole('button', { name: 'Create merge request' }).click();
    await page.waitForURL('**/mr/**', { timeout: 20000 });
    await settle(page, 1500);
}

export async function signOut(t) {
    const { page } = t;
    // getByTitle('Account'), not a username-text click: components/AccountMenu.tsx's
    // toggle button's accessible name is the signed-in username itself (or
    // "Set username"), which this helper's signature has no way to know --
    // its `title="Account"` attribute is stable regardless. This is the exact
    // query tests/unit/AccountMenu.test.tsx uses throughout
    // (`screen.findByTitle('Account')`), including in its own sign-out test.
    await page.getByTitle('Account').click();
    await settle(page, 500);
    // AccountMenu.tsx's sign-out button reads exactly "Sign out" -- proven by
    // AccountMenu.test.tsx's `getByRole('button', { name: 'Sign out' })`.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
    await settle(page, 500);
}
