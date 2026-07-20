---
title: Linking — Every On-Click Target
difficulty: intermediate
time: 12 min
summary: All nine link targets — parent, child index, sibling, ancestor, specific node, URL, and the referrer family — with when to use each.
keywords: link, interaction, on click, parent, child index, sibling, ancestor, url, navigation, back button
prerequisites: editor/grids-basics-and-styling
---

Export the 2026 Planner and click around the result: every day page carries a working navigation bar. Arrows step to the previous and next day, a month chip jumps up to that day's month calendar, a quarter chip jumps two levels up, "2026" goes home to the year overview, a day-of-week chip lands on the day's week spread, and two small labels open the day's own Journal and Daily Notes sub-pages. [Grids I](/docs/editor/grids-basics-and-styling) already covered the half of that navigation you get for free — grid cells automatically linking to the pages they display. This tutorial is the other, configured half: the **On Click** setting that every element carries, and all nine values it accepts. Every one of those nav-bar controls is an ordinary element — text boxes and two small triangles — each with a different On Click target, and by the end of this page you'll have seen the real, shipped configuration behind each of them.

## Logical links, not URLs

Select any single element (`kbd:V`, then click it) and scroll the **Element Properties** panel to its very last section, **Interaction**. It holds one dropdown, **On Click**, defaulting to **None** — and, for most targets, one extra value control that appears underneath once that target is picked. The dropdown is identical on every element type: text, shapes, lines, SVGs, grids.

What it never asks for is a page number. Templates are shared — the same Day View layout renders 365 different pages, as [Data Binding](/docs/editor/data-binding) built this track's whole mental model around — so "go to page 47" would be correct on exactly one of them and wrong on the other 364. Instead, every internal target names a *relationship* in the node tree: my parent, my second child, the node one position after mine. At export, each page resolves that relationship against its own node, so one element, configured once, produces a different — correct — destination on every page it renders on.

The export is where links become real. Each one is written into the PDF as a genuine link annotation covering the element's footprint — every element type included, lines and SVGs too, and a rotated element gets its rotated footprint's bounding box as the clickable area. One nuance: a text element whose bound text resolves to nothing prints nothing, and gets no clickable area either — a link never outlives its element. The canvas editor, on the other hand, never navigates on click ([Grids I](/docs/editor/grids-basics-and-styling) said the same about cell links): clicking a linked element in the editor just selects it. Export to test.

There's one more export-time rule, and it's a feature: **an internal link that fails to resolve removes its element from that page entirely.** Not a dead link — no element at all. The planner's previous-day arrow is the cleanest demonstration: on January 1 there is no previous day anywhere, so that page simply prints no ◀ arrow, while January 2 keeps its own. Buttons that would lead nowhere quietly disappear instead. (The sidebar's page thumbnails render through the same exporter, so they hide such elements too.) Only **Open URL** is exempt — an external link never depends on the tree, so its element always renders.

## The target reference table

Here are all nine values, in the order the dropdown lists them. The middle column is what the dropdown actually says; the value fields are the extra controls that appear under it for that target.

| Target | Dropdown label | What it links to | Value fields | Typical use |
| --- | --- | --- | --- | --- |
| `none` | None | Nothing — no link is written | — | The default |
| `parent` | Go to Parent Page | The rendering node's parent | — | Back buttons |
| `child_index` | Go to Child (by Index) | The rendering node's Nth child (0-based) | Target Child (index) | A day's Journal sub-page |
| `sibling` | Go to Sibling (Offset) | The node N positions from mine among my parent's children | Offset (+1 next, -1 previous) | Next / previous day arrows |
| `ancestor` | Go to Ancestor (Level) | N levels up the tree (1 = parent, 2 = grandparent) | Levels Up | A day's quarter chip |
| `referrer` | Go to Referrer (Backlink) | The page holding the first *reference* to this node | — | A day's week chip |
| `specific_node` | Go to Specific Page | One fixed page, picked from a modal | Select Target Page... button | Home / cover page links |
| `child_referrer` | Go to Child's Referrer | The page holding a reference to one of my children | Start Index · Count / Direction · parent-template filter | Calendar rows → week pages |
| `url` | Open URL | An external web address | URL | Your website |

