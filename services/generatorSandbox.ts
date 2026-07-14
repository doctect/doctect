import {
    GENERATOR_COMBINED_MAX_BYTES,
    GENERATOR_SCRIPT_MAX_BYTES,
} from '../shared/generatorMetadata.js';
import { MAX_STATE_BYTES } from '../shared/projectLimits.js';

export interface GeneratorSandboxRequest {
    templateScript: string;
    hierarchyScript: string;
    constants: { RM_PP_WIDTH: number; RM_PP_HEIGHT: number; A4_WIDTH: number; A4_HEIGHT: number };
}

export interface GeneratorSandboxRawResult {
    templates: unknown;
    hierarchy: unknown;
}

export interface GeneratorSandboxEnvironment {
    createRequestToken(): string;
    createFrame(args: {
        requestToken: string;
        onMessage: (message: unknown) => void;
    }): { post: (request: GeneratorSandboxRequest) => void; dispose: () => void };
    signal?: AbortSignal;
    scheduleTimeout?(callback: () => void, delayMs: number): unknown;
    cancelTimeout?(handle: unknown): void;
}

export type GeneratorSandboxResult =
    | { ok: true; value: GeneratorSandboxRawResult }
    | { ok: false; category: 'runtime' | 'timeout' | 'clone' | 'protocol'; message: string };

type SandboxFrame = ReturnType<GeneratorSandboxEnvironment['createFrame']>;

