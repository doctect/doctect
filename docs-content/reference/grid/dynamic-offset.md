---
title: Dynamic Offset
summary: Computes how many cells to skip from a field on the grid's first item instead of a hand-typed number — the mechanism that lands day 1 under the right weekday every month.
aliases: calendar offset, weekday offset, offset mode, dayOfWeekNum
keywords: dynamic offset, offsetMode, offsetField, offsetAdjustment, weekday_num, calendar, dayOfWeekNum, skip, wrap, monday first
---

Set **Offset**'s mode dropdown to **Dynamic (Field)** (`offsetMode: 'dynamic'`) and two boxes appear: **Field Name** (`offsetField`) and a narrow **+/-** box (`offsetAdjustment`). PDF Architect reads that field off the grid's *first item*, parses it as a number, adds the adjustment, and uses the sum as the offset — recomputed fresh every render, so the same three fields land day 1 correctly under a different weekday every month. If the field is missing or non-numeric, it silently degrades to the [Static](/docs/reference/static-offset) fallback, never a crash.

The 2026 Planner's month calendars ship exactly this, and it's the recipe to copy for any Monday-first calendar:

```json
{
  "cols": 7,
  "offsetMode": "dynamic",
  "offsetField": "weekday_num",
  "offsetAdjustment": -1
}
```

`weekday_num` counts 0 (Sunday) to 6 (Saturday); the `-1` shifts it to a Monday-first grid. January 1, 2026 is a Thursday (`weekday_num: 4`), so `4 + (-1) = 3` — three blank cells, day 1 in column 3. **The negative case wraps once:** February 1 is a Sunday (`0`), giving `0 + (-1) = -1`, and a negative offset gets the column count added back exactly once — `-1 + 7 = 6`, Sunday's column. It's a single `+cols` wrap, not a true modulo, but `weekday_num`'s 0–6 range with the `-1` adjustment never goes lower than `-1`, so one wrap always suffices.

![The Grid Configuration Offset row set to Dynamic with field weekday_num and adjustment -1](/docs-assets/editor/grid-offset-config.png "The planner's shipped Month View calendar — three fields, not a magic number")

See [Dynamic offset, step by step](/docs/editor/grids-calendars-and-data-shaping#dynamic-offset-step-by-step).
