---
title: Static Offset
summary: A fixed number of empty cells inserted before the first real item — the simple half of the Offset control, and the fallback a dynamic offset degrades to.
aliases: offset start, empty cells
keywords: offset, offsetStart, static, offsetMode, empty cells, skip, leading blanks, advance, fallback
---

**Offset (Skip items)**, in **Grid Configuration** below Display Template, has a number box and a mode dropdown of **Static** or **Dynamic (Field)**. In **Static** mode (`offsetMode: 'static'`), the number box (`offsetStart`) is how many empty cells to insert before the first real item — unconditionally, every render. That's the right tool when the blank-cell count never changes, like a menu that always skips one fixed slot. An offset shifts the *entire* sequence, not just the first item.

**`offsetStart` doubles as the fallback for a [dynamic offset](/docs/reference/dynamic-offset):** when Dynamic mode can't resolve its field, the grid quietly uses whatever this Static number holds (`0` if untouched). Those leading blank cells are real slots with no child — invisible unless [Empty Cell Borders](/docs/reference/empty-cell-borders) is on.

See [Dynamic offset, step by step](/docs/editor/grids-calendars-and-data-shaping#dynamic-offset-step-by-step).
