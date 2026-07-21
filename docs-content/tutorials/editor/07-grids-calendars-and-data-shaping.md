---
title: Grids II — Calendars, Offsets, and Data Shaping
difficulty: advanced
time: 14 min
summary: Dynamic weekday offsets for real calendars, slicing children into rows, and traversal paths that reach grandchildren.
keywords: calendar, offset, dynamic offset, dayOfWeekNum, slice, traversal, month grid, weekday
prerequisites: editor/grids-basics-and-styling
---

[Grids I](/docs/editor/grids-basics-and-styling) covered a grid's everyday shape: pick a source, set a column count, make it look like a table. That's the whole story for a nav-menu strip or a short list of links. It isn't the whole story for the 2026 Planner's own calendars — Month View's full month grid, Quarter View's three mini calendars, and others besides, every one of them a grid you've been looking at since [Your First Document from a Preset](/docs/getting-started/first-project-from-preset) — because a calendar has a constraint a nav menu never does: day 1 has to land under the *correct* day-of-week column, and that column is a different one every month. This tutorial covers what closes that gap: a [dynamic offset](/docs/reference/dynamic-offset) that computes where day 1 belongs instead of a hand-typed number, a data slice that trims a child list down to a window, and a traversal path that reaches a grid's grandchildren instead of stopping at its direct children — the real mechanism behind those calendars, walked through with their actual, shipped configuration.

## The calendar problem

Open the 2026 Planner, switch the sidebar to **Templates**, click **Month View**, and use **Preview:** to land on **January**. The calendar fills in immediately — 31 real day cells, one per day node in January — because that grid is already there, already pointed at the month's own children, exactly the way [Grids I](/docs/editor/grids-basics-and-styling) described. Look at the shape it actually takes, though: the 1st doesn't sit in the calendar's top-left cell. There are three blank cells before it.

That's not a bug sitting in front of you — it's the exact problem this tutorial exists to solve. A grid's own layout math has no idea what "day of the week" means; it just lays children out left to right, `cols` at a time, starting at cell 0. Left alone, a fresh grid always puts its first child in cell 0 — column 0, row 0 — every time. Both calendars that actually spell out a day-of-week header — Month View's, and each of Quarter View's three mini months — read left to right as `M T W T F S S`: column 0 is Monday, column 6 is Sunday. So a grid with nothing telling it otherwise starts every month as if it began on a Monday. January 1, 2026 didn't. [Data Binding](/docs/editor/data-binding)'s own field table already handed you the fact this tutorial cashes in: January 1 carries `weekday_num: 4`, and `weekday_num` counts 0 for Sunday through 6 for Saturday — 4 is Thursday. Drop January's 31 days into a plain, unmodified grid and every date ends up exactly three columns short of where a real wall calendar puts it. Not off by some random, useless amount — off by a specific, computable number that changes every month.

Computing that number instead of retyping a different magic value onto every month's grid by hand is exactly what a dynamic offset is for.

## Dynamic offset, step by step

Select that same January calendar on the canvas (`kbd:V` for Select, then click it) and open **Element Properties → Grid Configuration**. Below **Display Template** sits a row labeled **Offset (Skip items)**, with a small **(Advance)** note beside it: a number box, then a mode dropdown reading **Static** or **Dynamic (Field)**. Switching to Dynamic reveals two more boxes underneath — **Field Name** and a narrow [**+/-** box](/docs/reference/offset-adjustment).

[**Static**](/docs/reference/static-offset) is the simple half: the number box is how many empty cells to insert before the first real item, unconditionally, every time. That's the right tool for something whose blank-cell count never changes — a menu grid that always needs to skip one fixed slot, say.

A calendar's blank-cell count isn't fixed like that — it's a different number every month. This is the January calendar's real, shipped configuration, unchanged:

```json
{
  "cols": 7,
  "gapX": 2,
  "gapY": 2,
  "sourceType": "current",
  "displayField": "day_num",
  "offsetMode": "dynamic",
  "offsetField": "weekday_num",
  "offsetAdjustment": -1
}
```

