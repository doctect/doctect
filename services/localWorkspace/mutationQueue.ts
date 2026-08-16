import {
  WorkspaceStoreError,
  type WorkspaceCommand,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from './contracts';

type ExclusiveCommand = Exclude<WorkspaceCommand, { type: 'save-project' }>;

export interface MutationQueue {
  enqueueProjectSave(project: WorkspaceProject): Promise<WorkspaceSnapshot>;
  runExclusive(command: ExclusiveCommand): Promise<WorkspaceSnapshot>;
  freeze(): void;
  drain(): Promise<void>;
  hasPending(): boolean;
}

interface MutationOperations {
  saveProject(project: WorkspaceProject): Promise<WorkspaceSnapshot>;
  runExclusive(command: ExclusiveCommand): Promise<WorkspaceSnapshot>;
}

interface Waiter {
  resolve(snapshot: WorkspaceSnapshot): void;
  reject(error: unknown): void;
}

interface SaveEntry {
  kind: 'save';
  project: WorkspaceProject;
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

const cloneSnapshot = (snapshot: WorkspaceSnapshot): WorkspaceSnapshot =>
  structuredClone(snapshot);

const SAVE_DEBOUNCE_MS = 1_000;

export const createMutationQueue = (
  operations: MutationOperations,
): MutationQueue => {
  const entries: QueueEntry[] = [];
  let queuedSaves = new Map<string, SaveEntry>();
  const drainWaiters: Array<() => void> = [];
  let activeSaveId: string | undefined;
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
      activeSaveId = entry.project.id;
    }

    const operation = entry.kind === 'save'
      ? operations.saveProject(entry.project)
      : operations.runExclusive(entry.command);
    void operation.then(snapshot => {
      settleSuccess(entry.waiters, snapshot);
      if (entry.kind === 'exclusive') {
        settleSuccess(entry.canceledSaveWaiters, snapshot);
      }
    }, error => {
      settleFailure(entry.waiters, error);
      if (entry.kind === 'exclusive') {
        settleFailure(entry.canceledSaveWaiters, error);
      }
    }).finally(() => {
      if (entry.kind === 'save') activeSaveId = undefined;
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
    enqueueProjectSave(project) {
      if (frozen) return Promise.reject(frozenError());
      const { promise, waiter } = waiterPromise();
      const queued = queuedSaves.get(project.id);
      if (queued) {
        queued.project = structuredClone(project);
        queued.waiters.push(waiter);
        return promise;
      }

      const entry: SaveEntry = {
        kind: 'save',
        project: structuredClone(project),
        ready: activeSaveId === project.id,
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
  };
};
