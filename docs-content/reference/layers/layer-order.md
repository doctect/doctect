---
title: Layer Order
summary: Why layer order beats Z-Index — every element on a higher layer renders in front of every element on a lower one.
aliases: stacking, z order, reorder layers
keywords: order, stacking, z-index, reorder, front, back, sheets
---

An element's final stacking comes from two steps, and **layer order always wins first**. Picture layers as transparent sheets stacked on a table: every element on a higher sheet renders in front of every element on a lower sheet, regardless of either element's own [Z-Index](/docs/editor/elements-and-properties#rotation-opacity-stacking). Z-Index only breaks ties *within one layer* — an element with Z-Index 999 on the back layer still sits behind Z-Index 0 on the front layer, and raising it further only moves it up within its own layer, never off it.

The panel lists layers **frontmost-first**, top to bottom (the reverse of their back-to-front paint order). Drag a layer by its grip handle to reorder it relative to the others; every element on it moves along, keeping their relative Z-Index exactly as it was. Concretely, render order sorts by `(layer.order, zIndex)`, with a higher `order` frontmost.

See [Ordering](/docs/editor/layers#ordering).
