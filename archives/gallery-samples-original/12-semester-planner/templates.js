// Semester Study Planner — TEMPLATE SCRIPT
// Page: reMarkable Paper Pro (RM_PP_WIDTH 509 x RM_PP_HEIGHT 679)

const INK = "#111111";
const RULE = "#c8c8c8";
const RULED = "#d3d3d3";
const CHIP = "#ececec";
const CHIP_BORDER = "#bbbbbb";
const LABEL = "#9aa0a6";
const CELL = "#fcfcfc";
const HEADER_FILL = "#2e3436";
const ALT_FILL = "#f1f4f5";
const TOTAL_FILL = "#e5e7eb";

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
const backOnly = (y, backLabel) => ([
  { type: "text", x: 210, y: y - 2, w: 90, h: 20, text: backLabel, fontSize: 11, align: "center", verticalAlign: "middle", fill: CHIP, stroke: CHIP_BORDER, strokeWidth: 1, borderStyle: "solid", borderRadius: 4, linkTarget: "parent" }
]);
const hubButton = (x, y, w, label, idx) => ([
  { type: "rect", x: x, y: y, w: w, h: 68, fill: "#f2f2f2", stroke: "#b8b8b8", strokeWidth: 1, borderRadius: 10, linkTarget: "child_index", linkValue: idx },
  { type: "text", x: x, y: y, w: w, h: 68, text: label, fontSize: 19, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: INK, linkTarget: "child_index", linkValue: idx }
]);
const field = (cx, cy, label, lx, lw) => ([ caption(cx, cy, 90, label), fieldLine(lx, cy + 18, lw) ]);
const makeTable = (x, y, colW, rowH, nRows, headers, opts = {}) => {
  const els = []; const W = colW.reduce((a, b) => a + b, 0); const headerH = rowH; const bodyY = y + headerH;
  els.push({ type: "rect", x: x, y: y, w: W, h: headerH, fill: HEADER_FILL, stroke: "none", strokeWidth: 0 });
  for (let r = 0; r < nRows; r++) if (r % 2 === 1) els.push({ type: "rect", x: x, y: bodyY + r * rowH, w: W, h: rowH, fill: ALT_FILL, stroke: "none", strokeWidth: 0 });
  for (let r = 0; r <= nRows; r++) els.push({ type: "line", x: x, y: bodyY + r * rowH, w: W, h: 0, stroke: RULE, strokeWidth: 1 });
  let cx = x;
  for (let i = 0; i <= colW.length; i++) { els.push({ type: "line", x: cx, y: y, w: 0, h: headerH + nRows * rowH, flip: true, stroke: RULE, strokeWidth: 1 }); if (i < colW.length) cx += colW[i]; }
  els.push({ type: "rect", x: x, y: y, w: W, h: headerH + nRows * rowH, fill: "none", stroke: "#9aa0a6", strokeWidth: 1 });
  cx = x;
  headers.forEach((label, i) => { els.push({ type: "text", x: cx + (i === 0 ? 8 : 0), y: y, w: colW[i] - (i === 0 ? 8 : 0), h: headerH, text: label, fontSize: 11, fontWeight: "bold", align: i === 0 ? "left" : "center", verticalAlign: "middle", textColor: "#ffffff" }); cx += colW[i]; });
  if (opts.rowLabels) for (let r = 0; r < nRows; r++) { if (!opts.rowLabels[r]) continue; els.push({ type: "text", x: x + 8, y: bodyY + r * rowH, w: colW[0] - 8, h: rowH, text: opts.rowLabels[r], fontSize: 11, align: "left", verticalAlign: "middle", textColor: "#333333" }); }
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
      { type: "text", x: 50, y: 214, w: 409, h: 24, text: "own the semester", fontSize: 16, fontFamily: "caveat", align: "center", textColor: "#999999" },
      { type: "text", x: 40, y: 250, w: 429, h: 72, text: "{{title}}", fontSize: 46, fontWeight: "bold", align: "center", textColor: INK },
      { type: "text", x: 50, y: 336, w: 409, h: 28, text: "{{subtitle}}", fontSize: 18, align: "center", textColor: "#666666" },
      { type: "rect", x: 179, y: 470, w: 151, h: 46, fill: INK, stroke: "none", borderRadius: 8, linkTarget: "specific_node", linkValue: "contents" },
      { type: "text", x: 179, y: 470, w: 151, h: 46, text: "Open planner  »", fontSize: 16, fontWeight: "bold", align: "center", verticalAlign: "middle", textColor: "#ffffff", linkTarget: "specific_node", linkValue: "contents" }
    ]
  },

  // ---------- SEMESTER HUB (contents) ----------
  hub: {
    id: "hub", name: "Semester", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 320, h: 40, text: "{{title}}", fontSize: 30, fontWeight: "bold", textColor: INK },
      chip(434, 14, 61, "Cover", "specific_node", "root"),
      headerRule(52),
      ...hubButton(30, 78, 210, "Courses", "0"),
      ...hubButton(269, 78, 210, "Assignments", "1"),
      ...hubButton(30, 160, 210, "Schedule", "2"),
      ...hubButton(269, 160, 210, "Grades", "3"),
      caption(30, 250, 200, "Semester goals"),
      ruled(30, 270, 449, 364, 26)
    ]
  },

  // ---------- SECTION (courses index) ----------
  section: {
    id: "section", name: "Section", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 34, text: "{{title}}", fontSize: 26, fontWeight: "bold", textColor: INK },
      ...idxCover(12),
      headerRule(46),
      caption(16, 52, 300, "tap a course"),
      { type: "grid", x: 24, y: 74, w: 228, h: 48,
        gridConfig: { cols: 2, gapX: 9, gapY: 9, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 6, fontSize: 14, fontWeight: "bold", align: "left", verticalAlign: "middle", textColor: "#333333" },
      ...nav(651, "Back")
    ]
  },

  // ---------- COURSE (info + class-note sessions) ----------
  course: {
    id: "course", name: "Course", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...field(20, 54, "Instructor", 108, 140),
      ...field(272, 54, "Room", 322, 167),
      ...field(20, 92, "Schedule", 108, 140),
      ...field(272, 92, "Credits", 322, 167),
      caption(16, 132, 200, "Class notes"),
      { type: "grid", x: 24, y: 152, w: 108, h: 34,
        gridConfig: { cols: 4, gapX: 9, gapY: 8, sourceType: "current", displayField: "title" },
        fill: CELL, stroke: RULE, strokeWidth: 1, borderRadius: 6, fontSize: 11, align: "center", verticalAlign: "middle", textColor: "#333333" },
      caption(16, 470, 200, "Course notes"),
      ruled(14, 490, RM_PP_WIDTH - 28, 154, 26),
      ...nav(651, "Courses")
    ]
  },

  // ---------- SESSION (class notes) ----------
  session: {
    id: "session", name: "Session", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...field(20, 52, "Date", 66, 170),
      ...field(262, 52, "Topic", 312, 177),
      caption(20, 90, 120, "Notes"), ruled(14, 110, RM_PP_WIDTH - 28, 396, 26),
      caption(20, 514, 120, "Homework"), ruled(14, 534, RM_PP_WIDTH - 28, 108, 24),
      ...nav(651, "Course")
    ]
  },

  // ---------- ASSIGNMENTS (tracker) ----------
  assignments: {
    id: "assignments", name: "Assign", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...makeTable(14, 60, [110, 200, 90, 81], 26, 21, ["Course", "Assignment", "Due", "Done"]),
      ...backOnly(651, "Semester")
    ]
  },

  // ---------- SCHEDULE (weekly timetable) ----------
  schedule: {
    id: "schedule", name: "Timetable", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...makeTable(14, 62, [61, 84, 84, 84, 84, 84], 60, 9, ["Time", "Mon", "Tue", "Wed", "Thu", "Fri"],
        { rowLabels: ["8:00", "9:00", "10:00", "11:00", "12:00", "1:00", "2:00", "3:00", "4:00"] }),
      ...backOnly(651, "Semester")
    ]
  },

  // ---------- GRADES (tracker) ----------
  grades: {
    id: "grades", name: "Gradebook", width: RM_PP_WIDTH, height: RM_PP_HEIGHT,
    elements: [
      { type: "text", x: 14, y: 8, w: 330, h: 32, text: "{{title}}", fontSize: 24, fontWeight: "bold", textColor: INK },
      ...idxCover(11),
      headerRule(44),
      ...makeTable(14, 60, [140, 170, 80, 91], 28, 17, ["Course", "Assessment", "Weight", "Grade"]),
      { type: "rect", x: 14, y: 564, w: 481, h: 30, fill: TOTAL_FILL, stroke: "#9aa0a6", strokeWidth: 1 },
      { type: "text", x: 22, y: 564, w: 300, h: 30, text: "GPA / final", fontSize: 12, fontWeight: "bold", align: "left", verticalAlign: "middle", textColor: INK },
      ...backOnly(651, "Semester")
    ]
  }
};

return templates;
