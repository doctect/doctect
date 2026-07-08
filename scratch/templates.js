/* ================================================================
   D&D DUNGEON MASTER'S CHRONICLE — STAGE 1: TEMPLATES
   ----------------------------------------------------------------
   Paste this whole file into the Generator's TEMPLATES stage.

   Design canvas: reMarkable Paper Pro (509 x 679). A scaling pass
   produces the iPad A4 (595 x 842) variant from the same layouts,
   so both device targets stay in sync automatically.

   !! KEEP CFG BELOW IN SYNC with CONFIG in the Hierarchy script.
   These counts drive how many tap-target overlays each hub page
   gets (grid cells themselves are not documented as tappable, so
   every cell gets an invisible/framed link rect on top).
   ================================================================ */

const CFG = { PCS: 12, ARCS: 10, SESSIONS_PER_ARC: 20, ENCOUNTERS: 4 };

/* ---------------- palette: manuscript & heraldry ---------------- */
const P = {
  page:  '#f6efe0',   // parchment ground
  panel: '#ede1c6',   // deeper parchment (cells, cards)
  ink:   '#2b2118',   // walnut ink
  faint: '#8a7a64',   // faded ink (writing rules)
  crimson: '#7a1f1f', // heraldic crimson
  blood: '#571414',   // deep crimson (ribbon tails, shadows)
  gold:  '#a9812e',   // antique gold
  pale:  '#d8bf7f',   // pale gold (inner lines, jewels)
  bone:  '#e9e0ca',   // bone / horn
  steel: '#cfc8b6',   // blade steel
  light: '#f3ead6'    // text on crimson
};

const DISPLAY = 'Cormorant Garamond';
const BODY    = 'Crimson Text';
const UTIL    = 'EB Garamond';

/* ---------------- faceted SVG icon library ----------------------
   Rules learned from the svg-support commit:
   - viewBox only (no width/height) -> scales to the element box
     with preserveAspectRatio "meet" (aspect-fit, centered)
   - plain shapes + inline fill/stroke only (svg2pdf-safe)
------------------------------------------------------------------ */
const NS = 'xmlns="http://www.w3.org/2000/svg"';

const ART = {};

