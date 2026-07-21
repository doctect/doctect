---
title: Layer Visibility and Lock
summary: What the eye and lock icons do — hide removes a layer from canvas, PDF, and thumbnails; lock keeps it visible but click-through.
aliases: hide layer, lock layer, click through
keywords: hide, lock, visibility, eye, click through, export, thumbnail, draft
---

The **eye** and **lock** each act on a whole layer at once, never on just your current selection, and they mean two different things. **Hide** (eye off) removes every element on the layer from three places simultaneously: the canvas, the exported PDF, and every gallery **thumbnail**. All three go through one function, `sortElementsForRender`, which drops hidden-layer elements before sorting by layer order and Z-Index — so there is no separate export or thumbnail visibility that could fall out of sync with the eye icon. Hidden rows stay listed in the panel, just dimmed.

**Lock** does the opposite: a locked layer's elements stay fully visible everywhere but stop responding to the mouse. You cannot select, drag, resize, or edit them — a click **passes straight through** to whatever sits on a lower, unlocked layer underneath.

The practical patterns: keep a "Draft notes" layer and hide it before exporting (one step covers PDF and thumbnails, since they share the canvas's own visibility check); lock a background or frame once it looks right so a stray marquee or misplaced click cannot disturb it. See [Hide and lock semantics](/docs/editor/layers#hide-and-lock-semantics).

![A layer's content disappearing from the canvas on the eye click, reappearing, then the lock icon engaging](/docs-assets/editor/clip-layer-hide-lock.webp "Toggling a layer's visibility, then its lock")
