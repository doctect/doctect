---
title: Undo and Redo
summary: Step backward and forward through every canvas change — including bulk operations that land as a single step.
aliases: ctrl z, history
keywords: undo, redo, history, revert, ctrl z, ctrl y, ctrl shift z
---

`kbd:Ctrl+Z` (`kbd:Cmd+Z` on a Mac) undoes the most recent change; `kbd:Ctrl+Shift+Z` **or** `kbd:Ctrl+Y` redoes it. Both are suppressed while your cursor is in a text field or a dialog is open, so they never fight with typing.

Deletes take no confirmation on the canvas but are never risky — `kbd:Ctrl+Z` brings a deleted element straight back like any other change. Large operations collapse into one step: applying edits from the JSON inspector, for example, lands the whole new project as a single undo, so one `kbd:Ctrl+Z` restores everything from before Apply.

See [Undo, clipboard, and nudging](/docs/editor/canvas-basics#undo-clipboard-and-nudging).
