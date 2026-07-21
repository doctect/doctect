---
title: Unit Selector
summary: The pt / px / in / mm dropdown on the page-size fields converts rather than relabels — templates are stored in points, and every other unit re-expresses that same physical size.
aliases: units, page size units, pt px in mm, measurement units, mm, inches
keywords: unit selector, units, pt, px, in, mm, points, pixels, inches, millimeters, page size, width, height, conversion, template settings
---

**Template Settings** (the right panel in Templates mode) holds the page-size controls: a device-preset dropdown, **Width**/**Height** inputs with the **pt / px / in / mm** unit selector, and Portrait/Landscape buttons. The selector *converts* — it doesn't relabel. Templates are stored in points, and the other units re-express the same physical size:

| Unit | Points per unit |
| --- | --- |
| pt | 1 |
| px | 1 (treated 1:1 with pt) |
| in | 72 |
| mm | ~2.83465 |

Switch an A4 page from pt to mm and the fields change from 595.28 × 841.89 to 210 × 297 (give or take display rounding) while the page itself doesn't move a hair. Type a value in any unit and it converts back on entry, so "make it exactly 210 mm wide" is just: pick mm, type 210. The two toggles below the size fields — Auto-Reflow Elements and Scale Typography — govern what happens to *content* when the dimensions change, not what the numbers are labeled in.

See [Page dimensions and units](/docs/editor/variants-svg-json-export#page-dimensions-and-units).
