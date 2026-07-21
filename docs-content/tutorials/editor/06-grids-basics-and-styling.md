---
title: Grids I — Sources, Cells, and Table Styling
difficulty: intermediate
time: 12 min
summary: Data grids render a cell per child node — sources, columns and gaps, display fields, cell links, and full table styling.
keywords: grid, data grid, source, children, columns, gap, display field, header row, borders, alternating
prerequisites: editor/data-binding
---

Data Binding turned one template into 365 different-looking pages by binding a placeholder to whichever node happened to be rendering it. A grid is the same idea taken one step further: instead of one text box bound to one node, a single grid element binds to a whole *list* of nodes at once, printing one cell per child. [Your First Document from a Preset](/docs/getting-started/first-project-from-preset) already put two of these in front of you without naming them — the four-cell block that laid Quarter 1 through Quarter 4 out on the Year View page, and the three-cell list of Weeks, Notes, and To-Do Lists right below it — and promised this tutorial would cover exactly how they work. This is where that promise gets paid off, plus the rest of the surface area for turning a plain grid into something that actually reads like a table: borders, a header row, banded rows and columns.

## What a grid is

[Draw a grid](/docs/reference/grid-tool) (`kbd:G`, then drag) and PDF Architect fills it with as many cells as its source has children — one cell per child, arranged into rows and columns. Open the 2026 Planner and look at that Year View page again: a dark, rounded-corner block lays "Quarter 1" through "Quarter 4" out as four cells in a 2×2 arrangement, and a second block just below it lists "Weeks," "Notes," and "To-Do Lists" as three cells in a single column. Both are grid elements. Both draw their cells from the exact same node's children — the Planner's own root, titled "2026 Planner," which has seven children in total: those four quarters, then Weeks, Notes, and To-Do Lists.

> [!WARNING]
> A grid element's own `w` and `h` are **one cell's** width and height — never the whole grid's. The Year View quarters-grid above is stored as `w: 180, h: 60`; what actually shows on the page is a 2×2 block roughly 380×120 (two cells across and two down, plus the 20pt gap between the columns). Resize the element in Geometry and every cell resizes with it, but the grid's total footprint is always `cols × cellWidth + gaps` wide and `rows × cellHeight + gaps` tall — rows aren't even a field you set; there's no "Rows" box anywhere in the panel, because the row count is just however many `cols`-sized groups the child count divides into.

> [!NOTE]
> A brand-new grid with nothing to show yet still draws six placeholder cells labeled "Item 1" through "Item 6" on the canvas, purely so you're not staring at nothing while you set it up. That placeholder is an editing convenience only — point the grid at real children and it's replaced immediately; leave it pointed at a node with none, and the **exported PDF** draws zero cells, not six blank ones. Every grid built in this tutorial is pointed at a node with real children already, for exactly this reason.

## Choosing the source

Every grid's [**Source** dropdown](/docs/reference/grid-source), in **Element Properties → Grid Configuration**, offers exactly two options: **Children of Current Page** and **Children of Specific Page...**. "Current" is the default, and it's what both Year View grids above use — the source is whichever node is rendering the page the grid sits on. On the root's own Year View page, "current" means the root, so its children are those same seven sections. Drop that same grid onto a different template instead and "current" means whatever *that* page's own node is — the source travels with the page, not with the grid.

That's exactly the wrong behavior for a navigation menu meant to look identical no matter which page it's on — a "Quarters / Weeks / Notes" strip repeated on all 365 Day View pages shouldn't switch what it points at 365 times over. That's what **Children of Specific Page...** is for: pin the source to one fixed node, and every copy of the template shows that same node's children, regardless of which node is actually rendering it.

Switch a grid's Source dropdown to **Children of Specific Page...** and a dashed **Select Page...** button appears underneath it. Click it, and the **Select Source Node** modal opens: a node tree starting at the root, the same shape as the Hierarchy sidebar you've been clicking through since your first project, just in a popup so you can pick a target without leaving whichever page you're actually editing.

