import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cloudMocks = vi.hoisted(() => ({
  fork: vi.fn(),
  getCommit: vi.fn(),
}));

const stageImport = vi.hoisted(() => vi.fn());

vi.mock('../../services/cloudApi', () => ({
  cloudApi: cloudMocks,
}));

vi.mock('../../services/importProject', () => ({
  stageImport,
}));

const forkResult = (sourceProjectId = 'source-1') => ({
  project: {
    id: `fork-of-${sourceProjectId}`,
    name: `Fork of ${sourceProjectId}`,
    headCommitId: `head-of-${sourceProjectId}`,
  },
});

const commitResult = (sourceProjectId = 'source-1') => ({
  id: `head-of-${sourceProjectId}`,
  message: 'Fork',
  createdAt: '2026-08-15T12:00:00.000Z',
  state: { secretDocumentText: `state-for-${sourceProjectId}` },
});

const loadSubject = async () => import('../../services/forkProject');

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
    const retained = Object.values(window.sessionStorage).join('\n');
    expect(retained).not.toContain('secretDocumentText');
    expect(retained).not.toContain('state-for-source-1');

    vi.resetModules();
    const reloaded = await loadSubject();
    await expect(reloaded.stageForkImport('source-1')).resolves.toBe('staged-import');

    expect(cloudMocks.fork).toHaveBeenCalledTimes(2);
    const firstKey = cloudMocks.fork.mock.calls[0][1];
    expect(firstKey).toMatch(/^fork_[0-9a-f-]{36}$/);
    expect(cloudMocks.fork.mock.calls[1]).toEqual(['source-1', firstKey]);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('persists returned fork IDs before getCommit and reuses them after reload', async () => {
    cloudMocks.fork.mockResolvedValue(forkResult());
    cloudMocks.getCommit
      .mockImplementationOnce(async (projectId: string, commitId: string) => {
        const retained = Object.values(window.sessionStorage).join('\n');
        expect(retained).toContain(projectId);
        expect(retained).toContain(commitId);
        expect(retained).toContain('Fork of source-1');
        throw new Error('commit response lost');
      })
      .mockResolvedValueOnce(commitResult());
    const first = await loadSubject();

    await expect(first.stageForkImport('source-1')).rejects.toThrow('commit response lost');
    vi.resetModules();
    const reloaded = await loadSubject();
    await expect(reloaded.stageForkImport('source-1')).resolves.toBe('staged-import');

    expect(cloudMocks.fork).toHaveBeenCalledOnce();
    expect(cloudMocks.getCommit).toHaveBeenCalledTimes(2);
    expect(cloudMocks.getCommit.mock.calls[1]).toEqual(cloudMocks.getCommit.mock.calls[0]);
  });

  it('keeps compact fork metadata when staging is ambiguous without storing document state', async () => {
    cloudMocks.fork.mockResolvedValue(forkResult());
    cloudMocks.getCommit.mockResolvedValue(commitResult());
    stageImport
      .mockRejectedValueOnce(new Error('post-commit readback failed'))
      .mockResolvedValueOnce('reconciled-import');
    const first = await loadSubject();

    await expect(first.stageForkImport('source-1')).rejects.toThrow('post-commit readback failed');
    const retained = Object.values(window.sessionStorage).join('\n');
    expect(retained).toContain('fork-of-source-1');
    expect(retained).not.toContain('secretDocumentText');
    expect(retained).not.toContain('state-for-source-1');

    vi.resetModules();
    const reloaded = await loadSubject();
    await expect(reloaded.stageForkImport('source-1')).resolves.toBe('reconciled-import');

    expect(cloudMocks.fork).toHaveBeenCalledOnce();
    expect(cloudMocks.getCommit).toHaveBeenCalledTimes(2);
    expect(stageImport).toHaveBeenCalledTimes(2);
    expect(stageImport.mock.calls[1]).toEqual(stageImport.mock.calls[0]);
  });

  it('retains independent keys for multiple failed sources', async () => {
    cloudMocks.fork.mockRejectedValue(new Error('response lost'));
    const first = await loadSubject();

    await expect(first.stageForkImport('source-a')).rejects.toThrow('response lost');
    await expect(first.stageForkImport('source-b')).rejects.toThrow('response lost');
    const sourceAKey = cloudMocks.fork.mock.calls[0][1];
    const sourceBKey = cloudMocks.fork.mock.calls[1][1];
    expect(sourceAKey).not.toBe(sourceBKey);

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
    cloudMocks.fork.mockResolvedValue(forkResult());
    cloudMocks.getCommit.mockResolvedValue(commitResult());
    const subject = await loadSubject();

    await expect(Promise.all([
      subject.stageForkImport('source-1'),
      subject.stageForkImport('source-1'),
    ])).resolves.toEqual(['staged-import', 'staged-import']);

    expect(cloudMocks.fork).toHaveBeenCalledTimes(2);
    expect(cloudMocks.fork.mock.calls[0][1]).toBe(cloudMocks.fork.mock.calls[1][1]);
  });
});
