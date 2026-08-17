import React from 'react';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../types';
import {
  createLocalWorkspaceStore,
  type LocalWorkspaceEnvironment,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import { createIndexedDbAdapter } from '../../services/localWorkspace/indexedDbAdapter';
import { inheritInstalledProjectAuthority } from '../../services/localWorkspace/projectAuthority';
import { createBlankProject } from '../../services/presets';
import { useWorkspaceProjectWrites } from '../../hooks/useWorkspaceProjectWrites';
import {
  LEGACY_KEYS,
  memoryStorage,
  validLegacyValues,
} from '../helpers/localWorkspaceFixtures';

vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../components/Sidebar', () => ({
  Sidebar: ({ state, onUpdateNode }: {
    state: AppState;
    onUpdateNode: (id: string, updates: Partial<AppState['nodes'][string]>) => void;
  }) => (
    <div>
      <pre data-testid="editor-state">{JSON.stringify(state)}</pre>
      <button
        type="button"
        onClick={() => onUpdateNode(state.rootId, {
          data: { ...state.nodes[state.rootId].data, locallyEdited: 'yes' },
        })}
      >
        Edit document
      </button>
    </div>
  ),
}));
vi.mock('../../components/Canvas', () => ({ Canvas: () => <div /> }));
vi.mock('../../components/PropertiesPanel', () => ({ PropertiesPanel: () => <div /> }));
vi.mock('../../components/LayersPanel', () => ({ LayersPanel: () => <div /> }));
vi.mock('../../components/CollapsibleSection', () => ({ CollapsibleSection: () => <div /> }));
vi.mock('../../components/JsonModal', () => ({ JsonModal: () => null }));
vi.mock('../../components/NodeSelectorModal', () => ({ NodeSelectorModal: () => null }));
vi.mock('../../components/DeleteConfirmModal', () => ({ DeleteConfirmModal: () => null }));
vi.mock('../../components/HierarchyGeneratorModal', () => ({ HierarchyGeneratorModal: () => null }));
vi.mock('../../components/SavePresetModal', () => ({ SavePresetModal: () => null }));
vi.mock('../../components/NewVariantModal', () => ({ NewVariantModal: () => null }));
vi.mock('../../components/EditorToolbar', () => ({ EditorToolbar: () => null }));
vi.mock('../../components/TabBar', () => ({
  TabBar: ({ projects, onClose }: {
    projects: WorkspaceProject[];
    onClose: (projectId: string) => void;
  }) => (
    <div>
      {projects.map(item => (
        <button key={item.id} type="button" onClick={() => onClose(item.id)}>
          Close {item.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../../components/NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../../components/CloseProjectConfirmModal', () => ({
  CloseProjectConfirmModal: ({ isOpen, onConfirmClose }: {
    isOpen: boolean;
    onConfirmClose: () => void;
  }) => isOpen ? (
    <button type="button" onClick={onConfirmClose}>Confirm close</button>
  ) : null,
}));
vi.mock('../../components/AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('../../components/cloud/CloudMenu', () => ({
  CloudMenu: ({ project, onRestoreState }: {
    project: WorkspaceProject;
    onRestoreState: (state: AppState) => Promise<boolean>;
  }) => (
    <button
      type="button"
      onClick={() => { void onRestoreState({ ...project.initialState, scale: 1.25 }); }}
    >
      Restore project
    </button>
  ),
}));
vi.mock('../../services/browserDownload', () => ({ downloadJson: vi.fn(), downloadBlob: vi.fn() }));

import { ProjectEditor } from '../../components/ProjectEditor';
import { EditorPage } from '../../pages/EditorPage';

afterEach(() => vi.restoreAllMocks());

const markedState = (title: string, marker: string): AppState => {
  const state = createBlankProject();
  const markerId = `${marker}-only`;
  state.nodes[state.rootId] = {
    ...state.nodes[state.rootId],
    title,
    children: [markerId],
  };
  state.nodes[markerId] = {
    id: markerId,
    parentId: state.rootId,
    type: state.nodes[state.rootId].type,
    title: `${marker} nested bytes`,
    data: { authority: marker },
    children: [],
  };
  return state;
};

const editorProps = (
  initialState: AppState,
  overrides: Partial<React.ComponentProps<typeof ProjectEditor>> = {},
): React.ComponentProps<typeof ProjectEditor> => ({
  projectId: 'project-a',
  projectName: 'Project A',
  initialState,
  isActive: true,
  onNameChange: vi.fn(),
  onStateChange: vi.fn(),
  onCreateGeneratedProject: vi.fn(async () => true),
  onSaveCustomPreset: vi.fn(async () => true),
  ...overrides,
});

const readOnlyEditorState = (container: HTMLElement = document.body): AppState => {
  const output = within(container).getByTestId('editor-state');
  return JSON.parse(output.textContent || '{}');
};

describe('ProjectEditor authority remount semantics', () => {
  it('edits from changed authority after an internal-lineage remount', async () => {
    const stale = markedState('Stale A', 'stale-a');
    const foreign = markedState('Foreign A', 'foreign-a');
    const onStateChange = vi.fn();
    const props = editorProps(stale, { onStateChange });
    const view = render(<ProjectEditor {...props} />);

    expect(onStateChange).not.toHaveBeenCalled();
    view.rerender(<ProjectEditor key="foreign-authority" {...props} initialState={foreign} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    const edited = onStateChange.mock.calls[0][0] as AppState;
    expect(edited.nodes['foreign-a-only']).toMatchObject({
      title: 'foreign-a nested bytes',
      data: { authority: 'foreign-a' },
    });
    expect(edited.nodes['stale-a-only']).toBeUndefined();
    expect(edited.nodes[edited.rootId].data.locallyEdited).toBe('yes');
  });

  it('treats an equal cloned readback as a no-op without echoing or clearing history', async () => {
    const initial = markedState('Original', 'original');
    const onNameChange = vi.fn();
    const onStateChange = vi.fn();
    const props = editorProps(initial, { onNameChange, onStateChange });
    const view = render(<ProjectEditor {...props} />);

    expect(onStateChange).not.toHaveBeenCalled();
    expect(onNameChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    const local = readOnlyEditorState();

    view.rerender(<ProjectEditor {...props} initialState={structuredClone(local)} />);

    expect(onStateChange).toHaveBeenCalledOnce();
    expect(onNameChange).not.toHaveBeenCalled();
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
    fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
    await waitFor(() => expect(readOnlyEditorState().nodes[initial.rootId].data.locallyEdited).toBeUndefined());
  });

  it('resets stale history and suppresses authority state and root-title callbacks', async () => {
    const stale = markedState('Stale root', 'stale-a');
    const foreign = markedState('Foreign root', 'foreign-a');
    const onNameChange = vi.fn();
    const onStateChange = vi.fn();
    const props = editorProps(stale, { onNameChange, onStateChange });
    const view = render(<ProjectEditor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
    onNameChange.mockClear();
    onStateChange.mockClear();

    view.rerender(<ProjectEditor key="foreign-authority" {...props} initialState={foreign} />);

    await waitFor(() => expect(readOnlyEditorState().nodes['foreign-a-only']).toBeDefined());
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onNameChange).not.toHaveBeenCalled();
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(readOnlyEditorState().nodes['stale-a-only']).toBeUndefined();
  });

  it('adopts while hidden so activation cannot expose stale editable bytes', async () => {
    const stale = markedState('Hidden stale', 'stale-a');
    const foreign = markedState('Hidden foreign', 'foreign-a');
    const onStateChange = vi.fn();
    const props = editorProps(stale, { isActive: false, onStateChange });
    const view = render(<ProjectEditor {...props} />);

    view.rerender(<ProjectEditor key="foreign-authority" {...props} initialState={foreign} />);
    await waitFor(() => expect(readOnlyEditorState().nodes['foreign-a-only']).toBeDefined());
    view.rerender(<ProjectEditor {...props} initialState={structuredClone(foreign)} isActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    const edited = onStateChange.mock.calls[0][0] as AppState;
    expect(edited.nodes['foreign-a-only']).toBeDefined();
    expect(edited.nodes['stale-a-only']).toBeUndefined();
  });
});

const project = (id: string, name: string, initialState: AppState): WorkspaceProject => ({
  id,
  name,
  initialState,
  revision: 0,
});

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
};

const sameStores = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && expected.every(store => actual.includes(store));

const invokeListener = (
  listener: EventListenerOrEventListenerObject,
  event: Event,
): void => {
  if (typeof listener === 'function') listener(event);
  else listener.handleEvent(event);
};

const transactionCompletionHold = (scope: readonly string[]) => {
  const started = deferred();
  const committed = deferred();
  const release = deferred();
  let armed = false;
  let held = false;
  return {
    started: started.promise,
    committed: committed.promise,
    release: release.resolve,
    arm: () => { armed = true; },
    hook(stores: string[], mode: IDBTransactionMode, transaction: IDBTransaction) {
      if (!armed || held || mode !== 'readwrite' || !sameStores(stores, scope)) return;
      held = true;
      const addEventListener = transaction.addEventListener.bind(transaction);
      transaction.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type !== 'complete') return addEventListener(type, listener, options);
        return addEventListener(type, event => {
          committed.resolve();
          void release.promise.then(() => invokeListener(listener, event));
        }, options);
      }) as IDBTransaction['addEventListener'];
      started.resolve();
    },
  };
};

const instrumentFactory = (
  indexedDB: IDBFactory,
  hook: (stores: string[], mode: IDBTransactionMode, transaction: IDBTransaction) => void,
): void => {
  const originalOpen = indexedDB.open.bind(indexedDB);
  const patched = new WeakSet<IDBDatabase>();
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
        const transaction = originalTransaction(storeNames, mode, options);
        const stores = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
        hook(stores, mode ?? 'readonly', transaction);
        return transaction;
      }) as IDBDatabase['transaction'];
    });
    return request;
  }) as IDBFactory['open'];
};

