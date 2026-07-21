---
title: Grid Tool
summary: Draws a data grid — a repeating block of cells, one per child of a source node.
aliases: data grid, table tool
keywords: grid, data grid, table, cells, source, cols, repeat, g
---

The **Data Grid** tool (`kbd:G`) draws a grid: press, drag, release like any shape, and PDF Architect fills it with one cell per child of its source node, wrapped into rows and columns. It sits at the right end of the drawing tools in the [toolbar](/docs/editor/canvas-basics#the-toolbar).

The sizing gotcha: a grid element's own `w` and `h` are **one cell's** dimensions, never the whole grid's. Total footprint is `cols × cellWidth + gaps` wide by `rows × cellHeight + gaps` tall, and there is no "Rows" field — the row count is however many `Cols`-sized groups the child count divides into. A brand-new grid shows six placeholder cells ("Item 1"–"Item 6") until you point it at real children; a grid pointed at a childless node exports **zero** cells, not six.

Every cell is automatically a link to the child it represents — no setup required. See [What a grid is](/docs/editor/grids-basics-and-styling#what-a-grid-is), then [Choosing the source](/docs/editor/grids-basics-and-styling#choosing-the-source).
