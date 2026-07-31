# Roots & Branches

A family-history workbook for reMarkable Paper Pro, built around a tappable four-generation pedigree chart. Fifteen boxes - self, parents, grandparents, great-grandparents - each open a full person page with vitals rows, a five-row timeline, a notes block, and kin chips that link back to that person's father and mother on the chart. Behind the chart sits a working archive: family group sheets for each marriage, interview prompt sheets for the living, photo and research ledgers, and a numbered source index that gives every fact a receipt.

## Why you'll like it

- **A chart you can tap through.** Every pedigree box is a link: tap `Grandmother (Maternal)` and her page opens, and her own kin chips carry on to boxes 12 and 13.
- **The numbering cannot drift.** Boxes follow the genealogist's ahnentafel - a father is double his child's number, a mother double plus one - and every person page quotes its own number and the numbers its kin chips lead to. The chart's connector lines are drawn from the same rule the kin references are generated from.
- **Renaming is one edit.** Box labels are bound to the chart's data, so replacing `Father` with a real name in `box_2_label` is the user's single edit point for that ancestor.
- **An example family shows the standard.** Three filled specimen pages for the clearly fictional Hartwell-Reyes family (all invented dates pre-1950) demonstrate vitals, timeline entries, sourcing habits and kin links - stamped EXAMPLE with a skip link.
- **Archivist's habits built in.** Pencil-then-ink advice, a research ledger that logs empty-handed searches too, and a source index numbered once and cited everywhere.

## Workflow

1. Open the chart and write the fifteen names you know; gaps are fine.
2. Tap a box and fill the person page behind it - vitals, five timeline moments, notes.
3. Follow the kin chips upward until the great-grandparents run out of chart.
4. Record each marriage and its children on a family group sheet.
5. Sit with the living and work through the interview sheets while you can.
6. Log searches in the research ledger; caption photographs; number every source.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { sparePersonCount: 8, promptPageCount: 6 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `sparePersonCount` | 4-16 | Blank person pages for relatives beyond the chart |
| `promptPageCount` | 2-12 | Interview prompt sheets (two questions each) |

Unsupported values fail with a clear `Roots & Branches config` error.

## Inventory

Default configuration exports 50 pages:

- 1 cover and 1 first-steps guide (how-to, book anatomy, a note on proof)
- 3 example person pages (the fictional Hartwell-Reyes family, EXAMPLE chrome)
- 1 family archive hub (chart chip, record-book rows, spare-page index)
- 1 pedigree chart with 15 tappable boxes over 15 person pages
- 30 kin reference nodes (zero extra pages - they resolve to chart persons)
- 4 family group sheets, 4 photo ledgers, 4 research ledgers, 2 source index sheets
- 8 spare person pages and 6 interview sheets (12 of the 24 questions)

Minimum configuration (`sparePersonCount: 4, promptPageCount: 2`) exports 42 pages; maximum exports 64.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- First steps -> example pages, family archive, the chart, or the first interview sheet
- Archive hub: chart chip (`child_index` 0), record-book number chips (`child_index` 1-14), spare-page chips (`child_index` 15+, unused slots bind `''` and vanish), interview chip (`specific_node -> prompt_01`)
- Chart boxes -> person pages (`child_index` 0-14, ahnentafel order)
- Person kin chips -> reference children (child 0 the father, child 1 the mother) that resolve to the chart persons named by the 2i+1 / 2i+2 rule; great-grandparents bind `''` and show none
- Every person page carries an always-labelled `Pedigree chart »` chip (`specific_node -> pedigree_chart`)
- Interview sheets chain with `« Previous sheet` / `Next sheet »` sibling chips; the ends bind `''`
- The example pages show **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Engraved-certificate identity: every page sits inside a heavy plum outer frame with a gold inner frame and double head and foot rules. Plum-gray `#53455c` carries frames, names and chips, faded gold `#9c8354` carries connectors, rules and box filigree, parchment `#f1eae0` is the page ground; the three tones stay distinct in grayscale. The cover tree is original artwork - the pedigree itself grown as a tree, fifteen nodes over gold roots. The chart draws its bracket connectors as one gold SVG beneath the boxes, computed from the same box geometry the chips use. All tables (group sheet children, photo, research and source ledgers) are explicit bordered rects - no grid elements are used anywhere in this product.

## Publishing

Suggested tags: `genealogy, family, history, ancestry, tree, heritage`

Suggested preview pages (six, by template tab): Workbook Cover, Pedigree Chart, Person Page, Family Group Sheet, Story Prompts, Research Ledger.
