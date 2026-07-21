---
title: Publishing & Unpublishing
summary: The publish wizard pins your latest cloud commit as a public gallery page; there is no user-facing Unpublish button yet, so the levers are republish-over or Delete.
aliases: make public, take down, publish, unpublish, publish to gallery
keywords: publish, unpublish, publish to gallery, wizard, preview pages, thumbnails, description, tags, latest commit, republish, delete, private, public, generator scripts
---

**Publish to gallery…** (Cloud menu) takes your project's **latest cloud commit** and pins it as the public version — a card in the gallery opening onto a project page with previews, description, and [tags](/docs/reference/gallery-tags). It's a single wizard: a markdown **description** (up to 2,000 chars), comma-separated **tags**, and **1–4 preview pages** picked from the document, rendered to live WebP thumbnails right in your browser (what you see in that strip is pixel-for-pixel what visitors get). It's a *commit* that's published, not a live feed — saves you make afterward stay private until you run the wizard again — and every version you've ever published stays publicly cloneable.

Unpublishing is *designed* to flip a project back to private without deleting anything, but **the current release ships no user-facing Unpublish button** (the server supports it and moderators can, but the owner-facing UI isn't there yet). Until it ships you have two levers: **republish over it** (a new publish replaces name, description, tags, and previews and pins a new current version — but earlier published versions remain cloneable, so it fixes the page, not the past), or **[delete the cloud project](/docs/reference/my-projects)** (the blunt instrument — it removes the gallery page *and* the entire project with all its history, permanently).

See [What publishing means](/docs/gallery/publishing#what-publishing-means).
