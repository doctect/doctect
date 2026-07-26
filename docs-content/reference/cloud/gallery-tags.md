---
title: Gallery Tags
summary: Comma-separated labels on a published project that power search and one-click filtering — the tag filter is exact, while search also matches names and descriptions.
aliases: tags, filtering, categories, gallery tags
keywords: tags, gallery tags, filter, filtering, categories, search, exact match, tag chip, url, q parameter, tag parameter, shareable filter
---

**Tags** are comma-separated labels (lowercased automatically, up to 10 per project, 30 characters each) attached when [publishing](/docs/reference/publish-and-unpublish), and changeable afterwards through **Edit listing** without republishing the project. Every tag renders as a clickable chip — up to three on a gallery card, all of them on the project page — and each chip is a filter: one click shows every project carrying that tag, written into the URL as `?tag=<name>`. Search (`?q=`) is broader, matching **names, descriptions, and tags** together, so "planner" finds projects that never use the word in their title but tagged themselves with it.

The catch is that the tag *filter* is **exact** — `plan` does not match `planner` — so a tag has to be the whole word people actually search (the device they own, the paper size they print, the year, the job to be done), not a fragment of it. Because every filter lives in the URL, a filtered view is a shareable link that lands anyone on the same grid, signed out.

See [Search, tags, and shareable filters](/docs/gallery/browsing-without-an-account#search-tags-and-shareable-filters).
