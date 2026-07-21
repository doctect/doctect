---
title: Node Data Fields
summary: The per-node key/value map that placeholders bind against — edited only in Hierarchy mode, one node at a time, values always strings.
aliases: custom fields, metadata, data fields, node data
keywords: node data, data fields, custom fields, add field, hierarchy, string values, Node Properties, mood
---

A node's **Data Fields** are its own key/value map, shown in **Node Properties** in **Hierarchy** mode when you select a node in the sidebar. **+ Add** creates one — type a name, press `kbd:Enter`, then fill the value box (a brand-new field always starts blank). The field exists on that **one node only**, and you bind it like any built-in: `{{mood}}`. The 2026 Planner's day nodes ship thirteen of these (`year`, `month_short`, `weekday_num`, …), all written by the preset's generator, not typed in by hand.

Data is added and edited only in **Hierarchy** mode, per node — a different job from the Templates-mode [preview selector](/docs/reference/preview-node), which only *looks*. Every consumer treats the values as **strings** (generator scripts write `String(n)`), so keep them strings. Deleting a field takes no confirmation, but `kbd:Ctrl+Z` brings it straight back.

See [Custom data fields](/docs/editor/data-binding#custom-data-fields).
