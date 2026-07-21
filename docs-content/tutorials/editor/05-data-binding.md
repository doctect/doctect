---
title: Data Binding & Node Data
difficulty: beginner
time: 8 min
summary: Make one template say the right thing on every page — {{title}}, custom data fields, and the preview-node selector.
keywords: data binding, placeholder, title, fields, node data, preview, curly braces
prerequisites: editor/canvas-basics
---

Canvas Basics covered every tool for putting a shape or a text box onto a page, but it never asked what that text actually *says*. This tutorial does. Back in [What PDF Architect Is](/docs/getting-started/what-is-pdf-architect), one line claimed that a single Day View template prints "Jan 01" on one page and "Jan 02" on the next without anyone touching the template itself — and in [Your First Document from a Preset](/docs/getting-started/first-project-from-preset) you clicked a **Preview:** selector that made exactly that happen, a month at a time. This tutorial is where you drive both of those yourself: how to write a placeholder, where a node's data actually comes from, and what happens when a placeholder points at nothing at all. Everything below uses the 2026 Planner preset, so there's real data already sitting there to bind against.

## One template, many pages

The 2026 Planner preset has 365 day nodes — one for every date in the year — and every single one renders through the exact same Day View template: one title box, one quarter chip, one month chip, one day-of-week chip, two link labels, laid out exactly once. Nobody built 365 near-identical pages by hand. What makes that one layout print "Jan 01" and "Thu" on one page, and a completely different pair of words on the next day's page, is [data binding](/docs/reference/data-binding): a placeholder living inside the template's own text, resolved fresh against whichever node happens to be rendering that copy of the template right now.

The rest of this tutorial makes that mechanism concrete: how to write a placeholder yourself, how to give a node a field to bind that the preset doesn't already ship, where the fields the preset *does* ship actually come from, and exactly what a placeholder shows when it points at nothing.

## Binding the title

Open the 2026 Planner, switch the sidebar to **Templates**, and click **Day View**. The canvas shows a small page headed "Jan 01", with "Thu" tucked in near the top corner. Click that "Jan 01" box to select it, then open **Element Properties → Typography** — the text field there doesn't say "Jan 01" at all. It says `{{month_short}} {{day_num}}`: two placeholders and a literal space between them, typed straight into the same box you'd type ordinary text into.

That's the entire mechanism. There's no separate "binding" field anywhere in the panel — type `{{`, a field name, and `}}` into any text box, and that box stops showing literal characters and starts showing whatever that field resolves to on whichever node is currently rendering the template. `{{title}}` is the one placeholder every node answers, because every node has a title; the preset's own Month View header, for instance, is nothing but `{{title}}`.

> [!TIP]
> Just below that same text box sits a small **Reset to Title** link. One click types `{{title}}` for you, for whenever that's exactly what you want and typing four braces feels like overkill.

Now use the toolbar's own [**Preview:** selector](/docs/reference/preview-node) — the same one from Your First Document from a Preset — to switch which day it's showing, from "January 1, 2026" to "January 2, 2026". Watch the canvas, not the dropdown.

![The Day View template canvas switching from Jan 01 and Thu to Jan 02 and Fri as the toolbar Preview selector moves from one day node to the next](/docs-assets/editor/clip-preview-node-switch.webp "Same template, same text box — a different preview node prints different text")

Both bound boxes update — the title *and* the day-of-week chip — and nothing about the template itself changed. That dropdown only ever lists nodes that actually use whichever template is currently selected: Day View's list runs to every day node in the preset; switch to Year View instead and there's exactly one option, because only the root node uses it.

None of this edits anything, either. The Preview: selector only decides which node's data you're looking *at* while you shape a template — every node still renders its own real data the moment you switch to Hierarchy mode, or export a PDF.

## Custom data fields

