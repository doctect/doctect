// Recipe Book + Meal Planner — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

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

// KEEP THIS LIST IDENTICAL to `categories` in hierarchy.js — the week page's recipe tabs
// link to each category by a slug id derived from its name.
const categories = ["Breakfast", "Mains", "Sides", "Salads", "Desserts", "Drinks"];
const catId = (name) => "cat_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

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
const hubButton = (y, label, nodeId) => ([
  { type: "rect", x: 40, y: y, w: 429, h: 66, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "specific_node", linkValue: nodeId },
  { type: "text", x: 40, y: y, w: 429, h: 66, text: label, fontSize: 20, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "specific_node", linkValue: nodeId }
]);

// right-edge tab strip: one tab per recipe category -> that category's recipe index
const catTabs = () => {
  const x0 = 476, w0 = 30, top = 52, bottom = 646;
  const tabH = (bottom - top) / categories.length;
  const els = [];
  categories.forEach((name, i) => {
    const ty = top + i * tabH;
    const cx = x0 + w0 / 2, cy = ty + tabH / 2;
    const tw = tabH - 14, th = 18;
    els.push({ type: "rect", x: x0, y: ty, w: w0, h: tabH - 2, fill: i % 2 === 0 ? "#e9edf0" : "#f4f6f7", stroke: CHIP_BORDER, strokeWidth: 1, borderRadius: 4, linkTarget: "specific_node", linkValue: catId(name) });
    els.push({ type: "text", x: cx - tw / 2, y: cy - th / 2, w: tw, h: th, text: name, fontSize: 11, fontWeight: "bold", align: "center", verticalAlign: "middle", rotation: 90, textColor: "#333333", linkTarget: "specific_node", linkValue: catId(name) });
  });
  return els;
};

// weekly meal grid (left of the tab strip): Day | Breakfast | Lunch | Dinner, 7 rows
const mealTable = (x, y) => {
  const cols = [57, 133, 133, 133]; const W = 456; const headerH = 24; const rowH = 40;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const heads = ["Day", "Breakfast", "Lunch", "Dinner"];
  const els = [{ type: "rect", x: x, y: y, w: W, h: headerH, fill: HEADER_FILL, stroke: "none", strokeWidth: 0 }];
  let cx = x;
  heads.forEach((h, i) => { els.push({ type: "text", x: cx + (i === 0 ? 6 : 0), y: y, w: cols[i] - (i === 0 ? 6 : 0), h: headerH, text: h, fontSize: 11, fontWeight: "bold", align: i === 0 ? "left" : "center", verticalAlign: "middle", textColor: "#ffffff" }); cx += cols[i]; });
  for (let r = 0; r < 7; r++) {
    const ry = y + headerH + r * rowH;
    if (r % 2 === 1) els.push({ type: "rect", x: x, y: ry, w: W, h: rowH, fill: ALT_FILL, stroke: "none", strokeWidth: 0 });
    els.push({ type: "text", x: x + 6, y: ry, w: cols[0] - 6, h: rowH, text: days[r], fontSize: 11, fontWeight: "bold", align: "left", verticalAlign: "middle", textColor: "#333333" });
  }
  for (let r = 0; r <= 7; r++) els.push({ type: "line", x: x, y: y + headerH + r * rowH, w: W, h: 0, stroke: RULE, strokeWidth: 1 });
  let vx = x;
  for (let i = 0; i <= cols.length; i++) { els.push({ type: "line", x: vx, y: y, w: 0, h: headerH + 7 * rowH, flip: true, stroke: RULE, strokeWidth: 1 }); if (i < cols.length) vx += cols[i]; }
  els.push({ type: "rect", x: x, y: y, w: W, h: headerH + 7 * rowH, fill: "none", stroke: "#9aa0a6", strokeWidth: 1 });
  return els;
};

const checklist = (x, y, w, title, n) => {
  const els = [{ type: "text", x: x, y: y, w: w, h: 16, text: title, fontSize: 12, fontWeight: "bold", align: "left", textColor: INK }];
  for (let i = 0; i < n; i++) {
    const ry = y + 24 + i * 22;
    els.push({ type: "rect", x: x, y: ry, w: 12, h: 12, fill: "none", stroke: INK, strokeWidth: 1 });
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
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "what's cooking", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 250, w: 429, h: 72, text: "{{title}}", fontSize: 48, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 174, y: 470, w: 161, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 174, y: 470, w: 161, h: 46, text: "Open cookbook  »", fontSize: 15, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- HUB (contents) ----------
  hub: {
    id: "hub", name: "Kitchen", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      ...hubButton(84, "Recipes", "recipes"),
      ...hubButton(166, "Meal Plan", "mealplan"),
      ...hubButton(248, "Shopping Lists", "shopping"),
      caption(40, 336, 200, "Favourites"),
      ruled(40, 356, 429, 280, 26)
    ]
  },

  // ---------- SECTION (generic index) ----------
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

  // ---------- RECIPE ----------
  recipe: {
    id: "recipe", name: "Recipe", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      caption(20, 52, 50, "Serves"), fieldLine(74, 70, 90),
      caption(178, 52, 40, "Time"), fieldLine(214, 70, 90),
      caption(318, 52, 50, "Source"), fieldLine(368, 70, 121),
      caption(20, 86, 120, "Ingredients"), ruled(14, 106, RM_PP_WIDTH - 28, 180, 24),
      caption(20, 294, 120, "Method"), ruled(14, 314, RM_PP_WIDTH - 28, 252, 26),
      caption(20, 574, 120, "Notes"), ruled(14, 594, RM_PP_WIDTH - 28, 50, 24),
      ...nav(651, "Back")
    ]
  },

  // ---------- WEEK (meal plan + recipe-category tabs) ----------
  week: {
    id: "week", name: "Week", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...mealTable(14, 62),
      caption(16, 380, 200, "Notes"),
      ruled(14, 400, 456, 236, 26),
      ...catTabs(),
      ...nav(651, "Back")
    ]
  },

  // ---------- SHOPPING LIST ----------
  shopping: {
    id: "shopping", name: "Shopping", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...checklist(20, 58, 225, "Produce", 6),
      ...checklist(264, 58, 225, "Dairy & Eggs", 6),
      ...checklist(20, 250, 225, "Meat & Fish", 6),
      ...checklist(264, 250, 225, "Pantry", 6),
      ...checklist(20, 442, 225, "Frozen", 6),
      ...checklist(264, 442, 225, "Other", 6),
      ...nav(651, "Back")
    ]
  }
};

return templates;
