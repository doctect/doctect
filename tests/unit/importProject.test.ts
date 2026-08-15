import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stageImport } from '../../services/importProject';
import {
  recoveryResult,
  unavailableResult,
  workspaceSnapshot,
} from '../helpers/fakeLocalWorkspaceStore';

const workspaceStore = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  commit: vi.fn(),
  exportRecoveryBundle: vi.fn(),
}));

vi.mock('../../services/localWorkspace/index', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/localWorkspace/index')>(),
  localWorkspaceStore: workspaceStore,
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
};

describe('stageImport', () => {
  beforeEach(() => {
    workspaceStore.bootstrap.mockReset();
    workspaceStore.commit.mockReset();
    workspaceStore.exportRecoveryBundle.mockReset();
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  });

  it('bootstraps cold storage and resolves only after the raw import is durable', async () => {
    const bootstrap = deferred<{
      status: 'ready';
      snapshot: ReturnType<typeof workspaceSnapshot>;
    }>();
    const committed = deferred<ReturnType<typeof workspaceSnapshot>>();
    const rawState: unknown = {
      schemaVersion: 8,
      generator: { formatVersion: 2, legacyNote: 'keep raw until store validation' },
    };
    workspaceStore.bootstrap.mockReturnValue(bootstrap.promise);
    workspaceStore.commit.mockReturnValue(committed.promise);

    const staged = stageImport({
      name: 'Remote Project',
      state: rawState,
      cloud: { projectId: 'cloud-project', lastSyncedCommitId: 'cloud-commit' },
    });

    expect(workspaceStore.bootstrap).toHaveBeenCalledOnce();
    expect(workspaceStore.commit).not.toHaveBeenCalled();

    bootstrap.resolve({ status: 'ready', snapshot: workspaceSnapshot() });
    await vi.waitFor(() => expect(workspaceStore.commit).toHaveBeenCalledOnce());
    const command = workspaceStore.commit.mock.calls[0][0];
    expect(command).toEqual({
      type: 'stage-import',
      pendingImport: {
        id: 'import_00000000-0000-4000-8000-000000000001',
        targetProjectId: 'proj_00000000-0000-4000-8000-000000000002',
        name: 'Remote Project',
        state: rawState,
        cloud: { projectId: 'cloud-project', lastSyncedCommitId: 'cloud-commit' },
        createdAt: expect.any(String),
      },
    });
    expect(Number.isNaN(Date.parse(command.pendingImport.createdAt))).toBe(false);

    let resolved = false;
    void staged.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);

    committed.resolve(workspaceSnapshot());
    await expect(staged).resolves.toBe('import_00000000-0000-4000-8000-000000000001');
  });

  it.each([
    ['recovery', recoveryResult()],
    ['unavailable', unavailableResult()],
  ])('rejects without staging when cold bootstrap returns %s', async (_label, result) => {
    workspaceStore.bootstrap.mockResolvedValue(result);

    await expect(stageImport({ name: 'Remote Project', state: {} }))
      .rejects.toMatchObject({ code: 'authority-lost' });
    expect(workspaceStore.commit).not.toHaveBeenCalled();
  });
});
