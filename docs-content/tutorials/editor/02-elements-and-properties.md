---
title: Elements & Properties
difficulty: beginner
time: 12 min
summary: Every element type and every property — fills and patterns, borders per side, typography, overflow, alignment tools.
keywords: rectangle, ellipse, triangle, line, text, fill, pattern, dots, border, opacity, typography, align, distribute, overflow
prerequisites: editor/canvas-basics
---

Last tutorial covered the tools that put shapes and text onto an empty page, plus the mechanics of moving around and selecting whatever you'd drawn — it never touched the right column. This one does nothing else: every property a shape, a line, or a block of text can carry, and the exact control the Element Properties panel gives you for each — grouped the way the panel itself groups them, not the way the underlying data happens to be ordered. Draw a shape (anything will do) and keep that panel open on the right; everything below assumes it's already showing something.

## The element types

| Type | What it's for |
| --- | --- |
| Rectangle | The default box shape — cards, backgrounds, table cells. Every control in this tutorial applies to it. |
| Ellipse | A circle or oval. Same controls as Rectangle, minus per-side borders (see below). |
| Triangle | Same as Ellipse — no per-side borders either. |
| Text | Holds actual content, a literal string or a `{{field}}` binding, plus the entire Typography section below. |
| Line | A straight line between two points. Carries one property nothing else has, `flip` — which way it leans, `\` or `/`. |
| Grid | A repeating grid bound to a list of nodes — its own tutorial later in this track. |
| SVG | Raw SVG markup, brought in through the toolbar's SVG Tools menu or edited directly in the panel's SVG Source section. |

Line is also the one type that ignores Fill and Pattern completely: it draws as a literal stroke between its two ends, not a filled box with a border, so only Stroke — next section — has any visible effect on one. And unlike everything else here, `flip` has no switch anywhere in the panel. It's decided by geometry: drag down-right or up-left while drawing and you get `\`; drag down-left or up-right and you get `/`. Grabbing an endpoint and dragging it past the other one flips it the same way, automatically, mid-resize.

## Fills and patterns

Select a rectangle and open **Element Properties → Appearance** — this section, and the next two, all live inside that one block in the panel, just split across separate headings here for clarity.

![The Appearance section of Element Properties for a selected rectangle: Fill, Stroke, Per-Side Borders, Opacity, and Radius](/docs-assets/editor/properties-panel-shape.png "Fill, Stroke, Per-Side Borders, Opacity, and Radius — everything covered in this tutorial's first three sections, all in one panel block")

[**Fill**](/docs/reference/fill-and-stroke) is a color swatch, a small **✕** next to it that clears the fill back to none, and a dropdown: **Solid Color** or **Pattern**.

Switch it to [Pattern](/docs/reference/pattern-fills) and two more controls appear: a dropdown offering **Horizontal Lines**, **Vertical Lines**, or **Dots**, and two number fields beside it, **Gap** and **Weight**. Gap sets the distance between repeats; Weight sets line thickness for the two line patterns, or dot diameter for Dots.

![Three rectangles showing the three pattern fills side by side: horizontal lines, vertical lines, and dots](/docs-assets/editor/pattern-fills.png "Horizontal Lines, Vertical Lines, and Dots — the three pattern fills this dropdown can select")

> [!NOTE]
> The underlying file format also defines a fourth, diagonal line pattern. It renders correctly wherever a project script sets it, but this dropdown doesn't currently offer it as a click-to-pick option — only the three above are reachable from the panel.

> [!TIP]
> Dots with a generous Gap makes a convincing bullet-journal dot grid — and unlike drawing that same grid as hundreds, or thousands, of individual dot elements, it's one rectangle with a pattern fill. The exported PDF stores one small repeating instruction instead of one draw command per dot, so the file stays small no matter how fine the grid looks on the page.

## Strokes and borders

**Stroke**, right below Fill, is the same swatch-plus-✕ shape, followed by a width field and a [style dropdown](/docs/reference/borders): **Solid**, **Dashed**, **Dotted**, **Double**, or **None**.

Below it, on rectangles, text boxes, and grids only — not ellipses, triangles, lines, or SVG — sits [**Per-Side Borders**](/docs/reference/per-side-borders). Click **Customize** and the single Stroke setting above splits into four independent ones, Top, Right, Bottom, Left, each seeded from whatever Stroke was showing at the moment you clicked. Click any of the four side icons to switch that side's border on or off, and once a side is on, its own color, width, and style controls appear next to it. **Reset to uniform** removes the whole per-side setup and hands control back to the single Stroke row.

> [!WARNING]
> Per-side borders don't add to the uniform Stroke — they replace it. The instant Customize is clicked, Stroke stops drawing anything by itself; only the sides you've explicitly switched on inside Per-Side Borders show a border at all, and a side you leave off shows *no* border, not a fallback to whatever Stroke was set to.
>
> Keep Stroke's own width above zero anyway, even after every side is customized: on a rectangle or text box, the exported PDF checks that global width — and color, and style — before drawing *any* border, per-side or not. The canvas preview has no such requirement, so a border that looks fine on screen can silently vanish from the PDF the moment Stroke's width drops to 0.

## Typography

Typography appears whenever the selection is one or more text elements (a grid gets a lighter version of the same overflow and wrap controls, for its cell text).

[**Auto width**](/docs/reference/auto-width), at the top, only shows for a text-only selection. Switch it on and the box resizes to fit whatever's typed, growing and shrinking as you edit it; switch it off and it goes back to a fixed size again.

Below the text box itself sits the [font row](/docs/reference/typography-controls) — a searchable **font family** picker (click it, then type to filter a long list), a **size** field in points, and a **text color** swatch — then three independent toggle buttons: **Bold**, *Italic*, and **Underline**. There's a fourth text-decoration value in the underlying format, strikethrough, but nothing in this row sets it; it only ever arrives through a hand-written generator script.

Next, [**Overflow**](/docs/reference/text-overflow) — what happens when text doesn't fit a fixed-size box:

| Mode | What happens |
| --- | --- |
| Clip | Text past the edge is cut off, with nothing marking that it happened. |
| Ellipsis | Cut off the same way, but the last visible line ends in "…". |
| Shrink | The font size shrinks automatically, just enough that everything fits. |
| Visible | Nothing is cut off — text spills out past the box's own edges instead. |

**Wrap**, the checkbox right beside it, turns line-wrapping on or off; off, everything stays on one line no matter how wide the box is. Both controls only mean something for a fixed-size box — turn Auto width on and they grey out, with the panel explaining why in a note underneath, since a box that resizes to its own content never has anything left over to overflow.

Align and vertical align share the next row, split by a thin divider: three buttons for horizontal (Left, Center, Right), three for vertical (Top, Middle, Bottom). These control only how text sits inside its own box — don't confuse them with the toolbar's [alignment buttons](/docs/reference/alignment-tools), later in this tutorial, which move whole shapes relative to each other and happen to reuse very similar icons. A freshly drawn text box starts out Center/Middle, not the Left/Top you might expect. The horizontal Align choice — like everything on the font row above it — is remembered in this browser and becomes the default for the next text box you draw; vertical alignment is not remembered, so every new text box starts at Middle no matter what you set last time.

[**Padding**](/docs/reference/text-padding), at the bottom, is four number fields, Top, Right, Bottom, Left, with a link icon that — on by default — keeps all four moving together whenever you change one. It's disabled under the exact same condition as Overflow and Wrap: Auto width has to be off first.

> [!TIP]
> Skip the panel's text box entirely and double-click a text element right on the canvas instead — it drops you straight into editing with a real cursor, the same as when the Text tool first creates one. Click elsewhere, or press `kbd:Escape`, to commit whatever you typed and stop editing.

## Rotation, opacity, stacking

Back in Geometry, alongside the X/Y/W/H fields from resizing by hand, sit two more: **Rot**, in degrees, and **Z-Index**, with its own pair of nudge buttons, **Bring Forward** and **Send Backward**.

[Rotation](/docs/reference/rotation-and-transform-origin) always turns a shape around its transform origin — the same pivot point you dragged in [Canvas Basics](/docs/editor/canvas-basics) to move a shape's center of rotation off-center. That point is stored as a pair of normalized coordinates, 0 to 1 across the shape's own width and height, defaulting to dead center, `{0.5, 0.5}`, until the pivot handle is dragged somewhere else. There's no numeric field for it in the panel — the canvas handle is the only control.

[Z-Index](/docs/reference/z-index) breaks ties within a single layer only: it decides stacking order among elements that share a layer, not across the whole page. Layers themselves, and how they interact with Z-Index, are their own tutorial later in this track.

[**Opacity**](/docs/reference/opacity) and **Radius** share the row just below Per-Side Borders: Opacity is a slider from 0 to 1 (1 is fully opaque), and Radius is a plain number that rounds a rectangle's corners.

## Aligning and distributing

Select two or more elements — shift-click each one, or drag a marquee across all of them — and the toolbar above the canvas grows a new button group: eight buttons in three clusters, Align Left / Center / Right, Align Top / Middle / Bottom, and Distribute Horizontally / Vertically. Nothing appears with fewer than two things selected; there's nothing to align relative to yet.

![Three rectangles first snapping their top edges into a line, then spreading out with equal horizontal gaps](/docs-assets/editor/clip-align-distribute.webp "Align Top, then Distribute Horizontally, on a three-rectangle selection")

The six Align buttons work off the whole selection's bounding box, not pair by pair: **Align Left** moves every selected shape to match whichever one already sits furthest left; **Align Right** matches whichever sits furthest right; **Align Center** splits the difference, lining every shape's center up on the midpoint between those two extremes. **Top / Middle / Bottom** repeat the same idea vertically.

**Distribute Horizontally** and **Distribute Vertically** space everything evenly between the two outermost shapes, which stay exactly where they are — only the ones in between move, shifted just enough to make every gap between neighbors equal.
