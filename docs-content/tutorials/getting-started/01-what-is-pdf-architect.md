---
title: What PDF Architect Is
difficulty: beginner
time: 6 min
summary: The mental model — nodes, templates, variants, and data binding — and a tour of the three-panel editor.
keywords: introduction, concepts, nodes, templates, variants, data binding, interface
---

PDF Architect is a visual builder for complex, hyperlinked, multi-page PDF documents — planners, notebooks, itineraries, recipe collections — the kind of document that can run to hundreds of pages while actually being built from only a handful of distinct layouts. Before you touch a single tool, it's worth understanding the four ideas the whole editor is organized around, and taking a first look at where everything lives on screen. This tutorial has no steps to follow; the next one, *Your First Document from a Preset*, is where you'll actually click through a project.

Here's what that looks like end to end, using one of the built-in presets — the next tutorial walks through the same thing at a slower pace:

![New project walkthrough](/walkthroughs/new_project_creation.webp "Creating a project from the 2026 Planner preset")

## Not another page designer

Most page-layout tools — Canva, Adobe InDesign, Google Slides — work one page at a time. Duplicate a page to get a second one and you now own two independent copies of everything on it; change your mind about where a header sits and you fix it once per page, by hand, forever.

PDF Architect inverts that relationship. You draw a small number of reusable page **templates**, then build a tree of **nodes** — one per logical page, like a day, a chapter, or a stop on a route — where each node simply points at one of those templates. Edit the template once and every node that uses it changes with it, instantly, everywhere. The built-in **2026 Planner** starter project — the one you'll open in the next tutorial — makes the ratio concrete: it's 1,733 nodes total (a full year of quarters, months, and weeks, down to individual days, plus journal, notes, and to-do pages) and every single one of those pages is drawn from just ten templates.

> [!NOTE]
> Everything above happens entirely in your browser. Projects persist locally in IndexedDB through `LocalWorkspaceStore`; cloud storage is explicit opt-in, and saving a snapshot there does not replace the local copy. No account or sign-in is required to design, preview, or export a PDF. An account only matters once you want to save a project to the cloud, publish it to the gallery, or fork someone else's design.

## The four ideas

Four concepts cover everything below: the sidebar, the canvas, the properties panel, and even the code-based generator covered later in these docs are all just different interfaces onto the same four things.

| Concept | What it means |
| --- | --- |
| **Node** | One logical page in your document's hierarchy — a day, a chapter, a stop on a route. Carries a title, a set of custom data fields, and an ordered list of child nodes. No visual information at all. |
| **Template** | A reusable visual layout: shapes, text, grids, arranged once. A node applies a template by matching its `type` field to that template's `id` — many nodes can share the same one. |
| **[Data binding](/docs/reference/data-binding)** | Placeholders like `{{title}}` inside a template's text resolve against whichever node is currently rendering it, so identical text on the template prints differently on every page. |
| **[Variant](/docs/reference/variants)** | A parallel set of templates sized for a different device or paper (a reMarkable versus an iPad, say), sharing the exact same node hierarchy and data. |

Data binding is the least visual of the four, so it's worth one concrete example. Open any day node's properties in the 2026 Planner and you'll find data fields like `day_short: Thu` and `month_short: Jan`. The Day View template's own header text is nothing more than `{{month_short}} {{day_num}}` — on the node for January 1st that resolves to "Jan 01"; the very next node renders the identical template as "Jan 02". Nothing in the template changed — only the node's data did. Even a node's title is available this way: the Month View template's header is just `{{title}}`, so that one template prints "January" on one page and "February" on the next.

## The editor at a glance

Every project opens into the same three-panel layout, whatever you're working on:

![The PDF Architect editor open on the 2026 Planner preset](/docs-assets/getting-started/editor-overview.png "The three-panel editor: hierarchy sidebar, canvas, and properties column")

The **left sidebar** does double duty as two different panels behind one tab bar. **Hierarchy** mode, the default, shows your node tree; click any node and the canvas jumps straight to the page it produces. **Templates** mode swaps the same space for a flat list of your project's templates instead, with a variant switcher above the list — visible even for a project with just one variant, since that switcher is also where you add a second one.

![The left sidebar switched to Templates mode](/docs-assets/getting-started/sidebar-modes.png "The sidebar in Templates mode, listing the project's reusable templates")

The **canvas**, in the middle, always shows exactly one page — whichever node or template is currently selected, rendered at the size its active variant defines. This is where you place and arrange the elements — rectangles, text, grids, lines, SVG artwork — that make up a template.

The **right column** is contextual. Its top section is either Node Properties (in Hierarchy mode: title, data fields, which template the node uses) or Template Settings (in Templates mode: page size, orientation, reflow behavior), depending on which sidebar mode is active. Below that sits the collapsible Layers panel, and below that, Element Properties for whatever is currently selected on the canvas.

## Where to go next

You now have the four words the rest of these docs assume you already know: node, template, data binding, variant. The next tutorial, **Your First Document from a Preset**, puts them to work — opening the 2026 Planner, clicking through its hierarchy, and exporting your first PDF. After that, the **Editor** track works through every canvas tool, panel, and shortcut in order, starting from a single blank page.
