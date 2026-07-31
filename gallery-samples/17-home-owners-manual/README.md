# The House Book

A home operations manual for reMarkable Paper Pro, drawn like the drafting sheet your house never shipped with. A dashboard of rooms and systems fans out to room pages (paint codes, measurements, fixtures, and the appliances that live there), five system pages (shutoff callouts, specs, inspection checklists), and appliance cards with the make, serial, warranty, and service history you never find when you need them. Four season checklists keep the maintenance year turning; a repair ledger and contractor list close the binder.

## Why you'll like it

- **The dashboard reaches everything.** Rooms band and systems band, one tap each – and every page's title block jumps straight back to it.
- **Rooms own their appliances.** Each appliance card is a real child of its room, so the page order reads room, its appliances, next room – and every card carries an always-labelled chip back to its room.
- **Systems that answer the panic question.** Each of the five fixed systems (HVAC, Plumbing, Electrical, Roof & Exterior, Safety) leads with a shutoff-location callout, then specs (filter size, breaker map lines) and a six-point inspection checklist.
- **A maintenance year that runs itself.** Spring, summer, autumn, and winter checklists – ten evergreen tasks each, with tick boxes and date rules – chained with a Next season chip.
- **A worked example that shows the handwriting.** One utility room walked end to end, plus its fictional Kestrel KD-40 dishwasher filed with serial, warranty, and service history – all clearly marked EXAMPLE with a skip link to your live manual.

## Workflow

1. Read How To Run The House and fill in the three emergency shutoff lines first – they are the whole point of the book.
2. Walk the house once: each room page takes its paint codes, measurements, and fixtures; each appliance card takes its identity plate off the rating sticker.
3. Tap a system for its shutoff callout, specs, and inspection list; date the ticks.
4. Open the season checklist at each equinox and solstice – tick, date, move on.
5. Log every repair in the ledger and keep the contractor list current; staple their cards into the dashed pocket.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { roomCount: 8, applianceCount: 12 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `roomCount` | 4-12 | Room pages, each with up to four appliance card slots |
| `applianceCount` | 6-20 | Appliance cards, distributed across the first rooms (at most 4 per room) |

`applianceCount` may not exceed four cards per room. Unsupported values fail with a clear `The House Book config` error.

## Inventory

Default configuration exports 44 pages:

- 1 cover and 1 owner guide (with the emergency-shutoff lines)
- 1 worked-example desk, 1 worked utility room, and 1 filled dishwasher card (a fictional Kestrel KD-40), all EXAMPLE-labelled
- 1 Your House hub and 1 dashboard (rooms band + systems band)
- 8 room pages with their 12 appliance cards interleaved room by room
- 5 system pages (HVAC, Plumbing, Electrical, Roof & Exterior, Safety)
- 4 season checklists, 6 repair ledger pages, 2 contractor list pages

Minimum configuration (`roomCount: 4, applianceCount: 6`) exports 34 pages; maximum (`roomCount: 12, applianceCount: 20`) exports 56.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Owner guide -> worked example, Your House, `dashboard`, `season_spring`
- House Hub chips -> dashboard, rooms, systems, seasons, repair ledger, and contractor list by stable id; the worked example's two desk chips open its room (`child_index` 0) and the dishwasher card
- Dashboard rooms band = unfilled chips over `child_index` 5-16 (room reference children; unused slots bind `''`); systems band = `child_index` 0-4 over the five fixed system references
- Room pages -> their appliance cards via `child_index` 0-3 chips (unused slots bind `''`); every appliance card carries an always-labelled `« Its room` chip (`parent`) and prev/next sibling chips that chain across rooms (`''` at the ends)
- Season checklists chain spring » summer » autumn » winter via a `Next season »` sibling chip (`''` on winter)
- Repair and contractor pages chain with `sibling` links; every dead end binds `''`
- Every page's title block returns to its hub (`parent`) and jumps to the dashboard
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original artwork throughout: the cover's isometric house plate (graphite construction lines, dimension line with end ticks, scale bar, north arrow), the corner registration brackets, and the dashed-rule chrome were newly authored for this product. Blueprint blue `#2e4a66` carries the ink – frames, table heads, primary text; graphite mist `#8a9aa8` carries construction lines and secondary text; drafting paper `#eef3f7` is the page ground with near-white `#fbfdff` writable cells – tones that stay legible in grayscale. The chrome is a drafting sheet: corner registration brackets, a stencilled masthead over the signature dashed rule, and an engineering-drawing title block at the foot split into back-link, legend, and dashboard cells – geometrically unlike the engraved rules, soil bands, bookplates, and command bars of products 09-16. Identity plates, spec rows, and both ledgers are explicit bordered rects; the measurements sketch box is a dots-pattern fill inside an explicitly bordered frame; the product uses no grid elements. The Kestrel KD-40 dishwasher in the worked example is fictional.

## Publishing

Suggested tags: `home, house, maintenance, appliances, manual, organization`

Suggested preview pages (six, by template tab): Manual Cover, Home Dashboard, Room Page, System Page, Appliance Card, Season Checklist.
