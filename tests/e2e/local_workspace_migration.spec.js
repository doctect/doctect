import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
    readBootstrapResult,
    readWorkspace,
    updateActiveProject,
} from './localWorkspaceHelpers.js';
import {
    MAX_STATE_BYTES,
    WORKSPACE_STORE_NAMES,
    armLegacyStorageEvent,
    createChangedLegacyWorkspace,
    createLargeLegacyWorkspace,
    downloadJson,
    holdVersionOneWorkspaceDatabase,
    inspectWorkspaceDatabase,
    inspectHeldWorkspaceDatabase,
    installBootstrapPhaseHold,
    installBootstrapResultCapture,
    installCrashAfterCopied,
    installIndexedDbOpenFailure,
    installIndexedDbTermination,
    installIndexedDbUnavailable,
    installInitialCopyAbort,
    installInitialCopyCorruption,
    installPerformanceCapture,
    installProjectPreparationWorkerCapture,
    legacyRawFromBundle,
    mountVersionTwoWorkspaceGate,
    navigateSpaToEditor,
    prepareHistoricalVersionOneWorkspace,
    prepareLargeLegacyWorkspace,
    prepareNearLimitLegacyWorkspaceFromBuiltEditor,
    prepareLegacyFailure,
    prepareValidLegacyWorkspace,
    readCapturedBootstrapResult,
    readHeldWorkspaceSignals,
    readLegacyRaw,
    readPerformanceCapture,
    releaseHeldWorkspaceDatabase,
    releaseBootstrapPhaseHold,
    seedLegacyRaw,
    totalStoredRecords,
    waitForBootstrapPhaseHold,
    waitForLegacyStorageEvent,
    writeLegacyRaw,
} from './fixtures/localWorkspaceMigration.js';

const editorPane = page => page.getByTestId('project-pane');
const receiptHeading = page => page.getByRole('heading', { name: 'Your projects are ready' });
const recoveryAlert = page => page.getByRole('alert');

const continueToEditor = async page => {
    await receiptHeading(page).waitFor();
    await page.getByRole('button', { name: 'Continue to editor' }).click();
    await expect(editorPane(page).first()).toBeVisible();
};

const expectIndexFreeSchema = inspection => {
    expect(inspection).not.toBeNull();
    expect(Object.keys(inspection.schema)).toEqual(WORKSPACE_STORE_NAMES);
    expect(Object.values(inspection.schema)).toEqual(WORKSPACE_STORE_NAMES.map(() => []));
};

