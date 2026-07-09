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
