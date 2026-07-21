---
title: Open URL
summary: The one link target that leaves the document — a verbatim external web address, always rendered, never subject to resolve-or-hide.
aliases: external link, website, url, open url
keywords: url, open url, external, website, https, annotation, linkValue, exempt
---

**Open URL** (`linkTarget: 'url'`) writes the string in its **URL** box into the PDF as a standard external-link annotation, which the reader's viewer hands to the browser. The address is stored **exactly as typed** in `linkValue`, so give it the full `https://…` — a bare `example.com` produces a link most viewers can't open.

URL is the sole target **exempt from resolve-or-hide**: an external link never depends on the node tree, so its element **always renders**, and an empty box is simply not clickable. Every internal target, by contrast, [hides its element when it can't resolve](/docs/reference/on-click-interaction).

See [External URLs](/docs/editor/linking#external-urls).
