
import { test, expect } from '@playwright/test';
import { signUpAndVerify, TEST_PASSWORD } from './helpers.js';

// The API server (server/index.js) listens on a different origin than the Vite
// dev server that Playwright's baseURL points at (see .env: VITE_API_BASE).
// Direct API assertions below hit it explicitly rather than relying on DOM text.
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';

const unique = Date.now();
const activePane = page => page.locator('[data-testid="project-pane"][data-active="true"]');

const waitForPersistedGenerator = async (page, expected) => {
    await expect.poll(() => page.evaluate(() => {
        const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
        const activeId = localStorage.getItem('hype_active_project');
        const generator = projects.find(project => project.id === activeId)?.initialState?.generator;
        return generator && { templateScript: generator.templateScript, hierarchyScript: generator.hierarchyScript };
    })).toEqual(expected);
};

const applyDistinctiveGenerator = async (page) => {
    await page.getByTitle('Generate Hierarchy via Script').click();
    const baseTemplateSource = await page.getByLabel('Template script').inputValue();
    const baseHierarchySource = await page.getByLabel('Hierarchy script').inputValue();
    const templateSource = `${baseTemplateSource}\n\n// fork source:   café 雪   \n`;
    const hierarchySource = `${baseHierarchySource}\n\n// fork hierarchy:   λ   \n`;
    await page.getByLabel('Template script').fill(templateSource);
    await page.getByLabel('Hierarchy script').fill(hierarchySource);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByText('3 nodes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Replace Current Project' }).click();
    await expect(page.getByTestId('project-tab').filter({ hasText: 'My Simple Book' })).toBeVisible();
    await waitForPersistedGenerator(page, { templateScript: templateSource, hierarchyScript: hierarchySource });
    return { templateSource, hierarchySource };
};

