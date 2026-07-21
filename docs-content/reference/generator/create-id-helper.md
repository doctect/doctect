---
title: createId(prefix)
summary: The id minter injected into the hierarchy script — your prefix plus up to nine random base-36 characters, for bulk nodes you'll never name again.
aliases: createId, unique id, id helper
keywords: createId, unique id, prefix, base-36, node id, hierarchy, mint, ref, bulk
---

`createId(prefix)` is injected into the **Build Hierarchy** script (only). It mints unique node ids shaped `prefix_` plus **up to nine random base-36 characters** — `createId('day')` yields something like `day_k3f8w1q2x`. Called with no argument the prefix is `node`. Use it for bulk pages nothing else refers to: the loop pushes each id into its parent's `children` and forgets it on the spot.

Reach for **hand-written ids** (`week_1`, `root`) instead whenever later code must name the node — a `nodes.week_1` back-reference, or a [specific-page link](/docs/reference/link-specific-node) written in the templates script against an id the hierarchy has to promise will exist. Deterministic ids for anchors, `createId` for bulk. It lives only here — the [templates script](/docs/reference/templates-script) has no `createId`.

See [The node contract](/docs/generator/hierarchy-in-code#the-node-contract).
