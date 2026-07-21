---
title: First Column
summary: Re-styles the real cells that land in a grid's column 0 — the column analogue of Header Row, and it wins the top-left corner when both are on.
aliases: row labels
keywords: first column, firstColumn, firstColumnFill, firstColumnTextColor, firstColumnFontWeight, column 0, row labels, restyle
---

**First Column** (the `firstColumn` toggle) in Grid Formatting works exactly like [Header Row](/docs/reference/header-row), one column instead of one row: its **Fill**, **text color**, and **Bold** swatches (`firstColumnFill`, `firstColumnTextColor`, `firstColumnFontWeight`) restyle whichever real cells land in column 0. Like Header Row, the toggle does nothing visible until at least one swatch is set, and it **re-styles existing cells rather than inserting a label column** — any row-label text must come from the source data.

Where header row and first column overlap — the top-left corner — **First Column wins**, because it's applied after Header Row, so its fill and text color are the ones that show.

See [Table styling](/docs/editor/grids-basics-and-styling#table-styling).