ART.d20 = `<svg ${NS} viewBox="0 0 100 100">
<polygon points="50,3 91,26 91,74 50,97 9,74 9,26" fill="${P.gold}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/>
<polygon points="28,37 72,37 50,76" fill="${P.pale}" stroke="${P.ink}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M50,3 L28,37 M50,3 L72,37 M91,26 L72,37 M9,26 L28,37 M9,74 L28,37 M91,74 L72,37 M9,74 L50,76 M91,74 L50,76 M50,97 L50,76" stroke="${P.ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

ART.swords = `<svg ${NS} viewBox="0 0 100 100">
<g stroke="${P.ink}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
<g transform="rotate(45 50 50)">
<polygon points="46,6 54,6 54,56 50,64 46,56" fill="${P.steel}"/>
<rect x="35" y="56" width="30" height="7" rx="2.5" fill="${P.gold}"/>
<rect x="46.5" y="63" width="7" height="17" fill="${P.crimson}"/>
<circle cx="50" cy="85" r="5" fill="${P.gold}"/>
</g>
<g transform="rotate(-45 50 50)">
<polygon points="46,6 54,6 54,56 50,64 46,56" fill="${P.steel}"/>
<rect x="35" y="56" width="30" height="7" rx="2.5" fill="${P.gold}"/>
<rect x="46.5" y="63" width="7" height="17" fill="${P.crimson}"/>
<circle cx="50" cy="85" r="5" fill="${P.gold}"/>
</g>
</g>
</svg>`;

ART.dragon = `<svg ${NS} viewBox="0 0 120 100">
<g stroke="${P.ink}" stroke-width="2.6" stroke-linejoin="round">
<polygon points="14,36 2,30 12,48" fill="${P.crimson}"/>
<polygon points="11,52 0,52 9,64" fill="${P.crimson}"/>
<polygon points="9,68 0,74 13,78" fill="${P.crimson}"/>
<polygon points="16,30 24,58 46,66 40,90 12,82 4,50" fill="${P.blood}"/>
<polygon points="50,22 30,2 60,16" fill="${P.bone}"/>
<polygon points="38,26 22,8 46,22" fill="${P.bone}"/>
<polygon points="54,58 102,74 92,84 46,68" fill="${P.blood}"/>
<polygon points="16,30 52,20 100,38 114,46 70,52 54,56 24,56" fill="${P.crimson}"/>
<path d="M52,20 L54,56 M100,38 L70,52" stroke="${P.ink}" stroke-width="1.8" fill="none"/>
<polygon points="66,53 71,61 76,52" fill="${P.bone}" stroke-width="1.4"/>
<polygon points="80,50 85,58 90,49" fill="${P.bone}" stroke-width="1.4"/>
<polygon points="94,47 98,53 103,46" fill="${P.bone}" stroke-width="1.4"/>
<polygon points="60,32 74,36 62,42" fill="${P.pale}" stroke-width="1.6"/>
<circle cx="105" cy="44" r="1.8" fill="${P.ink}" stroke="none"/>
</g>
</svg>`;

ART.shield = `<svg ${NS} viewBox="0 0 100 120">
<path d="M50 6 L92 18 L92 56 C92 90 73 107 50 115 C27 107 8 90 8 56 L8 18 Z" fill="${P.crimson}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>
<path d="M50 16 L83 25 L83 55 C83 82 68 96 50 103 C32 96 17 82 17 55 L17 25 Z" fill="none" stroke="${P.pale}" stroke-width="2.5"/>
</svg>`;

ART.heart = `<svg ${NS} viewBox="0 0 100 100">
<path d="M50 88 C20 64 6 46 6 30 C6 14 20 6 32 6 C42 6 48 14 50 20 C52 14 58 6 68 6 C80 6 94 14 94 30 C94 46 80 64 50 88 Z" fill="${P.crimson}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>
<path d="M22 30 C22 21 28 16 33 15" fill="none" stroke="${P.pale}" stroke-width="3" stroke-linecap="round"/>
</svg>`;

ART.skull = `<svg ${NS} viewBox="0 0 100 100">
<path d="M50 8 C24 8 12 26 12 44 C12 56 18 64 26 68 L26 80 L38 80 L38 72 L46 72 L46 80 L54 80 L54 72 L62 72 L62 80 L74 80 L74 68 C82 64 88 56 88 44 C88 26 76 8 50 8 Z" fill="${P.bone}" stroke="${P.ink}" stroke-width="3.5" stroke-linejoin="round"/>
<ellipse cx="35" cy="42" rx="9" ry="10" fill="${P.ink}"/>
<ellipse cx="65" cy="42" rx="9" ry="10" fill="${P.ink}"/>
<polygon points="50,50 44,61 56,61" fill="${P.ink}"/>
</svg>`;

ART.scroll = `<svg ${NS} viewBox="0 0 100 100">
<rect x="20" y="16" width="60" height="68" fill="${P.bone}" stroke="${P.ink}" stroke-width="3"/>
<ellipse cx="50" cy="16" rx="32" ry="9" fill="${P.pale}" stroke="${P.ink}" stroke-width="3"/>
<ellipse cx="50" cy="84" rx="32" ry="9" fill="${P.pale}" stroke="${P.ink}" stroke-width="3"/>
<line x1="32" y1="36" x2="68" y2="36" stroke="${P.faint}" stroke-width="2.5"/>
<line x1="32" y1="48" x2="68" y2="48" stroke="${P.faint}" stroke-width="2.5"/>
<line x1="32" y1="60" x2="60" y2="60" stroke="${P.faint}" stroke-width="2.5"/>
</svg>`;

ART.potion = `<svg ${NS} viewBox="0 0 100 100">
<rect x="42" y="4" width="16" height="9" rx="2" fill="${P.faint}" stroke="${P.ink}" stroke-width="2"/>
<path d="M44 13 L44 30 C30 36 22 46 22 58 A28 28 0 0 0 78 58 C78 46 70 36 56 30 L56 13 Z" fill="${P.bone}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/>
<path d="M24 60 A26 26 0 1 0 76 60 Z" fill="${P.crimson}" opacity="0.85"/>
<circle cx="42" cy="70" r="3" fill="${P.pale}"/>
<circle cx="55" cy="78" r="2.2" fill="${P.pale}"/>
</svg>`;

ART.crown = `<svg ${NS} viewBox="0 0 100 100">
<path d="M14 70 L14 34 L33 50 L50 20 L67 50 L86 34 L86 70 Z" fill="${P.gold}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/>
<rect x="14" y="70" width="72" height="12" fill="${P.crimson}" stroke="${P.ink}" stroke-width="3"/>
<circle cx="50" cy="20" r="4.5" fill="${P.crimson}" stroke="${P.ink}" stroke-width="2"/>
<circle cx="30" cy="76" r="3" fill="${P.pale}" stroke="none"/>
<circle cx="50" cy="76" r="3" fill="${P.pale}" stroke="none"/>
<circle cx="70" cy="76" r="3" fill="${P.pale}" stroke="none"/>
</svg>`;

ART.compass = `<svg ${NS} viewBox="0 0 100 100">
<circle cx="50" cy="50" r="44" fill="${P.bone}" stroke="${P.ink}" stroke-width="3"/>
<polygon points="50,26 54,46 74,50 54,54 50,74 46,54 26,50 46,46" transform="rotate(45 50 50)" fill="${P.crimson}" stroke="${P.ink}" stroke-width="1.5" stroke-linejoin="round"/>
<polygon points="50,12 56,44 88,50 56,56 50,88 44,56 12,50 44,44" fill="${P.gold}" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round"/>
<circle cx="50" cy="50" r="4" fill="${P.ink}"/>
</svg>`;

/* ribbon banner: always used at a 433x50 box, so the viewBox keeps
   the same 8.66 aspect and fills the element edge-to-edge */
ART.banner = `<svg ${NS} viewBox="0 0 866 100">
<polygon points="70,26 6,26 32,50 6,74 70,74" fill="${P.blood}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/>
<polygon points="796,26 860,26 834,50 860,74 796,74" fill="${P.blood}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/>
<polygon points="70,26 84,14 84,26" fill="${P.ink}"/>
<polygon points="796,26 782,14 782,26" fill="${P.ink}"/>
<rect x="70" y="12" width="726" height="76" fill="${P.crimson}" stroke="${P.ink}" stroke-width="3.5"/>
<rect x="84" y="24" width="698" height="52" fill="none" stroke="${P.pale}" stroke-width="2.5"/>
</svg>`;

/* used at w:h close to 300:18 */
ART.divider = `<svg ${NS} viewBox="0 0 400 24">
<line x1="6" y1="12" x2="172" y2="12" stroke="${P.gold}" stroke-width="2.5"/>
<line x1="228" y1="12" x2="394" y2="12" stroke="${P.gold}" stroke-width="2.5"/>
<polygon points="200,2 212,12 200,22 188,12" fill="${P.crimson}" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round"/>
<circle cx="178" cy="12" r="3" fill="${P.gold}"/>
<circle cx="222" cy="12" r="3" fill="${P.gold}"/>
</svg>`;

ART.flourish = `<svg ${NS} viewBox="0 0 100 100">
<path d="M6 78 C6 30 30 6 78 6" fill="none" stroke="${P.gold}" stroke-width="5" stroke-linecap="round"/>
<path d="M6 56 C6 30 30 6 56 6" fill="none" stroke="${P.gold}" stroke-width="2.5" stroke-linecap="round"/>
<polygon points="78,6 88,0 98,6 88,12" fill="${P.crimson}" stroke="${P.ink}" stroke-width="1.5" stroke-linejoin="round"/>
<polygon points="6,78 0,88 6,98 12,88" fill="${P.crimson}" stroke="${P.ink}" stroke-width="1.5" stroke-linejoin="round"/>
<circle cx="24" cy="24" r="3.5" fill="${P.gold}"/>
</svg>`;

ART.chevL = `<svg ${NS} viewBox="0 0 60 80">
<polygon points="50,6 8,40 50,74" fill="${P.gold}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

