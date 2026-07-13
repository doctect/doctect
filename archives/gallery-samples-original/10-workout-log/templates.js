// Workout / Fitness Log — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";
const HEADER_FILL = "#2e3436";
const ALT_FILL = "#f1f4f5";

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const ruled = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: s, stroke: "none", strokeWidth: 0 });
const fieldLine = (x, y, w) => ({ type: "line", x: x, y: y, w: w, h: 0, stroke: RULE, strokeWidth: 1 });
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);
const nav = (y, backLabel) => ([
  { type: "triangle", x: 64, y: y, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
  { type: "text", x: 210, y: y - 2, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
  { type: "triangle", x: 419, y: y, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
]);
const makeTable = (x, y, colW, rowH, nRows, headers) => {
  const els = []; const W = colW.reduce((a, b) => a + b, 0); const headerH = rowH; const bodyY = y + headerH;
  els.push({ type: "rect", x: x, y: y, w: W, h: headerH, fill: HEADER_FILL, stroke: "none", strokeWidth: 0 });
  for (let r = 0; r < nRows; r++) if (r % 2 === 1) els.push({ type: "rect", x: x, y: bodyY + r * rowH, w: W, h: rowH, fill: ALT_FILL, stroke: "none", strokeWidth: 0 });
  for (let r = 0; r <= nRows; r++) els.push({ type: "line", x: x, y: bodyY + r * rowH, w: W, h: 0, stroke: RULE, strokeWidth: 1 });
  let cx = x;
  for (let i = 0; i <= colW.length; i++) { els.push({ type: "line", x: cx, y: y, w: 0, h: headerH + nRows * rowH, flip: true, stroke: RULE, strokeWidth: 1 }); if (i < colW.length) cx += colW[i]; }
  els.push({ type: "rect", x: x, y: y, w: W, h: headerH + nRows * rowH, fill: "none", stroke: "#9aa0a6", strokeWidth: 1 });
  cx = x;
  headers.forEach((label, i) => { els.push({ type: "text", x: cx + (i === 0 ? 8 : 0), y: y, w: colW[i] - (i === 0 ? 8 : 0), h: headerH, text: label, fontSize: 11, fontWeight: "bold", align: i === 0 ? "left" : "center", verticalAlign: "middle", textColor: "#ffffff" }); cx += colW[i]; });
  return els;
};

const templates = {
  // ---------- COVER ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "one more rep", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 250, w: 429, h: 72, text: "{{title}}", fontSize: 46, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 174, y: 470, w: 161, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 174, y: 470, w: 161, h: 46, text: "Open programs  »", fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- SECTION (generic index: programs / weeks / days) ----------
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
      ...nav(651, "Back")
    ]
  },

  // ---------- WORKOUT (exercise table) ----------
  workout: {
    id: "workout", name: "Workout", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 50, "Date"), fieldLine(66, 70, 170),
      caption(262, 52, 50, "Focus"), fieldLine(312, 70, 177),
      ...makeTable(14, 92, [200, 70, 90, 121], 30, 12, ["Exercise", "Sets", "Reps", "Weight"]),
      caption(16, 492, 120, "Notes"),
      ruled(14, 512, RM_PP_WIDTH - 28, 132, 26),
      ...nav(651, "Week")
    ]
  }
};

return templates;
