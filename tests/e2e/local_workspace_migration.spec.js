import { test, expect } from '@playwright/test';
import {
    readActiveProject,
    readBootstrapResult,
    readWorkspace,
    seedNativeProject,
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
    prepareLargeLegacyWorkspace,
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
const receiptHeading = page => page.getByRole('heading', { name: 'Local projects upgraded' });
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

    test('receipt reports exact counts, preserves pending import, and downloads original raw bytes', async ({ page }) => {
        const legacy = await prepareValidLegacyWorkspace(page);

        await page.goto('/app');

        await expect(receiptHeading(page)).toBeVisible();
        await expect(page.getByText('2 projects', { exact: true })).toBeVisible();
        await expect(page.getByText('2 custom presets', { exact: true })).toBeVisible();
        await expect(page.getByText('Pending import preserved', { exact: true })).toBeVisible();
        const bundle = await downloadJson(page, 'Download original backup');
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
                const bundle = await downloadJson(page, 'Download backup');
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

            await expect(page.getByRole('heading', { name: 'Local project storage is unavailable' })).toBeVisible();
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
                result: { status: 'unavailable' },
                gateBootstrapCalls: 1,
            });
            await expect.poll(async () => (
                await readHeldWorkspaceSignals(page)
            ).versionChangeCount).toBe(1);
            await expect(page.getByRole('heading', {
                name: 'Local project storage is unavailable',
            })).toBeVisible();
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
                    /couldn't upgrade local projects|Project copies changed in another tab/,
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

        await expect(page.getByRole('heading', { name: 'Project copies changed in another tab' })).toBeVisible();
        await expect(editorPane(page)).toHaveCount(0);
        const currentBundle = await downloadJson(page, 'Download current browser copy');
        const originalBundle = await downloadJson(page, 'Download original backup');
        const editorBundle = await downloadJson(page, 'Download editor copy');
        expect(legacyRawFromBundle(currentBundle)).toEqual(changed.raw);
        expect(legacyRawFromBundle(originalBundle)).toEqual(legacy.raw);
        expect(editorBundle.workspace).toEqual(durableBeforeRecovery);

        await page.getByRole('button', { name: 'Recover changed projects as copies' }).click();
        await page.getByRole('button', { name: 'Recover as copies' }).click();
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
        await expect(page.getByRole('heading', { name: 'Project copies changed in another tab' })).toBeVisible();
        const firstInspection = await inspectWorkspaceDatabase(page);
        const firstRecoveryId = firstInspection.records.migrationLedger[0].unresolvedRecovery.id;
        await page.getByRole('button', { name: 'Recover changed projects as copies' }).click();
        await page.getByRole('button', { name: 'Recover as copies' }).click();
        await expect(editorPane(page).first()).toBeVisible();

        const second = createChangedLegacyWorkspace(legacy, 'Second rollback', 'second');
        await armLegacyStorageEvent(page);
        await writeLegacyRaw(oldPage, second.raw);
        await waitForLegacyStorageEvent(page);

        await expect(page.getByRole('heading', { name: 'Project copies changed in another tab' })).toBeVisible();
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

    test('coalesces near-limit saves before one real module-Worker preparation and survives reload', async ({ page, browserName }, testInfo) => {
        test.skip(browserName !== 'chromium', 'Production module-Worker persistence proof is Chromium-only.');
        test.setTimeout(120_000);
        await installProjectPreparationWorkerCapture(page);
        await page.goto('/');
        const large = await createLargeLegacyWorkspace(page);
        const nearLimitProject = large.projects[0];
        expect(large.nearLimitStateBytes).toBeGreaterThan(MAX_STATE_BYTES - 2048);
        await seedNativeProject(page, nearLimitProject);
        await page.goto('/app');
        await expect(editorPane(page).first()).toBeVisible();

        const measurement = await page.evaluate(async () => {
            const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
            const { inheritInstalledProjectAuthority } = await import(
                '/services/localWorkspace/projectAuthority.ts'
            );
            const bootstrap = await localWorkspaceStore.bootstrap();
            if (bootstrap.status !== 'ready') throw new Error(`workspace ${bootstrap.status}`);
            const current = bootstrap.snapshot.projects.find(
                project => project.id === bootstrap.snapshot.activeProjectId,
            );
            if (!current) throw new Error('Active near-limit project is missing.');
            const names = ['Burst one', 'Burst two', 'Burst latest'];

            const cloneStartedAt = performance.now();
            const cloneOnly = names.map(name => ({ ...structuredClone(current), name }));
            const cloneOnlyMs = performance.now() - cloneStartedAt;
            let checksum = 0;
            for (const cloned of cloneOnly) checksum += cloned.name.length;

            const payloads = names.map(name => {
                const payload = { ...structuredClone(current), name };
                inheritInstalledProjectAuthority(payload, current);
                return payload;
            });
            const admissionStartedAt = performance.now();
            const saves = payloads.map(project => localWorkspaceStore.commit({
                type: 'save-project',
                project,
            }));
            const admissionMs = performance.now() - admissionStartedAt;
            const immediateWorkers = globalThis.__workspaceProjectPreparationWorkers.workers.length;
            await Promise.resolve();
            const microtaskWorkers = globalThis.__workspaceProjectPreparationWorkers.workers.length;
            const results = await Promise.all(saves);
            const capture = globalThis.__workspaceProjectPreparationWorkers;
            return {
                admissionMs,
                checksum,
                cloneOnlyMs,
                immediateWorkers,
                microtaskWorkers,
                sharedReadback: results.every(result => result === results[0]),
                latestName: results[0].projects.find(project => project.id === current.id)?.name,
                workers: capture.workers,
                requests: capture.requests,
                responses: capture.responses,
            };
        });

        await testInfo.attach('workspace-save-admission.json', {
            body: Buffer.from(JSON.stringify({
                admissionMs: measurement.admissionMs,
                cloneOnlyMs: measurement.cloneOnlyMs,
                ratio: measurement.admissionMs / measurement.cloneOnlyMs,
                nearLimitStateBytes: large.nearLimitStateBytes,
                workers: measurement.workers.length,
                requests: measurement.requests,
                responses: measurement.responses,
            }, null, 2)),
            contentType: 'application/json',
        });
        expect(measurement.cloneOnlyMs).toBeGreaterThan(0);
        expect(measurement.checksum).toBeGreaterThan(0);
        // Admission may cost at most 2.5x an equal clone-only burst; validation is excluded.
        expect(measurement.admissionMs).toBeLessThanOrEqual(measurement.cloneOnlyMs * 2.5);
        expect(measurement.immediateWorkers).toBe(0);
        expect(measurement.microtaskWorkers).toBe(0);
        expect(measurement.sharedReadback).toBe(true);
        expect(measurement.latestName).toBe('Burst latest');
        expect(measurement.workers).toHaveLength(1);
        expect(measurement.workers[0]).toMatchObject({ type: 'module' });
        expect(measurement.workers[0].url).toContain('projectPreparationWorker');
        expect(measurement.requests).toBe(1);
        expect(measurement.responses).toBe(1);
        const inspection = await inspectWorkspaceDatabase(page);
        expect(inspection.records.projects.find(record => record.id === nearLimitProject.id))
            .toMatchObject({ storageRevision: 1, project: { name: 'Burst latest' } });

        await page.reload();
        await expect(editorPane(page).first()).toBeVisible();
        expect((await readActiveProject(page)).name).toBe('Burst latest');
    });
});
