import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkspaceStoreError,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../../services/localWorkspace/contracts';
import { createMutationQueue } from '../../../services/localWorkspace/mutationQueue';
import type { ProjectLineage } from '../../../services/localWorkspace/schema';
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

const lineage = (revision: number, incarnation = 'incarnation-a'): ProjectLineage => ({
  incarnation,
  revision,
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
    const calls: Array<{ name: string; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async saveProject(project, expectedLineage) {
        calls.push({ name: project.name, expectedLineage });
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(3));
    const second = queue.enqueueProjectSave(projectNamed('Newest'), lineage(99));
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);

    expect(calls).toEqual([{ name: 'Newest', expectedLineage: lineage(3) }]);
  });

  it('pins a save behind an active same-project save to the local next revision', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: Array<{ project: WorkspaceProject; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      saveProject(project, expectedLineage) {
        calls.push({ project, expectedLineage });
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

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(3));
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const second = queue.enqueueProjectSave(projectNamed('Second'), lineage(99));
    firstWrite.resolve(snapshotWith(projectNamed('First')));
    await Promise.all([first, second]);

    expect(calls.map(call => call.expectedLineage)).toEqual([lineage(3), lineage(4)]);
  });

  it('does not advance lineage after failure or dispatch its dependent save', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: ProjectLineage[] = [];
    const queue = createMutationQueue({
      saveProject(project, expectedLineage) {
        calls.push(expectedLineage);
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

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(3));
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const dependent = queue.enqueueProjectSave(projectNamed('Dependent'), lineage(99));
    firstWrite.reject(new WorkspaceStoreError('Write failed.', 'conflict'));

    await expect(first).rejects.toMatchObject({ code: 'conflict' });
    await expect(dependent).rejects.toMatchObject({ code: 'conflict' });
    expect(calls).toEqual([lineage(3)]);

    const retry = queue.enqueueProjectSave(projectNamed('Retry'), lineage(3));
    await vi.advanceTimersByTimeAsync(1_000);
    await retry;
    expect(calls).toEqual([lineage(3), lineage(3)]);
  });

  it('does not coalesce a replacement incarnation into an admitted save', async () => {
    vi.useFakeTimers();
    const queue = createMutationQueue({
      async saveProject(project) {
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const admitted = queue.enqueueProjectSave(projectNamed('Original'), lineage(0, 'old'));
    await expect(queue.enqueueProjectSave(
      projectNamed('Replacement'),
      lineage(0, 'replacement'),
    )).rejects.toMatchObject({ code: 'conflict' });
    await vi.advanceTimersByTimeAsync(1_000);
    await admitted;
  });
});
