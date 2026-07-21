---
title: Rotation and Transform Origin
summary: The Rot field turns a shape in degrees; it always pivots around the transform origin — a normalized point that defaults to dead center and is dragged on the canvas, not typed.
aliases: rotate, pivot, anchor point
keywords: rotation, rot, degrees, transformOrigin, pivot, anchor, normalized, center, 0.5, geometry
---

**Rot**, in the Geometry section of **Element Properties**, turns a shape in degrees (the `rotation` field). It always rotates around the shape's **transform origin** — a pivot stored as a pair of normalized coordinates from 0 to 1 across the shape's own width and height (the `transformOrigin` field), defaulting to dead center, `{ x: 0.5, y: 0.5 }`, until you move it.

There is **no numeric field for the origin** anywhere in the panel: the small round pivot handle in the middle of a selected shape is the only control for it — drag it on the canvas to shift the point the shape rotates (and resizes) around, off-center if you like. So rotation is set by number, but its pivot is set by hand.

See [Rotation, opacity, stacking](/docs/editor/elements-and-properties#rotation-opacity-stacking) for the Rot field and [Selecting, moving, resizing](/docs/editor/canvas-basics#selecting-moving-resizing) for the pivot handle.