const SANDBOX_TIMEOUT_MS = 10_000;
const RESULT_TYPE = 'generator-result';
const FAILURE_CATEGORIES = new Set(['runtime', 'clone']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const parseMessage = (message: unknown, requestToken: string): GeneratorSandboxResult | null => {
    if (!isRecord(message) || message.requestToken !== requestToken) return null;
    if (message.type !== RESULT_TYPE || typeof message.ok !== 'boolean') {
        return { ok: false, category: 'protocol', message: 'Sandbox returned a malformed protocol message.' };
    }
    if (message.ok) {
        if (!isRecord(message.value) || !Object.hasOwn(message.value, 'templates') || !Object.hasOwn(message.value, 'hierarchy')) {
            return { ok: false, category: 'protocol', message: 'Sandbox result is missing templates or hierarchy.' };
        }
        return { ok: true, value: { templates: message.value.templates, hierarchy: message.value.hierarchy } };
    }
    if (typeof message.category !== 'string' || !FAILURE_CATEGORIES.has(message.category) || typeof message.message !== 'string') {
        return { ok: false, category: 'protocol', message: 'Sandbox returned a malformed failure.' };
    }
    return {
        ok: false,
        category: message.category as 'runtime' | 'clone',
        message: message.message,
    };
};

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

const validateRequest = (request: unknown): Extract<GeneratorSandboxResult, { ok: false }> | GeneratorSandboxRequest => {
    if (!isRecord(request)) return { ok: false, category: 'protocol', message: 'Generator request must be an object.' };
    if (typeof request.templateScript !== 'string') {
        return { ok: false, category: 'protocol', message: 'Template script must be text.' };
    }
    if (typeof request.hierarchyScript !== 'string') {
        return { ok: false, category: 'protocol', message: 'Hierarchy script must be text.' };
    }
    const templateBytes = utf8Bytes(request.templateScript);
    const hierarchyBytes = utf8Bytes(request.hierarchyScript);
    if (templateBytes > GENERATOR_SCRIPT_MAX_BYTES) {
        return { ok: false, category: 'protocol', message: 'Template script exceeds 512 KiB.' };
    }
    if (hierarchyBytes > GENERATOR_SCRIPT_MAX_BYTES) {
        return { ok: false, category: 'protocol', message: 'Hierarchy script exceeds 512 KiB.' };
    }
    if (templateBytes + hierarchyBytes > GENERATOR_COMBINED_MAX_BYTES) {
        return { ok: false, category: 'protocol', message: 'Combined generator source exceeds 1 MiB.' };
    }
    if (!isRecord(request.constants)) {
        return { ok: false, category: 'protocol', message: 'Generator constants must be an object.' };
    }
    const constantNames = ['RM_PP_WIDTH', 'RM_PP_HEIGHT', 'A4_WIDTH', 'A4_HEIGHT'] as const;
    if (constantNames.some(name => typeof request.constants[name] !== 'number' || !Number.isFinite(request.constants[name]))) {
        return { ok: false, category: 'protocol', message: 'Generator constants must be finite numbers.' };
    }
    return {
        templateScript: request.templateScript,
        hierarchyScript: request.hierarchyScript,
        constants: {
            RM_PP_WIDTH: request.constants.RM_PP_WIDTH as number,
            RM_PP_HEIGHT: request.constants.RM_PP_HEIGHT as number,
            A4_WIDTH: request.constants.A4_WIDTH as number,
            A4_HEIGHT: request.constants.A4_HEIGHT as number,
        },
    };
};

function generatorEvaluatorMain(maxOutputBytes: number) {
    const workerScope = self;
    const TrustedError = Error;
    const TrustedFunction = Function;
    const TrustedSet = Set;
    const TrustedString = String;
    const TrustedWeakSet = WeakSet;
    const trustedArrayIsArray = Array.isArray;
    const trustedArrayPrototype = Array.prototype;
    const trustedArraySlice = Array.prototype.slice.call.bind(Array.prototype.slice);
    const trustedArraySort = Array.prototype.sort.call.bind(Array.prototype.sort);
    const trustedNumberIsFinite = Number.isFinite;
    const trustedNumberToString = Number.prototype.toString.call.bind(Number.prototype.toString);
    const trustedObjectCreate = Object.create;
    const trustedObjectEntries = Object.entries;
    const trustedObjectFreeze = Object.freeze;
    const trustedObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const trustedObjectGetPrototypeOf = Object.getPrototypeOf;
    const trustedObjectHasOwn = Object.hasOwn;
    const trustedObjectKeys = Object.keys;
    const trustedObjectPrototype = Object.prototype;
    const trustedObjectValues = Object.values;
    const trustedOwnKeys = Reflect.ownKeys;
    const trustedRandom = Math.random.bind(Math);
    const trustedSetAdd = Set.prototype.add.call.bind(Set.prototype.add);
    const trustedSetHas = Set.prototype.has.call.bind(Set.prototype.has);
    const trustedStringSlice = String.prototype.slice.call.bind(String.prototype.slice);
    const trustedWeakSetAdd = WeakSet.prototype.add.call.bind(WeakSet.prototype.add);
    const trustedWeakSetDelete = WeakSet.prototype.delete.call.bind(WeakSet.prototype.delete);
    const trustedWeakSetHas = WeakSet.prototype.has.call.bind(WeakSet.prototype.has);
    const trustedStringify = JSON.stringify.bind(JSON);
    const trustedEncoder = new TextEncoder();
    const trustedEncode = trustedEncoder.encode.bind(trustedEncoder);
    const typedArrayPrototype = trustedObjectGetPrototypeOf(Uint8Array.prototype);
    const trustedByteLengthGetter = trustedObjectGetOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
    const trustedByteLength = trustedByteLengthGetter.call.bind(trustedByteLengthGetter);
    try { trustedObjectFreeze(trustedObjectPrototype); } catch { /* Keep serialization free of inherited toJSON hooks when supported. */ }
    try { trustedObjectFreeze(trustedArrayPrototype); } catch { /* Keep array serialization stable when supported. */ }
    const blockedGlobals = [
        'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage',
        'cookieStore', 'indexedDB', 'caches', 'importScripts',
        'Worker', 'SharedWorker', 'BroadcastChannel', 'MessageChannel', 'postMessage',
    ];
    for (const name of blockedGlobals) {
        try {
            Object.defineProperty(workerScope, name, { value: undefined, configurable: false, writable: false });
        } catch {
            try { workerScope[name] = undefined; } catch { /* CSP remains the network backstop. */ }
        }
    }

    const randomIdPart = (end: number) => trustedStringSlice(trustedNumberToString(trustedRandom(), 36), 2, end);
    const createId = (prefix = 'node') => `${prefix}_${randomIdPart(11)}`;
    const jsonIssue = (root: unknown) => {
        const active = new TrustedWeakSet<object>();
        const stack: Array<{ value: unknown; exit?: boolean }> = [{ value: root }];
        while (stack.length > 0) {
            const entry = stack[stack.length - 1];
            stack.length -= 1;
            const { value, exit } = entry;
            if (exit) {
                trustedWeakSetDelete(active, value as object);
                continue;
            }
            if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
            if (typeof value === 'number') {
                if (!trustedNumberIsFinite(value)) return 'Output contains a non-finite number.';
                continue;
            }
            if (typeof value !== 'object') return 'Output contains a non-JSON value.';
            if (trustedWeakSetHas(active, value)) return 'Output contains a cycle.';
            trustedWeakSetAdd(active, value);
            stack[stack.length] = { value, exit: true };
            if (trustedArrayIsArray(value)) {
                if (trustedObjectGetPrototypeOf(value) !== trustedArrayPrototype) return 'Output has a custom array prototype.';
                for (let index = 0; index < value.length; index += 1) {
                    if (!trustedObjectHasOwn(value, index)) return 'Output contains a sparse array.';
                    stack[stack.length] = { value: value[index] };
                }
                continue;
            }
            const prototype = trustedObjectGetPrototypeOf(value);
            if (prototype !== trustedObjectPrototype && prototype !== null) return 'Output has a custom prototype.';
            const keys = trustedOwnKeys(value);
            for (let index = 0; index < keys.length; index += 1) {
                const key = keys[index];
                if (typeof key !== 'string') return 'Output has symbol properties.';
                const descriptor = trustedObjectGetOwnPropertyDescriptor(value, key)!;
                if (!descriptor.enumerable || !trustedObjectHasOwn(descriptor, 'value')) return 'Output contains accessors or hidden data.';
                stack[stack.length] = { value: descriptor.value };
            }
        }
        return undefined;
    };
    const cloneError = (message: string) => {
        const error = new TrustedError(message);
        error.name = 'DataCloneError';
        return error;
    };
    const normalizeFlat = (raw: any) => {
        const normalized: Record<string, any> = trustedObjectCreate(null);
        const rawTemplates = trustedObjectValues(raw || {});
        for (let templateIndex = 0; templateIndex < rawTemplates.length; templateIndex += 1) {
            const template: any = rawTemplates[templateIndex];
            if (!template || typeof template !== 'object' || !template.id) continue;
            let layers = template.layers;
            if (layers === undefined || trustedArrayIsArray(layers) && layers.length === 0) {
                layers = [{
                    id: `layer_${randomIdPart(11)}`,
                    name: 'Layer 1',
                    order: 0,
                    visible: true,
                    locked: false,
                }];
            } else if (trustedArrayIsArray(layers)) {
                const copiedLayers = [];
                for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
                    copiedLayers[layerIndex] = { ...layers[layerIndex] };
                }
                layers = copiedLayers;
            }
            const fallbackLayerId = trustedArrayIsArray(layers) && layers.length > 0
                ? trustedArraySort(trustedArraySlice(layers), (left: any, right: any) => left.order - right.order)[0].id
                : undefined;
            const layerIds = new TrustedSet();
            if (trustedArrayIsArray(layers)) {
                for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
                    trustedSetAdd(layerIds, layers[layerIndex].id);
                }
            }
            let elements = template.elements;
            if (trustedArrayIsArray(template.elements)) {
                elements = [];
                for (let index = 0; index < template.elements.length; index += 1) {
                    const element = template.elements[index];
                    const normalizedElement = {
                        ...element,
                        id: element?.id || `gen_${template.id}_${index}_${randomIdPart(7)}`,
                    };
                    if (normalizedElement.layerId !== undefined && typeof normalizedElement.layerId !== 'string') {
                        throw new TrustedError(`Template ${template.id} has an element with a non-string layerId.`);
                    }
                    if (fallbackLayerId !== undefined
                        && (!normalizedElement.layerId || !trustedSetHas(layerIds, normalizedElement.layerId))) {
                        normalizedElement.layerId = fallbackLayerId;
                    }
                    elements[index] = normalizedElement;
                }
            }
            normalized[template.id] = { ...template, elements, layers };
        }
        return normalized;
    };
    const normalizeTemplates = (raw: any) => {
        if (raw && typeof raw === 'object' && !trustedArrayIsArray(raw)
            && trustedObjectHasOwn(raw, 'variants') && raw.variants && typeof raw.variants === 'object' && !trustedArrayIsArray(raw.variants)) {
            const variants: Record<string, any> = trustedObjectCreate(null);
            const rawVariants = trustedObjectEntries(raw.variants);
            for (let index = 0; index < rawVariants.length; index += 1) {
                const key = rawVariants[index][0];
                const variant: any = rawVariants[index][1];
                variants[key] = {
                    id: variant?.id || key,
                    name: variant?.name || key,
                    templates: normalizeFlat(variant?.templates),
                };
            }
            const activeVariantId = typeof raw.activeVariantId === 'string' && trustedObjectHasOwn(variants, raw.activeVariantId)
                ? raw.activeVariantId
                : trustedObjectKeys(variants)[0];
            return { variants, activeVariantId };
        }
        return normalizeFlat(raw);
    };
    const activeTemplates = (normalized: any) => {
        if (trustedObjectHasOwn(normalized, 'variants')) return normalized.variants[normalized.activeVariantId]?.templates;
        return normalized;
    };
    const isPromise = value => (
        value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof value.then === 'function'
    );
    const errorMessage = error => {
        const message = error && typeof error.message === 'string' ? error.message : TrustedString(error);
        return trustedStringSlice(message, 0, 1000);
    };

    workerScope.onmessage = event => {
        workerScope.onmessage = null;
        const resultPort = event.ports[0];
        if (!resultPort) return;
        const trustedPost = resultPort.postMessage.bind(resultPort);
        const trustedClose = resultPort.close.bind(resultPort);
        const sendFailure = (category: 'runtime' | 'clone', error: unknown) => {
            trustedPost({ ok: false, category, message: errorMessage(error) });
        };
        try {
            const { templateScript, hierarchyScript, constants } = event.data;
            const templateFn = new TrustedFunction(
                'consts',
                'const { RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT } = consts;\n' + templateScript,
            );
            const templates = templateFn(constants);
            if (isPromise(templates)) throw new TrustedError('Template script must return synchronously.');
            const templateIssue = jsonIssue(templates);
            if (templateIssue) throw cloneError(templateIssue);
            const normalizedTemplates = normalizeTemplates(templates);

            const hierarchyFn = new TrustedFunction('templates', 'createId', hierarchyScript);
            const hierarchy = hierarchyFn(activeTemplates(normalizedTemplates), createId);
            if (isPromise(hierarchy)) throw new TrustedError('Hierarchy script must return synchronously.');
            const hierarchyIssue = jsonIssue(hierarchy);
            if (hierarchyIssue) throw cloneError(hierarchyIssue);

            const value = { templates: normalizedTemplates, hierarchy };
            const serialized = trustedStringify(value);
            if (trustedByteLength(trustedEncode(serialized)) > maxOutputBytes) {
                trustedPost({
                    ok: false,
                    category: 'runtime',
                    message: `Generated output exceeds ${maxOutputBytes} bytes.`,
                });
                return;
            }
            trustedPost({ ok: true, serialized });
        } catch (error) {
            try { sendFailure(error?.name === 'DataCloneError' ? 'clone' : 'runtime', error); } catch { /* Parent timeout remains backstop. */ }
        } finally {
            try { trustedClose(); } catch { /* Port is disposable. */ }
        }
    };
}

