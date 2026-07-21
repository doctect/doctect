---
title: Preview Node Selector
summary: The Templates-mode toolbar dropdown that picks whose data a template renders against while you design — a look, never an edit.
aliases: template preview, whose data, preview selector, preview
keywords: preview, preview node, toolbar, selector, templates mode, whose data, matching nodes
---

The **Preview:** selector sits in the toolbar in **Templates** mode and decides which node's data the template on the canvas renders against. Switch it from "January 1, 2026" to "January 2, 2026" and every bound box updates while the template itself is untouched. It lists **only nodes that actually use the selected template**: Day View's runs to all 365 days; switch to Year View and there is exactly one option, because only the root node uses it.

Previewing is purely a **look** — it edits nothing. Every node still renders its own real data the moment you switch to Hierarchy mode or export. It is a different control from Hierarchy mode's [Node Properties](/docs/reference/node-data-fields), which is the only place a node's data is actually added or changed. A placeholder that binds nothing on the current preview node just shows blank — try a node that has the field.

See [Binding the title](/docs/editor/data-binding#binding-the-title).
