---
title: Browsing the Gallery Without an Account
difficulty: beginner
time: 8 min
summary: Search, tags, and curated rows; open any public project in your editor, download every variant, or clone a past version — no sign-in needed.
keywords: gallery, browse, anonymous, search, tags, open in editor, download, zip, version history, clone
prerequisites: getting-started/first-project-from-preset
---

Everything in this tutorial works signed out. That's worth saying up front, because the gallery looks like the kind of feature that would demand an account before letting you touch anything — and it doesn't. Browsing, searching, opening a community project in your own editor, downloading its PDFs, even cloning an old version of it: all of it is open to anyone who clicks **Gallery** in the top bar. The main things that genuinely need an account are forking and writing reviews, and this tutorial will point at them exactly once, near the end, so you know where the line sits.

Signing up is covered later in this track. For now, stay logged out on purpose — it makes the boundary obvious.

## The gallery in one look

Click **Gallery** in the header (it's there on the landing page, the docs, and this same top bar across the app), or go straight to `/gallery`. The default view has three layers:

![The gallery landing view, signed out: hero banner with tag chips, and the Top rated row of project cards](/docs-assets/gallery/gallery-home.png "No account, no prompt — the full gallery, with curated rows below the hero")

- **A hero banner** — "Discover planner & notebook templates" — with a row of [**tag chips**](/docs/reference/gallery-tags) underneath. Each chip is a real tag someone attached to a published project, with a count of how many projects carry it. Click one and you jump straight to a filtered view of that tag.
- **A search box**, pinned above the hero, that stays with you as you scroll.
- **Three curated rows**, each holding up to eight cards: **Top rated** (star icon), **Popular** (flame), and **Recently updated** (clock). Each row's header carries a **See all →** link (top right) that expands it into a full, pageable grid.

Each card shows the project's preview image, name, author, a line of its description, up to three of its tags, and — once anyone has rated it — a star score, plus small fork and download counts along the bottom. The tags on a card are themselves clickable: they filter the gallery rather than opening the project.

## Search, tags, and shareable filters

Type into the search box and the gallery switches from curated rows to a single filtered grid. Search doesn't just match project names — it matches **names, descriptions, and tags**, so "planner" finds projects that never use the word in their title but tagged themselves with it.

Here's the part worth noticing: every filter you apply is written into the page's address. Type "notebook" and the URL becomes `/gallery?q=notebook`. Click the "minimal" tag chip and it's `/gallery?tag=minimal`. Click **See all →** on the Top rated row and it's `/gallery?sort=rating`. These compose — a search within a tag, sorted by rating, pages deep — and the URL keeps up.

> [!TIP]
> Because filters live in the URL, a filtered view is a link like any other. Bookmark `/gallery?tag=notebook`, or send it to someone, and they land on exactly the grid you were looking at — signed out, no setup. This is also why the browser back button behaves sensibly here: each tag, sort, or page change is a step it can retrace (typed searches update the address in place rather than piling up a history entry per keystroke).

In the filtered grid you get a few extra controls the curated view doesn't need: a **sort dropdown** (Newest, Popular, Top rated), the active tag shown as a removable chip with an **×**, **Previous / Next** paging at the bottom, and an **← All projects** link that clears everything and returns to the curated rows.

## A project page

Click any card and the project opens. Two things happen at once: the project's page appears as an **overlay** — a panel floating above the gallery, with the grid still dimly visible behind it — and the URL changes to that project's own address, `/gallery/` followed by its id. Press `kbd:Esc`, click the **×**, or click the dimmed background to drop back to the gallery exactly where you left it.

> [!NOTE]
> That URL in the address bar is the project's real, permanent address — copy it, bookmark it, share it. Anyone who opens it directly (or refreshes while the overlay is up) gets the same content as a full standalone page instead of an overlay, complete with the normal header. Same information either way; the overlay is just the gentler presentation when you're already mid-browse.

![The standalone project page: preview pages on the left, title, author, tags, and the action buttons on the right](/docs-assets/gallery/project-page.png "One public project — previews, description, stats, and every action an anonymous visitor can take")

A project page collects everything its owner chose to publish:

| On the page | What it is |
| --- | --- |
| **Preview pages** | Up to six page images the owner picked when publishing — a cover, a divider, an inside page. |
| **Title and author** | The author's name links to their public profile and their other published work. |
| **Rating and reviews** | The star average, count, and written reviews are visible to everyone — signed out included. Writing one is where "Sign in to review" appears. |
| **Description and tags** | The owner's pitch, plus clickable tags that jump back to a filtered gallery. |
| **Fork and download counts** | Small live tallies of how often this project has been forked and downloaded. |
| **Report** | A quiet link at the bottom of the actions. It asks for a reason and sends the project to the moderators — also available signed out. |

And then there's the column of action buttons — [**Open in editor**](/docs/reference/open-in-editor), [**Download all variants (.zip)**](/docs/reference/download-all-variants), **Version history** — which the next three sections take one at a time. Signed out, a fourth line reads "Sign in to fork"; that's the one locked door, and we'll get to it.

## Open in Editor — yours, instantly

**Open in editor** does exactly what it says: it loads the project's published version into your own editor as a new tab, sitting alongside whatever you already had open. No account, no confirmation, no waiting. From that moment it behaves like any project you built yourself — the same sidebar hierarchy, templates, and export buttons you used in [your first preset project](/docs/getting-started/first-project-from-preset), except the pages were designed by someone else.

The important word is *yours*. What lands in your editor is a **copy with no strings attached**: it lives in your browser like any local project, and it keeps **no link back to the original**. Edit every page, delete half the hierarchy, export PDFs — the published project never knows, and nothing you do can touch it. There is deliberately no "update from the original" or "send changes back" on a copy like this.

That last part is the difference between opening and [*forking*](/docs/reference/fork). A fork — the signed-in feature — creates a copy that **remembers where it came from**: it carries a "forked from" line, and it can propose its changes back to the original for the owner to review. Forking, and the merge requests it unlocks, get their own tutorials later in this track. If you just want the design, **Open in editor** is the whole story.

## Download all variants

Maybe you don't want to edit anything — you want the PDFs on your tablet. **Download all variants (.zip)** renders every [variant](/docs/editor/variants-svg-json-export) the project defines — device sizes, color schemes, whatever the owner set up — as **one PDF each**, named after the variant, and hands you a single zip file. The rendering happens right in your browser (the button reads "Generating…" while it works), so give a large planner a moment.

A project with just one variant still works — the zip simply holds one PDF. For something like a planner published in A4, A5, and e-ink editions, this is the fastest possible path from "found it in the gallery" to "on my device": one click, one zip, every edition.

## Time-travel: public version history

The third button, **Version history**, opens a list of the project's published versions — newest first, the current one marked **HEAD** — each with the owner's own message describing what changed, and a timestamp.

![The Version history modal over the project page, listing two published versions with an Open in editor action on each](/docs-assets/gallery/version-history-clone.png "Every published version is one click from becoming a fresh local project")

Every row has its own **Open in editor**. Click one on an older version and that snapshot — not the current one — opens as a brand-new local project in your editor. It's the same no-strings copy as before: nothing you have open is touched or replaced, which is why there's no "are you sure?" step, and the cloned old version has no link back either. Grabbed the current version earlier and preferred how the cover looked two releases ago? Clone both and compare them side by side, tab against tab.

> [!NOTE]
> The history you see here is the list of versions the owner **published** — each entry is a deliberate release. The private saves an owner makes between publishes never appear; work in progress stays theirs until they choose to publish again.

## Where the line actually is

You've now used everything the gallery offers an anonymous visitor: curated rows, search that reads names, descriptions, and tags, shareable filtered URLs, overlay and standalone project pages, no-strings copies via **Open in editor**, zipped PDFs of every variant, and clones of any published version. The only things that asked you to sign in were the ones that *say* something to other people — rating, reviewing, forking, publishing your own work. Those are what the rest of this track is about, starting with creating an account and saving your first project to the cloud.
