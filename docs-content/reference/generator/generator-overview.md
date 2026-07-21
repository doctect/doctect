---
title: The Two-Script Generator
summary: Build a whole project in code — two independent JavaScript scripts, one returning templates, the other the node tree, joined only by template ids.
aliases: hierarchy generator, scripting, generator
keywords: generator, two scripts, hierarchy generator, define templates, build hierarchy, scripting, purple button, type
---

The **Generator** — the purple toolbar button, tooltip "Generate Hierarchy via Script" — opens the **Hierarchy Generator** modal on two side-by-side editors. **Define Templates** (left) returns a map of template ids to [template objects](/docs/reference/templates-script); **Build Hierarchy** (right) returns [`{ nodes, rootId }`](/docs/reference/hierarchy-script), the page tree. The one thread between them is `type`: every node's `type` must name a template id. 365 pages is a `for` loop, not 365 clicks.

The two scripts run as **separate functions with separate scopes** — the [page-size constants](/docs/reference/generator-constants) exist only in the templates script, [`createId`](/docs/reference/create-id-helper) and the `templates` map only in the hierarchy script. Nothing touches your project until you [preview](/docs/reference/generator-preview) and then [apply](/docs/reference/generator-apply-modes); a run alone only produces a preview.

See [The two scripts](/docs/generator/generator-basics#the-two-scripts).
