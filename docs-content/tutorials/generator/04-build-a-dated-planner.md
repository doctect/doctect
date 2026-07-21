---
title: Build a Dated Planner in Code
difficulty: advanced
time: 20 min
summary: A complete month-planner build — real calendar math, dynamic weekday offsets, week rows, back links, and a second device variant.
keywords: planner, calendar, date loop, dayOfWeekNum, month grid, worked example, weeks
prerequisites: generator/hierarchy-in-code, editor/grids-calendars-and-data-shaping
---

Everything so far has been parts. [Templates in Code](/docs/generator/templates-in-code) gave you the left panel, [Hierarchy in Code](/docs/generator/hierarchy-in-code) the right, and the Editor track's [calendar](/docs/editor/grids-calendars-and-data-shaping) and [reference](/docs/editor/references-and-referrer-formulas) chapters explained the machinery the 2026 Planner preset is made of. This chapter is the assembly: one month of 2026, built end to end as a pair of scripts you can paste and run — a month page whose calendar puts day 1 in the *correct* weekday column, a page per day, week pages built from reference nodes, referrer labels on the calendar's rows, and a one-line switch that retargets the whole document from A4 to a reMarkable.

It's built in five cumulative stages. Each stage's code is real — the blocks concatenate, in order, into the exact two scripts captured running at the end of the page — and each stage ends runnable, so you can preview as you go. The finished pair is repeated in full at the bottom if you'd rather read the destination first.

## The one decision that touches everything

Before any code: which day starts a week? Wall calendars disagree — Monday-first is common in Europe and ISO 8601, Sunday-first in North America — but `Date` has an opinion of its own, and every piece of arithmetic in this chapter flows from reconciling the two:

- **JavaScript counts Sunday-first.** `new Date(...).getDay()` returns `0` for Sunday through `6` for Saturday, always. January 1, 2026 is a Thursday: `new Date(2026, 0, 1).getDay()` is `4`.
- **This planner's grid is Monday-first**, headed `M T W T F S S` — the same convention as the shipped 2026 Planner preset, so every number here can be checked against a preset you already have.

A Monday-first calendar needs day 1 preceded by one blank cell per weekday already elapsed since Monday. That count is *not* `getDay()` — Sunday-first numbering puts Thursday at `4`, but Thursday is only **3** days past Monday. The conversion is one subtraction with a wrap for Sunday:

| First day of month | `getDay()` | Blanks before day 1 (Monday-first) |
| --- | --- | --- |
| Monday (June 2026) | 1 | 0 |
| Thursday (January 2026) | 4 | 3 |
| Sunday (February 2026) | 0 | 6 — *not* −1 |

Two formulas produce that column, and this chapter uses both, in different places:

- **`(getDay() + 6) % 7`** — the true modulo form. Our hierarchy script uses it to *precompute* each month's blank-cell count into a data field.
- **`getDay() − 1`, wrapped once** — the grid's own form. The calendar grid stores raw `getDay()` in each day's `weekday_num` field and declares `offsetAdjustment: -1`; when the sum goes negative (Sunday: `0 − 1 = −1`), the renderer adds the column count back exactly once (`−1 + 7 = 6`). [Grids II](/docs/editor/grids-calendars-and-data-shaping#dynamic-offset-step-by-step) documents this single-wrap behavior against the shipped preset.

Forget the `-1` and nothing errors — every month simply renders one column late: January's 1st lands under `F`, and February (a Sunday start) collapses onto Monday's column. It's the most-copied line in this chapter for a reason. (Prefer Sunday-first? Change the header row to `S M T W T F S` and set `offsetAdjustment: 0` — raw `getDay()` *is* the Sunday-first blank count. The two edits must travel together; that's the whole lesson.)

The reference implementation we're matching, verbatim from the preset's Month View template — `cols: 7`, dynamic offset reading the first day's `weekday_num`, minus one:

```json
{
  "cols": 7, "gapX": 2, "gapY": 2,
  "sourceType": "current",
  "displayField": "day_num",
  "offsetMode": "dynamic",
  "offsetField": "weekday_num",
  "offsetAdjustment": -1
}
```

## Stage 1 — Templates: a month and a day

