export interface GeneratorSandboxRequest {
    templateScript: string;
    hierarchyScript: string;
    constants: { RM_PP_WIDTH: number; RM_PP_HEIGHT: number; A4_WIDTH: number; A4_HEIGHT: number };
    timeoutMs?: number;
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
}

export type GeneratorSandboxResult =
    | { ok: true; value: GeneratorSandboxRawResult }
    | { ok: false; category: 'runtime' | 'timeout' | 'clone' | 'protocol'; message: string };

type SandboxFrame = ReturnType<GeneratorSandboxEnvironment['createFrame']>;

const DEFAULT_TIMEOUT_MS = 5000;
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
    if (!FAILURE_CATEGORIES.has(String(message.category)) || typeof message.message !== 'string') {
        return { ok: false, category: 'protocol', message: 'Sandbox returned a malformed failure.' };
    }
    return {
        ok: false,
        category: message.category as 'runtime' | 'clone',
        message: message.message,
    };
};

function generatorWorkerMain() {
    const workerScope = self;
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
    const normalizeFlat = (raw: any) => {
        const normalized: Record<string, any> = {};
        Object.values(raw || {}).forEach((template: any) => {
            if (!template || typeof template !== 'object' || !template.id) return;
            const existingLayers = Array.isArray(template.layers) ? template.layers : [];
            const layers = existingLayers.length > 0 ? existingLayers.map((layer: any) => ({ ...layer })) : [{
                id: `layer_${Math.random().toString(36).slice(2, 11)}`,
                name: 'Layer 1',
                order: 0,
                visible: true,
                locked: false,
            }];
            const layerIds = new Set(layers.map((layer: any) => layer.id));
            const fallbackLayerId = [...layers].sort((left: any, right: any) => left.order - right.order)[0].id;
            const elements = Array.isArray(template.elements)
                ? template.elements.map((element: any, index: number) => ({
                    ...element,
                    id: element?.id || `gen_${template.id}_${index}_${Math.random().toString(36).slice(2, 7)}`,
                    layerId: element?.layerId && layerIds.has(element.layerId) ? element.layerId : fallbackLayerId,
                }))
                : template.elements;
            normalized[template.id] = { ...template, elements, layers };
        });
        return normalized;
    };
    const normalizeTemplates = (raw: any) => {
        if (raw && typeof raw === 'object' && raw.variants && typeof raw.variants === 'object') {
            const variants: Record<string, any> = {};
            Object.entries(raw.variants).forEach(([key, variant]: [string, any]) => {
                variants[key] = {
                    id: variant?.id || key,
                    name: variant?.name || key,
                    templates: normalizeFlat(variant?.templates),
                };
            });
            const activeVariantId = raw.activeVariantId && variants[raw.activeVariantId]
                ? raw.activeVariantId
                : Object.keys(variants)[0];
            return { variants, activeVariantId };
        }
        return normalizeFlat(raw);
    };
    const activeTemplates = (normalized: any) => {
        if (normalized.variants) return normalized.variants[normalized.activeVariantId]?.templates;
        return normalized;
    };
    const isPromise = value => (
        value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof value.then === 'function'
    );
    const errorMessage = error => error instanceof Error ? error.message : String(error);
    const postFailure = (category, error) => {
        workerScope.postMessage({ ok: false, category, message: errorMessage(error) });
    };

    workerScope.onmessage = event => {
        workerScope.onmessage = null;
        try {
            const { templateScript, hierarchyScript, constants } = event.data;
            const templateFn = new Function(
                'consts',
                'const { RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT } = consts;\n' + templateScript,
            );
            const templates = templateFn(constants);
            if (isPromise(templates)) throw new Error('Template script must return synchronously.');
            const normalizedTemplates = normalizeTemplates(templates);

            const hierarchyFn = new Function('templates', 'createId', hierarchyScript);
            const hierarchy = hierarchyFn(activeTemplates(normalizedTemplates), createId);
            if (isPromise(hierarchy)) throw new Error('Hierarchy script must return synchronously.');

            try {
                workerScope.postMessage({ ok: true, value: { templates: normalizedTemplates, hierarchy } });
            } catch (error) {
                postFailure(error?.name === 'DataCloneError' ? 'clone' : 'runtime', error);
            }
        } catch (error) {
            postFailure(error?.name === 'DataCloneError' ? 'clone' : 'runtime', error);
        }
    };
}

