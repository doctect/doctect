import { test, expect } from '@playwright/test';

test.describe('Editor Functionality', () => {
    test.beforeEach(async ({ page }) => {
        // Clear local storage to ensure fresh start
        await page.goto('/app');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('should load default blank project', async ({ page }) => {
        // Wait for app calculation/render
        await expect(page.locator('button[title="New Project"]')).toBeVisible();

        // Use test-id which identifies it as a tab specifically.
        const tabs = page.getByTestId('project-tab');
        await expect(tabs.first()).toBeVisible({ timeout: 10000 });
        await expect(tabs.first()).toContainText('Blank Project');
    });

    test('should create a new project', async ({ page }) => {
        await page.locator('button[title="New Project"]').click();
        await page.getByRole('button', { name: 'Notebook' }).click();

        // Verify using test-id
        const tab = page.getByTestId('project-tab').filter({ hasText: 'My Notebook' });
        await expect(tab).toBeVisible();
    });

    test('should switch between projects', async ({ page }) => {
        // Initial state: One 'Blank Project' tab, active.
        const firstTab = page.getByTestId('project-tab').first();
        await expect(firstTab).toHaveClass(/bg-slate-100/);

        // Create second project
        await page.locator('button[title="New Project"]').click();
        await page.getByRole('button', { name: '2026 Planner' }).click();

        // New tab should be active
        // filtering by text 'Planner 2026'
        const tabs = page.getByTestId('project-tab');
        const texts = await tabs.allTextContents();
        console.log('Current Tabs:', texts);

        const plannerTab = tabs.filter({ hasText: '2026 Planner' });
        await expect(plannerTab).toBeVisible();
        await expect(plannerTab).toHaveClass(/bg-slate-100/);

        // First tab should be inactive
        await expect(firstTab).not.toHaveClass(/bg-slate-100/);

        // Switch back
        await firstTab.click();
        await expect(firstTab).toHaveClass(/bg-slate-100/);
    });

    test('should close a project', async ({ page }) => {
        // Create second project so we can close one
        await page.locator('button[title="New Project"]').click();
        await page.getByRole('button', { name: 'Blank Project' }).click();

        // Now we have two "Blank Project" tabs.
        // We want to close the last one (which is active).
        const tabs = page.getByTestId('project-tab');

        // Wait for 2 tabs
        await expect(async () => {
            expect(await tabs.count()).toBeGreaterThanOrEqual(2);
        }).toPass();

        const activeTab = tabs.last();

        // Find close button inside THIS tab.
        // The close button doesn't have a test-id yet, but title="Close Project" is specific enough inside the tab context.
        await activeTab.hover();
        await activeTab.locator('button[title="Close Project"]').click();

        // Verify modal
        await expect(page.getByText('Close Project?').first()).toBeVisible();
    });
});
