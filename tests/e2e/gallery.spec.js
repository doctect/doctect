
import { test, expect } from '@playwright/test';

const unique = Date.now();

test.describe('Gallery', () => {
    test('publish → browse gallery happy path', async ({ page }) => {
        test.setTimeout(90000);

        // Auto-accept native dialogs: the "commit message" prompt from Save to
        // cloud, and the "Published!" alert after a successful publish.
        page.on('dialog', dialog => {
            dialog.accept(dialog.type() === 'prompt' ? 'e2e save' : undefined);
        });

        // 1. Sign up a fresh user via the real /login signup form.
        await page.goto('/login');
        // Initially in "Sign In" mode; this toggle button (outside the <form>)
        // is the only "Sign Up" match until it's clicked (the submit button
        // reads "Sign In" until then).
        await page.getByRole('button', { name: 'Sign Up' }).click();
        // Name/Username inputs have no placeholder or for/id label association,
        // just adjacent sibling <label>s -- select via the CSS sibling combinator.
        await page.locator('label:text-is("Name") + input').fill('E2E User');
        await page.locator('label:text-is("Username") + input').fill(`e2e_user_${unique}`);
        await page.locator('input[type="email"]').fill(`e2e${unique}@test.dev`);
        await page.locator('input[type="password"]').fill('Password-1234!');
        // Now the submit button reads "Sign Up" (the toggle now reads "Sign In").
        await page.getByRole('button', { name: 'Sign Up' }).click();
        await page.waitForURL('**/app', { timeout: 15000 });

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
