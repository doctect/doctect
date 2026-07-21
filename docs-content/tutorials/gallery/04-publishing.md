---
title: Publishing to the Gallery
difficulty: intermediate
time: 8 min
summary: The publish wizard — preview pages, live thumbnails, tags that people actually search — and what publishing exposes.
keywords: publish, unpublish, wizard, thumbnails, tags, description, public
prerequisites: gallery/cloud-saves-and-history
---

Your project is [saved to the cloud](/docs/gallery/cloud-saves-and-history) — private, versioned, yours alone. This tutorial is about the menu item that changes that: **Publish to gallery…**, the step that turns one of those private snapshots into a public page anyone can browse, open, download, and fork. You'll walk the wizard end to end, pick the preview pages visitors see first, write a description and tags that actually get found — and, before any of that, get an exact inventory of what goes public, because the honest version of this feature is the only useful one.

## What publishing means

Publishing takes your project's **latest cloud commit** and pins it as the public version. The gallery gains a card; the card opens into [a project page](/docs/gallery/browsing-without-an-account#a-project-page) with your previews, description, tags, and action buttons. From that moment the page is live for everyone — no account needed to view it.

Two properties of that sentence deserve a closer look. First, it's a *commit* that gets published, not a live feed: cloud saves you make afterwards stay private until you run the wizard again, so you can keep working in the open project without the public page moving under your visitors. Second, "public" is bigger than the previews. Here is the full inventory:

