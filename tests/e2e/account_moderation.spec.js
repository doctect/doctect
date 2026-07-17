import { test, expect } from '@playwright/test';
import {
    apiSignUpAndVerify,
    legacyModerationActionsForReasons,
    platformAuditActionsForTargets,
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

test('configured owner manages the full moderator authority lifecycle', async ({ browser }) => {
    const ownerEmail = process.env.E2E_OWNER_EMAIL;
    expect(ownerEmail).toBeTruthy();
    const targetEmail = `moderation-target-${unique}@test.dev`;
    const moderatorEmail = `moderation-candidate-${unique}@test.dev`;
    const targetUsername = `target_${unique}`;
    const moderatorUsername = `moderator_${unique}`;
    const selectedName = `Selected ${unique}`;
    const untouchedName = `Untouched ${unique}`;
    const promotionReason = `E2E trusted moderator ${unique}`;
    const suspensionReason = `E2E selected-content suspension ${unique}`;
    const demotionReason = `E2E moderator access revoked ${unique}`;
    const restorationReason = `E2E appeal accepted ${unique}`;
    const contexts = [];
    const newContext = async () => {
        const context = await browser.newContext();
        contexts.push(context);
        return context;
    };

    try {
        const ownerSignupContext = await newContext();
        await apiSignUpAndVerify(ownerSignupContext.request, API_BASE, {
            email: ownerEmail,
            password: TEST_PASSWORD,
            name: 'Configured Owner',
            username: `owner_${unique}`,
        });
        const reconciledOwner = await ownerSignupContext.request.get(`${API_BASE}/api/me`);
        expect(reconciledOwner.status(), await reconciledOwner.text()).toBe(200);
        expect((await reconciledOwner.json()).user).toMatchObject({ email: ownerEmail, role: 'owner' });

        const ownerContext = await newContext();
        const ownerSignIn = await ownerContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: ownerEmail, password: TEST_PASSWORD },
        });
        expect(ownerSignIn.status(), await ownerSignIn.text()).toBe(200);
        const ownerIdentity = await ownerContext.request.get(`${API_BASE}/api/me`);
        expect(ownerIdentity.status(), await ownerIdentity.text()).toBe(200);
        expect((await ownerIdentity.json()).user).toMatchObject({ email: ownerEmail, role: 'owner' });

        const moderatorSetupContext = await newContext();
        await apiSignUpAndVerify(moderatorSetupContext.request, API_BASE, {
            email: moderatorEmail,
            password: TEST_PASSWORD,
            name: 'Moderator Candidate',
            username: moderatorUsername,
        });

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

        const ownerPage = await ownerContext.newPage();
        await ownerPage.goto('/admin/moderation');
        await expect(ownerPage.getByRole('heading', { name: 'Account moderation' })).toBeVisible();
        await ownerPage.getByLabel('Search accounts').fill(moderatorEmail);
        await ownerPage.getByRole('button', { name: 'Search', exact: true }).click();
        await ownerPage.getByRole('button', { name: `Review ${moderatorEmail}` }).click();
        await expect(ownerPage.getByRole('heading', { name: moderatorEmail })).toBeVisible();
        await ownerPage.getByLabel('Role change reason').fill(promotionReason);
        await ownerPage.getByRole('button', { name: 'Promote to moderator' }).click();
        const promotionDialog = ownerPage.getByRole('dialog', { name: 'Confirm moderator promotion' });
        await expect(promotionDialog.getByText('Role transition: user -> admin', { exact: true })).toBeVisible();
        await expect(promotionDialog.getByText(`Reason: ${promotionReason}`, { exact: true })).toBeVisible();
        await promotionDialog.getByRole('button', { name: 'Confirm promotion' }).click();
        await expect(ownerPage.getByText(`${moderatorUsername} · admin · Not suspended`, { exact: true })).toBeVisible();
        const promotionHistory = ownerPage.getByRole('heading', { name: 'Moderation history' }).locator('..')
            .getByRole('listitem')
            .filter({ hasText: 'admin promoted' })
            .filter({ hasText: promotionReason });
        await expect(promotionHistory).toBeVisible();

        const moderatorContext = await newContext();
        const moderatorSignIn = await moderatorContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: moderatorEmail, password: TEST_PASSWORD },
        });
        expect(moderatorSignIn.status(), await moderatorSignIn.text()).toBe(200);
        const moderatorIdentity = await moderatorContext.request.get(`${API_BASE}/api/me`);
        expect(moderatorIdentity.status(), await moderatorIdentity.text()).toBe(200);
        expect((await moderatorIdentity.json()).user).toMatchObject({ email: moderatorEmail, role: 'admin' });

        const moderatorPage = await moderatorContext.newPage();
        await moderatorPage.goto('/admin/moderation');
        await expect(moderatorPage.getByRole('heading', { name: 'Account moderation' })).toBeVisible();
        await moderatorPage.getByLabel('Search accounts').fill(targetEmail);
        await moderatorPage.getByRole('button', { name: 'Search', exact: true }).click();
        await moderatorPage.getByRole('button', { name: `Review ${targetEmail}` }).click();
        await expect(moderatorPage.getByRole('heading', { name: targetEmail })).toBeVisible();
        await moderatorPage.getByLabel(`Unpublish ${selectedName} (${selectedId})`).check();
        await moderatorPage.getByLabel('Suspension reason').fill(suspensionReason);
        await moderatorPage.getByRole('button', { name: 'Review suspension' }).click();
        const suspendDialog = moderatorPage.getByRole('dialog', { name: 'Confirm suspension' });
        await expect(suspendDialog.getByText(`${selectedName} (${selectedId})`, { exact: true })).toBeVisible();
        await expect(suspendDialog.getByText(untouchedName)).toHaveCount(0);
        await suspendDialog.getByRole('button', { name: 'Confirm suspension' }).click();
        await expect(moderatorPage.getByText('Active suspension')).toBeVisible();

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

        const globalAudit = ownerPage.getByRole('region', { name: 'Global audit' });
        await globalAudit.getByLabel('Audit actor email').fill(moderatorEmail);
        await globalAudit.getByLabel('Audit target email').fill(targetEmail);
        await globalAudit.getByRole('button', { name: 'Search global audit' }).click();
        const auditEvent = (action, reason) => globalAudit.getByRole('listitem')
            .filter({ hasText: action })
            .filter({ hasText: reason });
        const auditSuspension = auditEvent('account suspended', suspensionReason);
        const auditUnpublish = auditEvent('project unpublished', suspensionReason);
        await expect(auditSuspension).toBeVisible();
        await expect(auditSuspension.getByText(`Actor: ${moderatorEmail}`, { exact: true })).toBeVisible();
        await expect(auditSuspension.getByText(`Target: ${targetEmail}`, { exact: true })).toBeVisible();
        await expect(auditUnpublish).toBeVisible();
        await expect(auditUnpublish.getByText(`Project ID: ${selectedId}`, { exact: true })).toBeVisible();
        await expect(auditUnpublish.getByText('Previous project visibility: public', { exact: true })).toBeVisible();

        await globalAudit.getByRole('button', { name: 'Reset global audit' }).click();
        await globalAudit.getByLabel('Audit target email').fill(moderatorEmail);
        await globalAudit.getByRole('button', { name: 'Search global audit' }).click();
        const promotionAudit = auditEvent('admin promoted', promotionReason);
        await expect(promotionAudit).toBeVisible();
        await expect(promotionAudit.getByText(`Actor: ${ownerEmail}`, { exact: true })).toBeVisible();
        await expect(promotionAudit.getByText('Role: user -> admin', { exact: true })).toBeVisible();

        await ownerPage.getByLabel('Search accounts').fill(moderatorEmail);
        await ownerPage.getByRole('button', { name: 'Search', exact: true }).click();
        await ownerPage.getByRole('button', { name: `Review ${moderatorEmail}` }).click();
        await expect(ownerPage.getByRole('heading', { name: moderatorEmail })).toBeVisible();
        await ownerPage.getByLabel('Role change reason').fill(demotionReason);
        await ownerPage.getByLabel('Suspend account after removing moderator access').check();
        await expect(ownerPage.getByLabel('Role suspension duration')).toHaveValue('Indefinite');
        await ownerPage.getByRole('button', { name: 'Remove moderator access' }).click();
        const demotionDialog = ownerPage.getByRole('dialog', { name: 'Confirm moderator removal' });
        await expect(demotionDialog.getByText('Role transition: admin -> user', { exact: true })).toBeVisible();
        await expect(demotionDialog.getByText('Suspension: Indefinite', { exact: true })).toBeVisible();
        await expect(demotionDialog.getByText(`Reason: ${demotionReason}`, { exact: true })).toBeVisible();
        await demotionDialog.getByRole('button', { name: 'Confirm removal' }).click();
        await expect(ownerPage.getByText(`${moderatorUsername} · user · Active suspension`, { exact: true })).toBeVisible();

        const moderatorRevoked = await moderatorContext.request.get(`${API_BASE}/api/projects`);
        expect(moderatorRevoked.status(), await moderatorRevoked.text()).toBe(401);
        const bannedModeratorContext = await newContext();
        const bannedModerator = await bannedModeratorContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: moderatorEmail, password: TEST_PASSWORD },
        });
        expect(bannedModerator.status(), await bannedModerator.text()).toBe(403);
        expect((await bannedModerator.json()).code).toBe('BANNED_USER');

        await ownerPage.getByLabel('Search accounts').fill(targetEmail);
        await ownerPage.getByRole('button', { name: 'Search', exact: true }).click();
        await ownerPage.getByRole('button', { name: `Review ${targetEmail}` }).click();
        await expect(ownerPage.getByRole('heading', { name: targetEmail })).toBeVisible();
        await ownerPage.getByLabel('Restoration reason').fill(restorationReason);
        await ownerPage.getByRole('button', { name: 'Review restoration' }).click();
        const restoreDialog = ownerPage.getByRole('dialog', { name: 'Confirm restoration' });
        await restoreDialog.getByRole('button', { name: 'Confirm restoration' }).click();
        await expect(ownerPage.getByText('Not suspended')).toBeVisible();

        const restoredContext = await newContext();
        const restored = await restoredContext.request.post(`${API_BASE}/api/auth/sign-in/email`, {
            data: { email: targetEmail, password: TEST_PASSWORD },
        });
        expect(restored.status(), await restored.text()).toBe(200);
        const restoredIdentity = await restoredContext.request.get(`${API_BASE}/api/me`);
        expect(restoredIdentity.status(), await restoredIdentity.text()).toBe(200);
        expect((await restoredIdentity.json()).user).toMatchObject({ email: targetEmail, role: 'user' });
        expect((await galleryContext.request.get(`${API_BASE}/api/gallery/${selectedId}`)).status()).toBe(404);
        expect((await galleryContext.request.get(`${API_BASE}/api/gallery/${untouchedId}`)).status()).toBe(200);

        const history = ownerPage.getByRole('heading', { name: 'Moderation history' }).locator('..');
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

        expect(await platformAuditActionsForTargets([ownerEmail, moderatorEmail, targetEmail])).toEqual([
            {
                actor_kind: 'system', actor_email: 'OWNER_EMAILS reconciliation', target_email: ownerEmail,
                action: 'owner_granted', reason: 'Synchronize account role with OWNER_EMAILS configuration',
                project_id: null,
                metadata: { source: 'owner_emails_reconciliation', previousRole: 'user', newRole: 'owner' },
            },
            {
                actor_kind: 'user', actor_email: ownerEmail, target_email: moderatorEmail,
                action: 'admin_promoted', reason: promotionReason, project_id: null,
                metadata: { source: 'owner_role_workflow', previousRole: 'user', newRole: 'admin' },
            },
            {
                actor_kind: 'user', actor_email: moderatorEmail, target_email: targetEmail,
                action: 'account_suspended', reason: suspensionReason, project_id: null,
                metadata: { source: 'account_workflow' },
            },
            {
                actor_kind: 'user', actor_email: moderatorEmail, target_email: targetEmail,
                action: 'project_unpublished', reason: suspensionReason, project_id: selectedId,
                metadata: { source: 'account_workflow', previousProjectVisibility: 'public' },
            },
            {
                actor_kind: 'user', actor_email: ownerEmail, target_email: moderatorEmail,
                action: 'admin_demoted', reason: demotionReason, project_id: null,
                metadata: { source: 'owner_role_workflow', previousRole: 'admin', newRole: 'user' },
            },
            {
                actor_kind: 'user', actor_email: ownerEmail, target_email: moderatorEmail,
                action: 'account_suspended', reason: demotionReason, project_id: null,
                metadata: { source: 'owner_role_workflow' },
            },
            {
                actor_kind: 'user', actor_email: ownerEmail, target_email: targetEmail,
                action: 'account_restored', reason: restorationReason, project_id: null,
                metadata: { source: 'account_workflow' },
            },
        ]);
        expect(await legacyModerationActionsForReasons([
            promotionReason,
            suspensionReason,
            demotionReason,
            restorationReason,
        ])).toEqual([]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});