> [!NOTE]
> Grids are the one exception to "every element links the same way." A grid's cells are already links to the pages they display — built in, as [Grids I](/docs/editor/grids-basics-and-styling) covered — and the grid's *own* On Click never becomes a clickable region on top of them. It isn't inert, though: an internal target that fails to resolve still hides the whole grid at export, cells and all, exactly like any other element. Leave a grid's On Click at **None**.

## Back buttons and nav bars

**Go to Parent Page** is the back button. Open the planner, switch the sidebar to **Templates**, and click **Day View**: the month chip in the nav bar — the text box reading `{{month_short}}` — has On Click set to exactly this. A day node's parent is its month, so January 1's page renders the chip as "Jan" and links it to January's calendar; September 3's identical element reads "Sep" and links to September. One element, 365 correct back buttons. (On a page whose node has no parent — the root — a parent link resolves to nothing, so the element vanishes there, per the rule above.)

Recreate it from scratch on the day title: select it, and in **Interaction** switch On Click from None to **Go to Parent Page**. That's the entire workflow — no value field needed, because "parent" is already a complete answer:

![Selecting the Day View title element, scrolling the Properties panel down to the Interaction section, and switching On Click from None to "Go to Parent Page"](/docs-assets/editor/clip-set-parent-link.webp "Select, find Interaction at the bottom of Element Properties, pick a target — parent needs no value field")

**Go to Specific Page** is the opposite idea: not a relationship but a hard link to one fixed page, the same on every page that renders it. The nav bar's "2026" chip uses it — every one of the planner's pages should go home to the *same* year overview, so a relative target would be the wrong tool. Picking it shows a dashed **Select Target Page...** button; clicking that opens the same node-tree modal you used to pick a grid source in [Grids I](/docs/editor/grids-basics-and-styling), and once a page is chosen the button shows its title:

