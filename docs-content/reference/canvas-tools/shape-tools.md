---
title: Shape Tools
summary: Rectangle, Ellipse, Triangle, and Line — the geometric drawing tools, and the click-drag-to-create rule they all share.
aliases: rectangle, ellipse, circle, triangle, line
keywords: shape, rectangle, ellipse, circle, triangle, line, draw, r, e, y, l
---

Four tools draw plain geometry: **Rectangle** (`kbd:R`), **Ellipse** / circle (`kbd:E`), **Triangle** (`kbd:Y`), and **Line** (`kbd:L`). Each lives in the [toolbar](/docs/editor/canvas-basics#the-toolbar) and creates its shape the same way — press at one corner, drag to the opposite corner, release.

A bare click creates **nothing**: a press-and-release without dragging (or a drag of only a point or two) is thrown away and the tool resets, waiting for a real drag. This is the most common first-time snag — expecting a default-sized shape from one click and getting an empty canvas. Just drag. Once a shape lands it is selected automatically, but the tool stays active, so dragging again draws a *second* shape rather than moving the first.

A Line is the odd one out: it ignores Fill entirely (only Stroke shows on one) and carries a `flip` — `\` or `/` — decided purely by drag direction. For what each shape's properties do see [The element types](/docs/editor/elements-and-properties#the-element-types); for the drag rule see [Creating elements — drag, don't click](/docs/editor/canvas-basics#creating-elements-drag-dont-click).

![Drawing a rectangle, then a text box, and typing into it](/docs-assets/editor/clip-drag-create.webp "Drag to create — a click alone draws nothing")
