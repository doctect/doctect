
import { test as base, expect } from '@playwright/test';
import { getCloudHead, signIn, signUpAndVerify, TEST_PASSWORD } from './helpers.js';
import { MIN_NO_HIT_OBSERVATION_MS, startMarkerServer } from './markerServer.js';

const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';
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

const unique = Date.now();
const activePane = page => page.locator('[data-testid="project-pane"][data-active="true"]');

const waitForPersistedGenerator = async (page, expected) => {
    await expect.poll(() => page.evaluate(() => {
        const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
        const activeId = localStorage.getItem('hype_active_project');
        const generator = projects.find(project => project.id === activeId)?.initialState?.generator;
        return generator && { templateScript: generator.templateScript, hierarchyScript: generator.hierarchyScript };
    })).toEqual(expected);
};

const seedSavedGenerator = async (page, source) => {
    await page.evaluate(generatorSource => {
        const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
        const activeId = localStorage.getItem('hype_active_project');
        const active = projects.find(project => project.id === activeId);
        if (!active) throw new Error('Active project not found while seeding source.');
        active.initialState.generator = {
            formatVersion: 1,
            generatedAt: new Date().toISOString(),
            ...generatorSource,
        };
        localStorage.setItem('hype_projects', JSON.stringify(projects));
    }, source);
    await page.reload();
    await waitForPersistedGenerator(page, source);
};

const observeNoExecutionUi = (dialog, durationMs = MIN_NO_HIT_OBSERVATION_MS) => dialog.evaluate(
    (root, observationMs) => new Promise((resolve, reject) => {
        let timer;
        let observer;
        const findExecutionUi = () => root.querySelector('[role="alert"], [aria-live="polite"]');
        const cleanup = () => {
            clearTimeout(timer);
            observer?.disconnect();
        };
        const fail = executionUi => {
            if (!executionUi) return;
            cleanup();
            reject(new Error(`Unexpected generator execution UI: ${executionUi.outerHTML}`));
        };
        const findInNode = node => node instanceof Element && (
            node.matches('[role="alert"], [aria-live="polite"]')
                ? node
                : node.querySelector('[role="alert"], [aria-live="polite"]')
        );

        timer = setTimeout(() => {
            cleanup();
            resolve();
        }, observationMs);
        observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    const currentValue = record.target.getAttribute(record.attributeName);
                    const executionValue = record.attributeName === 'role' ? 'alert' : 'polite';
                    if (record.oldValue === executionValue || currentValue === executionValue) {
                        fail(record.target);
                        return;
                    }
                    continue;
                }
                for (const node of record.addedNodes) {
                    const executionUi = findInNode(node);
                    if (executionUi) {
                        fail(executionUi);
                        return;
                    }
                }
            }
            fail(findExecutionUi());
        });
        observer.observe(root, {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['aria-live', 'role'],
            childList: true,
            subtree: true,
        });
        fail(findExecutionUi());
    }),
    durationMs,
);

const openAndAssertIdleSource = async (page, expected, markerServer) => {
    await activePane(page).getByTitle('Generate Hierarchy via Script').click();
    const dialog = page.getByRole('dialog', { name: 'Hierarchy Generator' });
    await expect(page.getByLabel('Template script')).toHaveValue(expected.templateScript);
    await expect(page.getByLabel('Hierarchy script')).toHaveValue(expected.hierarchyScript);
    await expect(dialog.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
    await Promise.all([
        markerServer.observeNoHitsFor(MIN_NO_HIT_OBSERVATION_MS),
        observeNoExecutionUi(dialog, MIN_NO_HIT_OBSERVATION_MS),
    ]);
    expect(markerServer.hits).toEqual([]);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.locator('[aria-live="polite"]')).toHaveCount(0);
};