Placeholders aren't limited to whatever fields the preset happened to ship. Switch the sidebar back to **Hierarchy**, expand **Quarter 1** → **January** the same way you did in Your First Document from a Preset, and click **January 1, 2026** itself. **Node Properties**, in the right column, shows this node's **Title**, its **Assigned Template**, and a [**Data Fields** list](/docs/reference/node-data-fields) — thirteen of them already, each with its own value box and a small **✕** to delete it.

![Node Properties panel for the January 1, 2026 day node, showing Title, Assigned Template, and thirteen real data fields each with its own value box and delete button](/docs-assets/editor/node-data-fields.png "Every one of a day node's built-in fields, laid out the same way a field you add yourself would be")

Click **+ Add**, type a name — `mood`, say — and press `kbd:Enter`. A new row appears at the bottom of the list with the name you typed and an empty value box, since a brand-new field always starts blank; type whatever you want into it. That field now exists on this one node, and this one only — none of the other 364 day nodes gained a `mood` field just because January 1st has one.

Bind it exactly the way you bound `{{title}}` a moment ago: `{{mood}}`, typed into any text box.

> [!TIP]
> If you'd rather not type the braces by hand, the Typography section has an **Insert Data Field** row of quick buttons, one per field — but only for fields that actually exist on whichever node the template is currently previewing, or one of that node's ancestors. Add `mood` on a different day and preview *that* day instead, and its own button appears in the row.

Deleting a field takes no confirmation, but like everything else in this editor, `kbd:Ctrl+Z` brings it straight back.

Notice that Node Properties only ever showed up in Hierarchy mode, for whichever node you clicked in the sidebar — a completely different panel from the Preview: selector you used a moment ago in Templates mode. Previewing and editing a node's data are two different jobs, in two different modes: Templates mode lets you *look* at any matching node's data while you shape a template; Hierarchy mode, on a specific node, is the only place that data actually gets added, edited, or removed.

## Where preset data comes from

Every one of those thirteen fields on `January 1, 2026` — and the identical thirteen on all 364 other day nodes — came from whatever built the 2026 Planner preset in the first place, not from someone typing them in one at a time. They fall into a clear pattern: a full name, a short form, and sometimes a bare number or single initial, for each unit of time a day belongs to.

| Field | January 1, 2026 |
| --- | --- |
| `year` | `2026` |
| `quarter_name` | `Quarter 1` |
| `quarter_short` | `Q1` |
| `quarter_num` | `1` |
| `month_name` | `January` |
| `month_short` | `Jan` |
| `month_initial` | `J` |
| `month_num` | `01` |
| `day_num` | `01` |
| `day_name` | `Thursday` |
| `day_short` | `Thu` |
| `day_initial` | `T` |
| `weekday_num` | `4` |

That spread of a full name *and* a short form *and* sometimes a bare number exists because different boxes on a page have different amounts of room: a wide banner can afford `{{month_name}}`, "January" in full, while a narrow corner chip needs `{{month_short}}`, or even `{{month_initial}}`, instead. Pick whichever fits the box.

`weekday_num` is the odd one out — not a label for a box, but a plain number, 0 for Sunday through 6 for Saturday (January 4th, 2026, that month's own Sunday, carries `weekday_num: 0`). Nothing in this tutorial binds it directly, but it isn't unused: it's exactly the field Month View's calendar grid — and Quarter View's, and Week View's — reads to work out how many blank cells to leave before the 1st of the month, so every date lines up under the correct day-of-week column automatically. The grids tutorials later in this track cover exactly how that offset works; for now, it's worth knowing it isn't magic — it's just one more field on the same day node as everything else in the table above.

> [!NOTE]
> Bind a field that doesn't exist anywhere PDF Architect looks for it while resolving a placeholder — a typo, or a field that's real on other nodes but not this one — and the box doesn't show the literal `{{fieldname}}` text, and it doesn't show an error either. It resolves to nothing: an empty string. A text box with nothing else in it will look completely blank until the name is fixed, the field is added, or a different preview node that actually has it is chosen instead.
