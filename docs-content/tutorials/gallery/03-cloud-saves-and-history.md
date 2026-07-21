---
title: Cloud Saves & Version History
difficulty: beginner
time: 7 min
summary: Explicit snapshots to the cloud, a commit history you can restore from, and the My Projects page.
keywords: cloud, save, commit, history, restore, my projects, storage, snapshot
prerequisites: gallery/accounts-and-usernames
---

You have [an account and a username](/docs/gallery/accounts-and-usernames). This tutorial is about the first thing they unlock: putting a project in the cloud — on your terms, one deliberate snapshot at a time — and getting any of those snapshots back later. By the end you'll have saved a project twice, restored the older version, watched the editor revert in front of you, and visited the page where all your cloud projects live.

## Explicit saves, immutable commits

The single most important thing to understand about cloud saves is what they *aren't*: they aren't sync. Nothing watches your editing, nothing uploads in the background, and closing the tab sends nothing anywhere. Your project lives in your browser, exactly as it has since [your first project](/docs/getting-started/first-project-from-preset), until the moment you open the **Cloud** menu and click **Save to cloud** — and what that sends is a snapshot of that moment, not a live connection.

Each save asks you one question: *"Describe this save (commit message)"* — it suggests "Initial save" the first time and "Update" after that, but a message in your own words ("Added the habit tracker", "Fixed the cover font") is what makes the history readable later. Press Cancel and nothing is saved at all; leave the message empty and it's recorded as "Update".

Every save becomes a **commit**: a complete, immutable snapshot of the whole project with your message and a timestamp. Immutable is the load-bearing word — a new save never modifies or overwrites a previous commit, it stacks a new one on top and moves the project's "latest" pointer (you'll see it labeled **HEAD** in the history) to it. Your project's cloud history only ever grows forward, which is exactly what makes the restore section below safe.

Two consequences of that design are worth knowing up front:

- **Identical saves don't stack duplicates.** Save, change nothing, and save again: the server notices the content is byte-for-byte the same as the latest commit and quietly reuses it. The save still "succeeds" — the menu closes as usual — but Version history gains no new row. You can't clutter your own history by being save-happy.
- **History is deep, not bottomless.** Each project keeps its most recent **50** commits; older ones are eventually pruned as new saves push past that. Commits you've published to the gallery (and any involved in an open merge request) are never pruned — a published version stays retrievable forever.

> [!NOTE]
> Because saving is explicit, so is *not* saving. If you edit for an hour and never click **Save to cloud**, the cloud still holds only your last snapshot — there is no autosave to fall back on. The habit that pays off: save whenever you'd be annoyed to lose what you just did, with a message that says what it was.

## The Cloud menu

Everything above happens in one place: the **Cloud** menu, the small cloud icon in the editor's top-right, next to your account menu. What's inside depends on where your account stands — it has three states:

| Your situation | What the menu shows |
| --- | --- |
| Signed out | A single line: **Sign in to save to cloud** — a link to the sign-in page. |
| Signed in, no username yet | **Set a username to use cloud features** — the `/welcome` prompt [from the last tutorial](/docs/gallery/accounts-and-usernames). Cloud saves are public-adjacent (they can be published, forked, proposed against), so they need your public handle first. |
| Signed in with a username | The full menu below. |

The first save on a fresh project reads **Save to cloud (new)** — "new" because it's about to create the project's cloud record. Once that's done, the tab is linked to its cloud project and the menu grows into its full form:

![The editor with the Cloud menu open, showing Save to cloud, Version history, and Publish to gallery for a cloud-linked project](/docs-assets/gallery/cloud-menu.png "One save in, the menu is fully unlocked: save again, browse history, or publish")

- **Save to cloud** — another snapshot, another commit message, another row in the history.
- **Version history** — the list of every commit, with **Restore** on each. The next section is all about it.
- **Publish to gallery…** — turns a commit into a public gallery page. That's the next tutorial's whole subject.

One more item appears only on projects you *forked* from someone else's gallery project: a small **↳ forked from upstream — view source** link back to the original, plus **Propose changes to upstream…** for sending your edits back as a merge request. Forks and merge requests get their own tutorials later in this track — for now, just know the menu will tell you when a project has an upstream.

> [!TIP]
> If you save from two browsers (or two machines) against the same cloud project, the second save may be told: *"Cloud project changed since your last save. Local edits are unchanged."* That's the immutability guarantee protecting you — the cloud won't silently overwrite a version it has that you haven't seen. A **Reload cloud version** button appears right there in the menu: click it to load the cloud's latest into your editor, or keep editing locally and save again once you're sure which version should win.

