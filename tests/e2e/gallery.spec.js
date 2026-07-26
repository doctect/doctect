
import { test as base, expect } from '@playwright/test';
import { getCloudHead, signIn, signUpAndVerify, TEST_PASSWORD } from './helpers.js';
import { MIN_NO_HIT_OBSERVATION_MS, startMarkerServer } from './markerServer.js';

const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
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

// `unique` is a module-scope Date.now(), and Playwright loads this file once per worker
// (three browser projects here), so two workers can land in the same millisecond. The
// listing test signs up its own account and publishes under a searchable name, both of
// which have to be unique across simultaneously running workers.
const listingRun = `${unique}${Math.random().toString(36).slice(2, 6)}`;

const listingState = title => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title, data: {}, children: [] } },
    rootId: 'root',
    variants: {
        default: {
            id: 'default', name: 'Default',
            templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } },
        },
    },
    activeVariantId: 'default',
    schemaVersion: 7,
});

// published_at is written with the DB's CURRENT_TIMESTAMP, which has whole-second
// resolution on SQLite. "The edit did not touch published_at" is therefore unfalsifiable
// unless the edit happens in a strictly LATER second than the publish it is compared
// against -- inside one second, a route that DID rewrite published_at would produce the
// identical value and the assertion would pass anyway. Every timing-sensitive step in the
// listing test is separated by this.
const nextSecond = () => new Promise(resolve => { setTimeout(resolve, 1200); });

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

const startExecutionUiObservation = page => page.evaluateHandle(() => {
    const matches = [];
    const isApplyButton = node => node instanceof Element
        && node.matches('button')
        && node.textContent?.trim() === 'Apply Generated Project';
    const record = (node, target, reason) => {
        matches.push({
            node,
            targets: [target],
            description: `${reason}: ${node.outerHTML}`,
        });
    };
    const inspectNode = (node, target, reason) => {
        if (!(node instanceof Element)) return;
        const executionNodes = [
            ...(node.matches('[role="alert"], [aria-live="polite"]') ? [node] : []),
            ...node.querySelectorAll('[role="alert"], [aria-live="polite"]'),
        ];
        for (const executionNode of executionNodes) record(executionNode, target, reason);
        const buttons = [
            ...(isApplyButton(node) ? [node] : []),
            ...[...node.querySelectorAll('button')].filter(isApplyButton),
        ];
        for (const button of buttons) {
            if (!button.hasAttribute('disabled')) record(button, target, 'preview became ready');
        }
    };
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) inspectNode(node, mutation.target, 'execution UI added');
                for (const node of mutation.removedNodes) {
                    inspectNode(node, mutation.target, 'execution UI removed');
                    if (!(node instanceof Element)) continue;
                    for (const match of matches) {
                        if (node === match.node || node.contains(match.node)) match.targets.push(mutation.target);
                    }
                }
                continue;
            }

            const currentValue = mutation.target.getAttribute(mutation.attributeName);
            if (
                (mutation.attributeName === 'role'
                    && (mutation.oldValue === 'alert' || currentValue === 'alert'))
                || (mutation.attributeName === 'aria-live'
                    && (mutation.oldValue === 'polite' || currentValue === 'polite'))
            ) {
                record(mutation.target, mutation.target, 'execution UI attribute changed');
            }
            if (
                mutation.attributeName === 'disabled'
                && isApplyButton(mutation.target)
                && (mutation.oldValue !== null || !mutation.target.hasAttribute('disabled'))
            ) {
                record(mutation.target, mutation.target, 'preview became ready');
            }
        }
    });
    observer.observe(document, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['aria-live', 'disabled', 'role'],
        childList: true,
        subtree: true,
    });
    return { matches, observer };
});

const findScopedExecutionUi = async (observation, dialog) => {
    const root = await dialog.elementHandle();
    if (!root) throw new Error('Hierarchy Generator dialog disappeared during observation.');
    try {
        return await observation.evaluate((session, dialogRoot) => {
            const isApplyButton = node => node instanceof Element
                && node.matches('button')
                && node.textContent?.trim() === 'Apply Generated Project';
            const recorded = session.matches.find(match => (
                match.node === dialogRoot
                || dialogRoot.contains(match.node)
                || match.targets.some(target => target === dialogRoot || dialogRoot.contains(target))
            ));
            if (recorded) return recorded.description;

            const executionUi = dialogRoot.querySelector('[role="alert"], [aria-live="polite"]');
            if (executionUi) return `execution UI present: ${executionUi.outerHTML}`;
            const applyButton = [...dialogRoot.querySelectorAll('button')].find(isApplyButton);
            return applyButton && !applyButton.hasAttribute('disabled')
                ? `preview ready: ${applyButton.outerHTML}`
                : null;
        }, root);
    } finally {
        await root.dispose();
    }
};

