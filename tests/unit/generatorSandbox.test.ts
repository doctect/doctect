import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    runGeneratorSandbox,
    type GeneratorSandboxEnvironment,
    type GeneratorSandboxRequest,
} from '../../services/generatorSandbox';

const validRequest = (): GeneratorSandboxRequest => ({
    templateScript: 'return { page: { id: "page" } };',
    hierarchyScript: 'return { nodes: {}, rootId: "root" };',
    constants: { RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679, A4_WIDTH: 595.28, A4_HEIGHT: 841.89 },
});

const fakeEnvironment = (options: { signal?: AbortSignal; post?: (request: GeneratorSandboxRequest) => void } = {}) => {
    let receive: (message: unknown) => void = () => undefined;
    const dispose = vi.fn();
    const post = vi.fn(options.post ?? (() => undefined));
    const environment: GeneratorSandboxEnvironment = {
        createRequestToken: () => 'test-token',
        createFrame: ({ onMessage }) => {
            receive = onMessage;
            return { post, dispose };
        },
        signal: options.signal,
    };
    return { environment, dispose, post, receive: (message: unknown) => receive(message) };
};

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('runGeneratorSandbox transport', () => {
    it('returns a valid result and tears down exactly once', async () => {
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        expect(frame.post).toHaveBeenCalledWith(validRequest());
        frame.receive({
            type: 'generator-result',
            requestToken: 'test-token',
            ok: true,
            value: { templates: { page: {} }, hierarchy: { nodes: {}, rootId: 'root' } },
        });
        frame.receive({ type: 'generator-result', requestToken: 'test-token', ok: false, category: 'runtime', message: 'late' });

        await expect(pending).resolves.toEqual({
            ok: true,
            value: { templates: { page: {} }, hierarchy: { nodes: {}, rootId: 'root' } },
        });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
    });

    it.each(['runtime', 'clone'] as const)('returns %s failures and tears down', async category => {
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        frame.receive({ type: 'generator-result', requestToken: 'test-token', ok: false, category, message: 'worker failed' });

        await expect(pending).resolves.toEqual({ ok: false, category, message: 'worker failed' });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed messages for its token as protocol failures', async () => {
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        frame.receive({ type: 'generator-result', requestToken: 'test-token', ok: true, value: { templates: {} } });

        await expect(pending).resolves.toMatchObject({ ok: false, category: 'protocol' });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
    });

    it('ignores messages carrying another request token', async () => {
        vi.useFakeTimers();
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        frame.receive({
            type: 'generator-result',
            requestToken: 'attacker-token',
            ok: true,
            value: { templates: {}, hierarchy: {} },
        });
        await vi.advanceTimersByTimeAsync(5000);

        await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout' });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
    });

    it('times out after 5,000 ms and tears down exactly once', async () => {
        vi.useFakeTimers();
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        await vi.advanceTimersByTimeAsync(4999);
        expect(frame.dispose).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout' });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
    });

    it('supports cancellation and removes its abort listener during teardown', async () => {
        const controller = new AbortController();
        const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');
        const frame = fakeEnvironment({ signal: controller.signal });
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        controller.abort();

        await expect(pending).resolves.toMatchObject({ ok: false, category: 'runtime', message: expect.stringMatching(/cancel/i) });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
        expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    });

    it('tears down when posting the request throws', async () => {
        const frame = fakeEnvironment({ post: () => { throw new DOMException('cannot clone', 'DataCloneError'); } });

        await expect(runGeneratorSandbox(validRequest(), frame.environment)).resolves.toMatchObject({ ok: false, category: 'clone' });
        expect(frame.dispose).toHaveBeenCalledTimes(1);
    });
});

describe('browser sandbox frame', () => {
    it('uses an opaque iframe with the required CSP and removes it on timeout', async () => {
        vi.useFakeTimers();
        const pending = runGeneratorSandbox({ ...validRequest(), timeoutMs: 1 });
        const iframe = document.body.querySelector('iframe');

        expect(iframe).not.toBeNull();
        expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts');
        expect(iframe!.getAttribute('sandbox')).not.toContain('allow-same-origin');
        expect(iframe!.srcdoc).toContain("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'");
        expect(iframe!.srcdoc).toContain('worker.terminate()');
        expect(iframe!.srcdoc).toContain('URL.revokeObjectURL(workerUrl)');
        expect(iframe!.srcdoc).toContain('const normalizedTemplates = normalizeTemplates(templates)');
        expect(iframe!.srcdoc).toContain('value: { templates: normalizedTemplates, hierarchy }');
        expect(iframe!.srcdoc).toContain('return normalizeFlat(raw)');

        await vi.advanceTimersByTimeAsync(1);
        await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout' });
        expect(document.body.querySelector('iframe')).toBeNull();
    });

    it('removes the iframe even when posting cancellation fails', async () => {
        vi.useFakeTimers();
        const pending = runGeneratorSandbox({ ...validRequest(), timeoutMs: 1 });
        const iframe = document.body.querySelector('iframe')!;
        vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation((message: unknown) => {
            if ((message as { type?: string })?.type === 'generator-cancel') throw new Error('window is gone');
        });

        await vi.advanceTimersByTimeAsync(1);

        await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout' });
        expect(document.body.querySelector('iframe')).toBeNull();
    });
});