function generatorSupervisorMain(evaluatorSource: string) {
    const supervisorScope = self;
    const TrustedError = Error;
    let evaluator: Worker | null = null;
    let evaluatorUrl: string | null = null;
    let evaluatorPort: MessagePort | null = null;
    let resultPort: MessagePort | null = null;
    let controlPort: MessagePort | null = null;

    const safely = (operation: () => void) => {
        try { operation(); } catch { /* Every resource gets an independent cleanup attempt. */ }
    };
    const cleanup = () => {
        const workerToTerminate = evaluator;
        const urlToRevoke = evaluatorUrl;
        const portToClose = evaluatorPort;
        evaluator = null;
        evaluatorUrl = null;
        evaluatorPort = null;
        if (workerToTerminate) safely(() => workerToTerminate.terminate());
        if (portToClose) safely(() => portToClose.close());
        if (urlToRevoke) safely(() => URL.revokeObjectURL(urlToRevoke));
    };
    const shutdown = () => {
        cleanup();
        safely(() => resultPort?.close());
        safely(() => controlPort?.close());
        resultPort = null;
        controlPort = null;
        safely(() => supervisorScope.close());
    };
    const finish = (message: unknown) => {
        safely(() => resultPort?.postMessage(message));
        shutdown();
    };

    supervisorScope.onmessage = event => {
        supervisorScope.onmessage = null;
        resultPort = event.ports[0] || null;
        controlPort = event.ports[1] || null;
        if (!resultPort) {
            shutdown();
            return;
        }
        if (controlPort) {
            controlPort.onmessage = controlEvent => {
                if (!controlEvent.data || controlEvent.data.type !== 'generator-cancel') return;
                cleanup();
                safely(() => controlPort?.postMessage({
                    type: 'generator-cancelled',
                    requestToken: controlEvent.data.requestToken,
                }));
                shutdown();
            };
            controlPort.start();
        }

        try {
            evaluatorUrl = URL.createObjectURL(new Blob([evaluatorSource], { type: 'text/javascript' }));
            evaluator = new Worker(evaluatorUrl);
            const urlToRevoke = evaluatorUrl;
            try {
                URL.revokeObjectURL(urlToRevoke);
                evaluatorUrl = null;
            } catch { /* Terminal cleanup retries this URL. */ }
            const channel = new MessageChannel();
            evaluatorPort = channel.port1;
            evaluatorPort.onmessage = evaluatorEvent => finish(evaluatorEvent.data);
            evaluator.onerror = evaluatorEvent => finish({
                ok: false,
                category: 'runtime',
                message: evaluatorEvent.message || 'Generator evaluator failed.',
            });
            evaluator.postMessage(event.data, [channel.port2]);
        } catch (error) {
            finish({
                ok: false,
                category: error instanceof DOMException && error.name === 'DataCloneError' ? 'clone' : 'runtime',
                message: error instanceof TrustedError ? error.message : String(error),
            });
        }
    };
}

