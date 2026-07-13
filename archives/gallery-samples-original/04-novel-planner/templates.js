// Novel / Manuscript Planner - TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const DOTS = "#b8b8b8";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const ruled = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: s, stroke: "none", strokeWidth: 0 });
const dotArea = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: DOTS, fillType: "pattern", patternType: "dots", patternSpacing: s, patternWeight: 1, stroke: "none", strokeWidth: 0 });
const fieldLine = (x, y, w) => ({ type: "line", x: x, y: y, w: w, h: 0, stroke: RULE, strokeWidth: 1 });
// Index + Cover chips
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);
// footer: prev/next sibling + a parent "back" chip
const nav = (y, backLabel) => ([
  { type: "triangle", x: 64, y: y, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
  { type: "text", x: 210, y: y - 2, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
  { type: "triangle", x: 419, y: y, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
]);
// a hub button (rect + label) linking to a fixed section node
const hubButton = (y, label, nodeId) => ([
  { type: "rect", x: 40, y: y, w: 429, h: 66, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "specific_node", linkValue: nodeId },
  { type: "text", x: 40, y: y, w: 429, h: 66, text: label, fontSize: 20, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "specific_node", linkValue: nodeId }
]);

const templates = {
  // ---------- COVER ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "a novel", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 250, w: 429, h: 76, text: "{{title}}", fontSize: 46, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 340, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 169, y: 470, w: 171, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 169, y: 470, w: 171, h: 46, text: "Open manuscript  »", fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- BOOK HUB (contents) ----------
  book_hub: {
    id: "book_hub", name: "Book", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      ...hubButton(78, "Manuscript", "manuscript"),
      ...hubButton(156, "Characters", "characters"),
      ...hubButton(234, "Locations", "locations"),
      caption(40, 322, 200, "Logline"),
      ruled(40, 342, 429, 120, 26),
      caption(40, 476, 200, "Themes"),
      ruled(40, 496, 429, 140, 26)
    ]
  },

  // ---------- SECTION (generic index: manuscript/characters/locations/act) ----------
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

  // ---------- CHAPTER (synopsis + scenes + notes) ----------
  chapter: {
    id: "chapter", name: "Chapter", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 50, 120, "Synopsis"),
      ruled(14, 70, RM_PP_WIDTH - 28, 116, 26),
      caption(20, 194, 120, "Scenes"),
      { type: "grid", x: 24, y: 214, w: 228, h: 30,
        gridConfig: { cols: 2, gapX: 9, gapY: 6, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 4, fontSize: 12, align: "left", verticalAlign: "middle", textColor: "#333333" },
      caption(20, 356, 120, "Chapter notes"),
      ruled(14, 376, RM_PP_WIDTH - 28, 260, 26),
      ...nav(651, "Act")
    ]
  },

  // ---------- SCENE (writing page + POV/Setting references) ----------
  scene: {
    id: "scene", name: "Scene", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 300, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      ...idxCover(10),
      headerRule(44),
      // reference chips -> the scene's POV character and setting location
      { type: "text", x: 18, y: 52, w: 160, h: 30, text: "POV  »", fontSize: 13, fontWeight: "bold", align: "center", verticalAlign: "middle", fill: "#eef2ff", stroke: "#c7d2fe", strokeWidth: 1, borderStyle: "solid", borderRadius: 6, linkTarget: "child_index", linkValue: "0" },
      { type: "text", x: 186, y: 52, w: 160, h: 30, text: "Setting  »", fontSize: 13, fontWeight: "bold", align: "center", verticalAlign: "middle", fill: "#eef2ff", stroke: "#c7d2fe", strokeWidth: 1, borderStyle: "solid", borderRadius: 6, linkTarget: "child_index", linkValue: "1" },
      caption(20, 92, 120, "Summary"),
      fieldLine(24, 116, 465),
      caption(20, 130, 120, "Scene"),
      dotArea(14, 150, RM_PP_WIDTH - 28, 480, 16),
      ...nav(651, "Chapter")
    ]
  },

  // ---------- CHARACTER (profile) ----------
  character: {
    id: "character", name: "Character", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 60, "Role"), fieldLine(70, 70, 200),
      caption(290, 52, 60, "Age"), fieldLine(330, 70, 160),
      caption(20, 86, 200, "Goal / motivation"), ruled(14, 106, RM_PP_WIDTH - 28, 72, 24),
      caption(20, 186, 200, "Traits"), ruled(14, 206, RM_PP_WIDTH - 28, 72, 24),
      caption(20, 286, 200, "Arc"), ruled(14, 306, RM_PP_WIDTH - 28, 96, 24),
      caption(20, 410, 200, "Notes"), dotArea(14, 430, RM_PP_WIDTH - 28, 200, 16),
      ...nav(651, "Characters")
    ]
  },

  // ---------- LOCATION (profile) ----------
  location: {
    id: "location", name: "Location", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 60, "Type"), fieldLine(70, 70, 419),
      caption(20, 86, 200, "Description"), ruled(14, 106, RM_PP_WIDTH - 28, 120, 24),
      caption(20, 234, 200, "Atmosphere / mood"), ruled(14, 254, RM_PP_WIDTH - 28, 96, 24),
      caption(20, 358, 200, "Notes"), dotArea(14, 378, RM_PP_WIDTH - 28, 252, 16),
      ...nav(651, "Locations")
    ]
  }
};

return templates;