const paneContaining = (nodeId: string): HTMLElement => {
  const pane = screen.getAllByTestId('project-pane').find(candidate => (
    readOnlyEditorState(candidate).nodes[nodeId] !== undefined
  ));
  if (!pane) throw new Error(`No project pane contains ${nodeId}.`);
  return pane;
};

describe('EditorPage project authority lineage', () => {
  it('rejects a stale A edit batched with B readback adopting foreign A', async () => {
    const staleA = project('project-a', 'Project A', markedState('Stale A', 'stale-a'));
    const initialB = project('project-b', 'Project B', markedState('Initial B', 'initial-b'));
    const foreignState = markedState('Foreign A', 'foreign-a');
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const indexedDB = new IDBFactory();
    instrumentFactory(indexedDB, hold.hook);
    const environment: LocalWorkspaceEnvironment = {
      indexedDB,
      legacyStorage: memoryStorage(validLegacyValues({
        [LEGACY_KEYS.projects]: JSON.stringify([staleA, initialB]),
        [LEGACY_KEYS.activeProject]: 'project-b',
      })),
      addStorageListener: () => () => {},
      crypto: webcrypto as unknown as Crypto,
      now: () => '2026-08-16T19:00:00.000Z',
      randomUUID: () => 'authority-race-fixture',
      createBlankProject,
    };
    const store = createLocalWorkspaceStore(environment);
    const foreignStore = createLocalWorkspaceStore(environment);
    const initialResult = await store.bootstrap();
    const foreignResult = await foreignStore.bootstrap();
    expect(initialResult.status).toBe('ready');
    expect(foreignResult.status).toBe('ready');
    if (initialResult.status !== 'ready' || foreignResult.status !== 'ready') return;
    const commit = vi.spyOn(store, 'commit');
    const router = createMemoryRouter([{
      path: '/app',
      element: (
        <EditorPage
          store={store}
          initialWorkspace={initialResult.snapshot}
          initialWarnings={[]}
        />
      ),
    }], { initialEntries: ['/app'] });
    render(<RouterProvider router={router} />);
    const staleAPane = paneContaining('stale-a-only');
    const projectBPane = paneContaining('initial-b-only');
    const staleEdit = within(staleAPane).getByRole('button', { name: 'Edit document' });
    hold.arm();

    fireEvent.click(within(projectBPane).getByRole('button', { name: 'Edit document' }));
    const bCommit = commit.mock.results[0]?.value as Promise<WorkspaceSnapshot>;
    await hold.started;
    const foreignA = foreignResult.snapshot.projects.find(item => item.id === 'project-a');
    if (!foreignA) throw new Error('Foreign store did not bootstrap project A.');
    const foreignEdit = { ...foreignA, initialState: foreignState };
    inheritInstalledProjectAuthority(foreignEdit, foreignA);
    await foreignStore.commit({
      type: 'save-project',
      project: foreignEdit,
    });

    await act(async () => {
      hold.release();
      await bCommit;
      staleEdit.click();
    });
    expect(staleEdit).not.toBeInTheDocument();
    expect(readOnlyEditorState(paneContaining('foreign-a-only')).nodes['stale-a-only'])
      .toBeUndefined();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1_100));
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toMatchObject({
      type: 'save-project',
      project: { id: 'project-b' },
    });
    const inspector = createIndexedDbAdapter({ indexedDB, now: environment.now });
    await inspector.open();
    const durableA = (await inspector.inspect()).projects.find(item => item.id === 'project-a');
    inspector.close();
    expect(durableA?.storageRevision).toBe(1);
    expect(durableA?.project.initialState.nodes['foreign-a-only']).toBeDefined();
    expect(durableA?.project.initialState.nodes['stale-a-only']).toBeUndefined();
    expect(durableA?.project.initialState.nodes[foreignState.rootId].data.locallyEdited).toBeUndefined();
  }, 15_000);

  it('rejects a stale close modal after same-id replacement readback', async () => {
    const staleA = project('project-a', 'Project A', markedState('Stale A', 'stale-a'));
    const initialB = project('project-b', 'Project B', markedState('Initial B', 'initial-b'));
    const replacementA = project(
      'project-a',
      'Replacement A',
      markedState('Replacement A', 'replacement-a'),
    );
    const hold = transactionCompletionHold(['projects', 'migrationLedger']);
    const indexedDB = new IDBFactory();
    instrumentFactory(indexedDB, hold.hook);
    let nextUuid = 0;
    const environment: LocalWorkspaceEnvironment = {
      indexedDB,
      legacyStorage: memoryStorage(validLegacyValues({
        [LEGACY_KEYS.projects]: JSON.stringify([staleA, initialB]),
        [LEGACY_KEYS.activeProject]: 'project-b',
      })),
      addStorageListener: () => () => {},
      crypto: webcrypto as unknown as Crypto,
      now: () => '2026-08-16T19:30:00.000Z',
      randomUUID: () => `stale-modal-${nextUuid++}`,
      createBlankProject,
    };
    const store = createLocalWorkspaceStore(environment);
    const foreignStore = createLocalWorkspaceStore(environment);
    const initialResult = await store.bootstrap();
    const foreignResult = await foreignStore.bootstrap();
    expect(initialResult.status).toBe('ready');
    expect(foreignResult.status).toBe('ready');
    if (initialResult.status !== 'ready' || foreignResult.status !== 'ready') return;
    const commit = vi.spyOn(store, 'commit');
    const router = createMemoryRouter([{
      path: '/app',
      element: (
        <EditorPage
          store={store}
          initialWorkspace={initialResult.snapshot}
          initialWarnings={[]}
        />
      ),
    }], { initialEntries: ['/app'] });
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Project A' }));
    const staleConfirm = screen.getByRole('button', { name: 'Confirm close' });
    const projectBPane = paneContaining('initial-b-only');
    hold.arm();

    fireEvent.click(within(projectBPane).getByRole('button', { name: 'Edit document' }));
    const bCommit = commit.mock.results[0]?.value as Promise<WorkspaceSnapshot>;
    await hold.started;
    await hold.committed;
    await foreignStore.commit({ type: 'close-project', projectId: 'project-a' });
    await foreignStore.commit({ type: 'create-and-activate-project', project: replacementA });

    await act(async () => {
      hold.release();
      await bCommit;
      staleConfirm.click();
    });
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));

    const inspector = createIndexedDbAdapter({ indexedDB, now: environment.now });
    await inspector.open();
    const durableA = (await inspector.inspect()).projects.find(item => item.id === 'project-a');
    inspector.close();
    expect(durableA).toMatchObject({
      project: { name: 'Replacement A' },
      storageRevision: 0,
    });
    expect(durableA?.project.initialState.nodes['replacement-a-only']).toBeDefined();
  }, 20_000);

  it('keeps history for an own save but public restore still remounts the editor', async () => {
    const source = project('project-a', 'Project A', markedState('Project A', 'source-a'));
    const indexedDB = new IDBFactory();
    const environment: LocalWorkspaceEnvironment = {
      indexedDB,
      legacyStorage: memoryStorage(validLegacyValues({
        [LEGACY_KEYS.projects]: JSON.stringify([source]),
        [LEGACY_KEYS.activeProject]: 'project-a',
      })),
      addStorageListener: () => () => {},
      crypto: webcrypto as unknown as Crypto,
      now: () => '2026-08-16T19:00:00.000Z',
      randomUUID: () => 'authority-history-fixture',
      createBlankProject,
    };
    const store = createLocalWorkspaceStore(environment);
    const initialResult = await store.bootstrap();
    expect(initialResult.status).toBe('ready');
    if (initialResult.status !== 'ready') return;
    const commit = vi.spyOn(store, 'commit');
    const router = createMemoryRouter([{
      path: '/app',
      element: (
        <EditorPage
          store={store}
          initialWorkspace={initialResult.snapshot}
          initialWarnings={[]}
        />
      ),
    }], { initialEntries: ['/app'] });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    const undoBeforeSave = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBeforeSave).toBeEnabled();
    await act(async () => {
      await (commit.mock.results[0].value as Promise<WorkspaceSnapshot>);
    });

    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBe(undoBeforeSave);
    expect(undoBeforeSave).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore project' }));
    await act(async () => {
      await (commit.mock.results[1].value as Promise<WorkspaceSnapshot>);
    });

    expect(screen.getByTitle('Undo (Ctrl+Z)')).not.toBe(undoBeforeSave);
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();
  }, 10_000);
});

