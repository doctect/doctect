---
title: Text Tool
summary: Draws a text element — the one tool where a plain click still creates something.
aliases: text box, label
keywords: text, label, type, font, typography, auto width, t
---

The **Text** tool (`kbd:T`) draws a text element that holds a literal string or a `{{field}}` binding. Find it in the [toolbar](/docs/editor/canvas-basics#the-toolbar) between the Hand tool and the shape tools.

Text is the one exception to the drag-to-create rule: **click without dragging and you still get a box**, sized to the current font, dropped where you clicked, already in edit mode so you can type immediately. Dragging instead lets you set the box's width and height up front. Pressing `kbd:Escape` while typing commits the text and switches you back to the Select tool. You can also double-click any existing text element on the canvas to jump straight back into editing.

New text boxes start **Center/Middle** aligned (not the Left/Top you might expect), and the horizontal alignment and font choices you last used are remembered as defaults for the next box. See [Creating elements — drag, don't click](/docs/editor/canvas-basics#creating-elements-drag-dont-click) for the click exception and [Typography](/docs/editor/elements-and-properties#typography) for the full property set.