ART.chevR = `<svg ${NS} viewBox="0 0 60 80">
<polygon points="10,6 52,40 10,74" fill="${P.gold}" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

ART.backArrow = `<svg ${NS} viewBox="0 0 100 80">
<polygon points="6,40 46,8 46,26 94,26 94,54 46,54 46,72" fill="${P.gold}" stroke="${P.ink}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

/* ---------------- element helpers (design units = RM px) -------- */
const W0 = 509, H0 = 679;   // design canvas
const M = 30;               // content margin
const CW = W0 - 2 * M;      // content width = 449

let _z = 0;
const el = (props) => Object.assign({
  id: 0, type: 'rect', x: 0, y: 0, w: 10, h: 10,
  rotation: 0, fill: 'none', stroke: 'none', strokeWidth: 0,
  opacity: 1, zIndex: _z++
}, props);

const box = (x, y, w, h, extra) => el(Object.assign({ type: 'rect', x: x, y: y, w: w, h: h }, extra || {}));

const txt = (x, y, w, h, text, extra) => el(Object.assign({
  type: 'text', x: x, y: y, w: w, h: h, text: text,
  fontSize: 12, fontFamily: BODY, textColor: P.ink,
  fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
  align: 'left', verticalAlign: 'top', autoWidth: false
}, extra || {}));

const svgE = (x, y, w, h, markup, extra) => el(Object.assign({
  type: 'svg', x: x, y: y, w: w, h: h, svgContent: markup,
  fill: '', stroke: '', strokeWidth: 0
}, extra || {}));

const oval = (x, y, w, h, extra) => el(Object.assign({
  type: 'ellipse', x: x, y: y, w: w, h: h,
  fill: P.page, stroke: P.ink, strokeWidth: 1.3
}, extra || {}));

const rule  = (x, y, w, extra) => box(x, y, w, 1, Object.assign({ fill: P.faint, opacity: 0.42 }, extra || {}));
const vline = (x, y, h, extra) => box(x, y, 1, h, Object.assign({ fill: P.faint, opacity: 0.42 }, extra || {}));

const label = (x, y, w, text, extra) => txt(x, y, w, 12, text, Object.assign({
  fontSize: 9.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
}, extra || {}));

const check = (x, y, s) => box(x, y, s || 11, s || 11, {
  fill: P.page, stroke: P.ink, strokeWidth: 1.2, borderRadius: 2
});

const link = (x, y, w, h, target, value, extra) => {
  const e = box(x, y, w, h, Object.assign({ fill: 'none', stroke: 'none', strokeWidth: 0, linkTarget: target }, extra || {}));
  if (value !== undefined) e.linkValue = String(value);
  return e;
};

/* header cell for tables (crimson band + light text) */
const th = (x, y, w, h, text) => [
  box(x, y, w, h, { fill: P.crimson, stroke: P.blood, strokeWidth: 0.8 }),
  txt(x, y, w, h, text, { fontSize: 7.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.light, align: 'center', verticalAlign: 'middle' })
];

/* grid of child nodes (w/h are ONE CELL) */
const grid = (x, y, cellW, cellH, cols, count, opts) => {
  const o = opts || {};
  return el({
    type: 'grid', x: x, y: y, w: cellW, h: cellH,
    fill: P.panel, stroke: '#c8b58c', strokeWidth: 1,
    gridConfig: {
      cols: cols,
      gapX: o.gapX !== undefined ? o.gapX : 6,
      gapY: o.gapY !== undefined ? o.gapY : 6,
      sourceType: 'current', sourceId: '',
      displayField: 'title',
      offsetMode: 'static', offsetStart: 0,
      dataSliceStart: 0, dataSliceCount: count
    }
  });
};

/* framed tap targets laid over grid cells (child_index 0..count-1) */
function gridLinks(x, y, cellW, cellH, cols, count, gapX, gapY, style) {
  console.log("gridLinks");
  const s = style || {};
  const out = [];
  for (let i = 0; i < count; i++) {
    const cx = x + (i % cols) * (cellW + gapX);
    const cy = y + Math.floor(i / cols) * (cellH + gapY);
    out.push(link(cx, cy, cellW, cellH, 'child_index', i, {
      stroke: s.stroke || P.gold,
      strokeWidth: s.sw !== undefined ? s.sw : 1.2,
      borderRadius: s.r !== undefined ? s.r : 4
    }));
  }
  return out;
}

/* page chrome: parchment ground, double frame, flourished corners,
   home d20 + back arrow (top right), sibling chevrons (bottom) */
