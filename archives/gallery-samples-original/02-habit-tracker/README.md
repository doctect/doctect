# Habit Tracker & Reflection Journal

Gallery metadata + generator scripts for the Habit Tracker sample project.

## Gallery metadata

- **Title:** Habit Tracker & Reflection Journal
- **Tags:** `habits` `wellness` `journal` `productivity` `tracker` `reflection`
- **Description:** A full year of habit tracking with a daily reflection page behind every date. Each month is a clean habit × day matrix — write your habits down the side and check them off across the month — with a tappable day-number row that opens that day's reflection (mood, top three, gratitude, and a dotted space to think). Tap through the year index to any month, flip months and days with the corner arrows, and jump home from anywhere.

## Structure

```
cover (root)
└── 2026 (year_index, id "contents")
    └── Month × 12          (month — habit matrix + day-number nav)
        └── Day × 28–31      (day — reflection page)
```

- Templates: `cover`, `year_index`, `month`, `day`
- Default size: 379 nodes (1 + 1 + 12 months + 365 days)
- Page: reMarkable Paper Pro, 509 × 679

## The month page

- **Habit matrix:** 12 habit rows (left column blank — write your own) × 31 day columns.
- **Day-number header** is a node-driven grid over the month's day children; each number taps
  straight to that day's reflection page.
- A **Notes** strip runs along the bottom.

## The day (reflection) page

Mood row (5 circles), Top 3 today, Grateful for (ruled), and a large dotted Reflection area.
Title binds to the weekday + date (e.g. `Thu · Jan 1`); the back-chip shows the month short name.

## Navigation

- Cover → year index (whole cover tappable + "Open tracker" button)
- Year grid → month; month day-number → day reflection
- Every page: `Index` chip → year index, `Cover` chip → cover
- Month: `Year` chip → year index; corner triangles → prev/next month
- Day: `{{month_short}}` chip → its month; corner triangles → prev/next day

## Tweak knobs

- `hierarchy.js`: `year` (also update Jan-1 weekday + month `days` for a different year).
- `templates.js`: `HABITS` (matrix rows), `DAYS` (matrix columns). The matrix grid lines and the
  day-number header both derive their spacing from `DAYS`, so they stay aligned automatically.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
