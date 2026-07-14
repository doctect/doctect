import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from '@playwright/test';
import {
    runGeneratorSandbox,
    type GeneratorSandboxEnvironment,
    type GeneratorSandboxRequest,
} from '../../services/generatorSandbox';
import { normalizeGeneratedTemplates } from '../../services/generatorTemplates';

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
        expect(iframe!.srcdoc).toContain('trustedByteLength(trustedEncode(serialized))');
        expect(iframe!.srcdoc).toContain('const trustedStringify = JSON.stringify.bind(JSON)');
        expect(iframe!.srcdoc).toContain('const trustedEncoder = new TextEncoder()');
        expect(iframe!.srcdoc).toContain('const trustedEncode = trustedEncoder.encode.bind(trustedEncoder)');
        expect(iframe!.srcdoc).toContain('trustedObjectGetOwnPropertyDescriptor(typedArrayPrototype, \\"byteLength\\")');
        expect(iframe!.srcdoc).toContain('trustedByteLengthGetter.call.bind(trustedByteLengthGetter)');
        expect(iframe!.srcdoc).toContain('const trustedPost = resultPort.postMessage.bind(resultPort)');
        expect(iframe!.srcdoc).toContain(String(5 * 1024 * 1024));
        expect(iframe!.srcdoc).toContain('Generated output exceeds');
        expect(iframe!.srcdoc).toContain('JSON.parse(message.serialized)');
        expect(iframe!.srcdoc).toContain('const trustedArrayIsArray = Array.isArray');
        expect(iframe!.srcdoc).toContain('const trustedObjectHasOwn = Object.hasOwn');
        expect(iframe!.srcdoc).toContain('const TrustedSet = Set');
        expect(iframe!.srcdoc).toContain('trustedObjectCreate(null)');
        expect(iframe!.srcdoc).toContain('trustedObjectHasOwn(variants, raw.activeVariantId)');
        expect(iframe!.srcdoc).toContain('typeof normalizedElement.layerId !== \\"string\\"');
        expect(iframe!.srcdoc).toContain('trustedSetHas(layerIds, normalizedElement.layerId)');
        expect(iframe!.srcdoc).toContain('safely(() => workerToTerminate.terminate())');
        expect(iframe!.srcdoc).toContain('safely(() => URL.revokeObjectURL(urlToRevoke))');

        settleFrame(iframe!);
        await expect(pending).resolves.toMatchObject({ ok: true });
        expect(document.body.querySelector('iframe')).toBeNull();
    });

    it('enforces output bytes and layer agreement in Chromium', async () => {
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            (array as Uint8Array).fill(0);
            return array;
        });
        const pending = runGeneratorSandbox(validRequest());
        const iframe = document.body.querySelector('iframe')!;
        const sourceMatch = iframe.srcdoc.match(/const workerSource = (".*");\n  let worker/s);
        expect(sourceMatch).not.toBeNull();
        const workerSource = JSON.parse(sourceMatch![1]);
        settleFrame(iframe);
        await pending;

        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            const results = await page.evaluate(async source => {
                const runWorker = (request: unknown) => new Promise<any>((resolve, reject) => {
                    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                    const worker = new Worker(url);
                    URL.revokeObjectURL(url);
                    const channel = new MessageChannel();
                    channel.port1.onmessage = event => {
                        worker.terminate();
                        channel.port1.close();
                        resolve(event.data);
                    };
                    worker.onerror = event => reject(new Error(event.message));
                    worker.postMessage(request, [channel.port2]);
                });
                const constants = { RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679, A4_WIDTH: 595.28, A4_HEIGHT: 841.89 };
                const oversized = await runWorker({
                    templateScript: `
                        const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
                        Object.defineProperty(typedArrayPrototype, 'byteLength', { configurable: true, get: () => 0 });
                        return { page: { id: 'page', name: 'Page', width: 509, height: 679,
                            elements: [{ id: 'large', type: 'text', text: 'x'.repeat(6 * 1024 * 1024) }] } };
                    `,
                    hierarchyScript: `return { nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } }, rootId: 'root' };`,
                    constants,
                });
                const layers = await runWorker({
                    templateScript: `return { page: {
                        id: 'page', name: 'Page', width: 509, height: 679,
                        layers: [
                            { id: 'fallback', name: 'Fallback', order: 0, visible: true, locked: false },
                            { id: 'valid', name: 'Valid', order: 1, visible: true, locked: false }
                        ],
                        elements: [
                            { id: 'dangling', type: 'rect', layerId: 'missing-layer' },
                            { id: 'valid-element', type: 'rect', layerId: 'valid' },
                            { id: 'missing', type: 'rect' }
                        ]
                    } };`,
                    hierarchyScript: `
                        const ids = templates.page.elements.map(element => element.layerId);
                        return { nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: { ids: ids.join(',') }, children: [] } }, rootId: 'root' };
                    `,
                    constants,
                });
                return {
                    oversized,
                    layers: layers.ok ? { ...layers, value: JSON.parse(layers.serialized) } : layers,
                };
            }, workerSource);

            expect(results.oversized).toEqual({
                ok: false,
                category: 'runtime',
                message: `Generated output exceeds ${5 * 1024 * 1024} bytes.`,
            });
            expect(JSON.stringify(results.oversized).length).toBeLessThan(200);
            expect(results.layers.ok).toBe(true);
            const workerValue = results.layers.value;
            const finalTemplates = normalizeGeneratedTemplates(workerValue.templates).templates!;
            const hierarchyIds = workerValue.hierarchy.nodes.root.data.ids.split(',');
            expect(hierarchyIds).toEqual(['fallback', 'valid', 'fallback']);
            expect(finalTemplates.page.elements.map(element => element.layerId)).toEqual(hierarchyIds);
        } finally {
            await browser.close();
        }
    }, 20_000);

    it('isolates every trusted post-source intrinsic in Chromium', async () => {
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            (array as Uint8Array).fill(0);
            return array;
        });
        const pending = runGeneratorSandbox(validRequest());
        const iframe = document.body.querySelector('iframe')!;
        const sourceMatch = iframe.srcdoc.match(/const workerSource = (".*");\n  let worker/s);
        expect(sourceMatch).not.toBeNull();
        const workerSource = JSON.parse(sourceMatch![1]);
        settleFrame(iframe);
        await pending;

        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            const results = await page.evaluate(async source => {
                const runWorker = (request: unknown) => new Promise<any>((resolve, reject) => {
                    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                    const worker = new Worker(url);
                    URL.revokeObjectURL(url);
                    const channel = new MessageChannel();
                    const timeout = setTimeout(() => {
                        worker.terminate();
                        channel.port1.close();
                        resolve({ ok: false, category: 'timeout', message: 'Worker did not deliver a result.' });
                    }, 2_000);
                    channel.port1.onmessage = event => {
                        clearTimeout(timeout);
                        worker.terminate();
                        channel.port1.close();
                        resolve(event.data);
                    };
                    worker.onerror = event => reject(new Error(event.message));
                    worker.postMessage(request, [channel.port2]);
                });
                const constants = { RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679, A4_WIDTH: 595.28, A4_HEIGHT: 841.89 };
                const hierarchyScript = `
                    const elements = templates.page.elements;
                    let ids = '';
                    for (let index = 0; index < elements.length; index += 1) {
                        if (index > 0) ids += ',';
                        ids += elements[index].layerId;
                    }
                    return { nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: { ids }, children: [] } }, rootId: 'root' };
                `;
                const templateAfter = (mutation: string, template: string) => `${mutation}\nreturn ${template};`;
                const layeredTemplate = `{
                    variants: { v: { id: 'v', name: 'V', templates: { page: {
                        id: 'page', name: 'Page', width: 509, height: 679,
                        layers: [
                            { id: 'fallback', name: 'Fallback', order: 0, visible: true, locked: false },
                            { id: 'valid', name: 'Valid', order: 1, visible: true, locked: false }
                        ],
                        elements: [
                            { id: 'dangling', type: 'rect', layerId: 'missing-layer' },
                            { id: 'valid-element', type: 'rect', layerId: 'valid' },
                            { id: 'missing', type: 'rect' }
                        ]
                    } } } }, activeVariantId: 'missing'
                }`;
                const generatedIdTemplate = `{
                    page: { id: 'page', name: 'Page', width: 509, height: 679, elements: [{ type: 'rect' }] }
                }`;
                const attacks = [
                    ['Set constructor', `Set = class { add() {} has() { return true; } }`, layeredTemplate],
                    ['Set.add', `Set.prototype.add = () => { throw 'poisoned Set.add'; }`, layeredTemplate],
                    ['Set.has', `Set.prototype.has = () => true`, layeredTemplate],
                    ['Array.isArray', `Array.isArray = () => false`, layeredTemplate],
                    ['Object.create', `Object.create = () => { throw 'poisoned Object.create'; }`, layeredTemplate],
                    ['Object.values', `Object.values = () => { throw 'poisoned Object.values'; }`, layeredTemplate],
                    ['Object.entries', `Object.entries = () => { throw 'poisoned Object.entries'; }`, layeredTemplate],
                    ['Object.keys', `Object.keys = () => { throw 'poisoned Object.keys'; }`, layeredTemplate],
                    ['Object.hasOwn', `Object.hasOwn = () => { throw 'poisoned Object.hasOwn'; }`, layeredTemplate],
                    ['Object.getPrototypeOf', `Object.getPrototypeOf = () => { throw 'poisoned Object.getPrototypeOf'; }`, layeredTemplate],
                    ['Object.getOwnPropertyDescriptor', `Object.getOwnPropertyDescriptor = () => { throw 'poisoned Object.getOwnPropertyDescriptor'; }`, layeredTemplate],
                    ['Reflect.ownKeys', `Reflect.ownKeys = () => { throw 'poisoned Reflect.ownKeys'; }`, layeredTemplate],
                    ['Number.isFinite', `Number.isFinite = () => { throw 'poisoned Number.isFinite'; }`, layeredTemplate],
                    ['WeakSet constructor', `WeakSet = class {}`, layeredTemplate],
                    ['WeakSet.add', `WeakSet.prototype.add = () => { throw 'poisoned WeakSet.add'; }`, layeredTemplate],
                    ['WeakSet.has', `WeakSet.prototype.has = () => { throw 'poisoned WeakSet.has'; }`, layeredTemplate],
                    ['WeakSet.delete', `WeakSet.prototype.delete = () => { throw 'poisoned WeakSet.delete'; }`, layeredTemplate],
                    ['Function', `Function = () => { throw 'poisoned Function'; }`, layeredTemplate],
                    ['Math.random', `Math.random = () => { throw 'poisoned Math.random'; }`, generatedIdTemplate],
                    ['Number.toString', `Number.prototype.toString = () => { throw 'poisoned Number.toString'; }`, generatedIdTemplate],
                    ['String.slice', `String.prototype.slice = () => { throw 'poisoned String.slice'; }`, generatedIdTemplate],
                    ['JSON.stringify', `JSON.stringify = () => 'poisoned JSON.stringify'`, layeredTemplate],
                    ['TextEncoder', `TextEncoder = class { encode() { return new Uint8Array(0); } }`, layeredTemplate],
                    ['typed-array byteLength', `
                        const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
                        Object.defineProperty(typedArrayPrototype, 'byteLength', { configurable: true, get: () => 0 });
                    `, layeredTemplate],
                    ['MessagePort.postMessage', `MessagePort.prototype.postMessage = () => { throw 'poisoned postMessage'; }`, layeredTemplate],
                ];
                const outputs = await Promise.all(attacks.map(async ([name, mutation, template]) => {
                    const output = await runWorker({
                        templateScript: templateAfter(mutation, template),
                        hierarchyScript,
                        constants,
                    });
                    return [name, output.ok ? { ...output, value: JSON.parse(output.serialized) } : output];
                }));
                const stringFailure = await runWorker({
                    templateScript: `String = () => 'poisoned String'; return ${layeredTemplate};`,
                    hierarchyScript: `throw {};`,
                    constants,
                });
                const stringSliceFailure = await runWorker({
                    templateScript: `String.prototype.slice = () => 'poisoned String.slice'; return ${layeredTemplate};`,
                    hierarchyScript: `throw new Error('expected hierarchy failure');`,
                    constants,
                });
                const errorFailure = await runWorker({
                    templateScript: `
                        Error = class { constructor() { this.name = 'PoisonedError'; this.message = 'poisoned Error'; } };
                        return { page: { id: 'page', width: NaN } };
                    `,
                    hierarchyScript,
                    constants,
                });
                return { outputs, stringFailure, stringSliceFailure, errorFailure };
            }, workerSource);

            for (const [name, output] of results.outputs) {
                expect(output, name).toMatchObject({ ok: true });
                const activeVariant = output.value.templates.variants?.v;
                const templates = activeVariant?.templates ?? output.value.templates;
                const hierarchyIds = output.value.hierarchy.nodes.root.data.ids.split(',');
                const finalTemplates = normalizeGeneratedTemplates(output.value.templates);
                const finalPage = finalTemplates.variants?.v.templates.page ?? finalTemplates.templates!.page;
                expect(hierarchyIds, name).toEqual(finalPage.elements.map(element => element.layerId));
                expect(templates.page.elements.map(element => element.layerId), name).toEqual(hierarchyIds);
            }
            expect(results.stringFailure).toEqual({ ok: false, category: 'runtime', message: '[object Object]' });
            expect(results.stringSliceFailure).toEqual({ ok: false, category: 'runtime', message: 'expected hierarchy failure' });
            expect(results.errorFailure).toEqual({ ok: false, category: 'clone', message: 'Output contains a non-finite number.' });
        } finally {
            await browser.close();
        }
    }, 20_000);

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