test.describe('Gallery', () => {
    test('published generator source opens inertly, edits byte-exactly, and survives a fork', async ({ browser, markerServer }) => {
        test.setTimeout(180000);

        const ctxA = await browser.newContext();
        const page = await ctxA.newPage();

        // Auto-accept native dialogs: the "commit message" prompt from Save to
        // cloud, and the "Published!" alert after a successful publish.
        page.on('dialog', dialog => {
            dialog.accept(dialog.type() === 'prompt' ? 'e2e save' : undefined);
        });

        // 1. Sign up a fresh user via the real /login signup form. Signup leaves
        // the account unverified and session-less (requireEmailVerification:
        // true in server/auth.js) -- signUpAndVerify marks it verified directly
        // in the server's DB and finishes by signing in for real.
        await signUpAndVerify(page, {
            name: 'E2E User',
            username: `e2e_user_${unique}`,
            email: `e2e${unique}@test.dev`,
            password: TEST_PASSWORD,
        });

        // Generate valid output, then seed separately saved source that cannot run successfully.
        await page.goto('/app');
        await page.getByTitle('Generate Hierarchy via Script').click();
        const baseTemplateSource = await page.getByLabel('Template script').inputValue();
        const baseHierarchySource = await page.getByLabel('Hierarchy script').inputValue();
        await page.getByLabel('Template script').fill(baseTemplateSource);
        await page.getByLabel('Hierarchy script').fill(baseHierarchySource);
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        await expect(page.getByText('3 nodes', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Apply Generated Project' }).click();
        await expect(page.getByTestId('project-tab').filter({ hasText: 'My Simple Book' })).toBeVisible();
        await waitForPersistedGenerator(page, {
            templateScript: baseTemplateSource,
            hierarchyScript: baseHierarchySource,
        });

        const trapSource = {
            templateScript: `try { fetch('${markerServer.url('/gallery-template-source-executed.js')}'); }\nfinally { throw new Error('GALLERY_TEMPLATE_SOURCE_EXECUTED'); }\n\n//   café 雪 trap bytes   \n`,
            hierarchyScript: `try { fetch('${markerServer.url('/gallery-hierarchy-source-executed.js')}'); }\nfinally { throw new Error('GALLERY_HIERARCHY_SOURCE_EXECUTED'); }\n\n// hierarchy trap:   λ   \n`,
        };
        await seedSavedGenerator(page, trapSource);
        await openAndAssertIdleSource(page, trapSource, markerServer);
        await page.getByRole('button', { name: 'Close generator' }).click();

        // Save generated output with inert trap metadata to cloud.
        await page.getByTitle('Cloud').click();
        const [createRes] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/api/projects') && res.request().method() === 'POST',
                { timeout: 15000 }
            ),
            page.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        expect(createRes.ok()).toBeTruthy();
        const projectId = (await createRes.json()).project.id;
        // CloudMenu's dropdown only closes once the save actually resolves (setOpen(false)
        // runs after the awaited create call) -- wait for that before reopening it, otherwise
        // a still-open menu would just toggle shut instead of opening for the next click.
        await expect(page.getByRole('button', { name: 'Save to cloud (new)' })).toBeHidden();

        // Publish wizard must disclose that source becomes public.
        await page.getByTitle('Cloud').click();
        await page.getByRole('button', { name: /publish to gallery/i }).click();
        await expect(page.getByRole('alert')).toContainText('Publishing makes both scripts public.');
        await page.getByPlaceholder('What is this planner for?').fill('E2E published planner');
        // Default first-page selection is already valid.
        const [publishRes] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/publish') && res.request().method() === 'POST',
                { timeout: 60000 }
            ),
            page.getByRole('button', { name: /^publish$/i }).click(),
        ]);
        expect(publishRes.ok()).toBeTruthy();
        expect((await publishRes.json()).project.id).toBe(projectId);
        // The modal only closes once `onPublished` fires, i.e. the success path.
        await expect(page.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });

        // Confirm listing, then use a genuinely separate user/session for open/edit/fork.
        await page.goto('/gallery');
        await expect(page.getByText('My Simple Book').first()).toBeVisible({ timeout: 10000 });

        const ctxB = await browser.newContext();
        const pageB = await ctxB.newPage();
        pageB.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'source persistence save' : undefined));
        const editorEmail = `gallerysource${unique}@test.dev`;
        await signUpAndVerify(pageB, {
            name: 'Gallery Source User',
            username: `gallery_source_${unique}`,
            email: editorEmail,
            password: TEST_PASSWORD,
        });

        await pageB.goto(`/gallery/${projectId}`);
        await pageB.getByRole('button', { name: /open in editor/i }).click();
        await pageB.waitForURL('**/app', { timeout: 15000 });
        await expect(pageB.getByTitle('Close Project')).toHaveCount(2, { timeout: 10000 });
        await openAndAssertIdleSource(pageB, trapSource, markerServer);
        await pageB.getByRole('button', { name: 'Close generator' }).click();

        await pageB.reload();
        await expect(pageB.getByTestId('project-tab').filter({ hasText: 'My Simple Book' })).toBeVisible();
        await openAndAssertIdleSource(pageB, trapSource, markerServer);

        const editedTitle = `Gallery Edited ${unique}`;
        const editedTemplateSource = `${baseTemplateSource}\n\n// edited source:   naïve Δ   \n`;
        const editedHierarchySource = baseHierarchySource.replace("title: 'My Simple Book'", `title: '${editedTitle}'`);
        await pageB.getByLabel('Template script').fill(editedTemplateSource);
        await pageB.getByLabel('Hierarchy script').fill(editedHierarchySource);
        await pageB.getByRole('button', { name: 'Preview', exact: true }).click();
        await expect(pageB.getByText('3 nodes', { exact: true })).toBeVisible();
        await pageB.getByRole('button', { name: 'Apply Generated Project' }).click();
        await expect(pageB.getByTestId('project-tab').filter({ hasText: editedTitle })).toBeVisible();
        await waitForPersistedGenerator(pageB, { templateScript: editedTemplateSource, hierarchyScript: editedHierarchySource });

        await pageB.getByTitle('Cloud').click();
        const [editedCreateRes] = await Promise.all([
            pageB.waitForResponse(res => res.url().includes('/api/projects') && res.request().method() === 'POST', { timeout: 15000 }),
            pageB.getByRole('button', { name: 'Save to cloud (new)' }).click(),
        ]);
        expect(editedCreateRes.ok()).toBeTruthy();
        const editedProjectId = (await editedCreateRes.json()).project.id;

        const ctxC = await browser.newContext();
        const pageC = await ctxC.newPage();
        await signIn(pageC, { email: editorEmail, password: TEST_PASSWORD });
        const authoritative = await getCloudHead(pageC.request, API_BASE, editedProjectId);
        expect(authoritative.state.generator.templateScript).toBe(editedTemplateSource);
        expect(authoritative.state.generator.hierarchyScript).toBe(editedHierarchySource);
        await ctxC.close();

        await pageB.goto(`/gallery/${projectId}`);
        await pageB.getByRole('button', { name: /fork this project/i }).click();
        await pageB.waitForURL('**/app', { timeout: 15000 });
        await expect(pageB.getByTitle('Close Project')).toHaveCount(3, { timeout: 10000 });
        await openAndAssertIdleSource(pageB, trapSource, markerServer);

        await ctxA.close();
        await ctxB.close();
    });
});
