import {
  localWorkspaceStore,
  WorkspaceStoreError,
} from './localWorkspace/index';

export const IMPORT_STAGE_ERROR_MESSAGE =
  'Could not prepare this project for the editor. Nothing was removed; try again.';

export interface ImportPayload {
  name: string;
  state: unknown;
  cloud?: { projectId: string; lastSyncedCommitId: string };
}

export async function stageImport(payload: ImportPayload): Promise<string> {
  const bootstrap = await localWorkspaceStore.bootstrap();
  if (bootstrap.status !== 'ready') {
    throw new WorkspaceStoreError('Workspace is not ready.', 'authority-lost');
  }

  const importId = `import_${globalThis.crypto.randomUUID()}`;
  await localWorkspaceStore.commit({
    type: 'stage-import',
    pendingImport: {
      id: importId,
      targetProjectId: `proj_${globalThis.crypto.randomUUID()}`,
      name: payload.name,
      state: payload.state,
      ...(payload.cloud ? { cloud: payload.cloud } : {}),
      createdAt: new Date().toISOString(),
    },
  });
  return importId;
}
