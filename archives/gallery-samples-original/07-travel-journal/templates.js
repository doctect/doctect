// Travel Journal / Trip Planner — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)
// First sample to use SVG artwork (line-art compass + mountains, monochrome, path-only).

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const DOTS = "#b8b8b8";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";
const HEADER_FILL = "#2e3436";
const ALT_FILL = "#f1f4f5";
const TOTAL_FILL = "#e5e7eb";

// --- SVG artwork (pure shapes; safe for the editor's DOMPurify + svg2pdf export) ---
const COMPASS_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="50" cy="50" r="46" fill="none" stroke="#111111" stroke-width="1.6"/>' +
  '<circle cx="50" cy="50" r="37" fill="none" stroke="#c0c0c0" stroke-width="0.8"/>' +
  '<polygon points="50,7 55.5,50 50,50 44.5,50" fill="#111111"/>' +
  '<polygon points="50,93 55.5,50 50,50 44.5,50" fill="#888888"/>' +
  '<polygon points="7,50 50,55.5 50,50 50,44.5" fill="#555555"/>' +
  '<polygon points="93,50 50,55.5 50,50 50,44.5" fill="#555555"/>' +
  '<circle cx="50" cy="50" r="3.4" fill="#ffffff" stroke="#111111" stroke-width="1"/>' +
  '</svg>';
