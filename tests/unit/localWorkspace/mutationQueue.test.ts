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
  it('coalesces rapid payloads only from the exact admitted authority lineage', async () => {
    vi.useFakeTimers();
    const calls: Array<{ name: string; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      async saveProject(project, expectedLineage) {
        calls.push({ name: project.name, expectedLineage });
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(3));
    const second = queue.enqueueProjectSave(projectNamed('Newest'), lineage(3));
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);

    expect(calls).toEqual([{ name: 'Newest', expectedLineage: lineage(3) }]);
  });

  it('rejects stale I:0 bytes queued after current I:1 authority', async () => {
    vi.useFakeTimers();
    const calls: Array<{ name: string; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      async saveProject(project, expectedLineage) {
        calls.push({ name: project.name, expectedLineage });
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const current = queue.enqueueProjectSave(projectNamed('Current I:1'), lineage(1));
    const stale = queue.enqueueProjectSave(
      projectNamed('Stale I:0'),
      lineage(0),
    );
    const staleAssertion = expect(stale).rejects.toMatchObject({ code: 'conflict' });
    await vi.advanceTimersByTimeAsync(1_000);
    await staleAssertion;
    await current;

    expect(calls).toEqual([{ name: 'Current I:1', expectedLineage: lineage(1) }]);
  });

  it('rejects current I:1 bytes queued behind stale I:0 authority', async () => {
    vi.useFakeTimers();
    const calls: Array<{ name: string; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      async saveProject(project, expectedLineage) {
        calls.push({ name: project.name, expectedLineage });
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const stale = queue.enqueueProjectSave(projectNamed('Stale I:0'), lineage(0));
    const current = queue.enqueueProjectSave(
      projectNamed('Current I:1'),
      lineage(1),
    );
    const currentAssertion = expect(current).rejects.toMatchObject({ code: 'conflict' });
    await vi.advanceTimersByTimeAsync(1_000);
    await currentAssertion;
    await stale;

    expect(calls).toEqual([{ name: 'Stale I:0', expectedLineage: lineage(0) }]);
  });

  it('pins a save behind an active same-project save to the local next revision', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: Array<{ project: WorkspaceProject; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
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
    const second = queue.enqueueProjectSave(projectNamed('Second'), lineage(3));
    firstWrite.resolve(snapshotWith(projectNamed('First')));
    await Promise.all([first, second]);

    expect(calls.map(call => call.expectedLineage)).toEqual([lineage(3), lineage(4)]);
  });

  it('accepts I:1 bytes after an active I:0 predecessor establishes I:1', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: Array<{ name: string; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      saveProject(project, expectedLineage) {
        calls.push({ name: project.name, expectedLineage });
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

    const first = queue.enqueueProjectSave(projectNamed('First I:0'), lineage(0));
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    firstWrite.resolve(snapshotWith(projectNamed('First I:0')));
    await first;
    const next = queue.enqueueProjectSave(projectNamed('Current I:1'), lineage(1));
    await vi.advanceTimersByTimeAsync(1_000);
    await next;

    expect(calls).toEqual([
      { name: 'First I:0', expectedLineage: lineage(0) },
      { name: 'Current I:1', expectedLineage: lineage(1) },
    ]);
  });

  it('coalesces I:1 bytes after an active predecessor establishes the queued CAS lineage', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: Array<{ name: string; expectedLineage: ProjectLineage }> = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      saveProject(project, expectedLineage) {
        calls.push({ name: project.name, expectedLineage });
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

    const first = queue.enqueueProjectSave(projectNamed('First I:0'), lineage(0));
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const followUp = queue.enqueueProjectSave(projectNamed('Follow-up from I:0'), lineage(0));
    firstWrite.resolve(snapshotWith(projectNamed('First I:0')));
    await first;
    const current = queue.enqueueProjectSave(projectNamed('Current I:1'), lineage(1));
    await Promise.all([followUp, current]);

    expect(calls).toEqual([
      { name: 'First I:0', expectedLineage: lineage(0) },
      { name: 'Current I:1', expectedLineage: lineage(1) },
    ]);
  });

  it('does not advance lineage after failure or dispatch its dependent save', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const calls: ProjectLineage[] = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
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
    const dependent = queue.enqueueProjectSave(projectNamed('Dependent'), lineage(3));
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
      async prepareProject(project) {
        return project;
      },
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

  it('does not advance close lineage for a canceled queued save', async () => {
    vi.useFakeTimers();
    const exclusiveAdmissions: unknown[] = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      async saveProject() {
        throw new Error('Canceled save must not dispatch.');
      },
      async runExclusive(admission) {
        exclusiveAdmissions.push(admission);
        return snapshotWith(projectNamed('Closed'));
      },
    });

    const save = queue.enqueueProjectSave(projectNamed('Canceled I:0'), lineage(0));
    const close = queue.runExclusive({
      kind: 'close',
      command: { type: 'close-project', projectId: 'project-a' },
      targetLineage: lineage(0),
    });
    await Promise.all([save, close]);

    expect(exclusiveAdmissions).toEqual([{
      kind: 'close',
      command: { type: 'close-project', projectId: 'project-a' },
      targetLineage: lineage(0),
    }]);
  });

  it('advances close exactly once behind a successful active target save', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const exclusiveAdmissions: unknown[] = [];
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      saveProject(project) {
        started.resolve();
        return firstWrite.promise.then(() => snapshotWith(project));
      },
      async runExclusive(admission) {
        exclusiveAdmissions.push(admission);
        return snapshotWith(projectNamed('Closed'));
      },
    });

    const save = queue.enqueueProjectSave(projectNamed('Active I:0'), lineage(0));
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const close = queue.runExclusive({
      kind: 'close',
      command: { type: 'close-project', projectId: 'project-a' },
      targetLineage: lineage(0),
    });
    firstWrite.resolve(snapshotWith(projectNamed('Active I:0')));
    await Promise.all([save, close]);

    expect(exclusiveAdmissions).toEqual([{
      kind: 'close',
      command: { type: 'close-project', projectId: 'project-a' },
      targetLineage: lineage(1),
    }]);
  });

  it('rejects close when its active target save fails before advancing lineage', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<WorkspaceSnapshot>();
    const started = deferred();
    const runExclusive = vi.fn();
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      saveProject() {
        started.resolve();
        return firstWrite.promise;
      },
      runExclusive,
    });

    const save = queue.enqueueProjectSave(projectNamed('Active I:0'), lineage(0));
    await vi.advanceTimersByTimeAsync(1_000);
    await started.promise;
    const close = queue.runExclusive({
      kind: 'close',
      command: { type: 'close-project', projectId: 'project-a' },
      targetLineage: lineage(0),
    });
    const saveAssertion = expect(save).rejects.toMatchObject({ code: 'conflict' });
    const closeAssertion = expect(close).rejects.toMatchObject({ code: 'conflict' });
    firstWrite.reject(new WorkspaceStoreError('Write failed.', 'conflict'));

    await Promise.all([saveAssertion, closeAssertion]);
    expect(runExclusive).not.toHaveBeenCalled();
  });
});

