import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceBootstrapGate } from '../../components/workspace/WorkspaceBootstrapGate';
import { trackEvent } from '../../services/analytics';
import { createLocalWorkspaceStore } from '../../services/localWorkspace/LocalWorkspaceStore';
import type {
  LocalWorkspaceStore,
  WorkspaceSnapshot,
} from '../../services/localWorkspace/contracts';
import { createIndexedDbAdapter } from '../../services/localWorkspace/indexedDbAdapter';
import type { LocalWorkspaceEnvironment } from '../../services/localWorkspace/LocalWorkspaceStore';
import {
  currentState,
  memoryStorage,
} from '../helpers/localWorkspaceFixtures';

const cloudMocks = vi.hoisted(() => ({
  fork: vi.fn(),
  getCommit: vi.fn(),
}));

const workspaceStore = vi.hoisted(() => {
  const state: { current: LocalWorkspaceStore | null } = { current: null };
  const requireStore = (): LocalWorkspaceStore => {
    if (!state.current) throw new Error('Real workspace store is not installed.');
    return state.current;
  };
  return {
    state,
    proxy: {
      bootstrap: vi.fn((...args: Parameters<LocalWorkspaceStore['bootstrap']>) =>
        requireStore().bootstrap(...args)),
      commit: vi.fn((...args: Parameters<LocalWorkspaceStore['commit']>) =>
        requireStore().commit(...args)),
      exportRecoveryBundle: vi.fn((...args: Parameters<LocalWorkspaceStore['exportRecoveryBundle']>) =>
        requireStore().exportRecoveryBundle(...args)),
    } satisfies LocalWorkspaceStore,
  };
});

const analyticsMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/cloudApi', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/cloudApi')>();
  return {
    ...original,
    cloudApi: {
      ...original.cloudApi,
      fork: cloudMocks.fork,
      getCommit: cloudMocks.getCommit,
    },
  };
});

vi.mock('../../services/localWorkspace/index', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/localWorkspace/index')>(),
  localWorkspaceStore: workspaceStore.proxy,
}));

vi.mock('../../services/analytics', () => ({ trackEvent: analyticsMock }));

const READ_ALL_SCOPE = ['projects', 'workspace', 'presets', 'pendingImports'];

const sameStores = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && expected.every(store => actual.includes(store));

const instrumentPostCommandReadFailure = (indexedDB: IDBFactory) => {
  const originalOpen = indexedDB.open.bind(indexedDB);
  const patched = new WeakSet<IDBDatabase>();
  let armed = false;
  indexedDB.open = ((name: string, version?: number) => {
    const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
    request.addEventListener('success', () => {
      const database = request.result;
      if (patched.has(database)) return;
      patched.add(database);
      const originalTransaction = database.transaction.bind(database);
      database.transaction = ((
        storeNames: string | string[],
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) => {
        const stores = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
        if (armed && mode === 'readonly' && sameStores(stores, READ_ALL_SCOPE)) {
          armed = false;
          throw new Error('Injected post-stage readback loss.');
        }
        return originalTransaction(storeNames, mode, options);
      }) as IDBDatabase['transaction'];
    });
    return request;
  }) as IDBFactory['open'];
  return { arm: () => { armed = true; } };
};

const environmentFor = (indexedDB: IDBFactory): LocalWorkspaceEnvironment => {
  return {
    indexedDB,
    legacyStorage: memoryStorage({}),
    addStorageListener: () => () => {},
    crypto: webcrypto as unknown as Crypto,
    now: () => '2026-08-17T18:00:00.000Z',
    randomUUID: () => 'fixture-uuid',
    createBlankProject: currentState,
  };
};

const inspect = async (indexedDB: IDBFactory) => {
  const adapter = createIndexedDbAdapter({
    indexedDB,
    now: () => '2026-08-17T18:00:00.000Z',
    crypto: webcrypto as unknown as Crypto,
  });
  try {
    await adapter.open();
    return await adapter.inspect();
  } finally {
    adapter.close();
  }
};

const sessionText = (): string => Array.from(
  { length: window.sessionStorage.length },
  (_, index) => window.sessionStorage.getItem(window.sessionStorage.key(index) ?? ''),
).join('\n');

const blobText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
  reader.addEventListener('error', () => reject(reader.error), { once: true });
  reader.readAsText(blob);
});

