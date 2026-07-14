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
    let timeout: (() => void) | undefined;
    const dispose = vi.fn();
    const post = vi.fn(options.post ?? (() => undefined));
    const scheduleTimeout = vi.fn((callback: () => void, _delay: number) => {
        timeout = callback;
        return 'test-timeout';
    });
    const cancelTimeout = vi.fn();
    const environment = {
        createRequestToken: () => 'test-token',
        createFrame: ({ onMessage }) => {
            receive = onMessage;
            return { post, dispose };
        },
        signal: options.signal,
        scheduleTimeout,
        cancelTimeout,
    } as GeneratorSandboxEnvironment;
    return {
        environment,
        dispose,
        post,
        scheduleTimeout,
        cancelTimeout,
        fireTimeout: () => timeout?.(),
        receive: (message: unknown) => receive(message),
    };
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        try {
            frame.receive({
                type: 'generator-result',
                requestToken: 'attacker-token',
                ok: true,
                value: { templates: {}, hierarchy: {} },
            });
            expect(frame.scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);
            frame.fireTimeout();

            await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout' });
            expect(frame.dispose).toHaveBeenCalledTimes(1);
        } finally {
            frame.receive({ type: 'generator-result', requestToken: 'test-token', ok: false, category: 'runtime', message: 'cleanup' });
        }
    });

    it('uses the fixed 10,000 ms injected timeout and ignores caller timeoutMs', async () => {
        const frame = fakeEnvironment();
        const request = { ...validRequest(), timeoutMs: 1 } as GeneratorSandboxRequest;
        const pending = runGeneratorSandbox(request, frame.environment);

        try {
            expect(frame.scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);
            expect(frame.post).toHaveBeenCalledWith(validRequest());
            frame.fireTimeout();

            await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout', message: expect.stringContaining('10000') });
            expect(frame.dispose).toHaveBeenCalledTimes(1);
            expect(frame.cancelTimeout).toHaveBeenCalledWith('test-timeout');
        } finally {
            frame.receive({ type: 'generator-result', requestToken: 'test-token', ok: false, category: 'runtime', message: 'cleanup' });
        }
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

    it('rejects non-string and oversized source before creating a frame', async () => {
        const createFrame = vi.fn(() => { throw new Error('must not create frame'); });
        const environment = {
            createRequestToken: vi.fn(() => 'test-token'),
            createFrame,
        } as GeneratorSandboxEnvironment;

        await expect(runGeneratorSandbox({ ...validRequest(), templateScript: 42 } as any, environment)).resolves.toMatchObject({ ok: false, category: 'protocol' });
        await expect(runGeneratorSandbox({ ...validRequest(), hierarchyScript: 'x'.repeat(512 * 1024 + 1) }, environment)).resolves.toMatchObject({ ok: false, category: 'protocol' });
        expect(createFrame).not.toHaveBeenCalled();
        expect(environment.createRequestToken).not.toHaveBeenCalled();
    });

    it('accepts source exactly at the per-script and combined byte ceilings', async () => {
        const frame = fakeEnvironment();
        const request: GeneratorSandboxRequest = {
            ...validRequest(),
            templateScript: 'x'.repeat(512 * 1024),
            hierarchyScript: 'y'.repeat(512 * 1024),
        };
        const pending = runGeneratorSandbox(request, frame.environment);

        frame.receive({
            type: 'generator-result', requestToken: 'test-token', ok: true,
            value: { templates: {}, hierarchy: {} },
        });

        await expect(pending).resolves.toMatchObject({ ok: true });
        expect(frame.post).toHaveBeenCalledWith(request);
    });

    it('requires failure category to be a primitive string', async () => {
        const frame = fakeEnvironment();
        const pending = runGeneratorSandbox(validRequest(), frame.environment);

        frame.receive({
            type: 'generator-result', requestToken: 'test-token', ok: false,
            category: { toString: () => 'runtime' }, message: 'forged',
        });

        await expect(pending).resolves.toMatchObject({ ok: false, category: 'protocol' });
    });
});

