---
title: Merge Request
summary: A titled proposal that sends a fork's latest cloud commit back to the upstream owner, carrying a structured diff that's recomputed live against the upstream's current head.
aliases: propose changes, MR, pull request, merge request, propose
keywords: merge request, pull request, propose changes, MR, upstream, diff, structured diff, fork, variants, templates, live diff, conflict, email notification, title
---

A **merge request** sends a [fork](/docs/reference/fork)'s improvements back to the original's owner — a titled proposal carrying a reviewable diff they can merge or turn down. The order is **fork → edit → Save to cloud → Propose changes to upstream…** (Cloud menu, forks only). It proposes your fork's **latest cloud commit**, so unsaved edits aren't part of it, and a fork with no committed changes over upstream is refused with *"No changes to propose."* The diff is a **structured change list** at the granularity of *variants and templates* — color-coded rows like `~ Template modified: default/notebook_cover` rather than a wall of JSON — with an optional rendered before/after preview of the affected page.

The change list is **not a snapshot**: while the request is open it's recomputed from scratch on every view, always against the upstream's **current** head — so it can flip to [conflicted](/docs/reference/merge-conflict) on its own if the owner's later work overlaps yours. The author's status line reads *"Waiting for the project owner to review this merge request,"* while the owner gets **Merge**/**Close** buttons; the page decides this from the server's ownership check, so even a self-fork proposal correctly shows *you* the owner controls. Proposing emails the upstream owner (best-effort; no email is sent for a self-request).

See [From fork to proposal](/docs/gallery/merge-requests-proposing#from-fork-to-proposal).
