---
title: Go to Parent Page
summary: The back button — links every page to its own parent node, no value field needed, so one element is 365 correct back-links.
aliases: back button, go up, parent link
keywords: parent, back button, go to parent, linkTarget, navigation, up, nav bar
---

**Go to Parent Page** (`linkTarget: 'parent'`) is the back button. Set it in **Element Properties → Interaction → On Click**; it takes **no value field**, because "my parent" is already a complete answer. Each page resolves it against its own node, so the planner's Day View month chip renders "Jan" and links to January on one page, "Sep" and links to September on the next — one element, 365 correct back buttons.

On a node with no parent — the project root — a parent link resolves to nothing, so [the element vanishes there](/docs/reference/on-click-interaction) under the resolve-or-hide rule. Parent only ever walks *up one step*; for jumps the tree's parent/child lines can't express, like a day page back to the week that references it, reach for [Go to Referrer](/docs/reference/link-referrer) instead.

See [Back buttons and nav bars](/docs/editor/linking#back-buttons-and-nav-bars).
