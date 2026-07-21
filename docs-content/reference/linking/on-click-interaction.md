---
title: On Click (Interaction)
summary: The dropdown that turns any element into a navigation control — nine link targets, one field, resolved fresh on every page the element renders.
aliases: interaction section, link element, make clickable, on click
keywords: on click, interaction, linkTarget, link, navigation, dropdown, resolve or hide, clickable, nine targets
---

**On Click** is the single dropdown in **Element Properties → Interaction**, the panel's very last section (the `linkTarget` field). Every element type carries it — text, shapes, lines, SVGs, grids — and it defaults to **None**. Pick any of its eight link targets (the ninth option, None, is the no-link default) and the element becomes a live link in the exported PDF; most targets reveal one extra value control underneath. In dropdown order: None, Go to [Parent Page](/docs/reference/link-parent), Go to [Child (by Index)](/docs/reference/link-child-index), Go to [Sibling (Offset)](/docs/reference/link-sibling), Go to [Ancestor (Level)](/docs/reference/link-ancestor), Go to [Referrer (Backlink)](/docs/reference/link-referrer), Go to [Specific Page](/docs/reference/link-specific-node), Go to [Child's Referrer](/docs/reference/link-child-referrer), [Open URL](/docs/reference/link-url).

Internal links name a *relationship*, not a page number, and resolve **per rendering node** at export — one configured element produces a different, correct destination on every page it renders. The rule that surprises people is resolve-or-hide: an internal target that resolves to nothing **removes its element from that page entirely** — no dead links, no empty box — and a grid whose On Click fails to resolve hides the whole grid, cells and all. Only [Open URL](/docs/reference/link-url) is exempt. The canvas editor never navigates on click, either; clicking a linked element just selects it, so export to test.

See [Logical links, not URLs](/docs/editor/linking#logical-links-not-urls).
