import React, { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceProjectWrites } from '../../hooks/useWorkspaceProjectWrites';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import {
  getInstalledProjectAuthorityLineage,
  registerInstalledProjectAuthority,
} from '../../services/localWorkspace/projectAuthority';
import type { ProjectLineage } from '../../services/localWorkspace/schema';
import { createBlankProject } from '../../services/presets';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const project = (name: string, scale = 1): WorkspaceProject => ({
  id: 'project-1',
  name,
  initialState: { ...createBlankProject(), scale },
});

const projectWithId = (id: string, name: string, scale = 1): WorkspaceProject => ({
  id,
  name,
  initialState: { ...createBlankProject(), scale },
});

const projectWithAuthority = (
  name: string,
  lineage: ProjectLineage,
  token: object,
): WorkspaceProject => {
  const value = project(name);
  registerInstalledProjectAuthority(value, lineage, token);
  return value;
};

const snapshot = (currentProject = project('Original')): WorkspaceSnapshot => ({
  projects: [currentProject],
  activeProjectId: currentProject.id,
  customPresets: [],
  pendingImports: [],
});

const storeWithCommit = (
  commit: LocalWorkspaceStore['commit'],
): LocalWorkspaceStore & { commit: ReturnType<typeof vi.fn> } => ({
  bootstrap: vi.fn(),
  commit: vi.fn(commit),
  exportRecoveryBundle: vi.fn(),
});

