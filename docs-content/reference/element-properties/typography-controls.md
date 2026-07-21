---
title: Typography Controls
summary: The font row, Bold / Italic / Underline toggles, and the two alignment triplets that appear whenever a text element is selected.
aliases: font, bold, italic, align, vertical align
keywords: typography, font, fontFamily, fontSize, textColor, fontWeight, bold, fontStyle, italic, underline, textDecoration, align, verticalAlign, alignment
---

Typography appears whenever the selection is a text element (a grid gets a lighter version for its cell text). The **font row** holds a searchable **font family** picker (`fontFamily` — click it, then type to filter), a **size** field in points (`fontSize`), and a **text color** swatch (`textColor`), followed by three independent toggles: **Bold** (`fontWeight`), *Italic* (`fontStyle`), and **Underline** (`textDecoration`). A fourth decoration, strikethrough, exists in the format but no button sets it — it only arrives via a generator script. The next row splits, by a thin divider, into two alignment triplets: horizontal **Align** — Left / Center / Right (`align`) — and vertical align — Top / Middle / Bottom (`verticalAlign`). These position text *inside its own box*; don't confuse them with the toolbar's align buttons, which move whole shapes.

A freshly drawn text box starts **Center/Middle**, not the Left/Top you might expect. **The two alignment axes are remembered differently:** the horizontal Align choice — like everything on the font row — is saved in this browser and becomes the default for your next text box, but **vertical alignment is not remembered**, so every new box starts at Middle no matter what you last set.

See [Typography](/docs/editor/elements-and-properties#typography).
