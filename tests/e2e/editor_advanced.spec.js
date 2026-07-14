
import { test as base, expect } from '@playwright/test';
import { startMarkerServer } from './markerServer.js';

const test = base.extend({
    markerServer: async ({}, use) => {
        const marker = await startMarkerServer();
        try {
            await use(marker);
        } finally {
            await marker.close();
        }
    },
});

const ONE_PAGE_TEMPLATE_SOURCE = `const layerId = 'fixture-layer';
return {
    fixture_page: {
        id: 'fixture_page',
        name: 'Fixture Page',
        width: A4_WIDTH,
        height: A4_HEIGHT,
        layers: [{ id: layerId, name: 'Layer 1', order: 0, visible: true, locked: false }],
        elements: [{
            id: 'fixture-title', type: 'text', layerId,
            x: 40, y: 40, w: 300, h: 40,
            text: 'One-page isolation fixture', fontSize: 20
        }]
    }
};`;

const ONE_PAGE_HIERARCHY_SOURCE = `return {
    rootId: 'root',
    nodes: {
        root: {
            id: 'root', parentId: null, type: 'fixture_page',
            title: 'One Page Fixture', data: {}, children: []
        }
    }
};`;

const openGenerator = async (page) => {
    await page.getByTitle('Generate Hierarchy via Script').click();
    await expect(page.getByRole('heading', { name: 'Hierarchy Generator' })).toBeVisible();
};

const activePane = page => page.locator('[data-testid="project-pane"][data-active="true"]');

const readActiveGeneratedFields = page => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
    const activeId = localStorage.getItem('hype_active_project');
    const state = projects.find(project => project.id === activeId)?.initialState;
    if (!state) throw new Error('Active project state not found.');
    return {
        nodes: state.nodes,
        rootId: state.rootId,
        variants: state.variants,
        activeVariantId: state.activeVariantId,
        generator: state.generator,
    };
});

const applyOnePageFixture = async page => {
    await openGenerator(page);
    await page.getByLabel('Template script').fill(ONE_PAGE_TEMPLATE_SOURCE);
    await page.getByLabel('Hierarchy script').fill(ONE_PAGE_HIERARCHY_SOURCE);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByText('1 template', { exact: true })).toBeVisible();
    await expect(page.getByText('1 node', { exact: true })).toBeVisible();
    await expect(page.getByText('1 estimated page', { exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Apply Generated Project' }).click();
    await expect(page.getByTestId('project-tab').filter({ hasText: 'One Page Fixture' })).toBeVisible();
    await expect.poll(async () => (await readActiveGeneratedFields(page)).generator).toMatchObject({
        templateScript: ONE_PAGE_TEMPLATE_SOURCE,
        hierarchyScript: ONE_PAGE_HIERARCHY_SOURCE,
    });
    return readActiveGeneratedFields(page);
};

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
        const canvas = activePane(page).getByTestId('editor-canvas');
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

    test('sandbox removes DOM, network, storage, cookie, and loader globals', async ({ page, markerServer }) => {
        const before = await applyOnePageFixture(page);
        await openGenerator(page);
        const blockedGlobals = `
if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('DOM exposed');
if (typeof fetch !== 'undefined') { fetch('${markerServer.url('/isolation-fetch-exposed.js')}'); throw new Error('network exposed'); }
if (typeof XMLHttpRequest !== 'undefined') throw new Error('network exposed');
if (typeof WebSocket !== 'undefined' || typeof indexedDB !== 'undefined') throw new Error('browser capability exposed');
if (typeof localStorage !== 'undefined' || typeof sessionStorage !== 'undefined') throw new Error('storage exposed');
if (typeof cookieStore !== 'undefined') throw new Error('cookies exposed');
if (typeof caches !== 'undefined' || typeof importScripts !== 'undefined') throw new Error('loader exposed');
`;
        await page.getByLabel('Template script').fill(blockedGlobals + ONE_PAGE_TEMPLATE_SOURCE);
        await page.getByLabel('Hierarchy script').fill(ONE_PAGE_HIERARCHY_SOURCE);

        await page.getByRole('button', { name: 'Preview', exact: true }).click();

        await expect(page.getByText('1 variant', { exact: true })).toBeVisible();
        await expect(page.getByText('1 template', { exact: true })).toBeVisible();
        await expect(page.getByText('1 node', { exact: true })).toBeVisible();
        await expect(page.getByText('1 estimated page', { exact: true })).toBeVisible();
        expect(markerServer.hits).toEqual([]);
        expect(await readActiveGeneratedFields(page)).toEqual(before);
        await expect(page.getByTestId('project-tab').filter({ hasText: 'One Page Fixture' })).toBeVisible();
        await expect(activePane(page).locator('[data-element-id]')).toHaveCount(1);
    });

    test('sandbox rejects dynamic import without requesting the module', async ({ page, markerServer }) => {
        const before = await applyOnePageFixture(page);
        await openGenerator(page);
        await page.getByLabel('Template script').fill(`return import('${markerServer.url('/dynamic-import-must-not-load.js')}');`);

        await page.getByRole('button', { name: 'Preview', exact: true }).click();

        await expect(page.getByRole('alert')).toContainText('Runtime: Template script must return synchronously.');
        await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
        expect(markerServer.hits).toEqual([]);
        expect(await readActiveGeneratedFields(page)).toEqual(before);
        await expect(activePane(page).locator('[data-element-id]')).toHaveCount(1);
    });

    test('sandbox times out after 10 seconds without changing the canvas or freezing the modal', async ({ page, markerServer }) => {
        test.setTimeout(25000);
        const before = await applyOnePageFixture(page);
        await openGenerator(page);
        await page.getByLabel('Template script').fill(`
if (typeof fetch !== 'undefined') fetch('${markerServer.url('/timeout-must-not-request.js')}');
while (true) {}
`);
        const startedAt = Date.now();

        await page.getByRole('button', { name: 'Preview', exact: true }).click();

        await expect(page.getByRole('alert')).toContainText('Timeout: Generator exceeded the 10000 ms execution limit.', { timeout: 15000 });
        const elapsedMs = Date.now() - startedAt;
        expect(elapsedMs).toBeGreaterThanOrEqual(9500);
        expect(elapsedMs).toBeLessThan(12500);
        expect(markerServer.hits).toEqual([]);
        expect(await readActiveGeneratedFields(page)).toEqual(before);
        await expect(activePane(page).locator('[data-element-id]')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();

        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Close generator' }).click();
        await expect(page.getByRole('heading', { name: 'Hierarchy Generator' })).toBeHidden();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'One Page Fixture' })).toBeVisible();
        expect(await readActiveGeneratedFields(page)).toEqual(before);
    });

    test('should Trigger PDF Export', async ({ page }, testInfo) => {
        // 1. Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // 2. Click Export Button
        // Selector based on text "Export PDF"
        await page.getByRole('button', { name: 'Export PDF' }).click();

        // 3. Wait for download
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.pdf');

        await download.saveAs(testInfo.outputPath('exported_project.pdf'));
    });
});
