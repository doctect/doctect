---
title: Save to Cloud
summary: An explicit, on-demand snapshot of a project to the server — not sync — reached from the Cloud menu; each save becomes an immutable commit.
aliases: save to cloud, sync, cloud save, backup
keywords: save to cloud, cloud save, cloud menu, snapshot, commit, sync, autosave, reload cloud version, head, dedupe
---

**Save to cloud** (the cloud icon, top-right of the editor) sends the whole project to the server as one deliberate snapshot — it is *not* sync. Nothing watches your editing or uploads in the background, and closing the tab sends nothing anywhere; your project stays in the browser until you click it. Each save asks for a [commit](/docs/reference/commit) message and stacks a new immutable commit, advancing the project's **HEAD** pointer. The first save on a fresh project reads **Save to cloud (new)**; once that cloud record exists the menu grows [Version history](/docs/reference/version-history-restore) and Publish.

Because saving is explicit, so is *not* saving — there is no autosave to the cloud, so the cloud is only ever as fresh as your last click. Two behaviors worth knowing: **identical content dedupes** (save, change nothing, save again, and the server reuses the latest commit rather than adding a duplicate row), and saving the same cloud project from two browsers can surface *"Cloud project changed since your last save"* — a **Reload cloud version** button then replaces the tab with the cloud's latest, so copy out anything unsaved first.

See [Explicit saves, immutable commits](/docs/gallery/cloud-saves-and-history#explicit-saves-immutable-commits).
