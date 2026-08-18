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

    await expect(prepareProjectInModuleWorker(source, () => worker)).resolves.toEqual(source);
  });

  it('rejects its response when Worker termination fails during cleanup', async () => {
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
    await expect(preparation).rejects.toMatchObject({ code: 'unavailable' });
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

  it('cleans a partially registered Worker when listener setup fails', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const originalAdd = worker.addEventListener.bind(worker);
    const remove = vi.spyOn(worker, 'removeEventListener');
    worker.addEventListener = vi.fn((type, listener) => {
      if (type === 'error') throw new Error('listener setup failed');
      originalAdd(type, listener);
    });

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('error', expect.any(Function));
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans a listener when registration mutates the Worker and then throws', async () => {
    const worker = new FakeWorker();
    const originalAdd = worker.addEventListener.bind(worker);
    const remove = vi.spyOn(worker, 'removeEventListener');
    worker.addEventListener = vi.fn((type, listener) => {
      originalAdd(type, listener);
      if (type === 'error') throw new Error('listener setup failed after registration');
    });

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('error', expect.any(Function));
    expect(Array.from(worker.listeners.values()).every(listeners => listeners.size === 0)).toBe(true);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('attempts every cleanup and rejects a valid response when required cleanup fails', async () => {
    const worker = new FakeWorker();
    const remove = vi.fn((_type: string, _listener: (event: unknown) => void) => {
      throw new Error('listener removal failed');
    });
    worker.removeEventListener = remove;
    worker.terminate.mockImplementation(() => { throw new Error('termination failed'); });
    worker.postMessage.mockImplementation(() => worker.emit('message', {
      data: {
        type: 'project-prepared',
        requestId: 1,
        project: project(),
      },
    }));

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove.mock.calls.map(([type]) => type)).toEqual([
      'message',
      'error',
      'messageerror',
    ]);
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
    Object.assign(Object.create(null), {
      type: 'project-prepared',
      requestId: 1,
      project: project(),
    }),
    { type: 'project-prepared', requestId: 2, project: project() },
    { type: 'project-prepared', requestId: 1, project: { id: 'project-a' } },
    { type: 'project-prepared', requestId: 1, project: { id: 'project-a', name: 'Missing state' } },
    {
      type: 'project-prepared',
      requestId: 1,
      project: { id: 'project-a', name: 'Wrong state', initialState: [] },
    },
    {
      type: 'project-prepared',
      requestId: 1,
      project: Object.assign(Object.create(null), project()),
    },
    { type: 'project-prepared', requestId: 1, project: { ...project(), id: 'wrong-project' } },
    { type: 'project-prepared', requestId: 1, project: project(), extra: true },
    {
      type: 'project-preparation-failed',
      requestId: 1,
      message: 'ambiguous',
      project: project(),
    },
  ])('rejects malformed or mismatched protocol response %#', async response => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => worker.emit('message', { data: response }));

    await expect(prepareProjectInModuleWorker(project(), () => worker))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects an accessor-hostile envelope without invoking its getter', async () => {
    const worker = new FakeWorker();
    const requestIdGetter = vi.fn(() => { throw new Error('hostile getter ran'); });
    const response = {
      type: 'project-prepared',
      project: project(),
    } as Record<string, unknown>;
    Object.defineProperty(response, 'requestId', {
      enumerable: true,
      get: requestIdGetter,
    });
    worker.postMessage.mockImplementation(() => worker.emit('message', { data: response }));

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(requestIdGetter).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects an accessor-hostile prepared project without invoking its getter', async () => {
    const worker = new FakeWorker();
    const nameGetter = vi.fn(() => { throw new Error('hostile project getter ran'); });
    const prepared = {
      id: 'project-a',
      initialState: currentState(),
    } as Record<string, unknown>;
    Object.defineProperty(prepared, 'name', {
      enumerable: true,
      get: nameGetter,
    });
    worker.postMessage.mockImplementation(() => worker.emit('message', {
      data: { type: 'project-prepared', requestId: 1, project: prepared },
    }));

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(nameGetter).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['invalid current state', () => ({
      prepared: { ...project(), initialState: {} },
    })],
    ['cyclic state', () => {
      const initialState = currentState() as unknown as Record<string, unknown>;
      initialState.cycle = initialState;
      return { prepared: { ...project(), initialState } };
    }],
    ['nested custom prototype', () => {
      const initialState = currentState();
      initialState.nodes.root.data = Object.assign(
        Object.create(null),
        initialState.nodes.root.data,
      );
      return { prepared: { ...project(), initialState } };
    }],
    ['nested accessor', () => {
      const initialState = currentState();
      const getter = vi.fn(() => { throw new Error('hostile nested getter ran'); });
      Object.defineProperty(initialState.nodes.root.data, 'hostile', {
        enumerable: true,
        get: getter,
      });
      return { prepared: { ...project(), initialState }, getter };
    }],
  ] as const)('rejects a deeply malformed prepared project: %s', async (_label, create) => {
    const worker = new FakeWorker();
    const response = create();
    worker.postMessage.mockImplementation(() => worker.emit('message', {
      data: {
        type: 'project-prepared',
        requestId: 1,
        project: response.prepared,
      },
    }));

    await expect(prepareProjectInModuleWorker(project(), () => worker)).rejects.toMatchObject({
      code: 'unavailable',
    });
    if ('getter' in response) expect(response.getter).not.toHaveBeenCalled();
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
