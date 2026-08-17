---
title: Project Tabs
summary: Every open project is a live tab across the top of the editor — all stay mounted, so switching is instant and loses nothing.
aliases: multiple projects, tab bar, tabs, project tabs
keywords: project tabs, tab bar, tabs, multiple projects, new project, close tab, autosave, root node title, save and close
---

Every open project is a **tab** across the top of the editor, and the **+** at the end of the strip opens the **New Project** dialog. Tabs are fully live — every open project stays mounted, so switching tabs is instant and loses nothing: undo history, zoom, active tool, and selection are all exactly where you left them when you come back. A tab's title is the project's **root page title** — rename the root node in Hierarchy mode and the tab renames itself. Open projects persist locally in IndexedDB through `LocalWorkspaceStore` and are restored on the next visit.

Hovering a tab reveals its close button. Closing asks first, and the dialog's **Save and Close** option downloads the project as a JSON file on the way out — worth taking, since closing removes the project from the IndexedDB workspace. Closing the last tab leaves you with a fresh blank project rather than an empty window.

See [Presets and project tabs](/docs/editor/variants-svg-json-export#presets-and-project-tabs).
