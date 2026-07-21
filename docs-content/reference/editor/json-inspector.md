---
title: JSON Inspector
summary: The JSON button opens the whole project as one editable document — a visual tree or raw text — with Apply Changes landing every edit as a single undo step.
aliases: json editor, raw state, bulk edit, project json, json
keywords: json inspector, json editor, project json, visual mode, text mode, apply changes, undo step, bulk edit, find and replace, format, migration, validate
---

Everything the editor edits — nodes, variants, templates, every element — is one JSON document, and the **JSON** button in the top bar (next to Undo/Redo) opens it directly. The **Project JSON Editor** has two modes: **Visual** is a browsable tree (Nodes, Variants, Other Settings) for surgical edits the panels don't expose, like fixing a typo'd data-field key; **Text** is the same document as raw JSON with a Format button — the bulk-edit surface for a select-all, copy-out, find-and-replace, paste-back round-trip through your own editor.

Nothing you do touches the open project until you commit it. **Apply Changes** validates the document (it must still have its nodes, root, and variants), runs it through the same loader and schema migration that opens any project file, and lands the whole result as **one undo step** — a single `kbd:Ctrl+Z` restores the entire pre-Apply project. Switching Text → Visual validates first and refuses to switch while the JSON doesn't parse, so Visual mode never renders a broken document.

See [The JSON inspector](/docs/editor/variants-svg-json-export#the-json-inspector).
