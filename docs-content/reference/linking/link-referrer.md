---
title: Go to Referrer (Backlink)
summary: Links back to whoever references this page — the first node whose reference points here, resolved to the page that reference sits on.
aliases: who references me, referrer, backlink
keywords: referrer, backlink, who references me, reference, linkTarget, first reference, creation order, week chip
---

**Go to Referrer (Backlink)** (`linkTarget: 'referrer'`) answers "who references *me*?" It finds the first node in the project whose `referenceId` points at the rendering node and links to **that node's parent** — the page the reference actually sits on. It takes **no value field**. The planner's Day View day-of-week chip carries exactly this: January 1 is referenced from Week 1, so the chip links to Week 1 — a jump the parent/child lines can't make, since the day's real parent is January.

"First" means first in **node-creation order**, not configuration — so if a page is ever referenced from two places, which one wins is a matter of project history. The planner never feels this (each day has exactly one reference, its week's), but it is the reason the windowed [Go to Child's Referrer](/docs/reference/link-child-referrer) exists.

See [The referrer family](/docs/editor/linking#the-referrer-family).
