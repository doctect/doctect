import { useCallback, useMemo, useRef, useState } from 'react';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../services/localWorkspace/index';

export type ProjectSaveState =
  | { status: 'saved' }
  | { status: 'saving' }
  | { status: 'failed'; message: string }
  | { status: 'conflict'; message: string };

export interface WorkspaceProjectWrites {
  workspace: WorkspaceSnapshot;
  saveStates: ReadonlyMap<string, ProjectSaveState>;
  hasUnsavedWork: boolean;
  updateProject(
    projectId: string,
    update: (project: WorkspaceProject) => WorkspaceProject,
  ): Promise<boolean>;
  retryProject(projectId: string): void;
  applyDurableSnapshot(snapshot: WorkspaceSnapshot): void;
  discardProject(projectId: string): void;
}

interface WorkingCopy {
  generation: number;
  project: WorkspaceProject;
}

const overlayWorkingCopies = (
  snapshot: WorkspaceSnapshot,
  workingCopies: ReadonlyMap<string, WorkingCopy>,
): WorkspaceSnapshot => ({
  ...snapshot,
  projects: snapshot.projects.map(project => (
    workingCopies.get(project.id)?.project ?? project
  )),
});

const saveFailure = (error: unknown): ProjectSaveState => {
  const message = error instanceof Error ? error.message : 'Local storage failed.';
  return error instanceof WorkspaceStoreError && error.code === 'conflict'
    ? { status: 'conflict', message }
    : { status: 'failed', message };
};

export function useWorkspaceProjectWrites(
  store: LocalWorkspaceStore,
  initialWorkspace: WorkspaceSnapshot,
): WorkspaceProjectWrites {
  const durableSnapshotRef = useRef(initialWorkspace);
  const workingCopiesRef = useRef(new Map<string, WorkingCopy>());
  const generationsRef = useRef(new Map<string, number>());
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [saveStates, setSaveStates] = useState<ReadonlyMap<string, ProjectSaveState>>(
    () => new Map(initialWorkspace.projects.map(project => [project.id, { status: 'saved' }])),
  );

  const publishSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    durableSnapshotRef.current = snapshot;
    setWorkspace(overlayWorkingCopies(snapshot, workingCopiesRef.current));
    setSaveStates(current => {
      const next = new Map(current);
      const durableProjectIds = new Set(snapshot.projects.map(project => project.id));
      for (const project of snapshot.projects) {
        if (!workingCopiesRef.current.has(project.id) && !next.has(project.id)) {
          next.set(project.id, { status: 'saved' });
        }
      }
      for (const projectId of next.keys()) {
        if (!durableProjectIds.has(projectId) && !workingCopiesRef.current.has(projectId)) {
          next.delete(projectId);
        }
      }
      return next;
    });
  }, []);

  const saveProject = useCallback(async (
    project: WorkspaceProject,
    generation: number,
  ): Promise<boolean> => {
    try {
      const snapshot = await store.commit({ type: 'save-project', project });
      const currentCopy = workingCopiesRef.current.get(project.id);
      if (generationsRef.current.get(project.id) !== generation
        || currentCopy?.generation !== generation) return true;

      const savedProject = snapshot.projects.find(item => item.id === project.id);
      const durableSnapshot = durableSnapshotRef.current;
      if (!savedProject
        || !durableSnapshot.projects.some(item => item.id === project.id)) return true;

      const nextDurableSnapshot = {
        ...durableSnapshot,
        projects: durableSnapshot.projects.map(item => (
          item.id === project.id ? savedProject : item
        )),
      };
      durableSnapshotRef.current = nextDurableSnapshot;
      workingCopiesRef.current.delete(project.id);
      setSaveStates(current => {
        const next = new Map(current);
        next.set(project.id, { status: 'saved' });
        return next;
      });
      setWorkspace(overlayWorkingCopies(nextDurableSnapshot, workingCopiesRef.current));
      return true;
    } catch (error) {
      if (generationsRef.current.get(project.id) !== generation
        || workingCopiesRef.current.get(project.id)?.generation !== generation) return true;
      setSaveStates(current => {
        const next = new Map(current);
        next.set(project.id, saveFailure(error));
        return next;
      });
      return false;
    }
  }, [store]);

  const updateProject = useCallback((
    projectId: string,
    update: (project: WorkspaceProject) => WorkspaceProject,
  ): Promise<boolean> => {
    const currentProject = workingCopiesRef.current.get(projectId)?.project
      ?? durableSnapshotRef.current.projects.find(project => project.id === projectId);
    if (!currentProject) return Promise.resolve(false);

    const project = update(currentProject);
    const generation = (generationsRef.current.get(projectId) ?? 0) + 1;
    generationsRef.current.set(projectId, generation);
    workingCopiesRef.current.set(projectId, { generation, project });
    setWorkspace(current => ({
      ...current,
      projects: current.projects.map(item => item.id === projectId ? project : item),
    }));
    setSaveStates(current => {
      const next = new Map(current);
      next.set(projectId, { status: 'saving' });
      return next;
    });
    return saveProject(project, generation);
  }, [saveProject]);

  const retryProject = useCallback((projectId: string) => {
    const workingCopy = workingCopiesRef.current.get(projectId);
    if (!workingCopy) return;
    const generation = (generationsRef.current.get(projectId) ?? workingCopy.generation) + 1;
    generationsRef.current.set(projectId, generation);
    workingCopiesRef.current.set(projectId, { ...workingCopy, generation });
    setSaveStates(current => {
      const next = new Map(current);
      next.set(projectId, { status: 'saving' });
      return next;
    });
    void saveProject(workingCopy.project, generation);
  }, [saveProject]);

  const applyDurableSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    publishSnapshot(snapshot);
  }, [publishSnapshot]);

  const discardProject = useCallback((projectId: string) => {
    generationsRef.current.set(projectId, (generationsRef.current.get(projectId) ?? 0) + 1);
    workingCopiesRef.current.delete(projectId);
    durableSnapshotRef.current = {
      ...durableSnapshotRef.current,
      projects: durableSnapshotRef.current.projects.filter(project => project.id !== projectId),
    };
    setWorkspace(current => ({
      ...current,
      projects: current.projects.filter(project => project.id !== projectId),
    }));
    setSaveStates(current => {
      const next = new Map(current);
      next.delete(projectId);
      return next;
    });
  }, []);

  const hasUnsavedWork = useMemo(
    () => Array.from(saveStates.values()).some(state => state.status !== 'saved'),
    [saveStates],
  );

  return {
    workspace,
    saveStates,
    hasUnsavedWork,
    updateProject,
    retryProject,
    applyDurableSnapshot,
    discardProject,
  };
}
