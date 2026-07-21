---
title: Grid Border Modes
summary: Cell Border Mode — All, Outside, Inside, or None — controls the lines between and around a grid's cells, a system entirely separate from the element's own Stroke.
aliases: all outside inside none, cell borders
keywords: cell border, gridBorderMode, all, outside, inside, none, grid border, gridBorderColor, gridBorderWidth, gridBorderStyle, cell lines
---

**Cell Border Mode** (the `gridBorderMode` field, default `'all'`), in the Grid Formatting block, controls the lines between and around individual cells — a system entirely separate from the element's own Stroke, which draws once around the grid's whole outer footprint.

| Mode | Draws a border on... |
| --- | --- |
| All Borders (`'all'`) | Every edge of every cell |
| Outside Only (`'outside'`) | Only the grid's outer rectangle — no lines between cells |
| Inside Only (`'inside'`) | Only edges shared between neighboring cells |
| No Borders (`'none'`) | Nothing, whatever the color or width below |

In every mode but None, a **Cell Border** row sets the look — color, width, style, radius — via `gridBorderColor`, `gridBorderWidth`, `gridBorderStyle`, `gridBorderRadius`, none of which write back to the element's Stroke. **The width gotcha:** a freshly drawn grid *displays* a number borrowed from Stroke Width (usually 1), but the stored value stays `0` until you touch the field, so a new grid shows no cell borders no matter which mode is picked. Mode only decides *where* a border could go; type a width to make one actually exist.

See [Table styling](/docs/editor/grids-basics-and-styling#table-styling).
