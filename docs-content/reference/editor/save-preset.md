---
title: Save Preset
summary: Save the whole current project as a reusable starting point — a card in the New Project dialog that spins off deep, independent copies.
aliases: custom preset, reusable template project, preset, save preset
keywords: save preset, preset, custom preset, new project, template project, deep copy, migration, IndexedDB, LocalWorkspaceStore, local persistence, starting point
---

**Save Preset** — the amber button at the toolbar's right end — asks for a name and description, then files the current project as a card in the **New Project** dialog, right alongside the built-ins. Every project created from a preset is a deep, independent copy — migrated forward automatically if the app's format has moved on since you saved — so nothing you do in the new project can reach back into the preset, or into any sibling created from it.

Custom presets persist locally in **IndexedDB through `LocalWorkspaceStore`**: they survive reloads, but they don't follow you to another machine. Clearing site data still removes this local data. To move a design between machines or people, export the project itself as JSON — the [JSON inspector](/docs/reference/json-inspector)'s Text mode, or the download offered when closing a tab — and import it on the other side.

See [Presets and project tabs](/docs/editor/variants-svg-json-export#presets-and-project-tabs).
