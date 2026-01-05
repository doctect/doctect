
import { test, expect } from '@playwright/test';

test.describe('Editor Canvas Interactions', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/app');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        // Wait for editor to load - Blank Project is default
        await expect(page.getByTestId('project-tab').filter({ hasText: 'Blank Project' })).toBeVisible();
    });

    test('should add a rectangle to the canvas', async ({ page }) => {
        // Select Rectangle Tool
        await page.getByTitle('Rectangle (R)').click();

        // Canvas area
        const canvas = page.getByTestId('editor-canvas');

        // Draw rectangle
        // We use bounding box to click relative to canvas
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');

        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.mouse.move(box.x + 200, box.y + 200);
        await page.mouse.up();

        // Verify element added
        const elements = page.locator('[data-element-id]');
        await expect(elements).toHaveCount(1);
    });

    test('should add text to the canvas', async ({ page }) => {
        // Select Text Tool
        await page.getByTitle('Text Box (T)').click();

        const canvas = page.getByTestId('editor-canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');

        // Text tool in this app requires a drag to define box size (min 5px threshold)
        const startX = box.x + 150;
        const startY = box.y + 150;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 100, startY + 50);
        await page.mouse.up();

        const elements = page.locator('[data-element-id]');
        await expect(elements).toHaveCount(1);
        // Default text is now empty
        await expect(elements.first()).toHaveText('');
    });

    test('should click-to-type text on canvas', async ({ page }) => {
        // Select Text Tool
        await page.getByTitle('Text Box (T)').click();

        const canvas = page.getByTestId('editor-canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');

        // Click on canvas (small movement < 5px)
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.mouse.up();

        // Verify element created
        const elements = page.locator('[data-element-id]');
        await expect(elements).toHaveCount(1);
        const textEl = elements.first();

        // Should be empty initially. Width starts at default 100px until typed in.
        await expect(textEl).toHaveText('');

        // Verify Focus: The textarea in PropertiesPanel should be focused.
        // We type immediately.
        const textToType = 'Hello World This Is Long';
        await page.keyboard.type(textToType);

        // Verify text updated on canvas
        await expect(textEl).toContainText(textToType);

        // Verify width expanded (Auto Width)
        // Default was 100 or min 20. Long string should make it > 150.
        const newBox = await textEl.boundingBox();
        expect(newBox.width).toBeGreaterThan(150);
    });

    test('should select and move an element', async ({ page }) => {
        // 1. Add Rectangle
        await page.getByTitle('Rectangle (R)').click();
        const canvas = page.getByTestId('editor-canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');

        const startX = box.x + 100;
        const startY = box.y + 100;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 100, startY + 100); // 100x100 rect
        await page.mouse.up();

        const el = page.locator('[data-element-id]').first();
        const initialBox = await el.boundingBox();

        // 2. Select Tool (auto-selected after draw? No, usually stays or switches?)
        // Canvas.tsx checks: if tool is rect, it adds and selects it.
        // But usually we switch back to Select tool manually or auto?
        // Let's assume we need to click Select tool to be safe or verify state.
        // Looking at Canvas.tsx handleMouseUp: it doesn't switch tool back to select.
        // It keeps the tool active. So we must switch to Select Tool.
        await page.getByTitle('Select Tool (V)').click();

        // 3. Drag element
        // Center of rect is roughly (startX + 50, startY + 50) relative to page
        // Wait, element is at local coords.
        // We can just drag the element center.
        if (!initialBox) throw new Error('Element not rendered');

        const dragStartX = initialBox.x + initialBox.width / 2;
        const dragStartY = initialBox.y + initialBox.height / 2;

        await page.mouse.move(dragStartX, dragStartY);
        await page.mouse.down();
        await page.mouse.move(dragStartX + 50, dragStartY + 50);
        await page.mouse.up();

        // Verify position changed
        const newBox = await el.boundingBox();
        expect(newBox?.x).toBeGreaterThan(initialBox.x);
        expect(newBox?.y).toBeGreaterThan(initialBox.y);
    });
});
