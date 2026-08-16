import { expect } from '@playwright/test';

const WORKSPACE_DB_NAME = 'doctect-local-workspace';
const NON_DOCUMENT_PREFERENCES = [
    'doctect_last_align',
    'doctect_last_fontFamily',
    'doctect_last_fontSize',
    'doctect_last_fontStyle',
    'doctect_last_fontWeight',
    'doctect_last_textColor',
    'doctect_last_textDecoration',
    'doctect_last_textOverflow',
    'doctect_last_textWrap',
    'gallery-explainer-dismissed',
];
const NON_DOCUMENT_PREFIXES = ['doctect_workspace_migration_receipt_seen:'];
const SESSION_PREFERENCES = ['doctect_import_stage_attempt'];

export const resetLocalWorkspace = async page => {
    // Leaving /app closes that document's IndexedDB connection before deletion.
    await page.goto('/');
    await page.evaluate(async ({ databaseName, keys, prefixes, sessionKeys }) => {
        for (const key of keys) localStorage.removeItem(key);
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key && prefixes.some(prefix => key.startsWith(prefix))) {
                localStorage.removeItem(key);
            }
        }
        for (const key of sessionKeys) sessionStorage.removeItem(key);

        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(databaseName);
            request.addEventListener('success', () => resolve(), { once: true });
            request.addEventListener('error', () => reject(request.error), { once: true });
            request.addEventListener('blocked', () => reject(new Error(
                `Deleting ${databaseName} was blocked by an open connection.`,
            )), { once: true });
        });
    }, {
        databaseName: WORKSPACE_DB_NAME,
        keys: NON_DOCUMENT_PREFERENCES,
        prefixes: NON_DOCUMENT_PREFIXES,
        sessionKeys: SESSION_PREFERENCES,
    });
};

export const openFreshEditor = async page => {
    await resetLocalWorkspace(page);
    await page.goto('/app');
};

export const readWorkspace = page => page.evaluate(async () => {
    const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
    const result = await localWorkspaceStore.bootstrap();
    if (result.status !== 'ready') throw new Error(`workspace ${result.status}`);
    return result.snapshot;
});

export const readBootstrapResult = page => page.evaluate(async () => {
    const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
    return localWorkspaceStore.bootstrap();
});

export const readProject = async (page, projectId) => {
    const snapshot = await readWorkspace(page);
    const project = snapshot.projects.find(candidate => candidate.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found.`);
    return project;
};

export const readActiveProject = async page => {
    const snapshot = await readWorkspace(page);
    const project = snapshot.projects.find(candidate => candidate.id === snapshot.activeProjectId);
    if (!project) throw new Error('Active project not found.');
    return project;
};

export const seedNativeWorkspace = async (page, workspace) => {
    await resetLocalWorkspace(page);
    return page.evaluate(async desired => {
        const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
        const bootstrap = await localWorkspaceStore.bootstrap();
        if (bootstrap.status !== 'ready') throw new Error(`workspace ${bootstrap.status}`);
        let snapshot = bootstrap.snapshot;
        const projects = desired.projects || [];

        if (projects.length > 0) {
            const initialIds = snapshot.projects.map(project => project.id);
            snapshot = await localWorkspaceStore.commit({
                type: 'create-and-activate-project',
                project: projects[0],
            });
            for (const projectId of initialIds) {
                snapshot = await localWorkspaceStore.commit({ type: 'close-project', projectId });
            }
            for (const project of projects.slice(1)) {
                snapshot = await localWorkspaceStore.commit({
                    type: 'create-and-activate-project',
                    project,
                });
            }
            if (desired.activeProjectId && snapshot.activeProjectId !== desired.activeProjectId) {
                snapshot = await localWorkspaceStore.commit({
                    type: 'activate-project',
                    projectId: desired.activeProjectId,
                });
            }
        }

        for (const preset of desired.customPresets || []) {
            snapshot = await localWorkspaceStore.commit({ type: 'save-custom-preset', preset });
        }
        for (const pendingImport of desired.pendingImports || []) {
            const { warnings: _warnings, ...input } = pendingImport;
            snapshot = await localWorkspaceStore.commit({
                type: 'stage-import',
                pendingImport: input,
            });
        }
        return snapshot;
    }, workspace);
};

export const seedNativeProject = (page, project) => seedNativeWorkspace(page, {
    projects: [project],
    activeProjectId: project.id,
    customPresets: [],
    pendingImports: [],
});

export const setActiveProjectGenerator = (page, generator) => page.evaluate(async nextGenerator => {
    const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
    const result = await localWorkspaceStore.bootstrap();
    if (result.status !== 'ready') throw new Error(`workspace ${result.status}`);
    const project = structuredClone(result.snapshot.projects.find(
        candidate => candidate.id === result.snapshot.activeProjectId,
    ));
    if (!project) throw new Error('Active project not found while saving generator source.');
    project.initialState.generator = {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        ...nextGenerator,
    };
    await localWorkspaceStore.commit({ type: 'save-project', project });
}, generator);

export const setActiveProjectCloud = (page, cloud) => page.evaluate(async nextCloud => {
    const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
    const result = await localWorkspaceStore.bootstrap();
    if (result.status !== 'ready') throw new Error(`workspace ${result.status}`);
    const project = structuredClone(result.snapshot.projects.find(
        candidate => candidate.id === result.snapshot.activeProjectId,
    ));
    if (!project) throw new Error('Active project not found while saving cloud linkage.');
    project.cloud = nextCloud;
    await localWorkspaceStore.commit({ type: 'save-project', project });
}, cloud);

export const updateActiveProject = (page, changes) => page.evaluate(async nextChanges => {
    const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
    const result = await localWorkspaceStore.bootstrap();
    if (result.status !== 'ready') throw new Error(`workspace ${result.status}`);
    const current = result.snapshot.projects.find(
        candidate => candidate.id === result.snapshot.activeProjectId,
    );
    if (!current) throw new Error('Active project not found while updating it.');
    const project = { ...structuredClone(current), ...structuredClone(nextChanges) };
    return localWorkspaceStore.commit({ type: 'save-project', project });
}, changes);

export const waitForPersistedGenerator = async (page, expected) => {
    await expect.poll(async () => {
        const project = await readActiveProject(page);
        const generator = project.initialState.generator;
        return generator && {
            templateScript: generator.templateScript,
            hierarchyScript: generator.hierarchyScript,
        };
    }).toEqual(expected);
};

export const waitForPersistedCloudLink = async (page, expected) => {
    await expect.poll(async () => (await readActiveProject(page)).cloud).toEqual(expected);
    await expect(page.getByTitle('Cloud').locator('..').getByRole('button', {
        name: /^(?:Save to cloud(?: \(new\))?|Retry local link)$/,
    })).toBeHidden();
};
