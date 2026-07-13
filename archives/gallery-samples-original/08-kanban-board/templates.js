// Project Kanban Board — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)
// Columns are WRITABLE: write a task on a line, then cross it out and rewrite it in the next
// column to "move" it. (A fixed card pinned to one column could never move — paper has no drag.)

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const HEADER_FILL = "#2e3436";
const COL_BG = "#f6f7f8";
const COL_BORDER = "#e2e5e7";

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);
const nav = (y, backLabel) => ([
  { type: "triangle", x: 64, y: y, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
  { type: "text", x: 210, y: y - 2, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
  { type: "triangle", x: 419, y: y, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
]);

// a writable kanban column: background + shaded header + checkbox/line rows
const kColumn = (x, label, rows) => {
  const w = 155, top = 98, pitch = 46;
  const els = [
    { type: "rect", x: x, y: 56, w: w, h: 588, fill: COL_BG, stroke: COL_BORDER, strokeWidth: 1, borderRadius: 8 },
    { type: "rect", x: x, y: 58, w: w, h: 28, fill: HEADER_FILL, stroke: "none", strokeWidth: 0, borderRadius: 6 },
    { type: "text", x: x, y: 58, w: w, h: 28, text: label, fontSize: 12, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff" }
  ];
  for (let i = 0; i < rows; i++) {
    const ry = top + i * pitch;
    els.push({ type: "rect", x: x + 10, y: ry, w: 12, h: 12, fill: "none", stroke: "#9aa0a6", strokeWidth: 1, borderRadius: 2 });
    els.push({ type: "line", x: x + 28, y: ry + 13, w: w - 40, h: 0, stroke: RULE, strokeWidth: 1 });
  }
  return els;
};

// a writable list column (for the backlog): title + checkbox/line rows
const listColumn = (x, y, w, rows) => {
  const els = [];
  for (let i = 0; i < rows; i++) {
    const ry = y + i * 24;
    els.push({ type: "rect", x: x, y: ry, w: 12, h: 12, fill: "none", stroke: "#9aa0a6", strokeWidth: 1, borderRadius: 2 });
    els.push({ type: "line", x: x + 20, y: ry + 13, w: w - 20, h: 0, stroke: RULE, strokeWidth: 1 });
  }
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
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "get it done", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 250, w: 429, h: 72, text: "{{title}}", fontSize: 48, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open boards  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- BOARDS INDEX (contents) ----------
  section: {
    id: "section", name: "Boards", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(46),
      caption(16, 52, 300, "tap a board"),
      { type: "grid", x: 40, y: 74, w: 200, h: 56,
        gridConfig: { cols: 2, gapX: 24, gapY: 14, sourceType: "current", displayField: "title" },
        fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK }
    ]
  },

  // ---------- BOARD (3 writable columns) ----------
  board: {
    id: "board", name: "Board", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 240, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      chip(262, 12, 78, "Backlog  »", "child_index", "0"),
      chip(372, 12, 56, "Index", "specific_node", "contents"),
      chip(434, 12, 61, "Cover", "specific_node", "root"),
      headerRule(44),
      ...kColumn(14, "To-Do", 11),
      ...kColumn(177, "Doing", 11),
      ...kColumn(340, "Done", 11),
      ...nav(654, "Boards")
    ]
  },

  // ---------- BACKLOG (writable parking list) ----------
  backlog: {
    id: "backlog", name: "Backlog", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(16, 52, 400, "park tasks here, then pull them onto the board"),
      ...listColumn(24, 78, 225, 23),
      ...listColumn(268, 78, 225, 23),
      ...nav(651, "Board")
    ]
  }
};

return templates;