const EVALUATOR_SOURCE = `(${generatorEvaluatorMain.toString()})(${MAX_STATE_BYTES});`;
const WORKER_SOURCE = `(${generatorSupervisorMain.toString()})(${JSON.stringify(EVALUATOR_SOURCE)});`;

const iframeDocument = (): string => {
    const workerSource = JSON.stringify(WORKER_SOURCE).replace(/</g, '\\u003c');
    return `<!doctype html>
<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'"></head>
<body><script>
(() => {
  const workerSource = ${workerSource};
  let worker = null;
  let workerUrl = null;
  let resultPort = null;
  let requestToken = null;
  const safely = operation => {
    try { operation(); } catch { /* Every resource gets an independent cleanup attempt. */ }
  };
  const disposeWorker = () => {
    const workerToTerminate = worker;
    const urlToRevoke = workerUrl;
    const portToClose = resultPort;
    worker = null;
    workerUrl = null;
    resultPort = null;
    if (workerToTerminate) safely(() => workerToTerminate.terminate());
    if (portToClose) safely(() => portToClose.close());
    if (urlToRevoke) safely(() => URL.revokeObjectURL(urlToRevoke));
  };
  const send = payload => parent.postMessage({ ...payload, type: '${RESULT_TYPE}', requestToken }, '*');
  addEventListener('message', event => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'generator-cancel' && event.data.requestToken === requestToken) {
      disposeWorker();
      parent.postMessage({ type: 'generator-cancelled', requestToken }, '*');
      return;
    }
    if (event.data.type !== 'generator-run' || worker || typeof event.data.requestToken !== 'string') return;
    requestToken = event.data.requestToken;
    const controlPort = event.ports[0] || null;
    try {
      workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      const urlToRevoke = workerUrl;
      try {
        URL.revokeObjectURL(urlToRevoke);
        workerUrl = null;
      } catch { /* Terminal disposal retries this URL without blocking Worker setup. */ }
      const channel = new MessageChannel();
      resultPort = channel.port1;
      resultPort.onmessage = event => {
        const message = event.data;
        try {
          if (message && message.ok === true && typeof message.serialized === 'string') {
            send({ ok: true, value: JSON.parse(message.serialized) });
          } else if (message && message.ok === false
            && (message.category === 'runtime' || message.category === 'clone')
            && typeof message.message === 'string') {
            send(message);
          } else {
            send({ ok: false, category: 'runtime', message: 'Generator Worker returned a malformed internal message.' });
          }
        } catch (error) {
          safely(() => send({ ok: false, category: 'clone', message: error instanceof Error ? error.message : String(error) }));
        }
        finally { disposeWorker(); }
      };
      worker.onerror = event => {
        try { safely(() => send({ ok: false, category: 'runtime', message: event.message || 'Generator worker failed.' })); }
        finally { disposeWorker(); }
      };
      try {
        const transfer = controlPort ? [channel.port2, controlPort] : [channel.port2];
        worker.postMessage(event.data.request, transfer);
      }
      catch (error) {
        safely(() => channel.port2.close());
        try { safely(() => send({ ok: false, category: error && error.name === 'DataCloneError' ? 'clone' : 'runtime', message: error instanceof Error ? error.message : String(error) })); }
        finally { disposeWorker(); }
      }
    } catch (error) {
      try { safely(() => send({ ok: false, category: 'runtime', message: error instanceof Error ? error.message : String(error) })); }
      finally { disposeWorker(); }
    }
  });
  addEventListener('unload', disposeWorker);
})();
</script></body></html>`;
};