const MOUNTAINS_SVG = '<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="98" cy="15" r="8.5" fill="none" stroke="#111111" stroke-width="1.2"/>' +
  '<polygon points="2,57 30,22 55,57" fill="none" stroke="#111111" stroke-width="1.3"/>' +
  '<polygon points="36,57 66,10 98,57" fill="none" stroke="#111111" stroke-width="1.3"/>' +
  '<polyline points="24,29 30,35 37,27" fill="none" stroke="#111111" stroke-width="1"/>' +
  '<polyline points="60,17 66,24 72,16" fill="none" stroke="#111111" stroke-width="1"/>' +
  '<line x1="0" y1="57" x2="120" y2="57" stroke="#111111" stroke-width="1.3"/>' +
  '</svg>';

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const ruled = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: s, stroke: "none", strokeWidth: 0 });
const dotArea = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: DOTS, fillType: "pattern", patternType: "dots", patternSpacing: s, patternWeight: 1, stroke: "none", strokeWidth: 0 });
const fieldLine = (x, y, w) => ({ type: "line", x: x, y: y, w: w, h: 0, stroke: RULE, strokeWidth: 1 });
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);
const nav = (y, backLabel) => ([
  { type: "triangle", x: 64, y: y, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
  { type: "text", x: 210, y: y - 2, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
  { type: "triangle", x: 419, y: y, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
]);
const navButton = (x, y, w, label, idx) => ([
  { type: "rect", x: x, y: y, w: w, h: 70, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "child_index", linkValue: idx },
  { type: "text", x: x, y: y, w: w, h: 70, text: label, fontSize: 18, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "child_index", linkValue: idx }
]);
const checklist = (x, y, w, title, n) => {
  const els = [{ type: "text", x: x, y: y, w: w, h: 16, text: title, fontSize: 12, fontWeight: "bold", align: "left", textColor: INK }];
  for (let i = 0; i < n; i++) {
    const ry = y + 24 + i * 22;
    els.push({ type: "rect", x: x, y: ry, w: 12, h: 12, fill: "none", stroke: INK, strokeWidth: 1 });
    els.push({ type: "line", x: x + 20, y: ry + 13, w: w - 20, h: 0, stroke: RULE, strokeWidth: 1 });
  }
  return els;
};
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
  // ---------- COVER (compass art) ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "svg", x: 199, y: 120, w: 111, h: 111, svgContent: COMPASS_SVG },
      { type: "text", x: 50, y: 274, w: 409, h: 24, text: "wander often", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 306, w: 429, h: 64, text: "{{title}}", fontSize: 44, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 384, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 486, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 486, w: 151, h: 46, text: "Open journal  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- SECTION (generic index: trips / itinerary / journal) ----------
  section: {
    id: "section", name: "Section", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      ...idxCover(12),
      headerRule(46),
      caption(16, 52, 300, "tap to open"),
      { type: "grid", x: 24, y: 74, w: 228, h: 40,
        gridConfig: { cols: 2, gapX: 9, gapY: 8, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 4, fontSize: 13, align: "left", verticalAlign: "middle", textColor: "#333333" },
      ...nav(651, "Back")
    ]
  },

  // ---------- TRIP (hub) ----------
  trip: {
    id: "trip", name: "Trip", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      { type: "svg", x: 185, y: 54, w: 140, h: 70, svgContent: MOUNTAINS_SVG },
      caption(20, 138, 90, "Destination"), fieldLine(120, 156, 369),
      caption(20, 170, 90, "Dates"), fieldLine(120, 188, 369),
      ...navButton(30, 214, 210, "Itinerary", "0"),
      ...navButton(259, 214, 210, "Packing", "1"),
      ...navButton(30, 296, 210, "Budget", "2"),
      ...navButton(259, 296, 210, "Journal", "3"),
      caption(20, 384, 120, "Highlights"),
      ruled(14, 404, RM_PP_WIDTH - 28, 240, 26),
      ...nav(651, "Trips")
    ]
  },

  // ---------- DAY (itinerary entry) ----------
  day: {
    id: "day", name: "Day", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 50, "Date"), fieldLine(66, 70, 180),
      caption(262, 52, 50, "Place"), fieldLine(312, 70, 177),
      caption(20, 86, 120, "Morning"), ruled(14, 106, RM_PP_WIDTH - 28, 96, 24),
      caption(20, 210, 120, "Afternoon"), ruled(14, 230, RM_PP_WIDTH - 28, 96, 24),
      caption(20, 334, 120, "Evening"), ruled(14, 354, RM_PP_WIDTH - 28, 96, 24),
      caption(20, 458, 120, "Notes"), ruled(14, 478, RM_PP_WIDTH - 28, 166, 26),
      ...nav(651, "Days")
    ]
  },

  // ---------- PACKING LIST ----------
  packing: {
    id: "packing", name: "Packing", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...checklist(20, 58, 225, "Clothes", 6),
      ...checklist(264, 58, 225, "Toiletries", 6),
      ...checklist(20, 250, 225, "Tech", 6),
      ...checklist(264, 250, 225, "Documents", 6),
      ...checklist(20, 442, 225, "Essentials", 6),
      ...checklist(264, 442, 225, "Misc", 6),
      ...nav(651, "Trip")
    ]
  },

  // ---------- BUDGET (trip expenses) ----------
  budget: {
    id: "budget", name: "Budget", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(16, 50, 200, "Trip expenses"),
      ...makeTable(14, 68, [64, 180, 110, 127], 24, 21, ["Date", "Item", "Category", "Amount"]),
      { type: "rect", x: 14, y: 596, w: 481, h: 28, fill: TOTAL_FILL, stroke: "#9aa0a6", strokeWidth: 1 },
      { type: "text", x: 22, y: 596, w: 200, h: 28, text: "Total", fontSize: 12, fontWeight: "bold", align: "left", verticalAlign: "middle", textColor: INK },
      { type: "line", x: 368, y: 596, w: 0, h: 28, flip: true, stroke: RULE, strokeWidth: 1 },
      ...nav(651, "Trip")
    ]
  },

  // ---------- JOURNAL ENTRY ----------
  journal_page: {
    id: "journal_page", name: "Entry", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 90, "Date / place"), fieldLine(120, 70, 369),
      dotArea(14, 90, RM_PP_WIDTH - 28, 554, 16),
      ...nav(651, "Journal")
    ]
  }
};

return templates;