describe('useWorkspaceProjectWrites', () => {
  it('publishes the newest working workspace before its save settles', () => {
    const pending = new Promise<WorkspaceSnapshot>(() => {});
    const store = storeWithCommit(() => pending);
    const onWorkspaceChange = vi.fn();
    const { result } = renderHook(() => useWorkspaceProjectWrites(
      store,
      snapshot(),
      onWorkspaceChange,
    ));
    const working = project('Unsaved authority-loss copy', 13);

    act(() => { void result.current.updateProject('project-1', () => working); });

    expect(onWorkspaceChange).toHaveBeenLastCalledWith({
      ...snapshot(),
      projects: [working],
    });
  });

  it('publishes its visible workspace by identity so the gate owns the protected clone', () => {
    const pending = new Promise<WorkspaceSnapshot>(() => {});
    const store = storeWithCommit(() => pending);
    const onWorkspaceChange = vi.fn();
    const { result } = renderHook(() => useWorkspaceProjectWrites(
      store,
      snapshot(),
      onWorkspaceChange,
    ));
    const working = project('Single-copy publication', 14);

    act(() => { void result.current.updateProject('project-1', () => working); });

    const published = onWorkspaceChange.mock.calls.at(-1)?.[0];
    expect(published).toBe(result.current.workspace);
    expect(published.projects[0]).toBe(working);
  });

  it('publishes the initial visible workspace once under StrictMode without writing', () => {
    const initial = snapshot();
    const store = storeWithCommit(async () => initial);
    const onWorkspaceChange = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(
      () => useWorkspaceProjectWrites(store, initial, onWorkspaceChange),
      { wrapper },
    );

    expect(onWorkspaceChange).toHaveBeenCalledOnce();
    expect(onWorkspaceChange).toHaveBeenCalledWith(initial);
    expect(store.commit).not.toHaveBeenCalled();
  });

  it('renders initial state as saved without issuing a write, including StrictMode replay', () => {
    const store = storeWithCommit(async () => snapshot());
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const { result } = renderHook(
      () => useWorkspaceProjectWrites(store, snapshot()),
      { wrapper },
    );

    expect(result.current.workspace.projects[0].name).toBe('Original');
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
    expect(result.current.hasUnsavedWork).toBe(false);
    expect(store.commit).not.toHaveBeenCalled();
  });

  it('adopts unrelated authoritative project bytes from a save snapshot', async () => {
    const initial: WorkspaceSnapshot = {
      projects: [
        projectWithId('project-a', 'A stale'),
        projectWithId('project-b', 'B initial'),
      ],
      activeProjectId: 'project-b',
      customPresets: [],
      pendingImports: [],
    };
    const authoritativeA = projectWithId('project-a', 'A from another tab', 7);
    const savedB = projectWithId('project-b', 'B saved', 2);
    const store = storeWithCommit(async () => ({
      ...initial,
      projects: [authoritativeA, savedB],
    }));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));
    const initialAEpoch = result.current.authorityEpochs.get('project-a');
    const initialBEpoch = result.current.authorityEpochs.get('project-b');

    await act(async () => {
      await result.current.updateProject('project-b', () => savedB);
    });

    expect(result.current.workspace.projects).toEqual([authoritativeA, savedB]);
    expect(result.current.authorityEpochs.get('project-a')).toBeGreaterThan(initialAEpoch ?? -1);
    expect(result.current.authorityEpochs.get('project-b')).toBe(initialBEpoch);
    let updateBase: WorkspaceProject | undefined;
    act(() => {
      void result.current.updateProject('project-a', current => {
        updateBase = current;
        return { ...current, name: 'A edited locally' };
      });
    });
    expect(updateBase).toEqual(authoritativeA);
  });

  it('keeps the authority epoch for a current-generation own save readback', async () => {
    const store = storeWithCommit(async command => (
      command.type === 'save-project'
        ? snapshot(structuredClone(command.project))
        : snapshot()
    ));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const initialEpoch = result.current.authorityEpochs.get('project-1');

    await act(async () => {
      await result.current.updateProject('project-1', () => project('Saved', 2));
    });

    expect(result.current.authorityEpochs.get('project-1')).toBe(initialEpoch);
  });

  it('rejects an editor callback from an invalidated authority epoch', async () => {
    const store = storeWithCommit(async () => snapshot());
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const staleEpoch = result.current.authorityEpochs.get('project-1') ?? 0;

    await act(async () => {
      await result.current.updateProject(
        'project-1',
        () => project('Must not save', 9),
        staleEpoch + 1,
      );
    });

    expect(store.commit).not.toHaveBeenCalled();
    expect(result.current.workspace.projects[0].name).toBe('Original');
  });

  it('removes dead epochs and rejects a callback from before same-id re-add', async () => {
    const original = project('Original');
    const survivor = projectWithId('project-2', 'Survivor');
    const replacement = project('Replacement', 7);
    const initial = {
      ...snapshot(original),
      projects: [original, survivor],
    };
    let structuralCalls = 0;
    const store = storeWithCommit(async command => {
      if (command.type === 'save-project') {
        return { ...initial, projects: [replacement, survivor] };
      }
      structuralCalls += 1;
      return structuralCalls === 1
        ? { ...initial, projects: [survivor], activeProjectId: survivor.id }
        : { ...initial, projects: [replacement, survivor] };
    });
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));
    const staleEpoch = result.current.authorityEpochs.get(original.id) ?? 0;
    const staleCallback = () => result.current.updateProject(
      original.id,
      current => ({ ...current, name: 'Stale overwrite' }),
      staleEpoch,
    );

    await act(async () => {
      await result.current.commitStructural({ type: 'close-project', projectId: original.id });
    });
    const removedEpoch = result.current.authorityEpochs.get(original.id);
    await act(async () => {
      await result.current.commitStructural({
        type: 'create-and-activate-project',
        project: replacement,
      });
    });
    const replacementEpoch = result.current.authorityEpochs.get(original.id);
    let staleResult!: boolean;
    await act(async () => {
      staleResult = await staleCallback();
    });

    expect(removedEpoch).toBeUndefined();
    expect(replacementEpoch).toBeGreaterThan(staleEpoch);
    expect(staleResult).toBe(false);
    expect(store.commit).toHaveBeenCalledTimes(2);
    expect(result.current.workspace.projects.find(item => item.id === original.id)?.name)
      .toBe('Replacement');
  });

  it('keeps globally increasing epochs in a map bounded to live projects', async () => {
    const survivor = projectWithId('survivor', 'Survivor');
    let currentProject = projectWithId('project-0', 'Project 0');
    let durable: WorkspaceSnapshot = {
      ...snapshot(survivor),
      projects: [survivor, currentProject],
    };
    const store = storeWithCommit(async command => {
      if (command.type === 'close-project') {
        durable = {
          ...durable,
          projects: durable.projects.filter(item => item.id !== command.projectId),
          activeProjectId: survivor.id,
        };
      } else if (command.type === 'create-and-activate-project') {
        durable = {
          ...durable,
          projects: [...durable.projects, command.project],
          activeProjectId: command.project.id,
        };
      }
      return durable;
    });
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, durable));
    let priorEpoch = result.current.authorityEpochs.get(currentProject.id)!;

    for (let index = 1; index <= 8; index += 1) {
      await act(async () => {
        await result.current.commitStructural({
          type: 'close-project',
          projectId: currentProject.id,
        });
      });
      expect(result.current.authorityEpochs.size).toBe(1);
      expect(result.current.authorityEpochs.has(currentProject.id)).toBe(false);

      currentProject = projectWithId(
        index === 8 ? 'project-0' : `project-${index}`,
        `Project ${index}`,
      );
      await act(async () => {
        await result.current.commitStructural({
          type: 'create-and-activate-project',
          project: currentProject,
        });
      });
      const epoch = result.current.authorityEpochs.get(currentProject.id)!;
      expect(epoch).toBeGreaterThan(priorEpoch);
      expect(result.current.authorityEpochs.size).toBe(durable.projects.length);
      priorEpoch = epoch;
    }
  });

  it('keeps a newer working copy over an older save completion', async () => {
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const initialEpoch = result.current.authorityEpochs.get('project-1');
    act(() => { void result.current.updateProject('project-1', () => project('First', 2)); });
    act(() => { void result.current.updateProject('project-1', () => project('Second', 3)); });

    await act(async () => {
      first.resolve(snapshot(project('First', 2)));
      await first.promise;
    });

    expect(result.current.workspace.projects[0]).toMatchObject({
      name: 'Second',
      initialState: { scale: 3 },
    });
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saving' });
    expect(result.current.hasUnsavedWork).toBe(true);
    expect(result.current.authorityEpochs.get('project-1')).toBe(initialEpoch);

    await act(async () => {
      second.resolve(snapshot(project('Second', 3)));
      await second.promise;
    });

    expect(result.current.workspace.projects[0].name).toBe('Second');
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
    expect(result.current.hasUnsavedWork).toBe(false);
    expect(result.current.authorityEpochs.get('project-1')).toBe(initialEpoch);
  });

  it.each([
    ['foreign incarnation', { incarnation: 'foreign', revision: 1 }, true],
    ['jumped revision', { incarnation: 'local', revision: 2 }, true],
    ['stale unrelated completion', { incarnation: 'local', revision: 1 }, false],
  ] as const)(
    'does not retag a surviving copy from a %s readback',
    async (_, returnedLineage, preserveToken) => {
      const token = {};
      const initial = projectWithAuthority('Original', { incarnation: 'local', revision: 0 }, token);
      const first = deferred<WorkspaceSnapshot>();
      const pending = new Promise<WorkspaceSnapshot>(() => {});
      const store = storeWithCommit(vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValue(pending));
      const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot(initial)));
      let firstSave!: Promise<boolean>;

      act(() => {
        firstSave = result.current.updateProject('project-1', current => ({
          ...current,
          name: 'First',
        }));
      });
      act(() => {
        void result.current.updateProject('project-1', current => ({
          ...current,
          name: 'Second',
        }));
      });
      const returned = projectWithAuthority('Returned', returnedLineage, preserveToken ? token : {});
      await act(async () => {
        first.resolve(snapshot(returned));
        await firstSave;
      });
      act(() => {
        void result.current.updateProject('project-1', current => ({
          ...current,
          name: 'Third',
        }));
      });

      const thirdCommand = store.commit.mock.calls[2][0];
      expect(thirdCommand.type).toBe('save-project');
      if (thirdCommand.type !== 'save-project') return;
      expect(getInstalledProjectAuthorityLineage(thirdCommand.project)).toEqual({
        incarnation: 'local',
        revision: 0,
      });
    },
  );

  it('does not retag a surviving copy when its local predecessor fails', async () => {
    const token = {};
    const initial = projectWithAuthority('Original', { incarnation: 'local', revision: 0 }, token);
    const first = deferred<WorkspaceSnapshot>();
    const pending = new Promise<WorkspaceSnapshot>(() => {});
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(pending));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot(initial)));
    let firstSave!: Promise<boolean>;

    act(() => {
      firstSave = result.current.updateProject('project-1', current => ({
        ...current,
        name: 'First',
      }));
    });
    act(() => {
      void result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Second',
      }));
    });
    await act(async () => {
      first.reject(new WorkspaceStoreError('First failed.', 'io'));
      await firstSave;
    });
    act(() => {
      void result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Third',
      }));
    });

    const thirdCommand = store.commit.mock.calls[2][0];
    expect(thirdCommand.type).toBe('save-project');
    if (thirdCommand.type !== 'save-project') return;
    expect(getInstalledProjectAuthorityLineage(thirdCommand.project)).toEqual({
      incarnation: 'local',
      revision: 0,
    });
  });

  it('does not synthesize authority for a tokenless surviving copy', async () => {
    const first = deferred<WorkspaceSnapshot>();
    const pending = new Promise<WorkspaceSnapshot>(() => {});
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(pending));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    let firstSave!: Promise<boolean>;

    act(() => {
      firstSave = result.current.updateProject('project-1', current => ({
        ...current,
        name: 'First',
      }));
    });
    act(() => {
      void result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Second',
      }));
    });
    const returned = projectWithAuthority(
      'Returned',
      { incarnation: 'local', revision: 1 },
      {},
    );
    await act(async () => {
      first.resolve(snapshot(returned));
      await firstSave;
    });
    act(() => {
      void result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Third',
      }));
    });

    const thirdCommand = store.commit.mock.calls[2][0];
    expect(thirdCommand.type).toBe('save-project');
    if (thirdCommand.type !== 'save-project') return;
    expect(getInstalledProjectAuthorityLineage(thirdCommand.project)).toBeUndefined();
  });

  it('does not retag a same-id replacement from an old-incarnation completion', async () => {
    const oldToken = {};
    const replacementToken = {};
    const initial = projectWithAuthority('Original', { incarnation: 'old', revision: 0 }, oldToken);
    const replacement = projectWithAuthority(
      'Replacement',
      { incarnation: 'replacement', revision: 0 },
      replacementToken,
    );
    const first = deferred<WorkspaceSnapshot>();
    const replacementSave = new Promise<WorkspaceSnapshot>(() => {});
    let saveCalls = 0;
    const store = storeWithCommit(command => {
      if (command.type === 'save-project') {
        saveCalls += 1;
        return saveCalls === 1 ? first.promise : replacementSave;
      }
      if (command.type === 'close-project') {
        return Promise.resolve({ ...snapshot(initial), projects: [], activeProjectId: '' });
      }
      return Promise.resolve(snapshot(replacement));
    });
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot(initial)));
    let oldSave!: Promise<boolean>;

    act(() => {
      oldSave = result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Old edit',
      }));
    });
    await act(async () => {
      await result.current.commitStructural({ type: 'close-project', projectId: 'project-1' });
      await result.current.commitStructural({
        type: 'create-and-activate-project',
        project: replacement,
      });
    });
    act(() => {
      void result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Replacement edit',
      }));
    });
    const oldReturned = projectWithAuthority(
      'Old returned',
      { incarnation: 'old', revision: 1 },
      oldToken,
    );
    await act(async () => {
      first.resolve(snapshot(oldReturned));
      await oldSave;
    });
    act(() => {
      void result.current.updateProject('project-1', current => ({
        ...current,
        name: 'Replacement latest',
      }));
    });

    const latestCommand = store.commit.mock.calls[4][0];
    expect(latestCommand.type).toBe('save-project');
    if (latestCommand.type !== 'save-project') return;
    expect(getInstalledProjectAuthorityLineage(latestCommand.project)).toEqual({
      incarnation: 'replacement',
      revision: 0,
    });
  });

  it('keeps a coalesced physical snapshot when callers settle out of order', async () => {
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    const secondProject = { ...project('Project 2'), id: 'project-2' };
    const initial = {
      ...snapshot(),
      projects: [project('Original'), secondProject],
      activeProjectId: 'project-2',
    };
    const newestSnapshot = {
      ...initial,
      projects: [project('Second', 3), secondProject],
    };
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));

    act(() => { void result.current.updateProject('project-1', () => project('First', 2)); });
    act(() => { void result.current.updateProject('project-1', () => project('Second', 3)); });

    await act(async () => {
      second.resolve(newestSnapshot);
      await second.promise;
    });
    await act(async () => {
      first.resolve(newestSnapshot);
      await first.promise;
    });

    expect(result.current.workspace.projects).toHaveLength(2);
    expect(result.current.workspace.projects[0]).toMatchObject({
      name: 'Second',
      initialState: { scale: 3 },
    });
    expect(result.current.workspace.projects[1]).toEqual(secondProject);
    expect(result.current.workspace.activeProjectId).toBe('project-2');
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
  });

  it('adopts structure from a complete current-project save snapshot', async () => {
    const save = deferred<WorkspaceSnapshot>();
    const secondProject = { ...project('Project 2'), id: 'project-2' };
    const initial = {
      ...snapshot(),
      projects: [project('Original'), secondProject],
    };
    const store = storeWithCommit(command => (
      command.type === 'save-project'
        ? save.promise
        : Promise.resolve(snapshot(project('Durable old copy')))
    ));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));

    act(() => { void result.current.updateProject('project-1', () => project('Working', 4)); });
    await act(async () => {
      await result.current.commitStructural({
        type: 'activate-project',
        projectId: 'project-1',
      });
    });
    await act(async () => {
      save.resolve(snapshot(project('Working', 4)));
      await save.promise;
    });

    expect(result.current.workspace.projects).toHaveLength(1);
    expect(result.current.workspace.projects[0]).toMatchObject({
      name: 'Working',
      initialState: { scale: 4 },
    });
    expect(result.current.workspace.activeProjectId).toBe('project-1');
  });

  it('applies complete authoritative structural snapshots', async () => {
    const structural = deferred<WorkspaceSnapshot>();
    const save = deferred<WorkspaceSnapshot>();
    const secondProject = { ...project('Project 2'), id: 'project-2' };
    const removedProject = { ...project('Removed'), id: 'project-3' };
    const addedProject = { ...project('Added', 7), id: 'project-4' };
    const authoritativeProject = project('Structural authoritative', 8);
    const initial = {
      ...snapshot(),
      projects: [project('Original'), secondProject, removedProject],
    };
    const store = storeWithCommit(command => (
      command.type === 'save-project' ? save.promise : structural.promise
    ));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));
    let structuralWrite!: Promise<WorkspaceSnapshot>;
    let projectWrite!: Promise<boolean>;

    act(() => {
      structuralWrite = result.current.commitStructural({
        type: 'activate-project',
        projectId: 'project-2',
      });
    });
    act(() => {
      projectWrite = result.current.updateProject(
        'project-1',
        () => project('Latest saved', 9),
      );
    });
    await act(async () => {
      save.resolve({
        ...initial,
        projects: [project('Latest saved', 9), secondProject, removedProject],
      });
      await projectWrite;
    });
    await act(async () => {
      structural.resolve({
        ...initial,
        projects: [secondProject, authoritativeProject, addedProject],
        activeProjectId: 'project-2',
      });
      await structuralWrite;
    });

    expect(result.current.workspace.projects.map(item => item.id)).toEqual([
      'project-2',
      'project-1',
      'project-4',
    ]);
    expect(result.current.workspace.projects[1]).toEqual(authoritativeProject);
    expect(result.current.workspace.projects[2]).toEqual(addedProject);
    expect(result.current.workspace.activeProjectId).toBe('project-2');
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
    expect(result.current.saveStates.has('project-3')).toBe(false);
  });

  it('ignores an older failure after a newer generation saves', async () => {
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    let firstResult!: Promise<boolean>;

    act(() => {
      firstResult = result.current.updateProject('project-1', () => project('First', 2));
    });
    act(() => { void result.current.updateProject('project-1', () => project('Second', 3)); });
    await act(async () => {
      second.resolve(snapshot(project('Second', 3)));
      await second.promise;
    });
    await act(async () => {
      first.reject(new WorkspaceStoreError('Old failure.', 'io'));
      await first.promise.catch(() => undefined);
    });

    expect(result.current.workspace.projects[0]).toMatchObject({
      name: 'Second',
      initialState: { scale: 3 },
    });
    expect(await firstResult).toBe(true);
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
  });

  it.each([
    ['quota', 'failed'],
    ['io', 'failed'],
    ['unavailable', 'failed'],
    ['validation', 'failed'],
    ['conflict', 'conflict'],
  ] as const)('preserves working state after a %s error', async (code, status) => {
    const store = storeWithCommit(async () => {
      throw new WorkspaceStoreError('Durable save failed.', code);
    });
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));

    act(() => { void result.current.updateProject('project-1', () => project('Unsaved', 9)); });

    await waitFor(() => expect(result.current.saveStates.get('project-1')).toEqual({
      status,
      message: 'Durable save failed.',
    }));
    expect(result.current.workspace.projects[0]).toMatchObject({
      name: 'Unsaved',
      initialState: { scale: 9 },
    });
    expect(result.current.hasUnsavedWork).toBe(true);
  });

  it('retains the working copy when a malformed Worker response fails closed', async () => {
    const store = storeWithCommit(async () => {
      throw new WorkspaceStoreError(
        'Project preparation Worker returned an invalid response.',
        'unavailable',
      );
    });
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const working = project('Malformed response working copy', 15);

    act(() => { void result.current.updateProject('project-1', () => working); });

    await waitFor(() => expect(result.current.saveStates.get('project-1')).toMatchObject({
      status: 'failed',
      message: 'Project preparation Worker returned an invalid response.',
    }));
    expect(result.current.workspace.projects[0]).toBe(working);
    expect(result.current.hasUnsavedWork).toBe(true);
  });

  it('retries the latest generation and clears the failure only after it saves', async () => {
    const retry = deferred<WorkspaceSnapshot>();
    const store = storeWithCommit(vi.fn()
      .mockRejectedValueOnce(new WorkspaceStoreError('Disk unavailable.', 'io'))
      .mockReturnValueOnce(retry.promise));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const latest = project('Latest working copy', 12);

    act(() => { void result.current.updateProject('project-1', () => latest); });
    await waitFor(() => expect(result.current.saveStates.get('project-1')?.status).toBe('failed'));

    act(() => result.current.retryProject('project-1'));

    expect(store.commit).toHaveBeenLastCalledWith({ type: 'save-project', project: latest });
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saving' });

    await act(async () => {
      retry.resolve(snapshot(latest));
      await retry.promise;
    });

    expect(result.current.workspace.projects[0]).toEqual(latest);
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
  });

  it('overlays working copies on structural snapshots and invalidates removed projects', async () => {
    const pending = new Promise<WorkspaceSnapshot>(() => {});
    const secondProject = { ...project('Second'), id: 'project-2' };
    const store = storeWithCommit(command => {
      if (command.type === 'save-project') return pending;
      if (command.type === 'activate-project') {
        return Promise.resolve({
          ...snapshot(project('Durable old copy', 1)),
          activeProjectId: 'project-2',
          projects: [project('Durable old copy', 1), secondProject],
        });
      }
      return Promise.resolve({
        ...snapshot(secondProject),
        projects: [secondProject],
      });
    });
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const working = project('Working', 5);

    act(() => { void result.current.updateProject('project-1', () => working); });
    await act(async () => {
      await result.current.commitStructural({
        type: 'activate-project',
        projectId: 'project-2',
      });
    });

    expect(result.current.workspace.projects[0]).toEqual(working);
    expect(result.current.workspace.activeProjectId).toBe('project-2');

    await act(async () => {
      await result.current.commitStructural({
        type: 'close-project',
        projectId: 'project-1',
      });
    });
    expect(result.current.workspace.projects.map(item => item.id)).toEqual(['project-2']);
    expect(result.current.saveStates.has('project-1')).toBe(false);
  });
});
