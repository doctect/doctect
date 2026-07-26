---
title: Merge Requests — Proposing Changes
difficulty: advanced
time: 9 min
summary: Send your fork's improvements upstream — what the owner will see, and why the diff always reflects the upstream's current state.
keywords: merge request, propose, upstream, diff, before after, contribution
prerequisites: gallery/forking
---

A [fork](/docs/gallery/forking) remembers where it came from, and that memory buys you the one thing an [Open-in-editor copy](/docs/gallery/browsing-without-an-account) never gets: a way to send your work *back*. Once you've improved a forked project — fixed a page, recoloured a cover, added a variant — you can offer that improvement to the original's owner as a [**merge request**](/docs/reference/merge-request): a titled proposal, carrying a reviewable diff, that they can merge into their project or turn down. This tutorial walks the proposing side end to end — how to open one, what the owner sees when it lands, and the one non-obvious rule that trips up everyone the first time: the diff is never a frozen snapshot.

## From fork to proposal

Proposing is a single menu item, but the *order* of the steps around it matters more than it looks:

1. **Fork the project** (if you haven't already) and open your fork in the editor. Every proposal starts from a fork — the [lineage link](/docs/gallery/forking#forking-step-by-step) a fork records is what tells PDF Architect where "upstream" even is. A plain copy has nowhere to propose *to*.
2. **Make your changes** in the editor, exactly as you would on any project.
3. **Save to cloud.** This is the step people skip — read the warning below before you don't. Give the commit a clear message; it's the version your proposal will carry.
4. **Open the Cloud menu** (the cloud icon, top-right) and choose **Propose changes to upstream…** — the item that only forks show, further down the menu below *Publish to gallery…*.
5. **Fill in the proposal and submit.** A short modal asks for a **title** (required — it's what the owner sees in their incoming-requests list) and an optional **description** for the *why*. **Create merge request** sends it and drops you straight onto the merge request's own page.

> [!WARNING]
> A merge request proposes your fork's latest **cloud commit** — not whatever is currently on your screen. Edits you haven't saved to the cloud are simply not part of the proposal: the diff is computed from commits, and an unsaved change isn't a commit yet. Always **Save to cloud** *before* you propose. The modal says exactly this in its own first line — *"Your latest cloud save will be proposed… Save to cloud first if you have unsaved edits."* — and if you propose a fork that has no committed changes over its upstream at all, the server turns it away with *"No changes to propose — save your edits to the cloud first."*

![The Propose changes to upstream modal, open over a forked notebook whose cover has just been recoloured and saved, with a title and description filled in](/docs-assets/gallery/propose-changes-modal.png "The proposal modal: a required title, an optional description, and a reminder to save first")

## What the owner sees

Submitting takes you straight to the merge request page — the very same page the owner will open. Its heart is a **structured change list**, not a wall of JSON. PDF Architect diffs your fork against the shared starting point and reports the result at the granularity that actually means something in this app: **variants and templates**.

![The merge request page as its author — title, an "open" status badge, the waiting-for-the-owner status line, and a Proposed changes list showing one modified template with a rendered before/after preview of the affected page](/docs-assets/gallery/mr-author-view.png "The author's view: a structured change list — here a single modified template — plus a rendered before/after of the affected page")

Each line is one change, in plain language and colour-coded — additions in green, removals in red, modifications in amber. A recoloured cover, for instance, shows up as a single amber row reading `~ Template modified: default/notebook_cover`, in *variant/template* form. Other rows you might see include `+ Variant added: …`, `~ Variant renamed: … → "…"`, and the coarser `~ Page hierarchy (nodes) changed` when you've added, moved, or renamed pages; removed variants and templates get their own red rows. Below the list, **Render before/after preview** does exactly what it says: it renders the affected page from the upstream's current version and from your fork, side by side — *Current (upstream)* against *Proposed* — so the owner can *see* the change, not just read a label for it. It's a button rather than something automatic, because rendering a page is real work; the owner clicks it when they want the picture.

## The diff is live

Here's the rule that surprises everyone. The change list is **not a snapshot taken at the moment you proposed.** While it's open, it's recomputed, from scratch, every single time the merge request is opened — and always against the upstream's **current** head, never the version you originally forked from. (Once a request is merged or closed, the list freezes — there's nothing left to recompute against.)

> [!NOTE]
> Your merge request stores two fixed points — the commit you're proposing and the commit you forked from — but never a copy of the upstream itself. The upstream side is read live. So if the owner keeps working after you propose, your merge request quietly re-diffs against their newer version each time anyone views it. Usually that's harmless. But if their new work and yours touch the **same template**, the request flips to **conflicted** on its own, and its status line changes to *"The target project has changed since this was proposed — it can't be merged as-is. Update your fork and propose the changes again."*

This is a feature, not a quirk: it means a merge request can never silently go stale and merge something the owner never actually reviewed against their real current state. The cost is that a proposal you opened last week might be conflicted today through no action of your own — and the fix is always the same: re-fork the latest upstream, re-apply your change, and propose again.

## After proposing

Your work here is done — the ball is in the owner's court, and the status line at the top of the page spells out exactly whose move it is. As the author, you see:

> Waiting for the project owner to review this merge request.

The owner, opening that identical page, sees a different line — *"You own the target project — review the changes below, then merge or close."* — along with the **Merge** and **Close** buttons you don't get. (The page decides this from the server's own ownership check, not from a guess like "am I the author," so it stays correct even in the odd case where you fork and propose to your *own* published project.)

They don't have to be watching the gallery to find out, either. Proposing fires an **email notification** to the upstream owner — subject *"New merge request for …"*, with a link straight to this page. It's best-effort and fire-and-forget: a mail failure never blocks your proposal from being created, and **no email is sent when you propose to your own project** — there'd be nobody else to tell.

What happens on the far side of that email — how the owner reviews the diff, renders the preview, and merges or closes your request — is the reviewing side of this same feature, and it's where the next tutorial picks up.
