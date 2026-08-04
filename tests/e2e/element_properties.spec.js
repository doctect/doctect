import { test, expect } from '@playwright/test';

const fixture = {
    nodes: {
        root: {
            id: 'root', parentId: null, type: 'page', title: 'Auto Width Page',
            data: { label: 'BOUND PREVIEW VALUE IS LONG' }, children: [],
        },
    },
    rootId: 'root',
    variants: {
        default: {
            id: 'default', name: 'Default', templates: {
                page: {
                    id: 'page', name: 'Page', width: 595, height: 842,
                    layers: [{ id: 'base', name: 'Base', order: 0, visible: true, locked: false }],
                    elements: [
                        {
                            id: 'literal', type: 'text', layerId: 'base',
                            x: 30, y: 40, w: 180, h: 40, rotation: 0,
                            fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                            text: 'Short', dataBinding: '', autoWidth: false,
                            fontSize: 16, fontFamily: 'helvetica', fontWeight: 'normal', fontStyle: 'normal',
                            textColor: '#000000', textOverflow: 'clip', textWrap: true,
                            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
                        },
                        {
                            id: 'bound', type: 'text', layerId: 'base',
                            x: 30, y: 120, w: 90, h: 30, rotation: 0,
                            fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                            text: '', dataBinding: 'label', autoWidth: true,
                            fontSize: 16, fontFamily: 'helvetica', fontWeight: 'bold', fontStyle: 'normal',
                            textColor: '#000000', textOverflow: 'ellipsis', textWrap: false,
                            textPadding: { top: 0, right: 0, bottom: 0, left: 0 },
                        },
                        {
                            id: 'grid', type: 'grid', layerId: 'base',
                            x: 30, y: 210, w: 100, h: 42, rotation: 0,
                            fill: '', stroke: '#000000', strokeWidth: 1, opacity: 1,
                            fontSize: 12, textColor: '#000000', textOverflow: 'clip', textWrap: false,
                            gridConfig: { cols: 1, gapX: 0, gapY: 0, sourceType: 'current' },
                        },
                        {
                            id: 'svg', type: 'svg', layerId: 'base',
                            x: 240, y: 210, w: 80, h: 80, rotation: 0,
                            fill: '', stroke: '', strokeWidth: 0, opacity: 1,
                            svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
                        },
                    ],
                },
            },
        },
    },
    activeVariantId: 'default', viewMode: 'hierarchy', selectedNodeId: 'root',
    selectedNodeIds: ['root'], selectedTemplateId: '', selectedTemplateIds: [],
    selectedElementIds: ['literal', 'bound'], activeLayerId: 'base',
    templatePreviewNodeId: 'root', scale: 0.8, tool: 'select', showJsonModal: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    sidebarWidth: 288, propertiesPanelWidth: 340, snapToGrid: false, showGrid: false,
    clipboard: [], schemaVersion: 11,
};

const activePane = page => page.locator('[data-testid="project-pane"][data-active="true"]');
const canvasElement = (page, id) => activePane(page).locator(`[data-element-id="${id}"]`);