function chrome(opts) {
  console.log("chrome");
  const o = Object.assign({ home: true, back: true, prevNext: false, flourish: true }, opts || {});
  const out = [];
  out.push(box(0, 0, W0, H0, { fill: P.page }));
  out.push(box(12, 12, W0 - 24, H0 - 24, { stroke: P.ink, strokeWidth: 1.6 }));
  out.push(box(17, 17, W0 - 34, H0 - 34, { stroke: P.gold, strokeWidth: 0.8 }));
  if (o.flourish) {
    out.push(svgE(15, 15, 26, 26, ART.flourish));
    out.push(svgE(W0 - 41, 15, 26, 26, ART.flourish, { rotation: 90 }));
    out.push(svgE(W0 - 41, H0 - 41, 26, 26, ART.flourish, { rotation: 180 }));
    out.push(svgE(15, H0 - 41, 26, 26, ART.flourish, { rotation: 270 }));
  }
  if (o.back) {
    out.push(svgE(W0 - 78, 22, 18, 14, ART.backArrow));
    out.push(link(W0 - 82, 17, 26, 24, 'parent'));
  }
  if (o.home) {
    out.push(svgE(W0 - 52, 19, 20, 20, ART.d20));
    out.push(link(W0 - 56, 16, 28, 26, 'specific_node', 'root'));
  }
  if (o.prevNext) {
    out.push(svgE(M + 22, H0 - 42, 14, 18, ART.chevL));
    out.push(link(M + 14, H0 - 48, 30, 30, 'sibling', '-1'));
    out.push(svgE(W0 - M - 36, H0 - 42, 14, 18, ART.chevR));
    out.push(link(W0 - M - 44, H0 - 48, 30, 30, 'sibling', '1'));
  }
  return out;
}

/* ribbon banner + centered title binding (always 433 x 50) */
function banner(y, textStr, size) {
  console.log("banner");
  const x = 38, w = 433, h = 50;
  return [
    svgE(x, y, w, h, ART.banner),
    txt(x + 48, y + 8, w - 96, h - 16, textStr, {
      fontSize: size || 19, fontFamily: DISPLAY, fontWeight: 'bold',
      textColor: P.light, align: 'center', verticalAlign: 'middle'
    })
  ];
}

const divider = (y) => svgE(105, y, 300, 18, ART.divider);

/* ---------------- variant scaling pass -------------------------- */
function scaleTemplates(tpls, W, H) {
  console.log("scaleTemplates");
  const sx = W / W0, sy = H / H0, sf = Math.min(sx, sy);
  const out = {};
  Object.keys(tpls).forEach(function (key) {
    const t = tpls[key];
    out[key] = Object.assign({}, t, {
      width: W, height: H,
      elements: t.elements.map(function (e) {
        const n = Object.assign({}, e, {
          x: +(e.x * sx).toFixed(1), w: +(e.w * sx).toFixed(1),
          y: +(e.y * sy).toFixed(1), h: +(e.h * sy).toFixed(1)
        });
        if (n.strokeWidth) n.strokeWidth = +(n.strokeWidth * sf).toFixed(2);
        if (n.borderRadius) n.borderRadius = Math.round(n.borderRadius * sf);
        if (n.fontSize) n.fontSize = Math.max(6, +(n.fontSize * sf).toFixed(1));
        if (n.patternSpacing) n.patternSpacing = Math.max(2, Math.round(n.patternSpacing * sx));
        if (n.gridConfig) n.gridConfig = Object.assign({}, n.gridConfig, {
          gapX: Math.round((n.gridConfig.gapX || 0) * sx),
          gapY: Math.round((n.gridConfig.gapY || 0) * sy)
        });
        return n;
      })
    });
  });
  return out;
}

/* ================================================================
   TEMPLATE BUILDERS (design units = reMarkable 509 x 679)
   ================================================================ */

/* ---- 1. Campaign Home: the dragon crest hub -------------------- */
function tplHome() {
  console.log("tplHome");
  const e = [];
  e.push.apply(e, chrome({ home: false, back: false }));
  e.push(svgE(175, 42, 160, 134, ART.dragon));
  e.push(txt(40, 190, 429, 44, '{{title}}', {
    fontSize: 31, fontFamily: DISPLAY, fontWeight: 'bold',
    align: 'center', verticalAlign: 'middle'
  }));
  e.push(txt(60, 236, 389, 18, '{{subtitle}}', {
    fontSize: 13, fontStyle: 'italic', align: 'center', textColor: P.faint
  }));
  e.push(divider(262));

  /* nav card: The Party */
  e.push(box(46, 296, 200, 122, { fill: P.panel, stroke: P.gold, strokeWidth: 1.6, borderRadius: 10 }));
  e.push(svgE(120, 308, 52, 62, ART.shield));
  e.push(txt(46, 376, 200, 16, 'THE PARTY', {
    align: 'center', fontWeight: 'bold', fontSize: 13, fontFamily: UTIL, textColor: P.crimson
  }));
  e.push(txt(46, 394, 200, 12, 'Rosters, sheets, level logs', {
    align: 'center', fontSize: 9, textColor: P.faint, fontStyle: 'italic'
  }));
  e.push(link(46, 296, 200, 122, 'child_index', 0));

  /* nav card: Campaign Chronicle */
  e.push(box(263, 296, 200, 122, { fill: P.panel, stroke: P.gold, strokeWidth: 1.6, borderRadius: 10 }));
  e.push(svgE(333, 306, 60, 64, ART.scroll));
  e.push(txt(263, 376, 200, 16, 'CAMPAIGN CHRONICLE', {
    align: 'center', fontWeight: 'bold', fontSize: 13, fontFamily: UTIL, textColor: P.crimson
  }));
  e.push(txt(263, 394, 200, 12, 'Arcs, sessions, encounters', {
    align: 'center', fontSize: 9, textColor: P.faint, fontStyle: 'italic'
  }));
  e.push(link(263, 296, 200, 122, 'child_index', 1));

  e.push(txt(30, 434, 449, 14, 'CAMPAIGN NOTES', {
    align: 'center', fontSize: 10, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
  }));
  [462, 484, 506, 528, 550, 572].forEach(function (y) { e.push(rule(46, y, 417)); });
  e.push(svgE(239, 596, 32, 32, ART.compass));
  return { id: 'tpl_home', name: 'Campaign Home', width: W0, height: H0, elements: e };
}

