// Meeting Notes System - TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";        // thin dividers
const RULED = "#d3d3d3";       // ruled writing lines
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";       // caveat captions
const CELL = "#fcfcfc";        // list-row fill

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4,
  linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const ruled = (x, y, w, h, spacing) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: RULED, fillType: "pattern", patternType: "lines-h", patternSpacing: spacing, stroke: "none", strokeWidth: 0 });

const templates = {
  // ---------- COVER (root) ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "stay on top of every meeting", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 50, y: 250, w: 409, h: 72, text: "{{title}}", fontSize: 48, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open binder  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- PROJECTS INDEX (contents) ----------
  projects_index: {
    id: "projects_index", name: "Projects", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      caption(16, 58, 300, "tap a project - rename each to your team or client"),
      { type: "grid", x: 40, y: 92, w: 200, h: 58,
        gridConfig: { cols: 2, gapX: 24, gapY: 16, sourceType: "current", displayField: "title" },
        fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, fontSize: 18, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK }
    ]
  },

  // ---------- PROJECT (meeting index + project notes) ----------
  project: {
    id: "project", name: "Project", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      chip(372, 12, 56, "Index", "specific_node", "contents"),
      chip(434, 12, 61, "Cover", "specific_node", "root"),
      headerRule(46),
      caption(16, 52, 300, "tap a meeting · write its date beside the number"),
      { type: "grid", x: 24, y: 74, w: 228, h: 24,
        gridConfig: { cols: 2, gapX: 9, gapY: 4, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 3, fontSize: 11, align: "left", verticalAlign: "middle", textColor: "#333333" },
      caption(16, 420, 200, "Project notes"),
      ruled(14, 440, RM_PP_WIDTH - 28, 200, 26),
      { type: "triangle", x: 64, y: 651, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      { type: "text", x: 210, y: 649, w: 90, h: 20, text: "Projects", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
      { type: "triangle", x: 419, y: 651, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  },

  // ---------- MEETING (the note page) ----------
  meeting: {
    id: "meeting", name: "Meeting", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 300, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      chip(372, 10, 56, "Index", "specific_node", "contents"),
      chip(434, 10, 61, "Cover", "specific_node", "root"),
      headerRule(44),
      // meta: date + attendees
      caption(20, 52, 44, "Date"),
      { type: "line", x: 66, y: 70, w: 150, h: 0, stroke: RULE, strokeWidth: 1 },
      caption(232, 52, 80, "Attendees"),
      { type: "line", x: 312, y: 70, w: 177, h: 0, stroke: RULE, strokeWidth: 1 },
      // agenda
      caption(20, 84, 80, "Agenda"),
      ruled(14, 104, RM_PP_WIDTH - 28, 64, 22),
      // notes
      caption(20, 176, 80, "Notes"),
      ruled(14, 196, RM_PP_WIDTH - 28, 216, 26),
      // action items (checkbox + line)
      caption(20, 420, 120, "Action items"),
      { type: "rect", x: 18, y: 442, w: 14, h: 14, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "line", x: 40, y: 457, w: 449, h: 0, stroke: RULE, strokeWidth: 1 },
      { type: "rect", x: 18, y: 466, w: 14, h: 14, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "line", x: 40, y: 481, w: 449, h: 0, stroke: RULE, strokeWidth: 1 },
      { type: "rect", x: 18, y: 490, w: 14, h: 14, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "line", x: 40, y: 505, w: 449, h: 0, stroke: RULE, strokeWidth: 1 },
      { type: "rect", x: 18, y: 514, w: 14, h: 14, fill: "none", stroke: INK, strokeWidth: 1 },
      { type: "line", x: 40, y: 529, w: 449, h: 0, stroke: RULE, strokeWidth: 1 },
      // decisions
      caption(20, 552, 120, "Decisions"),
      ruled(14, 572, RM_PP_WIDTH - 28, 72, 24),
      // footer
      { type: "triangle", x: 64, y: 652, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      { type: "text", x: 210, y: 650, w: 90, h: 20, text: "Project", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" },
      { type: "triangle", x: 419, y: 652, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  }
};

return templates;
