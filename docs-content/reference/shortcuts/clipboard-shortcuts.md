---
title: Clipboard Shortcuts
summary: Copy, cut, paste, and duplicate elements — plus the Ctrl+P paste alias quirk and what Ctrl+D duplicates in each sidebar mode.
aliases: copy, cut, paste, duplicate, ctrl c, ctrl d
keywords: copy, cut, paste, duplicate, clipboard, ctrl c, ctrl x, ctrl v, ctrl d, ctrl p
---

`kbd:Ctrl+C` copies the selected element(s) to an **in-app** clipboard — not your OS clipboard, so it will not survive a page reload or paste into another program. `kbd:Ctrl+X` copies then deletes. `kbd:Ctrl+V` **or** `kbd:Ctrl+P` pastes the clipboard, offset 20pt down-and-right so the copy is easy to spot, and selects it. Every combination also answers to `kbd:Cmd` on a Mac.

The `kbd:Ctrl+P` alias has a quirk: with nothing copied yet, it falls through to your browser's own **Print** dialog instead of pasting. `kbd:Ctrl+D` duplicates in one step (the same 20pt offset) — but *what* it duplicates depends on the selection: the selected canvas element(s) if any, otherwise the selected **node(s)** in Hierarchy mode or **template(s)** in Templates mode.

A mouse-only shortcut for the same result: hold `kbd:Ctrl` while you start dragging an already-selected shape to peel off a copy on the spot. See [Undo, clipboard, and nudging](/docs/editor/canvas-basics#undo-clipboard-and-nudging).