test.describe('Fork', () => {
    test('two-user fork loop: publish, fork, edit, save; fork stays private', async ({ browser }) => {
        test.setTimeout(150000);

        // ---------------------------------------------------------------
        // User A: sign up and publish a project to the gallery.
        // ---------------------------------------------------------------
        const ctxA = await browser.newContext();
        const pageA = await ctxA.newPage();
        pageA.on('dialog', dialog => {
            dialog.accept(dialog.type() === 'prompt' ? 'A initial save' : undefined);
        });

        await signUpAndVerify(pageA, {
            name: 'User A',
            username: `user_a_${unique}`,
            email: `usera${unique}@test.dev`,
            password: TEST_PASSWORD,
        });

        await pageA.goto('/app');
        const generatorSource = await applyDistinctiveGenerator(pageA);
        await pageA.getByTitle('Cloud').click();
        const [createRes] = await Promise.all([
            pageA.waitForResponse(
                res => res.url().includes('/api/projects') && res.request().method() === 'POST',
                { timeout: 15000 }
            ),
            pageA.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        expect(createRes.ok()).toBeTruthy();
        await expect(pageA.getByRole('button', { name: 'Save to cloud (new)' })).toBeHidden();

        await pageA.getByTitle('Cloud').click();
        await pageA.getByRole('button', { name: /publish to gallery/i }).click();
        await pageA.getByPlaceholder('What is this planner for?').fill(`Forkable planner ${unique}`);
        const [publishRes] = await Promise.all([
            pageA.waitForResponse(
                res => res.url().includes('/publish') && res.request().method() === 'POST',
                { timeout: 60000 }
            ),
            pageA.getByRole('button', { name: /^publish$/i }).click(),
        ]);
        expect(publishRes.ok()).toBeTruthy();
        const projectId = (await publishRes.json()).project.id;
        await expect(pageA.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });

        // Sanity: source starts with 0 forks.
        const detailBefore = await pageA.request.get(`${API_BASE}/api/gallery/${projectId}`);
        expect((await detailBefore.json()).project.forkCount).toBe(0);

        // ---------------------------------------------------------------
        // User B: separate browser context (independent session/cookies).
        // ---------------------------------------------------------------
        const ctxB = await browser.newContext();
        const pageB = await ctxB.newPage();
        pageB.on('dialog', dialog => {
            dialog.accept(dialog.type() === 'prompt' ? 'B edit save' : undefined);
        });

        await signUpAndVerify(pageB, {
            name: 'User B',
            username: `user_b_${unique}`,
            email: `userb${unique}@test.dev`,
            password: TEST_PASSWORD,
        });

        // B opens the gallery detail page for A's published project and forks it.
        // GalleryDetailPage's heading shows the generated project name; publish
        // description renders separately below it.
        await pageB.goto(`/gallery/${projectId}`);
        await expect(pageB.getByRole('heading', { name: 'My Simple Book' })).toBeVisible({ timeout: 10000 });
        await expect(pageB.getByText(`Forkable planner ${unique}`)).toBeVisible();

        const [forkRes] = await Promise.all([
            pageB.waitForResponse(
                res => res.url().includes(`/api/projects/${projectId}/fork`) && res.request().method() === 'POST',
                { timeout: 15000 }
            ),
            pageB.getByRole('button', { name: /fork this project/i }).click(),
        ]);
        expect(forkRes.ok()).toBeTruthy();
        const forkedProjectId = (await forkRes.json()).project.id;
        expect(forkedProjectId).not.toBe(projectId);

        // Lands in /app with a new cloud-linked tab.
        await pageB.waitForURL('**/app', { timeout: 15000 });
        await expect(pageB.getByTitle('Close Project')).toHaveCount(2, { timeout: 10000 });

        await activePane(pageB).getByTitle('Generate Hierarchy via Script').click();
        await expect(pageB.getByLabel('Template script')).toHaveValue(generatorSource.templateSource);
        await expect(pageB.getByLabel('Hierarchy script')).toHaveValue(generatorSource.hierarchySource);
        await pageB.getByRole('button', { name: 'Close generator' }).click();

        // CloudMenu surfaces the upstream lineage.
        await pageB.getByTitle('Cloud').click();
        const lineageLink = pageB.getByRole('link', { name: /forked from upstream/i });
        await expect(lineageLink).toBeVisible({ timeout: 10000 });
        await expect(lineageLink).toHaveAttribute('href', `/gallery/${projectId}`);
        // Close the dropdown by clicking elsewhere before interacting with the canvas.
        await pageB.mouse.click(10, 10);
        await expect(lineageLink).toBeHidden();

        // Edit the (forked) template: draw a rectangle on the canvas.
        // Note: inactive tabs stay mounted (just visually hidden), so the default
        // tab's toolbar/canvas also exists in the DOM -- scope to the pane's
        // stable data-active marker to avoid ambiguous matches.
        const initialElementCount = await activePane(pageB).locator('[data-element-id]').count();
        await activePane(pageB).getByTitle('Rectangle (R)').click();
        const canvas = activePane(pageB).getByTestId('editor-canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');
        await pageB.mouse.move(box.x + 100, box.y + 100);
        await pageB.mouse.down();
        await pageB.mouse.move(box.x + 200, box.y + 200);
        await pageB.mouse.up();
        await expect(activePane(pageB).locator('[data-element-id]')).toHaveCount(initialElementCount + 1);

        // Save to cloud succeeds (button reads "Save to cloud", no "(new)" suffix,
        // since this tab is already cloud-linked from the fork).
        await pageB.getByTitle('Cloud').click();
        const [saveRes] = await Promise.all([
            pageB.waitForResponse(
                res => res.url().includes(`/api/projects/${forkedProjectId}/commits`) && res.request().method() === 'POST',
                { timeout: 15000 }
            ),
            pageB.getByRole('button', { name: 'Save to cloud', exact: true }).click(),
        ]);
        expect(saveRes.ok()).toBeTruthy();

        // ---------------------------------------------------------------
        // Verification: source's fork count incremented (both API and UI).
        // ---------------------------------------------------------------
        const detailAfter = await pageA.request.get(`${API_BASE}/api/gallery/${projectId}`);
        expect((await detailAfter.json()).project.forkCount).toBe(1);

        await pageA.goto(`/gallery/${projectId}`);
        await expect(pageA.getByText(/1\s*forks/)).toBeVisible({ timeout: 10000 });

        // ---------------------------------------------------------------
        // Verification: B's fork is private -- absent from the public gallery.
        // ---------------------------------------------------------------
        const forkDetailRes = await pageB.request.get(`${API_BASE}/api/gallery/${forkedProjectId}`);
        expect(forkDetailRes.status()).toBe(404);

        const listingRes = await pageB.request.get(`${API_BASE}/api/gallery?page=0`);
        const listing = await listingRes.json();
        expect(listing.items.some(item => item.id === forkedProjectId)).toBe(false);

        await ctxA.close();
        await ctxB.close();
    });
});
