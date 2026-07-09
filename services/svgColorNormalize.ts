/**
 * svg2pdf.js's color parser only understands named colors, 3/6-digit hex,
 * rgb() and rgba(). Fills/strokes in any other CSS color syntax are silently
 * dropped: the shape renders stroke-only (or not at all), and 8-digit hex
 * loses its alpha. These helpers rewrite the color formats browsers accept
 * but svg2pdf doesn't — #rgba, #rrggbbaa, hsl(), hsla() — into rgb() plus a
 * separate *-opacity attribute, which svg2pdf handles correctly. They run on
 * the parsed SVG tree right before it is handed to svg2pdf (PDF export and,
 * through it, gallery thumbnails). The canvas is unaffected: browsers render
 * these formats natively.
 */

export interface NormalizedColor {
    color: string;
    alpha: number;
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

const parseAlphaToken = (token: string | undefined): number => {
    if (token === undefined || token === '') return 1;
    const v = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
};

/**
 * Returns the rgb()+alpha equivalent for color syntaxes svg2pdf cannot parse,
 * or null when the value should be left untouched (already supported, or not
 * a plain color at all: none, url(...), currentColor, inherit, ...).
 */
export const normalizeCssColor = (value: string): NormalizedColor | null => {
    const v = value.trim();

    // #rgba (4-digit)
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    if (m) {
        const [r, g, b, a] = m.slice(1).map(d => parseInt(d + d, 16));
        return { color: `rgb(${r}, ${g}, ${b})`, alpha: a / 255 };
    }

    // #rrggbbaa (8-digit)
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (m) {
        const [r, g, b, a] = m.slice(1).map(d => parseInt(d, 16));
        return { color: `rgb(${r}, ${g}, ${b})`, alpha: a / 255 };
    }

    // hsl()/hsla(), legacy comma and modern space/slash syntax
    m = /^hsla?\(\s*([+-]?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
    if (m) {
        const [r, g, b] = hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
        return { color: `rgb(${r}, ${g}, ${b})`, alpha: parseAlphaToken(m[4]) };
    }

    return null;
};

const OPACITY_ATTR: Record<string, string> = {
    'fill': 'fill-opacity',
    'stroke': 'stroke-opacity',
    'stop-color': 'stop-opacity',
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const normalizeElement = (el: Element): void => {
    for (const [attr, opacityAttr] of Object.entries(OPACITY_ATTR)) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const parsed = normalizeCssColor(value);
        if (!parsed) continue;
        el.setAttribute(attr, parsed.color);
        if (parsed.alpha < 1) {
            const existing = parseFloat(el.getAttribute(opacityAttr) ?? '1');
            const base = Number.isFinite(existing) ? existing : 1;
            el.setAttribute(opacityAttr, String(round3(base * parsed.alpha)));
        }
    }

    const style = el.getAttribute('style');
    if (!style) return;
    const decls = style.split(';').map(d => d.trim()).filter(Boolean);
    const out: string[] = [];
    const extraOpacity: Record<string, number> = {};
    for (const decl of decls) {
        const idx = decl.indexOf(':');
        if (idx === -1) { out.push(decl); continue; }
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        const opacityAttr = OPACITY_ATTR[prop];
        const parsed = opacityAttr ? normalizeCssColor(val) : null;
        if (!parsed) { out.push(decl); continue; }
        out.push(`${prop}: ${parsed.color}`);
        if (parsed.alpha < 1) extraOpacity[opacityAttr] = parsed.alpha;
    }
    for (const [prop, alpha] of Object.entries(extraOpacity)) {
        const existingDecl = out.find(d => d.toLowerCase().startsWith(prop + ':'));
        if (existingDecl) {
            const base = parseFloat(existingDecl.split(':')[1]);
            out[out.indexOf(existingDecl)] = `${prop}: ${round3((Number.isFinite(base) ? base : 1) * alpha)}`;
        } else {
            out.push(`${prop}: ${round3(alpha)}`);
        }
    }
    el.setAttribute('style', out.join('; '));
};

/** Rewrites unsupported color formats on `root` and every descendant in place. */
export const normalizeSvgColorsInTree = (root: Element): void => {
    normalizeElement(root);
    root.querySelectorAll('*').forEach(normalizeElement);
};

// --- Greyscale support -------------------------------------------------------

// CSS named colors (Level 4 complete set) — needed because svg2pdf accepts
// them, so a greyscale pass must too. Values are [r, g, b].
const NAMED_COLORS: Record<string, [number, number, number]> = {
    aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255], aquamarine: [127, 255, 212],
    azure: [240, 255, 255], beige: [245, 245, 220], bisque: [255, 228, 196], black: [0, 0, 0],
    blanchedalmond: [255, 235, 205], blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42],
    burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0], chocolate: [210, 105, 30],
    coral: [255, 127, 80], cornflowerblue: [100, 149, 237], cornsilk: [255, 248, 220], crimson: [220, 20, 60],
    cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11],
    darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169], darkkhaki: [189, 183, 107],
    darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204],
    darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139],
    darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209], darkviolet: [148, 0, 211],
    deeppink: [255, 20, 147], deepskyblue: [0, 191, 255], dimgray: [105, 105, 105], dimgrey: [105, 105, 105],
    dodgerblue: [30, 144, 255], firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34],
    fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255], gold: [255, 215, 0],
    goldenrod: [218, 165, 32], gray: [128, 128, 128], green: [0, 128, 0], greenyellow: [173, 255, 47],
    grey: [128, 128, 128], honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92],
    indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140], lavender: [230, 230, 250],
    lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0], lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230],
    lightcoral: [240, 128, 128], lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211],
    lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightsalmon: [255, 160, 122],
    lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250], lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153],
    lightsteelblue: [176, 196, 222], lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50],
    linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0], mediumaquamarine: [102, 205, 170],
    mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211], mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113],
    mediumslateblue: [123, 104, 238], mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133],
    midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225], moccasin: [255, 228, 181],
    navajowhite: [255, 222, 173], navy: [0, 0, 128], oldlace: [253, 245, 230], olive: [128, 128, 0],
    olivedrab: [107, 142, 35], orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214],
    palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238], palevioletred: [219, 112, 147],
    papayawhip: [255, 239, 213], peachpuff: [255, 218, 185], peru: [205, 133, 63], pink: [255, 192, 203],
    plum: [221, 160, 221], powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153],
    red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225], saddlebrown: [139, 69, 19],
    salmon: [250, 128, 114], sandybrown: [244, 164, 96], seagreen: [46, 139, 87], seashell: [255, 245, 238],
    sienna: [160, 82, 45], silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205],
    slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250], springgreen: [0, 255, 127],
    steelblue: [70, 130, 180], tan: [210, 180, 140], teal: [0, 128, 128], thistle: [216, 191, 216],
    tomato: [255, 99, 71], turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179],
    white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0], yellowgreen: [154, 205, 50],
};

