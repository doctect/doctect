---
title: Define Templates Script
summary: The left generator panel — returns a plain object of templates, re-keyed by each template's own id field, with element ids auto-filled and layers optional.
aliases: stage 1, template definitions, define templates, templates script
keywords: templates script, define templates, id, name, width, height, elements, layers, map, stage 1, variants
---

The **Define Templates** script must `return` a plain object whose values are templates. Each needs `id` and `name` (both strings), `width` and `height` (positive numbers in points), and an `elements` array; a `layers` array is optional. The four [page-size constants](/docs/reference/generator-constants) are in scope here as bare identifiers.

The map's keys are decoration — the generator **re-keys by each template's own `id` field**, so a node's `type` must match the `id` *inside* the template, not the variable name. A template with **no `id` is silently dropped** from the map (the usual cause of a phantom "unknown template type"); a missing `name`, by contrast, is a hard error. **Element** ids are optional — the generator assigns any that are missing, shaped `gen_cover_1_x7f2a`. Omit `layers` and every element lands on one default **Layer 1**. Returning `{ variants, activeVariantId }` instead builds a multi-device project in one pass, but note the `templates` map handed to the [hierarchy script](/docs/reference/hierarchy-script) is the **active variant's only** — yet every node `type` must resolve in *every* variant.

See [The template contract](/docs/generator/templates-in-code#the-template-contract).
