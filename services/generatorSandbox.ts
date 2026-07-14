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

function generatorWorkerMain(maxOutputBytes: number) {
    const workerScope = self;
    const trustedStringify = JSON.stringify.bind(JSON);
    const trustedEncoder = new TextEncoder();
    const trustedEncode = trustedEncoder.encode.bind(trustedEncoder);
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
    const trustedByteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
    const trustedByteLength = trustedByteLengthGetter.call.bind(trustedByteLengthGetter);
    try { Object.freeze(Object.prototype); } catch { /* Keep serialization free of inherited toJSON hooks when supported. */ }
    try { Object.freeze(Array.prototype); } catch { /* Keep array serialization stable when supported. */ }
    const blockedGlobals = [
        'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage',
        'cookieStore', 'indexedDB', 'caches', 'importScripts',
    ];
    for (const name of blockedGlobals) {
        try {
            Object.defineProperty(workerScope, name, { value: undefined, configurable: false, writable: false });
        } catch {
            try { workerScope[name] = undefined; } catch { /* CSP remains the network backstop. */ }
        }
    }

    const createId = (prefix = 'node') => `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
    const jsonIssue = (root: unknown) => {
        const active = new WeakSet<object>();
        const stack: Array<{ value: unknown; exit?: boolean }> = [{ value: root }];
        while (stack.length > 0) {
            const { value, exit } = stack.pop()!;
            if (exit) {
                active.delete(value as object);
                continue;
            }
            if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
            if (typeof value === 'number') {
                if (!Number.isFinite(value)) return 'Output contains a non-finite number.';
                continue;
            }
            if (typeof value !== 'object') return 'Output contains a non-JSON value.';
            if (active.has(value)) return 'Output contains a cycle.';
            active.add(value);
            stack.push({ value, exit: true });
            if (Array.isArray(value)) {
                if (Object.getPrototypeOf(value) !== Array.prototype) return 'Output has a custom array prototype.';
                for (let index = 0; index < value.length; index += 1) {
                    if (!Object.hasOwn(value, index)) return 'Output contains a sparse array.';
                    stack.push({ value: value[index] });
                }
                continue;
            }
            const prototype = Object.getPrototypeOf(value);
            if (prototype !== Object.prototype && prototype !== null) return 'Output has a custom prototype.';
            for (const key of Reflect.ownKeys(value)) {
                if (typeof key !== 'string') return 'Output has symbol properties.';
                const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
                if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return 'Output contains accessors or hidden data.';
                stack.push({ value: descriptor.value });
            }
        }
        return undefined;
    };
    const cloneError = (message: string) => {
        const error = new Error(message);
        error.name = 'DataCloneError';
        return error;
    };
    const normalizeFlat = (raw: any) => {
        const normalized: Record<string, any> = Object.create(null);
        Object.values(raw || {}).forEach((template: any) => {
            if (!template || typeof template !== 'object' || !template.id) return;
            let layers = template.layers;
            if (layers === undefined || Array.isArray(layers) && layers.length === 0) {
                layers = [{
                    id: `layer_${Math.random().toString(36).slice(2, 11)}`,
                    name: 'Layer 1',
                    order: 0,
                    visible: true,
                    locked: false,
                }];
            } else if (Array.isArray(layers)) {
                layers = layers.map((layer: any) => ({ ...layer }));
            }
            const fallbackLayerId = Array.isArray(layers) && layers.length > 0
                ? [...layers].sort((left: any, right: any) => left.order - right.order)[0].id
                : undefined;
            const layerIds = new Set(Array.isArray(layers) ? layers.map((layer: any) => layer.id) : []);
            const elements = Array.isArray(template.elements)
                ? template.elements.map((element: any, index: number) => {
                    const normalizedElement = {
                        ...element,
                        id: element?.id || `gen_${template.id}_${index}_${Math.random().toString(36).slice(2, 7)}`,
                    };
                    if (normalizedElement.layerId !== undefined && typeof normalizedElement.layerId !== 'string') {
                        throw new Error(`Template ${template.id} has an element with a non-string layerId.`);
                    }
                    if (fallbackLayerId !== undefined
                        && (!normalizedElement.layerId || !layerIds.has(normalizedElement.layerId))) {
                        normalizedElement.layerId = fallbackLayerId;
                    }
                    return normalizedElement;
                })
                : template.elements;
            normalized[template.id] = { ...template, elements, layers };
        });
        return normalized;
    };
    const normalizeTemplates = (raw: any) => {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)
            && Object.hasOwn(raw, 'variants') && raw.variants && typeof raw.variants === 'object' && !Array.isArray(raw.variants)) {
            const variants: Record<string, any> = Object.create(null);
            Object.entries(raw.variants).forEach(([key, variant]: [string, any]) => {
                variants[key] = {
                    id: variant?.id || key,
                    name: variant?.name || key,
                    templates: normalizeFlat(variant?.templates),
                };
            });
            const activeVariantId = typeof raw.activeVariantId === 'string' && Object.hasOwn(variants, raw.activeVariantId)
                ? raw.activeVariantId
                : Object.keys(variants)[0];
            return { variants, activeVariantId };
        }
        return normalizeFlat(raw);
    };
    const activeTemplates = (normalized: any) => {
        if (Object.hasOwn(normalized, 'variants')) return normalized.variants[normalized.activeVariantId]?.templates;
        return normalized;
    };
    const isPromise = value => (
        value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof value.then === 'function'
    );
    const errorMessage = error => {
        const message = error && typeof error.message === 'string' ? error.message : String(error);
        return message.slice(0, 1000);
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
            const templateFn = new Function(
                'consts',
                'const { RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT } = consts;\n' + templateScript,
            );
            const templates = templateFn(constants);
            if (isPromise(templates)) throw new Error('Template script must return synchronously.');
            const templateIssue = jsonIssue(templates);
            if (templateIssue) throw cloneError(templateIssue);
            const normalizedTemplates = normalizeTemplates(templates);

            const hierarchyFn = new Function('templates', 'createId', hierarchyScript);
            const hierarchy = hierarchyFn(activeTemplates(normalizedTemplates), createId);
            if (isPromise(hierarchy)) throw new Error('Hierarchy script must return synchronously.');
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

const WORKER_SOURCE = `(${generatorWorkerMain.toString()})(${MAX_STATE_BYTES});`;

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
      return;
    }
    if (event.data.type !== 'generator-run' || worker || typeof event.data.requestToken !== 'string') return;
    requestToken = event.data.requestToken;
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
      try { worker.postMessage(event.data.request, [channel.port2]); }
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
        let queuedRequest: GeneratorSandboxRequest | undefined;
        const safely = (operation: () => void) => {
            try { operation(); } catch { /* Every resource gets an independent cleanup attempt. */ }
        };

        const send = (request: GeneratorSandboxRequest) => iframe.contentWindow?.postMessage({
            type: 'generator-run',
            requestToken,
            request,
        }, '*');
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
            if (event.source === iframe.contentWindow) onMessage(event.data);
        };

        const cleanup = (cancel: boolean) => {
            queuedRequest = undefined;
            if (cancel) safely(() => iframe.contentWindow?.postMessage({ type: 'generator-cancel', requestToken }, '*'));
            safely(() => iframe.removeEventListener('load', handleLoad));
            safely(() => window.removeEventListener('message', handleMessage));
            safely(() => iframe.remove());
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
        safely(() => environment.signal?.removeEventListener('abort', abort));
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
        if (environment.signal?.aborted) {
            abort();
            return;
        }
        environment.signal?.addEventListener('abort', abort, { once: true });
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