describe('browser sandbox frame', () => {
    const deterministicToken = '00'.repeat(16);
    const settleFrame = (iframe: HTMLIFrameElement) => window.dispatchEvent(new MessageEvent('message', {
        source: iframe.contentWindow,
        data: {
            type: 'generator-result', requestToken: deterministicToken, ok: true,
            value: { templates: {}, hierarchy: {} },
        },
    }));

    it('uses an opaque iframe, private Worker channel, and pre-clone output bound', async () => {
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            (array as Uint8Array).fill(0);
            return array;
        });
        const pending = runGeneratorSandbox(validRequest());
        const iframe = document.body.querySelector('iframe');

        expect(iframe).not.toBeNull();
        expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts');
        expect(iframe!.getAttribute('sandbox')).not.toContain('allow-same-origin');
        expect(iframe!.srcdoc).toContain("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'");
        expect(iframe!.srcdoc).toContain('const normalizedTemplates = normalizeTemplates(templates)');
        expect(iframe!.srcdoc).toContain('const value = { templates: normalizedTemplates, hierarchy }');
        expect(iframe!.srcdoc).toContain('return normalizeFlat(raw)');
        expect(iframe!.srcdoc).toContain('new MessageChannel()');
        expect(iframe!.srcdoc).toContain('resultPort.onmessage');
        expect(iframe!.srcdoc).not.toContain('worker.onmessage');
        expect(iframe!.srcdoc).toContain('trustedEncode(serialized).byteLength');
        expect(iframe!.srcdoc).toContain('const trustedStringify = JSON.stringify.bind(JSON)');
        expect(iframe!.srcdoc).toContain('const trustedEncoder = new TextEncoder()');
        expect(iframe!.srcdoc).toContain('const trustedEncode = trustedEncoder.encode.bind(trustedEncoder)');
        expect(iframe!.srcdoc).toContain('const trustedPost = resultPort.postMessage.bind(resultPort)');
        expect(iframe!.srcdoc).toContain(String(5 * 1024 * 1024));
        expect(iframe!.srcdoc).toContain('Generated output exceeds');
        expect(iframe!.srcdoc).toContain('JSON.parse(message.serialized)');
        expect(iframe!.srcdoc).toContain('Object.create(null)');
        expect(iframe!.srcdoc).toContain('Object.hasOwn(variants, raw.activeVariantId)');
        expect(iframe!.srcdoc).toContain('safely(() => workerToTerminate.terminate())');
        expect(iframe!.srcdoc).toContain('safely(() => URL.revokeObjectURL(urlToRevoke))');

        settleFrame(iframe!);
        await expect(pending).resolves.toMatchObject({ ok: true });
        expect(document.body.querySelector('iframe')).toBeNull();
    });

    it('removes the iframe even when posting cancellation fails', async () => {
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            (array as Uint8Array).fill(0);
            return array;
        });
        const pending = runGeneratorSandbox(validRequest());
        const iframe = document.body.querySelector('iframe')!;
        vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation((message: unknown) => {
            if ((message as { type?: string })?.type === 'generator-cancel') throw new Error('window is gone');
        });

        settleFrame(iframe);

        await expect(pending).resolves.toMatchObject({ ok: true });
        expect(document.body.querySelector('iframe')).toBeNull();
    });

    it('runs each frame cleanup independently when earlier operations throw', async () => {
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            (array as Uint8Array).fill(0);
            return array;
        });
        const removeWindowListener = vi.spyOn(window, 'removeEventListener');
        const pending = runGeneratorSandbox(validRequest());
        const iframe = document.body.querySelector('iframe')!;
        const removeFrame = vi.spyOn(iframe, 'remove');
        vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation((message: unknown) => {
            if ((message as { type?: string })?.type === 'generator-cancel') throw new Error('cancel failed');
        });
        vi.spyOn(iframe, 'removeEventListener').mockImplementation((type: string) => {
            if (type === 'load') throw new Error('listener failed');
        });

        settleFrame(iframe);

        await expect(pending).resolves.toMatchObject({ ok: true });
        expect(removeWindowListener).toHaveBeenCalledWith('message', expect.any(Function));
        expect(removeFrame).toHaveBeenCalledOnce();
    });

    it('rolls back default frame listeners when append setup throws', async () => {
        const removeWindowListener = vi.spyOn(window, 'removeEventListener');
        vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => {
            throw new Error('append failed');
        });

        await expect(runGeneratorSandbox(validRequest())).resolves.toMatchObject({ ok: false, category: 'runtime' });

        expect(removeWindowListener).toHaveBeenCalledWith('message', expect.any(Function));
        expect(document.body.querySelector('iframe')).toBeNull();
    });
});
