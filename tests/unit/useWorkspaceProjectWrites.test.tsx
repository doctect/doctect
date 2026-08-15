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

  it('keeps a newer working copy over an older save completion', async () => {
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
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

    await act(async () => {
      second.resolve(snapshot(project('Second', 3)));
      await second.promise;
    });

    expect(result.current.workspace.projects[0].name).toBe('Second');
    expect(result.current.saveStates.get('project-1')).toEqual({ status: 'saved' });
    expect(result.current.hasUnsavedWork).toBe(false);
  });

  it('ignores an older whole-snapshot success after a newer generation saves', async () => {
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    const secondProject = { ...project('Project 2'), id: 'project-2' };
    const initial = {
      ...snapshot(),
      projects: [project('Original'), secondProject],
      activeProjectId: 'project-2',
    };
    const store = storeWithCommit(vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));

    act(() => { void result.current.updateProject('project-1', () => project('First', 2)); });
    act(() => { void result.current.updateProject('project-1', () => project('Second', 3)); });

    await act(async () => {
      second.resolve({
        ...initial,
        projects: [project('Second', 3), secondProject],
      });
      await second.promise;
    });
    await act(async () => {
      first.resolve(snapshot(project('First', 2)));
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

  it('preserves newer workspace structure when the current project save completes', async () => {
    const save = deferred<WorkspaceSnapshot>();
    const secondProject = { ...project('Project 2'), id: 'project-2' };
    const initial = {
      ...snapshot(),
      projects: [project('Original'), secondProject],
    };
    const store = storeWithCommit(() => save.promise);
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));

    act(() => { void result.current.updateProject('project-1', () => project('Working', 4)); });
    act(() => result.current.applyDurableSnapshot(snapshot(project('Durable old copy'))));
    await act(async () => {
      save.resolve({
        ...initial,
        activeProjectId: 'project-2',
        projects: [project('Working', 4), secondProject],
      });
      await save.promise;
    });

    expect(result.current.workspace.projects).toHaveLength(1);
    expect(result.current.workspace.projects[0]).toMatchObject({
      name: 'Working',
      initialState: { scale: 4 },
    });
    expect(result.current.workspace.activeProjectId).toBe('project-1');
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

  it('overlays working copies on structural snapshots and can discard a closed project', () => {
    const pending = new Promise<WorkspaceSnapshot>(() => {});
    const store = storeWithCommit(() => pending);
    const { result } = renderHook(() => useWorkspaceProjectWrites(store, snapshot()));
    const working = project('Working', 5);

    act(() => { void result.current.updateProject('project-1', () => working); });
    act(() => result.current.applyDurableSnapshot({
      ...snapshot(project('Durable old copy', 1)),
      activeProjectId: 'project-2',
      projects: [
        project('Durable old copy', 1),
        { ...project('Second'), id: 'project-2' },
      ],
    }));

    expect(result.current.workspace.projects[0]).toEqual(working);
    expect(result.current.workspace.activeProjectId).toBe('project-2');

    act(() => result.current.discardProject('project-1'));
    expect(result.current.workspace.projects.map(item => item.id)).toEqual(['project-2']);
    expect(result.current.saveStates.has('project-1')).toBe(false);
  });
});
