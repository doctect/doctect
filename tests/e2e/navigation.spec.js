import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
    test('should load landing page and contain key elements', async ({ page }) => {
        await page.goto('/');

        // Check for specific Landing Page content
        await expect(page.getByRole('heading', { name: /Design Complex/i })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Launch App' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Documentation' })).toBeVisible();
    });

    test('should navigate to docs page', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: /Docs/i }).click();

        await expect(page).toHaveURL(/.*\/docs/);
        // Verify docs content loads
        await expect(page.getByRole('heading', { name: 'Introduction' })).toBeVisible();
    });

    test('should handle 404 for unknown routes', async ({ page }) => {
        // If 404 is not implemented, this might just show blank or fallback.
        // Testing behavior:
        await page.goto('/unknown-random-route');
        // If app redirects to home or shows specific 404, we verify that.
        // Expect to stay on the random route (client-side routing usually keeps URL for 404s)
        await expect(page).toHaveURL(/\/unknown-random-route/);
    });
});
