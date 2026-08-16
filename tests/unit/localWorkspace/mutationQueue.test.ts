import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkspaceStoreError,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../../services/localWorkspace/contracts';
import { createMutationQueue } from '../../../services/localWorkspace/mutationQueue';
import { currentState } from '../../helpers/localWorkspaceFixtures';

const projectNamed = (name: string): WorkspaceProject => ({
  id: 'project-a',
  name,
  initialState: currentState(),
});

const snapshotWith = (project: WorkspaceProject): WorkspaceSnapshot => ({
  projects: [structuredClone(project)],
  activeProjectId: project.id,
  customPresets: [],
  pendingImports: [],
});

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('project revision lineages', () => {
  it('keeps a coalesced save entry pinned to its admitted base revision', async () => {
    vi.useFakeTimers();
    const calls: Array<{ name: string; expectedRevision: number }> = [];
    const queue = createMutationQueue({
      async saveProject(project, expectedRevision) {
        calls.push({ name: project.name, expectedRevision });
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), 3);
    const second = queue.enqueueProjectSave(projectNamed('Newest'), 99);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);

    expect(calls).toEqual([{ name: 'Newest', expectedRevision: 3 }]);
  });

  it('pins a save behind an active same-project save to the local next revision', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: Array<{ project: WorkspaceProject; expectedRevision: number }> = [];
    const queue = createMutationQueue({
      saveProject(project, expectedRevision) {
        calls.push({ project, expectedRevision });
        if (calls.length === 1) {
          started.resolve();
          return firstWrite.promise;
        }
        return Promise.resolve(snapshotWith(project));
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), 3);
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const second = queue.enqueueProjectSave(projectNamed('Second'), 99);
    firstWrite.resolve(snapshotWith(projectNamed('First')));
    await Promise.all([first, second]);

    expect(calls.map(call => call.expectedRevision)).toEqual([3, 4]);
  });

  it('does not advance lineage after failure or dispatch its dependent save', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: number[] = [];
    const queue = createMutationQueue({
      saveProject(project, expectedRevision) {
        calls.push(expectedRevision);
        if (calls.length === 1) {
          started.resolve();
          return firstWrite.promise;
        }
        return Promise.resolve(snapshotWith(project));
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), 3);
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const dependent = queue.enqueueProjectSave(projectNamed('Dependent'), 99);
    firstWrite.reject(new WorkspaceStoreError('Write failed.', 'conflict'));

    await expect(first).rejects.toMatchObject({ code: 'conflict' });
    await expect(dependent).rejects.toMatchObject({ code: 'conflict' });
    expect(calls).toEqual([3]);

    const retry = queue.enqueueProjectSave(projectNamed('Retry'), 99);
    await vi.advanceTimersByTimeAsync(1_000);
    await retry;
    expect(calls).toEqual([3, 3]);
  });
});
