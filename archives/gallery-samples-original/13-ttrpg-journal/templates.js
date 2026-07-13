// TTRPG Campaign Journal — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const DOTS = "#b8b8b8";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";

// d20 line-art cover (pure shapes)
const D20_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
  '<polygon points="50,5 89,27 89,73 50,95 11,73 11,27" fill="none" stroke="#111111" stroke-width="2.2"/>' +
  '<polygon points="50,5 71,40 29,40" fill="none" stroke="#111111" stroke-width="1.2"/>' +
  '<polygon points="29,40 71,40 50,66" fill="none" stroke="#111111" stroke-width="1.2"/>' +
  '<line x1="29" y1="40" x2="11" y2="27" stroke="#111111" stroke-width="1"/>' +
  '<line x1="71" y1="40" x2="89" y2="27" stroke="#111111" stroke-width="1"/>' +
  '<line x1="29" y1="40" x2="11" y2="73" stroke="#111111" stroke-width="1"/>' +
  '<line x1="71" y1="40" x2="89" y2="73" stroke="#111111" stroke-width="1"/>' +
  '<line x1="50" y1="66" x2="11" y2="73" stroke="#111111" stroke-width="1"/>' +
  '<line x1="50" y1="66" x2="89" y2="73" stroke="#111111" stroke-width="1"/>' +
  '<line x1="50" y1="66" x2="50" y2="95" stroke="#111111" stroke-width="1"/>' +
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
const field = (cx, cy, label, lx, lw) => ([ caption(cx, cy, 90, label), fieldLine(lx, cy + 18, lw) ]);
const hubButton = (x, y, w, label, nodeId) => ([
  { type: "rect", x: x, y: y, w: w, h: 68, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "specific_node", linkValue: nodeId },
  { type: "text", x: x, y: y, w: w, h: 68, text: label, fontSize: 19, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "specific_node", linkValue: nodeId }
]);
// right-edge tabs to the three banks
const bankTabs = () => {
  const banks = [["NPCs", "npcs"], ["Places", "locations"], ["Quests", "quests"]];
  const x0 = 476, w0 = 30, top = 52, bottom = 646, tabH = (bottom - top) / banks.length;
  const els = [];
  banks.forEach(([name, id], i) => {
    const ty = top + i * tabH, cx = x0 + w0 / 2, cy = ty + tabH / 2, tw = tabH - 14;
    els.push({ type: "rect", x: x0, y: ty, w: w0, h: tabH - 2, fill: i % 2 === 0 ? "#e9edf0" : "#f4f6f7", stroke: CHIP_BORDER, strokeWidth: 1, borderRadius: 4, linkTarget: "specific_node", linkValue: id });
    els.push({ type: "text", x: cx - tw / 2, y: cy - 9, w: tw, h: 18, text: name, fontSize: 11, fontWeight: "bold", align: "center", verticalAlign: "middle", rotation: 90, textColor: "#333333", linkTarget: "specific_node", linkValue: id });
  });
  return els;
};

const templates = {
  // ---------- COVER (d20 art) ----------
  cover: {
    id: "cover", name: "Cover", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "none", stroke: "none", zIndex: -10, linkTarget: "specific_node", linkValue: "contents" },
      { type: "rect", x: 22, y: 22, w: 465, h: 635, fill: "none", stroke: INK, strokeWidth: 2 },
      { type: "rect", x: 34, y: 34, w: 441, h: 611, fill: "none", stroke: "#bbbbbb", strokeWidth: 1 },
      { type: "svg", x: 199, y: 116, w: 111, h: 111, svgContent: D20_SVG },
      { type: "text", x: 50, y: 270, w: 409, h: 24, text: "roll for initiative", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 302, w: 429, h: 64, text: "{{title}}", fontSize: 42, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 380, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 174, y: 484, w: 161, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 174, y: 484, w: 161, h: 46, text: "Open campaign  »", fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- CAMPAIGN HUB (contents) ----------
  hub: {
    id: "hub", name: "Campaign", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      ...hubButton(30, 78, 210, "Sessions", "sessions"),
      ...hubButton(269, 78, 210, "NPCs", "npcs"),
      ...hubButton(30, 160, 210, "Locations", "locations"),
      ...hubButton(269, 160, 210, "Quests", "quests"),
      caption(30, 250, 200, "The party"),
      ruled(30, 270, 449, 130, 26),
      caption(30, 414, 200, "Campaign notes"),
      ruled(30, 434, 449, 200, 26)
    ]
  },

  // ---------- SECTION (bank index) ----------
  section: {
    id: "section", name: "Section", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      ...idxCover(12),
      headerRule(46),
      caption(16, 52, 300, "tap to open"),
      { type: "grid", x: 24, y: 74, w: 150, h: 40,
        gridConfig: { cols: 3, gapX: 9, gapY: 8, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 6, fontSize: 12, align: "center", verticalAlign: "middle", textColor: "#333333" },
      ...nav(651, "Back")
    ]
  },

  // ---------- SESSION (log + bank tabs) ----------
  session: {
    id: "session", name: "Session", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...field(20, 50, "Date", 64, 180),
      caption(20, 84, 120, "Recap"), ruled(14, 104, 456, 52, 26),
      caption(20, 164, 120, "What happened"), ruled(14, 184, 456, 300, 26),
      ...field(20, 494, "Loot", 60, 406),
      ...field(20, 528, "XP / level", 100, 366),
      ...bankTabs(),
      ...nav(654, "Sessions")
    ]
  },

  // ---------- NPC ----------
  npc: {
    id: "npc", name: "NPC", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...field(20, 54, "Role", 66, 176),
      ...field(272, 54, "Faction", 330, 159),
      ...field(20, 92, "Location", 90, 152),
      ...field(272, 92, "Disposition", 356, 133),
      caption(20, 132, 200, "Description"), ruled(14, 152, RM_PP_WIDTH - 28, 120, 26),
      caption(20, 280, 200, "Notes"), dotArea(14, 300, RM_PP_WIDTH - 28, 344, 16),
      ...nav(651, "NPCs")
    ]
  },

  // ---------- LOCATION ----------
  location: {
    id: "location", name: "Location", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...field(20, 54, "Region", 78, 164),
      ...field(272, 54, "Type", 322, 167),
      caption(20, 92, 200, "Description"), ruled(14, 112, RM_PP_WIDTH - 28, 150, 26),
      caption(20, 270, 200, "Map / notes"), dotArea(14, 290, RM_PP_WIDTH - 28, 354, 16),
      ...nav(651, "Places")
    ]
  },

  // ---------- QUEST ----------
  quest: {
    id: "quest", name: "Quest", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...field(20, 54, "Giver", 66, 176),
      ...field(272, 54, "Status", 326, 163),
      ...field(20, 92, "Reward", 78, 411),
      caption(20, 132, 200, "Objectives"), ruled(14, 152, RM_PP_WIDTH - 28, 180, 28),
      caption(20, 340, 200, "Notes"), ruled(14, 360, RM_PP_WIDTH - 28, 284, 26),
      ...nav(651, "Quests")
    ]
  }
};

return templates;