/** Parses hex/rgb()/rgba()/named colors to rgba. Null = not a plain color (none, url(), currentColor, ...). */
const parseToRgba = (value: string): { r: number; g: number; b: number; a: number } | null => {
    const v = value.trim().toLowerCase();

    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    if (m) {
        const [r, g, b] = m.slice(1).map(d => parseInt(d + d, 16));
        return { r, g, b, a: 1 };
    }
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (m) {
        const [r, g, b] = m.slice(1).map(d => parseInt(d, 16));
        return { r, g, b, a: 1 };
    }
    m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
    if (m) {
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    }
    const named = NAMED_COLORS[v];
    if (named) return { r: named[0], g: named[1], b: named[2], a: 1 };
    return null;
};

/** Same luminance formula as pdfService's hexToGreyscale. */
const toGray = (value: string): string | null => {
    const rgba = parseToRgba(value);
    if (!rgba) return null;
    const y = Math.round(0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b);
    return rgba.a < 1 ? `rgba(${y}, ${y}, ${y}, ${rgba.a})` : `rgb(${y}, ${y}, ${y})`;
};

const COLOR_PROPS = ['fill', 'stroke', 'stop-color'];

const desaturateElement = (el: Element): void => {
    for (const prop of COLOR_PROPS) {
        const value = el.getAttribute(prop);
        if (!value) continue;
        const gray = toGray(value);
        if (gray) el.setAttribute(prop, gray);
    }
    const style = el.getAttribute('style');
    if (!style) return;
    const out = style.split(';').map(d => d.trim()).filter(Boolean).map(decl => {
        const idx = decl.indexOf(':');
        if (idx === -1) return decl;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (!COLOR_PROPS.includes(prop)) return decl;
        const gray = toGray(val);
        return gray ? `${prop}: ${gray}` : decl;
    });
    el.setAttribute('style', out.join('; '));
};

/** Converts every plain color on `root` and descendants to its luminance gray (greyscale export). */
export const desaturateSvgColorsInTree = (root: Element): void => {
    desaturateElement(root);
    root.querySelectorAll('*').forEach(desaturateElement);
};

// --- Element-opacity baking --------------------------------------------------

const multiplyOpacityOnNode = (el: Element, factor: number): boolean => {
    // svg2pdf resolves `opacity` via style first, then the attribute — multiply
    // whichever it will actually read. Returns true if the node carried one.
    const style = el.getAttribute('style');
    if (style && /(^|;)\s*opacity\s*:/i.test(style)) {
        const out = style.split(';').map(d => d.trim()).filter(Boolean).map(decl => {
            const idx = decl.indexOf(':');
            const prop = decl.slice(0, idx).trim().toLowerCase();
            if (prop !== 'opacity') return decl;
            const v = parseFloat(decl.slice(idx + 1));
            return `opacity: ${round3((Number.isFinite(v) ? v : 1) * factor)}`;
        });
        el.setAttribute('style', out.join('; '));
        return true;
    }
    const attr = el.getAttribute('opacity');
    if (attr !== null) {
        const v = parseFloat(attr);
        el.setAttribute('opacity', String(round3((Number.isFinite(v) ? v : 1) * factor)));
        return true;
    }
    return false;
};

/**
 * Composes a doctect element's opacity into the SVG tree itself.
 *
 * Why not a surrounding /ca graphics state: svg2pdf emits its own per-shape
 * graphics states for any internal fill-opacity/opacity/rgba alpha, and PDF
 * gstates REPLACE (not multiply) the outer value — the element opacity would
 * be silently dropped for exactly those shapes. And svg2pdf's inheritance
 * model REPLACES the `opacity` scope at any node that carries its own
 * `opacity` (nearest-ancestor-wins, no multiplication), so the factor must be
 * multiplied into the root AND into every node with its own `opacity`.
 * fill-opacity/stroke-opacity/rgba alphas multiply WITH the opacity scope in
 * svg2pdf, so they are deliberately left untouched.
 *
 * Known residual (accepted): per-shape alpha still accumulates where internal
 * shapes overlap — true group opacity needs PDF transparency groups, which
 * jsPDF cannot emit.
 */
export const bakeElementOpacityIntoSvg = (root: Element, factor: number): void => {
    if (factor >= 1) return;
    if (!multiplyOpacityOnNode(root, factor)) {
        root.setAttribute('opacity', String(round3(factor)));
    }
    root.querySelectorAll('*').forEach(el => multiplyOpacityOnNode(el, factor));
};
