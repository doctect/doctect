---
title: Forking a Gallery Project
difficulty: intermediate
time: 7 min
summary: Fork vs Open in Editor — when each is right — and what a private fork with upstream lineage lets you do next.
keywords: fork, open in editor, upstream, private, lineage, copy
prerequisites: gallery/cloud-saves-and-history
---

Back in [the first gallery tutorial](/docs/gallery/browsing-without-an-account#open-in-editor-yours-instantly) you learned that **Open in editor** hands you a no-strings copy of any published project — and that a second button, one that only appears once you sign in, does something more. This is that button. [Forking](/docs/reference/fork) makes a copy too, but a copy that *remembers where it came from*: a private project in your own cloud account, tied by a lineage link back to the original, and — unlike an Open-in-editor copy — able to send its changes back upstream. This tutorial is about choosing between the two, and what a fork sets up that a plain copy can't.

## Two ways to take a copy

Both buttons sit in the same column on any [project page](/docs/gallery/browsing-without-an-account#a-project-page), one above the other. They look almost identical and both end with a copy of the project open in your editor — but what you get is different in ways that matter later:

| Question | Open in editor | Fork this project |
| --- | --- | --- |
| Do you need to sign in? | No — fully anonymous | Yes — an account **and** a username |
| Where does the copy live? | Your browser only | A private project in your cloud |
| Does it remember the original? | No link back at all | Yes — it records a "forked from" lineage |
| Can you send changes upstream? | No | Yes — as a merge request |
| Does it show up in the gallery? | Never — it's only local | Only if *you* publish it yourself |
| Which version do you get? | The published one on the page | The same published one |

That last row is worth pinning down, because it's the one thing the two share exactly: **both copy the project's *published* commit** — the specific version pinned to the gallery page you're looking at, never the owner's newer private draft. Forking is not "grab the author's latest work in progress"; it's "grab exactly what's on display," the same snapshot Open in editor would give you. That holds even when the project on display is your own: forking your own published project also copies its published commit, not whatever you've since changed in the editor.

The Fork control has three faces, depending on where your account stands. Signed out, it's a plain **Sign in to fork** link. Signed in but without a username yet, it reads **Set a username to fork** and sends you to the [username step](/docs/gallery/accounts-and-usernames#your-username) — forking creates public-adjacent things (a lineage others can see, merge requests you can open), so it needs your public handle first. Only when you're signed in *with* a username does it become the real button:

![The gallery project page's action column with a signed-in username: Open in editor, Download all variants, Version history, and a ready Fork this project button](/docs-assets/gallery/fork-button.png "With a username set, the locked 'Sign in to fork' line becomes a real Fork this project button")

## Forking, step by step

The whole flow is two clicks and a short wait. The clip below runs it end to end: it starts on someone else's published project page, forks it, and finishes in the editor with the lineage link on screen.

![Clicking Fork this project on a gallery page, landing in the editor with the fork loaded, then opening the Cloud menu to reveal the forked-from-upstream link](/docs-assets/gallery/clip-fork-flow.webp "Fork, land in the editor, and the Cloud menu now shows a link back to the upstream original")

1. **Click Fork this project.** The button reads **Forking…** for a moment while the server copies the published version into a new project under your account.
2. **Land in the editor.** The fork opens as a new tab, carrying the original's name, and it arrives **already saved to your cloud** — its first commit, messaged `Fork of "…"`, is written for you. This is the quiet difference from Open in editor, which drops an *unsaved local* copy in your lap: a fork is a real cloud project from the first second.
3. **Open the Cloud menu** (the cloud icon, top-right). Alongside the usual Save to cloud, Version history, and Publish items, a fork shows one extra line the [ordinary Cloud menu](/docs/gallery/cloud-saves-and-history#the-cloud-menu) never does:

> **↳ forked from upstream — view source**

That line is the lineage made visible, and it's a **full-page link**, not a menu action — clicking it navigates you to the original's gallery page, so you can always trace a fork back to its source. Further down the same menu — past **Publish to gallery…** — sits **Propose changes to upstream…**, the button that turns your edits into a merge request. The lineage link and that Propose button both appear only on forks, because both need the "forked from" link a fork records and a plain copy doesn't.

## Forks are private

A fork lands in your account as a **private** project — the default for anything you create, and it does *not* inherit the original's public status. It won't appear in the gallery, on your public profile, or at its own `/gallery/:id` URL. Nobody but you can see it until you decide to [publish it yourself](/docs/gallery/publishing), which is a separate, deliberate step you take on your own copy.

Past that, a fork is an ordinary cloud project in every way [the cloud-saves tutorial](/docs/gallery/cloud-saves-and-history) already covered: it counts toward your project and storage limits, you save new commits to it with messages, you can browse and restore its history, and you can publish it as your own gallery entry. The only thing marking it as a fork is that lineage link — everything else is yours to do with as you like.

## Why fork instead of just clone

If a fork is more machinery than a plain copy, why reach for it? Because of the one thing an Open-in-editor copy throws away on purpose: the connection to the original.

An [Open-in-editor copy](/docs/gallery/browsing-without-an-account#open-in-editor-yours-instantly) is a dead end by design — perfect when you just want the *design* and intend to take it your own direction. Nothing you do can reach the original, and the original will never hear from you. A fork keeps the door open: because it remembers its upstream, it can **propose its changes back** for the original's owner to review and merge. That's the whole point of the lineage — it's what makes a fork a contribution rather than a fork in the road.

So the rule of thumb is simple. Just want the layout to build on privately? **Open in editor** is less to think about. Want to improve *this* project — fix a page, add a variant — and offer that improvement back to its author? **Fork it.** How a fork actually sends those changes upstream, and what the owner sees when it arrives, is a merge request — the subject of the next tutorial.

> [!TIP]
> Forking your own published project is completely legitimate, and genuinely useful: it gives you a private sandbox that's linked to your public version but can't disturb it. Experiment freely in the fork — try a redesign, break things, throw it away — and your live gallery entry and its reviews stay exactly as they were. (The sandbox starts from your last *published* commit, the same snapshot anyone else forking it would get — so publish first if you want your newest work in the fork.)
