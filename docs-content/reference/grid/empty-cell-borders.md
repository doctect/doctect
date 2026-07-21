---
title: Empty Cell Borders
summary: Draws borders on a grid's empty offset slots — the leading blanks before day 1 in a calendar — so an offset is visible instead of invisible whitespace.
aliases: show empty cells, offset cells
keywords: empty cell borders, showEmptyCellBorders, offset cells, leading blanks, empty slots, calendar offset, debug
---

**Empty Cell Borders** (the `showEmptyCellBorders` toggle, off by default) in Grid Formatting draws the border for slots that have no real cell in them — like the leading blanks before day 1 in an [offset](/docs/reference/dynamic-offset) calendar. Leave it off and those slots stay invisible whitespace; switch it on and they get a border like every populated cell. It's hidden entirely in No Borders mode, since there's no border to extend.

Its most useful job is diagnostic: bordered-but-empty cells confirm an offset landed where you expect, and they tell an *offset* grid apart from an *empty* one at a glance — bordered blanks mean the offset is working, while no cells anywhere means the source itself has no children after traversal and slicing.

See [Table styling](/docs/editor/grids-basics-and-styling#table-styling).
