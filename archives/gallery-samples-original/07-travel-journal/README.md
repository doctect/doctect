# Travel Journal & Trip Planner

Gallery metadata + generator scripts for the Travel Journal sample project.

## Gallery metadata

- **Title:** Travel Journal & Trip Planner
- **Tags:** `travel` `journal` `trips` `itinerary` `packing` `adventure`
- **Description:** Plan and remember every trip in one book. Each trip gets a hub page with a day-by-day itinerary, a packing checklist, a running budget, and journal pages for writing and sketching. Line-art covers and trip banners keep it feeling like a real travel notebook. Rename the trips, days, and entries and fill them as you go.

## Structure

```
cover (root, compass art)
└── Trips (section, id "contents")
    └── Trip × 4 (trip — mountains banner + Destination/Dates + 4 buttons)
        ├── Itinerary (section)  [button 0]
        │   └── Day × 7 (day — Date/Place, morning/afternoon/evening, notes)
        ├── Packing (packing)    [button 1] — checklist by category
        ├── Budget (budget)      [button 2] — expense table
        └── Journal (section)    [button 3]
            └── Entry × 6 (journal_page — date/place + dot grid to write & sketch)
```

- Templates: `cover`, `section`, `trip`, `day`, `packing`, `budget`, `journal_page`
- Default size: 74 nodes / 74 pages
- Page: reMarkable Paper Pro, 509 × 679

## SVG artwork

This is the first sample to use SVG (`type: "svg"`): a line-art compass rose on the cover and a
mountains-and-sun banner on each trip hub. Both are pure-shape SVG (paths/polygons/circles), which
the editor sanitises and the PDF export (`svg2pdf`) renders cleanly. The trip hub's four buttons
link by child index (0 Itinerary / 1 Packing / 2 Budget / 3 Journal), so keep that order in the
hierarchy.

## Navigation

- Cover → Trips; Trips grid → trip; trip buttons → Itinerary / Packing / Budget / Journal
- Itinerary → day; Journal → entry
- Every page: `Index` → Trips, `Cover` → cover, `Back` chip → parent, corner triangles → prev/next

## Tweak knobs

Top of `hierarchy.js`: `numTrips`, `daysPerTrip`, `journalPagesPerTrip`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
