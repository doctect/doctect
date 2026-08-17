import {
  WorkspaceStoreError,
  type WorkspaceCommand,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from './contracts';
import { cloneWorkspaceSnapshotWithProjectAuthority } from './projectAuthority';
import {
  nextProjectLineage,
  sameProjectLineage,
  type ProjectLineage,
} from './schema';

type ExclusiveCommand = Exclude<WorkspaceCommand, { type: 'save-project' }>;

export interface MutationQueue {
  enqueueProjectSave(
    project: WorkspaceProject,
    expectedLineage: ProjectLineage,
  ): Promise<WorkspaceSnapshot>;
  runExclusive(command: ExclusiveCommand): Promise<WorkspaceSnapshot>;
  freeze(): void;
  drain(): Promise<void>;
  hasPending(): boolean;
  hasPinnedProjectLineage(projectId: string): boolean;
}

interface MutationOperations {
  saveProject(
    project: WorkspaceProject,
    expectedLineage: ProjectLineage,
  ): Promise<WorkspaceSnapshot>;
  runExclusive(command: ExclusiveCommand): Promise<WorkspaceSnapshot>;
}

interface Waiter {
  resolve(snapshot: WorkspaceSnapshot): void;
  reject(error: unknown): void;
}

interface SaveEntry {
  kind: 'save';
  project: WorkspaceProject;
  authorityLineage: ProjectLineage;
  expectedLineage: ProjectLineage;
  ready: boolean;
  timer?: ReturnType<typeof setTimeout>;
  waiters: Waiter[];
}

interface ExclusiveEntry {
  kind: 'exclusive';
  command: ExclusiveCommand;
  waiters: Waiter[];
  canceledSaveWaiters: Waiter[];
}

type QueueEntry = SaveEntry | ExclusiveEntry;

const frozenError = (): WorkspaceStoreError => new WorkspaceStoreError(
  'Local workspace mutation queue is frozen.',
  'authority-lost',
);

const lineageError = (projectId: string): WorkspaceStoreError => new WorkspaceStoreError(
  `Project ${projectId} save lineage did not advance.`,
  'conflict',
);

const cloneSnapshot = (snapshot: WorkspaceSnapshot): WorkspaceSnapshot =>
  cloneWorkspaceSnapshotWithProjectAuthority(snapshot);

const SAVE_DEBOUNCE_MS = 1_000;

export const createMutationQueue = (
  operations: MutationOperations,
): MutationQueue => {
  const entries: QueueEntry[] = [];
  let queuedSaves = new Map<string, SaveEntry>();
  const projectLineages = new Map<string, ProjectLineage>();
  const drainWaiters: Array<() => void> = [];
  let activeSave: SaveEntry | undefined;
  let running = false;
  let frozen = false;

  const settleSuccess = (waiters: Waiter[], snapshot: WorkspaceSnapshot): void => {
    for (const waiter of waiters) waiter.resolve(cloneSnapshot(snapshot));
  };

  const settleFailure = (waiters: Waiter[], error: unknown): void => {
    for (const waiter of waiters) waiter.reject(error);
  };

  const notifyDrained = (): void => {
    if (running || entries.length > 0) return;
    for (const resolve of drainWaiters.splice(0)) resolve();
  };

  const markReady = (entry: SaveEntry): void => {
    entry.timer = undefined;
    entry.ready = true;
  };

  const flushSaves = (): void => {
    for (const entry of entries) {
      if (entry.kind !== 'save') continue;
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      markReady(entry);
    }
  };

  const pump = (): void => {
    if (running) return;
    const entry = entries[0];
    if (!entry) {
      notifyDrained();
      return;
    }
    if (entry.kind === 'save' && !entry.ready) return;

    entries.shift();
    running = true;
    if (entry.kind === 'save') {
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      if (queuedSaves.get(entry.project.id) === entry) queuedSaves.delete(entry.project.id);
      activeSave = entry;
    }

    const pinnedLineage = entry.kind === 'save'
      ? projectLineages.get(entry.project.id)
      : undefined;
    const operation = entry.kind === 'save'
      ? pinnedLineage && sameProjectLineage(pinnedLineage, entry.expectedLineage)
        ? operations.saveProject(entry.project, entry.expectedLineage)
        : Promise.reject(lineageError(entry.project.id))
      : operations.runExclusive(entry.command);
    void operation.then(snapshot => {
      if (entry.kind === 'save') {
        projectLineages.set(entry.project.id, nextProjectLineage(entry.expectedLineage));
      }
      settleSuccess(entry.waiters, snapshot);
      if (entry.kind === 'exclusive') {
        settleSuccess(entry.canceledSaveWaiters, snapshot);
        if (entry.command.type === 'close-project') {
          projectLineages.delete(entry.command.projectId);
        }
      }
    }, error => {
      settleFailure(entry.waiters, error);
      if (entry.kind === 'exclusive') {
        settleFailure(entry.canceledSaveWaiters, error);
      }
    }).finally(() => {
      if (entry.kind === 'save') {
        activeSave = undefined;
        if (!entries.some(candidate =>
          candidate.kind === 'save' && candidate.project.id === entry.project.id)) {
          projectLineages.delete(entry.project.id);
        }
      }
      running = false;
      pump();
    });
  };

  const waiterPromise = (): { promise: Promise<WorkspaceSnapshot>; waiter: Waiter } => {
    let resolve!: (snapshot: WorkspaceSnapshot) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<WorkspaceSnapshot>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { promise, waiter: { resolve, reject } };
  };

  return {
    enqueueProjectSave(project, expectedLineage) {
      if (frozen) return Promise.reject(frozenError());
      const queued = queuedSaves.get(project.id);
      if (queued) {
        if (queued.authorityLineage.incarnation !== expectedLineage.incarnation) {
          return Promise.reject(lineageError(project.id));
        }
        const { promise, waiter } = waiterPromise();
        queued.project = structuredClone(project);
        queued.waiters.push(waiter);
        return promise;
      }
      const projectId = project.id;
      const priorEntry = [...entries].reverse().find(candidate =>
        candidate.kind === 'save' && candidate.project.id === projectId) as SaveEntry | undefined;
      const predecessor = priorEntry
        ?? (activeSave?.project.id === projectId ? activeSave : undefined);
      const pinnedLineage = projectLineages.get(projectId);
      if (pinnedLineage && !predecessor
        && pinnedLineage.incarnation !== expectedLineage.incarnation) {
        return Promise.reject(lineageError(projectId));
      }
      if (predecessor
        && predecessor.expectedLineage.incarnation !== expectedLineage.incarnation) {
        return Promise.reject(lineageError(projectId));
      }
      const lineage = pinnedLineage ?? expectedLineage;
      projectLineages.set(projectId, lineage);
      const { promise, waiter } = waiterPromise();

      const entry: SaveEntry = {
        kind: 'save',
        project: structuredClone(project),
        authorityLineage: { ...expectedLineage },
        expectedLineage: predecessor
          ? nextProjectLineage(predecessor.expectedLineage)
          : { ...lineage },
        ready: activeSave?.project.id === projectId,
        waiters: [waiter],
      };
      if (!entry.ready) {
        entry.timer = setTimeout(() => {
          markReady(entry);
          pump();
        }, SAVE_DEBOUNCE_MS);
      }
      queuedSaves.set(project.id, entry);
      entries.push(entry);
      pump();
      return promise;
    },

    runExclusive(command) {
      if (frozen) return Promise.reject(frozenError());
      const { promise, waiter } = waiterPromise();
      const canceledSaveWaiters: Waiter[] = [];
      if (command.type === 'close-project') {
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          const entry = entries[index];
          if (entry.kind !== 'save' || entry.project.id !== command.projectId) continue;
          entries.splice(index, 1);
          if (entry.timer !== undefined) clearTimeout(entry.timer);
          if (queuedSaves.get(entry.project.id) === entry) queuedSaves.delete(entry.project.id);
          canceledSaveWaiters.unshift(...entry.waiters);
        }
      }

      flushSaves();
      queuedSaves = new Map();
      entries.push({
        kind: 'exclusive',
        command: structuredClone(command),
        waiters: [waiter],
        canceledSaveWaiters,
      });
      pump();
      return promise;
    },

    freeze() {
      frozen = true;
    },

    drain() {
      if (!running && entries.length === 0) return Promise.resolve();
      return new Promise(resolve => drainWaiters.push(resolve));
    },

    hasPending() {
      return running || entries.length > 0;
    },

    hasPinnedProjectLineage(projectId) {
      if (!projectLineages.has(projectId)) return false;
      if (activeSave?.project.id !== projectId) return true;
      return entries.some(entry =>
        (entry.kind === 'save' && entry.project.id === projectId)
        || (entry.kind === 'exclusive'
          && entry.command.type === 'close-project'
          && entry.command.projectId === projectId));
    },
  };
};
