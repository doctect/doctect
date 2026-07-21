---
title: Merge Conflict
summary: When a fork and the upstream both change the same unit to different values — the merge is refused server-side, and the fix is to re-fork the current upstream.
aliases: conflicted, can't merge, merge conflict, conflict
keywords: merge conflict, conflict, conflicted, same unit, variants, templates, hierarchy, generator, re-fork, resolve, no resolver, refused, both changed
---

A **conflict** means a [fork](/docs/reference/fork) and the upstream both changed the **same unit** to **different values** since the fork branched. The diff granularity is *variants*, *templates*, the *page hierarchy*, and the *generator*, so "same unit" is precise: independent changes to different units always merge cleanly, and only genuine overlap conflicts. Concretely, these conflict — the same template changed to differing values, the same variant added or renamed differently, a unit **removed on one side and modified on the other**, and the hierarchy or generator source reworked on *both* sides — while two people editing *different* templates never collide (and identical edits to the same unit are clean, there being no difference to reconcile).

Because a [merge request](/docs/reference/merge-request)'s diff is recomputed live, a conflict can surface *after* a clean review, the moment the owner's new work overlaps the fork's. When it does, the merge is **refused on both ends** — the Merge button isn't even rendered, and a direct POST is re-checked and rejected server-side. There is **no in-place resolver** (no three-way merge, no accept-theirs/mine); resolution belongs to the fork author and is always the same shape: **re-fork the current upstream** (whose head now contains the owner's change), re-apply the improvement on top, propose again, and close the stale request.

See [Conflicts, precisely](/docs/gallery/merge-requests-reviewing#conflicts-precisely).
