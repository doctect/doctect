
import { test, expect } from '@playwright/test';
import { signUpAndVerify, TEST_PASSWORD } from './helpers.js';

const unique = Date.now();

const waitForPersistedGenerator = async (page, expected) => {
    await expect.poll(() => page.evaluate(() => {
        const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
        const activeId = localStorage.getItem('hype_active_project');
        const generator = projects.find(project => project.id === activeId)?.initialState?.generator;
        return generator && { templateScript: generator.templateScript, hierarchyScript: generator.hierarchyScript };
    })).toEqual(expected);
};

test.describe('Gallery', () => {
    test('published generator source opens inertly, edits byte-exactly, and survives a fork', async ({ browser }) => {
        test.setTimeout(180000);

        const ctxA = await browser.newContext();
        const page = await ctxA.newPage();

        // Auto-accept native dialogs: the "commit message" prompt from Save to
        // cloud, and the "Published!" alert after a successful publish.
        page.on('dialog', dialog => {
            dialog.accept(dialog.type() === 'prompt' ? 'e2e save' : undefined);
        });

        // 1. Sign up a fresh user via the real /login signup form. Signup leaves
        // the account unverified and session-less (requireEmailVerification:
        // true in server/auth.js) -- signUpAndVerify marks it verified directly
        // in the server's DB and finishes by signing in for real.
        await signUpAndVerify(page, {
            name: 'E2E User',
            username: `e2e_user_${unique}`,
            email: `e2e${unique}@test.dev`,
            password: TEST_PASSWORD,
        });

        // Generate source with distinctive whitespace/Unicode and a page-scope tripwire.
        await page.goto('/app');
        await page.getByTitle('Generate Hierarchy via Script').click();
        const baseTemplateSource = await page.getByLabel('Template script').inputValue();
        const baseHierarchySource = await page.getByLabel('Hierarchy script').inputValue();
        const openTripwire = `/generator-source-open-must-not-run-${unique}.js`;
        const templateSource = `if (typeof fetch !== 'undefined') fetch('${openTripwire}');\n\n${baseTemplateSource}\n\n//   café 雪 source bytes   \n`;
        const hierarchySource = `${baseHierarchySource}\n\n// hierarchy spacing:   λ   \n`;
        await page.getByLabel('Template script').fill(templateSource);
        await page.getByLabel('Hierarchy script').fill(hierarchySource);
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        await expect(page.getByText('3 nodes', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Apply Generated Project' }).click();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'My Simple Book' })).toBeVisible();
        await waitForPersistedGenerator(page, { templateScript: templateSource, hierarchyScript: hierarchySource });

        // Save generated project to cloud.
        await page.getByTitle('Cloud').click();
        const [createRes] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/api/projects') && res.request().method() === 'POST',
                { timeout: 15000 }
            ),
            page.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        expect(createRes.ok()).toBeTruthy();
        // CloudMenu's dropdown only closes once the save actually resolves (setOpen(false)
        // runs after the awaited create call) -- wait for that before reopening it, otherwise
        // a still-open menu would just toggle shut instead of opening for the next click.
        await expect(page.getByRole('button', { name: 'Save to cloud (new)' })).toBeHidden();

        // Publish wizard must disclose that source becomes public.
        await page.getByTitle('Cloud').click();
        await page.getByRole('button', { name: /publish to gallery/i }).click();
        await expect(page.getByRole('alert')).toContainText('Publishing makes both scripts public.');
        await page.getByPlaceholder('What is this planner for?').fill('E2E published planner');
        // Default first-page selection is already valid.
        const [publishRes] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/publish') && res.request().method() === 'POST',
                { timeout: 60000 }
            ),
            page.getByRole('button', { name: /^publish$/i }).click(),
        ]);
        expect(publishRes.ok()).toBeTruthy();
        const projectId = (await publishRes.json()).project.id;
        // The modal only closes once `onPublished` fires, i.e. the success path.
        await expect(page.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });

        // Confirm listing, then use a genuinely separate user/session for open/edit/fork.
        await page.goto('/gallery');
        await expect(page.getByText('My Simple Book').first()).toBeVisible({ timeout: 10000 });

        const ctxB = await browser.newContext();
        const pageB = await ctxB.newPage();
        pageB.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'source persistence save' : undefined));
        const sourceExecutionRequests = [];
        pageB.on('request', request => {
            if (request.url().includes(openTripwire)) sourceExecutionRequests.push(request.url());
        });
        await signUpAndVerify(pageB, {
            name: 'Gallery Source User',
            username: `gallery_source_${unique}`,
            email: `gallerysource${unique}@test.dev`,
            password: TEST_PASSWORD,
        });

        await pageB.goto(`/gallery/${projectId}`);
        await pageB.getByRole('button', { name: /open in editor/i }).click();
        await pageB.waitForURL('**/app', { timeout: 15000 });
        await expect(pageB.getByTitle('Close Project')).toHaveCount(2, { timeout: 10000 });
        const activePane = pageB.locator('.absolute.inset-0.w-full.h-full.opacity-100');
        await activePane.getByTitle('Generate Hierarchy via Script').click();
        await expect(pageB.getByLabel('Template script')).toHaveValue(templateSource);
        await expect(pageB.getByLabel('Hierarchy script')).toHaveValue(hierarchySource);
        await expect(pageB.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
        await pageB.waitForTimeout(250);
        expect(sourceExecutionRequests).toEqual([]);

        const editedTitle = `Gallery Edited ${unique}`;
        const editedTemplateSource = `${templateSource}\n\n// edited source:   naïve Δ   \n`;
        const editedHierarchySource = hierarchySource.replace("title: 'My Simple Book'", `title: '${editedTitle}'`);
        await pageB.getByLabel('Template script').fill(editedTemplateSource);
        await pageB.getByLabel('Hierarchy script').fill(editedHierarchySource);
        await pageB.getByRole('button', { name: 'Preview', exact: true }).click();
        await expect(pageB.getByText('3 nodes', { exact: true })).toBeVisible();
        await pageB.getByRole('button', { name: 'Apply Generated Project' }).click();
        await expect(pageB.getByTestId('project-tab').filter({ hasText: editedTitle })).toBeVisible();
        await waitForPersistedGenerator(pageB, { templateScript: editedTemplateSource, hierarchyScript: editedHierarchySource });

        await pageB.getByTitle('Cloud').click();
        const [editedCreateRes] = await Promise.all([
            pageB.waitForResponse(res => res.url().includes('/api/projects') && res.request().method() === 'POST', { timeout: 15000 }),
            pageB.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        expect(editedCreateRes.ok()).toBeTruthy();
        await pageB.reload();
        await expect(pageB.getByTestId('project-tab').filter({ hasText: editedTitle })).toBeVisible();
        const reloadedPane = pageB.locator('.absolute.inset-0.w-full.h-full.opacity-100');
        await reloadedPane.getByTitle('Generate Hierarchy via Script').click();
        await expect(pageB.getByLabel('Template script')).toHaveValue(editedTemplateSource);
        await expect(pageB.getByLabel('Hierarchy script')).toHaveValue(editedHierarchySource);
        await pageB.getByRole('button', { name: 'Close generator' }).click();

        await pageB.goto(`/gallery/${projectId}`);
        await pageB.getByRole('button', { name: /fork this project/i }).click();
        await pageB.waitForURL('**/app', { timeout: 15000 });
        await expect(pageB.getByTitle('Close Project')).toHaveCount(3, { timeout: 10000 });
        const forkPane = pageB.locator('.absolute.inset-0.w-full.h-full.z-10.opacity-100');
        await forkPane.getByTitle('Generate Hierarchy via Script').click();
        await expect(pageB.getByLabel('Template script')).toHaveValue(templateSource);
        await expect(pageB.getByLabel('Hierarchy script')).toHaveValue(hierarchySource);
        expect(sourceExecutionRequests).toEqual([]);

        await ctxA.close();
        await ctxB.close();
    });
});