![A grid element selected on the Year View page, its Source dropdown set to "Children of Specific Page...", and the Select Source Node modal open over the dimmed canvas, listing the 2026 Planner's root and its seven top-level sections](/docs-assets/editor/grid-source-modal.png "Picking a fixed node here means every copy of this grid shows the same seven links, no matter which page it's actually on")

Pick a node — say, the root, "2026 Planner" itself — and the Source field fills in with its title, replacing "Select Page...". From now on this grid always shows that node's children, no matter what template it's placed on.

Neither the 2026 Planner nor the Simple Notebook preset ships a single grid set to "specific" — every grid in both presets uses "current." Reaching for "specific" is a deliberate choice for exactly this repeated-nav-menu case, not the everyday default.

## Columns, gaps, display field

Three fields decide layout and content, all in the same Grid Configuration section: [**Cols**](/docs/reference/grid-columns-and-gaps) (cells per row before wrapping to a new one), **Gap X** and **Gap Y** (pixel spacing between columns and between rows, set independently), and further down, [**Display Template**](/docs/reference/display-field) (what text lands inside each cell).

A freshly drawn grid arrives with Display Template already filled in as `title`, so cells show each child's title from the first moment. Clearing the field doesn't blank the cells either — a grid with an empty Display Template quietly falls back to the title anyway, a grid-specific safety net. That's one place grids differ from text boxes: an ordinary text box with nothing in it renders blank. Type a bare field name with no braces at all — `day_num`, say — and PDF Architect wraps it in `{{ }}` automatically; type a full template with literal characters and more than one placeholder (`{{month_short}} {{day_num}}`) and that works too. A row of quick-insert buttons underneath lists every field it can find across the first 20 resolved children — `title` always included — so the braces rarely need typing by hand at all.

Open the 2026 Planner, switch to Templates mode, select **Month View**, and use the **Preview:** selector to land on **January** — the same template-plus-preview trick Data Binding used, just aimed at a month instead of a day this time. Draw a fresh grid anywhere with room; with "Children of Current Page" as its source, it fills immediately with January's 31 real day nodes, each cell showing that day's title. Set Display Template to `day_num` so every cell shows a bare day number instead, then change **Cols**:

![A grid drawn on the Month View template, showing January's day cells reflow from ten wide columns into fewer, narrower ones as the Cols field changes](/docs-assets/editor/clip-grid-cols.webp "Cols is the only field that changed — the grid still has the same 31 cells, just arranged differently")

Nothing about the source changed — it's still the same 31 day nodes. Only how many sit in each row before wrapping changes: fewer columns means more rows, the grid's total width shrinks and its height grows, in exactly the `cols × cellWidth + gaps` relationship the first section's WARNING described.

## Cells are links

Every cell in a grid is automatically a link to the child it represents — no setup required, and nothing to configure anywhere in the Interaction section. That's true even though a grid still shows the exact same **On Click** dropdown every other element has; a grid's On Click never becomes a link — each cell's destination always comes from its own child node, never from a link field on the grid itself. One caveat: an On Click target that fails to resolve at export still hides the whole grid, cells and all — the same resolve-or-hide rule every element obeys, covered in the Linking tutorial.

That's what turns the Year View quarters-grid from four labeled boxes into four working shortcuts: export the PDF, open it in a real PDF viewer, and clicking "Quarter 2" jumps straight to Quarter 2's own page — the exact behavior [Your First Document from a Preset](/docs/getting-started/first-project-from-preset)'s note about pages "carry[ing] their own navigation links baked into the template" was describing, just from a grid instead of a single text box. This only shows up once the PDF is actually exported; the canvas editor has no click-to-navigate preview of its own, so there's nothing to try live while you're still editing. Here's what it looks like once it's a real, exported PDF:

![Interactive navigation](/walkthroughs/interactive_navigation.webp "Building a navigation menu with a data grid")

If a cell's child is itself a reference — a node that just points at another node elsewhere in the tree — the cell still links correctly, straight through to whatever the reference points at. A grid treats a reference child exactly like an ordinary one; what a reference actually is waits for a later tutorial.

## Table styling

Everything so far only answered "where's the data, and how many columns." The rest of Grid Configuration — a **Grid Formatting** block underneath Display Template — turns a plain grid into something that reads like an actual table: borders, a shaded header, banded rows.

A grid actually carries two entirely separate border systems, and it's easy to configure one and expect it to control the other. The element's own **Stroke** / **Per-Side Borders**, up in Appearance — the same controls every rectangle and text box has — draw once around the grid's whole outer footprint, on top of every cell. [**Cell Border Mode**](/docs/reference/grid-border-modes), here in Grid Formatting, is different: it's cell-level, controlling the lines between and around individual cells, and has nothing to do with Stroke.

| Cell Border Mode | Draws a border on... |
| --- | --- |
| All Borders | Every edge of every cell |
| Outside Only | Only the edges tracing the grid's own outer rectangle — no lines between cells |
| Inside Only | Only the edges shared between two neighboring cells — the exact opposite of Outside |
| No Borders | Nothing, regardless of any color or width set below |

In every mode except No Borders, a **Cell Border** row underneath sets the actual look (pick No Borders and the row disappears entirely): a color swatch, a width, a style (Solid, Dashed, Dotted, Double, or None), and a corner radius — all four grid-specific, never writing back to the element's own Stroke controls. One subtlety about the width: on a freshly-drawn grid the box *displays* a number borrowed from Stroke Width (usually 1), but the stored value — and what actually renders — stays 0 until you touch the field yourself. So a new grid shows no cell borders no matter which mode is selected; Cell Border Mode only ever decides *where* a border could go, not whether one actually exists. Type a width (even re-typing the borrowed number) and the borders appear. One more toggle, [**Empty Cell Borders**](/docs/reference/empty-cell-borders) (off by default, hidden in No Borders mode), draws the border for slots with no real cell in them at all, like the leading gap before day 1 in an offset calendar — leave it off and those slots stay invisible.

The next four blocks share one shape: a toggle, and — only once it's on — a small cluster of color swatches that appears beneath it.

| Toggle (panel label) | Re-styles | Its own swatches |
| --- | --- | --- |
| [**Header Row**](/docs/reference/header-row) | Row 0 — whichever real cells land in the grid's first row | Fill, text color, Bold |
| [**First Column**](/docs/reference/first-column) | Column 0 — whichever real cells land in the grid's first column | Fill, text color, Bold |
| [**Alternate Rows**](/docs/reference/alternating-rows-and-columns) | Every other data row | One fill, for the odd rows |
| **Alternate Columns** | Every other column | One fill, for the odd columns |

> [!NOTE]
> The toggle alone changes nothing visible. Flipping **Header Row** on stages row 0 for special treatment, but until at least one of its own swatches — fill, text color, or Bold — is actually set, that row renders in the exact same colors as every other cell. The same is true of the other three: the switch and the color are two separate steps, and skipping the second makes the first look like it did nothing.

> [!WARNING]
> **Header Row** doesn't add a new row of column labels — it re-styles whichever real cells already land in row 0. A calendar's top week is still seven real days; turning Header Row on just paints them differently. If row 0 is supposed to actually *say* "Sun, Mon, Tue…" instead of a date, that text has to come from the source data itself — the toggle only ever supplies formatting, never content. **First Column** works the same way, one column instead of one row.

Two wrinkles worth knowing before reaching for these. Where a cell sits in *both* the header row and the first column — the top-left corner — First Column wins; it's applied after Header Row, so its colors are the ones that actually show. And Alternate Rows quietly restarts its own counting the row *after* the header, when one is on, so the header row never doubles as a banded row too; Alternate Columns gets no equivalent adjustment from First Column, and always counts from the grid's real column 0 regardless.

Build one to see all of it at once. Still in the 2026 Planner's Month View, use the **Preview:** selector to land on **June** — 2026's June 1st falls on a Monday, so June's calendar has nothing blank in its first row: seven full, real day cells, left edge to right. Select that existing calendar grid right on the canvas (no need to draw a new one — it's already there, doing exactly what "Choosing the source" described), turn on **Header Row** and set a fill and text color, then turn on **Alternate Rows** and set its fill too:

![June's Month View calendar grid with Header Row styling its first full week and Alternate Rows shading every other week beneath it](/docs-assets/editor/grid-table-styling.png "Two toggles and two color swatches, and the same 30 day cells suddenly read like a table")

Same 30 cells, same source, same seven columns — only the formatting changed.

## Where grids get their data

Every cell's text resolves exactly the way a bound text box's does: Display Template runs against whichever child that cell represents, pulling from that node's own title or its data fields. Nothing about how field resolution itself works changes inside a grid — it just runs once per child instead of once per page.

References resolve the same way links do. Point a grid's source at a node whose children include a reference, and that cell shows the *target's* data and links to the *target's* page, exactly as if the reference weren't there at all — a grid never shows a reference's own, empty data.

This tutorial covered the everyday shape of a grid: a source, a layout, and a look. Grids II picks up from here with the parts that only come up for denser data — drilling into grandchildren instead of direct children, slicing which items actually show, and offsetting a grid's first cell by a calculated amount, the same offset Data Binding's note about `weekday_num` promised an explanation for.
