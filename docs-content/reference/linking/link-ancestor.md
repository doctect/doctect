---
title: Go to Ancestor (Level)
summary: Links N levels up the tree — 1 is the parent, 2 the grandparent — with a floor of 1, and the element hidden if the page has fewer ancestors than asked.
aliases: levels up, grandparent, ancestor
keywords: ancestor, levels up, grandparent, linkValue, up, hierarchy, level, quarter chip
---

**Go to Ancestor (Level)** (`linkTarget: 'ancestor'`) generalizes the back button: **Levels Up** counts parents, `1 = Parent, 2 = Grandparent`, stored in `linkValue`. Blank or `0` is treated as **1** — the resolver takes `Math.max(1, linkValue)` — so it can never link to the node itself. The planner's Day View quarter chip is level 2: day → month → quarter.

Ask for more levels than the page has above it and, like any unresolved internal link, [the element disappears at export](/docs/reference/on-click-interaction). The count is relative to where the element renders, so one template deeper shifts it: the Journal template's own month chip is level 2 (journal → day → month), its quarter chip level 3.

See [Position-relative links](/docs/editor/linking#position-relative-links).
