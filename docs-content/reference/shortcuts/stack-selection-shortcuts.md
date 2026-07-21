---
title: Stack Selection Shortcuts
summary: Reach an element buried under others — click-cycling, Alt-click, the Shift variants, and the right-click select-under menu.
aliases: alt click, shift alt, cycle selection, select under
keywords: overlap, stack, alt click, shift, cycle, select under, right click, buried, covered
---

A plain click on overlapping elements always grabs the **topmost** one. The gestures below reach the rest; all read the same top-to-bottom stack, and none cares whether the shapes are rotated.

| Gesture | Over a stack |
| --- | --- |
| `kbd:Click` (again, same spot) | Steps one level deeper each clean click, **wrapping** to the top past the bottom. Needs a priming click first — the current selection must already be in the stack. |
| `kbd:Alt+Click` | Selects the topmost immediately (no priming); repeat at the same point to step deeper, **wrapping** at the bottom. Resolves on press — it does not arm a drag. |
| `kbd:Shift+Click` | Adds the topmost; a further clean click swaps that one member for the next down — **dropped, not wrapped**, once past the bottom. |
| `kbd:Shift+Alt+Click` | Only ever adds: each click adds the next member down, wrapping once every member is in. |

Right-click a stack instead to open the **select-under menu**, listing every element under the cursor top to bottom with its label, type, and layer; hover a row to outline that exact shape, click to select it, or `kbd:Shift+Click` a row to add/remove without closing.

All of these deliberately **skip hidden and locked layers** — there is nothing to cycle or list on a layer whose eye or lock is off. The one escape hatch is the [Layers panel](/docs/reference/layers-panel): clicking an element's row there selects it by name regardless of layer state. See [Selecting Overlapped Elements](/docs/editor/selecting-overlapped-elements#alt-click-and-shift-variants).

![The right-click select-under menu open over a three-rectangle stack, listing all three entries by type and layer](/docs-assets/editor/select-under-menu.png "Right-click a stack to list everything under the cursor, top to bottom")
