---
title: Z-Index
summary: Breaks stacking ties within a single layer — but layer order always wins first, so Z-Index never lifts an element off its own layer.
aliases: stacking order, bring to front
keywords: z-index, zIndex, stacking, order, front, back, bring forward, send backward, layer, geometry
---

**Z-Index**, in the Geometry section of **Element Properties**, decides stacking order among elements that share a layer (the `zIndex` field). Its own pair of nudge buttons, **Bring Forward** and **Send Backward**, step an element up or down within that layer. Higher renders in front.

**Z-Index only breaks ties within one layer** — it never crosses layers. Render order sorts by `(layer.order, zIndex)`, so an element with Z-Index 999 on a back layer still sits behind Z-Index 0 on a front layer; raising it further only moves it up within its own layer, never off it. When "bring to front" seems to do nothing, the element you want in front is almost always on a lower layer — fix the [layer order](/docs/reference/layer-order) first.

See [Rotation, opacity, stacking](/docs/editor/elements-and-properties#rotation-opacity-stacking).
