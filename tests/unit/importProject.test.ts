import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const stageForSource = (
  implementation: typeof stageImport,
  sourceKey: string,
  payload: Parameters<typeof stageImport>[0],
): ReturnType<typeof stageImport> => (
  implementation as unknown as (
    nextPayload: Parameters<typeof stageImport>[0],
    options: { sourceKey: string },
  ) => ReturnType<typeof stageImport>
)(payload, { sourceKey });

describe('stageImport', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    workspaceStore.bootstrap.mockReset();
    workspaceStore.commit.mockReset();
    workspaceStore.exportRecoveryBundle.mockReset();
    window.sessionStorage.clear();
    const ids: ReturnType<Crypto['randomUUID']>[] = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
    ];
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockImplementation(() => ids.shift() ?? '00000000-0000-4000-8000-000000000099');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    await vi.waitFor(() => expect(workspaceStore.bootstrap).toHaveBeenCalledOnce());
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

  it('reuses exact attempt metadata after ambiguous post-commit failure and module reload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
    workspaceStore.bootstrap.mockResolvedValue({
      status: 'ready',
      snapshot: workspaceSnapshot(),
    });
    workspaceStore.commit
      .mockRejectedValueOnce(new Error('post-commit readback failed'))
      .mockResolvedValueOnce(workspaceSnapshot());
    const payload = {
      name: 'Remote Project',
      state: { secretDocumentText: 'never copy this into session storage' },
    };

    await expect(stageForSource(stageImport, 'gallery-open:project-1', payload))
      .rejects.toThrow('post-commit readback failed');
    const retained = Array.from(
      { length: window.sessionStorage.length },
      (_, index) => window.sessionStorage.getItem(window.sessionStorage.key(index) ?? ''),
    ).join('\n');
    expect(retained).not.toContain('secretDocumentText');
    expect(retained).not.toContain('never copy this into session storage');
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));

    vi.resetModules();
    const reloaded = await import('../../services/importProject');
    await expect(stageForSource(
      reloaded.stageImport,
      'gallery-open:project-1',
      payload,
    )).resolves.toBe('import_00000000-0000-4000-8000-000000000001');

    expect(workspaceStore.commit).toHaveBeenCalledTimes(2);
    expect(workspaceStore.commit.mock.calls[1][0])
      .toEqual(workspaceStore.commit.mock.calls[0][0]);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('rejects changed payload reuse without issuing a new stage command or IDs', async () => {
    workspaceStore.bootstrap.mockResolvedValue({
      status: 'ready',
      snapshot: workspaceSnapshot(),
    });
    workspaceStore.commit.mockRejectedValueOnce(new Error('ambiguous stage result'));

    await expect(stageForSource(stageImport, 'gallery-open:changed-project', {
      name: 'Remote Project',
      state: { revision: 1 },
    })).rejects.toThrow('ambiguous stage result');
    await expect(stageForSource(stageImport, 'gallery-open:changed-project', {
      name: 'Remote Project',
      state: { revision: 2 },
    })).rejects.toMatchObject({ code: 'conflict' });

    expect(workspaceStore.commit).toHaveBeenCalledOnce();
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(2);
  });
});
