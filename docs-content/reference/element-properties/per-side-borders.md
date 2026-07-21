---
title: Per-Side Borders
summary: Split the single Stroke into four independent Top / Right / Bottom / Left borders — available on rectangles, text boxes, and grids only.
aliases: border sides, top border only
keywords: per-side, borderSides, top, right, bottom, left, customize, reset to uniform, one side, underline border
---

**Per-Side Borders** sits below Stroke on rectangles, text boxes, and grids only — never ellipses, triangles, lines, or SVG. Click **Customize** and the single Stroke splits into four independent controls, **Top**, **Right**, **Bottom**, **Left** (the `borderSides` field), each seeded from whatever Stroke was showing when you clicked. Click a side's icon to turn that border on or off; once on, its own color, width, and style appear. **Reset to uniform** clears the whole setup and hands control back to the single Stroke row. This is how you draw, say, a single bottom rule under a heading box.

**Per-side borders replace the uniform Stroke — they don't add to it.** The instant Customize is clicked, Stroke stops drawing anything by itself; a side you leave off shows *no* border, not a fallback to whatever Stroke held. **And keep Stroke's own width above zero even after customizing:** on export, the PDF checks that global width before drawing *any* per-side border, so a border that looks fine on the canvas silently vanishes from the PDF the moment Stroke's width drops to 0.

See [Strokes and borders](/docs/editor/elements-and-properties#strokes-and-borders).