/* ---- 2. Party Overview ------------------------------------------ */
function tplParty() {
  console.log("tplParty");
  const e = [];
  e.push.apply(e, chrome());
  e.push.apply(e, banner(24, '{{title}}'));
  e.push(txt(60, 80, 389, 13, 'Tap a hero to open their sheet.', {
    align: 'center', fontSize: 9.5, fontStyle: 'italic', textColor: P.faint
  }));
  const gx = 30, gy = 102, cw = 221, ch = 58, cols = 2, gapX = 7, gapY = 6;
  e.push(grid(gx, gy, cw, ch, cols, CFG.PCS, { gapX: gapX, gapY: gapY }));
  e.push.apply(e, gridLinks(gx, gy, cw, ch, cols, CFG.PCS, gapX, gapY, { stroke: P.gold, sw: 1.3, r: 5 }));

  e.push(label(30, 496, 180, 'PARTY TREASURY'));
  ['GOLD', 'SILVER', 'COPPER'].forEach(function (name, i) {
    const bx = 30 + i * 76;
    e.push(box(bx, 514, 68, 36, { fill: P.page, stroke: P.ink, strokeWidth: 1.1, borderRadius: 5 }));
    e.push(txt(bx, 518, 68, 10, name, {
      align: 'center', fontSize: 7.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
    }));
  });
  e.push(label(30, 566, 220, 'PARTY BONDS & DEBTS'));
  e.push(rule(30, 590, 250));
  e.push(rule(30, 610, 250));

  e.push(label(300, 496, 179, 'GROUP QUESTS'));
  [522, 544, 566, 588, 610].forEach(function (y) { e.push(rule(300, y, 179)); });
  return { id: 'tpl_party', name: 'Party Overview', width: W0, height: H0, elements: e };
}

/* ---- 3. PC Sheet ------------------------------------------------- */
function tplPC() {
  console.log("tplPc");
  const e = [];
  e.push.apply(e, chrome({ prevNext: true }));
  e.push.apply(e, banner(22, '{{title}}'));
  e.push(txt(60, 78, 389, 16, '{{race}}  \u00B7  {{class}}  \u00B7  Level {{level}}', {
    align: 'center', fontSize: 12.5, fontFamily: DISPLAY, fontWeight: 'bold',
    textColor: P.crimson, verticalAlign: 'middle'
  }));
  e.push(txt(60, 95, 389, 12, 'Player: {{player}}', {
    align: 'center', fontSize: 9, fontStyle: 'italic', textColor: P.faint
  }));

  /* abilities, 2 x 3 */
  e.push(label(30, 112, 120, 'ABILITIES'));
  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(function (name, i) {
    const bx = 30 + (i % 2) * 78, by = 130 + Math.floor(i / 2) * 62;
    e.push(box(bx, by, 70, 54, { fill: P.panel, stroke: P.ink, strokeWidth: 1.3, borderRadius: 6 }));
    e.push(txt(bx, by + 4, 70, 10, name, {
      align: 'center', fontSize: 8.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
    }));
    e.push(oval(bx + 21, by + 36, 28, 15, { strokeWidth: 1, stroke: P.faint }));
  });

  /* defenses & vitals */
  e.push(label(192, 112, 200, 'DEFENSES & VITALS'));
  e.push(svgE(192, 128, 52, 62, ART.shield));
  e.push(txt(186, 192, 64, 10, 'ARMOR CLASS', {
    align: 'center', fontSize: 6.8, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
  }));
  e.push(svgE(258, 132, 50, 44, ART.heart));
  e.push(txt(251, 192, 64, 10, 'HIT POINTS', {
    align: 'center', fontSize: 6.8, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
  }));
  ['INITIATIVE', 'SPEED', 'PROF. BONUS', 'PERCEPTION'].forEach(function (name, i) {
    const bx = 324 + (i % 2) * 81, by = 128 + Math.floor(i / 2) * 47;
    e.push(box(bx, by, 74, 42, { fill: P.page, stroke: P.ink, strokeWidth: 1.1, borderRadius: 5 }));
    e.push(txt(bx, by + 4, 74, 9, name, {
      align: 'center', fontSize: 6.8, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
    }));
  });
  ['CURRENT HP', 'TEMP HP', 'HIT DICE'].forEach(function (name, i) {
    const bx = 192 + i * 97;
    e.push(box(bx, 224, 93, 30, { fill: P.page, stroke: P.ink, strokeWidth: 1.1, borderRadius: 5 }));
    e.push(txt(bx, 228, 93, 9, name, {
      align: 'center', fontSize: 6.8, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
    }));
  });

  /* death saves */
  e.push(svgE(192, 262, 20, 20, ART.skull));
  e.push(txt(218, 266, 52, 10, 'SAVES', { fontSize: 7.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold }));
  for (let k = 0; k < 3; k++) e.push(oval(268 + k * 18, 264, 13, 13));
  e.push(txt(262, 280, 66, 9, 'PASS', { align: 'center', fontSize: 6.5, textColor: P.faint, fontFamily: UTIL }));
  for (let k = 0; k < 3; k++) e.push(oval(372 + k * 18, 264, 13, 13, { fill: P.panel }));
  e.push(txt(366, 280, 66, 9, 'FAIL', { align: 'center', fontSize: 6.5, textColor: P.faint, fontFamily: UTIL }));

  /* attacks & spellcasting */
  e.push(svgE(30, 318, 15, 15, ART.swords));
  e.push(label(52, 320, 240, 'ATTACKS & SPELLCASTING'));
  e.push.apply(e, th(30, 338, 190, 17, 'NAME'));
  e.push.apply(e, th(224, 338, 58, 17, 'ATK'));
  e.push.apply(e, th(286, 338, 193, 17, 'DAMAGE / TYPE'));
  [376, 397, 418, 439].forEach(function (y) { e.push(rule(30, y, 449)); });
  e.push(vline(222, 355, 84));
  e.push(vline(284, 355, 84));

  /* features & equipment */
  e.push(svgE(30, 452, 15, 15, ART.scroll));
  e.push(label(52, 454, 200, 'FEATURES & TRAITS'));
  [478, 498, 518].forEach(function (y) { e.push(rule(30, y, 449)); });

  e.push(svgE(30, 530, 14, 16, ART.potion));
  e.push(label(52, 532, 220, 'EQUIPMENT & TREASURE'));
  e.push(rule(30, 556, 270));
  e.push(rule(30, 572, 270));
  e.push(box(316, 548, 163, 34, { fill: P.page, stroke: P.ink, strokeWidth: 1.1, borderRadius: 5 }));
  e.push(txt(316, 552, 163, 9, 'COIN PURSE', {
    align: 'center', fontSize: 6.8, fontFamily: UTIL, fontWeight: 'bold', textColor: P.gold
  }));

  /* level-up log button */
  e.push(box(30, 596, 214, 30, { fill: P.crimson, stroke: P.blood, strokeWidth: 1.5, borderRadius: 8 }));
  e.push(svgE(40, 601, 20, 20, ART.crown));
  e.push(txt(66, 598, 172, 26, 'LEVEL-UP LOG', {
    fontSize: 11.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.light, verticalAlign: 'middle'
  }));
  e.push(link(30, 596, 214, 30, 'child_index', 0));
  e.push(txt(262, 604, 217, 14, 'Opens this hero\u2019s level history.', {
    fontSize: 8.5, fontStyle: 'italic', textColor: P.faint
  }));
  return { id: 'tpl_pc', name: 'PC Sheet', width: W0, height: H0, elements: e };
}

