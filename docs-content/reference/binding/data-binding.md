---
title: Data Binding
summary: Type {{field}} into any text box and it prints that field off whichever node renders the template — the mechanism behind one template, many pages.
aliases: placeholder, curly braces, template variables, binding
keywords: data binding, placeholder, curly braces, field, title, template, resolve, empty string, reset to title
---

A **placeholder** is `{{fieldName}}` typed straight into a text box — there is no separate binding control anywhere in the panel. At render, the box drops the braces and shows whatever that field resolves to on the node currently rendering the template, so one Day View layout prints "Jan 01" on one page and "Jan 02" on the next. `{{title}}` is the one field every node answers; the **Reset to Title** link below the text box types it for you. Literal text and multiple placeholders mix freely: `{{month_short}} {{day_num}}`.

A placeholder that points at nothing — a typo, or a field that is real on other nodes but not this one — resolves to an **empty string**, not the literal `{{name}}` text and not an error. A box with nothing else in it looks completely blank until the name is fixed or a [preview node](/docs/reference/preview-node) that has the field is chosen. The fields a node offers come from its [data fields](/docs/reference/node-data-fields).

See [Binding the title](/docs/editor/data-binding#binding-the-title).
