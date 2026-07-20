---
title: Your First Document from a Preset
difficulty: beginner
time: 8 min
summary: Open the 2026 Planner preset, explore how pages and templates relate, and export your first PDF.
keywords: preset, planner, notebook, new project, export, pdf, tabs
prerequisites: getting-started/what-is-pdf-architect
---

The previous tutorial named the four ideas this editor is built on — nodes, templates, data binding, variants — without touching a single button. This one is the opposite: no new vocabulary, just eight minutes of clicking through a real project end to end, from creating it to exporting a finished PDF. Everything below uses a built-in preset, so there's no design decision to get wrong — you're only exploring something that already exists.

## Create the project

Open PDF Architect and go to the editor. If this is a fresh browser, a single tab named "Blank Project" is already sitting there waiting for you — every first visit gets one automatically. To start something new alongside it, click the **+** at the end of the tab bar (hover it and the tooltip confirms: "New Project").

![The New Project modal, open on its three built-in preset cards](/docs-assets/getting-started/new-project-modal.png "Blank Project, Simple Notebook, and 2026 Planner — the three built-in starting points")

That opens a modal offering three built-in presets:

| Preset | What it gives you |
| --- | --- |
| **Blank Project** | Start fresh with a single A4 page. Perfect for creating custom layouts from scratch. |
| **Simple Notebook** | A structured digital notebook with a cover, subject dividers, and lined/grid pages. |
| **2026 Planner** | A complex, hyperlinked planner with Year, Month, Week, Day, and Tracker views. |

Each card is a real, focusable button — tab to one and press `kbd:Enter` or `kbd:Space` if you'd rather not reach for the mouse. Click **2026 Planner**.

A new tab appears next to "Blank Project" — but read its label closely: it says "Planner 2026," word order flipped from the card you just clicked. That's just this one tab's own name; the project itself, and every page inside it, uses the title you'd expect, "2026 Planner." Either way, it's the same project, and it's what the rest of this tutorial explores.

> [!TIP]
> Projects like this one live only in your browser's local storage — nothing is uploaded anywhere until you explicitly save to the cloud, which a later tutorial in the Gallery track covers. That also means the tab bar really is just a list of "currently open," nothing more: it holds as many projects side by side as you want, and opening a preset never closes or replaces a tab that's already there — it adds a new one.

## Explore the hierarchy

The sidebar opens in Hierarchy mode — the default — with the root node, "2026 Planner," already expanded and already selected; that's the very first thing a freshly opened project shows you. The canvas displays its Year View page, and on the right, Node Properties confirms what you're looking at: Title "2026 Planner," Assigned Template "Year View," one data field, `year: 2026`.

Seven children hang off that root: **Quarter 1** through **Quarter 4**, then **Weeks**, **Notes**, and **To-Do Lists**. Each one starts collapsed — look for the small arrow to its left, pointing right instead of down. Click the arrow next to **Quarter 1**, and three months appear underneath it: January, February, March. Click **January** itself to select it and step down another level.

![The sidebar with the "January" month node selected, one level under Quarter 1](/docs-assets/getting-started/planner-month-view.png "Selecting a month node switches the canvas to the Month View template")

The canvas swaps to the Month View template, and the properties panel updates to match: Title "January," Assigned Template "Month View," and data fields including `month_name: January` and `quarter_name: Quarter 1` — the same kind of per-node values the previous tutorial's `{{title}}` and `{{month_short}}` bindings pulled from.

Keep drilling and the pattern repeats: expanding **January** reveals its 31 day nodes; selecting one switches the canvas to Day View; and every day node has two children of its own, **Journal** and **Daily Notes** — both blank pages waiting for your handwriting, and both dead ends. Year → Quarter → Month → Day → Journal/Daily Notes is as deep as this hierarchy goes: five levels, root to leaf.

## Peek at the templates

Click **Templates** at the top of the sidebar. Same space, a completely different job: instead of your node tree, you get a flat list of every template in the project — ten of them, named for what they draw: Year View, Quarter View, Month View, Week View, Day View, Journal, Daily Notes, List Index, Global Note, and To-Do Page. **List Index** is worth pointing out by name — it's what **Weeks**, **Notes**, and **To-Do Lists** (three of the root's seven children, from a moment ago) actually use, and it's why each of those renders as a simple linked list rather than content of its own.

Every one of those ten templates started life as a blank canvas that somebody — whoever built this preset — filled in by hand: pick up the text tool, draw a box, drop in a grid, place it, nudge it, done. It's exactly what you'll do yourself in the Editor track, and exactly what this clip shows:

![Placing a shape and a text element on a template by hand](/walkthroughs/manual_document_design.webp "Building a template's elements one at a time — the same tools the Editor track covers")

Above the canvas, in Templates mode only, sits a **Preview:** selector — a dropdown listing every node that uses whichever template is currently selected, so you can check how one design looks with different data before you touch it. Right now it's stuck showing a single option, because only the root node uses Year View. Click **Month View** in the list on the left instead, and that dropdown fills with twelve real choices, January through December: pick any one and the canvas re-renders with that month's own title and fields — no editing involved, just previewing.

![Templates mode with Month View selected and its Preview selector listing all twelve months](/docs-assets/getting-started/template-preview-selector.png "The Preview selector chooses whose data fills the currently selected template")

## Export a PDF

Back at the top of the editor — the same row as Undo/Redo and the JSON button — three controls sit together: a greyscale toggle, **Export PDF**, and **Export All Variants**. Export PDF renders whichever variant is currently active — for this project, fresh out of the preset, that's the only variant it has, named "Default" — and downloads it immediately. The greyscale toggle right next to it (hover it and the tooltip flips between "Greyscale Export: ON" and "OFF") applies to that same export.

Export All Variants sits right after it, and right now it's greyed out: it only turns on once a project has more than one variant, and the 2026 Planner preset starts with exactly one. Add a second variant later — the same **+** in the Templates-mode variant switcher from the previous tutorial — and this button re-enables; click it then and it downloads one PDF per variant, one after another, rather than a single combined file.

> [!NOTE]
> Nearly every page in this preset carries its own navigation links baked into the template — a link back to its parent, to a sibling, sometimes to one specific node elsewhere in the tree. Those aren't just cosmetic: export the PDF and each one becomes a real internal link, jumping straight to the right page in Adobe Acrobat, most browsers' built-in viewers, and any other reader that honors internal PDF links. A handful of minimal readers ignore them and just show a plain page.

## What you just used

Everything in this tutorial has an Editor-track tutorial waiting to go deeper on it. The parent/child hierarchy you just clicked through — root to quarter to month to day — is the exact subject of **Canvas Basics**, the Editor track's first tutorial, built up from a single blank page instead of a 1,733-node preset. The grid that laid Quarter 1 through Quarter 4 out as four cells in one box on the Year View page — each cell its own link straight to that quarter's page once exported — and the one that turns a month's days into a calendar on Month View, are exactly what **Grids I** and **Grids II** cover in depth; the parent/sibling/specific-node links wired into nearly every template you saw are **Linking**'s entire subject. All three are the sixth, seventh, and eighth tutorials in the Editor track, right after Canvas Basics.