/* ---- 4. Level-Up Log -------------------------------------------- */
function tplLevelup() {
  console.log("tplLevelup");
  const e = [];
  e.push.apply(e, chrome());
  e.push(svgE(38, 26, 34, 30, ART.crown));
  e.push(txt(80, 24, 349, 32, '{{title}}', {
    fontSize: 22, fontFamily: DISPLAY, fontWeight: 'bold', align: 'center', verticalAlign: 'middle'
  }));
  e.push(svgE(437, 26, 34, 30, ART.crown));
  e.push(txt(80, 58, 349, 14, '{{pc}}', {
    align: 'center', fontSize: 11, fontStyle: 'italic', textColor: P.crimson, fontFamily: DISPLAY
  }));
  e.push(divider(76));

  e.push.apply(e, th(38, 100, 34, 18, 'LV'));
  e.push.apply(e, th(76, 100, 80, 18, 'DATE'));
  e.push.apply(e, th(160, 100, 42, 18, 'HP'));
  e.push.apply(e, th(206, 100, 265, 18, 'NEW FEATURES, SPELLS & CHOICES'));

  for (let i = 0; i < 20; i++) {
    const ry = 118 + i * 25;
    if (i % 2 === 0) e.push(box(38, ry, 433, 25, { fill: P.panel, opacity: 0.55 }));
    e.push(txt(38, ry, 34, 25, String(i + 1), {
      align: 'center', verticalAlign: 'middle', fontSize: 11,
      fontFamily: DISPLAY, fontWeight: 'bold', textColor: P.crimson
    }));
    if (i === 4 || i === 10 || i === 16) e.push(svgE(452, ry + 6, 14, 12, ART.crown));
    e.push(rule(38, ry + 25, 433, { opacity: 0.32 }));
  }
  e.push(vline(75, 118, 500));
  e.push(vline(159, 118, 500));
  e.push(vline(205, 118, 500));
  e.push(txt(38, 624, 433, 12, 'Crowns mark a new tier of play.', {
    align: 'center', fontSize: 8, fontStyle: 'italic', textColor: P.faint
  }));
  return { id: 'tpl_levelup', name: 'Level-Up Log', width: W0, height: H0, elements: e };
}

/* ---- 5. Campaign Chronicle (index of arcs) ----------------------- */
function tplChronicle() {
  console.log("tplChronicle");
  const e = [];
  e.push.apply(e, chrome());
  e.push.apply(e, banner(24, '{{title}}'));
  e.push(txt(60, 80, 389, 13, 'The campaign, arc by arc. Tap an arc to open it.', {
    align: 'center', fontSize: 9.5, fontStyle: 'italic', textColor: P.faint
  }));
  const gx = 30, gy = 102, cw = 221, ch = 74, cols = 2, gapX = 7, gapY = 7;
  e.push(grid(gx, gy, cw, ch, cols, CFG.ARCS, { gapX: gapX, gapY: gapY }));
  e.push.apply(e, gridLinks(gx, gy, cw, ch, cols, CFG.ARCS, gapX, gapY, { stroke: P.gold, sw: 1.3, r: 5 }));

  e.push(label(30, 520, 220, 'THE STORY SO FAR'));
  [546, 566, 586, 606].forEach(function (y) { e.push(rule(30, y, 449)); });
  return { id: 'tpl_chronicle', name: 'Campaign Chronicle', width: W0, height: H0, elements: e };
}