test.describe('local workspace migration release gate', () => {
    test('migrates Unicode projects, generator source, cloud links, revisions, order, presets, and pending import byte-exactly', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page);

        await page.goto('/app');

        await expect(receiptHeading(page)).toBeVisible();
        await expect(editorPane(page)).toHaveCount(0);
        const migrated = await readWorkspace(page);
        expect(migrated.projects).toEqual(legacy.projects);
        expect(migrated.projects.map(project => project.id)).toEqual(legacy.projects.map(project => project.id));
        expect(migrated.activeProjectId).toBe(legacy.activeProjectId);
        expect(migrated.customPresets).toEqual(legacy.presets);
        expect(migrated.pendingImports).toHaveLength(1);
        expect(migrated.pendingImports[0]).toMatchObject({
            name: legacy.pendingImport.name,
            state: legacy.pendingImport.state,
            cloud: legacy.pendingImport.cloud,
            warnings: [],
        });
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
        const inspection = await inspectWorkspaceDatabase(page);
        expectIndexFreeSchema(inspection);
        expect(inspection.records.migrationLedger).toHaveLength(1);
        expect(inspection.records.migrationLedger[0]).toMatchObject({
            state: 'verified',
            persistenceRolloutEpoch: 1,
            counts: { sourceProjects: 2, customPresets: 2, pendingImports: 1 },
        });

        await continueToEditor(page);
        const consumed = await readWorkspace(page);
        expect(consumed.pendingImports).toEqual([]);
        expect(consumed.projects).toHaveLength(legacy.projects.length + 1);
        expect(consumed.projects.at(-1)).toMatchObject({
            name: legacy.pendingImport.name,
            initialState: legacy.pendingImport.state,
            cloud: legacy.pendingImport.cloud,
        });

        await page.reload();
        await expect(editorPane(page).first()).toBeVisible();
        expect(await readWorkspace(page)).toEqual(consumed);
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
    });

    test('repairs recognized version-1 records missing only incarnation before opening editor', async ({ page }) => {
        const historical = await prepareHistoricalVersionOneWorkspace(page);

        await page.goto('/app');

        await expect(recoveryAlert(page)).toHaveCount(0);
        await expect(receiptHeading(page)).toBeVisible();
        expect(await readWorkspace(page)).toEqual(historical.expectedWorkspace);
        expect(await readLegacyRaw(page)).toEqual(historical.raw);
        const repaired = await inspectWorkspaceDatabase(page);
        expect(repaired.version).toBe(2);
        expectIndexFreeSchema(repaired);
        expect(repaired.records.migrationLedger).toEqual([{
            ...historical.historicalLedger,
            indexedDbVersion: 2,
            ledgerRevision: historical.historicalLedger.ledgerRevision + 1,
        }]);
        expect(repaired.records.migrationLedger[0].expectedTargetDigest)
            .toBe(historical.expectedTargetDigest);
        expect(repaired.records.projects).toHaveLength(historical.historicalProjects.length);
        for (const historicalProject of historical.historicalProjects) {
            const current = repaired.records.projects.find(record => record.id === historicalProject.id);
            expect(current).toEqual({
                ...historicalProject,
                incarnation: expect.any(String),
            });
            expect(current.incarnation.length).toBeGreaterThan(0);
        }
        const repairedIncarnations = Object.fromEntries(
            repaired.records.projects.map(record => [record.id, record.incarnation]),
        );

        await continueToEditor(page);
        await page.reload();

        await expect(editorPane(page).first()).toBeVisible();
        await expect(recoveryAlert(page)).toHaveCount(0);
        const reloaded = await inspectWorkspaceDatabase(page);
        expect(reloaded.version).toBe(2);
        expect(reloaded.records.migrationLedger[0].expectedTargetDigest)
            .toBe(historical.expectedTargetDigest);
        for (const [id, incarnation] of Object.entries(repairedIncarnations)) {
            expect(reloaded.records.projects.find(record => record.id === id)?.incarnation)
                .toBe(incarnation);
        }
        expect(await readLegacyRaw(page)).toEqual(historical.raw);
    });

    test('receipt reports exact counts, preserves pending import, and downloads original raw bytes', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page);

        await page.goto('/app');

        await expect(receiptHeading(page)).toBeVisible();
        await expect(page.getByText('2 projects', { exact: true })).toBeVisible();
        await expect(page.getByText('2 custom presets', { exact: true })).toBeVisible();
        await expect(page.getByText('Pending import preserved', { exact: true })).toBeVisible();
        const bundle = await downloadJson(page, 'Download projects from before the update');
        expect(bundle.format).toBe('doctect.legacy-workspace-recovery');
        expect(legacyRawFromBundle(bundle)).toEqual(legacy.raw);
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
    });

    test('consumes pending import exactly once across reload and retains private digest provenance', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page, { projectCount: 1, presetCount: 0 });
        await page.goto('/app');

        const pending = (await readWorkspace(page)).pendingImports[0];
        await continueToEditor(page);

        const first = await readWorkspace(page);
        expect(first.pendingImports).toEqual([]);
        expect(first.projects.filter(project => project.id === pending.targetProjectId)).toHaveLength(1);
        await page.reload();
        await expect(editorPane(page).first()).toBeVisible();
        const second = await readWorkspace(page);
        expect(second).toEqual(first);
        expect(second.projects.filter(project => project.id === pending.targetProjectId)).toHaveLength(1);
        const inspection = await inspectWorkspaceDatabase(page);
        const consumedRecord = inspection.records.projects.find(record => record.id === pending.targetProjectId);
        expect(consumedRecord).toMatchObject({
            consumedImportId: pending.id,
            consumedImportCreatedAt: pending.createdAt,
        });
        expect(consumedRecord.consumedImportDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
    });

    test('blocks malformed, duplicate, future, and data-detaching sources with exact raw backups and no partial target', async ({ page }) => {
        test.setTimeout(120_000);
        const cases = [
            'malformed-json',
            'duplicate-project-ids',
            'malformed-state',
            'future-schema',
            'data-detaching-warning',
        ];
        for (const kind of cases) {
            await test.step(kind, async () => {
                const legacy = await prepareLegacyFailure(page, kind);
                await installBootstrapResultCapture(page);

                await navigateSpaToEditor(page);

                await expect(recoveryAlert(page)).toBeVisible();
                await expect(editorPane(page)).toHaveCount(0);
                await expect.poll(() => readCapturedBootstrapResult(page)).toMatchObject({
                    status: 'recovery',
                });
                const result = await readCapturedBootstrapResult(page);
                expect(result.recovery).toMatchObject({
                    category: legacy.expected.category,
                    affectedKey: legacy.expected.affectedKey,
                    ...(legacy.expected.affectedItem === undefined
                        ? {}
                        : { affectedItem: legacy.expected.affectedItem }),
                });
                expect(result.recovery.message).toContain(legacy.expected.message);
                const bundle = await downloadJson(page, 'Download older-version projects');
                expect(legacyRawFromBundle(bundle)).toEqual(legacy.raw);
                expect(await readLegacyRaw(page)).toEqual(legacy.raw);
                expect(totalStoredRecords(await inspectWorkspaceDatabase(page))).toBe(0);
            });
        }
    });

    test('unavailable, open-failed, and terminated IndexedDB never mount editor or create replacement data', async ({ page }) => {
        test.setTimeout(90_000);
        const failures = [
            ['unavailable', installIndexedDbUnavailable],
            ['open-failed', installIndexedDbOpenFailure],
            ['terminated', installIndexedDbTermination],
        ];
        for (const [_label, installFailure] of failures) {
            const legacy = await prepareValidLegacyWorkspace(page, { pendingImport: false });
            await installFailure(page);

            await navigateSpaToEditor(page);

            await expect(page.getByRole('heading', { name: 'Doctect can’t open your saved projects' })).toBeVisible();
            await expect(editorPane(page)).toHaveCount(0);
            expect(await readLegacyRaw(page)).toEqual(legacy.raw);
            await page.goto('/');
            expect(totalStoredRecords(await inspectWorkspaceDatabase(page))).toBe(0);
            expect(await readLegacyRaw(page)).toEqual(legacy.raw);
        }
    });

    test('production version-2 bootstrap is blocked by a held version-1 connection without fallback', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page, { pendingImport: false });
        const held = await holdVersionOneWorkspaceDatabase(page);
        expect(held).toEqual({ version: 1, stores: [...WORKSPACE_STORE_NAMES].sort() });
        let heldReleased = false;

        try {
            const gateEvidence = await mountVersionTwoWorkspaceGate(page);
            expect(gateEvidence).toMatchObject({
                result: {
                    status: 'unavailable',
                    message: 'IndexedDB upgrade is blocked.',
                },
                gateBootstrapCalls: 1,
            });
            await expect.poll(async () => (
                await readHeldWorkspaceSignals(page)
            ).versionChangeCount).toBe(1);
            await expect(page.getByRole('heading', {
                name: 'Doctect can’t open your saved projects',
            })).toBeVisible();
            await expect(page.getByText(
                'Close other Doctect tabs, then reload this page.',
            )).toBeVisible();
            await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
            await expect(page.getByTestId('blocked-upgrade-editor')).toHaveCount(0);
            await expect(editorPane(page)).toHaveCount(0);
            const heldInspection = await inspectHeldWorkspaceDatabase(page);
            expect(heldInspection.version).toBe(1);
            expect(heldInspection.versionChangeCount).toBe(1);
            expect(totalStoredRecords(heldInspection)).toBe(0);
            expect(await readLegacyRaw(page)).toEqual(legacy.raw);

            await releaseHeldWorkspaceDatabase(page);
            heldReleased = true;
            expect(totalStoredRecords(await inspectWorkspaceDatabase(page))).toBe(0);
            expect(await readLegacyRaw(page)).toEqual(legacy.raw);
        } finally {
            if (!heldReleased) await releaseHeldWorkspaceDatabase(page);
        }
    });

    test('aborted initial copy is all-or-nothing and retains every source byte', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page, { pendingImport: false });
        await installInitialCopyAbort(page);

        await navigateSpaToEditor(page);

        await expect(recoveryAlert(page)).toBeVisible();
        await expect(editorPane(page)).toHaveCount(0);
        expect(totalStoredRecords(await inspectWorkspaceDatabase(page))).toBe(0);
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
    });

    test('crash after copied resumes independent verification into one verified ledger', async ({ context }) => {
        const crashingPage = await context.newPage();
        const legacy = await prepareValidLegacyWorkspace(crashingPage, { pendingImport: false });
        await installCrashAfterCopied(crashingPage);
        await navigateSpaToEditor(crashingPage);
        await expect(recoveryAlert(crashingPage)).toBeVisible();
        const copied = await inspectWorkspaceDatabase(crashingPage);
        expect(copied.records.migrationLedger).toHaveLength(1);
        expect(copied.records.migrationLedger[0].state).toBe('copied');
        await expect(editorPane(crashingPage)).toHaveCount(0);

        await crashingPage.close();
        const resumedPage = await context.newPage();
        await resumedPage.goto('/app');

        await expect(receiptHeading(resumedPage)).toBeVisible();
        const verified = await inspectWorkspaceDatabase(resumedPage);
        expect(verified.records.migrationLedger).toHaveLength(1);
        expect(verified.records.migrationLedger[0]).toMatchObject({
            state: 'verified',
            ledgerRevision: 1,
        });
        expect(verified.records.legacyBackup).toHaveLength(1);
        expect(await readLegacyRaw(resumedPage)).toEqual(legacy.raw);
        await resumedPage.close();
    });

    test('target read-back mismatch never reaches verified authority', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page, { pendingImport: false });
        await installBootstrapResultCapture(page);
        await installInitialCopyCorruption(page);

        await navigateSpaToEditor(page);

        await expect(recoveryAlert(page)).toBeVisible();
        await expect(editorPane(page)).toHaveCount(0);
        const result = await readCapturedBootstrapResult(page);
        expect(result).toMatchObject({
            status: 'recovery',
            recovery: { kind: 'verification-failed' },
        });
        const inspection = await inspectWorkspaceDatabase(page);
        expect(inspection.records.migrationLedger).toHaveLength(1);
        expect(inspection.records.migrationLedger[0].state).toBe('copied');
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
    });

    test('two concurrent new-version pages produce one initial copy', async ({ page, context }) => {
        const legacy = await prepareValidLegacyWorkspace(page, { pendingImport: false });
        const secondPage = await context.newPage();
        await secondPage.goto('/');

        await Promise.all([page.goto('/app'), secondPage.goto('/app')]);

        await expect(receiptHeading(page)).toBeVisible();
        await expect(receiptHeading(secondPage)).toBeVisible();
        const results = await Promise.all([
            readBootstrapResult(page),
            readBootstrapResult(secondPage),
        ]);
        expect(results.map(result => result.status)).toEqual(['ready', 'ready']);
        expect(results[0].snapshot).toEqual(results[1].snapshot);
        const inspection = await inspectWorkspaceDatabase(page);
        expect(inspection.records.migrationLedger).toHaveLength(1);
        expect(inspection.records.legacyBackup).toHaveLength(1);
        expect(inspection.records.projects).toHaveLength(legacy.projects.length);
        expect(inspection.records.migrationLedger[0]).toMatchObject({
            state: 'verified',
            ledgerRevision: 1,
        });
        await secondPage.close();
    });

    test('old-tab writes before, during, and after cutover enter recovery', async ({ page, context }) => {
        test.setTimeout(120_000);
        const timings = ['copying-projects', 'verifying-projects', 'after-cutover'];
        for (const timing of timings) {
            await test.step(timing, async () => {
                const legacy = await prepareValidLegacyWorkspace(page, { pendingImport: false });
                const changed = createChangedLegacyWorkspace(legacy, `Old tab ${timing}`, timing);
                const oldPage = await context.newPage();
                await oldPage.goto('/');

                if (timing === 'after-cutover') {
                    await page.goto('/app');
                    await continueToEditor(page);
                } else {
                    await installBootstrapPhaseHold(page, timing);
                    await navigateSpaToEditor(page);
                    await waitForBootstrapPhaseHold(page);
                    await expect(editorPane(page)).toHaveCount(0);
                }

                await armLegacyStorageEvent(page);
                expect(await writeLegacyRaw(oldPage, changed.raw)).toEqual(changed.raw);
                await waitForLegacyStorageEvent(page);
                if (timing !== 'after-cutover') await releaseBootstrapPhaseHold(page);

                await expect(recoveryAlert(page)).toBeVisible();
                await expect(editorPane(page)).toHaveCount(0);
                await expect(page.locator('#workspace-recovery-heading')).toContainText(
                    /We couldn’t finish preparing your projects|We found two different saved project sets/,
                );
                expect(await readLegacyRaw(page)).toEqual(changed.raw);
                await oldPage.close();
            });
        }
    });

    test('rollback exposes three downloads and recovers changed legacy projects as unlinked copies without deletion', async ({ page, context }) => {
        test.setTimeout(90_000);
        const legacy = await prepareValidLegacyWorkspace(page, {
            projectCount: 1,
            presetCount: 0,
            pendingImport: false,
        });
        await page.goto('/app');
        await continueToEditor(page);
        await updateActiveProject(page, { name: 'IndexedDB edited project' });
        const durableBeforeRecovery = await readWorkspace(page);
        const changed = createChangedLegacyWorkspace(legacy, 'Rollback changed project', 'first');
        const oldPage = await context.newPage();
        await oldPage.goto('/');
        await armLegacyStorageEvent(page);

        await writeLegacyRaw(oldPage, changed.raw);
        await waitForLegacyStorageEvent(page);

        await expect(page.getByRole('heading', { name: 'We found two different saved project sets' })).toBeVisible();
        await expect(editorPane(page)).toHaveCount(0);
        const currentBundle = await downloadJson(page, 'Download older-version projects');
        const originalBundle = await downloadJson(page, 'Download projects from before the update');
        const editorBundle = await downloadJson(page, 'Download editor projects');
        expect(legacyRawFromBundle(currentBundle)).toEqual(changed.raw);
        expect(legacyRawFromBundle(originalBundle)).toEqual(legacy.raw);
        expect(editorBundle.workspace).toEqual(durableBeforeRecovery);

        await page.getByRole('button', { name: 'Add changed projects without replacing anything' }).click();
        await page.getByRole('button', { name: 'Add separate copies' }).click();
        await expect(editorPane(page).first()).toBeVisible();
        const recoveredWorkspace = await readWorkspace(page);
        const durableProject = recoveredWorkspace.projects.find(project => project.id === legacy.projects[0].id);
        const recoveredProject = recoveredWorkspace.projects.find(project => project.id !== legacy.projects[0].id);
        expect(durableProject.name).toBe('IndexedDB edited project');
        expect(recoveredProject.id).not.toBe(legacy.projects[0].id);
        expect(recoveredProject.name).toBe('Recovered — Rollback changed project');
        expect(recoveredProject).not.toHaveProperty('cloud');
        expect(await readLegacyRaw(page)).toEqual(changed.raw);
        const inspection = await inspectWorkspaceDatabase(page);
        expect(inspection.records.projects).toHaveLength(2);
        expect(inspection.records.legacyBackup).toHaveLength(2);
        await oldPage.close();
    });

    test('second rollback write reopens recovery with a new persisted marker', async ({ page, context }) => {
        test.setTimeout(90_000);
        const legacy = await prepareValidLegacyWorkspace(page, {
            projectCount: 1,
            presetCount: 0,
            pendingImport: false,
        });
        await page.goto('/app');
        await continueToEditor(page);
        const oldPage = await context.newPage();
        await oldPage.goto('/');
        const first = createChangedLegacyWorkspace(legacy, 'First rollback', 'first');
        await armLegacyStorageEvent(page);
        await writeLegacyRaw(oldPage, first.raw);
        await waitForLegacyStorageEvent(page);
        await expect(page.getByRole('heading', { name: 'We found two different saved project sets' })).toBeVisible();
        const firstInspection = await inspectWorkspaceDatabase(page);
        const firstRecoveryId = firstInspection.records.migrationLedger[0].unresolvedRecovery.id;
        await page.getByRole('button', { name: 'Add changed projects without replacing anything' }).click();
        await page.getByRole('button', { name: 'Add separate copies' }).click();
        await expect(editorPane(page).first()).toBeVisible();

        const second = createChangedLegacyWorkspace(legacy, 'Second rollback', 'second');
        await armLegacyStorageEvent(page);
        await writeLegacyRaw(oldPage, second.raw);
        await waitForLegacyStorageEvent(page);

        await expect(page.getByRole('heading', { name: 'We found two different saved project sets' })).toBeVisible();
        const inspection = await inspectWorkspaceDatabase(page);
        const secondRecoveryId = inspection.records.migrationLedger[0].unresolvedRecovery.id;
        expect(secondRecoveryId).not.toBe(firstRecoveryId);
        expect(inspection.records.migrationLedger[0].unresolvedRecovery).toMatchObject({
            id: secondRecoveryId,
            kind: 'legacy-drift',
        });
        expect(await readLegacyRaw(page)).toEqual(second.raw);
        await oldPage.close();
    });

    test('bootstrap held at every named phase renders no editor and writes no blank project', async ({ page }) => {
        test.setTimeout(60_000);
        const phases = {
            'opening-local-storage': 'Opening local storage',
            'checking-existing-projects': 'Checking existing projects',
            'copying-projects': 'Copying projects',
            'verifying-projects': 'Verifying projects',
            'finishing-upgrade': 'Finishing upgrade',
        };
        for (const [phase, label] of Object.entries(phases)) {
            await test.step(phase, async () => {
                await prepareValidLegacyWorkspace(page, {
                    projectCount: 1,
                    presetCount: 0,
                    pendingImport: false,
                });
                await installBootstrapPhaseHold(page, phase);
                await navigateSpaToEditor(page);

                await waitForBootstrapPhaseHold(page);

                await expect(page.getByRole('status')).toContainText(label);
                await expect(editorPane(page)).toHaveCount(0);
                const inspection = await inspectWorkspaceDatabase(page);
                const names = inspection?.records?.projects?.map(record => record.project.name) ?? [];
                expect(names).not.toContain('Blank Project');
                await releaseBootstrapPhaseHold(page);
                await expect(receiptHeading(page)).toBeVisible();
            });
        }
    });

    test('aggregate legacy JSON above 5 MiB and one project near MAX_STATE_BYTES migrate exactly', async ({ page }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('workspace-large-'), 'Dedicated large-storage project only.');
        test.setTimeout(180_000);
        const legacy = await prepareLargeLegacyWorkspace(page);
        const expectedSeedBytes = Object.values(legacy.raw).reduce(
            (total, value) => total + (value === null ? 0 : new TextEncoder().encode(value).byteLength),
            0,
        );

        expect(legacy.seed.bytes).toBe(expectedSeedBytes);
        expect(legacy.aggregateProjectBytes).toBeGreaterThan(5 * 1024 * 1024);
        expect(legacy.nearLimitStateBytes).toBeGreaterThan(MAX_STATE_BYTES - 2048);
        expect(legacy.nearLimitStateBytes).toBeLessThan(MAX_STATE_BYTES);
        await page.goto('/app');
        await expect(receiptHeading(page)).toBeVisible();
        const migrated = await readWorkspace(page);
        expect(migrated.projects).toEqual(legacy.projects);
        expect(migrated.activeProjectId).toBe(legacy.activeProjectId);
        expect(await readLegacyRaw(page)).toEqual(legacy.raw);
        await continueToEditor(page);
        await page.reload();
        await expect(editorPane(page).first()).toBeVisible();
        expect(await readWorkspace(page)).toEqual(migrated);
    });

    test('attaches migration duration and supported long-task observations without a threshold', async ({ page }, testInfo) => {
        await prepareValidLegacyWorkspace(page, { pendingImport: false });
        await installPerformanceCapture(page);

        await page.goto('/app');
        await expect(receiptHeading(page)).toBeVisible();
        const performance = await readPerformanceCapture(page);

        expect(Number.isFinite(performance.durationMs)).toBe(true);
        expect(performance.durationMs).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(performance.longTasks)).toBe(true);
        await testInfo.attach('workspace-migration-duration.json', {
            body: Buffer.from(JSON.stringify({ durationMs: performance.durationMs }, null, 2)),
            contentType: 'application/json',
        });
        await testInfo.attach('workspace-migration-long-tasks.json', {
            body: Buffer.from(JSON.stringify({
                supported: performance.longTaskSupported,
                entries: performance.longTasks,
            }, null, 2)),
            contentType: 'application/json',
        });
    });

    test('coalesces near-limit built-editor interactions before one module-Worker save', async ({ page, context, browserName }, testInfo) => {
        test.skip(browserName !== 'chromium', 'Production module-Worker persistence proof is Chromium-only.');
        test.skip(process.env.E2E_BUILT_BUNDLE !== '1', 'This proof requires a freshly built Vite preview bundle.');
        test.setTimeout(180_000);
        await installProjectPreparationWorkerCapture(page);
        await page.goto('/');
        const scriptSources = await page.locator('script[src]').evaluateAll(scripts =>
            scripts.map(script => script.getAttribute('src')));
        expect(scriptSources.some(source => source?.includes('/@vite/client'))).toBe(false);
        expect(scriptSources.some(source => source?.startsWith('/assets/'))).toBe(true);

        const large = await prepareNearLimitLegacyWorkspaceFromBuiltEditor(page);
        const nearLimitProject = large.projects[0];
        expect(large.nearLimitStateBytes).toBeGreaterThan(MAX_STATE_BYTES - 2048);
        await page.goto('/app');
        await continueToEditor(page);

        const measurement = await page.evaluate(async ({ databaseName, projectId }) => {
            const requestResult = request => new Promise((resolve, reject) => {
                request.addEventListener('success', () => resolve(request.result), { once: true });
                request.addEventListener('error', () => reject(request.error), { once: true });
            });
            const database = await requestResult(indexedDB.open(databaseName));
            const transaction = database.transaction('projects', 'readonly');
            const record = await requestResult(transaction.objectStore('projects').get(projectId));
            database.close();
            if (!record?.project) throw new Error('Near-limit project record is missing.');
            const waitTask = () => new Promise(resolve => setTimeout(resolve, 0));
            const quantile = (values, fraction) => {
                const sorted = [...values].sort((left, right) => left - right);
                return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
            };
            const cloneSamples = [];
            for (let index = 0; index < 9; index += 1) {
                const startedAt = performance.now();
                const cloned = structuredClone(record.project);
                await waitTask();
                cloneSamples.push(performance.now() - startedAt);
                if (cloned.id !== projectId) throw new Error('Clone baseline detached project identity.');
            }

            const capture = globalThis.__workspaceProjectPreparationWorkers;
            capture.workers.length = 0;
            capture.requests = 0;
            capture.responses = 0;
            capture.transactions.length = 0;
            const showGrid = document.querySelector('[data-testid="project-pane"] button[title="Show Grid"]');
            if (!(showGrid instanceof HTMLButtonElement)) throw new Error('Show Grid control is missing.');
            const interactionSamples = [];
            for (let index = 0; index < 9; index += 1) {
                const startedAt = performance.now();
                showGrid.click();
                await waitTask();
                interactionSamples.push(performance.now() - startedAt);
            }
            const measuredCloneSamples = cloneSamples.slice(2);
            const measuredInteractionSamples = interactionSamples.slice(2);
            const cloneP90Ms = quantile(measuredCloneSamples, 0.9);
            const interactionP90Ms = quantile(measuredInteractionSamples, 0.9);
            return {
                cloneSamples: measuredCloneSamples,
                interactionSamples: measuredInteractionSamples,
                cloneP90Ms,
                interactionP90Ms,
                p90Ratio: interactionP90Ms / cloneP90Ms,
                workersDuringInteraction: capture.workers.length,
                requestsDuringInteraction: capture.requests,
                responsesDuringInteraction: capture.responses,
            };
        }, { databaseName: 'doctect-local-workspace', projectId: nearLimitProject.id });

        expect(measurement.cloneP90Ms).toBeGreaterThan(0);
        expect(measurement.interactionP90Ms).toBeGreaterThan(0);
        expect(measurement.p90Ratio).toBeLessThanOrEqual(4);
        expect(measurement.workersDuringInteraction).toBe(0);
        expect(measurement.requestsDuringInteraction).toBe(0);
        expect(measurement.responsesDuringInteraction).toBe(0);
        await expect.poll(() => page.evaluate(() =>
            globalThis.__workspaceProjectPreparationWorkers.requests)).toBe(1);
        await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();

        const saveCapture = await page.evaluate(() => ({
            workers: globalThis.__workspaceProjectPreparationWorkers.workers,
            requests: globalThis.__workspaceProjectPreparationWorkers.requests,
            responses: globalThis.__workspaceProjectPreparationWorkers.responses,
            transactions: globalThis.__workspaceProjectPreparationWorkers.transactions,
        }));
        const proofMetrics = {
            nearLimitStateBytes: large.nearLimitStateBytes,
            cloneP90Ms: measurement.cloneP90Ms,
            interactionP90Ms: measurement.interactionP90Ms,
            p90Ratio: measurement.p90Ratio,
            workers: saveCapture.workers.length,
            requests: saveCapture.requests,
            responses: saveCapture.responses,
        };
        console.log('[built-worker-proof]', JSON.stringify(proofMetrics));
        const workspaceTransactions = saveCapture.transactions.filter(transaction =>
            transaction.database === 'doctect-local-workspace');
        expect(saveCapture.workers).toHaveLength(1);
        expect(saveCapture.workers[0]).toMatchObject({ type: 'module' });
        expect(saveCapture.workers[0].url).toContain('projectPreparationWorker');
        expect(saveCapture.requests).toBe(1);
        expect(saveCapture.responses).toBe(1);
        const writes = workspaceTransactions.filter(transaction => transaction.mode === 'readwrite');
        const readbacks = workspaceTransactions.filter(transaction => transaction.mode === 'readonly');
        expect(writes).toHaveLength(1);
        expect([...writes[0].stores].sort()).toEqual(['migrationLedger', 'projects']);
        expect(readbacks).toHaveLength(1);
        expect([...readbacks[0].stores].sort())
            .toEqual(['pendingImports', 'presets', 'projects', 'workspace']);

        const inspection = await inspectWorkspaceDatabase(page);
        expect(inspection.records.projects.find(record => record.id === nearLimitProject.id))
            .toMatchObject({ storageRevision: 1, project: { initialState: { showGrid: true } } });
        await testInfo.attach('workspace-built-editor-save.json', {
            body: Buffer.from(JSON.stringify({ ...measurement, saveCapture }, null, 2)),
            contentType: 'application/json',
        });

        await page.reload();
        await expect(editorPane(page).first()).toBeVisible();
        await expect(page.getByTitle('Show Grid')).toHaveClass(/bg-blue-600/);

        const changed = createChangedLegacyWorkspace(large, 'Built proof drift', 'built-proof');
        const oldPage = await context.newPage();
        await oldPage.goto('/');
        await armLegacyStorageEvent(page);
        await writeLegacyRaw(oldPage, changed.raw);
        await waitForLegacyStorageEvent(page);
        await expect(page.getByRole('heading', { name: 'We found two different saved project sets' })).toBeVisible();
        await expect(editorPane(page)).toHaveCount(0);
        const editorBundle = await downloadJson(page, 'Download editor projects');
        expect(editorBundle.workspace.projects.find(project => project.id === nearLimitProject.id))
            .toMatchObject({ initialState: { showGrid: true } });
        await oldPage.close();

        const completionMarker = process.env.E2E_BUILT_WORKER_COMPLETION_MARKER;
        if (completionMarker) {
            await writeFile(completionMarker, `${JSON.stringify(proofMetrics)}\n`, 'utf8');
        }
    });
});
