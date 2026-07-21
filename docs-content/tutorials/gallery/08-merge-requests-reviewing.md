---
title: Merge Requests — Reviewing, Merging, and Conflicts
difficulty: advanced
time: 10 min
summary: Review a structured diff with before/after previews, merge without losing your own edits, and understand exactly what conflicts.
keywords: merge, review, conflict, owner, before after preview, close, resolve
prerequisites: gallery/merge-requests-proposing
---

The [previous tutorial](/docs/gallery/merge-requests-proposing) walked the *proposing* side of a merge request — a fork author packaging up a change and sending it upstream. This one is the other half: you're the **owner** now, an improvement to your published project has landed, and you have to decide what to do with it. Reviewing and merging are the easy part. The part worth being precise about — the part that trips people up — is what *conflicts*, what doesn't, and what your options actually are when a request can't be merged as-is. This tutorial is deliberate about all three.

## The owner's review page

Nothing pushes an incoming request at you mid-work. There are exactly two ways you find out one exists:

1. **The email.** Proposing fires a best-effort notification to your account's address — subject *"New merge request for …"* — with a link straight to the request's page. It's fire-and-forget: if mail delivery fails, the request is still created, you just won't be pinged about it.
2. **Your project's gallery page.** Open your own published project in the gallery and, if it has at least one incoming request, a **Merge requests** section appears above the reviews — one row per request, each showing its title, who sent it, and its status, linking to the request's page. This section is **owner-only**: nobody else browsing your project sees it.

There is no global inbox. PDF Architect lists incoming requests *per project*, on that project's page — so if you own several published projects, you check them where they live (or follow the email link). The request's own page lives at a stable `/mr/<id>` URL that both you and the author open; it's the same page for both of you, and it decides what to show from **who you are**.

