---
title: Header Row
summary: Re-styles the real cells that land in a grid's row 0 — it never inserts a new label row, so the header text must come from the source data.
aliases: table header
keywords: header row, headerRow, headerRowFill, headerRowTextColor, headerRowFontWeight, table header, row 0, restyle
---

**Header Row** (the `headerRow` toggle) in Grid Formatting, plus its own **Fill**, **text color**, and **Bold** swatches (`headerRowFill`, `headerRowTextColor`, `headerRowFontWeight`), styles the grid's first row. The toggle alone changes nothing visible: it stages row 0 for special treatment, but until at least one swatch is set, that row renders in the same colors as every other cell — the switch and the color are two separate steps.

**The key gotcha: Header Row re-styles whichever real cells already land in row 0 — it never adds a synthetic row of column labels.** A calendar's top week is still seven real days; turning Header Row on just paints them. If the header should actually *say* "Sun, Mon, Tue…", that text has to come from the source data itself — the toggle supplies formatting, never content. Where a cell is in both the header row and the [first column](/docs/reference/first-column), First Column wins (it's applied second).

See [Table styling](/docs/editor/grids-basics-and-styling#table-styling).