![The Interaction section of Element Properties for the Day View nav bar's year chip, showing On Click set to "Go to Specific Page" and the target button reading "2026 Planner"](/docs-assets/editor/interaction-section.png "The value control changes shape per target — a hard link shows the picked page's title. (The dropdown's nine options are listed in the table above; an open native dropdown can't be captured in a screenshot.)")

Hard links are the one target that can dangle — the picked page might be deleted later. PDF Architect covers that: deleting a node resets every Go to Specific Page link that pointed at it back to **None**, across all templates and variants, rather than leaving a link to nowhere.

## Position-relative links

**Go to Child (by Index)** links to one of the rendering node's own children, by position. Its value control, **Target Child**, is friendlier than a raw number: when the previewed page has children it's a dropdown listing them as `0: Journal`, `1: Daily Notes` — pick by name, and the 0-based index is stored. An **Edit Manual** toggle switches to a plain number box, and an index past the end stays visible as "(Index out of range)" rather than hiding your selection. The Day View nav bar uses it twice: every planner day has exactly two children, so "Journal" links to child 0 and "Daily Notes" to child 1. On a node with no child at that index, the element disappears at export.

**Go to Sibling (Offset)** is the planner's prev/next machinery. The offset is signed — the field is labeled **Offset (+1 Next, -1 Prev)**, and leaving it blank means +1: find my position among my parent's children, step that many places, link there. Both Day View triangles use it, ◀ at `-1` and ▶ at `+1`; the same pair, with the same two values, also ships on the Week, Month, Quarter, and List Index templates, because "one of my kind forward or back" is the same idea at every level of the tree.

When the offset runs off either end of the list, it does not wrap around. The resolver climbs one level instead and looks for a *cousin*: starting from your parent's own position, it walks your grandparent's children in the offset's direction — forward for positive, backward for negative — and takes the first one that has children of your own template type: the *first* such child going forward, the *last* going backward. That's what carries the planner's ▶ across month boundaries: January 31 has no 32nd sibling, so the search moves to February and lands on February 1; February 1's ◀ walks the other way and lands on January 31. Two prints of the fine print, both straight from the resolver: the offset's *size* doesn't carry into the fallback (+7 from three-before-the-end lands on the next month's first day, same as +1 would), and the climb is exactly one level — cousins, not second cousins. In the planner, months live under quarters, so March 31's ▶ searches only Quarter 1, finds nothing after March, and resolves to nothing at all: the last day of each quarter prints no next-day arrow — and, by the same rule mirrored, its first day no previous-day arrow — the disappearing rule doing exactly what it's for.

**Go to Ancestor (Level)** generalizes the back button: **Levels Up** counts parents — the field says it itself, `1 = Parent, 2 = Grandparent`. (Blank or zero is treated as 1.) The Day View quarter chip is ancestor level 2 — day to month to quarter. One template deeper, the Journal template's own nav chips shift by one: its month chip is level 2 (journal → day → month) and its quarter chip level 3. Ask for more levels than the page has above it, and the element disappears at export like any other unresolved link.

## External URLs

**Open URL** is the one target that leaves the document: its **URL** box is written into the PDF as a standard external-link annotation, which the reader's PDF viewer hands to the browser. Give it the full address, `https://` included — the string is stored exactly as typed, and a bare `example.com` produces a link most viewers can't open. As noted above, URL links skip the resolve-or-disappear check entirely: the element always renders, and if the box is empty it's simply not clickable.

## The referrer family

The last two targets read the tree *backwards*, through references — nodes that point at another node instead of holding content of their own. You've already met references without the name: [Grids I](/docs/editor/grids-basics-and-styling) noted that a grid cell showing one resolves straight through to the target's data and page. The planner's week spreads are built from them — each Week node holds references to days that really live under their months — and a reference never renders as a page of its own, so links that resolve to one land on the page of whatever it points at.

**Go to Referrer (Backlink)** answers "who references *me*?" It finds the first node in the project whose reference points at the rendering node and links to *that node's parent* — the page the reference actually sits on. The Day View day-of-week chip (`{{day_short}}`) is exactly this: January 1 is referenced from inside Week 1, so its chip links to Week 1's page — a jump the tree's parent/child lines can't express, because the day's real parent is January.

**Go to Child's Referrer** asks the same question about *my children*, with a search window. **Start Index** names the child to try first; **Count / Direction**'s sign picks which way to scan from there and its size caps how many children get tried; the optional template filter narrows *which* referrer counts (only ones sitting on a given template — "Any Template" by default). The first tried child that has a referrer wins, and the link goes to that referrer's parent page. Both number fields accept arithmetic over the rendering node's own data fields, which the Month View's week-number column uses to full effect: each row's label starts from the index of that row's *last* calendar slot (`6-month_start_offset` for the first row, then `13-…`, `20-…`, and so on down the column) with a count of `-7` — scan up to a week backwards for a day that some Week page references, then link there. Rows that reach past the month's real days just scan back into it; the sixth-row label finds nothing at all in a five-row month, so it only prints on months that actually spill into a sixth row. To be precise about the fallback, exactly as the exporter implements it: **Count / Direction is consulted only when a Start Index is actually set**; leave both blank and the search starts at child 0 and tries exactly one.

If that felt denser than the other seven, it should — the referrer family gets its own tutorial next, covering what references are, how to create them, and the week-spread pattern end to end. For now the table row is enough: these two exist so a page can link to the places that point *at* it.

> [!NOTE]
> Everything on this page resolves per *rendering node*, at export, page by page. The same template element links somewhere different on every page it renders — the month chip goes to January on one page and September on another, the ▶ arrow to a different tomorrow on every page that has one, and the elements themselves come and go with what actually resolves. Build the nav bar once; it's correct everywhere.
