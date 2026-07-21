---
title: Active Layer
summary: The layer new elements land on — set by clicking a layer's name, with a frontmost fallback.
aliases: current layer, new elements layer
keywords: active layer, current, new elements, highlight, fallback
---

The **active layer** is where the next shape or text box you draw lands. You set it by clicking a layer's **name** in the [Layers panel](/docs/reference/layers-panel) — it highlights blue while active. Adding a layer with the **+** button also makes that new layer active, and imported SVG artwork lands on the active layer too.

If you have not clicked any layer name this session, new elements fall back to the **frontmost** layer instead. Internally this is tracked as `activeLayerId`; when it is unset, the frontmost (topmost) layer is the fallback.

See [The panel](/docs/editor/layers#the-panel).
