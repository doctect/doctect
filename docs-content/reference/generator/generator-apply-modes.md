---
title: Applying a Generated Project
summary: The two ways a preview reaches real state — Create As New (a name prompt, original untouched) or Replace Current Project (one confirm, one undo checkpoint).
aliases: create as new, replace current project, apply
keywords: apply, create as new, replace current project, project name, undo checkpoint, confirmation, generator
---

A preview reaches real state exactly two ways, from its footer. **Create As New Project** opens a small dialog with a **Project name** field (prefilled "*your project* – Generated") and creates the result as a brand-new tab in the project bar — the project you ran the generator from is **untouched**. This is the safe default.

**Replace Current Project** swaps the current tab's entire contents — hierarchy, templates, variants — for the generated result, after a browser confirmation. The replacement is recorded as **one undo checkpoint**: a single `kbd:Ctrl+Z` restores the whole previous project no matter how many hundred pages were overwritten. (The scripts toolbar's **Apply Generated Project** button is the same replace path.) Because there is no reverse sync from the canvas back to the scripts, Replace overwrites hand-made edits — treat the [saved scripts](/docs/reference/generator-provenance) as the source of *structure*, not a mirror of the document.

See [Applying the result](/docs/generator/generator-basics#applying-the-result).
