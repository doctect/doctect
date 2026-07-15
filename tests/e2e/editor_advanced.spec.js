
import { test as base, expect } from '@playwright/test';
import { MIN_NO_HIT_OBSERVATION_MS, startMarkerServer } from './markerServer.js';

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

const VISUAL_PREVIEW_TEMPLATE_SOURCE = `const template = (id, name, color) => ({
    id, name, width: A4_WIDTH, height: A4_HEIGHT,
    elements: [{
        id: id + '-title', type: 'text', x: 40, y: 40, w: 300, h: 40,
        text: name + ': {{title}}', fontSize: 20, color
    }]
});
return {
    variants: {
        paper: {
            id: 'paper', name: 'Paper',
            templates: {
                cover: template('cover', 'Paper Cover', '#111111'),
                content: template('content', 'Paper Content', '#222222'),
                unused: template('unused', 'Paper Spare', '#333333')
            }
        },
        slate: {
            id: 'slate', name: 'Slate',
            templates: {
                cover: template('cover', 'Slate Cover', '#444444'),
                content: template('content', 'Slate Content', '#555555'),
                unused: template('unused', 'Slate Spare', '#666666')
            }
        }
    },
    activeVariantId: 'paper'
};`;

const VISUAL_PREVIEW_HIERARCHY_SOURCE = `return {
    rootId: 'visual-root',
    nodes: {
        'visual-root': {
            id: 'visual-root', parentId: null, type: 'cover',
            title: 'Visual Preview Root', data: {}, children: ['chapter-one', 'chapter-two']
        },
        'chapter-one': {
            id: 'chapter-one', parentId: 'visual-root', type: 'content',
            title: 'Chapter One', data: {}, children: []
        },
        'chapter-two': {
            id: 'chapter-two', parentId: 'visual-root', type: 'content',
            title: 'Chapter Two', data: {}, children: []
        }
    }
};`;

