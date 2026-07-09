
import { test, expect } from '@playwright/test';
import { signUpAndVerify, TEST_PASSWORD } from './helpers.js';

const unique = Date.now();

test.describe('Gallery', () => {
    test('publish → browse gallery happy path', async ({ page }) => {
        test.setTimeout(90000);

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

        // 2. Save the default "Blank Project" (auto-loaded for a fresh session) to the cloud.
        await page.goto('/app');
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

        // 3. Publish it to the gallery via the Publish wizard.
        await page.getByTitle('Cloud').click();
        await page.getByRole('button', { name: /publish to gallery/i }).click();
        await page.getByPlaceholder('What is this planner for?').fill('E2E published planner');
        // Default page selection (the lone blank page) is already valid, so no
        // checkbox interaction is needed for the happy path.
        const [publishRes] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/publish') && res.request().method() === 'POST',
                { timeout: 60000 }
            ),
            page.getByRole('button', { name: /^publish$/i }).click(),
        ]);
        expect(publishRes.ok()).toBeTruthy();
        // The modal only closes once `onPublished` fires, i.e. the success path.
        await expect(page.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });

        // 4. Browse the gallery (same session is fine for the happy path) and confirm
        // the published project appears. GalleryPage only ever renders `item.name`
        // (the project name), not the publish description, so assert on the name.
        await page.goto('/gallery');
        await expect(page.getByText('Blank Project').first()).toBeVisible({ timeout: 10000 });
    });
});