![The owner's view of the merge request page — the structured Proposed changes list with one modified template, a rendered Current-versus-Proposed preview of the cover, the owner guidance line, and the Merge and Close buttons](/docs-assets/gallery/mr-owner-review.png "The owner's review page: the same structured diff the author sees, plus the guidance line and the Merge / Close buttons only the owner gets")

Everything the author sees — the colour-coded [structured change list](/docs/gallery/merge-requests-proposing#what-the-owner-sees) and the **Render before/after preview** button that draws the affected page *Current (upstream)* against *Proposed* — you see too. What's *added* for you is two things:

- **A role-aware guidance line.** Where the author reads *"Waiting for the project owner to review this merge request,"* you read **"You own the target project — review the changes below, then merge or close."** The page gets this from the server's own ownership check, not from a client-side guess — which is what makes the self-fork case below behave correctly.
- **The action buttons.** **Merge** (owner-only, and only while the request is *open*) and **Close** (either party, any time the request is still actionable).

## What merging actually does

Click **Merge**, confirm the *"A new version will be created"* prompt, and the request's status flips to **merged**, the Merge button disappears, and — this is the important bit — a new commit lands in **your** project's history. It's an ordinary commit, message `Merge: <title> (from @author)`, sitting at the head of your version history exactly like a manual save. You can [restore it — or the version before it](/docs/gallery/cloud-saves-and-history#restoring-an-old-version) like any other point in your timeline; a merge is not a special, irreversible event.

![The merge, end to end: the owner clicks Merge on the open request, the page settles into its merged state, and the new "Merge: Recolour the cover to teal" commit appears at the head of the project's version history](/docs-assets/gallery/clip-merge.webp)

The reason a merge is *safe to accept* — even if you've kept working since the request was proposed — is the shape of the operation itself. Merging does **not** overwrite your project with the fork's copy. It:

1. Starts from **your project's current state** — whatever's at your head right now, including every edit you've made since the request was opened.
2. Computes the precise set of changes the fork made **relative to the shared fork point** (the commit the fork branched from) — not relative to you.
3. Applies **only those changes** on top of your current state.

So if the fork recoloured the cover and you, meanwhile, rewrote a completely different page, the merge keeps both: your rewritten page is untouched (the fork never touched it, so it isn't in the change set), and the cover picks up the fork's new colour. **Both sides survive** because merging overlays a change set, it doesn't swap in a snapshot. The only thing that can't be reconciled this way is when both sides changed the *same* thing — and that's exactly what a conflict is.

> [!NOTE]
> Page-hierarchy changes (adding, moving, or renaming pages) and generator-source changes are the coarse exception: those are applied whole, not stitched together field by field. That's still safe, because it only happens when just *one* side changed them — if both sides reworked the hierarchy, or both edited the generator, that's a conflict and the merge never runs. Within a clean merge, whole-replacement of a thing only you touched can't lose anyone's work.

## Conflicts, precisely

A conflict means the fork and the upstream both changed the **same unit** to **different values** since the fork branched. PDF Architect diffs at the granularity of *variants*, *templates*, the *page hierarchy*, and the *generator* — so "same unit" is precise, not fuzzy. Independent changes to different units merge cleanly; only genuine overlap conflicts.

| The fork changed… | …and the owner independently changed… | Result |
| --- | --- | --- |
| The cover template | A *different* template, or nothing nearby | **Clean merge** — both changes land |
| The cover template | The **same** cover template, to a *different* value | **Conflict** |
| The cover template | The same cover template, to the *identical* value | **Clean** (no difference to reconcile) |
| Added a new variant (e.g. "iPad") | Added a *different* new variant | **Clean merge** |
| Added a variant "iPad" | Added a variant "iPad" with *different* content | **Conflict** |
| Renamed a variant | Renamed the **same** variant to a different name | **Conflict** |
| Removed a variant or template | *Modified* that same variant or template | **Conflict** |
| The page hierarchy (added/moved pages) | The page hierarchy, differently | **Conflict** |
| The generator source | The generator source, differently | **Conflict** |

The throughline: **different units always merge; the same unit conflicts only when the two sides disagree on the result.** Two people editing two different templates never collide. Two people editing the same template collide unless they happened to make the identical edit.

![The conflicted merge request as the owner sees it — a red Conflicts banner naming the template that was changed on both sides, the "changed since this was proposed — it can't be merged as-is" status line, and no Merge button, only Close](/docs-assets/gallery/mr-conflict.png "A real conflict: the owner edited the same template the fork did, so the live diff flags it and the Merge button is withheld")

Because [the diff is recomputed live against your current head](/docs/gallery/merge-requests-proposing#the-diff-is-live), a conflict can surface *after* a request was proposed and reviewed as clean — the moment your new work overlaps the fork's, the request re-flags itself as **conflicted** on its own. When it does, the request refuses merging on **both** ends: the **Merge** button isn't even rendered for a conflicted request (only **Close** is), and if anyone tries to POST a merge directly, the server re-checks the conflict and rejects it. There is no way to merge a conflicted request into your project by accident.

## Resolving a conflict

Here's the honest part: **PDF Architect has no in-place conflict resolver.** There is no three-way merge editor, no "accept theirs / accept mine" per template, no button that rebases the request onto your latest version. A conflicted request stays conflicted; the merge simply won't run.

Resolution is manual, and it belongs to the **fork author**, not the owner. The workable path — the one the page itself spells out in the conflict banner (*"fork the latest version again and re-apply their changes"*) — is:

1. **Re-fork the upstream as it is now.** The fresh fork branches from your *current* head, which already contains the owner's conflicting change.
2. **Re-apply the improvement on top of that.** Because the new fork point already includes the owner's version of the disputed unit, re-doing the change is no longer a divergence — it's a straightforward edit on top of the latest.
3. **Propose again.** The new request diffs the re-forked fork against the (unchanged) upstream and comes up clean and mergeable.
4. **Close the stale request.** The old conflicted one has been superseded; close it so it stops cluttering the list.

The reason re-forking works where in-place fixing can't is that the shared fork point *moves*: the original request is forever anchored to a fork point that predates the owner's change, so it can never stop diverging from it, whereas a fresh fork is anchored to the version that *contains* that change.

## Closing without merging

**Close** ends a request without touching the project. Either party can do it: the author closes to **withdraw** a proposal, the owner closes to **decline** one. A short confirm — *"Close this merge request without merging?"* — and the status becomes **closed**. Closed is terminal in the sense that matters: a closed request can't later be merged (nor can a merged one be closed), and once a request is merged or closed its diff freezes — there's nothing left to recompute it against. Closing is the graceful "no thanks," and it's also how you clear out a conflicted request you've resolved by re-forking.

> [!NOTE]
> **The self-fork case works.** If you [fork](/docs/gallery/forking) your *own* published project and propose changes back to it, you are simultaneously the request's author *and* the target project's owner. Because the page reads ownership from the server's authoritative check — never from a shortcut like "if I'm not the author, I must be the owner" — it correctly shows *you* the **Merge** button on *your own* proposal, and you can merge it. (No notification email is sent for a self-request, either: there's nobody else to tell.) It's a legitimate workflow — stage an experiment on a fork, then merge it into the real thing once you're happy.

That closes the loop the gallery opened: browse, publish, rate, fork, propose, review, merge. A published project is no longer a one-way broadcast — it's something other people can genuinely help you improve, on terms you stay in control of.