The templates script opens by binding the injected page-size [constants](/docs/generator/templates-in-code#geometry-and-constants) to two locals, `W` and `H`, and deriving *every* coordinate from them — margins, cell sizes, the notes block. That indirection looks like ceremony now; in Stage 5 it becomes the entire device-retargeting story. Note the script also repeats the year/month constants and computes `DAYS` with the `new Date(YEAR, MONTH + 1, 0)` trick — asking for "day zero" of the *next* month, which `Date` resolves to this month's last day. The [two scripts share no scope](/docs/generator/templates-in-code#the-template-contract), so facts both need must be stated twice.

```javascript
// ---- Stage 1: month + day templates ----
const W = A4_WIDTH, H = A4_HEIGHT;   // Stage 5 swaps this one line

// The same calendar facts the hierarchy script will compute —
// scripts run in separate scopes, so the constants are repeated there.
const YEAR = 2026, MONTH = 0;                         // January (Date months count from 0)
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();  // day 0 of next month = this month's last day: 31

// Geometry, all derived from W and H.
const M = 40;                                  // outer margin
const GAP = 4;                                 // space between day cells
const LABEL_W = 34;                            // week-label rail right of the calendar
const GRID_X = M;
const GRID_Y = 96;                             // calendar top; title + weekday header sit above
const NOTES_H = 110;
const CELL_W = (W - M * 2 - LABEL_W - 8 - GAP * 6) / 7;
const CELL_H = (H - GRID_Y - NOTES_H - M - GAP * 5 - 30) / 6;  // reserve six rows — the tallest month shape

const t = {};
t.month = {
  id: 'month', name: 'Month Page', width: W, height: H,
  elements: [
    { type: 'text', x: M, y: 10, w: W - M * 2, h: 34, text: '{{title}}',
      fontSize: 24, fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'line', x: M, y: 52, w: W - M * 2, h: 0, stroke: '#0f172a', strokeWidth: 1 },
    // The calendar. w/h size ONE CELL; the grid expands to cols × rows.
    { type: 'grid', x: GRID_X, y: GRID_Y, w: CELL_W, h: CELL_H,
      fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1, fontSize: 11,
      align: 'left', verticalAlign: 'top',
      gridConfig: {
        cols: 7, gapX: GAP, gapY: GAP,
        sourceType: 'current', displayField: 'day_num',
        offsetMode: 'dynamic', offsetField: 'weekday_num', offsetAdjustment: -1,
        dataSliceStart: 0, dataSliceCount: DAYS,   // days only — Stage 3 adds more children
      } },
    { type: 'text', x: M, y: H - M - NOTES_H - 16, w: 200, h: 14, text: 'NOTES',
      fontSize: 9, fontWeight: 'bold', textColor: '#64748b' },
    { type: 'rect', x: M, y: H - M - NOTES_H, w: W - M * 2, h: NOTES_H,
      fill: '#e2e8f0', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 18,
      strokeWidth: 0 },
  ],
};

// Weekday header: Monday-first, weekend columns shaded. Static labels on
// filled cells — never bind dynamic text into a filled chip.
const HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
HEADERS.forEach((letter, i) => {
  t.month.elements.push({
    type: 'text', x: GRID_X + i * (CELL_W + GAP), y: GRID_Y - 26, w: CELL_W, h: 20,
    text: letter, fontSize: 10, fontWeight: 'bold', align: 'center',
    textColor: i >= 5 ? '#64748b' : '#0f172a',
    fill: i >= 5 ? '#e2e8f0' : '#f1f5f9',
  });
});

t.day = {
  id: 'day', name: 'Day Page', width: W, height: H,
  elements: [
    { type: 'text', x: M, y: 10, w: W - M * 2 - 150, h: 30, text: '{{title}}',
      fontSize: 22, fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'text', x: M, y: 44, w: 240, h: 16, text: '{{day_name}}',
      fontSize: 11, textColor: '#475569' },
    // Back to the month: the day's parent. month_short comes from the ROOT
    // node's data — ancestors donate their fields to every descendant page.
    { type: 'text', x: W - M - 64, y: 12, w: 64, h: 24, text: '« {{month_short}}',
      fontSize: 11, align: 'center', fill: '#e2e8f0', stroke: '#94a3b8',
      strokeWidth: 1, borderStyle: 'solid', linkTarget: 'parent' },
    // Back to the week — blank until Stage 3 exists. A referrer donates its
    // own context, so this fills in the moment a week references this day.
    { type: 'text', x: W - M - 64 - 8 - 40, y: 12, w: 40, h: 24, text: '{{week_short}}',
      fontSize: 11, fontWeight: 'bold', align: 'center', textColor: '#4f46e5',
      linkTarget: 'referrer' },
    { type: 'line', x: M, y: 68, w: W - M * 2, h: 0, stroke: '#0f172a', strokeWidth: 1 },
    { type: 'rect', x: M, y: 84, w: W - M * 2, h: H - 84 - M,
      fill: '#cbd5e1', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 24,
      strokeWidth: 0 },
  ],
};
```

Three details are load-bearing. The calendar grid is the preset's reference config with one addition — `dataSliceCount: DAYS` pins the grid to the month's first 31 children, because in Stage 3 the month node acquires children that *aren't* days, and an unsliced `sourceType: 'current'` grid would sweep week pages into the calendar as extra cells. Slicing runs before the dynamic offset reads its first item, so the offset still sees day 1. Second: the six-row reservation in `CELL_H`. A 31-day month starting on Saturday or Sunday spills into a sixth calendar row (August 2026 does), so the layout always budgets six — January will simply leave its sixth row empty. Third: the day page's `{{week_short}}` chip binds a field *no day node will carry*. It stays blank in Stage 2 and lights up in Stage 3 — that's the [referrer-donation rule](/docs/editor/references-and-referrer-formulas#displaying-the-referrers-name) doing the work, and watching it switch on is half the point of building in stages.

To run just this stage, add one closing line (each later stage replaces it):

```js
return t;
```

## Stage 2 — Hierarchy: a real Date loop

The shipped preset doesn't compute dates. Its hierarchy script carries a hand-built table — every month's length and starting weekday, pre-counted by a human, plus a rolling counter ticked once per day (trimmed from the 2026 Planner preset):

```js
const months = [
  { name: 'January', short: 'Jan', days: 31, q: 1, offset: 3 }, // Thu start
  { name: 'February', short: 'Feb', days: 28, q: 1, offset: 6 },
  // ...ten more rows...
];
let currentWeekDay = 4; // 2026 starts on Thursday (0=Sun, 4=Thu)
// ...inside the day loop:
//   weekday_num: currentWeekDay.toString()
//   currentWeekDay = (currentWeekDay + 1) % 7;
```

It works — for 2026, forever and only 2026. Change the year and every `days` and `offset` cell is wrong until a human re-counts them (February's leap status included). The whole table is three `Date` calls: month length via the day-zero trick, and each day's weekday via `getDay()`. That's the version we'll write, and it produces *identical* `weekday_num` strings to the preset's counter.

> [!NOTE]
> Yes, `Date` works in generator scripts. The [sandbox](/docs/generator/generator-basics#run-and-preview) blanks the escape hatches — network, storage, workers — but leaves the language alone: `Date`, `Math`, `Intl` and every other built-in run normally. Two caveats travel with that freedom: a `Date` *object* can't be returned (script output must be plain JSON — convert to strings first, which the `String(...)` habit below does anyway), and `new Date()` *with no arguments* reads the wall clock, so a script that uses it bakes in "whenever Preview was last pressed". Fully-specified constructions like `new Date(2026, 0, 1)` are deterministic: same input, same output, every run.

```javascript
// ---- Stage 2: the month and its days, from real dates ----
const YEAR = 2026, MONTH = 0;   // January (Date months count from 0)
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTH_NAME = MONTH_NAMES[MONTH];
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();      // 31
const FIRST_WEEKDAY = new Date(YEAR, MONTH, 1).getDay();  // 4 — Thursday (0=Sun..6=Sat)
const START_OFFSET = (FIRST_WEEKDAY + 6) % 7;             // 3 blank cells, Monday-first

const nodes = {};
nodes.root = {
  id: 'root', parentId: null, type: 'month',
  title: MONTH_NAME + ' ' + YEAR,
  data: {
    year: String(YEAR),
    month_short: MONTH_NAME.slice(0, 3),
    month_start_offset: String(START_OFFSET),   // Stage 4's row formulas read this
  },
  children: [],
};

const dayIds = [];
for (let d = 1; d <= DAYS; d += 1) {
  const weekday = new Date(YEAR, MONTH, d).getDay();
  const id = 'day_' + String(d).padStart(2, '0');
  nodes[id] = {
    id, parentId: 'root', type: 'day',
    title: MONTH_NAME + ' ' + d + ', ' + YEAR,
    data: {
      day_num: String(d).padStart(2, '0'),
      day_name: WEEKDAY_NAMES[weekday],
      day_short: WEEKDAY_NAMES[weekday].slice(0, 3),
      weekday_num: String(weekday),   // raw getDay(); the grid's -1 converts it
    },
    children: [],
  };
  nodes.root.children.push(id);
  dayIds.push(id);
}
```

Every value lands as a string — `String(weekday)`, `String(d).padStart(2, '0')` — the [convention the whole app assumes](/docs/generator/hierarchy-in-code#data-your-templates-will-need). The ids are deterministic (`day_01`…`day_31`) rather than `createId` output because Stage 3 wants to point at specific days by name; [Hierarchy in Code](/docs/generator/hierarchy-in-code#loops-and-ordering) covered when each style earns its keep. And `month_start_offset` is stored *pre-converted* to Monday-first blanks via `(getDay() + 6) % 7` — the true-modulo formula — while each day's `weekday_num` stays raw `getDay()` for the grid's `-1` to convert. Same arithmetic, two homes; January: `4` becomes `3` either way.

Close with `return { nodes, rootId: 'root' };` and run this stage: a 32-node preview, the Month card's calendar starting three blank cells in, and every day chip's week corner still blank.

## Stage 3 — Weeks are reference nodes

Now the planner grows week pages — a writing surface per calendar row. The days already have their one home under the month, and [a node has exactly one parent](/docs/editor/references-and-referrer-formulas#the-problem-references-solve), so week pages can't *contain* the days. The shipped preset's answer, and ours: each week's children are **reference nodes** — pointers carrying a `referenceId` — aimed at days that keep living under the month. One page per day, visible from two places.

First the face. The week template's strip is the same seven-column, dynamic-offset grid as the calendar — pointed at the week's own children. Nothing in the config mentions references: the strip reads each pointer's *target* for display, links each cell through to the target's real page, and the offset reads `weekday_num` *through the first reference* — so a partial first week indents exactly like a partial month.

```javascript
// ---- Stage 3a: the week template ----
t.week = {
  id: 'week', name: 'Week Page', width: W, height: H,
  elements: [
    { type: 'text', x: M, y: 10, w: 240, h: 30, text: '{{title}}',
      fontSize: 22, fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'text', x: W - M - 64, y: 12, w: 64, h: 24, text: '« {{month_short}}',
      fontSize: 11, align: 'center', fill: '#e2e8f0', stroke: '#94a3b8',
      strokeWidth: 1, borderStyle: 'solid', linkTarget: 'parent' },
    { type: 'line', x: M, y: 52, w: W - M * 2, h: 0, stroke: '#0f172a', strokeWidth: 1 },
    // Same offset machinery as the calendar, reading THROUGH the references.
    { type: 'grid', x: M, y: 68, w: (W - M * 2 - GAP * 6) / 7, h: 30,
      fill: '#f1f5f9', stroke: '#94a3b8', strokeWidth: 1, fontSize: 10, align: 'center',
      gridConfig: {
        cols: 7, gapX: GAP, gapY: GAP,
        sourceType: 'current', displayField: '{{day_short}} {{day_num}}',
        offsetMode: 'dynamic', offsetField: 'weekday_num', offsetAdjustment: -1,
      } },
    { type: 'rect', x: M, y: 116, w: W - M * 2, h: H - 116 - M,
      fill: '#cbd5e1', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 24,
      strokeWidth: 0 },
  ],
};
```

Then the nodes. Weeks are Monday-aligned, so the first "week" of a month is usually partial — it holds only the days from the 1st to the first Sunday. That's not a special case needing its own branch: the first chunk's length is `7 - START_OFFSET` (January: `7 − 3 = 4` days, the 1st through the 4th), which correctly yields 7 when a month starts on Monday. Every later chunk is a full seven. This block continues the hierarchy script and ends it:

```javascript
// ---- Stage 3b: week pages, referencing the days ----
const weekIds = [];
let cursor = 0;
while (cursor < dayIds.length) {
  const w = weekIds.length + 1;
  const weekId = 'week_' + w;
  const length = w === 1 ? 7 - START_OFFSET : 7;   // first calendar row is short unless Monday starts
  nodes[weekId] = {
    id: weekId, parentId: 'root', type: 'week',
    title: 'Week ' + w,
    data: { week_num: String(w), week_short: 'W' + w },
    children: [],
  };
  nodes.root.children.push(weekId);
  weekIds.push(weekId);
  for (const dayId of dayIds.slice(cursor, cursor + length)) {
    const refId = 'ref_w' + w + '_' + dayId;
    nodes[refId] = {
      id: refId, parentId: weekId,
      type: 'day', title: nodes[dayId].title,   // pointer's label mirrors its target
      data: {}, children: [],
      referenceId: dayId,                       // what makes it a pointer
    };
    nodes[weekId].children.push(refId);
  }
  cursor += length;
}

return { nodes, rootId: 'root' };
```

For January that's five weeks — Week 1 holds four references (Jan 1–4, Thursday through Sunday), Weeks 2–4 seven each, Week 5 six (Jan 26–31) — and the shipped preset builds its fifty-three the same way, `createId('ref')` pointers and all — though the preset copies each day's `data` onto its pointers, the drift-prone habit the warning below tells you to skip; keep yours `{}`. Run the stages so far and watch two things switch on: the Week cards render their strips with Week 1 indented three cells, and **every day page's `W1`–`W5` corner chip now resolves** — the reference donated its week's `week_short` into the day's context, and the chip's `linkTarget: 'referrer'` now has a referrer to find. Nothing on the day template changed.

> [!TIP]
> The other way to get week *rows* — without week *pages* — is slicing: a seven-column grid per row on the month template, each with `dataSliceStart: 0, 4, 11, 18, 25…` and `dataSliceCount: 7`, carving the same day list into windows ([Grids II](/docs/editor/grids-calendars-and-data-shaping#slicing-children-into-rows) walks the mechanism). It's the right tool when a row is only a *view* — a mini-calendar strip on a dashboard. It's the wrong tool here, three ways: a slice has no page (nowhere to write Tuesday's notes), donates no context (no `W1` chip, no referrer for a back link), and hard-codes its start indexes (January's `4, 11, 18…` are wrong for February — references regenerate from `START_OFFSET` for any month you set). If you do mix slices with the dynamic offset, mind the [interaction warning](/docs/editor/grids-calendars-and-data-shaping#slicing-children-into-rows): the offset reads the post-slice first item, so a mid-month slice wants a static offset of 0.

> [!WARNING]
> Keep pointer nodes boring: `data: {}`, `children: []`. Everything a cell or chip needs is read through to the target, a pointer's own children would never print (the exporter skips a reference *and* its subtree), and copying real data onto pointers creates a second copy that can drift. The `type` and `title` mirror the target by [convention, not law](/docs/generator/hierarchy-in-code#references-in-code) — validation checks the type names a real template, nothing more.

## Stage 4 — Label the calendar rows

The month page can't ask "which week is row two?" the way a day page asks for its week — weeks reference the month's *children*, never the month, so no week donates context to the month page. Labeling rows takes the explicit query from the Editor track: the [`{{child_referrer}}` formula](/docs/editor/references-and-referrer-formulas#displaying-the-referrers-name), four colon-slots, `StartIndex:Count:TypeFilter:FieldName`, arithmetic allowed over the rendering node's own data.

The shipped Month View spends six of these, and its magic numbers — `6-month_start_offset`, `13-…`, `20-…`, `27-…`, `34-…`, `41-…`, each with count `-7` — stop being magic the moment you generate them: calendar row *r* ends at slot `7r − 1`, and subtracting the month's blank-cell count turns a slot number into a child index. Start each scan at its row's *last* day and walk backward up to seven children, and short rows land on real days automatically. This block continues the templates script and ends it:

```javascript
// ---- Stage 4: one week label per calendar row ----
// Row r spans slots 7(r-1)..7r-1; child index = slot - month_start_offset.
// Ask "who references the day at the END of row r?", walking backward.
for (let row = 1; row <= 6; row += 1) {
  const startExpr = (7 * row - 1) + '-month_start_offset';
  t.month.elements.push({
    type: 'text',
    x: W - M - LABEL_W, y: GRID_Y + (row - 1) * (CELL_H + GAP), w: LABEL_W, h: CELL_H,
    text: '{{child_referrer:' + startExpr + ':-7::week_short}}',
    fontSize: 10, fontWeight: 'bold', align: 'center', textColor: '#4f46e5',
    linkTarget: 'child_referrer',        // the matching link target...
    linkValue: startExpr,                // ...same scan, same arithmetic
    linkSecondaryValue: '-7',
  });
}

return t;
```

Decode row 1 for January (`month_start_offset` is `'3'`): `6 − 3 = 3` → child 3 is `day_04`, referenced from Week 1 → the formula prints Week 1's `week_short`, **W1**, and the link opens Week 1's page. The `TypeFilter` slot is empty — two colons back to back, the slot present but blank, exactly as [the formula's contract requires](/docs/editor/references-and-referrer-formulas#displaying-the-referrers-name) — because in this project only weeks reference days, so there's nothing to disambiguate.

The edges are where the backward scan earns its keep. Row 5's window *starts* at child `34 − 3 = 31` — which is no longer a day at all: children 31 onward are the week pages themselves, appended by Stage 3. Nothing references a week page, so the scan finds no referrer there, steps back to child 30 — January 31, referenced from Week 5 — and prints **W5**. Row 6's entire window (children 38 back to 32) is week pages and missing indexes; the scan exhausts, the formula prints nothing, and the dead link is dropped at export. The label elements are deliberately bare text — no fill, no border — so an unresolved row 6 leaves *nothing* behind, not an empty chip. (This is also why the calendar grid's `dataSliceCount: DAYS` from Stage 1 matters: without it, those same trailing week pages would render into the calendar as cells 32–36.)

## Stage 5 — Retarget the device

Every coordinate since Stage 1 has been an expression over `W` and `H`. Cash that in — one line:

```js
const W = RM_PP_WIDTH, H = RM_PP_HEIGHT;   // was: A4_WIDTH, A4_HEIGHT
```

Rerun and the same planner re-derives for a reMarkable Paper Pro page: cells shrink from ≈64×91 to ≈52×64, the notes block keeps its 110-point height against a shorter page, and nothing overlaps, because nothing was ever an absolute number that assumed A4. That's the entire discipline: constants at the top, arithmetic everywhere else. The hierarchy script doesn't change at all — nodes don't know page sizes exist.

To *ship* both sizes at once instead of choosing, wrap the template-building code in a function of `(W, H)` and return the [multi-variant shape](/docs/generator/templates-in-code#the-template-contract) — every node type must exist in every variant, which a shared builder guarantees by construction:

```js
const build = (W, H) => {  /* Stages 1 + 3a + 4, minus the const W/H line */  return t; };
return {
  variants: [
    { id: 'a4', name: 'A4', templates: build(A4_WIDTH, A4_HEIGHT) },
    { id: 'rm_pp', name: 'reMarkable', templates: build(RM_PP_WIDTH, RM_PP_HEIGHT) },
  ],
  activeVariantId: 'a4',
};
```

## The whole thing

Both scripts in full — byte-for-byte the concatenation of the stages above, and the exact pair the captures below were made from. Templates:

```javascript
// ---- Stage 1: month + day templates ----
const W = A4_WIDTH, H = A4_HEIGHT;   // Stage 5 swaps this one line

// The same calendar facts the hierarchy script will compute —
// scripts run in separate scopes, so the constants are repeated there.
const YEAR = 2026, MONTH = 0;                         // January (Date months count from 0)
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();  // day 0 of next month = this month's last day: 31

// Geometry, all derived from W and H.
const M = 40;                                  // outer margin
const GAP = 4;                                 // space between day cells
const LABEL_W = 34;                            // week-label rail right of the calendar
const GRID_X = M;
const GRID_Y = 96;                             // calendar top; title + weekday header sit above
const NOTES_H = 110;
const CELL_W = (W - M * 2 - LABEL_W - 8 - GAP * 6) / 7;
const CELL_H = (H - GRID_Y - NOTES_H - M - GAP * 5 - 30) / 6;  // reserve six rows — the tallest month shape

const t = {};
t.month = {
  id: 'month', name: 'Month Page', width: W, height: H,
  elements: [
    { type: 'text', x: M, y: 10, w: W - M * 2, h: 34, text: '{{title}}',
      fontSize: 24, fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'line', x: M, y: 52, w: W - M * 2, h: 0, stroke: '#0f172a', strokeWidth: 1 },
    // The calendar. w/h size ONE CELL; the grid expands to cols × rows.
    { type: 'grid', x: GRID_X, y: GRID_Y, w: CELL_W, h: CELL_H,
      fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1, fontSize: 11,
      align: 'left', verticalAlign: 'top',
      gridConfig: {
        cols: 7, gapX: GAP, gapY: GAP,
        sourceType: 'current', displayField: 'day_num',
        offsetMode: 'dynamic', offsetField: 'weekday_num', offsetAdjustment: -1,
        dataSliceStart: 0, dataSliceCount: DAYS,   // days only — Stage 3 adds more children
      } },
    { type: 'text', x: M, y: H - M - NOTES_H - 16, w: 200, h: 14, text: 'NOTES',
      fontSize: 9, fontWeight: 'bold', textColor: '#64748b' },
    { type: 'rect', x: M, y: H - M - NOTES_H, w: W - M * 2, h: NOTES_H,
      fill: '#e2e8f0', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 18,
      strokeWidth: 0 },
  ],
};

// Weekday header: Monday-first, weekend columns shaded. Static labels on
// filled cells — never bind dynamic text into a filled chip.
const HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
HEADERS.forEach((letter, i) => {
  t.month.elements.push({
    type: 'text', x: GRID_X + i * (CELL_W + GAP), y: GRID_Y - 26, w: CELL_W, h: 20,
    text: letter, fontSize: 10, fontWeight: 'bold', align: 'center',
    textColor: i >= 5 ? '#64748b' : '#0f172a',
    fill: i >= 5 ? '#e2e8f0' : '#f1f5f9',
  });
});

t.day = {
  id: 'day', name: 'Day Page', width: W, height: H,
  elements: [
    { type: 'text', x: M, y: 10, w: W - M * 2 - 150, h: 30, text: '{{title}}',
      fontSize: 22, fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'text', x: M, y: 44, w: 240, h: 16, text: '{{day_name}}',
      fontSize: 11, textColor: '#475569' },
    // Back to the month: the day's parent. month_short comes from the ROOT
    // node's data — ancestors donate their fields to every descendant page.
    { type: 'text', x: W - M - 64, y: 12, w: 64, h: 24, text: '« {{month_short}}',
      fontSize: 11, align: 'center', fill: '#e2e8f0', stroke: '#94a3b8',
      strokeWidth: 1, borderStyle: 'solid', linkTarget: 'parent' },
    // Back to the week — blank until Stage 3 exists. A referrer donates its
    // own context, so this fills in the moment a week references this day.
    { type: 'text', x: W - M - 64 - 8 - 40, y: 12, w: 40, h: 24, text: '{{week_short}}',
      fontSize: 11, fontWeight: 'bold', align: 'center', textColor: '#4f46e5',
      linkTarget: 'referrer' },
    { type: 'line', x: M, y: 68, w: W - M * 2, h: 0, stroke: '#0f172a', strokeWidth: 1 },
    { type: 'rect', x: M, y: 84, w: W - M * 2, h: H - 84 - M,
      fill: '#cbd5e1', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 24,
      strokeWidth: 0 },
  ],
};
// ---- Stage 3a: the week template ----
t.week = {
  id: 'week', name: 'Week Page', width: W, height: H,
  elements: [
    { type: 'text', x: M, y: 10, w: 240, h: 30, text: '{{title}}',
      fontSize: 22, fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'text', x: W - M - 64, y: 12, w: 64, h: 24, text: '« {{month_short}}',
      fontSize: 11, align: 'center', fill: '#e2e8f0', stroke: '#94a3b8',
      strokeWidth: 1, borderStyle: 'solid', linkTarget: 'parent' },
    { type: 'line', x: M, y: 52, w: W - M * 2, h: 0, stroke: '#0f172a', strokeWidth: 1 },
    // Same offset machinery as the calendar, reading THROUGH the references.
    { type: 'grid', x: M, y: 68, w: (W - M * 2 - GAP * 6) / 7, h: 30,
      fill: '#f1f5f9', stroke: '#94a3b8', strokeWidth: 1, fontSize: 10, align: 'center',
      gridConfig: {
        cols: 7, gapX: GAP, gapY: GAP,
        sourceType: 'current', displayField: '{{day_short}} {{day_num}}',
        offsetMode: 'dynamic', offsetField: 'weekday_num', offsetAdjustment: -1,
      } },
    { type: 'rect', x: M, y: 116, w: W - M * 2, h: H - 116 - M,
      fill: '#cbd5e1', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 24,
      strokeWidth: 0 },
  ],
};
// ---- Stage 4: one week label per calendar row ----
// Row r spans slots 7(r-1)..7r-1; child index = slot - month_start_offset.
// Ask "who references the day at the END of row r?", walking backward.
for (let row = 1; row <= 6; row += 1) {
  const startExpr = (7 * row - 1) + '-month_start_offset';
  t.month.elements.push({
    type: 'text',
    x: W - M - LABEL_W, y: GRID_Y + (row - 1) * (CELL_H + GAP), w: LABEL_W, h: CELL_H,
    text: '{{child_referrer:' + startExpr + ':-7::week_short}}',
    fontSize: 10, fontWeight: 'bold', align: 'center', textColor: '#4f46e5',
    linkTarget: 'child_referrer',        // the matching link target...
    linkValue: startExpr,                // ...same scan, same arithmetic
    linkSecondaryValue: '-7',
  });
}

return t;
```

Hierarchy:

```javascript
// ---- Stage 2: the month and its days, from real dates ----
const YEAR = 2026, MONTH = 0;   // January (Date months count from 0)
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTH_NAME = MONTH_NAMES[MONTH];
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();      // 31
const FIRST_WEEKDAY = new Date(YEAR, MONTH, 1).getDay();  // 4 — Thursday (0=Sun..6=Sat)
const START_OFFSET = (FIRST_WEEKDAY + 6) % 7;             // 3 blank cells, Monday-first

const nodes = {};
nodes.root = {
  id: 'root', parentId: null, type: 'month',
  title: MONTH_NAME + ' ' + YEAR,
  data: {
    year: String(YEAR),
    month_short: MONTH_NAME.slice(0, 3),
    month_start_offset: String(START_OFFSET),   // Stage 4's row formulas read this
  },
  children: [],
};

const dayIds = [];
for (let d = 1; d <= DAYS; d += 1) {
  const weekday = new Date(YEAR, MONTH, d).getDay();
  const id = 'day_' + String(d).padStart(2, '0');
  nodes[id] = {
    id, parentId: 'root', type: 'day',
    title: MONTH_NAME + ' ' + d + ', ' + YEAR,
    data: {
      day_num: String(d).padStart(2, '0'),
      day_name: WEEKDAY_NAMES[weekday],
      day_short: WEEKDAY_NAMES[weekday].slice(0, 3),
      weekday_num: String(weekday),   // raw getDay(); the grid's -1 converts it
    },
    children: [],
  };
  nodes.root.children.push(id);
  dayIds.push(id);
}
// ---- Stage 3b: week pages, referencing the days ----
const weekIds = [];
let cursor = 0;
while (cursor < dayIds.length) {
  const w = weekIds.length + 1;
  const weekId = 'week_' + w;
  const length = w === 1 ? 7 - START_OFFSET : 7;   // first calendar row is short unless Monday starts
  nodes[weekId] = {
    id: weekId, parentId: 'root', type: 'week',
    title: 'Week ' + w,
    data: { week_num: String(w), week_short: 'W' + w },
    children: [],
  };
  nodes.root.children.push(weekId);
  weekIds.push(weekId);
  for (const dayId of dayIds.slice(cursor, cursor + length)) {
    const refId = 'ref_w' + w + '_' + dayId;
    nodes[refId] = {
      id: refId, parentId: weekId,
      type: 'day', title: nodes[dayId].title,   // pointer's label mirrors its target
      data: {}, children: [],
      referenceId: dayId,                       // what makes it a pointer
    };
    nodes[weekId].children.push(refId);
  }
  cursor += length;
}

return { nodes, rootId: 'root' };
```

Paste the pair into the [generator modal](/docs/generator/generator-basics) — templates left, hierarchy right — and press **Preview**:

![Pasting the finished planner pair into the Hierarchy Generator and running it, ending on the visual preview](/docs-assets/generator/clip-planner-run.webp "Paste, Preview, and the sandbox returns the month in about a second")

The header reads 1 variant · 3 templates · **68 nodes · 37 estimated pages**: one month, 31 days, 5 weeks, and 31 reference nodes that are counted as nodes but never as pages. On the Month Page card, run the arithmetic against the pixels: January 1, 2026 has `getDay()` 4, the grid computes `4 − 1 = 3`, and day `01` sits in the fourth column — under the *second* `T` of `M T W T F S S`, Thursday's column — with three unbordered blanks to its left and W1–W5 down the right rail.

![The Generated Project Preview showing the month card with the calendar correctly offset, plus day and week cards](/docs-assets/generator/planner-preview.png "Day 01 three cells in — the offset math, visible")

From the preview's footer, **Create As New Project** names the result and opens it as a fresh tab, leaving the original project untouched ([Replace Current Project](/docs/generator/generator-basics#applying-the-result) is the other path). The month page lands on the canvas as a real, editable document — the calendar cells link to day pages, the rail links to weeks, and the sidebar shows the tree the loop built:

![The generated planner applied as a new project, month page on canvas with the sidebar hierarchy expanded](/docs-assets/generator/planner-month-canvas.png "Applied: January 2026 as an editable project, day 1 still exactly where Thursday belongs")

Where to take it: set `MONTH` to any other month (both scripts, one edit each) and every count, offset, week boundary, and label re-derives — February's Sunday start exercises the wraparound, August's sixth row fills in, and the formulas keep resolving because nothing was hand-counted. Loop `MONTH` over `0..11` inside a year root and you've re-derived the preset this chapter has been measuring itself against. Add a [config block with limits](/docs/generator/hierarchy-in-code#configurable-scripts) before sharing it, and remember the scripts [travel with the project](/docs/generator/generator-basics#scripts-travel-with-the-project) — anyone you hand the file to can regenerate, retarget, and extend the same planner from the same two scripts.
