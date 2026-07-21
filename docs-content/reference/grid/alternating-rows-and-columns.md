---
title: Alternating Rows and Columns
summary: Zebra-band a grid — Alternate Rows shades every other row, Alternate Columns every other column, each with one fill swatch.
aliases: zebra stripes, banding
keywords: alternate rows, alternateRows, alternateRowFill, alternate columns, alternateColumns, alternateColumnFill, zebra, banding, stripes
---

**Alternate Rows** (`alternateRows`) and **Alternate Columns** (`alternateColumns`) in Grid Formatting each shade every other row or column, each with a single fill swatch for its odd bands (`alternateRowFill`, `alternateColumnFill`). Like the header and first-column toggles, the switch alone does nothing until the fill is set.

**Alternate Rows quietly restarts its counting the row *after* the [header row](/docs/reference/header-row),** when one is on, so the header never doubles as a banded row too. **Alternate Columns gets no equivalent adjustment** from First Column — it always counts from the grid's real column 0 regardless. Build one on the planner's Month View calendar to see it: Header Row on the top week, Alternate Rows shading every other week beneath.

![June's Month View calendar with Header Row and Alternate Rows applied](/docs-assets/editor/grid-table-styling.png "Two toggles and two swatches make 30 day cells read like a table")

See [Table styling](/docs/editor/grids-basics-and-styling#table-styling).