## Restoring an old version

Time to use the history for what it's for. This walkthrough matches the clip below, step for step — follow along with any project, or recreate it exactly: a fresh **Simple Notebook** project renamed "Sketchbook", already saved to the cloud once with the message "Set up sections".

1. **Make a visible change.** In the sidebar, select the **Project B** section and, in the Properties panel's **Title** field, rename it to **Ink Studies**. The sidebar row and the section divider on the canvas both update as you type.
2. **Save the change.** **Cloud → Save to cloud**, message: "Rename Project B to Ink Studies". Your history is now two commits deep.
3. **Open the history.** **Cloud → Version history**. Newest first: "Rename Project B to Ink Studies" tagged **HEAD**, then "Set up sections" below it, each with its timestamp.
4. **Restore the older one.** Click **Restore** on "Set up sections". The editor asks: *"Replace the current editor contents with this version? (Unsaved local changes will be lost — your cloud history is untouched.)"* — confirm it.
5. **Watch the revert.** The whole tab snaps back to the older snapshot: the sidebar says **Project B** again, the canvas divider says **Project B** again. It's not an undo of one change — it's the entire project exactly as it was at that save, down to which node was selected.

![Renaming a notebook section, saving to the cloud, opening Version history, and restoring the previous commit — the rename visibly reverts in the sidebar and on the canvas](/docs-assets/gallery/clip-restore.webp "Rename, save, restore: the whole project returns to the older snapshot, and the history keeps both versions")

Now the part that makes restore safe to play with: **nothing happened to the cloud.** Open Version history again and both commits are still there — HEAD is still the rename. Restoring is a purely local act: it changes what's in your editor, not what's on the server. Want the old version back as the *newest* version too? Just save again — that stacks a new commit with the old content on top, and the rename commit stays in history beneath it. You can hop to any version, in either direction, as many times as you like, and the history only ever records more.

Two honest caveats. First, the confirm dialog means what it says: whatever was in the editor *and not yet saved* is gone when you restore — and a restore also resets the editor's undo stack, so `kbd:Ctrl+Z` won't bring the pre-restore state back. If the current state matters, save it first; then it's a commit, and commits are never lost to a restore. Second, what you see in this modal is the *owner's* view: every commit, private saves included. Visitors to your published project see [a shorter list — only the versions you've published](/docs/gallery/browsing-without-an-account#time-travel-public-version-history), and their button clones a copy instead of touching your work.

## My Projects

Saved projects need a home page, and it's the **My projects** entry in your account menu (top-right), or `/projects` directly:

![The My projects page: storage usage bar, then one row per cloud project with visibility, size, version count, and a delete button](/docs-assets/gallery/my-projects.png "Every cloud project you own — public or private — with the storage meter on top")

Each row is one cloud project: its name, a **public** or **private** badge (private is the default — publishing is what flips it), its size, how many versions it holds, and when it was last updated. This list is the full inventory of what the cloud holds under your name — projects you've only ever kept local don't appear, because the cloud has never heard of them.

The bar on top is your **storage meter**: every account gets **50 MB**, the sum of all commits across all your projects. Snapshots of typical planners are small, so this goes further than it sounds — but a project saved fifty times does carry fifty snapshots' worth of weight. The bar turns red as you approach the limit, and a save past it is refused with a message pointing right back to this page. (There's a project-count ceiling too — 25 cloud projects per account.)

Which is what **Delete** is for. It asks once, naming the project and exactly what's at stake — *"Delete "Sketchbook" and all 2 of its saved versions? This cannot be undone."* — and it means it: the project, every commit in its history, and its gallery page if it was published, all gone in one step, and the storage comes back immediately. There's deliberately no trash can or grace period. If some version of the project might still matter, this is the moment to open it and check — after confirming, no restore can reach it.

> [!NOTE]
> Deleting a cloud project never touches your browser. If the project is still open in a tab, everything local stays — you've deleted its cloud copy and history, not your working copy. The reverse is also true, from the first section: closing a tab never deletes the cloud copy. Local and cloud only ever change when you explicitly act on that side.

## Where you stand

Your work can now outlive your browser: named snapshots on the server, a history you can walk backward and forward without ever losing a version, and one page that shows everything the cloud holds for you. What your projects *can't* do yet is be seen — every save so far is private. Turning a commit into a public gallery page, with previews, tags, and a description, is exactly where this track goes next.