test.describe('Element Properties auto width and disclosure', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(projectState => {
            localStorage.setItem('hype_projects', JSON.stringify([
                { id: 'element-properties', name: 'Element Properties', initialState: projectState },
            ]));
            localStorage.setItem('hype_active_project', 'element-properties');
        }, fixture);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/app');
        await expect(page).toHaveURL(`http://localhost:${process.env.E2E_WEB_PORT || 3000}/app`);
        await expect(activePane(page).getByTestId('editor-canvas')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
    });

    test('converts independently in one undo step and retains disclosure only for the mount', async ({ page }) => {
        const pane = activePane(page);
        const undo = pane.getByTitle('Undo (Ctrl+Z)');
        const autoWidth = pane.getByLabel('Auto width', { exact: true });
        await expect(autoWidth).toHaveAttribute('aria-checked', 'mixed');
        expect(await autoWidth.evaluate(input => input.indeterminate)).toBe(true);
        await expect(undo).toBeDisabled();

        const typography = pane.getByRole('button', { name: 'Typography', exact: true });
        await typography.click();
        await expect(typography).toHaveAttribute('aria-expanded', 'false');
        await expect(canvasElement(page, 'literal')).toContainText('Short');
        await expect(canvasElement(page, 'bound')).toContainText('BOUND PREVIEW VALUE IS LONG');
        await expect(undo).toBeDisabled();
        await typography.click();

        const geometry = pane.getByRole('button', { name: 'Geometry', exact: true });
        await geometry.focus();
        await page.keyboard.press('Enter');
        await expect(geometry).toHaveAttribute('aria-expanded', 'false');
        await expect(geometry).toBeFocused();
        await expect(undo).toBeDisabled();
        await expect(canvasElement(page, 'literal')).toContainText('Short');
        await expect(canvasElement(page, 'bound')).toContainText('BOUND PREVIEW VALUE IS LONG');

        await autoWidth.click();
        await expect(autoWidth).toBeChecked();
        await expect(autoWidth).toHaveAttribute('aria-checked', 'true');
        await expect(undo).toBeEnabled();
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(0);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(0);
        const widths = await Promise.all(['literal', 'bound'].map(id =>
            canvasElement(page, id).evaluate(node => Number.parseFloat(node.style.width)),
        ));
        expect(widths[0]).toBeGreaterThan(25);
        expect(widths[1]).toBeGreaterThan(widths[0]);

        await autoWidth.click();
        await expect(autoWidth).not.toBeChecked();
        await expect(autoWidth).toHaveAttribute('aria-checked', 'false');
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(1);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(1);
        const fixedWidths = await Promise.all(['literal', 'bound'].map(id =>
            canvasElement(page, id).evaluate(node => Number.parseFloat(node.style.width)),
        ));
        expect(fixedWidths).toEqual(widths);

        await undo.click();
        await expect(autoWidth).toBeChecked();
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(0);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(0);
        await expect(undo).toBeEnabled();
        await undo.click();
        await expect(autoWidth).toHaveAttribute('aria-checked', 'mixed');
        await expect(undo).toBeDisabled();
        await expect(canvasElement(page, 'literal')).toHaveCSS('width', '180px');
        await expect(canvasElement(page, 'bound')).toHaveCSS('width', '90px');
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(1);
        await expect(canvasElement(page, 'bound').locator('[data-text-layout-line]')).toHaveCount(0);

        await canvasElement(page, 'grid').click();
        await expect(pane.getByRole('button', { name: 'Geometry', exact: true })).toHaveAttribute('aria-expanded', 'false');
        const gridSection = pane.getByRole('button', { name: 'Grid Configuration', exact: true });
        await expect(gridSection).toHaveAttribute('aria-expanded', 'true');
        await gridSection.click();
        await canvasElement(page, 'literal').click();
        await expect(pane.getByRole('button', { name: 'Grid Configuration', exact: true })).toHaveCount(0);
        await canvasElement(page, 'grid').click();
        await expect(pane.getByRole('button', { name: 'Grid Configuration', exact: true })).toHaveAttribute('aria-expanded', 'false');
        await expect(undo).toBeDisabled();

        await page.reload();
        await expect(activePane(page).getByRole('button', { name: 'Geometry', exact: true })).toHaveAttribute('aria-expanded', 'true');
    });

    test('edits linked and independent padding and restores it after auto width', async ({ page }) => {
        const pane = activePane(page);
        await pane.getByTestId('editor-canvas').click({ position: { x: 450, y: 650 } });
        await canvasElement(page, 'literal').click();

        const top = pane.getByLabel('Padding top');
        const right = pane.getByLabel('Padding right');
        const bottom = pane.getByLabel('Padding bottom');
        const left = pane.getByLabel('Padding left');
        const link = pane.getByLabel('Link padding sides');
        await expect(link).toBeChecked();
        await top.fill('8');

        const textBox = canvasElement(page, 'literal').locator('[data-text-layout-line]').first().locator('..');
        await expect(textBox).toHaveCSS('left', '8px');
        await expect(textBox).toHaveCSS('top', '8px');
        await expect(textBox).toHaveCSS('width', '164px');
        await expect(textBox).toHaveCSS('height', '24px');

        // The link checkbox is sr-only inside its icon label; uncheck() on the
        // clipped 1x1 input fails Playwright's hit-target check (the click lands
        // on the Link2 svg). Click the visible label — the user's actual gesture
        // — and assert the state flip it must produce.
        await pane.getByTitle('Link padding sides').click();
        await expect(link).not.toBeChecked();
        await right.fill('12');
        await expect(textBox).toHaveCSS('left', '8px');
        await expect(textBox).toHaveCSS('top', '8px');
        await expect(textBox).toHaveCSS('width', '160px');
        await expect(textBox).toHaveCSS('height', '24px');

        await canvasElement(page, 'literal').dblclick({ position: { x: 40, y: 20 } });
        const editorBox = pane.getByTestId('overlay-text-editor-box');
        await expect(editorBox).toHaveCSS('left', '8px');
        await expect(editorBox).toHaveCSS('top', '8px');
        await expect(editorBox).toHaveCSS('width', '160px');
        await expect(editorBox).toHaveCSS('height', '24px');
        await expect(pane.getByTestId('overlay-text-editor')).toHaveText('Short');
        await page.keyboard.press('Escape');

        const autoWidth = pane.getByLabel('Auto width', { exact: true });
        await autoWidth.check();
        await expect(top).toBeDisabled();
        await expect(canvasElement(page, 'literal').locator('[data-text-layout-line]')).toHaveCount(0);
        const measuredOuterSize = await canvasElement(page, 'literal').evaluate(node => ({
            width: Number.parseFloat(node.style.width),
            height: Number.parseFloat(node.style.height),
        }));

        await autoWidth.uncheck();
        await expect(top).toBeEnabled();
        await expect(top).toHaveValue('8');
        await expect(right).toHaveValue('12');
        await expect(bottom).toHaveValue('8');
        await expect(left).toHaveValue('8');
        await expect(textBox).toHaveCSS('left', '8px');
        await expect(textBox).toHaveCSS('top', '8px');
        const restoredContentSize = await textBox.evaluate(node => {
            const style = getComputedStyle(node);
            return {
                width: Number.parseFloat(style.width),
                height: Number.parseFloat(style.height),
            };
        });
        expect(restoredContentSize).toEqual({
            width: measuredOuterSize.width - 8 - 12,
            height: measuredOuterSize.height - 8 - 8,
        });
    });
});
