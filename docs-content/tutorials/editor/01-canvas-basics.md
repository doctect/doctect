---
title: Canvas Basics — Tools, Navigation, Selection
difficulty: beginner
time: 10 min
summary: Every drawing tool and its shortcut, canvas navigation, selection, nudging, and the click-drag-to-create rule.
keywords: tools, shortcuts, pan, zoom, snap, undo, redo, marquee, select
prerequisites: getting-started/first-project-from-preset
---

Last tutorial you explored a finished project someone else built. This one starts from nothing — an empty A4 page — and works through the tools that fill it in: what each one draws, how to pan and zoom around the page you're building, how selection and the click-drag-to-create rule actually work, and every shortcut the editor listens for while you're doing any of it. Open a **Blank Project** and follow along; everything here works exactly the same on a template inside a bigger project.

## The toolbar

Every project — blank or not — opens with the same tool palette running across the top of the canvas.

![The editor toolbar: drawing tools on the left, snap and zoom controls on the right](/docs-assets/editor/toolbar.png "Select through Data Grid, then snap/grid toggles and zoom controls")

| Tool | Key | Draws |
| --- | --- | --- |
| Select | `kbd:V` | Nothing — it's the pointer: click, drag-select, resize, and move whatever's already there. |
| Pan | `kbd:H` | Nothing — drag the canvas around without touching an element. |
| Text Box | `kbd:T` | A text element. |
| Rectangle | `kbd:R` | A rectangle. |
| Circle/Ellipse | `kbd:E` | A circle or ellipse. |
| Triangle | `kbd:Y` | A triangle. |
| Line | `kbd:L` | A straight line. |
| Data Grid | `kbd:G` | A repeating grid bound to a list of nodes — its own tutorial later in this track. |

Each shortcut is a single bare key — no `kbd:Ctrl` needed, and pressing one does nothing while you're typing in a text field, so it never fights with normal typing.

Past the divider sits one more control with no shortcut: an **SVG Tools** button opening a two-item menu, *Import SVG file…* to bring in your own artwork, or *Insert placeholder SVG* to drop in a stand-in shape. The rest of the bar — the magnet and grid icons, and the zoom controls — gets its own explanation in the next section; Save Preset and Generator, further along the same row, belong to later tutorials.

## Creating elements — drag, don't click

With any of the six shape tools active, drawing works the same way every time: press the mouse button down at one corner, drag to the opposite corner, let go.

> [!WARNING]
> A click by itself creates nothing. If you press and release without dragging — or drag less than a few points in both directions — the editor throws the attempt away and resets the tool, ready for a real drag. This is the single most common thing that trips up a first-time visit to the canvas: click once expecting a default-sized shape, get nothing, and assume the tool is broken. It isn't; it's waiting for you to drag.

The Text tool is the one exception, and it's worth knowing about so it doesn't look like an inconsistency: click it without dragging and you still get a small text box, sized to the current font and dropped exactly where you clicked, already in edit mode so you can start typing immediately. Dragging with Text active instead lets you set that box's width and height yourself, up front.

![Drawing a rectangle, then a text box, and typing into it](/docs-assets/editor/clip-drag-create.webp "Drag to create a rectangle and a text box, then type straight into the text box")

That clip also shows the other half of the rule: once a shape lands, it's selected automatically, but the tool you were using stays active — it doesn't bounce back to Select. Draw a rectangle and immediately drag again in the same spot, and you'll draw a *second* rectangle, not move the first one. (Typing text is the exception here too: pressing `kbd:Escape` while you're typing inside a text box commits what you typed and switches you back to the Select tool automatically — exactly what ends the clip above.)

## Moving around the canvas

Pan with the **Pan** tool (`kbd:H`), or skip switching tools entirely and hold the **middle mouse button** — that works no matter which tool is currently active, including mid-way through drawing something else. Either way, the cursor turns into an open hand, then a closed one while you drag.

Ordinary scrolling — mouse wheel or trackpad, no key held — just scrolls the canvas like any long page. Hold `kbd:Ctrl` (`kbd:Cmd` on a Mac) while you scroll to zoom instead, centered on wherever your cursor happens to be, anywhere from 20% up to 1000%.

The **−** / **+** buttons at the right of the toolbar do the same zoom, in fixed 10-percentage-point steps, with the current value shown between them. Every new project — blank page or preset — opens at 80%.

