import { test, expect } from '@playwright/test';
import {
    apiSignUpAndVerify,
    moderationActionsForTarget,
    promoteUserToAdmin,
    TEST_PASSWORD,
} from './helpers.js';

const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001';
const unique = `${Date.now()}${process.pid}`;
const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: {
        default: {
            id: 'default',
            name: 'Default',
            templates: {
                page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] },
            },
        },
    },
    activeVariantId: 'default',
    schemaVersion: 7,
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('admin suspends selected content, revokes access, restores, and sees immutable history', async ({ browser }) => {
    const targetEmail = `moderation-target-${unique}@test.dev`;
    const adminEmail = `moderation-admin-${unique}@test.dev`;
    const targetUsername = `target_${unique}`;
    const adminUsername = `admin_${unique}`;
    const selectedName = `Selected ${unique}`;
    const untouchedName = `Untouched ${unique}`;
    const suspensionReason = `E2E confirmed abuse ${unique}`;
    const restorationReason = `E2E appeal accepted ${unique}`;
    const contexts = [];
    const newContext = async () => {
        const context = await browser.newContext();
        contexts.push(context);
        return context;
    };

    try {
        const targetContext = await newContext();
        await apiSignUpAndVerify(targetContext.request, API_BASE, {
            email: targetEmail,
            password: TEST_PASSWORD,
            name: 'Moderation Target',
            username: targetUsername,
        });

        const createProject = async name => {
            const created = await targetContext.request.post(`${API_BASE}/api/projects`, {
                data: { name, state },
            });
            expect(created.ok(), await created.text()).toBeTruthy();
            const project = (await created.json()).project;
            const published = await targetContext.request.post(`${API_BASE}/api/projects/${project.id}/publish`, {
                headers: { 'If-Match': `"${project.headCommitId}"` },
                data: { description: name, tags: [], thumbnails: [PNG] },
            });
            expect(published.ok(), await published.text()).toBeTruthy();
            return project.id;
        };

        const selectedId = await createProject(selectedName);
        const untouchedId = await createProject(untouchedName);

        const adminSetupContext = await newContext();
        await apiSignUpAndVerify(adminSetupContext.request, API_BASE, {
            email: adminEmail,
            password: TEST_PASSWORD,
            name: 'Moderation Admin',
            username: adminUsername,
        });
        await promoteUserToAdmin(adminEmail);

        const adminContext = await newContext();
        const adminSignIn = await adminContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: adminEmail, password: TEST_PASSWORD },
        });
        expect(adminSignIn.status(), await adminSignIn.text()).toBe(200);
        const adminIdentity = await adminContext.request.get(`${API_BASE}/api/me`);
        expect(adminIdentity.status(), await adminIdentity.text()).toBe(200);
        expect((await adminIdentity.json()).user).toMatchObject({ email: adminEmail, role: 'admin' });

        const adminPage = await adminContext.newPage();
        await adminPage.goto('/admin/moderation');
        await expect(adminPage.getByRole('heading', { name: 'Account moderation' })).toBeVisible();
        await adminPage.getByLabel('Search accounts').fill(targetEmail);
        await adminPage.getByRole('button', { name: 'Search' }).click();
        await adminPage.getByRole('button', { name: `Review ${targetEmail}` }).click();
        await expect(adminPage.getByRole('heading', { name: targetEmail })).toBeVisible();
        await adminPage.getByLabel(`Unpublish ${selectedName} (${selectedId})`).check();
        await adminPage.getByLabel('Suspension reason').fill(suspensionReason);
        await adminPage.getByRole('button', { name: 'Review suspension' }).click();
        const suspendDialog = adminPage.getByRole('dialog', { name: 'Confirm suspension' });
        await expect(suspendDialog.getByText(`${selectedName} (${selectedId})`, { exact: true })).toBeVisible();
        await expect(suspendDialog.getByText(untouchedName)).toHaveCount(0);
        await suspendDialog.getByRole('button', { name: 'Confirm suspension' }).click();
        await expect(adminPage.getByText('Active suspension')).toBeVisible();

        const revoked = await targetContext.request.get(`${API_BASE}/api/projects`);
        expect(revoked.status(), await revoked.text()).toBe(401);

        const blockedContext = await newContext();
        const blocked = await blockedContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: targetEmail, password: TEST_PASSWORD },
        });
        expect(blocked.status(), await blocked.text()).toBe(403);
        expect((await blocked.json()).code).toBe('BANNED_USER');

        const galleryContext = await newContext();
        expect((await galleryContext.request.get(`${API_BASE}/api/gallery/${selectedId}`)).status()).toBe(404);
        expect((await galleryContext.request.get(`${API_BASE}/api/gallery/${untouchedId}`)).status()).toBe(200);

        await adminPage.getByLabel('Restoration reason').fill(restorationReason);
        await adminPage.getByRole('button', { name: 'Review restoration' }).click();
        const restoreDialog = adminPage.getByRole('dialog', { name: 'Confirm restoration' });
        await restoreDialog.getByRole('button', { name: 'Confirm restoration' }).click();
        await expect(adminPage.getByText('Not suspended')).toBeVisible();

        const restoredContext = await newContext();
        const restored = await restoredContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: targetEmail, password: TEST_PASSWORD },
        });
        expect(restored.status(), await restored.text()).toBe(200);
        expect((await restoredContext.request.get(`${API_BASE}/api/me`)).status()).toBe(200);
        expect((await galleryContext.request.get(`${API_BASE}/api/gallery/${selectedId}`)).status()).toBe(404);
        expect((await galleryContext.request.get(`${API_BASE}/api/gallery/${untouchedId}`)).status()).toBe(200);

        const history = adminPage.getByRole('heading', { name: 'Moderation history' }).locator('..');
        const historyEvent = (action, reason) => history.getByRole('listitem')
            .filter({ hasText: action })
            .filter({ hasText: reason });
        const suspendedEvent = historyEvent('account suspended', suspensionReason);
        const unpublishedEvent = historyEvent('project unpublished', suspensionReason);
        const restoredEvent = historyEvent('account restored', restorationReason);
        await expect(suspendedEvent).toBeVisible();
        await expect(suspendedEvent.getByText('account suspended', { exact: true })).toBeVisible();
        await expect(suspendedEvent.getByText(suspensionReason, { exact: true })).toBeVisible();
        await expect(unpublishedEvent).toBeVisible();
        await expect(unpublishedEvent.getByText('project unpublished', { exact: true })).toBeVisible();
        await expect(unpublishedEvent.getByText(suspensionReason, { exact: true })).toBeVisible();
        await expect(unpublishedEvent).toContainText(`project ${selectedId}`);
        await expect(restoredEvent).toBeVisible();
        await expect(restoredEvent.getByText('account restored', { exact: true })).toBeVisible();
        await expect(restoredEvent.getByText(restorationReason, { exact: true })).toBeVisible();

        expect(await moderationActionsForTarget(targetEmail)).toEqual([
            { action: 'account_restored', reason: restorationReason, project_id: null },
            { action: 'account_suspended', reason: suspensionReason, project_id: null },
            { action: 'project_unpublished', reason: suspensionReason, project_id: selectedId },
        ]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});