![The Grid Configuration panel's Offset row, cropped to show Offset Mode set to "Dynamic (Field)" with Field Name "weekday_num" and an adjustment of -1](/docs-assets/editor/grid-offset-config.png "The planner's own Month View calendar, exactly as shipped — three fields, not a hand-typed number")

In Dynamic mode, PDF Architect looks at the grid's own first item — the first day this particular calendar is actually about to render — reads whatever's in that node's `weekday_num` field, parses it as a number, and adds `offsetAdjustment`. That sum becomes the offset, replacing whatever the Static number box holds (which becomes a fallback — more on that below, not the active value). For January: `weekday_num` is `4`, the adjustment is `-1`, so the offset is `3` — three blank cells, day 1 in column 3, Thursday's column. Nothing about the number `3` lives anywhere in this grid's own configuration; it's recomputed fresh every time from the day node's own data.

The same three fields, completely unchanged, produce a different offset for every month, because they read a different first day's `weekday_num` each time:

| Month (2026) | Day 1 falls on | `weekday_num` | `+ (-1)` | Result |
| --- | --- | --- | --- | --- |
| January | Thursday | 4 | 3 | 3 blank cells; day 1 in column 3 |
| June | Monday | 1 | 0 | 0 blank cells; day 1 in column 0 |
| February | Sunday | 0 | -1 | negative — see below |

February is the interesting row. `0 + (-1)` is `-1`, and there's no such thing as column -1. PDF Architect's fix is a single wraparound: a negative offset gets the grid's own column count (`7`) added back to it exactly once — `-1 + 7 = 6` — landing February 1st in column 6, Sunday's column, which is correct. (It's a *single* addition, not a true modulo: an adjustment negative enough to still be below zero after adding one column count back would come out wrong. `weekday_num`'s own range, 0 through 6, combined with the shipped `-1` adjustment, never manages that — the most negative the raw sum ever gets is `-1`.)

Watch that recomputation happen live — same grid, same three fields, `offsetMode` flipped between the two values you saw in the panel above and nothing else touched:

![The January calendar grid reflowing as Offset Mode switches from Static (day 1 forced into column 0) to Dynamic (day 1 correctly shifting to column 3)](/docs-assets/editor/clip-dynamic-offset.webp "Same 31 days, same source, same columns — only the offset changed")

Every cell after the first shifts too, not just day 1 — an offset moves the *entire* sequence by the same amount. January's 31 real days plus a 3-cell offset is 34 slots, five rows of 7; the same 31 days at a 0 offset is 31 slots, still five rows — the row count doesn't always change, but what lands in each row does.

> [!NOTE]
> Point `offsetField` at a name that doesn't exist on that first day node — a typo, or a field real elsewhere but not there — or at one whose value isn't a number, and Dynamic mode doesn't error and doesn't show a broken `NaN`. It quietly keeps whatever the **Static** box is already set to (`0`, if you never touched it), exactly as if Dynamic had never been switched on for this render. A dynamic offset that stops resolving degrades to no offset at all, never to a crash.

> [!NOTE]
> Those blank leading cells are real cells — they occupy real row/column slots, they just have no child in them. [Grids I](/docs/editor/grids-basics-and-styling)'s **Empty Cell Borders** toggle (off by default) is what decides whether they're drawn: leave it off and January's three leading blanks are invisible whitespace, indistinguishable from a grid with no offset at all unless you already know to expect them; switch it on and those same three slots get a real border, same as every populated cell — a fast way to confirm an offset landed where the table above says it should, without opening the panel at all.

## Slicing children into rows

Not every grid wants everything its source has to offer. Directly below **Deep Traversal** — and above **Display Template** — sits [**Final Data Subset**](/docs/reference/data-slicing): two boxes captioned **Start Index** and **Count**, placeholder text `Start (0)` and `Count (All)` showing what an empty box already defaults to. These map straight onto `dataSliceStart` and `dataSliceCount`: skip the first `Start Index` children, then take at most `Count` of whatever's left (leave `Count` blank and it takes all of them).

You've already seen this in action without the mechanism being named. [Grids I](/docs/editor/grids-basics-and-styling) opened by pointing out that the Year View page carries two separate grids, both reading the exact same seven children off the Planner's own root — one showing "Quarter 1" through "Quarter 4," the other showing "Weeks," "Notes," and "To-Do Lists." Here's how one root's seven children becomes two different, non-overlapping windows, in the shipped preset's own real numbers:

| Grid | Start Index | Count | Shows |
| --- | --- | --- | --- |
| Quarters block | `0` | `4` | children 0–3: Quarter 1, Quarter 2, Quarter 3, Quarter 4 |
| Weeks/Notes/To-Do block | `4` | `3` | children 4–6: Weeks, Notes, To-Do Lists |

Same source, same seven children, two disjoint slices of the same list.

> [!WARNING]
> A data slice and a dynamic offset can interact in a way that's easy to get backwards. Dynamic offset doesn't read the grid's *original* first child — it reads whichever item ends up at index 0 *after* slicing runs (slicing happens first). Slice a month's days down to "day 8 onward" (`Start Index: 7`) while `offsetMode` is still `dynamic` reading `weekday_num`, and the offset recomputes off day 8's own weekday, not day 1's — the grid shifts to wherever day 8 belongs on a full calendar, not a clean, flush-left start the way a "just show week 2" slice might suggest. If a sliced-down grid needs to start flush at column 0 regardless of what real weekday its first visible item falls on, switch that grid back to a **Static** offset of `0` once it's sliced.

## Traversal: grids over grandchildren

Every grid so far has drawn from its source's *direct* children. [**Deep Traversal**](/docs/reference/traversal-path), just above Final Data Subset in the same panel, is for reaching further down: one **+ Add Level** click per generation you want to descend, each level adding a row with its own **Start**/**Count** pair. Leave it empty — the panel's own placeholder text reads "Direct children only" — and a grid behaves exactly like every grid up to this point.

Add a level, and the rule is: take every node currently in play, fetch *its* children, slice them with that level's own Start/Count, and pool the results from every one of those parents together before handing the combined list to the next level (if there is one). One level reaches children, same as no traversal path at all — the difference only shows up at two levels or more, because the second level's slice runs once *per node* the first level produced, not once overall.

The clearest real example is already sitting in the Quarter View template. Open **Quarter View** and land **Preview:** on **Quarter 1** — the page shows three small calendars side by side, one per month in that quarter. Each one is an ordinary 7-column grid pointed at the quarter itself (`sourceType: "current"`), reaching two levels down through a two-step traversal path. This is the first month's real, shipped configuration, unchanged:

```json
{
  "cols": 7,
  "gapX": 0,
  "gapY": 0,
  "sourceType": "current",
  "displayField": "day_num",
  "offsetStart": 0,
  "traversalPath": [
    { "sliceStart": 0, "sliceCount": 1 },
    { "sliceStart": 0 }
  ],
  "offsetMode": "dynamic",
  "offsetField": "weekday_num",
  "offsetAdjustment": -1
}
```

(That `offsetStart: 0` sitting right there next to a Dynamic offset is the fallback value from the NOTE two sections back, made visible — harmless, and never read while Dynamic keeps resolving successfully.)

Worked step by step, starting from Quarter 1 itself as the grid's source:

| Step | Runs against | Start / Count | Produces |
| --- | --- | --- | --- |
| *(source)* | Quarter 1 | — | 1 node: Quarter 1 |
| 1 | Quarter 1's children (its 3 months) | `0` / `1` | 1 node: January |
| 2 | January's children (its 31 days) | `0` / *(blank = all)* | 31 nodes: January 1 – January 31 |

Two steps, and a grid nominally sourced from a *quarter* ends up full of that quarter's grandchildren — real days — with the same dynamic offset from the previous section still doing its usual job on top of whatever traversal handed it. The other two mini-calendars on the same page are the identical two-step shape with exactly one number changed: step 1's `sliceStart` is `1` for the second month, `2` for the third. Swap which month of the quarter a traversal reaches by changing a single index, nothing else.

![The Quarter View template with a traversal-configured grid selected, canvas showing a real populated mini-calendar and the Properties panel's Deep Traversal section with its two steps](/docs-assets/editor/grid-traversal-example.png "Two traversal steps: pick one month, then take all of its days")

The same rule extends past two steps the same way: add a third level *ahead* of these two — sliced down to one quarter (`sliceStart: 0, sliceCount: 1`, out of the Planner root's first four children) — and the identical mechanism reaches from the root all the way down to a single day, three generations instead of two. Nothing about the rule changes; there's just one more level pooling and slicing before the last one runs.

Traversal, Final Data Subset, and Offset all compose, always in the same order: traversal runs first, then Final Data Subset slices whatever traversal produced, and Offset is computed last of all — against whichever single item ends up at index 0 once both of those have already run. Layer a Final Data Subset of `Start Index: 0`, `Count: 7` on top of the configuration above and the same two-step traversal still reaches all 31 of January's days first; the slice then trims that down to just the first seven, a single week, before the dynamic offset (reading that new index-0 item, per the WARNING above) does its own pass last.

## Debugging a grid

**The preview node is what "current" means.** Every offset, slice, and traversal step in this tutorial resolves against whichever node is actually rendering the page right now — in Templates mode, that's the **Preview:** selector. Switch Quarter View's preview from Quarter 1 to Quarter 2 and every one of its three mini-calendars' traversal paths re-runs against Quarter 2's own three months instead, with no edit to a single grid's configuration. If a grid looks wrong, check what it's actually previewing before touching a field.

**An empty grid and an offset grid can look identical, and that's the point to watch for.** A grid whose source genuinely has zero children after traversal and slicing shows six placeholder "Item" cells in the editor only — [Grids I](/docs/editor/grids-basics-and-styling)'s own established mock-data affordance, there purely so you're not staring at a blank rectangle while you set the grid up — and renders nothing at all once exported. A grid with real children but a large offset can look similarly sparse, mostly blank space up top, for a completely different reason. Turning on Empty Cell Borders (the earlier NOTE) tells the two apart instantly: bordered-but-empty cells mean an offset is working as intended; no cells anywhere, bordered or not, means the source is empty.

**A traversal step that overshoots produces silence, not an error.** A `sliceStart` past however many children a node actually has just returns nothing at that level — no warning, no console error, an empty result that quietly produces an empty grid however many levels down. If a traversal-based grid comes up blank, check the *source* node's real children in the Hierarchy panel first: confirm the node the grid is actually pointed at has as many children as each traversal step assumes, at every level, before suspecting the grid's own configuration.
