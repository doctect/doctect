
import { test, expect } from '@playwright/test';

test.describe('Editor Advanced Features', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/app');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'Blank Project' })).toBeVisible();
    });

    test('should Create and configure a Data Grid', async ({ page }) => {
        // 1. Select Grid Tool
        await page.getByTitle('Data Grid (G)').click();

        // 2. Draw Grid on Canvas
        const canvas = page.getByTestId('editor-canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');

        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.mouse.move(box.x + 300, box.y + 200);
        await page.mouse.up();

        // 3. Verify Grid Created
        // Grid elements are canvas elements with type 'grid' but we can just check element count
        const elements = page.locator('[data-element-id]');
        await expect(elements).toHaveCount(1);

        // 4. Verify Properties Panel shows Grid settings
        // We assume the new element is selected, so properties panel should be visible
        const propsPanel = page.locator('.flex.flex-col.h-full.border-l'); // A bit weak, maybe improve later
        // or check for specific text like "Grid Configuration" or "Columns"
        await expect(page.getByText('Grid Configuration')).toBeVisible();
    });

    test('should Run the Hierarchy Generator', async ({ page }) => {
        // 1. Open Generator
        await page.getByTitle('Generate Hierarchy via Script').click();
        await expect(page.getByText('Hierarchy Generator')).toBeVisible();

        // 2. Run Default Generator
        // The default script generates a "2026 Planner"
        await page.getByRole('button', { name: 'Run Generator' }).click();

        // 3. Verify Success
        await expect(page.getByText('Generated Successfully!')).toBeVisible();

        // 4. Verify Project Content Updated
        // The tabs should now reflect the new structure or at least the root node title might change if the script updates it.
        // The default script sets root title to "2026 Planner".
        // Wait for modal to close (it closes after 1.5s)
        await page.waitForTimeout(2000);

        // Check if tab name changed
        // Note: ProjectEditor.tsx updates parent name when root title changes.
        // But the TabBar might need a moment or a reload, or state update.
        // Let's check the TabBar.
        await expect(page.getByTestId('project-tab').filter({ hasText: '2026 Planner' })).toBeVisible();
    });

    test('should Trigger PDF Export', async ({ page }) => {
        // 1. Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // 2. Click Export Button
        // Selector based on text "Export PDF"
        await page.getByRole('button', { name: 'Export PDF' }).click();

        // 3. Wait for download
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.pdf');

        // Save to 'test-results' for manual inspection
        await download.saveAs('test-results/exported_project.pdf');
    });
});
