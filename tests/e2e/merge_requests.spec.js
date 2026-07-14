
import { test, expect } from '@playwright/test';
import { signUpAndVerify as signUp } from './helpers.js';

// The API server (server/index.js) listens on a different origin than the Vite
// dev server that Playwright's baseURL points at (see .env: VITE_API_BASE).
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';

const unique = Date.now();

const waitForPersistedGenerator = async (page, expected) => {
    await expect.poll(() => page.evaluate(() => {
        const projects = JSON.parse(localStorage.getItem('hype_projects') || '[]');
        const activeId = localStorage.getItem('hype_active_project');
        const generator = projects.find(project => project.id === activeId)?.initialState?.generator;
        return generator && { templateScript: generator.templateScript, hierarchyScript: generator.hierarchyScript };
    })).toEqual(expected);
};

const applyGeneratorSource = async (page, title, marker) => {
    const activePane = page.locator('.absolute.inset-0.w-full.h-full.opacity-100');
    await activePane.getByTitle('Generate Hierarchy via Script').click();
    const baseTemplateSource = await page.getByLabel('Template script').inputValue();
    const baseHierarchySource = await page.getByLabel('Hierarchy script').inputValue();
    const templateSource = `${baseTemplateSource}\n\n// ${marker}:   café 雪   \n`;
    const hierarchySource = `${baseHierarchySource.replace("title: 'My Simple Book'", `title: '${title}'`)}\n\n// ${marker}:   λ   \n`;
    await page.getByLabel('Template script').fill(templateSource);
    await page.getByLabel('Hierarchy script').fill(hierarchySource);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByText('3 nodes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Apply Generated Project' }).click();
    await expect(page.getByTestId('project-tab').filter({ hasText: title })).toBeVisible();
    await waitForPersistedGenerator(page, { templateScript: templateSource, hierarchyScript: hierarchySource });
    return { templateSource, hierarchySource };
};

// Creates+publishes a fresh public project as the given (already signed-in) page's
// user, returning its cloud project id.
const createAndPublishProject = async (page, description) => {
    await page.goto('/app');
    await page.getByTitle('Cloud').click();
    const [createRes] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/projects') && res.request().method() === 'POST', { timeout: 15000 }),
        page.getByRole('button', { name: 'Save to cloud (new)' }).click(),
    ]);
    expect(createRes.ok()).toBeTruthy();
    const projectId = (await createRes.json()).project.id;
    await expect(page.getByRole('button', { name: 'Save to cloud (new)' })).toBeHidden();

    await page.getByTitle('Cloud').click();
    await page.getByRole('button', { name: /publish to gallery/i }).click();
    await page.getByPlaceholder('What is this planner for?').fill(description);
    const [publishRes] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/publish') && res.request().method() === 'POST', { timeout: 60000 }),
        page.getByRole('button', { name: /^publish$/i }).click(),
    ]);
    expect(publishRes.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: /publish to gallery/i })).toBeHidden({ timeout: 10000 });
    return projectId;
};

