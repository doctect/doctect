---
title: Opacity
summary: A 0-to-1 slider that fades an element and everything it contains, sharing a row with Radius in the panel.
aliases: transparency, alpha, fade, see through
keywords: opacity, transparency, alpha, fade, slider, 0-1, appearance, radius
---

**Opacity** is a slider from 0 to 1 (1 is fully opaque, 0 invisible), sharing the row just below **Per-Side Borders** in **Element Properties** with the corner **Radius** field. It maps to the `opacity` field and applies to the whole element — fill, stroke, pattern, and any text alike — so a value of 0.5 lets whatever sits behind the shape show through at half strength.

Reach for it to layer a faint watermark or a tint block behind other content without changing the colors themselves: the swatch colors stay exactly as picked, and only their coverage drops. Because opacity affects the element as a single unit, you cannot fade a shape's fill while keeping its border solid — clear the fill or set a lighter stroke color for that instead.

See [Rotation, opacity, stacking](/docs/editor/elements-and-properties#rotation-opacity-stacking).
