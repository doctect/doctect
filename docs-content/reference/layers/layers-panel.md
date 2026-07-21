---
title: Layers Panel
summary: The right-column panel that lists every layer and its elements — where you hide, lock, reorder, rename, and color-label layers.
aliases: layer list
keywords: layers, panel, list, hide, lock, filter, move to, rename, color dot
---

The **Layers** panel lives in the right column, between **Template Settings** above and **Element Properties** below, collapsed under its own header until you click to expand it. Each template carries its own list of layers; a new project starts with one, "Layer 1", holding everything you draw.

Its header controls: **+** adds a new empty layer on top and makes it active; **Filter elements…** narrows every layer's element rows at once by label or type; **Move to…** (appears once something is selected) retags the selection onto another layer. Each layer row has a grip handle (drag to reorder), a chevron (fold its elements), an **eye** (hide), a **lock**, a **color dot** (a panel-only label — five colors or none), the **name** (click to make active, double-click to rename), and a **trash** (disabled while it is the only layer).

Clicking an element row selects it — panel and canvas always agree on what is selected. `kbd:Ctrl+Click` toggles one row without disturbing the rest; `kbd:Shift+Click` selects the range in the panel's display order (which can span layers, though a collapsed layer's rows are skipped). See [The panel](/docs/editor/layers#the-panel).

![The Layers panel expanded, showing the header row, filter box, and one layer with its element rows underneath](/docs-assets/editor/layers-panel.png "Header controls, a filter/move-to row, then one row per layer with its elements nested underneath")
