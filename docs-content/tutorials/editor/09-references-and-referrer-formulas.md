---
title: References & Referrer Formulas
difficulty: advanced
time: 14 min
summary: Reference nodes put one page in two places; referrer links and {{child_referrer}} formulas navigate and label across them.
keywords: reference, referrer, child referrer, week view, formula, shortcut node, back to week
prerequisites: editor/linking
---

[Linking](/docs/editor/linking) closed on a promise: the two referrer link targets got table rows and a warning that the machinery behind them — references — deserved a page of its own. This is that page. The problem it solves is easy to state: January 1, 2026 belongs to January, *and* it belongs to Week 1. The month calendar needs a cell that opens it; the week spread needs a slot that opens it; and both have to land on the *same* notes page, because a note jotted from the week spread had better be there when you arrive from the calendar. But a node has exactly one parent — the day lives under January, full stop. Duplicating the day node would print two separate pages that silently stop agreeing the moment either one is written on. The real fix is a node that doesn't hold a page at all: a **reference**.

## The problem references solve

A reference is a node whose only content is a pointer — a `referenceId` naming some other node in the tree. It sits wherever you put it, like any child, but it contributes nothing of its own: no page, no data, no children. Everything that touches it resolves *through* it to the target. The 2026 Planner ships 365 of them: under **Weeks**, each Week node's children aren't days — they're references to the real days that live under the months. That's the whole trick for putting one page in two places: the day keeps its single home under January, and Week 1 holds a pointer.

Two rules make the scheme safe:

- **A reference never prints as a page.** The exporter's page walk skips reference nodes entirely, so the planner's PDF has one January 1 — not two — even though the tree shows the day in two places. Anything that lands on a reference — a link, a grid cell — falls through to the target's one real page, and even a chain of references resolves on through to the final target.
- **Deleting is asymmetric, in the direction you'd want.** Delete a reference and only the pointer disappears; the real day is untouched. Delete the *target* and every reference to it is removed along with it, wherever it sits in the tree — no reference is ever left pointing at nothing.

You can spot references at a glance: in the sidebar's Hierarchy view they render *in italics* with a small link icon before the title. Select one and the right panel doesn't show the usual Title/Template/Data controls at all — just a **Reference Node** card reading "This node links to …" with the target's title.

## Creating a reference

References are created from the sidebar, in Hierarchy mode. Hover the row of the node that should *hold* the reference — the parent — and a cluster of small action buttons appears at the row's right edge. The link-icon one, **Link Existing Page (Reference)**, is the one you want: it opens a node picker titled **Select Reference Target**, the same project tree you've picked grid sources and hard-link targets from, with one twist — reference rows in it show dimmed and italic, and can't be expanded. Click any node, and a new reference to it is appended to the hovered row's children.

![The Select Reference Target modal open over the planner's sidebar, reached from a Week row's hover-revealed link button](/docs-assets/editor/add-reference-flow.png "Hover a row, click its link button, pick a target — the reference lands as the hovered row's newest child")

What actually gets created is minimal by design: a node with `referenceId` set to the target, the target's template and title copied over as a label, and nothing else — no data fields, no children. It doesn't need any: every consumer reads the target. Two consequences of that minimalism are worth knowing. The label is a *snapshot* — rename the real day later and the reference row in the sidebar keeps the old text (pages and grid cells stay correct, because they resolve the target live; only the sidebar label freezes). And a reference can't be renamed or given children at all — hover one and the add/edit buttons simply aren't there, just Duplicate and Delete.

> [!WARNING]
> The deletion cascade runs downward through references, and it's easy to trigger from the wrong end. Deleting **January 1, 2026** — the real day — also deletes Week 1's reference to it, which is what you want. But it means "clean up some old days" quietly edits every week spread that pointed at them. Deleting from the *reference* end is always the safe, local operation: the pointer goes, the page stays.

## Grids full of references

[Grids I](/docs/editor/grids-basics-and-styling) stated the rule and deferred the mechanism; here's both in one sentence: a grid cell whose child is a reference shows the **target's** data and links to the **target's** page — the reference's own empty data never renders, and since a reference has no page, there's nothing else the cell *could* link to. This is what makes a "grid full of references" indistinguishable from a grid full of real children, and it runs deeper than display: even [Grids II](/docs/editor/grids-calendars-and-data-shaping)'s dynamic offset reads its field through the reference, off the real first day.

The planner's Week View is this pattern, shipped. Expand **Weeks** → **Week 2** in the sidebar: seven italic rows, January 5 through January 11, every one a reference to a day that lives under January.

