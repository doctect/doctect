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

const stageForkForSource = (
  implementation: typeof stageImport,
  sourceKey: string,
  payload: Parameters<typeof stageImport>[0],
): ReturnType<typeof stageImport> => (
  implementation as unknown as (
    nextPayload: Parameters<typeof stageImport>[0],
    options: { sourceKey: string; replaceRetainedForkAttempt: true },
  ) => ReturnType<typeof stageImport>
)(payload, { sourceKey, replaceRetainedForkAttempt: true });

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
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000007',
      '00000000-0000-4000-8000-000000000008',
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

  it('creates no source attempt before ready bootstrap and accepts later changed payload', async () => {
    workspaceStore.bootstrap
      .mockResolvedValueOnce(recoveryResult())
      .mockResolvedValueOnce({ status: 'ready', snapshot: workspaceSnapshot() });
    workspaceStore.commit.mockResolvedValue(workspaceSnapshot());

    await expect(stageForSource(stageImport, 'gallery-open:delayed-ready', {
      name: 'Remote Project',
      state: { revision: 1 },
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);

    await expect(stageForSource(stageImport, 'gallery-open:delayed-ready', {
      name: 'Remote Project',
      state: { revision: 2 },
    })).resolves.toBe('import_00000000-0000-4000-8000-000000000001');
    expect(workspaceStore.commit).toHaveBeenCalledOnce();
    expect(workspaceStore.commit.mock.calls[0][0].pendingImport.state).toEqual({ revision: 2 });
  });

  it('checks bootstrap before a changed payload and preserves a prior executable attempt', async () => {
    workspaceStore.bootstrap
      .mockResolvedValueOnce({ status: 'ready', snapshot: workspaceSnapshot() })
      .mockResolvedValueOnce(unavailableResult())
      .mockResolvedValueOnce({ status: 'ready', snapshot: workspaceSnapshot() });
    workspaceStore.commit
      .mockRejectedValueOnce(new Error('ambiguous stage result'))
      .mockResolvedValueOnce(workspaceSnapshot());
    const original = { name: 'Remote Project', state: { revision: 1 } };

    await expect(stageForSource(stageImport, 'gallery-open:preserved', original))
      .rejects.toThrow('ambiguous stage result');
    const retained = window.sessionStorage.getItem('doctect_import_stage_attempt');
    await expect(stageForSource(stageImport, 'gallery-open:preserved', {
      name: 'Remote Project',
      state: { revision: 2 },
    })).rejects.toMatchObject({ code: 'authority-lost' });
    expect(window.sessionStorage.getItem('doctect_import_stage_attempt')).toBe(retained);

    await expect(stageForSource(stageImport, 'gallery-open:preserved', original))
      .resolves.toBe('import_00000000-0000-4000-8000-000000000001');
    expect(workspaceStore.commit.mock.calls[1][0]).toEqual(workspaceStore.commit.mock.calls[0][0]);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  it('retains exact executable attempts for multiple sources across module reload', async () => {
    workspaceStore.bootstrap.mockResolvedValue({
      status: 'ready',
      snapshot: workspaceSnapshot(),
    });
    workspaceStore.commit
      .mockRejectedValueOnce(new Error('source A ambiguous'))
      .mockRejectedValueOnce(new Error('source B ambiguous'))
      .mockResolvedValue(workspaceSnapshot());
    const sourceA = { name: 'Source A', state: { source: 'A' } };
    const sourceB = { name: 'Source B', state: { source: 'B' } };

    await expect(stageForSource(stageImport, 'gallery-open:source-a', sourceA))
      .rejects.toThrow('source A ambiguous');
    await expect(stageForSource(stageImport, 'gallery-open:source-b', sourceB))
      .rejects.toThrow('source B ambiguous');
    const firstA = structuredClone(workspaceStore.commit.mock.calls[0][0]);
    const firstB = structuredClone(workspaceStore.commit.mock.calls[1][0]);

    vi.resetModules();
    const reloaded = await import('../../services/importProject');
    await expect(stageForSource(reloaded.stageImport, 'gallery-open:source-a', sourceA))
      .resolves.toBe(firstA.pendingImport.id);
    await expect(stageForSource(reloaded.stageImport, 'gallery-open:source-b', sourceB))
      .resolves.toBe(firstB.pendingImport.id);

    expect(workspaceStore.commit.mock.calls[2][0]).toEqual(firstA);
    expect(workspaceStore.commit.mock.calls[3][0]).toEqual(firstB);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(4);
    expect(window.sessionStorage.length).toBe(0);
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

  it('persists and replays one hash-only fork replacement transition', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
    workspaceStore.bootstrap.mockResolvedValue({
      status: 'ready',
      snapshot: workspaceSnapshot(),
    });
    workspaceStore.commit
      .mockRejectedValueOnce(new Error('account A post-commit readback failed'))
      .mockRejectedValueOnce(new Error('account B post-commit readback failed'))
      .mockResolvedValueOnce(workspaceSnapshot());
    const sourceKey = 'gallery-fork:source-1:fork_00000000-0000-4000-8000-000000000009';
    const accountA = {
      name: 'Account A private fork',
      state: { privateText: 'account A document' },
      cloud: { projectId: 'account-a-project', lastSyncedCommitId: 'account-a-commit' },
    };
    const accountB = {
      name: 'Account B private fork',
      state: { privateText: 'account B document' },
      cloud: { projectId: 'account-b-project', lastSyncedCommitId: 'account-b-commit' },
    };

    await expect(stageForkForSource(stageImport, sourceKey, accountA))
      .rejects.toThrow('account A post-commit readback failed');
    const firstCommand = structuredClone(workspaceStore.commit.mock.calls[0][0]);
    expect(firstCommand).toMatchObject({
      type: 'stage-import',
      pendingImport: {
        id: 'import_00000000-0000-4000-8000-000000000001',
        targetProjectId: 'proj_00000000-0000-4000-8000-000000000002',
      },
      attemptProvenance: {
        sourceKeyDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        payloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    const retainedA = window.sessionStorage.getItem('doctect_import_stage_attempt') ?? '';
    expect(retainedA).not.toContain('account-a-project');
    expect(retainedA).not.toContain('account-a-commit');
    expect(retainedA).not.toContain('Account A private fork');
    expect(retainedA).not.toContain('account A document');

    await expect(stageForkForSource(stageImport, sourceKey, accountB))
      .rejects.toThrow('account B post-commit readback failed');
    const replacementCommand = structuredClone(workspaceStore.commit.mock.calls[1][0]);
    expect(replacementCommand).toEqual({
      type: 'replace-staged-import',
      expected: {
        importId: firstCommand.pendingImport.id,
        targetProjectId: firstCommand.pendingImport.targetProjectId,
        createdAt: firstCommand.pendingImport.createdAt,
        ...firstCommand.attemptProvenance,
      },
      replacement: {
        pendingImport: {
          id: 'import_00000000-0000-4000-8000-000000000003',
          targetProjectId: 'proj_00000000-0000-4000-8000-000000000004',
          name: accountB.name,
          state: accountB.state,
          cloud: accountB.cloud,
          createdAt: firstCommand.pendingImport.createdAt,
        },
        attemptProvenance: {
          sourceKeyDigest: firstCommand.attemptProvenance.sourceKeyDigest,
          payloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    });
    expect(replacementCommand.replacement.attemptProvenance.payloadDigest)
      .not.toBe(firstCommand.attemptProvenance.payloadDigest);
    const retainedTransition = window.sessionStorage.getItem('doctect_import_stage_attempt') ?? '';
    for (const forbidden of [
      'account-a-project',
      'account-a-commit',
      'Account A private fork',
      'account A document',
      'account-b-project',
      'account-b-commit',
      'Account B private fork',
      'account B document',
    ]) {
      expect(retainedTransition).not.toContain(forbidden);
    }

    vi.resetModules();
    const reloaded = await import('../../services/importProject');
    await expect(stageForkForSource(reloaded.stageImport, sourceKey, accountB))
      .resolves.toBe('import_00000000-0000-4000-8000-000000000003');

    expect(workspaceStore.commit.mock.calls[2][0]).toEqual(replacementCommand);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(4);
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
