---
title: Go to Child's Referrer
summary: Links to the page that references one of my children — a windowed scan with a start index, a signed count, and a preferred parent-template filter.
aliases: back to week, referrer parent, child referrer, child's referrer
keywords: child_referrer, child referrer, back to week, linkValue, linkSecondaryValue, linkReferrerParentType, start index, count, direction, filter
---

**Go to Child's Referrer** (`linkTarget: 'child_referrer'`) asks "who references one of *my* children?" and links to that referrer's parent page. Three controls in **Interaction**: **Start Index** (`linkValue` — which child to try first, 0-based, default `0`), **Count / Direction** (`linkSecondaryValue` — size is how many children to try, sign is scan direction, default `1`), and **Filter by Parent Template** (`linkReferrerParentType`, default **Any Template**). Both number fields accept arithmetic over the rendering node's own data fields, e.g. `6-month_start_offset`.

Three subtleties the exporter enforces. The template filter is a **preference, not a wall** — if no referrer's parent matches, the scan falls back to the first referrer found on any template rather than giving up. **Count / Direction is consulted only when a Start Index is actually set**; leave both blank and it tries child 0 exactly once. And the first tried child with a usable referrer ends the scan. The planner's Month View week-number column is six of these — `6-month_start_offset`, `13-…`, `20-…`, on down — each with count `-7`. For the text-printing twin, see the [`child_referrer` formula](/docs/reference/child-referrer-formula).

See [Linking back through a reference](/docs/editor/references-and-referrer-formulas#linking-back-through-a-reference).