| Public once you publish | Stays private |
| --- | --- |
| The **entire project state** of the published version — visitors can open it in their editor and download every variant as PDFs, and any signed-in visitor can fork it. The previews are just the shop window. | Cloud saves you never published. A visitor's [Version history](/docs/gallery/browsing-without-an-account#time-travel-public-version-history) lists published versions only; your in-between saves never appear. |
| **Every version you've ever published.** Each publish adds a row to the public history, and visitors can clone any of them — publishing a fix doesn't hide the version with the mistake. | Your other projects. Publishing is strictly per-project. |
| Saved **generator scripts**, if the project has them — comments included. More below. | Your email and account details. The page credits your [username](/docs/gallery/accounts-and-usernames#your-username) — "by atlas_designs" — and links your public profile, nothing more. |

The published name is the project's name at the moment you publish — rename the tab later and the gallery keeps the old name until your next publish. And everything on the public page updates only through the wizard: republish and your new commit, name, description, tags, and previews replace the old ones in one step.

## The wizard, step by step

Open the **Cloud** menu and pick **Publish to gallery…** — the item appears once the project [has been saved to the cloud](/docs/gallery/cloud-saves-and-history#the-cloud-menu) at least once. It's one dialog rather than a multi-screen march, and it opens by telling you the most important thing itself: *"Publishing makes this project's latest cloud version and previews visible to everyone. Make sure you've saved to cloud first."* While it says that, it's inspecting that latest cloud commit — everything below, previews included, is built from the snapshot, not from whatever is currently unsaved in your editor.

Three decisions, top to bottom:

- **Description** — up to 2,000 characters, and it's markdown: headings, lists, links, and inline code all render on the project page (raw HTML deliberately stays plain text). One catch: the gallery *card* shows your first couple of lines as written, syntax and all, so lead with a plain sentence and save the formatting for further down.
- **Tags** — comma-separated, lowercased automatically. They power search and filtering; the next section is about writing ones that work.
- **Preview pages** — pick **1 to 4** pages from the list (the first page comes pre-checked; the picker lists the first 100 pages of the document order). These become the preview stack on your project page, and the first page in your selection is the card image — the single picture that has to earn the click in a grid of other projects.

![The publish wizard filled in: description and tags written, three preview pages checked in the page list](/docs-assets/gallery/publish-wizard-meta.png "One dialog, three decisions — description, tags, and which pages face the public")

Click **Publish** and the wizard renders your previews right in the browser: it generates the real PDF of the published version (in whichever variant was active when you saved), rasters your chosen pages at preview width, and compresses each to a small WebP image. The finished thumbnails appear in the dialog while it uploads — what you see in that strip is pixel-for-pixel what visitors get. The server accepts 1–4 of them, checks each really is an image, and caps them at 300 KB apiece; then the page goes live and the editor confirms with *"Published! View it in the Gallery."*

![The publish wizard mid-publish: rendered preview thumbnails shown beneath the page list while the upload finishes](/docs-assets/gallery/publish-wizard-pages.png "The previews render in your browser before upload — this strip is exactly what the gallery will show")

> [!NOTE]
> Because the wizard publishes the latest *cloud* version, an edit you made two minutes ago but never saved won't be in it — and the rendered previews will show you exactly that. If the thumbnails look one edit behind, cancel, **Save to cloud**, and publish again. (Accounts can have up to 20 projects published at once, out of 25 cloud projects total.)

## Tags that work

Mechanically, tags are modest: up to 10 per project, 30 characters each, always lowercase. Their reach is what makes them worth a minute of thought. Every tag renders as a chip — up to three on the card, all of them on the project page — and every chip is a filter: one click shows a visitor every project carrying that tag. The gallery's front page promotes the most-used tags into the hero banner with live counts, search matches tags along with names and descriptions, and a filtered view is [a shareable URL](/docs/gallery/browsing-without-an-account#search-tags-and-shareable-filters). One honest limitation to know: the tag *filter* is exact — `plan` does not match `planner` — so the tag itself has to be the word people pick, not a fragment of it.

> [!TIP]
> Tag like a searcher, not like an owner. Someone at the gallery search box types the device they own ("remarkable", "ipad"), the paper size they print ("a5"), the year ("2026"), or the job to be done ("fitness", "teacher", "journal") — so those are the tags that get found. Nobody searches "my-first-project" or "v2". And check the gallery's own tag chips before inventing a word: joining an existing tag with a visible count puts you in a rail people already click, while a private synonym starts its count at one.

## Generator scripts go public too

If the version you're publishing carries [saved generator source](/docs/generator/generator-basics#scripts-travel-with-the-project), publishing makes **both scripts public** — readable by anyone who opens or forks the project, and carried along into every fork. The wizard puts an amber notice above the form whenever this applies, and it means the whole script: code *and* comments.

> [!WARNING]
> Review your scripts the way you'd review anything before posting it: API keys or URLs pasted in for testing, client names in comments, a stray `// TODO` with someone's contact details. And remember the second row of the exposure table — every *published* version stays publicly cloneable, so a secret in a published script isn't retracted by publishing a cleaned-up commit on top. Scrub first, publish second.

## Unpublishing

Publishing is designed to be reversible, and it's worth knowing exactly what the reverse does: unpublishing flips the project back to **private** and takes down the public page — the card leaves the gallery, the page stops resolving for visitors, and the reviews and ratings on it disappear from public view. Nothing is deleted. The server keeps your commits, your publication history, your previews, and the reviews people wrote; publishing again later brings the page back rather than starting a reputation from zero.

That's the design — now the honest state of the app: the current release doesn't yet put an **Unpublish** button in the UI. The platform treats it as a first-class operation (moderators can unpublish a page, and the server supports owners doing the same), but until the button ships you have two levers of your own:

- **Republish over it.** A new publish replaces the name, description, tags, and previews, and pins your new version as the current one. Remember the caveat: earlier published versions remain in the public history, so this fixes the page, not the past.
- **Delete the cloud project** from [My Projects](/docs/gallery/cloud-saves-and-history#my-projects). This is the blunt instrument — it removes the gallery page *and* the entire cloud project with all of its history, permanently. It works, but it's deletion, not unpublishing.

> [!NOTE]
> Whatever takedown path you use, treat everything you publish as seen. A visitor who forked your project while it was public keeps that fork — it's their own copy, and unpublishing or even deleting the original doesn't reach into it. The time to catch a secret is in the wizard, before **Publish**; the previous two sections are that checklist.

Your project now has a public face: a card in the grid, previews you chose, tags that put it in front of the right searches. What happens next involves other people — visitors forking your work, proposing changes back, rating and reviewing it. That's where this track goes from here.
