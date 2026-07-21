---
title: Go to Specific Page
summary: A hard link to one fixed page, identical everywhere it renders — picked from a modal, and auto-reset to None if that page is ever deleted.
aliases: hard link, go to page, specific page, fixed link
keywords: specific_node, specific page, hard link, fixed, select target page, linkValue, node picker, home
---

**Go to Specific Page** (`linkTarget: 'specific_node'`) is the one target that ignores relationships: it links to a single fixed node, the same destination on every page that renders it — the right tool for a "home" or cover chip. Picking it shows a dashed **Select Target Page…** button that opens the node-tree modal; the chosen node's id is stored in `linkValue`, and the button then shows its title.

Hard links are the only target that can dangle, so PDF Architect guards it: deleting a node **resets every Go to Specific Page link pointing at it back to None**, across all templates and variants, rather than leaving a link to nowhere. In a generator this is the one link written in the *templates* script, so the hierarchy must [promise the target id](/docs/reference/create-id-helper) will exist.

See [Back buttons and nav bars](/docs/editor/linking#back-buttons-and-nav-bars).