const stopExecutionUiObservation = async observation => {
    try {
        await observation.evaluate(session => session.observer.disconnect());
    } finally {
        await observation.dispose();
    }
};

const openAndAssertIdleSource = async (page, expected, markerServer) => {
    const observation = await startExecutionUiObservation(page);
    const markerOutcome = markerServer.observeNoHitsFor(MIN_NO_HIT_OBSERVATION_MS).then(
        () => null,
        error => error,
    );
    try {
        await activePane(page).getByTitle('Generate Hierarchy via Script').click();
        const dialog = page.getByRole('dialog', { name: 'Hierarchy Generator' });
        await expect(dialog.getByLabel('Template script')).toHaveValue(expected.templateScript);
        await expect(dialog.getByLabel('Hierarchy script')).toHaveValue(expected.hierarchyScript);
        await expect(dialog.getByRole('button', { name: 'Apply Generated Project' })).toBeDisabled();
        const markerError = await markerOutcome;
        if (markerError) throw markerError;
        const executionUi = await findScopedExecutionUi(observation, dialog);
        if (executionUi) throw new Error(`Unexpected generator execution UI: ${executionUi}`);
        expect(markerServer.hits).toEqual([]);
        await expect(dialog.getByRole('alert')).toHaveCount(0);
        await expect(dialog.locator('[aria-live="polite"]')).toHaveCount(0);
    } finally {
        await markerOutcome;
        await stopExecutionUiObservation(observation);
    }
};

