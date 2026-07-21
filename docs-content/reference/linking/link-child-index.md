---
title: Go to Child (by Index)
summary: Links to one of the rendering node's own children by 0-based position — the Target Child picker stores an index, not a page.
aliases: nth child, first child, child index, target child
keywords: child_index, child index, target child, linkValue, 0-based, children, sub-page, journal
---

**Go to Child (by Index)** (`linkTarget: 'child_index'`) links to the rendering node's Nth child, counting from 0. Its value control, **Target Child**, is a dropdown listing the previewed page's children as `0: Journal`, `1: Daily Notes` — pick by name and the index is stored in `linkValue`. An **Edit Manual** toggle swaps in a plain number box, and an index past the end stays visible as "(Index out of range)" rather than hiding your selection. The planner's Day View nav bar uses it twice: Journal is child 0, Daily Notes child 1.

Because it stores an index, not a hard target, the *same* element points at a different real page on every node it renders — that is the whole point. On a node with no child at that index, [the element disappears at export](/docs/reference/on-click-interaction).

See [Position-relative links](/docs/editor/linking#position-relative-links).