/* ---- 6. Arc (chapter of 20 sessions) ------------------------------ */
function tplArc() {
  console.log("tplArc");
  const e = [];
  e.push.apply(e, chrome({ prevNext: true }));
  e.push.apply(e, banner(22, '{{title}}'));
  e.push(txt(60, 78, 389, 14, '{{theme}}', {
    align: 'center', fontSize: 11, fontStyle: 'italic', textColor: P.crimson, fontFamily: DISPLAY
  }));
  const gx = 30, gy = 100, cw = 221, ch = 39, cols = 2, gapX = 7, gapY = 5;
  e.push(grid(gx, gy, cw, ch, cols, CFG.SESSIONS_PER_ARC, { gapX: gapX, gapY: gapY }));
  e.push.apply(e, gridLinks(gx, gy, cw, ch, cols, CFG.SESSIONS_PER_ARC, gapX, gapY, { stroke: P.gold, sw: 1, r: 3 }));

  e.push(label(30, 550, 200, 'ARC NOTES'));
  [574, 592, 610].forEach(function (y) { e.push(rule(30, y, 449)); });
  return { id: 'tpl_arc', name: 'Arc', width: W0, height: H0, elements: e };
}

/* ---- 7. Session --------------------------------------------------- */
function tplSession() {
  console.log("tplSession");
  const e = [];
  e.push.apply(e, chrome({ prevNext: true }));
  /* ghost session numeral, low in the stack */
  e.push(txt(104, 190, 300, 220, '{{num}}', {
    fontSize: 150, fontFamily: DISPLAY, fontWeight: 'bold',
    align: 'center', verticalAlign: 'middle', textColor: P.crimson, opacity: 0.07
  }));
  e.push.apply(e, banner(22, '{{title}}'));

  e.push(label(30, 78, 220, 'PREVIOUSLY, IN OUR TALE'));
  e.push(label(352, 78, 40, 'DATE', { fontSize: 8 }));
  e.push(rule(392, 88, 87));
  [102, 119, 136].forEach(function (y) { e.push(rule(30, y, 449)); });

  e.push(label(30, 152, 160, 'PREP CHECKLIST'));
  for (let k = 0; k < 4; k++) {
    const cy = 170 + k * 21;
    e.push(check(30, cy));
    e.push(rule(50, cy + 9, 429));
  }

  e.push(svgE(30, 256, 16, 16, ART.swords));
  e.push(label(54, 258, 150, 'ENCOUNTERS'));
  e.push(txt(210, 260, 269, 12, 'Tap to open \u00B7 each links to a combat tracker', {
    align: 'right', fontSize: 7.5, fontStyle: 'italic', textColor: P.faint
  }));
  const gx = 30, gy = 278, cw = 221, ch = 60, cols = 2, gapX = 7, gapY = 7;
  e.push(grid(gx, gy, cw, ch, cols, CFG.ENCOUNTERS, { gapX: gapX, gapY: gapY }));
  e.push.apply(e, gridLinks(gx, gy, cw, ch, cols, CFG.ENCOUNTERS, gapX, gapY, { stroke: P.crimson, sw: 1.4, r: 6 }));
  ['I', 'II', 'III', 'IV'].forEach(function (numeral, i) {
    const cx = gx + (i % cols) * (cw + gapX), cy = gy + Math.floor(i / cols) * (ch + gapY);
    e.push(txt(cx + 7, cy + 4, 24, 12, numeral, {
      fontSize: 9.5, fontFamily: DISPLAY, fontWeight: 'bold', textColor: P.gold
    }));
  });

  e.push(label(30, 420, 100, 'XP EARNED'));
  e.push(box(30, 438, 110, 38, { fill: P.page, stroke: P.ink, strokeWidth: 1.2, borderRadius: 5 }));
  e.push(label(160, 420, 150, 'LOOT & REWARDS'));
  e.push(rule(160, 450, 319));
  e.push(rule(160, 470, 319));

  e.push(label(30, 494, 240, 'NEXT TIME \u2014 CLIFFHANGER'));
  [518, 536].forEach(function (y) { e.push(rule(30, y, 449)); });
  e.push(label(30, 552, 120, 'DM NOTES'));
  [576, 594, 612].forEach(function (y) { e.push(rule(30, y, 449)); });
  return { id: 'tpl_session', name: 'Session', width: W0, height: H0, elements: e };
}

