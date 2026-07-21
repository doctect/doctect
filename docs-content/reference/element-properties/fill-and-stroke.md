---
title: Fill and Stroke
summary: The two color controls at the top of every shape — Fill paints the interior, Stroke draws the border — each a swatch, a clear button, and a type dropdown.
aliases: fill color, stroke color, background color, border color, no fill
keywords: fill, stroke, fillType, strokeWidth, borderStyle, color, swatch, solid, none, appearance, interior, border
---

**Fill** and **Stroke** sit at the top of **Element Properties → Appearance**, one above the other, and share a shape: a color swatch, a small **✕** that clears it back to none, and a dropdown. Fill's dropdown chooses **Solid Color** or **Pattern** (the `fill` and `fillType` fields); Stroke's is followed by a width field and a style dropdown — **Solid**, **Dashed**, **Dotted**, **Double**, or **None** (the `stroke`, `strokeWidth`, and `borderStyle` fields). Fill paints the interior, Stroke draws the border around it.

![The Appearance section for a selected rectangle — Fill, Stroke, Per-Side Borders, Opacity, and Radius](/docs-assets/editor/properties-panel-shape.png "Fill and Stroke are the top two rows of this block")

A **Line** is the exception: it draws as a literal stroke between its two endpoints rather than a filled box, so Fill and Pattern have no visible effect on one — only Stroke does. Clearing Fill with the ✕ is not the same as choosing a white fill: it makes the interior genuinely transparent, so whatever sits behind the shape shows through.

See [Fills and patterns](/docs/editor/elements-and-properties#fills-and-patterns) and [Strokes and borders](/docs/editor/elements-and-properties#strokes-and-borders).