test.describe('Merge requests', () => {
    // Both tests spin up two full browser contexts each and lean on the same local
    // dev server + SQLite file; running them concurrently (the default with multiple
    // workers) causes enough contention to make canvas interactions flaky. Serial
    // execution costs a bit of wall-clock time but is deterministic.
    test.describe.configure({ mode: 'serial' });

    test('full loop: fork, edit, propose, review with preview, merge, and version history', async ({ browser }) => {
        test.setTimeout(180000);
        const u = `${unique}a`;

        // ---------------------------------------------------------------
        // A: owner. Publishes a forkable project.
        // ---------------------------------------------------------------
        const ctxA = await browser.newContext();
        const pageA = await ctxA.newPage();
        pageA.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'A initial save' : undefined));

        await signUp(pageA, { name: 'MR Owner', username: `mr_owner_${u}`, email: `mrowner${u}@test.dev` });
        const upstreamId = await createAndPublishProject(pageA, `MR upstream ${u}`);

        // ---------------------------------------------------------------
        // B: forker. Forks, edits the template, saves, and proposes changes.
        // ---------------------------------------------------------------
        const ctxB = await browser.newContext();
        const pageB = await ctxB.newPage();
        pageB.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'B edit save' : undefined));

        await signUp(pageB, { name: 'MR Author', username: `mr_author_${u}`, email: `mrauthor${u}@test.dev` });
        await pageB.goto(`/gallery/${upstreamId}`);
        await expect(pageB.getByRole('heading', { name: 'Blank Project' })).toBeVisible({ timeout: 10000 });

        const [forkRes] = await Promise.all([
            pageB.waitForResponse(res => res.url().includes(`/api/projects/${upstreamId}/fork`) && res.request().method() === 'POST', { timeout: 15000 }),
            pageB.getByRole('button', { name: /fork this project/i }).click(),
        ]);
        expect(forkRes.ok()).toBeTruthy();
        await pageB.waitForURL('**/app', { timeout: 15000 });
        // EditorPage mounts with the pre-existing default "Blank Project" tab active,
        // then a separate effect consumes the staged fork import, adds a second tab,
        // and switches the active tab to it -- all in the render(s) right after
        // mount. Wait for that second tab to actually exist before touching the
        // canvas, or the click can land on the still-active *default* tab's toolbar
        // mid-transition (see fork.spec.js, which get this "for free" by checking
        // the CloudMenu's lineage link first).
        await expect(pageB.getByTitle('Close Project')).toHaveCount(2, { timeout: 10000 });

        const generatedTitle = `Generated MR ${u}`;
        const generatedSource = await applyGeneratorSource(pageB, generatedTitle, `fork-${u}`);

        await pageB.getByTitle('Cloud').click();
        const [saveRes] = await Promise.all([
            pageB.waitForResponse(res => res.url().includes(`/api/projects/`) && res.url().includes('/commits') && res.request().method() === 'POST', { timeout: 15000 }),
            pageB.getByRole('button', { name: 'Save to cloud', exact: true }).click(),
        ]);
        expect(saveRes.ok()).toBeTruthy();

        // Reopen the (now-closed) Cloud dropdown to propose changes upstream.
        await pageB.getByTitle('Cloud').click();
        const mrTitle = `Improve the page template ${u}`;
        await pageB.getByRole('button', { name: /propose changes to upstream/i }).click();
        await expect(pageB.getByRole('heading', { name: /propose changes to upstream/i })).toBeVisible();
        await pageB.getByPlaceholder("Title, e.g. 'Add iPad variant'").fill(mrTitle);
        const [createMrRes] = await Promise.all([
            pageB.waitForResponse(res => res.url().includes('/api/merge-requests') && res.request().method() === 'POST', { timeout: 15000 }),
            pageB.getByRole('button', { name: 'Create merge request' }).click(),
        ]);
        expect(createMrRes.ok()).toBeTruthy();
        const mrId = (await createMrRes.json()).mergeRequest.id;
        await pageB.waitForURL(`**/mr/${mrId}`, { timeout: 15000 });

        // The proposed change list shows the structured diff (not raw JSON).
        await expect(pageB.getByText(mrTitle)).toBeVisible();
        await expect(pageB.getByText('open', { exact: true })).toBeVisible();
        await expect(pageB.getByText('~ Generator source changed')).toBeVisible();
        await expect(pageB.getByText('~ Page hierarchy (nodes) changed')).toBeVisible();

        // ---------------------------------------------------------------
        // A: sees the incoming MR on the gallery detail page, reviews it,
        // renders a before/after preview, and merges it.
        // ---------------------------------------------------------------
        await pageA.goto(`/gallery/${upstreamId}`);
        await expect(pageA.getByRole('heading', { name: 'Merge requests' })).toBeVisible({ timeout: 10000 });
        await pageA.getByRole('link', { name: new RegExp(mrTitle) }).click();
        await pageA.waitForURL(`**/mr/${mrId}`, { timeout: 15000 });
        await expect(pageA.getByText('~ Generator source changed')).toBeVisible();
        await expect(pageA.getByText('~ Page hierarchy (nodes) changed')).toBeVisible();

        await pageA.getByRole('button', { name: /render before\/after preview/i }).click();
        await expect(pageA.locator('img[alt="before"]')).toBeVisible({ timeout: 30000 });
        await expect(pageA.locator('img[alt="after"]')).toBeVisible({ timeout: 30000 });
        const beforeSrc = await pageA.locator('img[alt="before"]').getAttribute('src');
        const afterSrc = await pageA.locator('img[alt="after"]').getAttribute('src');
        expect(beforeSrc).toMatch(/^data:image\//);
        expect(afterSrc).toMatch(/^data:image\//);
        expect(afterSrc).not.toBe(beforeSrc); // visually different: the fork's rectangle vs. the untouched upstream page

        const [mergeRes] = await Promise.all([
            pageA.waitForResponse(res => res.url().includes(`/api/merge-requests/${mrId}/merge`) && res.request().method() === 'POST', { timeout: 15000 }),
            pageA.getByRole('button', { name: 'Merge', exact: true }).click(),
        ]);
        expect(mergeRes.ok()).toBeTruthy();
        expect((await mergeRes.json()).mergeRequest.status).toBe('merged');
        await expect(pageA.getByText('merged', { exact: true })).toBeVisible();
        await expect(pageA.getByRole('button', { name: 'Merge', exact: true })).toBeHidden();

        // ---------------------------------------------------------------
        // A: the merge commit is HEAD in their project's version history,
        // and restoring it brings in the fork's template change.
        // ---------------------------------------------------------------
        await pageA.goto('/app');
        await pageA.getByTitle('Cloud').click();
        await pageA.getByRole('button', { name: /version history/i }).click();
        const headMessage = pageA.locator('div.text-xs.font-medium.text-slate-800.truncate', { hasText: 'HEAD' });
        await expect(headMessage).toBeVisible({ timeout: 10000 });
        await expect(headMessage).toContainText(`Merge: ${mrTitle}`);

        await pageA.getByRole('button', { name: /restore/i }).first().click();
        const activePaneA = pageA.locator('.absolute.inset-0.w-full.h-full.opacity-100');
        await expect(pageA.getByTestId('project-tab').filter({ hasText: generatedTitle })).toBeVisible({ timeout: 10000 });
        await expect(activePaneA.locator('[data-element-id]')).toHaveCount(2, { timeout: 10000 });
        await activePaneA.getByTitle('Generate Hierarchy via Script').click();
        await expect(pageA.getByLabel('Template script')).toHaveValue(generatedSource.templateSource);
        await expect(pageA.getByLabel('Hierarchy script')).toHaveValue(generatedSource.hierarchySource);

        await ctxA.close();
        await ctxB.close();
    });

    test('conflict path: both sides edit the same template; MR is conflicted and merge is refused', async ({ browser }) => {
        test.setTimeout(120000);
        const u = `${unique}b`;

        // ---------------------------------------------------------------
        // C: owner. Publishes a forkable project.
        // ---------------------------------------------------------------
        const ctxC = await browser.newContext();
        const pageC = await ctxC.newPage();
        pageC.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'C initial save' : undefined));

        await signUp(pageC, { name: 'Conflict Owner', username: `cf_owner_${u}`, email: `cfowner${u}@test.dev` });
        const upstreamId = await createAndPublishProject(pageC, `Conflict upstream ${u}`);

        // ---------------------------------------------------------------
        // D: forker. Forks, edits the template, saves, and proposes changes.
        // ---------------------------------------------------------------
        const ctxD = await browser.newContext();
        const pageD = await ctxD.newPage();
        pageD.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'D edit save' : undefined));

        await signUp(pageD, { name: 'Conflict Author', username: `cf_author_${u}`, email: `cfauthor${u}@test.dev` });
        await pageD.goto(`/gallery/${upstreamId}`);
        await expect(pageD.getByRole('heading', { name: 'Blank Project' })).toBeVisible({ timeout: 10000 });

        const [forkRes] = await Promise.all([
            pageD.waitForResponse(res => res.url().includes(`/api/projects/${upstreamId}/fork`) && res.request().method() === 'POST', { timeout: 15000 }),
            pageD.getByRole('button', { name: /fork this project/i }).click(),
        ]);
        expect(forkRes.ok()).toBeTruthy();
        await pageD.waitForURL('**/app', { timeout: 15000 });
        await expect(pageD.getByTitle('Close Project')).toHaveCount(2, { timeout: 10000 });

        await applyGeneratorSource(pageD, `Fork Generator ${u}`, `fork-conflict-${u}`);
        await pageD.getByTitle('Cloud').click();
        const [saveResD] = await Promise.all([
            pageD.waitForResponse(res => res.url().includes(`/api/projects/`) && res.url().includes('/commits') && res.request().method() === 'POST', { timeout: 15000 }),
            pageD.getByRole('button', { name: 'Save to cloud', exact: true }).click(),
        ]);
        expect(saveResD.ok()).toBeTruthy();

        await pageD.getByTitle('Cloud').click();
        const mrTitle = `Conflicting change ${u}`;
        await pageD.getByRole('button', { name: /propose changes to upstream/i }).click();
        await pageD.getByPlaceholder("Title, e.g. 'Add iPad variant'").fill(mrTitle);
        const [createMrRes] = await Promise.all([
            pageD.waitForResponse(res => res.url().includes('/api/merge-requests') && res.request().method() === 'POST', { timeout: 15000 }),
            pageD.getByRole('button', { name: 'Create merge request' }).click(),
        ]);
        expect(createMrRes.ok()).toBeTruthy();
        const mrId = (await createMrRes.json()).mergeRequest.id;

        // ---------------------------------------------------------------
        // C: independently regenerates the upstream from different source after
        // the MR was opened, creating a generator-source conflict.
        // ---------------------------------------------------------------
        await applyGeneratorSource(pageC, `Target Generator ${u}`, `target-conflict-${u}`);
        await pageC.getByTitle('Cloud').click();
        const [saveResC] = await Promise.all([
            pageC.waitForResponse(res => res.url().includes(`/api/projects/${upstreamId}/commits`) && res.request().method() === 'POST', { timeout: 15000 }),
            pageC.getByRole('button', { name: 'Save to cloud', exact: true }).click(),
        ]);
        expect(saveResC.ok()).toBeTruthy();

        // C opens the MR (live diff is recomputed server-side on GET) and sees the conflict.
        await pageC.goto(`/mr/${mrId}`);
        await expect(pageC.getByText('conflicted', { exact: true })).toBeVisible({ timeout: 10000 });
        await expect(pageC.getByText(/conflicts/i)).toBeVisible();
        await expect(pageC.getByText('Generator source changed differently on both branches.')).toBeVisible();

        // Merge is refused: the button isn't even rendered for a conflicted MR; only Close is.
        await expect(pageC.getByRole('button', { name: 'Merge', exact: true })).toHaveCount(0);
        await expect(pageC.getByRole('button', { name: 'Close', exact: true })).toBeVisible();

        // Belt-and-suspenders: the server itself refuses a direct merge attempt too.
        const directMerge = await pageC.request.post(`${API_BASE}/api/merge-requests/${mrId}/merge`);
        expect(directMerge.status()).toBe(409);

        await ctxC.close();
        await ctxD.close();
    });
});
