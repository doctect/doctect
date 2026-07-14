
import { test, expect } from '@playwright/test';
import { signUpAndVerify, apiSignUpAndVerify, TEST_PASSWORD } from './helpers.js';

// The API server (server/index.js) listens on a different origin than the Vite
// dev server that Playwright's baseURL points at (see .env: VITE_API_BASE).
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';

const unique = Date.now();

const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const minimalState = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 7,
};

test.describe('Username identity', () => {
    test('changing username via Account settings updates the profile and gallery author', async ({ page }) => {
        test.setTimeout(120000);
        page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Initial save' : undefined));

        const oldUsername = `old_handle_${unique}`;
        const newUsername = `new_handle_${unique}`;

        await signUpAndVerify(page, {
            name: 'Identity Tester',
            username: oldUsername,
            email: `identity${unique}@test.dev`,
            password: TEST_PASSWORD,
        });

        // Save + publish the default project.
        await page.getByTitle('Cloud').click();
        await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/projects') && res.request().method() === 'POST'),
            page.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        // CloudMenu's dropdown only closes once the save actually resolves (setOpen(false)
        // runs after the awaited create call) -- wait for that before reopening it, otherwise
        // a still-open menu would just toggle shut instead of opening for the next click.
        await expect(page.getByRole('button', { name: 'Save to cloud (new)' })).toBeHidden();
        await page.getByTitle('Cloud').click();
        await page.getByRole('button', { name: /publish to gallery/i }).click();
        await page.getByPlaceholder('What is this planner for?').fill(`Identity test planner ${unique}`);
        const [publishRes] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/publish') && res.request().method() === 'POST', { timeout: 60000 }),
            page.getByRole('button', { name: /^publish$/i }).click(),
        ]);
        expect(publishRes.ok()).toBeTruthy();
        await expect(page.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });

        // Gallery card shows the original username. The unfiltered gallery renders up to
        // three curated sections (Top rated / Popular / Recently updated), so the same
        // project card can legitimately appear more than once -- .first() is enough since
        // we only care that the author name shows up somewhere.
        await page.goto('/gallery');
        await expect(page.getByText(`by ${oldUsername}`).first()).toBeVisible({ timeout: 10000 });

        // Old profile works and lists the project.
        await page.goto(`/u/${oldUsername}`);
        await expect(page.getByRole('heading', { name: oldUsername })).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Blank Project')).toBeVisible();

        // Change username via Account settings.
        await page.goto('/account');
        await page.getByPlaceholder('e.g. planner_pro').fill(newUsername);
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Username updated.')).toBeVisible({ timeout: 10000 });

        // Old profile URL now 404s.
        const oldProfileRes = await page.request.get(`${API_BASE}/api/users/${oldUsername}`);
        expect(oldProfileRes.status()).toBe(404);

        // New profile works and lists the project.
        await page.goto(`/u/${newUsername}`);
        await expect(page.getByRole('heading', { name: newUsername })).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Blank Project')).toBeVisible();

        // Gallery card now shows the new username (again, may appear in multiple sections).
        await page.goto('/gallery');
        await expect(page.getByText(`by ${newUsername}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('a session with no username is redirected to /welcome before it can fork, and continues afterward', async ({ browser }) => {
        test.setTimeout(60000);

        // Upstream project + owner, set up entirely via direct API calls (no UI needed for this side).
        const ownerCtx = await browser.newContext();
        await apiSignUpAndVerify(ownerCtx.request, API_BASE, {
            email: `owner${unique}@test.dev`,
            password: TEST_PASSWORD,
            name: 'Owner',
            username: `owner_${unique}`,
        });
        const createRes = await ownerCtx.request.post(`${API_BASE}/api/projects`, {
            data: { name: 'Upstream For Fork Test', state: minimalState },
        });
        expect(createRes.ok()).toBeTruthy();
        const project = (await createRes.json()).project;
        const projectId = project.id;
        const publishRes = await ownerCtx.request.post(`${API_BASE}/api/projects/${projectId}/publish`, {
            headers: { 'If-Match': project.headCommitId },
            data: { description: '', tags: [], thumbnails: [PNG_1X1] },
        });
        expect(publishRes.ok()).toBeTruthy();
        await ownerCtx.close();

        // The actual subject: a session with NO username, created directly via the API --
        // this is exactly what Google OAuth sign-in produces in production (no username ever collected).
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await apiSignUpAndVerify(page.request, API_BASE, {
            email: `nouser${unique}@test.dev`,
            password: TEST_PASSWORD,
            name: 'No Username Person',
        });

        await page.goto(`/gallery/${projectId}`);
        await expect(page.getByText('Set a username to fork')).toBeVisible({ timeout: 10000 });
        await page.getByText('Set a username to fork').click();
        await page.waitForURL('**/welcome', { timeout: 10000 });

        await page.getByPlaceholder('e.g. planner_pro').fill(`forker_${unique}`);
        await page.getByRole('button', { name: 'Continue' }).click();

        // Continues on to the original destination (the gallery detail page it came from).
        await page.waitForURL(`**/gallery/${projectId}`, { timeout: 10000 });
        await expect(page.getByRole('button', { name: /fork this project/i })).toBeVisible({ timeout: 10000 });

        await ctx.close();
    });
});
