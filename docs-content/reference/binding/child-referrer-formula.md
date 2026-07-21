---
title: The child_referrer Formula
summary: The text form of Go to Child's Referrer — prints a field off the page that references one of this node's children, with all four colon-separated slots required.
aliases: child_referrer, week label formula, referrer formula
keywords: child_referrer, formula, week label, StartIndex, Count, TypeFilter, FieldName, placeholder, insert referrer field
---

`{{child_referrer:StartIndex:Count:TypeFilter:FieldName}}` prints text off the page that references one of the rendering node's children — the display twin of the [Go to Child's Referrer](/docs/reference/link-child-referrer) link. Type it into any text box or grid Display Template, or build it with the Typography section's **Insert Referrer Field…** link.

| Slot | What it means | Accepts |
| --- | --- | --- |
| `StartIndex` | Which child to try first, 0-based; negative indexes are skipped, not errors. | A number, or arithmetic over the node's own data fields (`6-month_start_offset`) |
| `Count` | Size = how many children to try; sign = scan direction; `0` tries none. | Same |
| `TypeFilter` | Preferred template of the referrer's *parent* page; may be empty (any), but the slot must stay — two colons back to back. | A template id |
| `FieldName` | What to print: `title`, or any of that parent's data fields. | A field name |

All four slots must be present — only `TypeFilter` may be empty. A tag missing a slot stops being a formula: it falls through to ordinary field lookup, matches nothing, and prints blank; a well-formed formula whose scan finds nothing prints blank too. Example: `{{child_referrer:0:7:week:title}}` — start at day 0, scan a week forward, prefer a Week View parent, print its title, which for January's first row is "Week 1".

See [Displaying the referrer's name](/docs/editor/references-and-referrer-formulas#displaying-the-referrers-name).
