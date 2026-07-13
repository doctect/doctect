// Budget / Finance Tracker - TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const HEADER_FILL = "#2e3436";
const ALT_FILL = "#f1f4f5";
const TOTAL_FILL = "#e5e7eb";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const ruled = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: s, stroke: "none", strokeWidth: 0 });
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);
const nav = (y, backLabel) => ([
  { type: "triangle", x: 64, y: y, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
  { type: "text", x: 210, y: y - 2, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
  { type: "triangle", x: 419, y: y, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
]);

// Styled static table: shaded header row, alternating row shading, column rules, optional row labels.
const makeTable = (x, y, colW, rowH, nRows, headers, opts = {}) => {
  const els = [];
  const totalW = colW.reduce((a, b) => a + b, 0);
  const headerH = opts.headerH || rowH;
  const bodyY = y + headerH;
  // header background
  els.push({ type: "rect", x: x, y: y, w: totalW, h: headerH, fill: opts.headerFill || HEADER_FILL, stroke: "none", strokeWidth: 0 });
  // alternating body-row shading (odd data rows)
  for (let r = 0; r < nRows; r++) {
    if (r % 2 === 1) els.push({ type: "rect", x: x, y: bodyY + r * rowH, w: totalW, h: rowH, fill: opts.altFill || ALT_FILL, stroke: "none", strokeWidth: 0 });
  }
  // horizontal row separators
  for (let r = 0; r <= nRows; r++) els.push({ type: "line", x: x, y: bodyY + r * rowH, w: totalW, h: 0, stroke: RULE, strokeWidth: 1 });
  // vertical column separators
  let cx = x;
  for (let i = 0; i <= colW.length; i++) {
    els.push({ type: "line", x: cx, y: y, w: 0, h: headerH + nRows * rowH, flip: true, stroke: RULE, strokeWidth: 1 });
    if (i < colW.length) cx += colW[i];
  }
  // outer border
  els.push({ type: "rect", x: x, y: y, w: totalW, h: headerH + nRows * rowH, fill: "none", stroke: "#9aa0a6", strokeWidth: 1 });
  // header labels
  cx = x;
  headers.forEach((label, i) => {
    els.push({ type: "text", x: cx + (i === 0 ? 8 : 0), y: y, w: colW[i] - (i === 0 ? 8 : 0), h: headerH, text: label, fontSize: opts.headerFont || 11, fontWeight: "bold", align: i === 0 ? "left" : "center", verticalAlign: "middle", textColor: "#ffffff" });
    cx += colW[i];
  });
  // optional first-column row labels
  if (opts.rowLabels) {
    for (let r = 0; r < nRows; r++) {
      if (!opts.rowLabels[r]) continue;
      els.push({ type: "text", x: x + 8, y: bodyY + r * rowH, w: colW[0] - 8, h: rowH, text: opts.rowLabels[r], fontSize: opts.rowFont || 12, align: "left", verticalAlign: "middle", textColor: "#333333" });
    }
  }
  return els;
};

// Total strip below a table (shaded, bold label, matching column rules)
const totalStrip = (x, y, colW, label) => {
  const els = [];
  const totalW = colW.reduce((a, b) => a + b, 0);
  els.push({ type: "rect", x: x, y: y, w: totalW, h: 28, fill: TOTAL_FILL, stroke: "#9aa0a6", strokeWidth: 1 });
  let cx = x;
  for (let i = 1; i < colW.length; i++) { cx += colW[i - 1]; els.push({ type: "line", x: cx, y: y, w: 0, h: 28, flip: true, stroke: RULE, strokeWidth: 1 }); }
  els.push({ type: "text", x: x + 8, y: y, w: colW[0] - 8, h: 28, text: label, fontSize: 12, fontWeight: "bold", align: "left", verticalAlign: "middle", textColor: INK });
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
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "know where it goes", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 50, y: 250, w: 409, h: 72, text: "{{title}}", fontSize: 50, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open budget  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- YEAR HUB (contents) ----------
  year_index: {
    id: "year_index", name: "Year", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      caption(16, 58, 300, "tap a month"),
      { type: "grid", x: 28, y: 88, w: 144, h: 48,
        gridConfig: { cols: 3, gapX: 14, gapY: 12, sourceType: "current", displayField: "title", dataSliceStart: 0, dataSliceCount: 12, alternateRows: true, alternateRowFill: "#eef2f5" },
        fill: "#f7f7f7", stroke: "#c0c0c0", strokeWidth: 1, borderRadius: 8, fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK },
      // Summary + Goals buttons (child indices after the 12 months)
      { type: "rect", x: 40, y: 356, w: 210, h: 54, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "child_index", linkValue: "12" },
      { type: "text", x: 40, y: 356, w: 210, h: 54, text: "Annual Summary", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "child_index", linkValue: "12" },
      { type: "rect", x: 259, y: 356, w: 210, h: 54, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "child_index", linkValue: "13" },
      { type: "text", x: 259, y: 356, w: 210, h: 54, text: "Savings Goals", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "child_index", linkValue: "13" }
    ]
  },

  // ---------- MONTH (budget table) ----------
  month: {
    id: "month", name: "Month", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 210, h: 30, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      { type: "text", x: 232, y: 15, w: 80, h: 22, text: "{{year}}", fontSize: 15, textColor: "#777777" },
      ...idxCover(10),
      headerRule(44),
      caption(16, 50, 200, "Monthly budget"),
      ...makeTable(14, 66, [190, 97, 97, 97], 26, 10, ["Category", "Budget", "Spent", "Left"]),
      ...totalStrip(14, 352, [190, 97, 97, 97], "Total"),
      { type: "text", x: 324, y: 392, w: 165, h: 28, text: "Transactions  »", fontSize: 12, fontWeight: "bold", align: "center", verticalAlign: "middle", fill: "#eef2ff", stroke: "#c7d2fe", strokeWidth: 1, borderStyle: "solid", borderRadius: 6, linkTarget: "child_index", linkValue: "0" },
      caption(16, 430, 200, "Notes"),
      ruled(14, 450, RM_PP_WIDTH - 28, 190, 26),
      ...nav(651, "Year")
    ]
  },

  // ---------- TRANSACTIONS (log) ----------
  txlog: {
    id: "txlog", name: "Transactions", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      ...idxCover(10),
      headerRule(44),
      ...makeTable(14, 60, [70, 246, 80, 85], 24, 23, ["Date", "Description", "Amount", "Balance"]),
      ...nav(651, "Month")
    ]
  },

  // ---------- ANNUAL SUMMARY ----------
  summary: {
    id: "summary", name: "Summary", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 300, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      { type: "text", x: 300, y: 15, w: 60, h: 22, text: "{{year}}", fontSize: 15, textColor: "#777777" },
      ...idxCover(12),
      headerRule(46),
      caption(16, 52, 200, "By month"),
      ...makeTable(14, 72, [121, 120, 120, 120], 28, 12, ["Month", "Budget", "Spent", "Left"], { rowLabels: MONTHS }),
      ...totalStrip(14, 464, [121, 120, 120, 120], "Year total"),
      ...nav(651, "Year")
    ]
  },

  // ---------- SAVINGS GOALS ----------
  goals: {
    id: "goals", name: "Goals", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      ...idxCover(12),
      headerRule(46),
      caption(16, 52, 200, "What you're saving for"),
      ...makeTable(14, 72, [200, 90, 90, 101], 30, 10, ["Goal", "Target", "Saved", "Left"]),
      caption(16, 400, 200, "Notes"),
      ruled(14, 420, RM_PP_WIDTH - 28, 220, 26),
      ...nav(651, "Year")
    ]
  }
};

return templates;
