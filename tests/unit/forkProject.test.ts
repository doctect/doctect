import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cloudMocks = vi.hoisted(() => ({
  fork: vi.fn(),
  getCommit: vi.fn(),
}));

const stageImport = vi.hoisted(() => vi.fn());

const FORK_ATTEMPT_STORAGE_KEY = 'doctect_fork_attempts';

vi.mock('../../services/cloudApi', () => ({
  cloudApi: cloudMocks,
}));

vi.mock('../../services/importProject', () => ({
  stageImport,
}));

const forkResult = (sourceProjectId = 'source-1', owner = '') => ({
  project: {
    id: `${owner}fork-of-${sourceProjectId}`,
    name: `${owner}Fork of ${sourceProjectId}`,
    headCommitId: `${owner}head-of-${sourceProjectId}`,
  },
});

const commitResult = (sourceProjectId = 'source-1', owner = '') => ({
  id: `${owner}head-of-${sourceProjectId}`,
  message: 'Fork',
  createdAt: '2026-08-15T12:00:00.000Z',
  state: { secretDocumentText: `${owner}state-for-${sourceProjectId}` },
});

const loadSubject = async () => import('../../services/forkProject');

const persistedForkAttempts = (): unknown => {
  const raw = window.sessionStorage.getItem(FORK_ATTEMPT_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
};

describe('stageForkImport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('crypto', webcrypto);
    window.sessionStorage.clear();
    cloudMocks.fork.mockReset();
    cloudMocks.getCommit.mockReset();
    stageImport.mockReset();
    stageImport.mockResolvedValue('staged-import');
    let index = 0;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      index += 1;
      return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reuses its persisted server key after response loss and module reload', async () => {
    cloudMocks.fork
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce(forkResult());
    cloudMocks.getCommit.mockResolvedValue(commitResult());
    const first = await loadSubject();

    await expect(first.stageForkImport('source-1')).rejects.toThrow('response lost');
    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(persistedForkAttempts()).toEqual([{
      sourceProjectId: 'source-1',
      idempotencyKey: firstKey,
    }]);

    vi.resetModules();
    const reloaded = await loadSubject();
    await expect(reloaded.stageForkImport('source-1')).resolves.toBe('staged-import');

    expect(cloudMocks.fork).toHaveBeenCalledTimes(2);
    expect(firstKey).toMatch(/^fork_[0-9a-f-]{36}$/);
    expect(cloudMocks.fork.mock.calls[1]).toEqual(['source-1', firstKey]);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('replays fork after getCommit failure and uses the next account result', async () => {
    cloudMocks.fork
      .mockResolvedValueOnce(forkResult('source-1', 'account-a-'))
      .mockResolvedValueOnce(forkResult('source-1', 'account-b-'));
    cloudMocks.getCommit
      .mockRejectedValueOnce(new Error('commit response lost'))
      .mockResolvedValueOnce(commitResult('source-1', 'account-b-'));
    const first = await loadSubject();

    await expect(first.stageForkImport('source-1')).rejects.toThrow('commit response lost');
    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(persistedForkAttempts()).toEqual([{
      sourceProjectId: 'source-1',
      idempotencyKey: firstKey,
    }]);
    expect(JSON.stringify(persistedForkAttempts())).not.toContain('account-a-');

    vi.resetModules();
    const reloaded = await loadSubject();
    await expect(reloaded.stageForkImport('source-1')).resolves.toBe('staged-import');

    expect(cloudMocks.fork).toHaveBeenCalledTimes(2);
    expect(cloudMocks.fork.mock.calls[1]).toEqual(['source-1', firstKey]);
    expect(cloudMocks.getCommit).toHaveBeenCalledTimes(2);
    expect(cloudMocks.getCommit.mock.calls[0]).toEqual([
      'account-a-fork-of-source-1',
      'account-a-head-of-source-1',
    ]);
    expect(cloudMocks.getCommit.mock.calls[1]).toEqual([
      'account-b-fork-of-source-1',
      'account-b-head-of-source-1',
    ]);
    expect(stageImport).toHaveBeenCalledWith(
      {
        name: 'account-b-Fork of source-1',
        state: { secretDocumentText: 'account-b-state-for-source-1' },
        cloud: {
          projectId: 'account-b-fork-of-source-1',
          lastSyncedCommitId: 'account-b-head-of-source-1',
        },
      },
      {
        sourceKey: `gallery-fork:source-1:${firstKey}`,
        replaceRetainedForkAttempt: true,
      },
    );
  });

  it('replays fork after ambiguous staging and uses the next account result', async () => {
    cloudMocks.fork
      .mockResolvedValueOnce(forkResult('source-1', 'account-a-'))
      .mockResolvedValueOnce(forkResult('source-1', 'account-b-'));
    cloudMocks.getCommit
      .mockResolvedValueOnce(commitResult('source-1', 'account-a-'))
      .mockResolvedValueOnce(commitResult('source-1', 'account-b-'));
    stageImport
      .mockRejectedValueOnce(new Error('post-commit readback failed'))
      .mockResolvedValueOnce('reconciled-import');
    const first = await loadSubject();

    await expect(first.stageForkImport('source-1')).rejects.toThrow('post-commit readback failed');
    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(persistedForkAttempts()).toEqual([{
      sourceProjectId: 'source-1',
      idempotencyKey: firstKey,
    }]);
    expect(JSON.stringify(persistedForkAttempts())).not.toContain('account-a-');

    vi.resetModules();
    const reloaded = await loadSubject();
    await expect(reloaded.stageForkImport('source-1')).resolves.toBe('reconciled-import');

    expect(cloudMocks.fork).toHaveBeenCalledTimes(2);
    expect(cloudMocks.fork.mock.calls[1]).toEqual(['source-1', firstKey]);
    expect(cloudMocks.getCommit).toHaveBeenCalledTimes(2);
    expect(stageImport).toHaveBeenCalledTimes(2);
    expect(stageImport.mock.calls[1]).toEqual([
      {
        name: 'account-b-Fork of source-1',
        state: { secretDocumentText: 'account-b-state-for-source-1' },
        cloud: {
          projectId: 'account-b-fork-of-source-1',
          lastSyncedCommitId: 'account-b-head-of-source-1',
        },
      },
      {
        sourceKey: `gallery-fork:source-1:${firstKey}`,
        replaceRetainedForkAttempt: true,
      },
    ]);
    expect(stageImport.mock.calls[1]).not.toEqual(stageImport.mock.calls[0]);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('retains an anonymous 401 attempt for retry after sign-in', async () => {
    cloudMocks.fork
      .mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      .mockResolvedValueOnce(forkResult());
    cloudMocks.getCommit.mockResolvedValue(commitResult());
    const anonymous = await loadSubject();

    await expect(anonymous.stageForkImport('source-1')).rejects.toThrow('Unauthorized');
    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(persistedForkAttempts()).toEqual([{
      sourceProjectId: 'source-1',
      idempotencyKey: firstKey,
    }]);

    vi.resetModules();
    const signedIn = await loadSubject();
    await expect(signedIn.stageForkImport('source-1')).resolves.toBe('staged-import');

    expect(cloudMocks.fork.mock.calls[1]).toEqual(['source-1', firstKey]);
    expect(cloudMocks.getCommit).toHaveBeenCalledWith(
      'fork-of-source-1',
      'head-of-source-1',
    );
    expect(window.sessionStorage.length).toBe(0);
  });

  it('discards malformed old attempts containing returned result metadata', async () => {
    const oldKey = 'fork_00000000-0000-4000-8000-000000000099';
    window.sessionStorage.setItem(FORK_ATTEMPT_STORAGE_KEY, JSON.stringify([{
      sourceProjectId: 'source-1',
      idempotencyKey: oldKey,
      result: {
        projectId: 'account-a-private-project',
        name: 'Account A private fork',
        headCommitId: 'account-a-private-commit',
      },
    }]));
    cloudMocks.fork.mockImplementation(async (sourceProjectId: string, idempotencyKey: string) => {
      expect(persistedForkAttempts()).toEqual([{ sourceProjectId, idempotencyKey }]);
      return forkResult(sourceProjectId, 'account-b-');
    });
    cloudMocks.getCommit.mockResolvedValue(commitResult('source-1', 'account-b-'));
    const subject = await loadSubject();

    await expect(subject.stageForkImport('source-1')).resolves.toBe('staged-import');

    expect(cloudMocks.fork).toHaveBeenCalledOnce();
    expect(cloudMocks.fork.mock.calls[0][1]).not.toBe(oldKey);
    expect(cloudMocks.getCommit).toHaveBeenCalledWith(
      'account-b-fork-of-source-1',
      'account-b-head-of-source-1',
    );
  });

  it('retains its compact attempt when a fresh fork response is malformed', async () => {
    cloudMocks.fork.mockResolvedValue({
      project: { id: '', name: 'Incomplete fork', headCommitId: '' },
    });
    const subject = await loadSubject();

    await expect(subject.stageForkImport('source-1'))
      .rejects.toThrow('Fork response did not include durable project metadata.');

    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(persistedForkAttempts()).toEqual([{
      sourceProjectId: 'source-1',
      idempotencyKey: firstKey,
    }]);
    expect(cloudMocks.getCommit).not.toHaveBeenCalled();
    expect(stageImport).not.toHaveBeenCalled();
  });

  it('retains independent keys for multiple failed sources', async () => {
    cloudMocks.fork.mockRejectedValue(new Error('response lost'));
    const first = await loadSubject();

    await expect(first.stageForkImport('source-a')).rejects.toThrow('response lost');
    await expect(first.stageForkImport('source-b')).rejects.toThrow('response lost');
    const sourceAKey = cloudMocks.fork.mock.calls[0][1];
    const sourceBKey = cloudMocks.fork.mock.calls[1][1];
    expect(sourceAKey).not.toBe(sourceBKey);
    expect(persistedForkAttempts()).toEqual([
      { sourceProjectId: 'source-a', idempotencyKey: sourceAKey },
      { sourceProjectId: 'source-b', idempotencyKey: sourceBKey },
    ]);

    cloudMocks.fork.mockImplementation(async (sourceProjectId: string) => forkResult(sourceProjectId));
    cloudMocks.getCommit.mockImplementation(async (projectId: string) => (
      commitResult(projectId.replace('fork-of-', ''))
    ));
    vi.resetModules();
    const reloaded = await loadSubject();
    await reloaded.stageForkImport('source-a');
    await reloaded.stageForkImport('source-b');

    expect(cloudMocks.fork.mock.calls[2]).toEqual(['source-a', sourceAKey]);
    expect(cloudMocks.fork.mock.calls[3]).toEqual(['source-b', sourceBKey]);
  });

  it('gives concurrent calls for one source the same server key', async () => {
    const forked = deferred<ReturnType<typeof forkResult>>();
    cloudMocks.fork.mockReturnValue(forked.promise);
    cloudMocks.getCommit.mockResolvedValue(commitResult());
    const subject = await loadSubject();

    const calls = Promise.all([
      subject.stageForkImport('source-1'),
      subject.stageForkImport('source-1'),
    ]);

    await vi.waitFor(() => expect(cloudMocks.fork).toHaveBeenCalledTimes(2));
    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(persistedForkAttempts()).toEqual([{
      sourceProjectId: 'source-1',
      idempotencyKey: firstKey,
    }]);
    forked.resolve(forkResult());

    await expect(calls).resolves.toEqual(['staged-import', 'staged-import']);

    expect(cloudMocks.fork.mock.calls[0][1]).toBe(cloudMocks.fork.mock.calls[1][1]);
    expect(cloudMocks.getCommit).toHaveBeenCalledTimes(2);
    expect(stageImport).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.length).toBe(0);
  });
});