![The planner sidebar with the Weeks section and Week 2 expanded, showing seven italic reference rows with link icons](/docs-assets/editor/week-references-sidebar.png "A Week node's children are pointers, not pages — seven references to days that live under the months")

The Week View template's main grid is an ordinary grid pointed at the week itself:

```json
{
  "cols": 2,
  "gapX": 3,
  "gapY": 120,
  "sourceType": "current",
  "displayField": "title",
  "offsetMode": "dynamic",
  "offsetField": "weekday_num",
  "offsetAdjustment": -1
}
```

Nothing in it mentions references. `displayField: "title"` prints each cell's day title — read through the reference from the real day — and each cell links to the real day's page. The dynamic offset resolves through the reference too: Week 2 starts on a Monday (`weekday_num: 1`, minus 1, offset 0) and fills its spread from the first slot, while Week 1 — 2026 opens on a Thursday, so its week holds only four references — computes offset 3 and leaves the Monday-through-Wednesday slots blank, exactly like a partial month in a calendar.

The whole recipe, from scratch:

1. Create the container: a new node per week (**Add New Page** on a Weeks section node), using a template with room for seven slots.
2. Hover the new week row and use **Link Existing Page (Reference)** seven times, picking that week's days in order — Monday first. Order matters: it's the order cells fill, and the order the referrer machinery below scans.
3. On the week's template, draw a grid with **Source: Current Node** and a **Display Template** of `{{title}}` (or any day field — the target's fields are all visible to the cell).
4. There is no step 4. Cells already link to the real day pages, and days added to a different week later can't drift out of sync with their month, because there's only one node per day.

> [!TIP]
> Never build a week view by duplicating day nodes under the week. It looks identical in the editor for about a minute — then the export has two pages per day, notes written from the week spread stop appearing in the month's copy, and every link target has two candidate answers. Reference the days instead; duplication is for layouts, never for pages that must stay one page.

## Linking back through a reference

Getting *into* a day from the week spread is free — the grid cells do it. Getting *back out* is the referrer family from [Linking](/docs/editor/linking), and both members are shipped in the planner.

On the day page itself, "back to my week" is **Go to Referrer (Backlink)**. Day View's day-of-week chip — the text element reading `{{day_short}}` in the nav bar — carries exactly this target and nothing else: no value fields. It finds the first node in the project whose `referenceId` points at the rendering day and links to that node's *parent* — the week page the reference sits on. "First" is worth a beat of honesty: it means first in the order nodes were created, so if a day is ever referenced from two places, which one wins is a matter of project history, not configuration. The planner never feels this — each day has exactly one reference, its week's — but it's the reason the second family member exists.

**Go to Child's Referrer** is the same question asked from one level up — not "who references me?" but "who references my *children*?" — and it comes with real controls. Put it on a month's template and configure it in the **Interaction** section:

- **Start Index** — which child to ask about first, 0-based. Leave it blank and the search starts at child 0.
- **Count / Direction** — how many children to try if the first has no referrer, and which way to walk: `7` scans forward seven children, `-7` scans backward seven. One exporter nuance, stated exactly: this field is consulted **only when a Start Index is actually set**; with both blank, the search tries child 0 once and stops.
- **Filter by Parent Template** — a dropdown of your templates, defaulting to **Any Template**. When a tried child has several referrers, the search *prefers* one whose parent page uses the chosen template — but it's a preference, not a wall: if no referrer's parent matches, it falls back to the first referrer it found on any template rather than giving up.

The first tried child that yields a usable referrer ends the scan, and the link goes to that referrer's parent page. (A referrer that itself sits nowhere — no parent — can't be linked to; the scan just moves to the next child.) Set **Start Index** `0`, **Count** `1`, filter **Week View**, and a month page gets a "first week of this month" button: which week references my first day? Like every internal target, an element whose search comes up empty vanishes from that page at export.

Both number fields accept arithmetic over the rendering node's own data — the same trick [Grids II](/docs/editor/grids-calendars-and-data-shaping) used for offsets — and the Month View template spends it well: its rotated week-number column, one label per calendar row, is six of these links (`6-month_start_offset` with count `-7`, then `13-…`, `20-…`, on to `41-…`), each resolving to the week page that owns that row. The next section takes those exact strings apart, because the same elements also *display* the week's name — with a formula.

## Displaying the referrer's name

