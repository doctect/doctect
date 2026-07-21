---
title: Layers
difficulty: intermediate
time: 10 min
summary: Photoshop-style named layers — hide, lock, reorder, color-label — and how they shape the exported PDF.
keywords: layers, hide, lock, reorder, visibility, background, z-index, panel
prerequisites: editor/elements-and-properties
---

Last tutorial's stacking section ended on a promise: Z-Index breaks ties within a single layer, and layers get their own tutorial later in this track. This is that tutorial. A layer is a named, orderable group of elements — Photoshop calls them exactly the same thing — that hides, locks, and stacks as one unit, sitting above or below every other layer regardless of what any individual element's own Z-Index says. Open any project; even one you started before reading this has at least one, whether or not you've ever opened the panel that shows it.

## Why layers

A template can pile up a lot of overlapping things on one page — a background grid, decorative shapes, real content, maybe a few notes-to-self that shouldn't ship in the final PDF. Z-Index can keep all of that sorted, but only one element at a time: nudging a background rectangle behind everything else says nothing about where any *other* element belongs relative to it. Layers give you a coarser, more useful unit instead: put the background on one layer and the content on another, and "hide everything in the background" or "lock everything that's still a draft" becomes one click instead of one click per element.

Every template carries a list of layers, normally invisible unless the panel below is open. A brand-new project already has exactly one, named "Layer 1", holding everything you draw until you add a second. Open a project that predates this feature and the same thing happens automatically, the first time it loads: the app builds that same single default layer and quietly re-tags every existing element onto it. Nothing about the page's appearance changes in the process — there was only ever one real layer's worth of stacking happening anyway, it just didn't have a name or a row in a panel yet.

## The panel

Find it in the right column, between **Template Settings** above and **Element Properties** below — collapsed by default under its own [**Layers** header](/docs/reference/layers-panel). Click that header to expand it.

![The Layers panel expanded, showing the header row, filter box, and one layer with its element rows underneath](/docs-assets/editor/layers-panel.png "The Layers panel: header controls, filter/move-to row, then one row per layer with its elements nested underneath")

| Control | What it does |
| --- | --- |
| **+** (top right of the header) | Adds a new, empty layer on top of everything else and makes it the [active layer](/docs/reference/active-layer). |
| **Filter elements…** | Narrows every layer's element rows at once to ones whose label or type matches what you type. |
| **Move to…** (appears once something's selected) | Retags the current selection onto a different layer in one step. |
| Grip handle | Drag a layer to a new position relative to the others — see Ordering, below. |
| Chevron | Folds or unfolds that layer's own element rows underneath it — remembered the next time you open the project, same as everything else about the layer. |
| Eye | Shows or hides the whole layer — see Hide and lock semantics, below. |
| Lock | Locks or unlocks the whole layer — same section. |
| Color dot | Opens a small swatch picker — five colors, or none — a label to help you tell layers apart in this panel. It has no effect on the page itself. |
| Name | Click to make this the active layer, highlighted blue while it is. Double-click to rename it. |
| Trash | Deletes the layer (disabled while it's the only one left); its elements move onto whatever layer is now lowest. |

That "active layer" click matters beyond the highlight: the next shape or text box you draw lands on whichever layer you last clicked the name of. Never clicked one this session? New elements default to the frontmost layer instead.

## Hide and lock semantics

The eye and the lock both act on an entire layer at once, never on just your current selection — and they mean two different things.

[**Hide**](/docs/reference/layer-visibility-and-lock) removes every element on that layer from three places simultaneously: the canvas, the exported PDF, and — because a thumbnail is literally a rendered page of that same PDF — every thumbnail the gallery ever shows for this project too. All three go through one function, `sortElementsForRender` (in `services/layers.ts`): it drops anything sitting on a hidden layer, then sorts whatever's left by layer order and Z-Index. Canvas rendering, PDF export, and thumbnail generation all call that same function directly, so there's no separate "thumbnail visibility" or "export visibility" that could fall out of sync with what the eye icon shows in the panel.

Hiding a layer doesn't touch its element rows in the panel — they stay listed, just dimmed, and reappear exactly as they were the moment you click the eye back on.

> [!TIP]
> Keep a "Draft notes" layer for reminders, placeholder copy, or anything else that shouldn't ship, and hide it right before you export or publish. Because export and thumbnails already share the canvas's own visibility check, hiding the layer once is the only step — there's no second, PDF-specific switch to remember.

**Lock** does the opposite: a locked layer's elements stay fully visible everywhere, exactly as before, and just stop responding to the mouse. You can't click to select one, drag it, resize it, or double-click into its text — a click that lands on a locked element passes straight through, as if it wasn't there, so whatever's underneath on a lower, unlocked layer gets the click instead.

> [!TIP]
> Once a background or frame layer looks right, lock it. You'll spend the rest of the session clicking and dragging things on the layers in front of it, and a locked layer can't be nudged, resized, or deleted by a stray marquee or a misplaced click.

![A layer's content disappearing from the canvas on the eye click, reappearing, then the lock icon engaging](/docs-assets/editor/clip-layer-hide-lock.webp "Toggling a layer's visibility, then its lock")

## Ordering

Every element's final stacking position comes from two steps, and mixing them up is the single most common confusion about layers: **[layer order](/docs/reference/layer-order) always wins first.** Picture layers as separate transparent sheets stacked on a table. Every element on a higher sheet renders in front of every element on a lower sheet, full stop — regardless of either element's own [Z-Index](/docs/editor/elements-and-properties#rotation-opacity-stacking). Z-Index only breaks ties *within one sheet*; it has no way to reach across to a different one.

Concretely: an element with Z-Index 999 on the back layer still renders behind an element with Z-Index 0 on the front layer. Raising the back-layer element's Z-Index further changes nothing about that — it can climb to the top of its own layer, but it can never climb off it.

The panel lists layers frontmost-first, top to bottom — the same order they paint back-to-front on the page, just read in reverse. Drag a layer by its grip handle to a new spot in that list to change its order relative to the others; every element on it moves along with it, keeping their relative Z-Index exactly as it was.

## Working with element rows

Underneath each layer row sit that layer's own elements, one row apiece — an icon plus a short label, either the element's own text (for a text box) or just its type — in the same frontmost-first order they stack within that layer.

**Filter elements…**, at the top of the panel, narrows every layer's rows at once to whichever match what you type, checked against that same label and the element's type.

Clicking a row selects that element — the same selection the canvas shows with its own handles, so the panel and the canvas always agree on what's selected. `kbd:Ctrl+Click` (`kbd:Cmd+Click` on a Mac) adds or removes just that one row without disturbing the rest of the selection. `kbd:Shift+Click` selects every row between your last click and the one you just shift-clicked, in the panel's own display order — which can span more than one layer if the rows in between belong to different ones. (A collapsed layer's rows are skipped by a range like this, the same way they're hidden from the list itself.)

Select one or more rows and a **Move to…** dropdown appears next to the filter box: pick a layer, and the whole selection retags onto it in one step, landing on top of whatever else is already there. Dragging a row directly onto a different layer's row does the exact same thing, one element at a time.
