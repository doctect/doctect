// Flashcard Deck — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const DOTS = "#c4c4c4";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";
const CARD_FILL = "#fbfbfb";
const CARD_BORDER = "#d0d0d0";

const headerRule = (y) => ({ type: "line", x: 0, y: y, w: RM_PP_WIDTH, h: 0, stroke: INK, strokeWidth: 1 });
const chip = (x, y, w, label, target, value) => ({
  type: "text", x: x, y: y, w: w, h: 24, text: label, fontSize: 11, align: "center", verticalAlign: "middle",
  fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: target, linkValue: value
});
const caption = (x, y, w, text) => ({ type: "text", x: x, y: y, w: w, h: 18, text: text, fontSize: 13, fontFamily: "caveat", textColor: LABEL });
const dotArea = (x, y, w, h, s) => ({ type: "rect", x: x, y: y, w: w, h: h, fill: DOTS, fillType: "pattern", patternType: "dots", patternSpacing: s, patternWeight: 1, stroke: "none", strokeWidth: 0 });
const idxCover = (y) => ([ chip(372, y, 56, "Index", "specific_node", "contents"), chip(434, y, 61, "Cover", "specific_node", "root") ]);

// the flashcard body: a big rounded card with a corner label + a faint dot area to write in
const cardBody = (label) => ([
  { type: "rect", x: 24, y: 62, w: 461, h: 438, fill: CARD_FILL, stroke: CARD_BORDER, strokeWidth: 1.5, borderRadius: 16 },
  { type: "text", x: 44, y: 80, w: 200, h: 22, text: label, fontSize: 16, fontFamily: "caveat", textColor: LABEL },
  dotArea(44, 112, 421, 372, 18)
]);
const flipButton = (label, fill, target, value) => ([
  { type: "rect", x: 150, y: 518, w: 209, h: 48, fill: fill, stroke: "none", borderRadius: 10, linkTarget: target, linkValue: value },
  { type: "text", x: 150, y: 518, w: 209, h: 48, text: label, fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: target, linkValue: value }
]);

const templates = {
  // ---------- COVER ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "learn it cold", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 250, w: 429, h: 72, text: "{{title}}", fontSize: 48, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open decks  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- DECKS INDEX (contents) ----------
  section: {
    id: "section", name: "Decks", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(46),
      caption(16, 52, 300, "tap a deck"),
      { type: "grid", x: 40, y: 74, w: 200, h: 58,
        gridConfig: { cols: 2, gapX: 24, gapY: 16, sourceType: "current", displayField: "title" },
        fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, fontSize: 17, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK }
    ]
  },

  // ---------- DECK (card index) ----------
  deck: {
    id: "deck", name: "Deck", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 250, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      { type: "text", x: 262, y: 12, w: 78, h: 24, text: "Study  »", fontSize: 11, fontWeight: "bold", align: "center", verticalAlign: "middle", fill: "#eef2ff", stroke: "#c7d2fe", strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "child_index", linkValue: "0" },
      chip(372, 12, 56, "Index", "specific_node", "contents"),
      chip(434, 12, 61, "Cover", "specific_node", "root"),
      headerRule(46),
      caption(16, 52, 300, "tap a card, or Study to begin"),
      { type: "grid", x: 24, y: 74, w: 108, h: 34,
        gridConfig: { cols: 4, gapX: 8, gapY: 8, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 6, fontSize: 11, align: "center", verticalAlign: "middle", textColor: "#333333" },
      { type: "triangle", x: 64, y: 651, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      chip(210, 649, 90, "Decks", "specific_node", "contents"),
      { type: "triangle", x: 419, y: 651, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  },

  // ---------- CARD FRONT (question) ----------
  card_front: {
    id: "card_front", name: "Front", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      ...idxCover(10),
      headerRule(44),
      ...cardBody("Question"),
      ...flipButton("Flip to answer  »", INK, "child_index", "0"),
      { type: "triangle", x: 64, y: 622, w: 26, h: 13, rotation: 270, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "-1" },
      chip(210, 620, 90, "Deck", "parent", ""),
      { type: "triangle", x: 419, y: 622, w: 26, h: 13, rotation: 90, fill: INK, stroke: INK, strokeWidth: 1, linkTarget: "sibling", linkValue: "1" }
    ]
  },

  // ---------- CARD BACK (answer) ----------
  card_back: {
    id: "card_back", name: "Back", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 30, text: "{{title}}", fontSize: 22, fontWeight: "bold", textColor: INK },
      ...idxCover(10),
      headerRule(44),
      ...cardBody("Answer"),
      ...flipButton("«  Flip to question", "#374151", "parent", ""),
      { type: "text", x: 210, y: 620, w: 90, h: 20, text: "Deck", fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "ancestor", linkValue: "2" }
    ]
  }
};

return templates;
