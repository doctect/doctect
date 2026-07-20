---
title: Selecting Overlapped Elements
difficulty: intermediate
time: 8 min
summary: Four ways to reach an element buried under others — click-cycling, Alt-click, the right-click menu, and the Layers panel.
keywords: overlap, stack, selection, alt click, right click, select under, cycle, covered
prerequisites: editor/layers
---

Layers gave you a way to keep whole groups of elements out of each other's way — hide a background, lock a frame, and stop worrying about it. But within whatever's left visible and unlocked, elements still land on top of each other, and a plain click only ever answers to one of them. This tutorial is about reaching the rest: four different ways to get past whichever element is winning every click, down to the one you actually want.

## The problem

Draw three rectangles on top of each other — or open a real project where a background, a card, and some text all happen to share a corner — and click the spot where all three overlap. You get the topmost one, every time. That's not a bug: a click has to resolve to exactly one element, and short of asking, "whichever one is on top" is the only sensible default. The other two are still there, still full members of the page, just unreachable by an ordinary click on that exact spot.

Everything below is a different way past that default: pressing on something already selected, clicking again without moving, `kbd:Alt+Click`, right-click, and the Layers panel. They all pull from the same ordered stack — computed the same way underneath, top to bottom — and none of them cares whether the elements involved are rotated: each one's click bounds are checked against its own tilted shape, not a shared upright box, so a tilted stack cycles exactly like a square one.

## Click again to go deeper

Say the bottom rectangle in that pile is the one you actually want, and the top one is currently selected.

Press down anywhere on an already-selected element — no modifier key — and the editor keeps that selection instead of grabbing whatever's on top of it at that exact pixel. Nothing looks different yet, but it matters the moment you drag: you move what you already had selected, not whatever happens to be sitting over it. This holds for a multi-element selection too, not just a single shape — press on any one member of the group and the whole group stays selected, ready to move together.

For a single selected element, that same press also arms the cycling: let go right where you pressed — a clean click, the cursor moved less than a few points in any direction — and instead of moving anything, the selection steps one level down the stack you clicked. Click again, clean, same spot, and you're one level deeper still. Once you're on the bottom-most element, one more clean click wraps back around to the top.

> [!NOTE]
> Cycling only continues a stack you're already "inside" — the current selection has to be one of the elements sitting at that exact point. The very first click on a stack, with nothing there selected yet (or something unrelated selected elsewhere), just grabs whichever's on top, the same as anywhere else on the canvas; cycling picks up from your next click on that same spot.

![Three clean clicks on the same spot, each one stepping the selection outline to a different rectangle in the stack before the third click wraps back to the first](/docs-assets/editor/clip-click-cycle.webp "Click, click, click, same spot: one level deeper each time, wrapping back to the top on the third")

## Alt-click and shift variants

A click-cycle needs that priming first click before it starts stepping, and it only ever tracks one stack at a time. `kbd:Alt+Click` (`kbd:Option+Click` on a Mac) skips both limits: Alt-click any element, stacked or not, and you land on the topmost one at that exact point immediately — no priming click required. Alt-click that same point again and you're one level deeper right away, wrapping at the bottom exactly like the plain cycle does.

> [!NOTE]
> Alt-click resolves the instant you press — it doesn't arm a drag the way a plain press on a selected element does. Moving the mouse afterward, still held down, does nothing. Let go, then click normally (no `kbd:Alt`) and drag from there if you want to move whatever just got selected.

Add `kbd:Shift` to either gesture and the target joins your selection instead of replacing it, but the two behave differently once they're doing that:

- `kbd:Shift+Alt+Click` only ever adds. Each click adds the next member down the stack to your selection — wrapping around at the bottom — and never removes anything already in it.
- A plain `kbd:Shift+Click` on a stack adds the topmost member the first time. A further clean shift-click on that same spot swaps that *one* member for the next one down, leaving the rest of your multi-selection untouched — and once it's stepped past the bottom of the stack, that slot simply drops out of the selection instead of wrapping back to the top.

| Combo | On its own | Over a stack |
| --- | --- | --- |
| `kbd:Click` | Selects it, replacing the selection | Selects the topmost; a further clean click steps one deeper, wrapping to the top past the bottom |
| `kbd:Shift+Click` | Adds it to / removes it from the selection | Adds the topmost; a further clean click swaps that member for the next one down — dropped, not wrapped, past the bottom |
| `kbd:Alt+Click` | Selects it, replacing the selection | Selects the topmost immediately; Alt-click the same point again to step one deeper, wrapping to the top past the bottom |
| `kbd:Shift+Alt+Click` | Adds it to the selection | Adds the topmost immediately; repeat at the same point to add the next one down, wrapping around once every member is in |

## The right-click menu

Rather than stepping through a stack one click at a time, right-click it to see the whole thing at once. The menu that opens lists every element sitting at that exact point, top to bottom, each row showing its label, its type, and which layer it's on.

![The right-click "select under" menu open over a three-rectangle stack, listing all three entries by type and layer](/docs-assets/editor/select-under-menu.png "Right-click a stack to list everything under the cursor, top to bottom")

Hovering a row outlines that exact element on the canvas — genuinely useful here, since three plain rectangles (or three text boxes with the same font) can produce three identical-looking rows, and the outline is the only way to tell which physical shape a given row actually means before you commit to it. Click a row to select just that element and close the menu; `kbd:Shift+Click` a row instead to add or remove it from your current multi-selection without closing the menu, so you can build up a selection straight from the list. `kbd:Escape`, or a click anywhere outside the menu, closes it without changing the selection.

> [!NOTE]
> If the element already selected before you right-clicked happens to be part of the stack you clicked, it steps down one level first — the same way a same-spot left click would — before the menu even opens. The row the menu shows highlighted is that new, one-deeper member, not necessarily whatever was selected a moment earlier.

## When in doubt: the Layers panel

Every mechanism above quietly skips hidden and locked layers — there's nothing to cycle through, Alt-click past, or list in a menu if an element is on a layer with the eye or the lock off. The [Layers panel](/docs/editor/layers#working-with-element-rows) doesn't have that limit: clicking an element's row there selects it directly, by name, regardless of which layer it's on or what state that layer is in — the one deliberate exception to every rule above, there specifically so you always have a way to reach something otherwise unreachable.

That selection still can't be dragged, resized, or rotated from the canvas if its layer is locked or hidden — no transform handles render for it either way, same as a direct click on it never would. What you do get is the Properties panel, open and editable as normal, so a numeric nudge to its position or a color change is still one field away even while it stays out of the canvas's reach.

> [!TIP]
> A locked layer passes every click straight through it by design — that's the whole point of locking a background or a frame once it looks right. If you find yourself repeatedly Alt-clicking or right-clicking to fight past something that keeps stealing the click meant for what's underneath it, that's the sign to lock its layer instead, not to look for a cleverer click.
