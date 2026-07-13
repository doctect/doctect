// Sketchbook / Art Portfolio — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const GUIDE = "#d8d8d8";   // faint drawing-surface guide color
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";

// framed-landscape cover art (pure-shape SVG)
const ART_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="10" y="12" width="80" height="60" rx="2" fill="none" stroke="#111111" stroke-width="2.2"/>' +
  '<rect x="16" y="18" width="68" height="48" fill="none" stroke="#c8c8c8" stroke-width="0.8"/>' +
  '<circle cx="70" cy="32" r="6.5" fill="none" stroke="#111111" stroke-width="1.2"/>' +
  '<polygon points="18,60 36,34 54,60" fill="none" stroke="#111111" stroke-width="1.3"/>' +
  '<polygon points="42,60 60,40 80,60" fill="none" stroke="#111111" stroke-width="1.3"/>' +
  '<line x1="16" y1="60" x2="84" y2="60" stroke="#111111" stroke-width="1.2"/>' +
  '<line x1="30" y1="72" x2="24" y2="92" stroke="#111111" stroke-width="1.6"/>' +
  '<line x1="70" y1="72" x2="76" y2="92" stroke="#111111" stroke-width="1.6"/>' +
  '<line x1="50" y1="72" x2="50" y2="94" stroke="#111111" stroke-width="1.6"/>' +
  '</svg>';

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const ruled = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: RULE, fillType: "pattern", patternType: "lines-h", patternSpacing: s, stroke: "none", strokeWidth: 0 });
const fieldLine = (x, y, w) => ({ type: "line", x: x, y: y, w: w, h: 0, stroke: RULE, strokeWidth: 1 });
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);
const navFoot = (backLabel) => ([
  { type: "triangle", x: 64, y: 650, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
  { type: "text", x: 210, y: 648, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
  { type: "triangle", x: 419, y: 650, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
]);

// shared drawing-page chrome (slim header + surface + footer); pass the surface element(s)
const drawingPage = (surface) => ([
  { type: "text", x: 14, y: 8, w: 250, h: 24, text: "{{title}}", fontSize: 18, fontWeight: "bold", textColor: INK },
  ...idxCover(8),
  headerRule(36),
  ...surface,
  ...navFoot("Back")
]);

const templates = {
  // ---------- COVER (art) ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "svg", x: 194, y: 118, w: 121, h: 121, svgContent: ART_SVG },
      { type: "text", x: 50, y: 274, w: 409, h: 24, text: "make marks", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 306, w: 429, h: 64, text: "{{title}}", fontSize: 46, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 384, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 486, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 486, w: 151, h: 46, text: "Open sketchbook", fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- SECTION (generic index: surfaces / pages / gallery) ----------
  section: {
    id: "section", name: "Section", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      ...idxCover(12),
      headerRule(46),
      caption(16, 52, 300, "tap to open"),
      { type: "grid", x: 24, y: 74, w: 150, h: 44,
        gridConfig: { cols: 3, gapX: 9, gapY: 9, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 6, fontSize: 13, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#333333" },
      ...navFoot("Back")
    ]
  },

  // ---------- DRAWING SURFACES ----------
  page_dot: {
    id: "page_dot", name: "Dot", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: drawingPage([
      { type: "rect", x: 14, y: 44, w: 481, h: 594, fill: GUIDE, fillType: "pattern", patternType: "dots", patternSpacing: 20, patternWeight: 1, stroke: "none", strokeWidth: 0 }
    ])
  },
  page_grid: {
    id: "page_grid", name: "Grid", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: drawingPage([
      { type: "rect", x: 14, y: 44, w: 481, h: 594, fill: GUIDE, fillType: "pattern", patternType: "lines-h", patternSpacing: 24, stroke: "none", strokeWidth: 0 },
      { type: "rect", x: 14, y: 44, w: 481, h: 594, fill: GUIDE, fillType: "pattern", patternType: "lines-v", patternSpacing: 24, stroke: "none", strokeWidth: 0 }
    ])
  },
  page_lined: {
    id: "page_lined", name: "Lined", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: drawingPage([
      { type: "rect", x: 14, y: 44, w: 481, h: 594, fill: GUIDE, fillType: "pattern", patternType: "lines-h", patternSpacing: 30, stroke: "none", strokeWidth: 0 }
    ])
  },
  page_blank: {
    id: "page_blank", name: "Plain", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: drawingPage([
      { type: "rect", x: 14, y: 44, w: 481, h: 594, fill: "none", stroke: "#eeeeee", strokeWidth: 1 }
    ])
  },

  // ---------- GALLERY (catalogue entry for a finished piece) ----------
  gallery: {
    id: "gallery", name: "Piece", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 50, "Title"), fieldLine(66, 70, 200),
      caption(282, 52, 50, "Date"), fieldLine(322, 70, 167),
      caption(20, 86, 120, "Medium"), fieldLine(90, 104, 399),
      { type: "rect", x: 14, y: 120, w: 481, h: 430, fill: "none", stroke: "#cfcfcf", strokeWidth: 1.5, borderRadius: 6 },
      { type: "text", x: 14, y: 300, w: 481, h: 24, text: "sketch / mount your piece here", fontSize: 13, fontFamily: "caveat", align: "center", textColor: "#c4c4c4" },
      caption(20, 560, 120, "Notes"), ruled(14, 580, RM_PP_WIDTH - 28, 62, 24),
      ...navFoot("Gallery")
    ]
  }
};

return templates;
