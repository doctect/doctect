import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const fixture = JSON.parse(readFileSync(
    new URL('../fixtures/text-overflow-parity-v10.json', import.meta.url),
    'utf8',
));

const activePane = page => page.locator('[data-testid="project-pane"][data-active="true"]');
const element = (page, id) => activePane(page).locator(`[data-element-id="${id}"]`);

test.describe('Text overflow parity', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(projectState => {
            localStorage.setItem('hype_projects', JSON.stringify([
                { id: 'text-overflow', name: 'Text Overflow Parity', initialState: projectState },
            ]));
            localStorage.setItem('hype_active_project', 'text-overflow');
        }, fixture);
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.goto('/app');
        await expect(page.getByTestId('project-tab').filter({ hasText: 'Text Overflow Parity' })).toBeVisible();
        await expect(activePane(page).getByTestId('editor-canvas')).toBeVisible();
        await expect(activePane(page).locator('[data-element-id]')).toHaveCount(14);
        await page.evaluate(() => document.fonts.ready);
    });

    test('exposes fixed, grid, and dormant auto-width controls with canonical defaults', async ({ page }) => {
        await element(page, 'text-clip-wrap').click();
        const overflow = activePane(page).getByLabel('Overflow', { exact: true });
        const wrap = activePane(page).getByLabel('Wrap', { exact: true });
        await expect(overflow).toHaveValue('clip');
        await expect(wrap).toBeChecked();
        expect(await overflow.locator('option').allTextContents()).toEqual([
            'Clip',
            'Ellipsis',
            'Shrink',
            'Visible',
        ]);

        await element(page, 'grid-clip').click();
        const cellOverflow = activePane(page).getByLabel('Cell text overflow', { exact: true });
        const cellWrap = activePane(page).getByLabel('Wrap cell text', { exact: true });
        await expect(cellOverflow).toHaveValue('clip');
        await expect(cellWrap).not.toBeChecked();
        expect(await cellOverflow.locator('option').allTextContents()).toEqual([
            'Clip',
            'Ellipsis',
            'Shrink',
            'Visible',
        ]);

        await element(page, 'text-auto-width-dormant').click();
        await expect(overflow).toHaveValue('shrink');
        await expect(wrap).not.toBeChecked();
        await expect(overflow).toBeDisabled();
        await expect(wrap).toBeDisabled();
        await expect(activePane(page).getByText(
            'Auto-width text sizes to content; overflow and wrap apply only to fixed-size text.',
            { exact: true },
        )).toBeVisible();
    });

    test('renders fixture policies and exports matching browser artifacts', async ({ page }, testInfo) => {
        const fixedLineCounts = {
            'text-clip-nowrap': 1,
            'text-clip-wrap': 2,
            'text-ellipsis-nowrap': 1,
            'text-ellipsis-wrap': 2,
            'text-shrink-nowrap': 1,
            'text-shrink-wrap': 3,
            'text-visible-nowrap': 2,
            'text-visible-wrap-rotated': 2,
        };
        for (const [id, count] of Object.entries(fixedLineCounts)) {
            await expect(element(page, id).locator('[data-text-layout-line]')).toHaveCount(count);
        }

        const gridLineCounts = {
            'grid-clip': [1, 1],
            'grid-ellipsis': [1, 2],
            'grid-shrink': [1, 1],
            'grid-visible': [1, 4],
        };
        for (const [id, counts] of Object.entries(gridLineCounts)) {
            const cells = element(page, id).locator('[data-grid-cell]');
            await expect(cells).toHaveCount(2);
            for (const [index, count] of counts.entries()) {
                await expect(cells.nth(index).locator('[data-text-layout-line]')).toHaveCount(count);
            }
        }

        for (const id of ['text-clip-nowrap', 'text-ellipsis-nowrap', 'text-shrink-nowrap']) {
            await expect(element(page, id).locator('[data-text-layout-line]').first().locator('..')).toHaveCSS('overflow', 'hidden');
        }
        await expect(element(page, 'text-visible-nowrap').locator('[data-text-layout-line]').first().locator('..')).toHaveCSS('overflow', 'visible');
        for (const id of ['grid-clip', 'grid-ellipsis', 'grid-shrink']) {
            await expect(element(page, id).locator('[data-grid-cell-text]').first()).toHaveCSS('overflow', 'hidden');
        }
        await expect(element(page, 'grid-visible').locator('[data-grid-cell-text]').first()).toHaveCSS('overflow', 'visible');

        const shrinkSizes = await element(page, 'grid-shrink').locator('[data-grid-cell-text]').evaluateAll(
            boxes => boxes.map(box => Number.parseFloat(box.style.fontSize)),
        );
        expect(shrinkSizes).toHaveLength(2);
        expect(shrinkSizes[0]).toBeGreaterThan(shrinkSizes[1]);
        expect(shrinkSizes[1]).toBeGreaterThan(0);

        const autoWidth = element(page, 'text-auto-width-dormant');
        await expect(autoWidth).toHaveCSS('width', '120px');
        await expect(autoWidth.locator('[data-text-layout-line]')).toHaveCount(0);
        const autoWidthLegacyStyle = await autoWidth.evaluate(node => {
            const text = Array.from(node.children).find(child => child.textContent === 'Auto width remains content-sized');
            return {
                outerWhiteSpace: node.style.whiteSpace,
                textOverflow: text?.style.overflow,
                textWhiteSpace: text?.style.whiteSpace,
            };
        });
        expect(autoWidthLegacyStyle).toEqual({
            outerWhiteSpace: 'pre',
            textOverflow: 'visible',
            textWhiteSpace: 'pre',
        });

        const rotated = element(page, 'text-visible-wrap-rotated');
        await rotated.click();
        await activePane(page).getByLabel('Overflow', { exact: true }).selectOption('clip');
        const rotatedClip = rotated.locator('[data-text-layout-line]').first().locator('..');
        await expect(rotatedClip).toHaveCSS('overflow', 'hidden');
        expect(await rotated.evaluate(node => ({
            transform: node.style.transform,
            clipTransform: node.querySelector('[data-text-layout-line]')?.parentElement?.style.transform,
            clipIsDescendant: node.contains(node.querySelector('[data-text-layout-line]')?.parentElement ?? null),
        }))).toEqual({
            transform: 'translate(320px, 100px) rotate(17deg)',
            clipTransform: '',
            clipIsDescendant: true,
        });

        await activePane(page).getByTestId('editor-canvas').click({ position: { x: 450, y: 650 } });
        const canvasPath = testInfo.outputPath('text-overflow-canvas.png');
        await page.screenshot({ path: canvasPath, fullPage: true });
        await testInfo.attach('text-overflow-canvas.png', { path: canvasPath, contentType: 'image/png' });

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export PDF' }).click();
        const download = await downloadPromise;
        const pdfPath = testInfo.outputPath('text-overflow.pdf');
        await download.saveAs(pdfPath);
        await testInfo.attach('text-overflow.pdf', { path: pdfPath, contentType: 'application/pdf' });
    });
});