test.describe('Gallery', () => {
    test('inert-source check catches transient execution UI during generator open', async ({ page, markerServer }) => {
        await page.goto('/app');
        await activePane(page).getByTitle('Generate Hierarchy via Script').click();
        const expected = {
            templateScript: await page.getByLabel('Template script').inputValue(),
            hierarchyScript: await page.getByLabel('Hierarchy script').inputValue(),
        };
        await page.getByRole('button', { name: 'Close generator' }).click();
        await page.evaluate(() => {
            const injector = new MutationObserver(() => {
                const dialog = document.querySelector('[role="dialog"][aria-labelledby="hierarchy-generator-title"]');
                if (!dialog) return;
                const unrelatedAlert = document.createElement('div');
                unrelatedAlert.setAttribute('role', 'alert');
                unrelatedAlert.textContent = 'unrelated page alert';
                document.body.append(unrelatedAlert);
                unrelatedAlert.remove();
                const transientAlert = document.createElement('div');
                transientAlert.setAttribute('role', 'alert');
                transientAlert.textContent = 'transient generator execution';
                dialog.append(transientAlert);
                transientAlert.remove();
                injector.disconnect();
            });
            injector.observe(document, { childList: true, subtree: true });
        });

        let observationError;
        try {
            await openAndAssertIdleSource(page, expected, markerServer);
        } catch (error) {
            observationError = error;
        }
        expect(observationError?.message).toContain('transient generator execution');
    });

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
        await page.getByRole('button', { name: 'Replace Current Project' }).click();
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

        // Saving a newer owner head must not silently change public open/PDF/fork state.
        const ownerProject = await (await page.request.get(`${API_BASE}/api/projects/${projectId}`)).json();
        const ownerCommit = await (await page.request.get(
            `${API_BASE}/api/projects/${projectId}/commits/${ownerProject.project.headCommitId}`
        )).json();
        const privateState = structuredClone(ownerCommit.commit.state);
        privateState.nodes[privateState.rootId].title = `Private newer ${unique}`;
        const privateSave = await page.request.post(`${API_BASE}/api/projects/${projectId}/commits`, {
            headers: { 'If-Match': `"${ownerProject.project.headCommitId}"` },
            data: { state: privateState, message: 'private newer snapshot' },
        });
        expect(privateSave.status()).toBe(201);
        const privateHead = (await privateSave.json()).commit.id;
        const stillPublished = await (await page.request.get(`${API_BASE}/api/gallery/${projectId}/state`)).json();
        expect(stillPublished.state.nodes[stillPublished.state.rootId].title).not.toBe(`Private newer ${unique}`);

        const republish = await page.request.post(`${API_BASE}/api/projects/${projectId}/publish`, {
            headers: { 'If-Match': `"${privateHead}"` },
            data: { description: 'E2E republished planner', tags: ['republished'], thumbnails: [PNG_1X1] },
        });
        expect(republish.ok()).toBeTruthy();
        const advanced = await (await page.request.get(`${API_BASE}/api/gallery/${projectId}/state`)).json();
        expect(advanced.state.nodes[advanced.state.rootId].title).toBe(`Private newer ${unique}`);

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
        await pageB.getByRole('button', { name: 'Replace Current Project' }).click();
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

    test('an owner edits a published listing without moving the published version', async ({ page }) => {
        test.setTimeout(120000);
        const email = `listing-${listingRun}@test.dev`;
        await signUpAndVerify(page, { name: 'Listing Owner', username: `listing${listingRun}`.slice(0, 30), email });

        const createProject = async (name, title) => {
            const created = await page.request.post(`${API_BASE}/api/projects`, {
                data: { name, state: listingState(title) },
            });
            expect(created.ok()).toBeTruthy();
            return (await created.json()).project;
        };
        const publish = async (project, body) => {
            const published = await page.request.post(`${API_BASE}/api/projects/${project.id}/publish`, {
                headers: { 'If-Match': `"${project.headCommitId}"` },
                data: body,
            });
            expect(published.ok()).toBeTruthy();
            return (await published.json()).project;
        };
        const listing = async id => (await (await page.request.get(`${API_BASE}/api/gallery/${id}`)).json()).project;

        // Two listings sharing one searchable name, so the "recently updated" order asserted
        // below is exactly these two rows and nothing else the parallel suite published.
        const searchName = `Listing E2E ${listingRun}`;
        const project = await createProject(`${searchName} A`, 'Root');
        const publishedCommitId = (await publish(project, {
            description: 'before edit', tags: [`stale${listingRun}`],
            thumbnails: [PNG_1X1], previewNodeIds: ['root'],
        })).publishedCommitId;
        const before = await listing(project.id);
        expect(before.previews).toEqual([{ id: expect.any(String), nodeId: 'root' }]);

        // Move the owner's head PAST the published commit. Without this the two are the same
        // row and "the published version did not move" would hold even for a route that
        // republished the newest commit -- the exact assertion this test exists for.
        const advanced = await page.request.post(`${API_BASE}/api/projects/${project.id}/commits`, {
            headers: { 'If-Match': `"${project.headCommitId}"` },
            data: { state: listingState('Private newer page'), message: 'newer private snapshot' },
        });
        expect(advanced.status()).toBe(201);
        const newerHead = (await advanced.json()).commit.id;
        expect(newerHead).not.toBe(publishedCommitId);

        // A second listing published a whole second later, so "recently updated" has a defined
        // order for the pair rather than a published_at tie.
        await nextSecond();
        const other = await createProject(`${searchName} B`, 'Root');
        await publish(other, {
            description: 'newer listing', tags: [`stale${listingRun}`],
            thumbnails: [PNG_1X1], previewNodeIds: ['root'],
        });
        const recentlyUpdated = async () => (await (await page.request.get(
            `${API_BASE}/api/gallery?q=${encodeURIComponent(searchName)}`)).json()).items.map(p => p.id);
        // Control for the ordering assertion after the edit: B genuinely outranks A right now.
        expect(await recentlyUpdated()).toEqual([other.id, project.id]);

        // One more second, so a stray `published_at = CURRENT_TIMESTAMP` during the edit would
        // land after B's and flip that order.
        await nextSecond();

        await page.goto(`/gallery/${project.id}`);
        await page.getByRole('button', { name: /edit listing/i }).click();
        await expect(page.getByRole('heading', { name: /edit gallery listing/i })).toBeVisible();

        // The page that produced the current preview reopens already ticked -- and it is named
        // for the PUBLISHED commit ("Root"), not the newer private head ("Private newer page").
        await expect(page.getByRole('checkbox', { name: 'Root' })).toBeChecked();

        await page.getByPlaceholder('planner, 2026, remarkable').fill(`fresh${listingRun}`);
        await page.getByRole('button', { name: /save changes/i }).click();

        await expect.poll(async () => (await listing(project.id)).tags).toEqual([`fresh${listingRun}`]);

        const after = await listing(project.id);
        // The point of the whole feature: the listing changed, the published version did not.
        expect(after.headCommitId).toBe(publishedCommitId);
        expect(after.headCommitId).not.toBe(newerHead);
        const publicState = await (await page.request.get(`${API_BASE}/api/gallery/${project.id}/state`)).json();
        expect(publicState.state.nodes.root.title).toBe('Root');
        // published_at drives the gallery's "recently updated" sort, so editing must not re-rank.
        expect(after.updatedAt).toBe(before.updatedAt);
        expect(await recentlyUpdated()).toEqual([other.id, project.id]);
        // An untouched page list sends no thumbnails at all: replaceThumbnails mints fresh row
        // ids, so identical ids prove the published previews were never rewritten.
        expect(after.previews).toEqual(before.previews);

        // The new tag is a real filter; the old one is gone.
        const filtered = await (await page.request.get(`${API_BASE}/api/gallery?tag=fresh${listingRun}`)).json();
        expect(filtered.items.map(p => p.id)).toContain(project.id);
        const stale = await (await page.request.get(`${API_BASE}/api/gallery?tag=stale${listingRun}`)).json();
        expect(stale.items.map(p => p.id)).not.toContain(project.id);
    });
});
