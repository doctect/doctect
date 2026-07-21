---
title: Go to Sibling (Offset)
summary: Steps a signed number of positions among the node's siblings — the prev/next machinery, with a one-level cousin fallback at list edges and no wraparound.
aliases: next page, previous page, adjacent, sibling, offset
keywords: sibling, offset, next, previous, prev, linkValue, cousin fallback, no wrap, arrows, plus one
---

**Go to Sibling (Offset)** (`linkTarget: 'sibling'`) finds the node's position among its parent's children and steps `linkValue` places — the field is labeled **Offset (+1 Next, -1 Prev)**, and leaving it **blank means +1**. Both of the planner's Day View arrows use it, ◀ at `-1` and ▶ at `+1`; the same pair ships on Week, Month, and Quarter templates too.

When the offset runs off either end of the list it does **not wrap**. Instead the resolver climbs **exactly one level** and looks for a *cousin*: from your parent's own position it walks your grandparent's children in the offset's direction and takes the first that has a child of your own template — the *first* going forward, the *last* going backward. That carries ▶ across month boundaries (January 31 → February 1). Two fine points: the offset's *size* does not carry into the fallback (`+7` lands the same first day as `+1`), and the climb is one level only — cousins, not second cousins. So the last day of a quarter, whose months live under different quarters, prints no next-day arrow at all — resolve-or-hide doing its job.

See [Position-relative links](/docs/editor/linking#position-relative-links).