The two icons just left of the zoom controls are **Snap to Grid** (the magnet) and **Show Grid**. They're independent, with one exception: turning Snap on always turns Show Grid on with it, so you can actually see the grid you just started snapping to. Turning Snap back off doesn't hide the grid again — it stays exactly as visible as you left it.

> [!TIP]
> The grid you're snapping to isn't a fixed size. It's 10pt normally, 5pt once you're zoomed past 150%, and 1pt past 400% — so snap keeps getting finer as you zoom in for detail work, instead of fighting you with the same coarse grid at every zoom level.

## Selecting, moving, resizing

The **Select** tool (`kbd:V`) is the default, and clicking any shape with it selects that shape — a blue outline with a full set of transform handles.

![A selected rectangle showing its resize, pivot, and rotate handles](/docs-assets/editor/selection-handles.png "Every selected shape gets the same handle set: eight resize handles, a pivot point, and a rotate handle")

That handle set is the same on every non-line shape: eight resize handles (the four corners plus the midpoint of each edge), a small round pivot point sitting in the middle — drag it to move the point the shape resizes and rotates around — and a rotate handle on a short stalk above the shape. Lines get two handles instead, one at each end, since "resize" for a line just means moving an endpoint.

Click empty canvas to deselect everything. Click-and-drag across empty canvas instead, and you get a **marquee**: a selection box that, on release, selects every shape it touches even partially — drag it in whichever direction is convenient, corner to corner. Shift-click a shape to add it to whatever's already selected, and shift-click a selected shape again to drop it back out. Once two or more shapes are selected this way, the toolbar grows a row of alignment and distribution buttons — enough to be worth knowing exists, even though lining shapes up is its own later tutorial.

> [!TIP]
> Holding `kbd:Ctrl` (`kbd:Cmd` on a Mac) when you start dragging an already-selected shape peels off a copy on the spot and drags *that*, leaving the original exactly where it was — a quick, mouse-only duplicate that doesn't need `kbd:Ctrl+D`.

`kbd:Escape` cancels whatever's actively happening — a shape mid-drag, an open marquee box, a move, a resize, a rotation, a pan — snapping everything back to how it was right before that action started. It does *not* clear a selection that's just sitting there: select a shape, do nothing else, and pressing `kbd:Escape` leaves it selected.

## Undo, clipboard, and nudging

Every shortcut below (and every tool key above) is suppressed while your cursor is in a text field, and while a dialog — the JSON view, a delete confirmation, the save-preset prompt — is open, so nothing here ever fights with ordinary typing. Every `kbd:Ctrl` combination also answers to `kbd:Cmd` on a Mac.

| Action | Shortcut | What happens |
| --- | --- | --- |
| Undo | `kbd:Ctrl+Z` | Steps back through your recent changes. |
| Redo | `kbd:Ctrl+Shift+Z` or `kbd:Ctrl+Y` | Either one re-applies whatever Undo just stepped back from. |
| Delete | `kbd:Delete` or `kbd:Backspace` | Removes the selected element(s) on the canvas. With nothing selected there, it falls through to the sidebar instead — a confirmation prompt first for a selected node, immediately (but still undoable) for a selected template. |
| Copy | `kbd:Ctrl+C` | Copies the selected element(s) to an in-app clipboard — not your OS clipboard, so it won't survive a page reload or paste into another program. |
| Cut | `kbd:Ctrl+X` | Copies, then deletes, the selected element(s). |
| Paste | `kbd:Ctrl+V` or `kbd:Ctrl+P` | Pastes the in-app clipboard, offset 20pt down and right of the original so the copy is easy to spot, and selects it. Nothing copied yet? `kbd:Ctrl+P` falls through to your browser's own Print dialog instead. |
| Duplicate | `kbd:Ctrl+D` | The same 20pt-offset copy as Paste, in one step, for the selected element(s) — or, with no element selected, the selected node(s) in Hierarchy mode or template(s) in Templates mode. |
| Nudge | Any arrow key | Moves the selected element(s) 1pt per press — 10pt instead if Snap to Grid is on. |
| Nudge further | `kbd:Shift+Arrow` | Always 10pt, Snap to Grid on or off. |

Deleting an element takes no confirmation, but it's never a real risk: `kbd:Ctrl+Z` brings it straight back like any other change.

## Shortcut reference

Every shortcut on this page is also collected in [Reference](/docs/reference), under Keyboard Shortcuts, laid out for a quick scan while you work instead of a read-through.
