import { BoundedLruCache } from './boundedLruCache';
import {
    createTextLayoutEngine,
    TEXT_LAYOUT_CACHE_LIMIT,
    type FontDescriptor,
    type TextLayoutRequest,
    type TextLayoutResult,
} from './textLayout';

const FONT_FAMILY_MAP: Record<string, string> = {
    'helvetica': 'Helvetica, Arial, sans-serif',
    'open-sans': '"Open Sans", sans-serif',
    'lato': 'Lato, sans-serif',
    'montserrat': 'Montserrat, sans-serif',
    'roboto': 'Roboto, sans-serif',
    'poppins': 'Poppins, sans-serif',
    'nunito': 'Nunito, sans-serif',
    'inter': 'Inter, sans-serif',
    'work-sans': '"Work Sans", sans-serif',
    'source-sans-pro': '"Source Sans Pro", sans-serif',
    'raleway': 'Raleway, sans-serif',
    'ubuntu': 'Ubuntu, sans-serif',
    'pt-sans': '"PT Sans", sans-serif',
    'noto-sans': '"Noto Sans", sans-serif',
    'oxygen': 'Oxygen, sans-serif',
    'fira-sans': '"Fira Sans", sans-serif',
    'times': '"Times New Roman", Times, serif',
    'lora': 'Lora, serif',
    'merriweather': 'Merriweather, serif',
    'playfair-display': '"Playfair Display", serif',
    'pt-serif': '"PT Serif", serif',
    'libre-baskerville': '"Libre Baskerville", serif',
    'crimson-text': '"Crimson Text", serif',
    'eb-garamond': '"EB Garamond", serif',
    'cormorant-garamond': '"Cormorant Garamond", serif',
    'noto-serif': '"Noto Serif", serif',
    'courier': 'Courier, monospace',
    'roboto-mono': '"Roboto Mono", monospace',
    'fira-code': '"Fira Code", monospace',
    'source-code-pro': '"Source Code Pro", monospace',
    'jetbrains-mono': '"JetBrains Mono", monospace',
    'ubuntu-mono': '"Ubuntu Mono", monospace',
    'caveat': 'Caveat, cursive',
    'dancing-script': '"Dancing Script", cursive',
    'patrick-hand': '"Patrick Hand", cursive',
    'pacifico': 'Pacifico, cursive',
    'great-vibes': '"Great Vibes", cursive',
    'satisfy': 'Satisfy, cursive',
    'sacramento': 'Sacramento, cursive',
    'allura': 'Allura, cursive',
    'amatic-sc': '"Amatic SC", cursive',
    'indie-flower': '"Indie Flower", cursive',
    'kalam': 'Kalam, cursive',
    'shadows-into-light': '"Shadows Into Light", cursive',
    'bebas-neue': '"Bebas Neue", sans-serif',
    'oswald': 'Oswald, sans-serif',
    'anton': 'Anton, sans-serif',
    'righteous': 'Righteous, cursive',
    'archivo-black': '"Archivo Black", sans-serif',
};

let nextSessionIdentity = 1;

export interface CanvasTextLayoutSession {
    layout(request: TextLayoutRequest, context: string): TextLayoutResult | null;
    clear(): void;
}

interface CanvasTextLayoutSessionOptions {
    sessionIdentity?: string;
    createCanvas?: () => HTMLCanvasElement;
    warn?: (message: string, error: unknown) => void;
}

export function resolveCanvasFontFamily(fontFamily: string): string {
    return FONT_FAMILY_MAP[fontFamily] || fontFamily;
}

export function createCanvasTextLayoutSession(
    options: CanvasTextLayoutSessionOptions = {},
): CanvasTextLayoutSession {
    const sessionIdentity = options.sessionIdentity ?? `canvas-${nextSessionIdentity++}`;
    const createCanvas = options.createCanvas ?? (() => document.createElement('canvas'));
    const warn = options.warn ?? ((message: string, error: unknown) => console.warn(message, error));
    const widthCache = new BoundedLruCache<string, number>(TEXT_LAYOUT_CACHE_LIMIT);
    const engine = createTextLayoutEngine();
    let measurementCanvas: HTMLCanvasElement | null = null;
    let measurementContext: CanvasRenderingContext2D | null = null;
    let warned = false;

    const getMeasurementContext = (): CanvasRenderingContext2D => {
        if (measurementContext) return measurementContext;

        measurementCanvas ??= createCanvas();
        const context = measurementCanvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable');
        measurementContext = context;
        return context;
    };

    const measurer = {
        cacheKey: sessionIdentity,
        measureWidth(text: string, font: FontDescriptor): number {
            const resolvedFamily = resolveCanvasFontFamily(font.family);
            const key = JSON.stringify([
                sessionIdentity,
                resolvedFamily,
                font.weight,
                font.style,
                font.size,
                text,
            ]);
            const cached = widthCache.get(key);
            if (cached !== undefined) return cached;

            const context = getMeasurementContext();
            context.font = `${font.style} ${font.weight} ${font.size}px ${resolvedFamily}`;
            const width = context.measureText(text).width;
            if (Number.isFinite(width) && width >= 0) widthCache.set(key, width);
            return width;
        },
    };

    return {
        layout(request, context) {
            try {
                return engine.layout(request, measurer);
            } catch (error) {
                if (!warned) {
                    warned = true;
                    warn(`[CanvasTextLayout] Skipped ${context}`, error);
                }
                return null;
            }
        },

        clear() {
            widthCache.clear();
            engine.clear();
        },
    };
}