describe('fork import ownership replacement', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    window.localStorage.clear();
    window.sessionStorage.clear();
    cloudMocks.fork.mockReset();
    cloudMocks.getCommit.mockReset();
    analyticsMock.mockReset();
    workspaceStore.proxy.bootstrap.mockClear();
    workspaceStore.proxy.commit.mockClear();
    workspaceStore.proxy.exportRecoveryBundle.mockClear();
    let id = 0;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      id += 1;
      return `00000000-0000-4000-8000-${String(id).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
    });
  });

  afterEach(() => {
    cleanup();
    workspaceStore.state.current = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('supersedes an ambiguously committed A import before consuming B once', async () => {
    const indexedDB = new IDBFactory();
    const readback = instrumentPostCommandReadFailure(indexedDB);
    const environment = environmentFor(indexedDB);
    const accountAStore = createLocalWorkspaceStore(environment);
    workspaceStore.state.current = accountAStore;
    const initial = await accountAStore.bootstrap();
    if (initial.status !== 'ready') throw new Error(JSON.stringify(initial));
    await expect(workspaceStore.proxy.bootstrap()).resolves.toMatchObject({ status: 'ready' });
    cloudMocks.fork
      .mockResolvedValueOnce({
        project: {
          id: 'account-a-private-project',
          name: 'Account A private fork',
          headCommitId: 'account-a-private-commit',
        },
      })
      .mockResolvedValueOnce({
        project: {
          id: 'account-b-private-project',
          name: 'Account B private fork',
          headCommitId: 'account-b-private-commit',
        },
      });
    cloudMocks.getCommit
      .mockResolvedValueOnce({
        id: 'account-a-private-commit',
        message: 'Fork',
        createdAt: '2026-08-17T18:00:00.000Z',
        state: { ...currentState(), accountDocument: 'A private document' },
      })
      .mockResolvedValueOnce({
        id: 'account-b-private-commit',
        message: 'Fork',
        createdAt: '2026-08-17T18:01:00.000Z',
        state: { ...currentState(), accountDocument: 'B private document' },
      });
    const accountA = await import('../../services/forkProject');
    readback.arm();

    await expect(accountA.stageForkImport('gallery-source'))
      .rejects.toMatchObject({ code: 'io' });

    const afterA = await inspect(indexedDB);
    const pendingA = afterA.pendingImports.find(record =>
      record.pendingImport.cloud?.projectId === 'account-a-private-project');
    expect(pendingA).toBeDefined();
    expect(sessionText()).toContain('gallery-fork:gallery-source:fork_');
    expect(sessionText()).not.toContain('account-a-private-project');
    expect(sessionText()).not.toContain('account-a-private-commit');
    expect(sessionText()).not.toContain('Account A private fork');
    expect(sessionText()).not.toContain('A private document');

    vi.resetModules();
    const accountBStore = createLocalWorkspaceStore(environment);
    workspaceStore.state.current = accountBStore;
    await accountBStore.bootstrap();
    const accountB = await import('../../services/forkProject');
    await expect(accountB.stageForkImport('gallery-source')).resolves.toMatch(/^import_/);

    const afterB = await inspect(indexedDB);
    const forkPending = afterB.pendingImports.filter(record =>
      record.pendingImport.cloud?.projectId?.includes('account-'));
    expect(forkPending).toHaveLength(1);
    expect(forkPending[0].pendingImport).toMatchObject({
      name: 'Account B private fork',
      cloud: {
        projectId: 'account-b-private-project',
        lastSyncedCommitId: 'account-b-private-commit',
      },
    });
    expect(JSON.stringify(afterB.pendingImports)).not.toContain('account-a-private-project');
    expect(JSON.stringify(afterB.pendingImports)).not.toContain('account-a-private-commit');
    expect(window.sessionStorage.length).toBe(0);
    const bImportId = forkPending[0].id;
    const bTargetId = forkPending[0].pendingImport.targetProjectId;

    render(
      <WorkspaceBootstrapGate
        store={workspaceStore.proxy}
        renderEditor={({ initialWorkspace }: { initialWorkspace: WorkspaceSnapshot }) => (
          <div data-testid="editor-project">{initialWorkspace.activeProjectId}</div>
        )}
      />,
    );

    expect(await screen.findByTestId('editor-project')).toHaveTextContent(bTargetId);
    const consumeCommands = workspaceStore.proxy.commit.mock.calls
      .map(([command]) => command)
      .filter(command => command.type === 'consume-import');
    expect(consumeCommands).toEqual([{ type: 'consume-import', importId: bImportId }]);
    await waitFor(() => expect(trackEvent).toHaveBeenCalledOnce());
    expect(trackEvent).toHaveBeenCalledWith('project_imported_from_gallery');

    const consumed = await inspect(indexedDB);
    expect(consumed.pendingImports).toHaveLength(0);
    expect(consumed.projects.filter(record =>
      record.project.cloud?.projectId === 'account-b-private-project')).toHaveLength(1);
    expect(JSON.stringify(consumed)).not.toContain('account-a-private-project');
    expect(JSON.stringify(consumed)).not.toContain('account-a-private-commit');
    const publicProject = consumed.projects.find(record => record.id === bTargetId)!.project;
    expect(Object.hasOwn(publicProject, 'consumedImportAttempt')).toBe(false);

    const recovery = await accountBStore.exportRecoveryBundle('indexeddb-workspace');
    const recoveryText = await blobText(recovery);
    expect(recoveryText).not.toContain('attemptProvenance');
    expect(recoveryText).not.toContain('consumedImportAttempt');
    expect(recoveryText).not.toContain('account-a-private-project');
  });
});
