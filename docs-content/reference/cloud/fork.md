---
title: Fork
summary: A signed-in, private cloud copy of a published project that records upstream lineage and can propose changes back — unlike the no-strings Open in Editor.
aliases: copy with lineage, github style, fork, fork this project
keywords: fork, forking, lineage, upstream, forked from, private, cloud copy, propose changes, merge request, published commit, self-fork, open in editor
---

**Fork this project** creates a **private copy in your own cloud account** that remembers where it came from — a "forked from" lineage link back to the original, and the ability to propose its changes back upstream as a [merge request](/docs/reference/merge-request). It requires an account *and* a [username](/docs/reference/username), lands as a real cloud project already saved (its first commit messaged `Fork of "…"`), and stays private until you choose to publish it yourself. It always copies the **published** commit pinned to the gallery page — never the owner's newer private draft, and never HEAD from the gallery button — even when you fork your *own* published project.

The whole choice is Fork versus [Open in editor](/docs/reference/open-in-editor):

| | Open in Editor | Fork |
| --- | --- | --- |
| Sign-in, and where the copy lives | None — a copy in your local IndexedDB workspace | Account **and** username — a copy in your local IndexedDB workspace plus a private project in your cloud |
| Link to the original | None — a dead end | Records "forked from" lineage; can propose changes upstream |

See [Forking, step by step](/docs/gallery/forking#forking-step-by-step).
