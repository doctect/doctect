---
title: My Projects
summary: The /projects page — every cloud project you own, a 50 MB storage meter, and a transactional Delete that removes a project and all its versions at once.
aliases: project list, storage, my projects, projects page
keywords: my projects, projects, project list, storage, 50mb, storage meter, delete, visibility, public, private, version count, quota, 25 projects
---

**My projects** (in the account menu, or `/projects` directly) is the home for everything the cloud holds under your name — one row per cloud project, showing its name, a **public**/**private** badge (private is the default), its size, how many versions it holds, and when it was last updated. Projects you've only ever kept local never appear; the cloud has never heard of them. The bar on top is your **storage meter**: every account gets **50 MB**, the sum of all commits across all your projects, and it turns red as you approach the limit — a save past it is refused. There's a project-count ceiling too, 25 cloud projects per account.

**Delete** asks once, naming the project and exactly what's at stake, then removes the project, every [commit](/docs/reference/commit) in its history, and its gallery page if it was published — all in one transactional step, with the storage freed immediately. There's deliberately no trash can or grace period, and deleting a cloud project never touches a copy still open in a browser tab.

See [My Projects](/docs/gallery/cloud-saves-and-history#my-projects).