describe('deferred project preparation', () => {
  it('clones at admission, then prepares and writes only the newest burst payload', async () => {
    vi.useFakeTimers();
    const prepareProject = vi.fn(async (project: WorkspaceProject) => ({
      ...project,
      name: `${project.name} prepared`,
    }));
    const saveProject = vi.fn(async (project: WorkspaceProject) => snapshotWith(project));
    const queue = createMutationQueue({
      prepareProject,
      saveProject,
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });
    const firstPayload = projectNamed('First');

    const first = queue.enqueueProjectSave(firstPayload, lineage(0));
    firstPayload.name = 'Mutated after admission';
    const newestPayload = projectNamed('Newest');
    const newest = queue.enqueueProjectSave(newestPayload, lineage(0));
    newestPayload.name = 'Also mutated after admission';

    await vi.advanceTimersByTimeAsync(999);
    expect(prepareProject).not.toHaveBeenCalled();
    expect(saveProject).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, newest]);

    expect(prepareProject).toHaveBeenCalledOnce();
    expect(prepareProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Newest' }));
    expect(saveProject).toHaveBeenCalledOnce();
    expect(saveProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Newest prepared' }),
      lineage(0),
    );
  });

  it('shares one immutable physical snapshot across every coalesced waiter', async () => {
    vi.useFakeTimers();
    const physicalSnapshot = snapshotWith(projectNamed('Physical readback'));
    const queue = createMutationQueue({
      async prepareProject(project) {
        return project;
      },
      async saveProject() {
        return physicalSnapshot;
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(0));
    const second = queue.enqueueProjectSave(projectNamed('Second'), lineage(0));
    await vi.advanceTimersByTimeAsync(1_000);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(physicalSnapshot);
    expect(secondResult).toBe(physicalSnapshot);
  });

  it('rejects every coalesced waiter with the same preparation failure and never writes', async () => {
    vi.useFakeTimers();
    const failure = new WorkspaceStoreError('Worker preparation failed.', 'validation');
    const saveProject = vi.fn(async (project: WorkspaceProject) => snapshotWith(project));
    const queue = createMutationQueue({
      async prepareProject() {
        throw failure;
      },
      saveProject,
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(0));
    const second = queue.enqueueProjectSave(projectNamed('Second'), lineage(0));
    const outcomes = Promise.all([
      first.then(() => undefined, error => error),
      second.then(() => undefined, error => error),
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    const [firstError, secondError] = await outcomes;

    expect(firstError).toBe(failure);
    expect(secondError).toBe(failure);
    expect(saveProject).not.toHaveBeenCalled();
  });

  it('cancels deferred preparation on close and settles all canceled waiters from its readback', async () => {
    vi.useFakeTimers();
    const prepareProject = vi.fn();
    const closeSnapshot = snapshotWith(projectNamed('Closed readback'));
    const queue = createMutationQueue({
      prepareProject,
      async saveProject() {
        throw new Error('Canceled save must not dispatch.');
      },
      async runExclusive() {
        return closeSnapshot;
      },
    });

    const first = queue.enqueueProjectSave(projectNamed('First'), lineage(0));
    const second = queue.enqueueProjectSave(projectNamed('Second'), lineage(0));
    const close = queue.runExclusive({
      kind: 'close',
      command: { type: 'close-project', projectId: 'project-a' },
      targetLineage: lineage(0),
    });
    const [firstResult, secondResult, closeResult] = await Promise.all([first, second, close]);

    expect(prepareProject).not.toHaveBeenCalled();
    expect(firstResult).toBe(closeSnapshot);
    expect(secondResult).toBe(closeSnapshot);
    expect(closeResult).toBe(closeSnapshot);
  });

  it('freezes new admission while deferred accepted work prepares and drain waits for settlement', async () => {
    vi.useFakeTimers();
    const prepareProject = vi.fn(async (project: WorkspaceProject) => project);
    const queue = createMutationQueue({
      prepareProject,
      async saveProject(project) {
        return snapshotWith(project);
      },
      async runExclusive() {
        throw new Error('Unexpected exclusive command.');
      },
    });

    const accepted = queue.enqueueProjectSave(projectNamed('Accepted'), lineage(0));
    queue.freeze();
    await expect(queue.enqueueProjectSave(projectNamed('Rejected'), lineage(0)))
      .rejects.toMatchObject({ code: 'authority-lost' });
    let drained = false;
    const drain = queue.drain().then(() => { drained = true; });

    await vi.advanceTimersByTimeAsync(999);
    expect(prepareProject).not.toHaveBeenCalled();
    expect(drained).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([accepted, drain]);

    expect(prepareProject).toHaveBeenCalledOnce();
    expect(drained).toBe(true);
  });
});
