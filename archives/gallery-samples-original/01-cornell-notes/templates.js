// Cornell Notes Notebook - TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";        // thin dividers
const RULED = "#d3d3d3";       // ruled writing-line color (pattern)
const CHIP = "#ececec";        // tap-chip fill
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";       // caveat captions
const CELL = "#fcfcfc";        // note-row fill (space to write a detail)

// full-width header divider
const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
// small header tap-chip
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4,
  linkTarget: target, linkValue: value
});

// The subject index shows notes as writable rows: the note title sits at the left of each
// cell and the rest of the row is blank space to jot what the note is about.
const NOTE_GRID = {
  cols: 2, gapX: 9, gapY: 3, sourceType: "current", displayField: "title"
};
const NOTE_GRID_STYLE = {
  fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 3,
  fontSize: 11, align: "left", verticalAlign: "middle", textColor: "#333333"
};

const templates = {
  // ---------- COVER (root) ----------
  cover: {
    id: "cover",
    name: "Cover",
    width: RM_PP_WIDTH,
    height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "study smarter", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 50, y: 250, w: 409, h: 72, text: "{{title}}", fontSize: 52, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open notebook  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- CONTENTS (subject index) ----------
  subject_index: {
    id: "subject_index",
    name: "Contents",
    width: RM_PP_WIDTH,
    height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "Contents", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      { type: "text", x: 16, y: 58, w: 320, h: 22, text: "tap a subject - rename each one to your course", fontSize: 14, fontFamily: "caveat", textColor: LABEL },
      { type: "grid", x: 40, y: 92, w: 200, h: 58,
        gridConfig: { cols: 2, gapX: 24, gapY: 16, sourceType: "current", displayField: "title" },
        fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, fontSize: 18, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK }
    ]
  },

  // ---------- SUBJECT - page 1 of the note index (notes 1..50) ----------
  subject: {
    id: "subject",
    name: "Subject (1–50)",
    width: RM_PP_WIDTH,
    height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      chip(372, 12, 56, "Index", "specific_node", "contents"),
      chip(434, 12, 61, "Cover", "specific_node", "root"),
      headerRule(46),
      { type: "text", x: 16, y: 52, w: 400, h: 18, text: "tap a note to open · jot its topic in the row", fontSize: 12, fontFamily: "caveat", textColor: LABEL },
      // notes 1..50 (grid excludes the page-2 node, which is child index 50)
      { type: "grid", x: 20, y: 72, w: 230, h: 20,
        gridConfig: Object.assign({}, NOTE_GRID, { dataSliceStart: 0, dataSliceCount: 50 }),
        ...NOTE_GRID_STYLE },
      // footer: prev/next flip between subjects; center jumps to notes 51–100
      { type: "triangle", x: 40, y: 655, w: 24, h: 12, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      { type: "text", x: 160, y: 653, w: 190, h: 20, text: "Notes 51–100  »", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "child_index", linkValue: "50" },
      { type: "triangle", x: 445, y: 655, w: 24, h: 12, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  },

  // ---------- SUBJECT_MORE - page 2 of the note index (notes 51..100) ----------
  subject_more: {
    id: "subject_more",
    name: "Subject (51–100)",
    width: RM_PP_WIDTH,
    height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      chip(372, 12, 56, "Index", "specific_node", "contents"),
      chip(434, 12, 61, "Cover", "specific_node", "root"),
      headerRule(46),
      { type: "text", x: 16, y: 52, w: 400, h: 18, text: "tap a note to open · jot its topic in the row", fontSize: 12, fontFamily: "caveat", textColor: LABEL },
      // this page's children are notes 51..100 (no slice needed)
      { type: "grid", x: 20, y: 72, w: 230, h: 20,
        gridConfig: NOTE_GRID,
        ...NOTE_GRID_STYLE },
      // footer: back to page 1 of this subject
      { type: "text", x: 160, y: 653, w: 190, h: 20, text: "«  Notes 1–50", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" }
    ]
  },

  // ---------- NOTE (Cornell page) ----------
  note: {
    id: "note",
    name: "Cornell Page",
    width: RM_PP_WIDTH,
    height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      chip(372, 10, 56, "Index", "specific_node", "contents"),
      chip(434, 10, 61, "Cover", "specific_node", "root"),
      headerRule(44),
      { type: "text", x: 20, y: 50, w: 120, h: 20, text: "Cue", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "text", x: 158, y: 50, w: 120, h: 20, text: "Notes", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "rect", x: 154, y: 70, w: 340, h: 498, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: 26, stroke: "none", strokeWidth: 0 },
      { type: "line", x: 150, y: 47, w: 0, h: 523, flip: true, stroke: RULE, strokeWidth: 1 },
      { type: "line", x: 14, y: 576, w: 481, h: 0, stroke: RULE, strokeWidth: 1 },
      { type: "text", x: 20, y: 580, w: 160, h: 20, text: "Summary", fontSize: 13, fontFamily: "caveat", textColor: LABEL },
      { type: "rect", x: 16, y: 600, w: 477, h: 46, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: 23, stroke: "none", strokeWidth: 0 },
      { type: "triangle", x: 64, y: 651, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      { type: "text", x: 199, y: 649, w: 111, h: 20, text: "Back", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
      { type: "triangle", x: 419, y: 651, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  }
};

return templates;
