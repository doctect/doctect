---
title: Grid Columns and Gaps
summary: Cols sets how many cells fit per row before wrapping; Gap X and Gap Y space the columns and rows. There is no Rows field — and the element's own size is ONE cell.
aliases: cols, gap, cell size, spacing
keywords: cols, columns, gapX, gapY, gap, rows, cell size, spacing, wrap, one cell, footprint
---

Two settings in **Grid Configuration** decide a grid's layout: **Cols** (`cols`, cells per row before wrapping to a new one) and **Gap X** / **Gap Y** (`gapX` and `gapY`, the pixel spacing between columns and between rows, set independently). There is **no "Rows" field** — the row count is simply however many `cols`-sized groups the child count divides into. Fewer columns means more rows; the same cells just arrange differently.

**The element's own `w` and `h` are ONE cell's dimensions, never the whole grid's.** Resize the grid in Geometry and every cell resizes with it, but the total footprint is always `cols × cellWidth + gaps` wide by `rows × cellHeight + gaps` tall. The 2026 Planner's Year View quarters-grid is stored as `w: 180, h: 60` yet renders as a 2×2 block roughly 380×120 — two cells across and two down, plus the gap. Size a grid by its cell, not by the area you want it to cover.

![A grid on the Month View template reflowing as the Cols field changes](/docs-assets/editor/clip-grid-cols.webp "Only Cols changed — same 31 cells, arranged differently")

See [Columns, gaps, display field](/docs/editor/grids-basics-and-styling#columns-gaps-display-field) and the one-cell warning in [What a grid is](/docs/editor/grids-basics-and-styling#what-a-grid-is).
