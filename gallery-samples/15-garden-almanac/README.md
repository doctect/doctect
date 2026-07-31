# The Grower's Year

A garden almanac for reMarkable Paper Pro that links the calendar to the plants. Twelve engraved month spreads list what to sow, plant, and harvest, and every row is a tap through to that plant's card – sixteen cards of accurate, evergreen, northern-temperate horticulture with an A-to-Z index. Bed maps on dotted grids, harvest and pest ledgers, and a year review sheet close the season.

## Why you'll like it

- **The calendar and the reference are one book.** Each month's sow / plant / harvest rows are reference chips to the same shared plant cards the index lists, so "what do I do with this?" is one tap from anywhere.
- **Cards you can trust.** Sixteen plants (tomato to rosemary) with sow depth, spacing, sun and soil, days to maturity, and companions – mainstream figures for northern-temperate gardens (Britain, Ireland, USDA zones 6-8), stated as such on the guide page.
- **Months that know their season.** Garlic goes in with the October rows, tomatoes start under cover in February and go out after the last frost, kale stands through the winter spreads – and unused rows print as blank writable lines for your own experiments.
- **A worked example that shows the handwriting.** March filled end to end – tasks, varieties, dates – plus tomato and garlic cards carrying a season of field notes, all clearly marked EXAMPLE with a skip link to your live almanac.
- **Ledgers with opinions.** The harvest ledger asks for weights and a page total; the pest ledger lists the usual culprits and catches patterns; the year review demands verdicts in November, with tea.

## Workflow

1. Read Before You Sow (it states the climate the dates assume), then flip through the worked March.
2. Each month, open the spread: read its rows, tap through to cards, tick the done boxes, and pencil extras onto the spare rows.
3. Sketch every bed on a bed map before anything goes in the ground – dots are hand-widths.
4. Weigh pickings into the harvest ledger; log every pest sighting while the memory is fresh.
5. In November, settle the season on the year review sheet and mark next year's changes.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { bedCount: 4, harvestLogCount: 4 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `bedCount` | 2-8 | Bed map pages with dotted plot grids |
| `harvestLogCount` | 2-12 | Harvest ledger pages |

Unsupported values fail with a clear `The Grower's Year config` error.

## Inventory

Default configuration exports 47 pages:

- 1 cover and 1 growing guide (northern-temperate framing stated)
- 1 worked-example table with March filled and two annotated plant cards, all EXAMPLE-labelled
- 1 Your Garden hub
- 12 month spreads (tasks block + eight sow/plant/harvest rows; unused rows print as writable spares)
- 1 plant index (A to Z) and 16 shared plant cards
- 4 bed maps, 4 harvest ledger pages, 2 pest ledger pages, 1 year review sheet

Minimum configuration (`bedCount: 2, harvestLogCount: 2`) exports 43 pages; maximum exports 59.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Growing guide -> worked example, Your Garden, `month_01`, `plant_index`
- Garden Hub chips -> months, index, beds, harvest, pest, and review desks by stable id; the worked example's three slot chips (`child_index` 0-2) open its March and two cards
- Month rows -> plant cards via reference-node children (`child_index` 0-7; unused rows bind `''` on both chips of the pair and vanish)
- Every plant card carries an always-labelled `Plant index »` chip (`specific_node` -> `plant_index`); the index's sixteen A-to-Z rows are `child_index` chips over reference children to every card
- Months, cards, beds, harvest pages, and pest pages chain with `sibling` links; every dead end binds `''`
- Every page's footer returns to its hub (`parent`) and carries a shortcut (months, index, beds, harvest, pest, review)
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original artwork throughout: the cover plate (sun, soil line, seedling, carrot and bulb in cross-section, a sown seed row), the month-masthead leaf sprigs, and the footer sprout mark were newly authored for this product. Leaf `#3d5c45` carries rules, table frames, and primary text; terracotta `#97622f` carries the action tags, seed-dot ornaments, and the soil band along the bottom edge; cream `#f0eee0` is the page ground with near-white `#faf8ee` writable cells – tones that stay distinct in grayscale. The chrome is an engraved double head rule with a three-seed centerline ornament and a thin terracotta soil band at the foot – geometrically unlike the frames, spines, mastheads, and command bars of products 09-14. Spec tables, calendar cells, and both ledgers are explicit bordered rects; the bed-map grid is a dots-pattern fill inside an explicitly bordered frame; the product uses no grid elements.

## Publishing

Suggested tags: `garden, planting, almanac, vegetables, planner, seasonal`

Suggested preview pages (six, by template tab): Almanac Cover, Bed Map, Month Spread, Plant Card, Plant Index, Harvest Ledger.