const openGenerator = async (page) => {
    await activePane(page).getByRole('button', { name: 'Generator' }).click();
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

const readProject = (page, projectId) => page.evaluate(id => {
    const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
    const project = projects.find(candidate => candidate.id === id);
    if (!project) throw new Error(`Project ${id} not found.`);
    return project;
}, projectId);

const readActiveProject = page => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
    const activeId = localStorage.getItem('hype_active_project');
    const project = projects.find(candidate => candidate.id === activeId);
    if (!project) throw new Error('Active project not found.');
    return project;
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
    await page.getByRole('button', { name: 'Replace Current Project' }).click();
    await expect(page.getByTestId('project-tab').filter({ hasText: 'One Page Fixture' })).toBeVisible();
    await expect.poll(async () => (await readActiveGeneratedFields(page)).generator).toMatchObject({
        templateScript: ONE_PAGE_TEMPLATE_SOURCE,
        hierarchyScript: ONE_PAGE_HIERARCHY_SOURCE,
    });
    await page.waitForTimeout(MIN_NO_HIT_OBSERVATION_MS);
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

    test('previews visually, creates separately, and replaces with one-checkpoint Undo', async ({ page }) => {
        await applyOnePageFixture(page);
        const original = await readActiveProject(page);
        await page.evaluate(projectId => {
            const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
            const project = projects.find(candidate => candidate.id === projectId);
            project.cloud = { projectId: 'cloud-preserved', lastSyncedCommitId: 'commit-preserved' };
            localStorage.setItem('hype_projects', JSON.stringify(projects));
        }, original.id);
        await page.reload();
        const originalBefore = await readProject(page, original.id);
        const templateSource = VISUAL_PREVIEW_TEMPLATE_SOURCE;
        let sandboxFrameCount = 0;
        page.on('frameattached', () => { sandboxFrameCount += 1; });

        await openGenerator(page);
        await page.getByLabel('Template script').fill(templateSource);
        await page.getByLabel('Hierarchy script').fill(VISUAL_PREVIEW_HIERARCHY_SOURCE);
        const sourceCanvas = activePane(page).getByTestId('editor-canvas');
        const sourceCanvasElements = sourceCanvas.locator('[data-element-id]');
        const sourceCanvasElementCount = await sourceCanvasElements.count();
        const sourceCanvasText = sourceCanvas.getByText('One-page isolation fixture', { exact: true });
        const sourceCanvasTextBeforePreview = await sourceCanvasText.textContent();
        expect(sourceCanvasElementCount).toBe(1);
        expect(sourceCanvasTextBeforePreview).toBe('One-page isolation fixture');
        await expect(sourceCanvasText).toBeVisible();
        await page.getByRole('button', { name: 'Preview', exact: true }).click();

        const preview = page.getByRole('dialog', { name: 'Generated Project Preview' });
        await expect(preview).toBeVisible();
        await expect(sourceCanvasElements).toHaveCount(sourceCanvasElementCount);
        await expect(sourceCanvasText).toHaveText(sourceCanvasTextBeforePreview || '');
        expect(sandboxFrameCount).toBe(1);
        await expect(preview.getByRole('tab', { name: 'Paper' })).toHaveAttribute('aria-selected', 'true');
        await expect(preview.getByRole('button', { name: 'Paper Cover, Paper, 1 use' })).toBeVisible();
        await expect(preview.getByRole('button', { name: 'Paper Content, Paper, 2 uses' })).toBeVisible();
        await expect(preview.getByRole('button', { name: 'Paper Spare, Paper, unused' })).toContainText('Unused');
        expect(await readProject(page, original.id)).toEqual(originalBefore);

        const coverThumbnail = preview.getByRole('button', { name: 'Paper Cover, Paper, 1 use' });
        await coverThumbnail.click();
        await expect(page.getByRole('dialog', { name: 'Paper Cover preview' })).toBeVisible();
        await page.keyboard.press('ArrowRight');
        await expect(page.getByRole('dialog', { name: 'Paper Content preview' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Paper Content preview' })).toBeHidden();
        await expect(coverThumbnail).toBeFocused();

        await preview.getByRole('button', { name: 'Back to Scripts' }).click();
        await expect(page.getByLabel('Template script')).toHaveValue(templateSource);
        await expect(page.getByLabel('Hierarchy script')).toHaveValue(VISUAL_PREVIEW_HIERARCHY_SOURCE);
        const sandboxFramesBeforeReopen = sandboxFrameCount;
        await page.getByRole('button', { name: 'View Preview' }).click();
        await expect(preview).toBeVisible();
        expect(sandboxFrameCount).toBe(sandboxFramesBeforeReopen);

        await preview.getByRole('button', { name: 'Create New Project' }).click();
        const naming = page.getByRole('dialog', { name: 'Create Generated Project' });
        await naming.getByRole('textbox', { name: 'Project name' }).fill('Visual Preview Copy');
        await naming.getByRole('button', { name: 'Create Project' }).click();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'Visual Preview Copy' })).toBeVisible();
        const copy = await readActiveProject(page);
        expect(copy.name).toBe('Visual Preview Copy');
        expect(copy.initialState.rootId).toBe('visual-root');
        expect(copy.initialState.generator).toMatchObject({
            templateScript: templateSource,
            hierarchyScript: VISUAL_PREVIEW_HIERARCHY_SOURCE,
        });
        expect(await readProject(page, original.id)).toEqual(originalBefore);

        await page.getByTestId('project-tab').filter({ hasText: original.name }).click();
        await expect.poll(async () => (await readActiveProject(page)).id).toBe(original.id);
        await openGenerator(page);
        await page.getByLabel('Template script').fill(templateSource);
        await page.getByLabel('Hierarchy script').fill(VISUAL_PREVIEW_HIERARCHY_SOURCE);
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        await expect(preview).toBeVisible();
        page.once('dialog', dialog => dialog.accept());
        await preview.getByRole('button', { name: 'Replace Current Project' }).click();
        await expect.poll(async () => (await readProject(page, original.id)).initialState.rootId).toBe('visual-root');
        expect((await readProject(page, original.id)).cloud).toEqual(originalBefore.cloud);

        await activePane(page).getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
        await expect.poll(async () => (await readProject(page, original.id)).initialState.rootId).toBe(originalBefore.initialState.rootId);
        const originalAfterUndo = await readProject(page, original.id);
        expect(originalAfterUndo.initialState.nodes).toEqual(originalBefore.initialState.nodes);
        expect(originalAfterUndo.initialState.generator).toEqual(originalBefore.initialState.generator);
        expect(originalAfterUndo.initialState.variants).toEqual(originalBefore.initialState.variants);
        expect(originalAfterUndo.initialState.activeVariantId).toBe(originalBefore.initialState.activeVariantId);
        expect(originalAfterUndo.cloud).toEqual(originalBefore.cloud);
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
        await markerServer.observeNoHitsFor(MIN_NO_HIT_OBSERVATION_MS);
        expect(markerServer.hits).toEqual([]);
        expect(await readActiveGeneratedFields(page)).toEqual(before);
        await expect(page.getByTestId('project-tab').filter({ hasText: 'One Page Fixture' })).toBeVisible();
        await expect(activePane(page).getByTestId('editor-canvas').locator('[data-element-id]')).toHaveCount(1);
    });

    test('sandbox rejects dynamic import without requesting the module', async ({ page, markerServer }) => {
        const before = await applyOnePageFixture(page);
        await openGenerator(page);
        await page.getByLabel('Template script').fill(`return import('${markerServer.url('/dynamic-import-must-not-load.js')}');`);

        await page.getByRole('button', { name: 'Preview', exact: true }).click();

        await expect(page.getByRole('alert')).toContainText('Runtime: Template script must return synchronously.');
        await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
        await markerServer.observeNoHitsFor(MIN_NO_HIT_OBSERVATION_MS);
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
        await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
        await markerServer.observeNoHitsFor(MIN_NO_HIT_OBSERVATION_MS);
        expect(markerServer.hits).toEqual([]);
        expect(await readActiveGeneratedFields(page)).toEqual(before);
        await expect(activePane(page).locator('[data-element-id]')).toHaveCount(1);

        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Close generator' }).click();
        await expect(page.getByRole('heading', { name: 'Hierarchy Generator' })).toBeHidden();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'One Page Fixture' })).toBeVisible();
    });

    test('source edits terminate infinite previews promptly without accumulating Workers or frames', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Worker lifecycle evidence is required in Chromium.');
        await openGenerator(page);
        await page.getByLabel('Template script').fill('while (true) {}');

        for (let index = 0; index < 3; index += 1) {
            await page.getByRole('button', { name: 'Preview', exact: true }).click();
            await expect(page.locator('iframe[sandbox="allow-scripts"]')).toHaveCount(1);
            await page.waitForTimeout(100);
            const startedAt = Date.now();
            await page.getByLabel('Template script').fill(`while (true) {}\n// cancel ${index}`);
            await expect(page.locator('iframe[sandbox="allow-scripts"]')).toHaveCount(0, { timeout: 400 });
            expect(Date.now() - startedAt).toBeLessThan(400);
        }
    });

    test('sandbox source cannot fan out or spam global messaging', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Capability regression is required in Chromium.');
        await openGenerator(page);
        await page.getByLabel('Template script').fill(`
const exposed = ['Worker', 'SharedWorker', 'BroadcastChannel', 'MessageChannel', 'postMessage']
    .filter(name => typeof globalThis[name] !== 'undefined');
if (exposed.length > 0) {
    if (typeof postMessage === 'function') {
        for (let index = 0; index < 1000; index += 1) postMessage({ spam: index });
    }
    throw new Error('fan-out exposed: ' + exposed.join(','));
}
${ONE_PAGE_TEMPLATE_SOURCE}`);
        await page.getByLabel('Hierarchy script').fill(ONE_PAGE_HIERARCHY_SOURCE);

        await page.getByRole('button', { name: 'Preview', exact: true }).click();

        await expect(page.getByText('1 template', { exact: true })).toBeVisible();
        await expect(page.locator('iframe[sandbox="allow-scripts"]')).toHaveCount(0);
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