/* ---- 8. Encounter -------------------------------------------------- */
function tplEncounter() {
  console.log("tplEncounter");
  const e = [];
  e.push.apply(e, chrome({ prevNext: true }));
  e.push(svgE(160, 200, 190, 190, ART.swords, { opacity: 0.06 }));
  e.push.apply(e, banner(22, '{{title}}'));

  e.push(label(30, 80, 58, 'LOCATION', { fontSize: 8 }));
  e.push(rule(92, 90, 184));
  e.push(label(292, 80, 66, 'DIFFICULTY', { fontSize: 8 }));
  for (let k = 0; k < 5; k++) e.push(oval(362 + k * 20, 79, 13, 13));

  e.push(svgE(30, 106, 16, 16, ART.skull));
  e.push(label(54, 108, 200, 'MONSTERS & FOES'));
  e.push.apply(e, th(30, 128, 146, 17, 'CREATURE'));
  e.push.apply(e, th(180, 128, 38, 17, 'AC'));
  e.push.apply(e, th(222, 128, 46, 17, 'HP'));
  e.push.apply(e, th(272, 128, 44, 17, 'INIT'));
  e.push.apply(e, th(320, 128, 159, 17, 'NOTES'));
  for (let r = 1; r <= 6; r++) e.push(rule(30, 145 + r * 25, 449));
  e.push(vline(178, 145, 150));
  e.push(vline(220, 145, 150));
  e.push(vline(270, 145, 150));
  e.push(vline(318, 145, 150));

  e.push(svgE(30, 310, 16, 16, ART.compass));
  e.push(label(54, 312, 240, 'TERRAIN, TRAPS & TACTICS'));
  [336, 354, 372].forEach(function (y) { e.push(rule(30, y, 449)); });

  e.push(svgE(30, 386, 14, 16, ART.potion));
  e.push(label(54, 388, 150, 'TREASURE'));
  [412, 430].forEach(function (y) { e.push(rule(30, y, 449)); });

  e.push(box(124, 452, 261, 44, { fill: P.crimson, stroke: P.blood, strokeWidth: 1.6, borderRadius: 10 }));
  e.push(svgE(142, 462, 24, 24, ART.skull));
  e.push(txt(174, 456, 204, 36, 'OPEN COMBAT TRACKER', {
    fontSize: 12.5, fontFamily: UTIL, fontWeight: 'bold', textColor: P.light,
    align: 'center', verticalAlign: 'middle'
  }));
  e.push(link(124, 452, 261, 44, 'child_index', 0));
  return { id: 'tpl_encounter', name: 'Encounter', width: W0, height: H0, elements: e };
}

/* ---- 9. Combat Tracker ---------------------------------------------- */
function tplCombat() {
  console.log("tplCombat");
  const e = [];
  e.push.apply(e, chrome());
  e.push(svgE(38, 24, 30, 30, ART.skull));
  e.push(txt(80, 22, 349, 32, '{{title}}', {
    fontSize: 22, fontFamily: DISPLAY, fontWeight: 'bold', align: 'center', verticalAlign: 'middle'
  }));
  e.push(svgE(441, 24, 30, 30, ART.skull));
  e.push(txt(80, 56, 349, 13, '{{enc}}', {
    align: 'center', fontSize: 10, fontStyle: 'italic', textColor: P.crimson
  }));

  e.push(label(30, 80, 52, 'ROUND'));
  for (let k = 0; k < 10; k++) {
    e.push(oval(88 + k * 30, 76, 20, 20, { strokeWidth: 1.4 }));
    e.push(txt(88 + k * 30, 76, 20, 20, String(k + 1), {
      align: 'center', verticalAlign: 'middle', fontSize: 8.5, fontFamily: UTIL, textColor: P.faint
    }));
  }

  e.push.apply(e, th(30, 108, 42, 18, 'INIT'));
  e.push.apply(e, th(76, 108, 150, 18, 'COMBATANT'));
  e.push.apply(e, th(230, 108, 36, 18, 'AC'));
  e.push.apply(e, th(270, 108, 128, 18, 'HP TALLY'));
  e.push.apply(e, th(402, 108, 77, 18, 'CONDITIONS'));
  for (let r = 0; r < 10; r++) {
    const ry = 126 + r * 31;
    if (r % 2 === 0) e.push(box(30, ry, 449, 31, { fill: P.panel, opacity: 0.4 }));
    e.push(box(272, ry + 4, 124, 23, {
      fill: P.faint, fillType: 'pattern', patternType: 'lines-v',
      patternSpacing: 9, patternWeight: 1, opacity: 0.5
    }));
    e.push(rule(30, ry + 31, 449, { opacity: 0.32 }));
  }
  e.push(vline(74, 126, 310));
  e.push(vline(228, 126, 310));
  e.push(vline(268, 126, 310));
  e.push(vline(400, 126, 310));

  e.push(label(30, 452, 140, 'LEGENDARY ACTIONS'));
  for (let k = 0; k < 3; k++) e.push(check(172 + k * 18, 452));
  e.push(label(258, 452, 90, 'LAIR ACTION'));
  e.push(check(348, 452));
  e.push(txt(366, 453, 90, 12, 'on initiative 20', { fontSize: 8, fontStyle: 'italic', textColor: P.faint }));

  e.push(label(30, 478, 220, 'CONCENTRATION & EFFECTS'));
  [502, 520].forEach(function (y) { e.push(rule(30, y, 449)); });

  e.push(svgE(30, 536, 14, 15, ART.skull));
  e.push(label(52, 538, 100, 'THE FALLEN'));
  [562, 580].forEach(function (y) { e.push(rule(30, y, 449)); });
  return { id: 'tpl_combat', name: 'Combat Tracker', width: W0, height: H0, elements: e };
}

/* ================================================================
   ASSEMBLY: build once at RM size, scale a second variant for iPad
   ================================================================ */
const base = {};
[tplHome(), tplParty(), tplPC(), tplLevelup(), tplChronicle(),
 tplArc(), tplSession(), tplEncounter(), tplCombat()]
  .forEach(function (t) { base[t.id] = t; });

return {
  variants: {
    remarkable: { id: 'remarkable', name: 'reMarkable Paper Pro', templates: base },
    ipad_a4:    { id: 'ipad_a4',    name: 'iPad A4',              templates: scaleTemplates(base, 595, 842) }
  },
  activeVariantId: 'remarkable'
};
