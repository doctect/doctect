---
title: Data Slicing
summary: Final Data Subset trims a grid's child list to a window — skip the first Start Index children, then take at most Count of them.
aliases: slice, window, rows of seven, week rows
keywords: slice, data slice, dataSliceStart, dataSliceCount, final data subset, start index, count, window, subset
---

**Final Data Subset**, in **Grid Configuration** just above Display Template, is two boxes — **Start Index** (`dataSliceStart`) and **Count** (`dataSliceCount`) — that trim the child list to a window: skip the first `Start Index` children, then take at most `Count` of what's left (leave Count blank and it takes all of them, its `Count (All)` placeholder). The 2026 Planner uses this to split its root's seven children into two non-overlapping grids: a Quarters block (`Start Index: 0`, `Count: 4`) and a Weeks/Notes/To-Do block (`Start Index: 4`, `Count: 3`).

**Slicing runs before the offset, and a dynamic offset reads whatever lands at index 0 *after* the slice** — not the original first child. Slice a month down to "day 8 onward" while a dynamic `weekday_num` offset is still on, and the offset recomputes off day 8's weekday, not day 1's. If a sliced grid should start flush at column 0, switch it to a [Static](/docs/reference/static-offset) offset of 0 once sliced.

See [Slicing children into rows](/docs/editor/grids-calendars-and-data-shaping#slicing-children-into-rows).
