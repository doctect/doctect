// Habit Tracker + Reflection - TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";        // thin dividers / grid lines
const RULED = "#d3d3d3";       // ruled writing lines
const DOTS = "#b8b8b8";        // dot-grid
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";       // caveat captions

const DAYS = 31;                                  // matrix columns
const MX = 120, MW = RM_PP_WIDTH - MX - 12;       // matrix body: x 120 .. 497
const COLW = MW / DAYS;                           // day column width (~12.16)
const HABITS = 12;                                 // habit rows
const MY = 86, MH = 468;                          // matrix body: y 86 .. 554
const ROWH = MH / HABITS;                          // habit row height (39)

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4,
  linkTarget: target, linkValue: value
});

const templates = {
  // ---------- COVER (root) ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "build better habits", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 50, y: 250, w: 409, h: 72, text: "{{title}}", fontSize: 52, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open tracker  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- YEAR INDEX (contents) ----------
  year_index: {
    id: "year_index", name: "Year", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      { type: "text", x: 16, y: 58, w: 300, h: 22, text: "tap a month", fontSize: 14, fontFamily: "caveat", textColor: LABEL },
      { type: "grid", x: 28, y: 92, w: 144, h: 60,
        gridConfig: { cols: 3, gapX: 14, gapY: 16, sourceType: "current", displayField: "title" },
        fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, fontSize: 18, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK }
    ]
  },

  // ---------- MONTH (habit matrix + day navigation) ----------
  month: {
    id: "month", name: "Month", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 210, h: 30, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      { type: "text", x: 232, y: 15, w: 80, h: 22, text: "{{year}}", fontSize: 15, textColor: "#777777" },
      chip(372, 10, 56, "Index", "specific_node", "contents"),
      chip(434, 10, 61, "Cover", "specific_node", "root"),
      headerRule(44),
      { type: "text", x: 16, y: 49, w: 420, h: 16, text: "tap a day number to open its reflection", fontSize: 11, fontFamily: "caveat", textColor: LABEL },
      { type: "text", x: 16, y: 68, w: 96, h: 16, text: "Habits", fontSize: 12, fontFamily: "caveat", textColor: LABEL },
      // day-number header row (node-driven: month's day children); each cell taps to that day
      { type: "grid", x: MX, y: 66, w: COLW, h: 18,
        gridConfig: { cols: DAYS, gapX: 0, gapY: 0, sourceType: "current", displayField: "day_num" },
        fill: "#ffffff", stroke: RULE, strokeWidth: 1, gridBorderColor: RULE, gridBorderWidth: 1,
        fontSize: 7, align: "center", verticalAlign: "middle", textColor: "#333333" },
      // matrix grid: horizontal row lines (habits) across the full width, vertical day columns
      { type: "rect", x: 14, y: MY, w: RM_PP_WIDTH - 26, h: MH, fill: RULE, fillType: "pattern", patternType: "lines-h", patternSpacing: ROWH, stroke: "none", strokeWidth: 0 },
      { type: "rect", x: MX, y: MY, w: MW, h: MH, fill: RULE, fillType: "pattern", patternType: "lines-v", patternSpacing: COLW, stroke: "none", strokeWidth: 0 },
      { type: "rect", x: 14, y: MY, w: RM_PP_WIDTH - 26, h: MH, fill: "none", stroke: "#cfcfcf", strokeWidth: 1 },
      { type: "line", x: MX, y: MY, w: 0, h: MH, flip: true, stroke: "#9aa0a6", strokeWidth: 1 },
      // notes strip
      { type: "text", x: 16, y: 566, w: 120, h: 16, text: "Notes", fontSize: 12, fontFamily: "caveat", textColor: LABEL },
      { type: "rect", x: 14, y: 584, w: RM_PP_WIDTH - 26, h: 60, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: 20, stroke: "none", strokeWidth: 0 },
      // footer: prev / next month, back to year
      { type: "triangle", x: 64, y: 655, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      { type: "text", x: 210, y: 653, w: 90, h: 20, text: "Year", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
      { type: "triangle", x: 419, y: 655, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  },

  // ---------- DAY (reflection) ----------
  day: {
    id: "day", name: "Reflection", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      chip(372, 10, 56, "Index", "specific_node", "contents"),
      chip(434, 10, 61, "Cover", "specific_node", "root"),
      headerRule(44),
      // mood row
      { type: "text", x: 20, y: 54, w: 60, h: 18, text: "Mood", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "ellipse", x: 92, y: 52, w: 22, h: 22, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "ellipse", x: 130, y: 52, w: 22, h: 22, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "ellipse", x: 168, y: 52, w: 22, h: 22, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "ellipse", x: 206, y: 52, w: 22, h: 22, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "ellipse", x: 244, y: 52, w: 22, h: 22, fill: "none", stroke: INK, strokeWidth: 1 },
      // top 3
      { type: "text", x: 20, y: 86, w: 160, h: 18, text: "Top 3 today", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "text", x: 16, y: 108, w: 14, h: 16, text: "1", fontSize: 12, textColor: "#888888" },
      { type: "line", x: 32, y: 124, w: 457, h: 0, stroke: RULE, strokeWidth: 1 },
      { type: "text", x: 16, y: 134, w: 14, h: 16, text: "2", fontSize: 12, textColor: "#888888" },
      { type: "line", x: 32, y: 150, w: 457, h: 0, stroke: RULE, strokeWidth: 1 },
      { type: "text", x: 16, y: 160, w: 14, h: 16, text: "3", fontSize: 12, textColor: "#888888" },
      { type: "line", x: 32, y: 176, w: 457, h: 0, stroke: RULE, strokeWidth: 1 },
      // gratitude
      { type: "text", x: 20, y: 190, w: 160, h: 18, text: "Grateful for", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "rect", x: 14, y: 210, w: RM_PP_WIDTH - 28, h: 92, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: 26, stroke: "none", strokeWidth: 0 },
      // reflection
      { type: "text", x: 20, y: 312, w: 160, h: 18, text: "Reflection", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "rect", x: 14, y: 332, w: RM_PP_WIDTH - 28, h: 296, fill: DOTS, fillType: "pattern", patternType: "dots", patternSpacing: 16, patternWeight: 1, stroke: "none", strokeWidth: 0 },
      // footer: prev / next day, back to month
      { type: "triangle", x: 64, y: 652, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      { type: "text", x: 210, y: 650, w: 90, h: 20, text: "{{month_short}}", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
      { type: "triangle", x: 419, y: 652, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  }
};

return templates;