First, the case where no formula is needed. A page's data context isn't just its own fields and its ancestors' — **referrers and their ancestors join it too**. A day page can bind `{{week_num}}` or `{{week_name}}` directly: the day's referrer sits under Week 1, so Week 1's fields are in scope, and the binding resolves with no configuration at all. That's the quiet payoff of the reference: pointing at a page *donates context to it*.

The month page gets no such donation. Weeks don't reference the *month* — they reference its children — so nothing week-shaped is anywhere in a month page's context, and `{{week_name}}` on Month View resolves to nothing. Labeling the calendar's rows needs an explicit query, and that query is the `child_referrer` formula, typed into any text box or grid Display Template like any other placeholder:

```
{{child_referrer:StartIndex:Count:TypeFilter:FieldName}}
```

| Slot | What it means | Accepts |
| --- | --- | --- |
| `StartIndex` | Which of the rendering node's children to ask about first (0-based). Negative indexes are skipped, not errors. | A number, or arithmetic over the rendering node's own data fields — `6-month_start_offset` |
| `Count` | Size = how many children to try; sign = scan direction. `7` tries StartIndex forward; `-7` tries it backward; `0` tries none. | Same: number or field arithmetic |
| `TypeFilter` | Preferred template of the referrer's *parent* page. May be left empty — meaning any — but its slot must stay: two colons back to back. Same preference-with-fallback rule as the link target. | A template id |
| `FieldName` | What to print from the referrer's parent: `title`, or any of its data fields. | A field name |

The scan is the link target's scan, exactly — first tried child with a usable referrer wins — but the result is text: the referrer's *parent's* title or field, printed in place. Unlike the Interaction panel, the formula has no defaults: all four slots must be present (only `TypeFilter` may be empty), and a tag missing a slot stops being a formula at all — it falls through to ordinary field lookup, matches no field anywhere, and prints nothing. A well-formed formula whose scan finds nothing also prints nothing, the same blank an unknown `{{field}}` produces. In arithmetic, a field name that doesn't exist on the rendering node counts as `0`.

> [!TIP]
> You don't have to hand-type the syntax. The Typography section of any text element — and a grid's Display Template — has an **Insert Referrer Field...** link that opens a small builder: Start Index, Count / Direction, a Parent Type dropdown listing your templates by name, and a Field Name box. It writes the tag for you, which is also the painless way to get the `TypeFilter` slot right: the dropdown shows "Week View" but writes the template's real id, `week`.

Watch it resolve. On Month View, previewing January, draw a text box and type the worked example — `{{child_referrer:0:7:week:title}}`: *of January's children, start at day 1, scan forward up to a week, prefer a referrer sitting on a Week View page, print that page's title.* January 1 is referenced from Week 1, so the moment the edit commits, the box stops showing braces and prints **Week 1**:

![Typing a child_referrer formula into a new text element on Month View and committing the edit, at which point the raw braces resolve to the label Week 1](/docs-assets/editor/clip-referrer-formula.webp "The canvas resolves the formula against the preview node — January's first day is referenced from Week 1, so that's the label")

The canvas preview and the exporter run the same resolution, so what you see while editing is what prints.

Now the shipped version. Each of Month View's six week labels binds one of these, and this is the first row's, verbatim from the template:

```
child_referrer:6-month_start_offset:-7::title
```

Read it with the table: `month_start_offset` is a field every month node carries — the number of blank cells before day 1 in its Monday-first calendar (January's is `3`, February's `6`) — so `6-month_start_offset` is the index of the day sitting in the *last* slot of calendar row one. January: `6-3 = 3`, child 3, January 4. Count `-7` walks backward from there, up to a full week. The filter is empty — two colons — because in this project only weeks reference days, so there's nothing to disambiguate. The result: the title of the week page that owns row one, which for January is Week 1. The other five labels change only the starting slot — `13-…`, `20-…`, `27-…`, `34-…`, `41-…` — one calendar row further down each time.

Starting from each row's *end* and scanning backward is what makes one set of strings survive every month's shape. A short month's fifth row may not reach index `34-offset` at all — the missing children are skipped and the scan walks back into the month's real last days. And the sixth label prints only when a month genuinely spills into a sixth row: March 2026 (offset `6`, 31 days) fills 37 calendar slots, six rows, and its label's window — starting at child `41-6 = 35` — walks back to the month's real last day, child 30, March 31, so a week number appears; in January the entire window (child `41-3 = 38` backward to 32) is past the month's end, the scan finds nothing, and the label — and, since these same elements carry the matching `child_referrer` *link*, the clickable region too — simply isn't printed on that page.

One page in two places, a back door from each, and labels that name the other context — all of it from a node whose only content is a pointer.
