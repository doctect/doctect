# Field Notes from Elsewhere

Destination-led travel planning and field journal for reMarkable Paper Pro. Sea-green routes, rust waypoints, sand surfaces, editorial type, and original topographic artwork keep practical plans connected to quiet observation.

## Workflow

1. Open a journey dashboard.
2. Gather lodging, transit, timed-entry, and arrival details in reservation records.
3. Build an itinerary and open each day as a route timeline.
4. Record field notes, weather, and one moment worth keeping.
5. Prepare packing, maintain a simple expense ledger, and close with highlights.

Start Here offers a fictional guided Lisbon journey and a direct route to the clean blank workspace. Every guided page displays **EXAMPLE** and a visible **Skip to blank workspace** control. Example records contain no real person, contact, payment, ticket, or booking data.

## Guided Lisbon Example

The concise fictional branch includes:

- A hillside Lisbon base and practical route note
- Fictional lodging, transit, and timed cultural-entry records
- Three neighborhood-led days: Baixa and Alfama; Belém and Ajuda; Estrela and the river
- Daily timelines plus quiet field-note regions
- Packing notes, an amount-free expense sketch, and closing highlights

Provider names, addresses, schedules, and reservations are teaching fiction. Verify all real opening times, fares, routes, accessibility, and requirements independently.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { tripCount: 3, daysPerTrip: 5, reservationsPerTrip: 2 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `tripCount` | 1-6 | Complete blank journey dashboards |
| `daysPerTrip` | 1-21 | Daily itinerary and field-note pages per journey |
| `reservationsPerTrip` | 0-8 | Reservation records per journey |

Zero reservations remains useful: dashboard still opens a reservations page with a clear empty state and practical-notes region. Unsupported values fail with a clear `Field Notes config` error.

## Inventory

Default configuration exports 55 pages:

- 1 cover and 1 Start Here guide
- 13 guided Lisbon pages, including three reservation records and three daily pages
- 1 blank journey shelf
- 3 complete blank journeys, each with 5 days and 2 reservation records

Minimum configuration exports 23 pages. Maximum configuration exports 226 pages without overflowing dashboard, reservation, or 21-day itinerary grids.

## Navigation

- Cover -> `start_here`
- Start Here -> `example_workspace` or `blank_workspace`
- Workspace cards -> stable journey IDs
- Journey dashboard cards -> semantic reservation, itinerary, packing, expense, and highlight IDs
- Reservation and itinerary cards -> their complete record/day banks
- **Up** follows hierarchy parent; **Home** returns to `root`

Dashboard navigation uses each node's stable semantic ID through hierarchy-backed cards. It does not depend on fragile long-bank child offsets or inactive previous/next controls. At zero reservations, no dead reservation-record control is shown.

## Visual And Border Construction

Original route, compass, waypoint, and topographic SVG motifs were newly authored for this product. Sea green carries navigation, rust marks decisions and stops, and sand keeps writing regions warm but calm. Layout and contrast remain understandable in grayscale.

Itinerary and expense grids declare solid 0.8 px sea-green borders and have no second element stroke. Expense table cells are unstroked; one outer boundary and one rectangle per internal edge prevent doubled lines. White writing surfaces remain visible in PDF output, including daily field notes, packing, expense notes, and highlights.