const createBrowserEnvironment = (): GeneratorSandboxEnvironment => ({
    createRequestToken: () => {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    },
    createFrame: ({ requestToken, onMessage }) => {
        const iframe = document.createElement('iframe');
        iframe.hidden = true;
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = iframeDocument();
        let disposed = false;
        let loaded = false;
        let removed = false;
        let controlPort: MessagePort | undefined;
        let removalFallback: ReturnType<typeof setTimeout> | undefined;
        let queuedRequest: GeneratorSandboxRequest | undefined;
        const safely = (operation: () => void) => {
            try { operation(); } catch { /* Every resource gets an independent cleanup attempt. */ }
        };

        const send = (request: GeneratorSandboxRequest) => {
            const channel = new MessageChannel();
            controlPort = channel.port1;
            controlPort.onmessage = event => {
                if (isRecord(event.data)
                    && event.data.type === 'generator-cancelled'
                    && event.data.requestToken === requestToken) {
                    removeFrame();
                }
            };
            controlPort.start();
            iframe.contentWindow?.postMessage({
                type: 'generator-run',
                requestToken,
                request,
            }, '*', [channel.port2]);
        };
        const handleLoad = () => {
            loaded = true;
            if (queuedRequest) {
                try {
                    send(queuedRequest);
                } catch (error) {
                    onMessage({
                        type: RESULT_TYPE,
                        requestToken,
                        ok: false,
                        category: error instanceof DOMException && error.name === 'DataCloneError' ? 'clone' : 'runtime',
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
                queuedRequest = undefined;
            }
        };
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== iframe.contentWindow) return;
            if (isRecord(event.data)
                && event.data.type === 'generator-cancelled'
                && event.data.requestToken === requestToken) {
                removeFrame();
                return;
            }
            onMessage(event.data);
        };

        const removeFrame = () => {
            if (removed) return;
            removed = true;
            if (removalFallback !== undefined) clearTimeout(removalFallback);
            queuedRequest = undefined;
            safely(() => controlPort?.close());
            controlPort = undefined;
            safely(() => iframe.removeEventListener('load', handleLoad));
            safely(() => window.removeEventListener('message', handleMessage));
            safely(() => iframe.remove());
        };

        const cleanup = (cancel: boolean) => {
            queuedRequest = undefined;
            if (!cancel) {
                removeFrame();
                return;
            }
            if (controlPort) safely(() => controlPort?.postMessage({ type: 'generator-cancel', requestToken }));
            else safely(() => iframe.contentWindow?.postMessage({ type: 'generator-cancel', requestToken }, '*'));
            removalFallback = setTimeout(removeFrame, 500);
        };

        try {
            iframe.addEventListener('load', handleLoad);
            window.addEventListener('message', handleMessage);
            document.body.appendChild(iframe);
        } catch (error) {
            cleanup(false);
            throw error;
        }

        return {
            post: request => {
                if (disposed) throw new Error('Sandbox frame is disposed.');
                if (loaded) send(request);
                else queuedRequest = request;
            },
            dispose: () => {
                if (disposed) return;
                disposed = true;
                cleanup(true);
            },
        };
    },
});

export const runGeneratorSandbox = (
    request: GeneratorSandboxRequest,
    environment: GeneratorSandboxEnvironment = createBrowserEnvironment(),
    signal: AbortSignal | undefined = environment.signal,
): Promise<GeneratorSandboxResult> => new Promise(resolve => {
    const validatedRequest = validateRequest(request);
    if (Object.hasOwn(validatedRequest, 'ok')) {
        resolve(validatedRequest as Extract<GeneratorSandboxResult, { ok: false }>);
        return;
    }
    let frame: SandboxFrame | undefined;
    let timeoutHandle: unknown;
    let timeoutScheduled = false;
    let settled = false;
    let requestToken: string;
    const scheduleTimeout = environment.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    const cancelTimeout = environment.cancelTimeout ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const safely = (operation: () => void) => {
        try { operation(); } catch { /* Every resource gets an independent cleanup attempt. */ }
    };

    const abort = () => finish({ ok: false, category: 'runtime', message: 'Generator run cancelled.' });
    const finish = (result: GeneratorSandboxResult) => {
        if (settled) return;
        settled = true;
        if (timeoutScheduled) safely(() => cancelTimeout(timeoutHandle));
        safely(() => signal?.removeEventListener('abort', abort));
        safely(() => frame?.dispose());
        resolve(result);
    };

    try {
        requestToken = environment.createRequestToken();
        frame = environment.createFrame({
            requestToken,
            onMessage: message => {
                const result = parseMessage(message, requestToken);
                if (result) finish(result);
            },
        });
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        timeoutScheduled = true;
        timeoutHandle = scheduleTimeout(() => finish({
            ok: false,
            category: 'timeout',
            message: `Generator exceeded the ${SANDBOX_TIMEOUT_MS} ms execution limit.`,
        }), SANDBOX_TIMEOUT_MS);
        frame.post(validatedRequest as GeneratorSandboxRequest);
    } catch (error) {
        const category = error instanceof DOMException && error.name === 'DataCloneError' ? 'clone' : 'runtime';
        finish({ ok: false, category, message: error instanceof Error ? error.message : String(error) });
    }
});
