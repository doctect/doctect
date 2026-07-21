---
title: Build Hierarchy Script
summary: The right generator panel — returns { nodes, rootId }, a map of node objects and the id of the root, with createId and the templates map injected.
aliases: stage 2, node tree script, build hierarchy, hierarchy script
keywords: hierarchy script, build hierarchy, nodes, rootId, node contract, parentId, type, title, data, children, createId, stage 2
---

The **Build Hierarchy** script must `return { nodes, rootId }` — `nodes` maps ids to node objects, `rootId` names the top one. Each node is one Hierarchy-mode row: `id` (must equal its key in `nodes`), `parentId` (`null` **only** on the root), `type` (a template id), `title`, an optional `data` object of string fields, and an optional `children` array of ids in page order. Two helpers are injected: [`createId`](/docs/reference/create-id-helper), and `templates` (the active variant's normalized map, handy for guarding — `if (!templates.day) throw…`).

`children` **is** the page order — the exporter walks the tree depth-first — and both directions are checked: a child's `parentId` and its parent's `children` entry must agree, or validation rejects the tree. `type` and `title` have no default (omit either and the run fails), alongside `id` (must equal its map key) and `parentId` (null only on the root); only `data` and `children` default, to `{}` and `[]`. Only the [templates script](/docs/reference/templates-script) sees the page-size constants; only this script sees `createId`.

See [The node contract](/docs/generator/hierarchy-in-code#the-node-contract).
