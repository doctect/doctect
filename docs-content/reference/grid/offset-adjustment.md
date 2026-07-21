---
title: Offset Adjustment
summary: The small +/- box that adds a fixed amount (often negative) to a dynamic offset's field value — the -1 that turns a Sunday-based weekday into a Monday-first calendar.
aliases: offset math, shift offset
keywords: offset adjustment, offsetAdjustment, plus minus, negative, dynamic offset, weekday_num, -1, monday first, shift
---

**Offset Adjustment** (the `offsetAdjustment` field) is the narrow **+/-** box that appears beside **Field Name** once Offset mode is **Dynamic (Field)**. It's an arithmetic amount — positive or **negative** — added to the value read from the [dynamic offset](/docs/reference/dynamic-offset) field before that sum becomes the offset. It does nothing in Static mode; it only ever modifies a dynamic field's value.

Its headline job is calendar alignment. `weekday_num` counts 0 for Sunday, but the planner's calendars read left-to-right as Monday…Sunday, so an adjustment of **`-1`** shifts every weekday one column left into a Monday-first layout. If a negative adjustment pushes the total below zero, the grid adds its column count back once to wrap it into range.

See [Dynamic offset, step by step](/docs/editor/grids-calendars-and-data-shaping#dynamic-offset-step-by-step).
