import { useCallback, useMemo, useRef, useState } from 'react';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type WorkspaceCommand,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../services/localWorkspace/index';
import { getInstalledProjectAuthorityToken } from '../services/localWorkspace/projectAuthority';

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
  authorityEpochs: ReadonlyMap<string, number>;
  saveStates: ReadonlyMap<string, ProjectSaveState>;
  hasUnsavedWork: boolean;
  updateProject(
    projectId: string,
    update: (project: WorkspaceProject) => WorkspaceProject,
    expectedAuthorityEpoch?: number,
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
  onWorkspaceChange?: (snapshot: WorkspaceSnapshot) => void,
): WorkspaceProjectWrites {
  const durableSnapshotRef = useRef(initialWorkspace);
  const workingCopiesRef = useRef(new Map<string, WorkingCopy>());
  const generationsRef = useRef(new Map<string, number>());
  const authorityIdentitiesRef = useRef(new Map(
    initialWorkspace.projects.map(project => [
      project.id,
      getInstalledProjectAuthorityToken(project) ?? project,
    ]),
  ));
  const authorityEpochsRef = useRef(new Map(
    initialWorkspace.projects.map(project => [project.id, 0]),
  ));
  const structuralQueueRef = useRef<Promise<void> | null>(null);
  const onWorkspaceChangeRef = useRef(onWorkspaceChange);
  onWorkspaceChangeRef.current = onWorkspaceChange;
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [authorityEpochs, setAuthorityEpochs] = useState<ReadonlyMap<string, number>>(
    authorityEpochsRef.current,
  );
  const [saveStates, setSaveStates] = useState<ReadonlyMap<string, ProjectSaveState>>(
    () => new Map(initialWorkspace.projects.map(project => [project.id, { status: 'saved' }])),
  );

  const publishWorkspace = useCallback((snapshot: WorkspaceSnapshot) => {
    onWorkspaceChangeRef.current?.(structuredClone(snapshot));
    setWorkspace(snapshot);
  }, []);

  const reconcileSnapshot = useCallback((
    snapshot: WorkspaceSnapshot,
    currentOwnProjectId?: string,
  ): WorkspaceSnapshot => {
    const survivingProjectIds = new Set(snapshot.projects.map(project => project.id));
    for (const projectId of workingCopiesRef.current.keys()) {
      if (survivingProjectIds.has(projectId)) continue;
      generationsRef.current.set(projectId, (generationsRef.current.get(projectId) ?? 0) + 1);
      workingCopiesRef.current.delete(projectId);
    }

    const nextIdentities = new Map<string, object>();
    const nextEpochs = new Map(authorityEpochsRef.current);
    let epochsChanged = false;
    for (const project of snapshot.projects) {
      const installedToken = getInstalledProjectAuthorityToken(project);
      const identity = installedToken ?? project;
      const previousIdentity = authorityIdentitiesRef.current.get(project.id);
      const unmanagedOwnReadback = project.id === currentOwnProjectId
        && installedToken === undefined;
      if (previousIdentity !== undefined
        && previousIdentity !== identity
        && !workingCopiesRef.current.has(project.id)
        && !unmanagedOwnReadback) {
        nextEpochs.set(project.id, (nextEpochs.get(project.id) ?? 0) + 1);
        epochsChanged = true;
      } else if (!nextEpochs.has(project.id)) {
        nextEpochs.set(project.id, 0);
        epochsChanged = true;
      }
      nextIdentities.set(project.id, identity);
    }
    for (const projectId of nextEpochs.keys()) {
      if (survivingProjectIds.has(projectId)) continue;
      nextEpochs.delete(projectId);
      epochsChanged = true;
    }
    authorityIdentitiesRef.current = nextIdentities;
    if (epochsChanged) {
      authorityEpochsRef.current = nextEpochs;
      setAuthorityEpochs(nextEpochs);
    }

    durableSnapshotRef.current = snapshot;
    const visible = overlayWorkingCopies(snapshot, workingCopiesRef.current);
    publishWorkspace(visible);
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
  }, [publishWorkspace]);

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
      reconcileSnapshot(snapshot, currentGeneration ? project.id : undefined);
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
    expectedAuthorityEpoch?: number,
  ): Promise<boolean> => {
    if (expectedAuthorityEpoch !== undefined
      && authorityEpochsRef.current.get(projectId) !== expectedAuthorityEpoch) {
      return Promise.resolve(false);
    }
    const currentProject = workingCopiesRef.current.get(projectId)?.project
      ?? durableSnapshotRef.current.projects.find(project => project.id === projectId);
    if (!currentProject) return Promise.resolve(false);

    const project = update(currentProject);
    const generation = (generationsRef.current.get(projectId) ?? 0) + 1;
    const workingCopies = new Map(workingCopiesRef.current);
    workingCopies.set(projectId, { generation, project });
    const visible = overlayWorkingCopies(durableSnapshotRef.current, workingCopies);
    generationsRef.current.set(projectId, generation);
    workingCopiesRef.current = workingCopies;
    publishWorkspace(visible);
    setSaveStates(current => {
      const next = new Map(current);
      next.set(projectId, { status: 'saving' });
      return next;
    });
    return saveProject(project, generation);
  }, [publishWorkspace, saveProject]);

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
    authorityEpochs,
    saveStates,
    hasUnsavedWork,
    updateProject,
    commitStructural,
    retryProject,
  };
}
