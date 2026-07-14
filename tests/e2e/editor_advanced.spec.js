
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

    test('should preview, apply, and retain generator source through reload and manual edits', async ({ page }) => {
        // 1. Open Generator
        await page.getByTitle('Generate Hierarchy via Script').click();
        await expect(page.getByText('Hierarchy Generator')).toBeVisible();
        const templateSource = await page.getByLabel('Template script').inputValue();
        const hierarchySource = await page.getByLabel('Hierarchy script').inputValue();

        // 2. Preview Default Generator without changing the current project
        await page.getByRole('button', { name: 'Preview' }).click();
        await expect(page.getByText('1 variant', { exact: true })).toBeVisible();
        await expect(page.getByText('2 templates', { exact: true })).toBeVisible();
        await expect(page.getByText('3 nodes', { exact: true })).toBeVisible();
        await expect(page.getByText('3 estimated pages', { exact: true })).toBeVisible();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'Blank Project' })).toBeVisible();

        // 3. Apply preview and verify generated project
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Apply Generated Project' }).click();
        await expect(page.getByText('Hierarchy Generator')).not.toBeVisible();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'My Simple Book' })).toBeVisible();

        // 4. Autosave and reload; source must reopen byte-for-byte
        await page.waitForTimeout(1200);
        await page.reload();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'My Simple Book' })).toBeVisible();
        await page.getByTitle('Generate Hierarchy via Script').click();
        await expect(page.getByText('Saved Generator', { exact: true })).toBeVisible();
        await expect(page.getByLabel('Template script')).toHaveValue(templateSource);
        await expect(page.getByLabel('Hierarchy script')).toHaveValue(hierarchySource);
        await page.getByRole('button', { name: 'Close generator' }).click();

        // 5. Manual template edits do not rewrite saved source
        await page.getByTitle('Rectangle (R)').click();
        const canvas = page.getByTestId('editor-canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');
        await page.mouse.move(box.x + 120, box.y + 120);
        await page.mouse.down();
        await page.mouse.move(box.x + 220, box.y + 180);
        await page.mouse.up();
        await page.getByTitle('Generate Hierarchy via Script').click();
        await expect(page.getByLabel('Template script')).toHaveValue(templateSource);
        await expect(page.getByLabel('Hierarchy script')).toHaveValue(hierarchySource);
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
