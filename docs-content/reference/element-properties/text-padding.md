---
title: Text Padding
summary: Four inset fields — Top, Right, Bottom, Left — that pad text away from its box edges, linked to move together by default.
aliases: inset, cell padding
keywords: padding, textPadding, inset, top, right, bottom, left, link, cell padding, margin, spacing
---

**Padding**, at the bottom of the Typography section, is four number fields — **Top**, **Right**, **Bottom**, **Left** (the `textPadding` field) — that inset text from its own box edges. A **link icon**, on by default, keeps all four moving together whenever you change one; click it off to set a single side independently. This is the control that gives grid header text or a labeled cell some breathing room from its border.

It's disabled under the exact same condition as Overflow and Wrap: [Auto width](/docs/reference/auto-width) has to be off first, since a box sized to its own content has no interior margin to give.

See [Typography](/docs/editor/elements-and-properties#typography).
