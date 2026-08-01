# The Observatory

A night-sky observation log for reMarkable Paper Pro that links the calendar to the catalog. Twelve month-sky pages list the deep-sky sights genuinely well placed that month, and every highlight is a tap through to an accurate target card – twenty cards of evergreen astronomy for northern mid-latitudes, from the Orion Nebula to the eclipse-safety brief. Every card feeds a growing life list, and every night ends on a sketch-circle observation sheet.

## Why you'll like it

- **The calendar and the reference are one book.** Each month's highlight rows are reference chips to the same shared target cards the life list ticks, so "what is that and how do I find it?" is one tap from anywhere.
- **Cards you can trust.** Twenty targets with type, constellation, magnitude, difficulty, and star-hop finder notes – mainstream figures for observers at roughly 35 to 55 degrees north, stated as such on the guide page. M42 belongs to winter, M13 to summer, Andromeda to autumn, and the spring pages hold galaxy season.
- **The wanderers are handled honestly.** The Moon and planets move, so month pages never claim them – a standing note points to a current almanac, and Saturn, Jupiter, Venus, Mars, and the Moon each hold an evergreen card in the catalog instead.
- **The one rule, in writing.** The twentieth card is a solar-eclipse safety brief: certified front-mounted solar filters, ISO 12312-2 eclipse glasses, pinhole projection, and nothing else, ever.
- **A worked example that shows the handwriting.** A moonless January session on M42 and the filled card it produced – first-observed box dated, notes written cold – all clearly marked EXAMPLE with a skip link to your live log.
- **A sketch circle that means it.** Each observation sheet carries a ~300pt double-ring eyepiece with rim ticks and a sparse guide-dot field, over date, conditions, and seeing boxes.

## Workflow

1. Read First Light (it states the latitude the pages assume), then flip through the worked January session.
2. Each month, open the sky page: read its highlights, tap through to the cards, and star-hop from the finder notes.
3. Log every session on an observation sheet – date, conditions, seeing, then sketch what the eyepiece actually shows.
4. When a target falls, tick it on the life list and date the card's first-observed box.
5. For the Moon and planets, check a current almanac, then log them from their catalog cards.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { sessionCount: 20 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `sessionCount` | 8-40 | Sketch-circle observation sheets |

Unsupported values fail with a clear `The Observatory config` error.

## Inventory

Default configuration exports 62 pages:

- 1 cover and 1 observer guide (northern-mid-latitude framing stated)
- 1 worked-example bench with one filled observation sheet and one filled target card, all EXAMPLE-labelled
- 1 Your Observatory hub
- 12 month-sky pages (five highlight rows each; unused rows print as writable spares)
- 20 target cards and 1 life list
- 20 observation sheets, 1 equipment page, 2 glossary pages

Minimum configuration (`sessionCount: 8`) exports 50 pages; maximum (`sessionCount: 40`) exports 82.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Observer guide -> worked example, Your Observatory, `month_01`, `life_list`
- Observatory Hub chips -> months, catalog, life list, sessions, equipment, and glossary by stable id; the worked example's two bench chips (`child_index` 0-1) open its session and card
- Month highlights -> target cards via reference-node children (`child_index` 0-4; unused rows bind `''` and vanish)
- Every target card carries an always-labelled `Life list »` chip (`specific_node` -> `life_list`); the life list's twenty rows are `child_index` chips over reference children to every card
- Months, observation sheets, and glossary pages chain with `sibling` links; every dead end binds `''`
- Every page's footer returns to its hub (`parent`) and carries a shortcut (months, catalog, life list, equipment, glossary)
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original artwork throughout: the cover's Orion-in-an-eyepiece plate (star positions matching the naked-eye view facing south), the deterministic star fields, the Cassiopeia-W foot motif, and the observation sheet's double-ring eyepiece with guide dots were newly authored for this product. Night `#1d2530` carries the inverted header slabs, borders, and primary text; starlight `#6e7f96` carries labels, constellation lines, and soft text; pale sky `#e9edf3` is the page ground with near-white `#f8fafd` writable cells – tones that stay distinct in grayscale. The chrome is an inset night-dark slab hanging from the top edge with a star field inside it, over a hairline foot rule with the W of Cassiopeia on the centerline – geometrically unlike the full-bleed bands, engraved rules, frames, bookplates, and command bars of products 09-18. Spec tables, first-observed boxes, session header cells, and both equipment tables are explicit bordered rects; the product uses no grid elements.

## Publishing

Suggested tags: `astronomy, stargazing, observation, telescope, log, science`

Suggested preview pages (six, by template tab): Dome Cover, Month Sky, Target Card, Observation Sheet, Life List, Observatory Hub.
