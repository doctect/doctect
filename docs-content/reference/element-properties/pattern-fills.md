---
title: Pattern Fills
summary: Switch a shape's Fill from Solid Color to Pattern for horizontal lines, vertical lines, or dots, with Gap and Weight setting spacing and thickness.
aliases: dots, lines pattern, bullet journal, dotted background
keywords: pattern, patternType, lines-h, lines-v, dots, patternSpacing, patternWeight, gap, weight, bullet journal, dot grid, hatching
---

Set **Fill**'s dropdown (in **Element Properties → Appearance**) to **Pattern** and two more controls appear: a pattern-type dropdown offering **Horizontal Lines**, **Vertical Lines**, or **Dots** (the `patternType` field, values `lines-h`, `lines-v`, `dots`), plus two number fields — **Gap** (`patternSpacing`, the distance between repeats) and **Weight** (`patternWeight`, line thickness for the two line patterns, or dot diameter for Dots).

![Three rectangles showing horizontal lines, vertical lines, and dots side by side](/docs-assets/editor/pattern-fills.png "The three pattern fills the dropdown can select")

Dots with a generous Gap makes a convincing bullet-journal dot grid, stored as one small repeating instruction rather than thousands of individual dot elements, so the exported PDF stays tiny no matter how fine the grid looks. **One honest gap:** the file format also defines a fourth, diagonal-line pattern (`lines-d`), and it renders correctly wherever a generator script sets it — but this dropdown does not offer it as a click-to-pick option. Only the three patterns above are reachable from the panel.

See [Fills and patterns](/docs/editor/elements-and-properties#fills-and-patterns).