describe('useWorkspaceProjectWrites real-store lineage handoff', () => {
  it('retries latest bytes after a local predecessor succeeds and its follow-up hits quota', async () => {
    const source = project('project-a', 'Original', markedState('Original', 'original'));
    const firstHold = transactionCompletionHold(['projects', 'migrationLedger']);
    const indexedDB = new IDBFactory();
    instrumentFactory(indexedDB, firstHold.hook);
    let failNextMutation = false;
    const environment: LocalWorkspaceEnvironment = {
      indexedDB,
      legacyStorage: memoryStorage(validLegacyValues({
        [LEGACY_KEYS.projects]: JSON.stringify([source]),
        [LEGACY_KEYS.activeProject]: source.id,
      })),
      addStorageListener: () => () => {},
      crypto: webcrypto as unknown as Crypto,
      now: () => '2026-08-16T21:00:00.000Z',
      randomUUID: () => 'surviving-lineage-retry',
      createBlankProject,
      fault(point) {
        if (point !== 'mutation.before-complete' || !failNextMutation) return;
        failNextMutation = false;
        throw new DOMException('Injected quota failure.', 'QuotaExceededError');
      },
    };
    const store = createLocalWorkspaceStore(environment);
    const initial = await store.bootstrap();
    expect(initial.status).toBe('ready');
    if (initial.status !== 'ready') return;
    const commit = vi.spyOn(store, 'commit');
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial.snapshot));
    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    firstHold.arm();

    act(() => {
      firstSave = result.current.updateProject(source.id, current => ({
        ...current,
        name: 'First',
      }));
    });
    await firstHold.started;
    await firstHold.committed;
    act(() => {
      secondSave = result.current.updateProject(source.id, current => ({
        ...current,
        name: 'Latest',
      }));
    });
    failNextMutation = true;

    await act(async () => {
      firstHold.release();
      expect(await firstSave).toBe(true);
      expect(await secondSave).toBe(false);
    });
    expect(result.current.workspace.projects[0].name).toBe('Latest');
    expect(result.current.saveStates.get(source.id)?.status).toBe('failed');

    act(() => result.current.retryProject(source.id));
    const retryCommit = commit.mock.results[2]?.value as Promise<WorkspaceSnapshot>;
    await act(async () => {
      await retryCommit;
      await Promise.resolve();
    });

    expect(result.current.saveStates.get(source.id)?.status).toBe('saved');
    const inspector = createIndexedDbAdapter({ indexedDB, now: environment.now });
    await inspector.open();
    const durable = (await inspector.inspect()).projects.find(item => item.id === source.id);
    inspector.close();
    expect(durable).toMatchObject({
      project: { name: 'Latest' },
      storageRevision: 2,
    });
  }, 20_000);

  it('admits a third edit while the exact I:1 follow-up is active', async () => {
    const source = project('project-a', 'Original', markedState('Original', 'original'));
    const firstHold = transactionCompletionHold(['projects', 'migrationLedger']);
    const secondHold = transactionCompletionHold(['projects', 'migrationLedger']);
    const indexedDB = new IDBFactory();
    instrumentFactory(indexedDB, (stores, mode, transaction) => {
      firstHold.hook(stores, mode, transaction);
      secondHold.hook(stores, mode, transaction);
    });
    const environment: LocalWorkspaceEnvironment = {
      indexedDB,
      legacyStorage: memoryStorage(validLegacyValues({
        [LEGACY_KEYS.projects]: JSON.stringify([source]),
        [LEGACY_KEYS.activeProject]: source.id,
      })),
      addStorageListener: () => () => {},
      crypto: webcrypto as unknown as Crypto,
      now: () => '2026-08-16T21:05:00.000Z',
      randomUUID: () => 'surviving-lineage-third-edit',
      createBlankProject,
    };
    const store = createLocalWorkspaceStore(environment);
    const initial = await store.bootstrap();
    expect(initial.status).toBe('ready');
    if (initial.status !== 'ready') return;
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial.snapshot));
    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    let thirdSave!: Promise<boolean>;
    firstHold.arm();

    act(() => {
      firstSave = result.current.updateProject(source.id, current => ({
        ...current,
        name: 'First',
      }));
    });
    await firstHold.started;
    await firstHold.committed;
    act(() => {
      secondSave = result.current.updateProject(source.id, current => ({
        ...current,
        name: 'Second',
      }));
    });
    secondHold.arm();
    await act(async () => {
      firstHold.release();
      expect(await firstSave).toBe(true);
    });
    await secondHold.started;
    await secondHold.committed;

    act(() => {
      thirdSave = result.current.updateProject(source.id, current => ({
        ...current,
        name: 'Third',
      }));
    });
    await act(async () => {
      secondHold.release();
      expect(await secondSave).toBe(true);
      expect(await thirdSave).toBe(true);
    });

    expect(result.current.saveStates.get(source.id)?.status).toBe('saved');
    const inspector = createIndexedDbAdapter({ indexedDB, now: environment.now });
    await inspector.open();
    const durable = (await inspector.inspect()).projects.find(item => item.id === source.id);
    inspector.close();
    expect(durable).toMatchObject({
      project: { name: 'Third' },
      storageRevision: 3,
    });
  }, 20_000);
});
