---
title: Commit
summary: A complete, immutable snapshot of a project with a message and timestamp — every cloud save makes one, and history only ever grows forward.
aliases: snapshot, version, commit
keywords: commit, snapshot, version, immutable, head, message, timestamp, history, 50 commits, pruning, dedupe
---

Every [cloud save](/docs/reference/cloud-save) becomes a **commit**: a complete, immutable snapshot of the whole project with your message and a timestamp. Immutable is the load-bearing word — a new save never modifies or overwrites a previous commit, it stacks a new one on top and moves the **HEAD** ("latest") pointer to it. Your cloud history only ever grows forward, which is exactly what makes restoring safe.

Two limits go with that design. **Identical content dedupes** — saving unchanged content reuses the latest commit and adds no row. And history is deep but not bottomless: each project keeps its most recent **50** commits, older ones eventually pruned as new saves push past that. Commits you've published to the gallery, or that are involved in an open [merge request](/docs/reference/merge-request), are never pruned — a published version stays retrievable forever.

See [Explicit saves, immutable commits](/docs/gallery/cloud-saves-and-history#explicit-saves-immutable-commits).
