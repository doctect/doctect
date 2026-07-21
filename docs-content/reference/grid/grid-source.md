---
title: Grid Source
summary: Where a grid gets its cells — the children of whatever page is rendering it (Current), or the children of one fixed node you pin (Specific).
aliases: current children, specific page, source type
keywords: source, sourceType, sourceId, current, specific, children, current page, specific page, select source node, grid
---

A grid's **Source** dropdown, in **Element Properties → Grid Configuration**, offers exactly two options (the `sourceType` field): **Children of Current Page** (`'current'`, the default) and **Children of Specific Page...** (`'specific'`). "Current" means whichever node is rendering the page the grid sits on, so the source travels with the page — drop the same grid on a different template and it points at that page's node instead. Every grid in both shipped presets uses "current."

Choosing **Children of Specific Page...** reveals a dashed **Select Page...** button; clicking it opens the **Select Source Node** modal, a node tree like the Hierarchy sidebar, and picking a node pins the source to it (`sourceId`). Now every copy of the grid shows that same node's children no matter which page renders it — the deliberate choice for a repeated navigation strip that must look identical on all 365 pages.

![A grid with its Source set to "Children of Specific Page..." and the Select Source Node modal open over the canvas](/docs-assets/editor/grid-source-modal.png "Pinning a fixed node so every copy shows the same children")

See [Choosing the source](/docs/editor/grids-basics-and-styling#choosing-the-source).
