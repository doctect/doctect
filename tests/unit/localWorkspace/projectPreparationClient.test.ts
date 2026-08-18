// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceProject } from '../../../services/localWorkspace/contracts';
import {
  prepareProjectInModuleWorker,
  type ProjectPreparationWorker,
} from '../../../services/localWorkspace/projectPreparationClient';
import { currentState } from '../../helpers/localWorkspaceFixtures';

const project = (name = 'Worker project'): WorkspaceProject => ({
  id: 'project-a',
  name,
  initialState: currentState(),
});

class FakeWorker implements ProjectPreparationWorker {
  readonly terminate = vi.fn();
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly postMessage = vi.fn<(message: unknown) => void>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

afterEach(() => vi.useRealTimers());

describe('private project preparation worker client', () => {
  it('uses exact module-worker protocol and cleans up after one prepared response', async () => {
    const worker = new FakeWorker();
    const source = project();
    worker.postMessage.mockImplementation(message => {
      expect(message).toEqual({
        type: 'prepare-project',
        requestId: 1,
        project: source,
      });
      worker.emit('message', {
        data: {
          type: 'project-prepared',
          requestId: 1,
          project: { ...source, name: 'Prepared in Worker' },
        },
      });
    });

    await expect(prepareProjectInModuleWorker(source, () => worker)).resolves.toMatchObject({
      id: source.id,
      name: 'Prepared in Worker',
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(Array.from(worker.listeners.values()).every(listeners => listeners.size === 0)).toBe(true);
  });

  it('accepts a native-prototype MessageEvent response', async () => {
    const worker = new FakeWorker();
    const source = project();
    class NativeLikeMessageEvent {
      constructor(readonly data: unknown) {}
    }
    worker.postMessage.mockImplementation(() => worker.emit(
      'message',
      new NativeLikeMessageEvent({
        type: 'project-prepared',
        requestId: 1,
        project: source,
      }),
    ));

    await expect(prepareProjectInModuleWorker(source, () => worker)).resolves.toBe(source);
  });

  it('settles its response even when Worker termination throws during cleanup', async () => {
    const worker = new FakeWorker();
    const source = project();
    worker.terminate.mockImplementation(() => { throw new Error('termination failed'); });
    worker.postMessage.mockImplementation(() => worker.emit('message', {
      data: {
        type: 'project-prepared',
        requestId: 1,
        project: source,
      },
    }));
    let settled = false;

    const preparation = prepareProjectInModuleWorker(source, () => worker)
      .finally(() => { settled = true; });
    await Promise.resolve();

    expect(settled).toBe(true);
    await expect(preparation).resolves.toBe(source);
  });

  it('rejects unsupported Worker execution without main-thread fallback', async () => {
    expect(globalThis.Worker).toBeUndefined();

    await expect(prepareProjectInModuleWorker(project())).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('rejects constructor and postMessage startup failures and terminates created workers', async () => {
    const startupFailure = new Error('module load blocked');
    await expect(prepareProjectInModuleWorker(project(), () => { throw startupFailure; }))
      .rejects.toMatchObject({ code: 'unavailable', cause: startupFailure });

    const worker = new FakeWorker();
    const messageFailure = new Error('structured clone failed');
    worker.postMessage.mockImplementation(() => { throw messageFailure; });
    await expect(prepareProjectInModuleWorker(project(), () => worker))
      .rejects.toMatchObject({ code: 'unavailable', cause: messageFailure });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects and terminates a silent Worker instead of abandoning its save waiter', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const preparation = prepareProjectInModuleWorker(project(), () => worker);
    let settled = false;
    const outcome = preparation.then(
      () => undefined,
      error => error,
    ).finally(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toMatchObject({ code: 'unavailable' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['worker error', 'error', { error: new Error('worker crashed'), message: 'worker crashed' }],
    ['message decoding error', 'messageerror', { data: 'undecodable' }],
  ] as const)('rejects %s and cleans up', async (_, eventType, event) => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => worker.emit(eventType, event));

    await expect(prepareProjectInModuleWorker(project(), () => worker))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    null,
    {},
    { type: 'project-prepared', requestId: 2, project: project() },
    { type: 'project-prepared', requestId: 1, project: { ...project(), id: 'wrong-project' } },
    { type: 'project-prepared', requestId: 1, project: project(), extra: true },
  ])('rejects malformed or mismatched protocol response %#', async response => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => worker.emit('message', { data: response }));

    await expect(prepareProjectInModuleWorker(project(), () => worker))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('maps worker preparation rejection to validation without returning payload bytes', async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => worker.emit('message', {
      data: {
        type: 'project-preparation-failed',
        requestId: 1,
        message: 'Cannot load future schema version 12.',
      },
    }));

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'validation',
      message: 'Cannot load future schema version 12.',
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
