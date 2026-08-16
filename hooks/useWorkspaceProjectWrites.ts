import { useCallback, useMemo, useRef, useState } from 'react';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type WorkspaceCommand,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../services/localWorkspace/index';

export type StructuralWorkspaceCommand = Exclude<
  WorkspaceCommand,
  { type: 'save-project' }
>;

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
  commitStructural(command: StructuralWorkspaceCommand): Promise<WorkspaceSnapshot>;
  retryProject(projectId: string): void;
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
  const structuralQueueRef = useRef<Promise<void> | null>(null);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [saveStates, setSaveStates] = useState<ReadonlyMap<string, ProjectSaveState>>(
    () => new Map(initialWorkspace.projects.map(project => [project.id, { status: 'saved' }])),
  );

  const reconcileSnapshot = useCallback((snapshot: WorkspaceSnapshot): WorkspaceSnapshot => {
    const survivingProjectIds = new Set(snapshot.projects.map(project => project.id));
    for (const projectId of workingCopiesRef.current.keys()) {
      if (survivingProjectIds.has(projectId)) continue;
      generationsRef.current.set(projectId, (generationsRef.current.get(projectId) ?? 0) + 1);
      workingCopiesRef.current.delete(projectId);
    }

    durableSnapshotRef.current = snapshot;
    const visible = overlayWorkingCopies(snapshot, workingCopiesRef.current);
    setWorkspace(visible);
    setSaveStates(current => {
      const next = new Map(current);
      for (const project of snapshot.projects) {
        if (!next.has(project.id)) next.set(project.id, { status: 'saved' });
      }
      for (const projectId of next.keys()) {
        if (!survivingProjectIds.has(projectId)) next.delete(projectId);
      }
      return next;
    });
    return snapshot;
  }, []);

  const commitStructural = useCallback((
    command: StructuralWorkspaceCommand,
  ): Promise<WorkspaceSnapshot> => {
    const execute = async (): Promise<WorkspaceSnapshot> => {
      const snapshot = await store.commit(command);
      return reconcileSnapshot(snapshot);
    };
    const operation = structuralQueueRef.current
      ? structuralQueueRef.current.then(execute)
      : execute();
    const tail = operation.then(() => undefined, () => undefined);
    structuralQueueRef.current = tail;
    void tail.then(() => {
      if (structuralQueueRef.current === tail) structuralQueueRef.current = null;
    });
    return operation;
  }, [reconcileSnapshot, store]);

  const saveProject = useCallback(async (
    project: WorkspaceProject,
    generation: number,
  ): Promise<boolean> => {
    try {
      const snapshot = await store.commit({ type: 'save-project', project });
      const currentCopy = workingCopiesRef.current.get(project.id);
      const currentGeneration = generationsRef.current.get(project.id) === generation
        && currentCopy?.generation === generation;
      if (currentGeneration) workingCopiesRef.current.delete(project.id);
      reconcileSnapshot(snapshot);
      if (!currentGeneration) return true;
      setSaveStates(current => {
        const next = new Map(current);
        next.set(project.id, { status: 'saved' });
        return next;
      });
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
  }, [reconcileSnapshot, store]);

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

  const hasUnsavedWork = useMemo(
    () => Array.from(saveStates.values()).some(state => state.status !== 'saved'),
    [saveStates],
  );

  return {
    workspace,
    saveStates,
    hasUnsavedWork,
    updateProject,
    commitStructural,
    retryProject,
  };
}