const WORKER_SOURCE = `(${generatorWorkerMain.toString()})();`;

const iframeDocument = (): string => {
    const workerSource = JSON.stringify(WORKER_SOURCE).replace(/</g, '\\u003c');
    return `<!doctype html>
<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'"></head>
<body><script>
(() => {
  const workerSource = ${workerSource};
  let worker = null;
  let workerUrl = null;
  let requestToken = null;
  const disposeWorker = () => {
    if (worker) worker.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = null;
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
      URL.revokeObjectURL(workerUrl);
      workerUrl = null;
      worker.onmessage = event => {
        try { send(event.data); }
        catch (error) { send({ ok: false, category: 'clone', message: error instanceof Error ? error.message : String(error) }); }
        finally { disposeWorker(); }
      };
      worker.onerror = event => {
        try { send({ ok: false, category: 'runtime', message: event.message || 'Generator worker failed.' }); }
        finally { disposeWorker(); }
      };
      try { worker.postMessage(event.data.request); }
      catch (error) {
        try { send({ ok: false, category: error && error.name === 'DataCloneError' ? 'clone' : 'runtime', message: error instanceof Error ? error.message : String(error) }); }
        finally { disposeWorker(); }
      }
    } catch (error) {
      try { send({ ok: false, category: 'runtime', message: error instanceof Error ? error.message : String(error) }); }
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

        const send = (request: GeneratorSandboxRequest) => iframe.contentWindow?.postMessage({
            type: 'generator-run',
            requestToken,
            request,
        }, '*');
        const handleLoad = () => {
            loaded = true;
            if (queuedRequest) {
                send(queuedRequest);
                queuedRequest = undefined;
            }
        };
        const handleMessage = (event: MessageEvent) => {
            if (event.source === iframe.contentWindow) onMessage(event.data);
        };

        iframe.addEventListener('load', handleLoad);
        window.addEventListener('message', handleMessage);
        document.body.appendChild(iframe);

        return {
            post: request => {
                if (disposed) throw new Error('Sandbox frame is disposed.');
                if (loaded) send(request);
                else queuedRequest = request;
            },
            dispose: () => {
                if (disposed) return;
                disposed = true;
                queuedRequest = undefined;
                try {
                    iframe.contentWindow?.postMessage({ type: 'generator-cancel', requestToken }, '*');
                } finally {
                    iframe.removeEventListener('load', handleLoad);
                    window.removeEventListener('message', handleMessage);
                    iframe.remove();
                }
            },
        };
    },
});

export const runGeneratorSandbox = (
    request: GeneratorSandboxRequest,
    environment: GeneratorSandboxEnvironment = createBrowserEnvironment(),
): Promise<GeneratorSandboxResult> => new Promise(resolve => {
    let frame: SandboxFrame | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let requestToken: string;

    const abort = () => finish({ ok: false, category: 'runtime', message: 'Generator run cancelled.' });
    const finish = (result: GeneratorSandboxResult) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        environment.signal?.removeEventListener('abort', abort);
        try { frame?.dispose(); } catch { /* Cleanup must not replace the sandbox result. */ }
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
        const timeoutMs = Number.isFinite(request.timeoutMs) && request.timeoutMs! >= 0
            ? request.timeoutMs!
            : DEFAULT_TIMEOUT_MS;
        timeoutId = setTimeout(() => finish({
            ok: false,
            category: 'timeout',
            message: `Generator exceeded the ${timeoutMs} ms execution limit.`,
        }), timeoutMs);
        frame.post(request);
    } catch (error) {
        const category = error instanceof DOMException && error.name === 'DataCloneError' ? 'clone' : 'runtime';
        finish({ ok: false, category, message: error instanceof Error ? error.message : String(error) });
    }
});
